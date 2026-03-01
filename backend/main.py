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
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Any, Dict, List

import numpy as np
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

import ai_engine
import database
from models import AIAnalysis, LeadActivity, LeadActivityCreate, LeadCreate, LeadDB, LeadResponse, LeadUpdate

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
async def create_lead(payload: LeadCreate) -> LeadResponse:
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
# GET /api/leads — Fetch All Leads for the Lead Workbench
# ---------------------------------------------------------------------------
@app.get(
    "/api/leads",
    response_model=List[LeadResponse],
    status_code=status.HTTP_200_OK,
    tags=["Leads"],
    summary="Fetch all leads sorted by most recently ingested",
)
async def get_leads() -> List[LeadResponse]:
    """
    Returns all leads from Cosmos DB, sorted newest-first (via Cosmos query).
    The raw vector field is stripped from each response for payload efficiency.

    Returns:
        List[LeadResponse] — all enriched lead documents.
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
            # Reconstruct Pydantic model from raw Cosmos document
            lead = LeadDB(**{k: v for k, v in doc.items() if not k.startswith("_")})
            results.append(LeadResponse.from_lead_db(lead))
        except Exception as parse_exc:
            # Skip malformed documents — log and continue
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
def get_conflicts() -> List[Dict[str, Any]]:
    """
    Returns all conflict documents for the ConflictResolution dashboard.
    Each document contains the two lead IDs and their similarity score.
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
# PATCH /api/leads/{lead_id} — Update a lead's stage (Kanban board DnD)
# ---------------------------------------------------------------------------
@app.patch(
    "/api/leads/{lead_id}",
    response_model=LeadResponse,
    status_code=status.HTTP_200_OK,
    tags=["Leads"],
    summary="Partially update a lead (stage, status)",
)
async def patch_lead(lead_id: str, payload: LeadUpdate) -> LeadResponse:
    """
    Applies a partial update to a persisted lead document.
    Primarily used by the Kanban board to move a lead between pipeline stages.

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

    # Apply only the provided (non-None) fields
    update_data = payload.model_dump(exclude_none=True)
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
def get_activities(lead_id: str) -> List[LeadActivity]:
    """
    Returns all logged activities (notes, calls, emails, system events) for a lead,
    sorted with the most recent entry last so the frontend timeline reads top-to-bottom.
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
def create_activity(lead_id: str, payload: LeadActivityCreate) -> LeadActivity:
    """
    Appends a new activity to the in-memory activity log for the given lead.
    The system auto-stamps the UTC timestamp and generates a UUID for the entry.

    In production, persist to a Cosmos DB 'Activities' container
    partitioned by lead_id for efficient per-lead retrieval.
    """
    new_activity = LeadActivity(
        lead_id=lead_id,
        user_name=payload.user_name,
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


# NOTE: Startup logic has been moved to the `lifespan` context manager above.
# The @app.on_event("startup") decorator is deprecated since FastAPI 0.93.
