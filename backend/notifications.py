"""
notifications.py — Email Notification Service for Synergy Sales Genius
=======================================================================
Sends transactional email alerts via Gmail SMTP (smtplib — no extra package).

All sends run in a background daemon thread so they NEVER block the API response.
If SMTP credentials are absent the module is a silent no-op (safe for local dev & CI).

Configuration (set in backend/.env):
  NOTIFY_EMAIL_TO      — comma-separated recipient list
  NOTIFY_EMAIL_FROM    — Gmail address used as sender
  NOTIFY_SMTP_PASSWORD — Gmail App Password  (NOT your Gmail login password)
                         Generate at: Google Account → Security → App passwords
  NOTIFY_SMTP_HOST     — default: smtp.gmail.com
  NOTIFY_SMTP_PORT     — default: 587  (STARTTLS)

Trigger points wired in main.py:
  1. New lead ingested         → send_new_lead_email()
  2. Duplicate detected        → send_duplicate_alert_email()
  3. Conflict resolved         → send_conflict_resolved_email()
  4. Lead status → "Assigned"  → send_lead_assigned_email()
"""

from __future__ import annotations

import logging
import os
import smtplib
import threading
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict, List

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration — all optional; missing values disable the module gracefully
# ---------------------------------------------------------------------------
_TO_RAW: str   = os.environ.get("NOTIFY_EMAIL_TO",      "").strip()
_FROM:   str   = os.environ.get("NOTIFY_EMAIL_FROM",    "").strip()
_PASS:   str   = os.environ.get("NOTIFY_SMTP_PASSWORD", "").strip()
_HOST:   str   = os.environ.get("NOTIFY_SMTP_HOST",     "smtp.gmail.com")
_PORT:   int   = int(os.environ.get("NOTIFY_SMTP_PORT", "587"))

_RECIPIENTS: List[str] = [r.strip() for r in _TO_RAW.split(",") if r.strip()]

_ENABLED: bool = bool(_FROM and _PASS and _RECIPIENTS)

if _ENABLED:
    logger.info(
        "Email notifications enabled — from='%s' to=%s via %s:%d",
        _FROM, _RECIPIENTS, _HOST, _PORT,
    )
else:
    logger.info(
        "Email notifications disabled — set NOTIFY_EMAIL_FROM, "
        "NOTIFY_SMTP_PASSWORD, and NOTIFY_EMAIL_TO in .env to enable."
    )

# ---------------------------------------------------------------------------
# HTML email template helpers
# ---------------------------------------------------------------------------
_APP_COLOR   = "#6366f1"   # Synergy indigo primary
_WARN_COLOR  = "#ef4444"   # destructive red
_OK_COLOR    = "#22c55e"   # success green
_GOLD_COLOR  = "#f59e0b"


def _now_str() -> str:
    return datetime.now(timezone.utc).strftime("%d %b %Y %H:%M UTC")


def _html_wrapper(title: str, color: str, body_html: str) -> str:
    """Wrap content in a minimal, email-client-safe HTML shell."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

        <!-- Header -->
        <tr><td style="background:{color};padding:24px 32px;">
          <p style="margin:0;color:#ffffff;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:600;">Synergy Sales Genius · Chin Hin Group</p>
          <h1 style="margin:6px 0 0;color:#ffffff;font-size:20px;font-weight:700;">{title}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:28px 32px;">
          {body_html}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">
            Sent automatically by Synergy Sales Genius &bull; {_now_str()}<br>
            Do not reply to this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _kv_row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px;vertical-align:top;">{label}</td>'
        f'<td style="padding:6px 0;font-size:13px;color:#111827;font-weight:600;">{value}</td>'
        f'</tr>'
    )


# ---------------------------------------------------------------------------
# Internal send helper — always runs in a daemon thread
# ---------------------------------------------------------------------------
def _send_async(subject: str, html: str) -> None:
    """Fire-and-forget: queue the email on a daemon thread."""
    if not _ENABLED:
        return

    def _worker() -> None:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = f"Synergy Sales Genius <{_FROM}>"
            msg["To"]      = ", ".join(_RECIPIENTS)
            msg.attach(MIMEText(html, "html", "utf-8"))

            with smtplib.SMTP(_HOST, _PORT, timeout=15) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.login(_FROM, _PASS)
                smtp.sendmail(_FROM, _RECIPIENTS, msg.as_string())

            logger.info("Email sent — subject='%s' to=%s", subject, _RECIPIENTS)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Email send failed (non-fatal): %s", exc)

    t = threading.Thread(target=_worker, daemon=True, name="email-notify")
    t.start()


# ---------------------------------------------------------------------------
# Public API — called from main.py
# ---------------------------------------------------------------------------

def send_new_lead_email(
    project_name: str,
    location: str,
    value_rm: int,
    top_match_bu: str,
    match_score: int,
    rationale: str,
    synergy_bundle: List[str],
    ingested_by: str,
    lead_id: str,
) -> None:
    """
    Notify when a brand-new (non-duplicate) lead completes the AI pipeline.
    Fires after lead is saved to Cosmos DB.
    """
    bundle_str = ", ".join(synergy_bundle) if synergy_bundle else "None"
    score_color = _OK_COLOR if match_score >= 70 else _GOLD_COLOR if match_score >= 50 else _WARN_COLOR
    value_str = f"RM {value_rm:,.0f}" if value_rm else "—"

    body = f"""
