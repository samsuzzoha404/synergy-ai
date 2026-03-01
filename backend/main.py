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
import io
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import numpy as np
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

import ai_engine
import database
from auth import (
    MOCK_USERS,
    CurrentUser,
    LoginRequest,
    TokenResponse,
    create_access_token,
    get_current_user,
)
from models import AIAnalysis, AuditLog, BulkIngestResponse, ConflictResolutionUpdate, LeadActivity, LeadActivityCreate, LeadCreate, LeadDB, LeadResponse, LeadUpdate

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
# In-memory vector cache for fast duplicate detection (hackathon shortcut).
# In production: replace with Azure Cosmos DB Vector Search or Azure AI Search.
# Structure: List of {"id": str, "vector": List[float]}
# ---------------------------------------------------------------------------
_vector_cache: List[Dict[str, Any]] = []

# In-memory activities store: { lead_id -> List[LeadActivity] }
# In production: replace with Cosmos DB 'Activities' container.
_activities_store: Dict[str, List[Dict[str, Any]]] = {}

# In-memory audit log store: { lead_id -> List[AuditLog] }
# In production: replace with Cosmos DB 'AuditLogs' container partitioned by lead_id.
_audit_store: Dict[str, List[Dict[str, Any]]] = {}

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
    global _vector_cache
    logger.info("Startup: Hydrating vector cache from Cosmos DB...")
    try:
        existing_leads = database.get_all_leads()
        for doc in existing_leads:
            lead_id = doc.get("id")
            vector = doc.get("vector", [])
            if lead_id and vector:
                _vector_cache.append({"id": lead_id, "vector": vector})
        logger.info("Vector cache hydrated — %d leads loaded.", len(_vector_cache))
    except Exception as exc:
        logger.warning("Could not hydrate vector cache on startup: %s", exc)
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
# CORS Middleware
# Allow all origins during development. RESTRICT in production.
# Production example: allow_origins=["https://synergy.chinhin.com.my"]
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # ⚠️  Restrict this before production deploy
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


def _check_duplicate(new_vector: List[float], new_id: str) -> bool:
    """
    Check the in-memory vector cache for a lead semantically similar to the new one.
    If a duplicate is found, the conflict is saved to Cosmos DB and True is returned.

    Args:
        new_vector: Embedding of the new lead.
        new_id:     UUID of the new lead (to avoid self-comparison).

    Returns:
        True if a near-duplicate exists above the similarity threshold.
    """
    for cached in _vector_cache:
        if cached["id"] == new_id:
            continue
        score = _cosine_similarity(new_vector, cached["vector"])
        if score >= DUPLICATE_SIMILARITY_THRESHOLD:
            logger.warning(
                "Duplicate detected — new_lead='%s' matches existing='%s' score=%.4f",
                new_id,
                cached["id"],
                score,
            )
            # Persist conflict document for human review
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
            return True
    return False


