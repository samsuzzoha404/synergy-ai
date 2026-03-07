"""
telemetry.py — Azure Monitor / Application Insights Integration
===============================================================
Configures OpenTelemetry to export traces, metrics, and logs to Azure
Application Insights when the APPLICATIONINSIGHTS_CONNECTION_STRING env var is set.

What this enables automatically (zero extra code in endpoints):
  • Request telemetry  — every HTTP request: URL, method, status, duration.
  • Dependency tracking — outbound calls to Azure OpenAI and Cosmos DB.
  • Exception telemetry — unhandled 5xx exceptions with full stack trace.
  • Log correlation     — every logging.* call is tagged with trace_id/span_id
                         so you can jump from a log line to the exact request trace.
  • Performance counters — CPU %, available memory, process metrics.
  • Availability checks  — GET /health can be used as a URL ping in Azure Portal.

Usage in main.py:
    from telemetry import setup_azure_monitor, instrument_fastapi_app
    setup_azure_monitor()   # call BEFORE app = FastAPI()
    app = FastAPI(...)
    instrument_fastapi_app(app)  # call AFTER app is created

If APPLICATIONINSIGHTS_CONNECTION_STRING is absent or blank, both functions
are no-ops — local development is completely unaffected.

Finding the connection string:
  Azure Portal → Application Insights resource → Overview → Connection String
  APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;IngestionEndpoint=...
"""

from __future__ import annotations

import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

# Read the connection string once at import time.
_CONN_STR: str = os.environ.get("APPLICATIONINSIGHTS_CONNECTION_STRING", "").strip()

# Track whether configure_azure_monitor() succeeded so instrument_fastapi_app()
# can decide whether to instrument.
_telemetry_active: bool = False


def setup_azure_monitor() -> bool:
    """
    Configure OpenTelemetry with Azure Monitor exporter.

    Must be called BEFORE FastAPI() is instantiated so the ASGI middleware
    injection by FastAPIInstrumentor captures every request from the start.

    Returns:
        True  — Azure Monitor is configured and telemetry will be exported.
        False — Connection string absent; telemetry disabled (local dev / CI).
    """
    global _telemetry_active  # noqa: PLW0603

    if not _CONN_STR:
        logger.info(
            "Azure Monitor telemetry disabled — "
            "set APPLICATIONINSIGHTS_CONNECTION_STRING to enable."
        )
        return False

    try:
        from azure.monitor.opentelemetry import configure_azure_monitor
        from opentelemetry.sdk.trace.sampling import ParentBased, TraceIdRatioBased

        # Sample 100% by default; reduce via OTEL_TRACES_SAMPLER_ARG env var.
        sample_rate = float(os.environ.get("APPLICATIONINSIGHTS_SAMPLE_RATE", "1.0"))

        configure_azure_monitor(
            connection_string=_CONN_STR,
            # Cloud role name shows in App Map — identifies this service.
            service_name=os.environ.get("OTEL_SERVICE_NAME", "synergy-sales-genius-api"),
            # Sampling: 1.0 = 100%, 0.1 = 10%.
            # Parent-based so client-initiated traces are always honoured.
            sampler=ParentBased(root=TraceIdRatioBased(sample_rate)),
            # Auto-instrument httpx (Azure OpenAI SDK uses httpx internally).
            # FastAPI instrumentation is applied separately in instrument_fastapi_app().
            enable_live_metrics=True,
        )

        # Suppress Azure Monitor's own HTTP wire-logging to avoid recursive telemetry.
        for _lib in ("azure.monitor.opentelemetry.exporter", "opentelemetry"):
            logging.getLogger(_lib).setLevel(logging.WARNING)

        _telemetry_active = True
        logger.info(
            "Azure Monitor telemetry active — service='%s' sample_rate=%.2f",
            os.environ.get("OTEL_SERVICE_NAME", "synergy-sales-genius-api"),
            sample_rate,
        )
        return True

    except ImportError:
        logger.warning(
            "azure-monitor-opentelemetry package not found — "
            "install it with: pip install azure-monitor-opentelemetry"
        )
        return False
    except Exception as exc:  # noqa: BLE001
        logger.error("Azure Monitor setup failed (non-fatal): %s", exc)
        return False


def instrument_fastapi_app(app: "FastAPI") -> None:
    """
    Attach FastAPI-specific OpenTelemetry instrumentation to the app.

    Wraps every route handler so that:
      • The span name matches the route template (e.g. "GET /api/leads")
        rather than the raw URL (avoids high-cardinality metric keys).
      • HTTP 4xx responses are not marked as errors (only 5xx are).
      • Request and response headers/bodies are NOT captured (PII safety).

    Must be called AFTER app = FastAPI(...) and AFTER all middleware is added.
    """
    if not _telemetry_active:
        return

    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        FastAPIInstrumentor.instrument_app(
            app,
            # Only record 5xx as error spans — 4xx are client errors, not service errors.
            http_capture_headers_server_request=[],   # do NOT capture request headers (PII)
            http_capture_headers_server_response=[],  # do NOT capture response headers
            excluded_urls=(
                # Exclude health probes from traces — they'd dominate the trace list.
                "/health,"
                "/docs,"
                "/redoc,"
                "/openapi.json"
            ),
        )
        logger.info("FastAPI OpenTelemetry instrumentation attached.")
    except ImportError:
        logger.warning("opentelemetry-instrumentation-fastapi not available — skipping FastAPI instrumentation.")
    except Exception as exc:  # noqa: BLE001
        logger.warning("FastAPI instrumentation failed (non-fatal): %s", exc)


def record_exception(exc: Exception, extra: dict | None = None) -> None:
    """
    Manually record an exception to the current OpenTelemetry span.

    Use this inside except blocks for known error paths (e.g. Cosmos DB timeouts,
    OpenAI API failures) so they surface in the App Insights Failures blade.

    Args:
        exc:   The exception to record.
        extra: Optional dict of key-value attributes to attach to the span.

    Example::
        try:
            result = await some_call()
        except SomeError as e:
            record_exception(e, {"lead_id": lead_id, "operation": "save_lead"})
            raise
    """
    if not _telemetry_active:
        return

    try:
        from opentelemetry import trace

        span = trace.get_current_span()
        if span and span.is_recording():
            span.record_exception(exc, attributes=extra or {})
            span.set_status(trace.StatusCode.ERROR, str(exc))
    except Exception:  # noqa: BLE001
        pass  # telemetry must never break application logic


def track_lead_ingested(is_duplicate: bool, bu: str, score: int) -> None:
    """
    Emit a custom metric counter each time a lead is ingested.
    Visible in App Insights Metrics Explorer under custom namespace.

    Args:
        is_duplicate: Whether the lead was flagged as a duplicate.
        bu:           The AI-assigned Business Unit.
        score:        AI match score (0–100).
    """
    if not _telemetry_active:
        return

    try:
        from opentelemetry import metrics

        meter = metrics.get_meter("synergy.leads")
        counter = meter.create_counter(
            name="synergy.lead.ingested",
            description="Number of leads ingested through the AI pipeline",
            unit="1",
        )
        counter.add(
            1,
            attributes={
                "lead.is_duplicate": str(is_duplicate),
                "lead.bu": bu,
                "lead.score_bucket": f"{(score // 10) * 10}-{(score // 10) * 10 + 9}",
            },
        )
    except Exception:  # noqa: BLE001
        pass
