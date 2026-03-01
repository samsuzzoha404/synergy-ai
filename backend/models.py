"""
models.py — Pydantic Schemas for Synergy Sales Genius
======================================================
Defines the full data contract between the API, the AI engine,
and the Cosmos DB persistence layer. Pydantic v2 is used throughout.

All numeric IDs are UUIDs to avoid collision in a distributed enterprise env.
"""

from __future__ import annotations

import uuid
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# 1. Lead Creation Payload (inbound from the frontend form)
# ---------------------------------------------------------------------------
class LeadCreate(BaseModel):
    """
    The minimal payload a sales rep submits when ingesting a new lead.
    All fields feed the AI engine for BU matching and synergy bundling.
    """

    project_name: str = Field(
        ...,
        min_length=2,
        max_length=256,
        description="Full name of the construction / renovation project.",
        examples=["Pavilion Damansara Heights Tower C"],
    )
    location: str = Field(
        ...,
        min_length=2,
        max_length=256,
        description="City, state, or precise address of the project site.",
        examples=["Damansara Heights, Kuala Lumpur"],
    )
    value_rm: int = Field(
        ...,
        ge=0,
        description="Estimated project value in Malaysian Ringgit (RM).",
        examples=[15_000_000],
    )
    project_type: str = Field(
        ...,
        max_length=128,
        description="Category of the project (e.g., High-Rise Residential, Commercial, Industrial).",
        examples=["High-Rise Residential"],
    )
    stage: str = Field(
        ...,
        max_length=64,
        description="Current pipeline stage (e.g., Prospecting, Qualified, Proposal, Negotiation, Closed).",
        examples=["Prospecting"],
    )


# ---------------------------------------------------------------------------
# 2. AI Analysis Result (produced by ai_engine.analyze_lead)
# ---------------------------------------------------------------------------
class AIAnalysis(BaseModel):
    """
    Structured output from GPT-4o analysis using Chin Hin's tribal knowledge.
    Returned as part of the persisted LeadDB document.
    """

    top_match_bu: str = Field(
        ...,
        description="The single Business Unit best suited to own this lead.",
        examples=["Stucken AAC"],
    )
    match_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Confidence score (0–100) for the top_match_bu assignment.",
        examples=[87],
    )
    rationale: str = Field(
        ...,
        description=(
            "AI-generated explanation citing historical project patterns "
            "and organisational tribal knowledge as context."
        ),
        examples=[
            "Stucken AAC has successfully delivered 3 similar high-rise "
            "residential towers in Damansara Heights. Their expertise in "
            "AAC block supply and structural fill aligns directly with "
            "the project's specifications."
        ],
    )
    synergy_bundle: List[str] = Field(
        default_factory=list,
        description=(
            "Other Chin Hin BUs that should be cross-sold into this project. "
            "Maximises group-wide revenue per lead."
        ),
        examples=[["Ajiya Metal/Glass", "Signature Alliance", "Fiamma Holding"]],
    )


# ---------------------------------------------------------------------------
# 3. Full Lead Document (stored in Cosmos DB + returned by the API)
# ---------------------------------------------------------------------------
class LeadDB(LeadCreate):
    """
    The complete lead document persisted in the Cosmos DB Leads container.
    Extends LeadCreate with system-generated fields and AI-enriched data.

    NOTE: Cosmos DB uses 'id' as the partition key by default (string).
    We store the UUID as a string to satisfy that requirement.
    """

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Globally unique lead identifier (UUID v4, stored as string for Cosmos DB).",
    )
    ai_analysis: Optional[AIAnalysis] = Field(
        default=None,
        description="AI-generated BU match and synergy bundle. Populated after ingestion.",
    )
    is_duplicate: bool = Field(
        default=False,
        description="True if cosine similarity against existing lead vectors exceeds the threshold.",
    )
    vector: List[float] = Field(
        default_factory=list,
        description=(
            "High-dimensional embedding of (project_name + location) from "
            "text-embedding-3-small. Used for semantic duplicate detection."
        ),
    )
    status: str = Field(
        default="New",
        max_length=64,
        description="Workflow status: New | Under Review | Assigned | Closed.",
    )


# ---------------------------------------------------------------------------
# 4. Partial Update Schema (PATCH /api/leads/{lead_id})
# ---------------------------------------------------------------------------
class LeadUpdate(BaseModel):
    """
    Allows partial updates to a persisted lead document.
    Currently used by the Kanban board to drag-and-drop stage changes.
    All fields are Optional — only provided fields are changed.
    """

    stage: Optional[str] = Field(
        default=None,
        max_length=64,
        description="New pipeline stage (e.g., Planning → Tender).",
        examples=["Tender"],
    )
    status: Optional[str] = Field(
        default=None,
        max_length=64,
        description="New workflow status (New | Under Review | Assigned | Closed).",
    )


# ---------------------------------------------------------------------------
# 5. Lead Activity / Notes (in-memory for MVP; swap to Cosmos DB later)
# ---------------------------------------------------------------------------
class ActivityType(str):
    NOTE = "Note"
    CALL = "Call"
    EMAIL = "Email"
    SYSTEM = "System"


class LeadActivity(BaseModel):
    """
    A timestamped event tied to a specific lead.
    Rendered in the SmartDrawer 'Activities & Notes' timeline.
    """

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        description="Unique activity identifier.",
    )
    lead_id: str = Field(
        ...,
        description="Foreign key — the lead this activity belongs to.",
    )
    user_name: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Display name of the user who logged the activity.",
        examples=["Ahmad Razif"],
    )
    activity_type: str = Field(
        default="Note",
        description="One of: Note | Call | Email | System.",
        examples=["Note"],
    )
    content: str = Field(
        ...,
        min_length=1,
        description="Free-text body of the activity (note, call summary, etc.).",
    )
    timestamp: str = Field(
        default_factory=lambda: __import__('datetime').datetime.utcnow().isoformat() + 'Z',
        description="ISO-8601 UTC timestamp of when the activity was logged.",
    )


class LeadActivityCreate(BaseModel):
    """Inbound payload for POST /api/leads/{lead_id}/activities."""

    user_name: str = Field(..., min_length=1, max_length=128, examples=["Ahmad Razif"])
    activity_type: str = Field(default="Note", examples=["Note"])
    content: str = Field(..., min_length=1)


# ---------------------------------------------------------------------------
# 6. API Response wrapper (clean envelope for the frontend)
# ---------------------------------------------------------------------------
class LeadResponse(BaseModel):
    """
    Lightweight response envelope. The 'vector' field is excluded from
    API responses to keep payloads lean (vectors can be 1536 floats).
    """

    id: str
    project_name: str
    location: str
    value_rm: int
    project_type: str
    stage: str
    status: str
    is_duplicate: bool
    ai_analysis: Optional[AIAnalysis] = None

    @classmethod
    def from_lead_db(cls, lead: LeadDB) -> "LeadResponse":
        """Factory to strip internal fields (vector) before API serialisation."""
        return cls(
            id=lead.id,
            project_name=lead.project_name,
            location=lead.location,
            value_rm=lead.value_rm,
            project_type=lead.project_type,
            stage=lead.stage,
            status=lead.status,
            is_duplicate=lead.is_duplicate,
            ai_analysis=lead.ai_analysis,
        )