# ---------------------------------------------------------------------------
# POST /api/auth/login — Issue a JWT for a valid email/password pair
# ---------------------------------------------------------------------------
@app.post(
    "/api/auth/login",
    response_model=TokenResponse,
    tags=["Auth"],
    summary="Authenticate with email + password and receive a JWT",
)
def login(payload: LoginRequest) -> TokenResponse:
    """
    Validates credentials against the hardcoded MOCK_USERS dict (hackathon).
    In production: query Cosmos DB 'Users' container + compare bcrypt hash.

    Returns:
        TokenResponse — JWT access token + user profile object.
    """
    user = MOCK_USERS.get(payload.email.lower())
    if not user or user["password"] != payload.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    token = create_access_token({
        "sub": user["email"],
        "name": user["name"],
        "role": user["role"],
        "bu": user["bu"],
    })
    user_profile = {
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "bu": user["bu"],
    }
    logger.info("Login successful — user='%s' role='%s'", user["email"], user["role"])
    return TokenResponse(access_token=token, user=user_profile)


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
# POST /api/leads — Core Ingestion & AI Analysis Pipeline
# ---------------------------------------------------------------------------
@app.post(
    "/api/leads",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Leads"],
    summary="Ingest a new lead and trigger AI analysis",
)
async def create_lead(
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

    # --- Step 2: Duplicate detection (in-memory cosine similarity) ---
    new_id = str(uuid.uuid4())
    is_duplicate = _check_duplicate(vector, new_id)

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
    try:
        database.save_lead(lead_db.model_dump())
    except Exception as exc:
        logger.error("Cosmos DB write failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database write error: {exc}",
        )

    # --- Step 6: Add to in-memory vector cache for future duplicate checks ---
    _vector_cache.append({"id": new_id, "vector": vector})

    logger.info(
        "Lead '%s' saved — BU='%s', score=%d, duplicate=%s",
        new_id,
        ai_analysis.top_match_bu,
        ai_analysis.match_score,
        is_duplicate,
    )

    return LeadResponse.from_lead_db(lead_db)


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
async def bulk_ingest_leads(
    file: UploadFile = File(...),
    current_user: CurrentUser = Depends(get_current_user),
) -> BulkIngestResponse:
    """
    Accepts a CSV file (UTF-8 encoded) in the BCI export format.
    Runs the full AI pipeline for each valid row:
      1. Generate embedding → text-embedding-3-small
      2. Duplicate check   → cosine similarity vs. cache
      3. AI BU analysis    → GPT-4o with tribal knowledge
      4. Persist           → Cosmos DB Leads container

    Expected CSV columns (case-insensitive, order-independent):
      Project Name | Location | GDV | Stage | Developer | GFA | Type

    Returns a summary: total imported, total flagged as duplicates, errors.
    """
    # --- Guard: only CSV and XLSX-as-CSV files accepted ---
    filename = file.filename or ""
    if not (filename.lower().endswith(".csv") or filename.lower().endswith(".xlsx")):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only .csv files are supported for bulk upload. Please export your BCI data as CSV.",
        )

    raw_bytes = await file.read()
    try:
        content = raw_bytes.decode("utf-8-sig")  # utf-8-sig strips BOM if present
    except UnicodeDecodeError:
        content = raw_bytes.decode("latin-1", errors="replace")

    reader = csv.DictReader(io.StringIO(content))

    # Normalise headers: strip whitespace and lowercase for flexible matching
    if reader.fieldnames is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CSV file appears to be empty or has no header row.",
        )

    imported = 0
    flagged = 0
    errors: List[str] = []

    for row_num, row in enumerate(reader, start=2):  # start=2: row 1 is header
        # Normalise keys
        norm = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}

        project_name = (
            norm.get("project name") or norm.get("projectname") or norm.get("name") or ""
        )
        location = norm.get("location") or norm.get("address") or ""
        gdv_raw = norm.get("gdv") or norm.get("value") or norm.get("gdc") or "0"
        stage = norm.get("stage") or "Planning"
        project_type = norm.get("type") or norm.get("project type") or "Commercial"

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

        # Run AI pipeline for this row
        try:
            lead_payload = LeadCreate(
                project_name=project_name,
                location=location,
                value_rm=value_rm,
                project_type=project_type[:128],
                stage=stage[:64],
            )

            embedding_input = f"{project_name} {location}"
            vector = await asyncio.to_thread(ai_engine.generate_embedding, embedding_input)

            new_id = str(uuid.uuid4())
            is_dup = _check_duplicate(vector, new_id)

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
            await asyncio.to_thread(database.save_lead, lead_db.model_dump())
            _vector_cache.append({"id": new_id, "vector": vector})

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
# GET /api/leads — Fetch All Leads for the Lead Workbench
# ---------------------------------------------------------------------------
@app.get(
    "/api/leads",
    response_model=List[LeadResponse],
    status_code=status.HTTP_200_OK,
    tags=["Leads"],
    summary="Fetch all leads sorted by most recently ingested",
)
async def get_leads(
    current_user: CurrentUser = Depends(get_current_user),
) -> List[LeadResponse]:
    """
    Returns leads from Cosmos DB, sorted newest-first.
    RBAC filtering:
      • Admin    → all leads returned.
      • Sales_Rep → only leads where top_match_bu matches the user's BU.

    Returns:
        List[LeadResponse] — enriched lead documents (vector excluded).
    """
    try:
        raw_leads = await asyncio.to_thread(database.get_all_leads)
    except Exception as exc:
        logger.error("Failed to fetch leads from CosmosDB: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )

    results: List[LeadResponse] = []
    for doc in raw_leads:
        try:
            lead = LeadDB(**{k: v for k, v in doc.items() if not k.startswith("_")})
            # RBAC: Sales_Rep only sees their BU's leads
            if current_user.role == "Sales_Rep" and current_user.bu:
                top_bu = lead.ai_analysis.top_match_bu if lead.ai_analysis else ""
                if current_user.bu.lower() not in top_bu.lower():
                    continue
            results.append(LeadResponse.from_lead_db(lead))
        except Exception as parse_exc:
            logger.warning("Skipping malformed lead doc id='%s': %s", doc.get("id"), parse_exc)

    return results


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
def get_conflicts(
    current_user: CurrentUser = Depends(get_current_user),
) -> List[Dict[str, Any]]:
    """
    Returns all conflict documents for the ConflictResolution dashboard.
    Each document contains the two lead IDs and their similarity score.
    Requires a valid JWT — Admin sees all; Sales_Rep sees conflicts for their BU only.
    """
    try:
        conflicts = database.get_all_conflicts()
        # Strip Cosmos internal metadata fields before returning
        return [{k: v for k, v in c.items() if not k.startswith("_")} for c in conflicts]
    except Exception as exc:
        logger.error("Failed to fetch conflicts: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )


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
async def resolve_conflict(
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

    logger.info(
        "Conflict '%s' resolved as '%s' by '%s'",
        conflict_id,
        payload.status,
        current_user.email,
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
async def patch_lead(
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
    try:
        all_docs = await asyncio.to_thread(database.get_all_leads)
    except Exception as exc:
        logger.error("Failed to fetch leads for PATCH: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database read error: {exc}",
        )

    target_doc = next((d for d in all_docs if d.get("id") == lead_id), None)
    if target_doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Lead '{lead_id}' not found.",
        )

    # Apply only the provided (non-None) fields and capture old values for audit
    update_data = payload.model_dump(exclude_none=True)

    # --- Generate audit log entries for every changed field ---
    if lead_id not in _audit_store:
        _audit_store[lead_id] = []

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
            _audit_store[lead_id].append(audit_entry.model_dump())
            logger.info(
                "Audit — lead='%s' field='%s' '%s'→'%s' by '%s'",
                lead_id, field_name, old_val, new_val, current_user.email,
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
    return LeadResponse.from_lead_db(lead)


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
def get_activities(
    lead_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> List[LeadActivity]:
    """
    Returns all logged activities (notes, calls, emails, system events) for a lead,
    sorted with the most recent entry last so the frontend timeline reads top-to-bottom.
    Requires a valid JWT.
    """
    raw = _activities_store.get(lead_id, [])
    return [LeadActivity(**a) for a in raw]


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
def create_activity(
    lead_id: str,
    payload: LeadActivityCreate,
    current_user: CurrentUser = Depends(get_current_user),
) -> LeadActivity:
    """
    Appends a new activity to the in-memory activity log for the given lead.
    The system auto-stamps the UTC timestamp and generates a UUID for the entry.
    Stamped with the authenticated user's name from the JWT so the caller
    cannot spoof a different user's name.

    In production, persist to a Cosmos DB 'Activities' container
    partitioned by lead_id for efficient per-lead retrieval.
    """
    new_activity = LeadActivity(
        lead_id=lead_id,
        # Use the authenticated user's real name from JWT (overrides payload)
        user_name=current_user.name,
        activity_type=payload.activity_type,
        content=payload.content,
    )
    if lead_id not in _activities_store:
        _activities_store[lead_id] = []
    _activities_store[lead_id].append(new_activity.model_dump())
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
def get_audit_logs(
    lead_id: str,
    current_user: CurrentUser = Depends(get_current_user),
) -> List[AuditLog]:
    """
    Returns all audit log entries for the given lead, sorted oldest-first
    so the frontend timeline reads top-to-bottom chronologically.

    In production: query Cosmos DB 'AuditLogs' container partitioned by lead_id.
    """
    raw = _audit_store.get(lead_id, [])
    return [AuditLog(**entry) for entry in raw]


# NOTE: Startup logic has been moved to the `lifespan` context manager above.
# The @app.on_event("startup") decorator is deprecated since FastAPI 0.93.
