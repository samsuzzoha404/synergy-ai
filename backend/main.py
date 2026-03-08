"""
main.py — FastAPI Application Entry Point for Synergy Sales Genius
===================================================================
Exposes the REST API consumed by the React frontend (TanStack Query + Axios).

Endpoints:
  POST /api/leads  — Ingest a new lead, run AI analysis, persist to Cosmos DB.
  GET  /api/leads  — Fetch all leads for the Lead Workbench dashboard.
  GET  /api/conflicts — Fetch all flagged duplicates for ConflictResolution page.
  GET  /health     — Health check for load balancer / container probes.

Production considerations:
  • CORS is currently open (*) for local development.
    For production, replace "*" with your exact frontend origin.
  • Structured logging uses Python's logging module.
  • All Cosmos DB and OpenAI errors surface as 502/500 with clear messages.

Run locally:
  uvicorn main:app --reload --port 8000
"""

import asyncio
import csv
import datetime
import io
import logging
import os
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pdfplumber
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import ai_engine
import database
from auth import (
    CurrentUser,
    LoginRequest,
    RefreshRequest,
    TokenResponse,
    bootstrap_demo_users,
    create_access_token,
    create_refresh_token,
    get_current_user,
    verify_password,
    verify_refresh_token,
)
from models import AIAnalysis, AuditLog, BulkIngestResponse, ConflictResolutionUpdate, LeadActivity, LeadActivityCreate, LeadCreate, LeadDB, LeadResponse, LeadUpdate
import telemetry
import notifications

# ---------------------------------------------------------------------------
# Logging — configure once at startup
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Azure Monitor — must be configured BEFORE FastAPI() is instantiated so that
# ASGI middleware is injected at the right point in the stack.
# No-op if APPLICATIONINSIGHTS_CONNECTION_STRING is absent (local dev).
# ---------------------------------------------------------------------------
telemetry.setup_azure_monitor()

# ---------------------------------------------------------------------------
# Rate Limiter — IP-based, in-memory counters (resets on restart).
# Override default limits via RATE_LIMIT_* env vars for tenant-specific tuning.
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)

# Default limits per endpoint class (override via env vars)
LIMIT_AUTH   = os.getenv("RATE_LIMIT_AUTH",   "5/minute")    # login — brute-force guard
LIMIT_WRITE  = os.getenv("RATE_LIMIT_WRITE",  "30/minute")   # AI ingestion pipeline
LIMIT_BULK   = os.getenv("RATE_LIMIT_BULK",   "5/minute")    # CSV bulk — most expensive
LIMIT_PATCH  = os.getenv("RATE_LIMIT_PATCH",  "60/minute")   # PATCH endpoints
LIMIT_READ   = os.getenv("RATE_LIMIT_READ",   "200/minute")  # GET endpoints

# Suppress noisy Azure SDK / urllib3 HTTP wire logs so uvicorn access
# logs (GET /api/leads 200 OK) are clearly visible in the terminal.
for _noisy_logger in (
    "azure.core.pipeline.policies.http_logging_policy",
    "azure.cosmos",
    "urllib3.connectionpool",
    "azure",
):
    logging.getLogger(_noisy_logger).setLevel(logging.WARNING)

# ---------------------------------------------------------------------------
# Duplicate detection threshold
# ---------------------------------------------------------------------------

DUPLICATE_SIMILARITY_THRESHOLD = 0.92  # Cosine similarity ≥ 0.92 → flag as duplicate