<h2 style="margin:0 0 16px;font-size:16px;color:#374151;">A new lead has been ingested and routed by AI.</h2>
<table cellpadding="0" cellspacing="0" width="100%">
  {_kv_row("Lead ID", lead_id)}
  {_kv_row("Project", project_name)}
  {_kv_row("Location", location)}
  {_kv_row("Value", value_str)}
  {_kv_row("Ingested by", ingested_by)}
</table>

<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
  <p style="margin:0 0 8px;font-size:12px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:1px;">AI Routing Result</p>
  <p style="margin:0 0 4px;font-size:18px;font-weight:800;color:#111827;">{top_match_bu}
    <span style="font-size:14px;font-weight:600;color:{score_color};margin-left:8px;">{match_score}% match</span>
  </p>
  <p style="margin:8px 0 0;font-size:13px;color:#374151;line-height:1.6;">{rationale}</p>
</div>

<p style="margin:0;font-size:13px;color:#6b7280;">
  <strong>Synergy bundle:</strong> {bundle_str}
</p>
"""
    _send_async(
        subject=f"[Synergy] New Lead: {project_name}  ({top_match_bu} · {match_score}%)",
        html=_html_wrapper("New Lead Ingested", _APP_COLOR, body),
    )


def send_duplicate_alert_email(
    project_name: str,
    location: str,
    new_lead_id: str,
    matched_lead_id: str,
    similarity_score: float,
    ingested_by: str,
) -> None:
    """
    Notify when a lead is flagged as a duplicate by the AI similarity engine.
    Fires immediately after duplicate detection, before the lead is saved.
    """
    pct = round(similarity_score * 100)
    body = f"""
<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:0 0 20px;">
  <p style="margin:0;font-size:14px;font-weight:700;color:#991b1b;">
    ⚠️  Duplicate detected at <span style="font-size:20px;">{pct}%</span> similarity
  </p>
</div>

<table cellpadding="0" cellspacing="0" width="100%">
  {_kv_row("Project", project_name)}
  {_kv_row("Location", location)}
  {_kv_row("New Lead ID", new_lead_id)}
  {_kv_row("Matched Lead ID", matched_lead_id)}
  {_kv_row("Submitted by", ingested_by)}
</table>

<p style="margin:20px 0 0;font-size:13px;color:#374151;">
  This lead has been placed in <strong>Under Review</strong> status and added to the
  Conflict Resolution queue. Please log in to Synergy Sales Genius to review and resolve.
</p>
"""
    _send_async(
        subject=f"[Synergy] ⚠️ Duplicate Alert: {project_name} ({pct}% match)",
        html=_html_wrapper("Duplicate Lead Detected", _WARN_COLOR, body),
    )


def send_conflict_resolved_email(
    conflict_id: str,
    resolution: str,
    resolved_by_name: str,
    resolved_by_email: str,
    lead_id: str,
    matched_lead_id: str,
) -> None:
    """
    Notify when a conflict is resolved (Merged / Discarded / Kept Both).
    Fires after the PATCH /api/conflicts/{id} update is saved.
    """
    icon = {"Merged": "🔀", "Discarded": "🗑️", "Kept Both": "📋"}.get(resolution, "✅")
    color = {"Merged": _APP_COLOR, "Discarded": _WARN_COLOR, "Kept Both": _GOLD_COLOR}.get(resolution, _OK_COLOR)

    body = f"""
<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin:0 0 20px;">
  <p style="margin:0;font-size:20px;font-weight:800;color:#0c4a6e;">
    {icon}  Resolution: <span style="color:{color};">{resolution}</span>
  </p>
</div>

<table cellpadding="0" cellspacing="0" width="100%">
  {_kv_row("Conflict ID", conflict_id)}
  {_kv_row("New Lead ID", lead_id)}
  {_kv_row("Existing Lead ID", matched_lead_id)}
  {_kv_row("Resolved by", f"{resolved_by_name} ({resolved_by_email})")}
  {_kv_row("Resolved at", _now_str())}
</table>
"""
    _send_async(
        subject=f"[Synergy] Conflict Resolved ({resolution}) — {conflict_id}",
        html=_html_wrapper("Conflict Resolved", color, body),
    )


def send_lead_assigned_email(
    project_name: str,
    location: str,
    value_rm: int,
    lead_id: str,
    assigned_bu: str,
    assigned_by_name: str,
    assigned_by_email: str,
) -> None:
    """
    Notify when a lead's status is changed to "Assigned" via PATCH /api/leads/{id}.
    Fires after the document is saved to Cosmos DB.
    """
    value_str = f"RM {value_rm:,.0f}" if value_rm else "—"

    body = f"""
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 20px;">
  <p style="margin:0;font-size:16px;font-weight:700;color:#166534;">
    ✅  Lead successfully assigned to <strong>{assigned_bu}</strong>
  </p>
</div>

<table cellpadding="0" cellspacing="0" width="100%">
  {_kv_row("Lead ID", lead_id)}
  {_kv_row("Project", project_name)}
  {_kv_row("Location", location)}
  {_kv_row("Value", value_str)}
  {_kv_row("Assigned to BU", assigned_bu)}
  {_kv_row("Assigned by", f"{assigned_by_name} ({assigned_by_email})")}
</table>

<p style="margin:20px 0 0;font-size:13px;color:#374151;">
  The sales team for <strong>{assigned_bu}</strong> should initiate contact within <strong>24 hours</strong>.
</p>
"""
    _send_async(
        subject=f"[Synergy] Lead Assigned → {assigned_bu}: {project_name}",
        html=_html_wrapper("Lead Assigned", _OK_COLOR, body),
    )