# ---------------------------------------------------------------------------
# Lifespan — must be defined BEFORE FastAPI() is instantiated
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    """
    Modern FastAPI lifespan context manager.
    Runs startup logic before yield, shutdown logic after yield.
    """
    # Seed demo users if the Users container is empty (first-time startup).
    try:
        await asyncio.wait_for(
            asyncio.to_thread(bootstrap_demo_users),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        logger.warning("Demo user bootstrap timed out — will retry on next restart.")
    except Exception as exc:
        logger.warning("Demo user bootstrap error: %s", exc)

    yield
    # Shutdown — nothing to clean up for this service
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Synergy Sales Genius API",
    description=(
        "Enterprise AI CRM backend for Chin Hin Group. "
        "Powered by Azure OpenAI GPT-4o and Azure Cosmos DB."
    ),
    version="1.0.0",
    docs_url="/docs",       # Swagger UI
    redoc_url="/redoc",     # ReDoc UI
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate Limiter — attach to app state and register 429 handler
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# ---------------------------------------------------------------------------
# CORS Middleware
# Read allowed origins from ALLOWED_ORIGINS env var (comma-separated).
# Falls back to "*" only when the variable is absent (local dev convenience).
# Production example: ALLOWED_ORIGINS=https://synergy.chinhin.com.my
# ---------------------------------------------------------------------------
_raw_origins = os.getenv("ALLOWED_ORIGINS", "")
_allowed_origins: list = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    or [
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Azure Monitor — FastAPI instrumentation (must be after all middleware is added)
# Wraps every route so traces use template paths (/api/leads/{id}) not raw URLs.
# ---------------------------------------------------------------------------
telemetry.instrument_fastapi_app(app)


# ---------------------------------------------------------------------------
# Global exception handler — catches any unhandled exception that escapes all
# route handlers. Records it to App Insights Failures blade, then returns a
# safe 500 JSON response (never leaks stack traces to the client).
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def _unhandled_exception_handler(req: Request, exc: Exception) -> Response:
    telemetry.record_exception(
        exc,
        {"http.method": req.method, "http.url": str(req.url)},
    )
    logger.exception(
        "Unhandled 500 on %s %s", req.method, req.url.path
    )
    return Response(
        content='{"detail": "An unexpected internal error occurred. Our team has been notified."}',
        status_code=500,
        media_type="application/json",
    )


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """
    Compute cosine similarity between two embedding vectors.
    Returns a float in [-1, 1]; values ≥ DUPLICATE_SIMILARITY_THRESHOLD
    indicate near-identical project descriptions.
    """
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _check_duplicate(new_vector: List[float], new_id: str) -> Tuple[bool, str, float]:
    """
    Check for a semantically near-identical lead by comparing the new embedding
    against ALL lead vectors stored in Cosmos DB.

    Returns:
        Tuple of (is_duplicate, matched_lead_id, similarity_score).
        matched_lead_id is "" and score is 0.0 when no duplicate is found.
    """
    try:
        existing_vectors = database.get_all_lead_vectors()
    except Exception as exc:
        logger.error("Duplicate check DB query failed — skipping check: %s", exc)
        return False, "", 0.0

    for cached in existing_vectors:
        if cached["id"] == new_id:
            continue
        score = _cosine_similarity(new_vector, cached["vector"])
        if score >= DUPLICATE_SIMILARITY_THRESHOLD:
            logger.warning(
                "Duplicate detected — new_lead='%s' matches existing='%s' score=%.4f",
                new_id, cached["id"], score,
            )
            conflict_doc = {
                "id": str(uuid.uuid4()),
                "lead_id": new_id,
                "matched_lead_id": cached["id"],
                "similarity_score": round(score, 4),
                "status": "Pending Review",
            }
            try:
                database.save_conflict(conflict_doc)
            except Exception:
                logger.exception("Failed to persist conflict document.")
            return True, cached["id"], score
    return False, "", 0.0


# ---------------------------------------------------------------------------
# POST /api/auth/login — Issue a JWT for a valid email/password pair
# ---------------------------------------------------------------------------
@app.post(
    "/api/auth/login",
    response_model=TokenResponse,
    tags=["Auth"],
    summary="Authenticate with email + password and receive a JWT",
)
@limiter.limit(LIMIT_AUTH)
def login(request: Request, payload: LoginRequest) -> TokenResponse:
    """
    Validates credentials against the Cosmos DB Users container.
    Passwords are compared using bcrypt (never stored in plaintext).

    Returns:
        TokenResponse — JWT access token + user profile object.
    """
    # Query the Users container for this email address
    user = database.get_user_by_email(payload.email.lower())
    if user is None or not verify_password(payload.password, user.get("hashed_password", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    token_claims = {
        "sub": user["email"],
        "name": user["name"],
        "role": user["role"],
        "bu": user.get("bu"),
    }
    token = create_access_token(token_claims)
    refresh = create_refresh_token(token_claims)
    user_profile = {
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "bu": user.get("bu"),
    }
    logger.info("Login successful — user='%s' role='%s'", user["email"], user["role"])
    return TokenResponse(access_token=token, refresh_token=refresh, user=user_profile)


# ---------------------------------------------------------------------------
# POST /api/auth/refresh — Exchange a refresh token for a new access token
# ---------------------------------------------------------------------------
@app.post(
    "/api/auth/refresh",
    response_model=TokenResponse,
    tags=["Auth"],
    summary="Silently renew an access token using the long-lived refresh token",
)
@limiter.limit(LIMIT_AUTH)
def refresh_token_endpoint(request: Request, payload: RefreshRequest) -> TokenResponse:
    """
    Validates the refresh token, issues a fresh access token AND a new refresh
    token (rolling renewal), and returns both along with the user profile.

    The client should replace both stored tokens on success.
    Returns 401 if the refresh token is expired or malformed.
    """
    user_identity = verify_refresh_token(payload.refresh_token)
    token_claims = {
        "sub": user_identity.email,
        "name": user_identity.name,
        "role": user_identity.role,
        "bu": user_identity.bu,
    }
    new_access = create_access_token(token_claims)
    new_refresh = create_refresh_token(token_claims)   # rolling window
    user_profile = {
        "email": user_identity.email,
        "name": user_identity.name,
        "role": user_identity.role,
        "bu": user_identity.bu,
    }
    logger.info("Token refreshed — user='%s'", user_identity.email)
    return TokenResponse(access_token=new_access, refresh_token=new_refresh, user=user_profile)


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["System"])
def health_check() -> Dict[str, str]:
    """
    Simple liveness probe. Returns 200 OK when the service is running.
    Used by Azure Container Apps / AKS health probes.
    """
    return {"status": "healthy", "service": "Synergy Sales Genius API v1.0.0"}


# ---------------------------------------------------------------------------
# GET /api/bu-contacts — Business Unit Sales Manager Directory
# ---------------------------------------------------------------------------
_BU_CONTACTS_PATH = os.path.join(os.path.dirname(__file__), "bu_contacts.json")


@app.get("/api/bu-contacts", tags=["System"], summary="List BU sales manager contacts")
@limiter.limit("60/minute")
def get_bu_contacts(request: Request) -> List[Dict[str, str]]:
    """
    Returns the BU sales manager directory from ``bu_contacts.json``.

    To update contacts, edit ``backend/bu_contacts.json`` — no code change needed.
    Authentication is NOT required so the drawer can show contact info to all users.
    """
    import json as _json
    try:
        with open(_BU_CONTACTS_PATH, encoding="utf-8") as fh:
            return _json.load(fh)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="BU contacts file not found on server.")
    except Exception as exc:
        logger.exception("Failed to read bu_contacts.json: %s", exc)
        raise HTTPException(status_code=500, detail="Could not load BU contacts.")


# ---------------------------------------------------------------------------
# Admin User Management  —  POST / GET / PATCH / DELETE /api/admin/users
# All endpoints require Admin role.  Sales_Reps receive 403.
# ---------------------------------------------------------------------------
from models import UserCreate, UserUpdate, UserProfile  # noqa: E402  (already imported indirectly)


def _require_admin(current_user: CurrentUser) -> None:
    """Raise 403 if the caller is not an Admin."""
    if current_user.role != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )


@app.get(
    "/api/admin/users",
    response_model=List[UserProfile],
    tags=["Admin"],
    summary="List all users",
)
@limiter.limit(LIMIT_READ)
def admin_list_users(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> List[UserProfile]:
    """Return all user accounts. Admin only."""
    _require_admin(current_user)
    users = database.list_users()
    return [UserProfile(**u) for u in users]


@app.post(
    "/api/admin/users/cleanup",
    tags=["Admin"],
    summary="Remove duplicate user documents from Cosmos DB",
)
@limiter.limit(LIMIT_WRITE)
def admin_cleanup_users(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    """Hard-delete duplicate user docs created by accidental bootstrap re-runs. Admin only."""
    _require_admin(current_user)
    deleted = database.cleanup_duplicate_users()
    logger.info("Admin '%s' ran user cleanup — %d duplicates removed.", current_user.email, deleted)
    return {"deleted": deleted, "message": f"{deleted} duplicate user document(s) removed."}


@app.post(
    "/api/admin/users",
    response_model=UserProfile,
    status_code=status.HTTP_201_CREATED,
    tags=["Admin"],
    summary="Create a new user",
)
@limiter.limit(LIMIT_WRITE)
async def admin_create_user(
    request: Request,
    payload: UserCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> UserProfile:
    """Create a new user account. Admin only."""
    _require_admin(current_user)
    # Validate role and BU
    if payload.role not in {"Admin", "Sales_Rep"}:
        raise HTTPException(status_code=422, detail="role must be 'Admin' or 'Sales_Rep'.")
    if payload.role == "Sales_Rep" and not payload.bu:
        raise HTTPException(status_code=422, detail="bu is required for Sales_Rep role.")
    # Prevent duplicate email
    if database.get_user_by_email(payload.email.lower()):
        raise HTTPException(status_code=409, detail=f"Email already registered: {payload.email}")
    from auth import get_password_hash as _hash
    doc = {
        "id": str(uuid.uuid4()),
        "email": payload.email.lower(),
        "name": payload.name,
        "role": payload.role,
        "bu": payload.bu if payload.role == "Sales_Rep" else None,
        "hashed_password": _hash(payload.password),
    }
    database.save_user(doc)
    logger.info("Admin '%s' created user '%s'", current_user.email, doc["email"])
    doc.pop("hashed_password", None)
    return UserProfile(**doc)


@app.patch(
    "/api/admin/users/{user_id}",
    response_model=UserProfile,
    tags=["Admin"],
    summary="Update a user",
)
@limiter.limit(LIMIT_WRITE)
async def admin_update_user(
    request: Request,
    user_id: str,
    payload: UserUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> UserProfile:
    """Update name, role, BU, or password for an existing user. Admin only."""
    _require_admin(current_user)
    # Validate role if provided
    if payload.role and payload.role not in {"Admin", "Sales_Rep"}:
        raise HTTPException(status_code=422, detail="role must be 'Admin' or 'Sales_Rep'.")
    # Build the fields dict — only include keys the caller actually sent
    from auth import get_password_hash as _hash
    fields: Dict[str, Any] = {}
    if payload.name is not None:
        fields["name"] = payload.name
    if payload.role is not None:
        fields["role"] = payload.role
        if payload.role == "Admin":
            fields["bu"] = None
    if payload.bu is not None:
        fields["bu"] = payload.bu
    if payload.password is not None:
        fields["hashed_password"] = _hash(payload.password)
    # Get existing user to resolve email from id
    all_users = database.list_users()
    target = next((u for u in all_users if u["id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    updated = database.update_user(user_id, target["email"], fields)
    logger.info("Admin '%s' updated user id='%s'", current_user.email, user_id)
    return UserProfile(**updated)


@app.delete(
    "/api/admin/users/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Admin"],
    summary="Delete a user",
)
@limiter.limit(LIMIT_WRITE)
async def admin_delete_user(
    request: Request,
    user_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> None:
    """Hard-delete a user account. Admin only. Cannot self-delete."""
    _require_admin(current_user)
    all_users = database.list_users()
    target = next((u for u in all_users if u["id"] == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    if target["email"] == current_user.email:
        raise HTTPException(status_code=400, detail="Cannot delete your own account.")
    from azure.cosmos.exceptions import CosmosResourceNotFoundError
    try:
        database.delete_user(user_id, target["email"])
    except CosmosResourceNotFoundError:
        raise HTTPException(status_code=404, detail="User not found.")
    logger.info("Admin '%s' deleted user id='%s' email='%s'", current_user.email, user_id, target["email"])


# ---------------------------------------------------------------------------
# POST /api/leads — Core Ingestion & AI Analysis Pipeline
# ---------------------------------------------------------------------------
@app.post(
    "/api/leads",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Leads"],
    summary="Ingest a new lead and trigger AI analysis",
)
@limiter.limit(LIMIT_WRITE)
async def create_lead(
    request: Request,
    payload: LeadCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> LeadResponse:
    """
    The primary ingestion endpoint. Executes the full AI pipeline:

    1. Generate semantic embedding  →  text-embedding-3-small
    2. Duplicate check             →  cosine similarity vs. in-memory cache
    3. AI BU analysis              →  GPT-4o with tribal knowledge
    4. Persist to Cosmos DB        →  Leads container
    5. Return enriched lead        →  frontend receives full AI output

    Args:
        payload: LeadCreate — the sales rep's form submission.

    Returns:
        LeadResponse — the full AI-enriched lead document (sans raw vector).
    """
    logger.info("New lead ingestion — project='%s'", payload.project_name)

    # --- Step 1: Generate semantic embedding ---
    # asyncio.to_thread() offloads the blocking OpenAI network call to a
    # thread pool so the event loop stays free for other requests (BUG-B4).
    embedding_input = f"{payload.project_name} {payload.location}"
    try:
        vector = await asyncio.to_thread(ai_engine.generate_embedding, embedding_input)
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Azure OpenAI embedding service error: {exc}",
        )

    # --- Step 2: Duplicate detection (Cosmos DB cosine similarity — restart & multi-instance safe) ---
    # Wrapped in to_thread so the blocking Cosmos DB read doesn't stall the event loop.
    new_id = str(uuid.uuid4())
    is_duplicate, matched_lead_id, dup_score = await asyncio.to_thread(_check_duplicate, vector, new_id)

    # --- Step 3: AI lead analysis (GPT-4o) ---
    try:
        ai_result = await asyncio.to_thread(ai_engine.analyze_lead, payload.model_dump())
        ai_analysis = AIAnalysis(
            top_match_bu=ai_result["top_match_bu"],
            match_score=int(ai_result["match_score"]),
            rationale=ai_result["rationale"],
            synergy_bundle=ai_result.get("synergy_bundle", []),
        )
    except Exception as exc:
        logger.error("AI analysis failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Azure OpenAI analysis service error: {exc}",
        )

    # --- Step 4: Build the full lead document ---
    lead_db = LeadDB(
        **payload.model_dump(),
        id=new_id,
        ai_analysis=ai_analysis,
        is_duplicate=is_duplicate,
        vector=vector,
        status="Under Review" if is_duplicate else "New",
    )

    # --- Step 5: Persist to Cosmos DB ---
    lead_doc = lead_db.model_dump()
    # Stamp the ingestion date so the SmartDrawer can display 'Created' date.
    lead_doc["created_date"] = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    try:
        database.save_lead(lead_doc)
    except Exception as exc:
        logger.error("Cosmos DB write failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write error: {exc}",
        )

    logger.info(
        "Lead '%s' saved — BU='%s', score=%d, duplicate=%s",
        new_id,
        ai_analysis.top_match_bu,
        ai_analysis.match_score,
        is_duplicate,
    )
    telemetry.track_lead_ingested(is_duplicate, ai_analysis.top_match_bu, ai_analysis.match_score)

    # --- Fire email notifications (background thread — non-blocking) ---
    if is_duplicate:
        notifications.send_duplicate_alert_email(
            project_name=payload.project_name,
            location=payload.location,
            new_lead_id=new_id,
            matched_lead_id=matched_lead_id,
            similarity_score=dup_score,
            ingested_by=current_user.email,
        )
    else:
        notifications.send_new_lead_email(
            project_name=payload.project_name,
            location=payload.location,
            value_rm=payload.value_rm,
            top_match_bu=ai_analysis.top_match_bu,
            match_score=ai_analysis.match_score,
            rationale=ai_analysis.rationale,
            synergy_bundle=list(ai_analysis.synergy_bundle),
            ingested_by=current_user.email,
            lead_id=new_id,
        )

    # Pass lead_doc (which includes created_date) so all top-level fields
    # (developer, floors, gfa, created_date) appear in the API response.
    return LeadResponse.from_lead_db(lead_db, raw_doc=lead_doc)


# ---------------------------------------------------------------------------
# POST /api/leads/bulk — Bulk Ingest Leads from a CSV file
# ---------------------------------------------------------------------------
@app.post(
    "/api/leads/bulk",
    response_model=BulkIngestResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Leads"],
    summary="Bulk ingest leads from a CSV upload (BCI export format)",
)
@limiter.limit(LIMIT_BULK)
async def bulk_ingest_leads(
    request: Request,
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> BulkIngestResponse:
    """
    Accepts a CSV **or PDF** file in the BCI export format.
    Runs the full AI pipeline for each identified lead:
      1. Generate embedding → text-embedding-3-small
      2. Duplicate check   → cosine similarity vs. Cosmos DB vectors
      3. AI BU analysis    → GPT-4o with tribal knowledge
      4. Persist           → Cosmos DB Leads container

    CSV — Expected columns (case-insensitive, order-independent):
      Project Name | Location | GDV | Stage | Developer | GFA | Type

    PDF — Text-based BCI report. GPT-4o extracts all project records
          from the raw text automatically. Scanned/image PDFs are not supported.

    Returns a summary: total imported, total flagged as duplicates, errors.
    """
    filename = file.filename or ""
    is_pdf = filename.lower().endswith(".pdf")
    is_csv = filename.lower().endswith(".csv")

    if filename.lower().endswith(".xlsx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Excel files (.xlsx) are not supported. Please export as CSV or upload a BCI PDF report.",
        )
    if not is_csv and not is_pdf:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only .csv and .pdf files are accepted for bulk upload.",
        )

    raw_bytes = await file.read()

    # ------------------------------------------------------------------
    # Build a unified list of normalised row dicts — same shape for both
    # CSV and PDF paths so the processing loop below is file-type agnostic.
    # ------------------------------------------------------------------
    rows: List[Dict[str, str]] = []

    if is_csv:
        # ── CSV path ───────────────────────────────────────────────────
        try:
            content = raw_bytes.decode("utf-8-sig")   # utf-8-sig strips BOM
        except UnicodeDecodeError:
            content = raw_bytes.decode("latin-1", errors="replace")

        reader = csv.DictReader(io.StringIO(content))
        if reader.fieldnames is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="CSV file appears to be empty or has no header row.",
            )
        for row in reader:
            rows.append({k.strip().lower(): (v or "").strip() for k, v in row.items() if k})

    else:
        # ── PDF path ───────────────────────────────────────────────────
        try:
            pdf_text_parts: List[str] = []
            with pdfplumber.open(io.BytesIO(raw_bytes)) as pdf:
                for page in pdf.pages:
                    # Prefer table rows (structured); fall back to plain text
                    tables = page.extract_tables()
                    if tables:
                        for table in tables:
                            for table_row in table:
                                if table_row:
                                    pdf_text_parts.append(
                                        " | ".join((cell or "").strip() for cell in table_row)
                                    )
                    else:
                        page_text = page.extract_text() or ""
                        if page_text.strip():
                            pdf_text_parts.append(page_text)
            pdf_text = "\n".join(pdf_text_parts)
        except Exception as exc:
            logger.error("PDF text extraction failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not read the PDF file: {exc}",
            )

        if not pdf_text.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "The PDF appears to be empty or image-only (scanned). "
                    "Text extraction requires a digitally created PDF — scanned documents are not supported."
                ),
            )

        # Use GPT-4o to extract structured lead records from the PDF text
        try:
            extracted = await asyncio.to_thread(
                ai_engine.extract_leads_from_pdf_text, pdf_text
            )
        except Exception as exc:
            logger.error("PDF lead extraction via GPT-4o failed: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"AI could not parse leads from the PDF: {exc}",
            )

        if not extracted:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "No construction project leads could be identified in the PDF. "
                    "Ensure the document contains BCI-style project listings."
                ),
            )

        # Normalise GPT output to the same dict shape that the CSV path produces
        for item in extracted:
            rows.append({
                "project name": str(item.get("project_name") or ""),
                "location":     str(item.get("location")     or ""),
                "gdv":          str(item.get("gdv")          or "0"),
                "stage":        str(item.get("stage")        or "Planning"),
                "type":         str(item.get("project_type") or "Commercial"),
                "developer":    str(item.get("developer")    or ""),
                "gfa":          str(item.get("gfa")          or ""),
                "floors":       str(item.get("floors")       or ""),
            })

    # ------------------------------------------------------------------
    # Unified processing loop — identical for CSV and PDF rows
    # ------------------------------------------------------------------
    imported = 0
    flagged = 0
    errors: List[str] = []

    for row_num, norm in enumerate(rows, start=2):  # start=2 mirrors CSV convention

        project_name = (
            norm.get("project name") or norm.get("projectname") or norm.get("name") or ""
        )
        location = norm.get("location") or norm.get("address") or ""
        gdv_raw = norm.get("gdv") or norm.get("value") or norm.get("gdc") or "0"
        stage = norm.get("stage") or "Planning"
        project_type = norm.get("type") or norm.get("project type") or "Commercial"
        developer_raw = norm.get("developer") or norm.get("developer name") or None
        gfa_raw = norm.get("gfa") or norm.get("gross floor area") or None
        floors_raw = norm.get("floors") or norm.get("storeys") or norm.get("stories") or None

        # Basic validation
        if not project_name or not location:
            errors.append(f"Row {row_num}: Missing 'Project Name' or 'Location' — skipped.")
            continue

        # Parse GDV — strip non-numeric chars except decimal point
        try:
            gdv_clean = "".join(c for c in gdv_raw if c.isdigit() or c == ".")
            value_rm = int(float(gdv_clean)) if gdv_clean else 0
        except ValueError:
            errors.append(f"Row {row_num}: Invalid GDV value '{gdv_raw}' — defaulting to 0.")
            value_rm = 0

        # Parse optional numeric fields from CSV
        try:
            gfa_val: Optional[int] = int(float(gfa_raw)) if gfa_raw else None
        except (ValueError, TypeError):
            gfa_val = None
        try:
            floors_val: Optional[int] = int(float(floors_raw)) if floors_raw else None
        except (ValueError, TypeError):
            floors_val = None

        # Run AI pipeline for this row
        try:
            lead_payload = LeadCreate(
                project_name=project_name,
                location=location,
                value_rm=value_rm,
                project_type=project_type[:128],
                stage=stage[:64],
                developer=developer_raw[:256] if developer_raw else None,
                gfa=gfa_val,
                floors=floors_val,
            )

            embedding_input = f"{project_name} {location}"
            vector = await asyncio.to_thread(ai_engine.generate_embedding, embedding_input)

            new_id = str(uuid.uuid4())
            is_dup, _mid, _sc = await asyncio.to_thread(_check_duplicate, vector, new_id)

            ai_result = await asyncio.to_thread(ai_engine.analyze_lead, lead_payload.model_dump())
            ai_analysis = AIAnalysis(
                top_match_bu=ai_result["top_match_bu"],
                match_score=int(ai_result["match_score"]),
                rationale=ai_result["rationale"],
                synergy_bundle=ai_result.get("synergy_bundle", []),
            )

            lead_db = LeadDB(
                **lead_payload.model_dump(),
                id=new_id,
                ai_analysis=ai_analysis,
                is_duplicate=is_dup,
                vector=vector,
                status="Under Review" if is_dup else "New",
            )
            lead_doc = lead_db.model_dump()
            # Stamp the ingestion date so the frontend can display it in SmartDrawer.
            lead_doc["created_date"] = datetime.datetime.utcnow().strftime("%Y-%m-%d")
            await asyncio.to_thread(database.save_lead, lead_doc)
            # Vectors are now read from Cosmos DB on each check — no cache append needed.

            imported += 1
            if is_dup:
                flagged += 1

        except Exception as exc:
            logger.warning("Bulk import — row %d error: %s", row_num, exc)
            errors.append(f"Row {row_num} ('{project_name}'): {exc}")

    logger.info(
        "Bulk import complete — imported=%d, flagged=%d, errors=%d by '%s'",
        imported, flagged, len(errors), current_user.email,
    )
    return BulkIngestResponse(imported=imported, flagged=flagged, errors=errors)


# ---------------------------------------------------------------------------
# GET /api/leads — Fetch Leads for the Lead Workbench (paginated)
# ---------------------------------------------------------------------------
@app.get(
    "/api/leads",
    response_model=List[LeadResponse],
    status_code=status.HTTP_200_OK,
    tags=["Leads"],
    summary="Fetch leads sorted by most recently ingested (paginated)",
)
@limiter.limit(LIMIT_READ)
async def get_leads(
    request: Request,
    response: Response,
    skip: int = Query(default=0, ge=0, description="Number of records to skip (0-based offset)"),
    limit: int = Query(default=100, ge=1, le=2000, description="Max records to return per page (1–2000)"),
    current_user: CurrentUser = Depends(get_current_user),
) -> List[LeadResponse]:
    """
    Returns leads from Cosmos DB, sorted newest-first, with pagination.
    RBAC filtering:
      • Admin    → all leads returned.
      • Sales_Rep → only leads where top_match_bu matches the user's BU.

    Returns:
        List[LeadResponse] — enriched lead documents (vector excluded).
    """
    # BE-B2 fix: For Sales_Rep, fetch all leads, apply RBAC in Python, then
    # paginate — so X-Total-Count reflects BU-scoped count, not the global total.
    if current_user.role == "Sales_Rep" and current_user.bu:
        try:
            all_docs = await asyncio.wait_for(
                asyncio.to_thread(database.get_leads_page, 0, 5000),
                timeout=20.0,
            )
        except asyncio.TimeoutError:
            raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Database query timed out.")
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

        bu_filter = current_user.bu.lower()
        all_bu_leads: List[LeadResponse] = []
        for doc in all_docs:
            try:
                lead = LeadDB(**{k: v for k, v in doc.items() if not k.startswith("_")})
                top_bu = (lead.ai_analysis.top_match_bu if lead.ai_analysis else "").lower()
                if bu_filter not in top_bu:
                    continue
                all_bu_leads.append(LeadResponse.from_lead_db(lead, raw_doc=doc))
            except Exception as parse_exc:
                logger.warning("Skipping malformed lead doc id='%s': %s", doc.get("id"), parse_exc)

        response.headers["X-Total-Count"] = str(len(all_bu_leads))
        return all_bu_leads[skip: skip + limit]

    # Admin path: DB-level pagination with accurate total count.
    try:
        raw_leads = await asyncio.wait_for(
            asyncio.to_thread(database.get_leads_page, skip, limit),
            timeout=15.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Database query timed out. Try a smaller limit or contact support.",
        )
    except Exception as exc:
        logger.error("Failed to fetch leads from CosmosDB: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )

    try:
        total = await asyncio.to_thread(database.count_leads)
        response.headers["X-Total-Count"] = str(total)
    except Exception:
        pass  # header is informational only

    results: List[LeadResponse] = []
    for doc in raw_leads:
        try:
            lead = LeadDB(**{k: v for k, v in doc.items() if not k.startswith("_")})
            results.append(LeadResponse.from_lead_db(lead, raw_doc=doc))
        except Exception as parse_exc:
            logger.warning("Skipping malformed lead doc id='%s': %s", doc.get("id"), parse_exc)

    return results


# ---------------------------------------------------------------------------
# GET /api/leads/export — Export all leads as CSV (no pagination cap)
# ---------------------------------------------------------------------------
@app.get(
    "/api/leads/export",
    tags=["Leads"],
    summary="Download all leads as a CSV file",
)
@limiter.limit("10/minute")
async def export_leads_csv(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
):
    """
    Returns all leads (respecting RBAC) as a UTF-8 CSV file attachment.
    No pagination — intended for full-dataset export / reporting.
    Filename: synergy-leads-YYYY-MM-DD.csv
    """
    try:
        raw_leads = await asyncio.wait_for(
            asyncio.to_thread(database.get_leads_page, 0, 10_000),
            timeout=30.0,
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="Export query timed out.")
    except Exception as exc:
        logger.error("Export leads failed: %s", exc)
        raise HTTPException(status_code=502, detail="Database error during export.")

    # Build rows -----------------------------------------------
    CSV_FIELDS = [
        "id", "project_name", "location", "value_rm", "project_type", "stage",
        "status", "developer", "floors", "gfa", "created_date", "assigned_to",
        "is_duplicate", "top_match_bu", "match_score", "rationale",
    ]
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDS, extrasaction="ignore", lineterminator="\r\n")
    writer.writeheader()

    for doc in raw_leads:
        try:
            lead = LeadDB(**{k: v for k, v in doc.items() if not k.startswith("_")})
            if current_user.role == "Sales_Rep" and current_user.bu:
                top_bu = lead.ai_analysis.top_match_bu if lead.ai_analysis else ""
                if current_user.bu.lower() not in top_bu.lower():
                    continue
            row = {
                "id":            lead.id,
                "project_name":  lead.project_name,
                "location":      lead.location,
                "value_rm":      lead.value_rm,
                "project_type":  lead.project_type,
                "stage":         lead.stage,
                "status":        lead.status,
                "developer":     lead.developer or "",
                "floors":        lead.floors or "",
                "gfa":           lead.gfa or "",
                "created_date":  lead.created_date or "",
                "assigned_to":   lead.assigned_to or "",
                "is_duplicate":  lead.is_duplicate,
                "top_match_bu":  lead.ai_analysis.top_match_bu if lead.ai_analysis else "",
                "match_score":   lead.ai_analysis.match_score if lead.ai_analysis else "",
                "rationale":     (lead.ai_analysis.rationale or "").replace("\n", " ") if lead.ai_analysis else "",
            }
            writer.writerow(row)
        except Exception as exc:
            logger.warning("Export: skipping malformed lead id='%s': %s", doc.get("id"), exc)

    csv_bytes = output.getvalue().encode("utf-8-sig")  # utf-8-sig = Excel-friendly BOM
    today = __import__("datetime").date.today().isoformat()
    filename = f"synergy-leads-{today}.csv"
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ---------------------------------------------------------------------------
# GET /api/conflicts — Fetch Conflict Queue for Human Review
# ---------------------------------------------------------------------------
@app.get(
    "/api/conflicts",
    response_model=List[Dict[str, Any]],
    status_code=status.HTTP_200_OK,
    tags=["Conflicts"],
    summary="Fetch all duplicate conflict pairs awaiting human review",
)
@limiter.limit(LIMIT_READ)
def get_conflicts(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Returns conflict documents for the ConflictResolution dashboard.
    Each document contains the two lead IDs and their similarity score.
    Requires a valid JWT.

    RBAC filtering:
      • Admin    → all conflicts returned.
      • Sales_Rep → only conflicts where at least one of the referenced leads
                    has a top_match_bu that matches the user's BU.
    """
    try:
        conflicts = database.get_all_conflicts()
        # Strip Cosmos internal metadata fields before returning
        clean = [{k: v for k, v in c.items() if not k.startswith("_")} for c in conflicts]
    except Exception as exc:
        logger.error("Failed to fetch conflicts: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )

    # Admin: return everything unfiltered.
    if current_user.role == "Admin" or not current_user.bu:
        return clean

    # Sales_Rep: resolve which lead IDs belong to their BU, then filter conflicts.
    try:
        all_leads = database.get_active_leads()
        bu_lower = current_user.bu.lower()
        bu_lead_ids: set = {
            doc.get("id")
            for doc in all_leads
            if bu_lower in (
                (doc.get("ai_analysis") or {}).get("top_match_bu", "")
            ).lower()
        }
        return [
            c for c in clean
            if c.get("lead_id") in bu_lead_ids or c.get("matched_lead_id") in bu_lead_ids
        ]
    except Exception as exc:
        # If lead lookup fails, log and return unfiltered rather than breaking the UI.
        logger.warning(
            "BU conflict filtering failed for '%s', returning all: %s",
            current_user.email, exc,
        )
        return clean


# ---------------------------------------------------------------------------
# PATCH /api/conflicts/{conflict_id} — Resolve a duplicate conflict
# ---------------------------------------------------------------------------
@app.patch(
    "/api/conflicts/{conflict_id}",
    response_model=Dict[str, Any],
    status_code=status.HTTP_200_OK,
    tags=["Conflicts"],
    summary="Resolve a conflict — Merge, Discard, or Keep Both",
)
@limiter.limit(LIMIT_PATCH)
async def resolve_conflict(
    request: Request,
    conflict_id: str,
    payload: ConflictResolutionUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Persists the resolution decision for a duplicate conflict document.

    The three possible resolution statuses are:
      • 'Merged'    — primary record updated; incoming lead removed.
      • 'Discarded' — incoming duplicate lead discarded; existing record retained.
      • 'Kept Both' — both records kept with a cross-reference link.

    Stamps the document with who resolved it and when.
    """
    update_fields = {
        "status": payload.status,
        "resolved_by_email": current_user.email,
        "resolved_by_name": current_user.name,
        "resolved_at": payload.resolved_at,
    }
    try:
        updated = await asyncio.to_thread(
            database.update_conflict, conflict_id, update_fields
        )
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conflict '{conflict_id}' not found.",
        )
    except Exception as exc:
        logger.error("Failed to resolve conflict '%s': %s", conflict_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write error: {exc}",
        )

    # Clear is_duplicate flag and update the lead status for ALL three resolution
    # actions so the lead behaves like a normal lead after any conflict decision:
    #
    #   Merged    → lead stays in workbench with "Merged" badge (read-only audit)
    #   Discarded → lead is soft-excluded from pipeline views (status = "Discarded")
    #   Kept Both → BOTH records are now legitimate; the duplicate lead is sent back
    #               into the active pipeline as "Under Review" for normal processing
    dup_lead_id = updated.get("lead_id")
    if dup_lead_id:
        status_after: dict = {
            "Merged":     {"is_duplicate": False, "status": "Merged"},
            "Discarded":  {"is_duplicate": False, "status": "Discarded"},
            "Kept Both":  {"is_duplicate": False, "status": "Under Review"},
        }
        lead_patch = status_after.get(payload.status)
        if lead_patch:
            try:
                lead_doc = await asyncio.to_thread(database.read_lead, dup_lead_id)
                lead_doc.update(lead_patch)
                await asyncio.to_thread(database.save_lead, lead_doc)
                logger.info(
                    "Lead '%s' updated after conflict '%s' resolved as '%s' → %s",
                    dup_lead_id, conflict_id, payload.status, lead_patch,
                )
            except Exception as lead_exc:
                # Non-fatal: log and continue. The conflict is still resolved.
                logger.warning(
                    "Could not update lead '%s' after conflict resolution: %s",
                    dup_lead_id, lead_exc,
                )

    logger.info(
        "Conflict '%s' resolved as '%s' by '%s'",
        conflict_id,
        payload.status,
        current_user.email,
    )
    notifications.send_conflict_resolved_email(
        conflict_id=conflict_id,
        resolution=payload.status,
        resolved_by_name=current_user.name,
        resolved_by_email=current_user.email,
        lead_id=updated.get("lead_id", conflict_id),
        matched_lead_id=updated.get("matched_lead_id", ""),
    )
    return {k: v for k, v in updated.items() if not k.startswith("_")}

# ---------------------------------------------------------------------------
@app.patch(
    "/api/leads/{lead_id}",
    response_model=LeadResponse,
    status_code=status.HTTP_200_OK,
    tags=["Leads"],
    summary="Partially update a lead (stage, status)",
)
@limiter.limit(LIMIT_PATCH)
async def patch_lead(
    request: Request,
    lead_id: str,
    payload: LeadUpdate,
    current_user: CurrentUser = Depends(get_current_user),
) -> LeadResponse:
    """
    Applies a partial update to a persisted lead document.
    Primarily used by the Kanban board to move a lead between pipeline stages.

    Phase-2 addition: Auto-generates an AuditLog entry for every field changed.
    Only fields explicitly set in the payload are modified; all others are unchanged.
    """
    # BUG-M6 fix: use a Cosmos DB point-read (O(1)) instead of fetching all
    # leads and scanning linearly (O(n)). read_item() uses the partition key
    # directly, costing a single RU vs (n * RU) for a full collection scan.
    try:
        target_doc = await asyncio.to_thread(database.read_lead, lead_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead '{lead_id}' not found.",
        )
    except Exception as exc:
        logger.error("Failed to read lead '%s' for PATCH: %s", lead_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )

    # Apply only the provided (non-None) fields and capture old values for audit
    update_data = payload.model_dump(exclude_none=True)

    # --- Persist audit log entries to Cosmos DB for every changed field ---
    for field_name, new_val in update_data.items():
        old_val = target_doc.get(field_name, "")
        if str(old_val) != str(new_val):  # only log actual changes
            action_label = {
                "stage": "Stage Changed",
                "status": "Status Updated",
            }.get(field_name, f"{field_name.replace('_', ' ').title()} Updated")

            audit_entry = AuditLog(
                lead_id=lead_id,
                user_name=current_user.name,
                user_email=current_user.email,
                action=action_label,
                field_name=field_name,
                previous_value=str(old_val),
                new_value=str(new_val),
            )
            audit_doc = audit_entry.model_dump()
            audit_doc["id"] = str(uuid.uuid4())  # Cosmos DB requires a top-level 'id'
            try:
                database.save_audit_log(audit_doc)
            except Exception as audit_exc:
                logger.warning("Failed to persist audit log: %s", audit_exc)
            logger.info(
                "Audit — lead='%s' field='%s' '%s'→'%s' by '%s'",
                lead_id, field_name, old_val, new_val, current_user.email,
            )

    # BE-B3 fix: whenever the status is changed away from 'Duplicate Alert'
    # (e.g. Approve & Assign sets status='Assigned'), also clear is_duplicate
    # so the lead no longer renders with a red duplicate highlight in the UI.
    new_status = update_data.get("status")
    if new_status and new_status != "Duplicate Alert" and target_doc.get("is_duplicate"):
        update_data["is_duplicate"] = False
        logger.info(
            "is_duplicate cleared on lead='%s' because status changed to '%s'",
            lead_id, new_status,
        )

    target_doc.update(update_data)

    try:
        database.save_lead(target_doc)  # upsert in Cosmos DB
    except Exception as exc:
        logger.error("Failed to update lead '%s': %s", lead_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write error: {exc}",
        )

    lead = LeadDB(**{k: v for k, v in target_doc.items() if not k.startswith("_")})
    logger.info("Lead '%s' updated — changes: %s", lead_id, update_data)

    # Notify when a lead is explicitly assigned to a BU
    if update_data.get("status") == "Assigned":
        ai = target_doc.get("ai_analysis") or {}
        notifications.send_lead_assigned_email(
            project_name=target_doc.get("project_name", lead_id),
            location=target_doc.get("location", ""),
            value_rm=int(target_doc.get("value_rm", 0)),
            lead_id=lead_id,
            assigned_bu=ai.get("top_match_bu", "Unknown BU"),
            assigned_by_name=current_user.name,
            assigned_by_email=current_user.email,
        )

    return LeadResponse.from_lead_db(lead, raw_doc=target_doc)


# ---------------------------------------------------------------------------
# GET /api/leads/{lead_id}/activities — Fetch activity timeline for a lead
# ---------------------------------------------------------------------------
@app.get(
    "/api/leads/{lead_id}/activities",
    response_model=List[LeadActivity],
    status_code=status.HTTP_200_OK,
    tags=["Activities"],
    summary="Fetch the activity/notes timeline for a specific lead",
)
@limiter.limit(LIMIT_READ)
def get_activities(
    request: Request,
    lead_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> List[LeadActivity]:
    """
    Returns all logged activities (notes, calls, emails, system events) for a lead,
    sorted newest-first (ORDER BY timestamp DESC in the Cosmos DB query).
    Requires a valid JWT.
    """
    try:
        raw = database.get_activities_by_lead(lead_id)
        return [LeadActivity(**{k: v for k, v in a.items() if not k.startswith("_")}) for a in raw]
    except Exception as exc:
        logger.error("Failed to fetch activities for lead='%s': %s", lead_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )


# ---------------------------------------------------------------------------
# POST /api/leads/{lead_id}/activities — Add a note/activity to a lead
# ---------------------------------------------------------------------------
@app.post(
    "/api/leads/{lead_id}/activities",
    response_model=LeadActivity,
    status_code=status.HTTP_201_CREATED,
    tags=["Activities"],
    summary="Log a new activity or note against a lead",
)
@limiter.limit(LIMIT_PATCH)
def create_activity(
    request: Request,
    lead_id: str,
    payload: LeadActivityCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> LeadActivity:
    """
    Persists a new activity to the Cosmos DB Activities container.
    The system auto-stamps the UTC timestamp and generates a UUID for the entry.
    user_name is sourced from the authenticated JWT (cannot be spoofed by the caller).
    """
    # BE-B1 fix: generate the UUID once and inject it into the model so the
    # object returned to the client has the same 'id' as the document saved to
    # Cosmos DB.  Previously a second uuid4() call overwrote the doc id, making
    # the response id and the stored id permanently out of sync.
    activity_id = str(uuid.uuid4())
    new_activity = LeadActivity(
        id=activity_id,
        lead_id=lead_id,
        user_name=current_user.name,
        activity_type=payload.activity_type,
        content=payload.content,
    )
    activity_doc = new_activity.model_dump()
    # 'id' is already set correctly by the model — no second uuid4() needed.
    try:
        database.save_activity(activity_doc)
    except Exception as exc:
        logger.error("Failed to persist activity for lead='%s': %s", lead_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write error: {exc}",
        )
    logger.info(
        "Activity logged — lead='%s' type='%s' user='%s'",
        lead_id, new_activity.activity_type, new_activity.user_name,
    )
    return new_activity


# ---------------------------------------------------------------------------
# GET /api/leads/{lead_id}/audit-logs — Fetch change history for a lead
# ---------------------------------------------------------------------------
@app.get(
    "/api/leads/{lead_id}/audit-logs",
    response_model=List[AuditLog],
    status_code=status.HTTP_200_OK,
    tags=["Audit"],
    summary="Fetch the immutable change history for a specific lead",
)
@limiter.limit(LIMIT_READ)
def get_audit_logs(
    request: Request,
    lead_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> List[AuditLog]:
    """
    Returns all audit log entries for the given lead, sorted oldest-first
    (ORDER BY timestamp ASC) so the timeline reads top-to-bottom chronologically.
    Reads from Cosmos DB AuditLogs container partitioned by lead_id.
    """
    try:
        raw = database.get_audit_logs_by_lead(lead_id)
        return [AuditLog(**{k: v for k, v in entry.items() if not k.startswith("_")}) for entry in raw]
    except Exception as exc:
        logger.error("Failed to fetch audit logs for lead='%s': %s", lead_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )


# NOTE: Startup logic has been moved to the `lifespan` context manager above.
# The @app.on_event("startup") decorator is deprecated since FastAPI 0.93.
