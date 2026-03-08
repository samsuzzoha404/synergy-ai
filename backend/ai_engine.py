"""
ai_engine.py — Agentic Workflow Engine for Synergy Sales Genius
===============================================================
Implements a LangGraph state machine that drives intelligent lead processing.

Graph topology (LeadProcessingState):

    START
      │
      ▼
  generate_embedding_node   — AzureOpenAIEmbeddings (text-embedding-3-small)
      │
      ▼
  check_duplicate_node      — NumPy cosine similarity vs. Cosmos DB vectors
      │
      ├─ is_duplicate=True  ──► END   (skips GPT-4o to conserve tokens)
      │
      └─ is_duplicate=False ──► score_lead_node
                                     │
                                     ▼
                                    END

Public API — signatures are IDENTICAL to the previous version so main.py
requires zero changes:

    generate_embedding(text: str)           → List[float]
    analyze_lead(lead_dict: Dict)           → {"top_match_bu", "match_score",
                                               "rationale", "synergy_bundle"}
    extract_leads_from_pdf_text(pdf_text)   → List[Dict]
"""

import json
import logging
import os
from typing import Any, Dict, List, Optional

import numpy as np
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing_extensions import TypedDict

from langchain_openai import AzureChatOpenAI, AzureOpenAIEmbeddings
from langgraph.graph import END, START, StateGraph

import database

# ---------------------------------------------------------------------------
# Initialise environment & logging
# ---------------------------------------------------------------------------
load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration — read deployment names from environment
# ---------------------------------------------------------------------------
GPT4O_DEPLOYMENT: str = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
EMBEDDING_DEPLOYMENT: str = os.environ.get(
    "AZURE_EMBEDDING_DEPLOYMENT_NAME", "text-embedding-3-small"
)
EMBEDDING_API_VERSION: str = os.environ.get("AZURE_EMBEDDING_API_VERSION", "2023-05-15")

DUPLICATE_SIMILARITY_THRESHOLD: float = 0.92

# ---------------------------------------------------------------------------
# LangChain Azure Model Singletons
# One instance for BU scoring (low temperature, tight token budget),
# one for PDF extraction (higher max_tokens, JSON-mode enforced).
# ---------------------------------------------------------------------------
_llm = AzureChatOpenAI(
    azure_deployment=GPT4O_DEPLOYMENT,
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version=os.environ["AZURE_OPENAI_API_VERSION"],
    temperature=0.2,
    max_tokens=512,
)

_llm_pdf = AzureChatOpenAI(
    azure_deployment=GPT4O_DEPLOYMENT,
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version=os.environ["AZURE_OPENAI_API_VERSION"],
    temperature=0.1,
    max_tokens=4096,
    model_kwargs={"response_format": {"type": "json_object"}},
)

_embeddings = AzureOpenAIEmbeddings(
    azure_deployment=EMBEDDING_DEPLOYMENT,
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version=EMBEDDING_API_VERSION,
)

# ---------------------------------------------------------------------------
# Chin Hin Group Tribal Knowledge — System Prompt
# This is the core IP of the AI CRM. It encodes organisational context
# so GPT-4o can reason like a senior Chin Hin Group sales strategist.
# ---------------------------------------------------------------------------
_SYSTEM_PROMPT = """
You are an elite AI Sales Strategist for Chin Hin Group, Malaysia's leading
building materials conglomerate. Your role is to analyse inbound construction
project leads and intelligently route them to the most profitable Business Unit (BU),
while maximising group-wide revenue through cross-selling.

=== CHIN HIN GROUP — 6 BUSINESS UNITS & TRIBAL KNOWLEDGE ===

1. STUCKEN AAC (Autoclaved Aerated Concrete Blocks)
   • Core strength: High-rise residential towers, mass housing, government projects.
   • Past wins: Pavilion Damansara Heights, TRX Residences, affordable housing in Setia Alam.
   • Signals: "High-Rise Residential", "blocks", "structure", "mass housing", "PPR", "LRT corridor".

2. AJIYA METAL / GLASS (Aluminium Curtain Wall, Roofing, Cladding)
   • Core strength: Commercial towers, shopping malls, industrial factories & warehouses.
   • Past wins: KLCC Lot 185, Sunway Velocity Mall extension, Penang industrial parks.
   • Signals: "Commercial", "Industrial", "factory", "warehouse", "curtain wall", "roofing", "cladding".

3. PPG HING (Paints & Coatings — Trading Division)
   • Core strength: Any project requiring large-scale paint supply; often a cross-sell.
   • Past wins: Supplied 10,000L+ to multiple public hospital refurbishments.
   • Signals: "Refurbishment", "hospital", "school", "government building", "repainting".

4. SIGNATURE ALLIANCE (Fit-out — Offices & Corporate Interiors)
   • Core strength: Premium office fit-outs, corporate headquarters, co-working spaces.
   • Past wins: TM Menara HQ, CIMB Bangsar South, multiple MSC-status tech company offices.
   • Signals: "Office", "corporate", "fit-out", "interior", "commercial fit", "bank".

5. SIGNATURE KITCHEN (Premium Kitchen Systems — Residential)
   • Core strength: High-end landed residential, serviced apartments, hotel kitchens.
   • Past wins: Eco World Bukit Bintang City Centre show units, Four Seasons KLCC kitchens.
   • Signals: "Serviced apartment", "condominium", "hotel", "kitchen", "landed", "luxury residential".

6. FIAMMA HOLDING (Home Appliances — Distribution)
   • Core strength: Bulk appliance supply for residential completions and hospitality.
   • Past wins: Supplied entire appliance fit-out for IHG Hotel Johor Bahru, MK20 KLCC units.
   • Signals: "Hotel", "condominium handover", "serviced residence", "appliances", "hospitality".
7. G-CAST (Precast Concrete Solutions)
   • Core strength: Large-scale infrastructure, industrial plants, and public civil works requiring precast structural elements.
   • Past wins: Penang Second Bridge approach slabs, Putrajaya federal building precast façades, KL MRT2 station boxes.
   • Signals: “Infrastructure”, “bridge”, “tunnel”, “industrial plant”, “precast”, “civil works”, “government infrastructure”, “MRT”, “LRT”.
=== OUTPUT RULES ===
You MUST respond with ONLY a valid JSON object. No markdown, no prose outside the JSON.

Required JSON structure:
{
  "top_match_bu": "<exact BU name from the 7 above>",
  "match_score": <integer 0-100>,
  "rationale": "<2-3 sentence explanation citing tribal knowledge, past wins, and project signals>",
  "synergy_bundle": ["<BU name>", "<BU name>"]  // 1-3 other BUs to cross-sell; may be empty []
}

=== SCORING GUIDE ===
90–100: Perfect signal match with multiple tribal knowledge indicators.
70–89 : Strong match with at least one clear indicator.
50–69 : Moderate match, opportunity exists but signals are mixed.
Below 50: Low confidence; flag for manual review.
"""

# ---------------------------------------------------------------------------
# Pydantic Schema — enforces structured output from GPT-4o
# ---------------------------------------------------------------------------
class AIAnalysisResult(BaseModel):
    """Validated structured output for GPT-4o BU scoring."""

    top_match_bu: str = Field(
        description="Exact Business Unit name from the 7 BUs defined in the system prompt."
    )
    match_score: int = Field(
        description="Confidence score from 0 to 100."
    )
    rationale: str = Field(
        description=(
            "2-3 sentence explanation citing tribal knowledge, past similar "
            "projects, and signals present in the lead."
        )
    )
    synergy_bundle: List[str] = Field(
        description="1-3 other BU names to cross-sell; may be an empty list."
    )


# ---------------------------------------------------------------------------
# LangGraph State
# ---------------------------------------------------------------------------
class LeadProcessingState(TypedDict):
    """Shared mutable state passed between every node in the lead workflow graph."""

    raw_lead_dict: dict               # Original lead payload from main.py
    vector: List[float]               # 1536-dim semantic embedding
    is_duplicate: bool                # True when cosine similarity >= threshold
    ai_analysis: Optional[dict]       # Populated by score_lead_node; None if duplicate


# ---------------------------------------------------------------------------
# Graph Node 1: generate_embedding_node
# ---------------------------------------------------------------------------
def generate_embedding_node(state: LeadProcessingState) -> dict:
    """
    Combine project_name + location from the lead dict and generate the
    1536-dimensional semantic embedding via AzureOpenAIEmbeddings.

    Returns:
        {"vector": List[float]}
    """
    lead = state["raw_lead_dict"]
    text = f"{lead.get('project_name', '')} {lead.get('location', '')}".strip()
    logger.info("Graph node [embed]: generating embedding for '%s'", text[:80])

    vector: List[float] = _embeddings.embed_query(text)
    logger.info("Graph node [embed]: vector generated — dimensions=%d", len(vector))
    return {"vector": vector}


# ---------------------------------------------------------------------------
# Graph Node 2: check_duplicate_node
# ---------------------------------------------------------------------------
def check_duplicate_node(state: LeadProcessingState) -> dict:
    """
    Compare the state vector against every active lead vector in Cosmos DB
    using NumPy cosine similarity.

    Routes to END (skipping GPT-4o) when similarity >= DUPLICATE_SIMILARITY_THRESHOLD.

    Returns:
        {"is_duplicate": bool}
    """
    new_vec = np.array(state["vector"], dtype=np.float32)
    norm_a = np.linalg.norm(new_vec)

    if norm_a == 0:
        logger.warning("Graph node [dup-check]: zero-norm vector; skipping duplicate check.")
        return {"is_duplicate": False}

    try:
        existing_vectors = database.get_all_lead_vectors()
    except Exception as exc:
        logger.error(
            "Graph node [dup-check]: DB query failed — skipping check: %s", exc
        )
        return {"is_duplicate": False}

    for cached in existing_vectors:
        old_vec = np.array(cached["vector"], dtype=np.float32)
        norm_b = np.linalg.norm(old_vec)
        if norm_b == 0:
            continue
        similarity = float(np.dot(new_vec, old_vec) / (norm_a * norm_b))
        if similarity >= DUPLICATE_SIMILARITY_THRESHOLD:
            logger.warning(
                "Graph node [dup-check]: duplicate detected — "
                "matched_id='%s', similarity=%.4f",
                cached.get("id"),
                similarity,
            )
            return {"is_duplicate": True}

    logger.info("Graph node [dup-check]: no duplicate found.")
    return {"is_duplicate": False}


# ---------------------------------------------------------------------------
# Graph Node 3: score_lead_node
# ---------------------------------------------------------------------------
def score_lead_node(state: LeadProcessingState) -> dict:
    """
    Send the lead to GPT-4o with the Chin Hin tribal knowledge system prompt.
    Uses LangChain's .with_structured_output(AIAnalysisResult) to enforce
    the required JSON schema via function-calling.

    Returns:
        {"ai_analysis": dict}  — a model_dump() of AIAnalysisResult
    """
    lead = state["raw_lead_dict"]

    # Format value_rm safely regardless of whether it arrives as int, float, or str
    try:
        value_rm_str = f"{float(lead.get('value_rm', 0)):,.0f}"
    except (ValueError, TypeError):
        value_rm_str = str(lead.get("value_rm", 0))

    user_prompt = (
        "Analyse this inbound construction lead and return the optimal BU routing:\n\n"
        f"PROJECT NAME  : {lead.get('project_name', 'N/A')}\n"
        f"LOCATION      : {lead.get('location', 'N/A')}\n"
        f"PROJECT TYPE  : {lead.get('project_type', 'N/A')}\n"
        f"STAGE         : {lead.get('stage', 'N/A')}\n"
        f"VALUE (RM)    : {value_rm_str}\n\n"
        "Based on Chin Hin Group tribal knowledge and the BU profiles in your system prompt,\n"
        "provide the optimal BU assignment with match score, rationale, and synergy bundle."
    )

    logger.info(
        "Graph node [score]: calling GPT-4o for project='%s'",
        lead.get("project_name"),
    )

    structured_llm = _llm.with_structured_output(AIAnalysisResult)
    result: AIAnalysisResult = structured_llm.invoke(
        [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]
    )

    logger.info(
        "Graph node [score]: analysis complete — BU='%s', score=%d",
        result.top_match_bu,
        result.match_score,
    )
    return {"ai_analysis": result.model_dump()}


# ---------------------------------------------------------------------------
# Conditional Routing Function
# ---------------------------------------------------------------------------
def _route_after_duplicate_check(state: LeadProcessingState) -> str:
    """
    After check_duplicate_node, decide the next node:
      - Duplicate detected  → END  (conserves GPT-4o tokens)
      - Not a duplicate     → score_lead_node
    """
    if state["is_duplicate"]:
        logger.info("Graph routing: duplicate → END (GPT-4o skipped).")
        return END
    return "score_lead_node"


# ---------------------------------------------------------------------------
# Build & Compile the LangGraph State Machine
# ---------------------------------------------------------------------------
_graph_builder = StateGraph(LeadProcessingState)

_graph_builder.add_node("generate_embedding_node", generate_embedding_node)
_graph_builder.add_node("check_duplicate_node", check_duplicate_node)
_graph_builder.add_node("score_lead_node", score_lead_node)

_graph_builder.add_edge(START, "generate_embedding_node")
_graph_builder.add_edge("generate_embedding_node", "check_duplicate_node")
_graph_builder.add_conditional_edges(
    "check_duplicate_node",
    _route_after_duplicate_check,
)
_graph_builder.add_edge("score_lead_node", END)

# Compiled, immutable workflow — reused for every analyze_lead() call.
lead_workflow = _graph_builder.compile()

# Placeholder returned when the graph short-circuits on a duplicate.
# main.py always requires a valid dict from analyze_lead(); this satisfies
# the contract while clearly signalling that no GPT-4o scoring was done.
_DUPLICATE_PLACEHOLDER: Dict[str, Any] = {
    "top_match_bu": "Pending Review",
    "match_score": 0,
    "rationale": (
        "This lead was flagged as a near-duplicate of an existing project by "
        "the semantic similarity engine. GPT-4o scoring was intentionally skipped "
        "to conserve tokens. Please resolve the conflict in the Conflict Resolution workspace."
    ),
    "synergy_bundle": [],
}


# ---------------------------------------------------------------------------
# Public API — identical signatures to the previous ai_engine.py
# ---------------------------------------------------------------------------

def generate_embedding(text: str) -> List[float]:
    """
    Generate a semantic embedding vector for a lead's identity text.

    The input text should be: "{project_name} {location}"
    The model returns a 1536-dimensional float vector (text-embedding-3-small).
    This vector is stored in Cosmos DB and used for cosine-similarity duplicate
    detection against future leads.

    Args:
        text: Combined project name and location string.

    Returns:
        A list of 1536 floats representing the semantic embedding.

    Raises:
        langchain_core.exceptions.LangChainException: On API failure.
    """
    logger.info("Generating embedding for text: '%s'", text[:80])
    try:
        vector: List[float] = _embeddings.embed_query(text.strip())
        logger.info("Embedding generated — dimensions: %d", len(vector))
        return vector
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
        raise


def analyze_lead(lead_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Process a lead through the compiled LangGraph agentic workflow.

    Internally executes three sequential / conditional nodes:
      1. generate_embedding_node  — embed the lead's project_name + location
      2. check_duplicate_node     — cosine similarity check vs. Cosmos DB
      3. score_lead_node          — GPT-4o BU scoring (skipped for duplicates)

    This function always returns the exact dict structure expected by main.py:
        {
            "top_match_bu"  : str,
            "match_score"   : int,
            "rationale"     : str,
            "synergy_bundle": List[str],
        }

    When the graph detects a duplicate and skips the scoring node, a
    descriptive placeholder dict is returned so the caller never receives None.

    Args:
        lead_dict: Lead payload dict (at minimum: project_name, location,
                   value_rm, project_type, stage).

    Returns:
        Dict matching the AIAnalysis schema used by main.py.

    Raises:
        Exception: Propagates any unexpected graph-level failure.
    """
    logger.info(
        "Invoking LangGraph lead workflow for project='%s'",
        lead_dict.get("project_name"),
    )

    initial_state: LeadProcessingState = {
        "raw_lead_dict": lead_dict,
        "vector": [],
        "is_duplicate": False,
        "ai_analysis": None,
    }

    try:
        final_state = lead_workflow.invoke(initial_state)
    except Exception as exc:
        logger.error("LangGraph workflow invocation failed: %s", exc)
        raise

    ai_analysis = final_state.get("ai_analysis")

    if ai_analysis is None:
        # Graph took the duplicate branch — GPT-4o was intentionally skipped.
        logger.info(
            "Workflow short-circuited (duplicate) for project='%s' — "
            "returning placeholder analysis.",
            lead_dict.get("project_name"),
        )
        return _DUPLICATE_PLACEHOLDER.copy()

    logger.info(
        "Workflow complete — BU='%s', score=%d",
        ai_analysis.get("top_match_bu"),
        ai_analysis.get("match_score", 0),
    )
    return ai_analysis


# ---------------------------------------------------------------------------
# PDF Lead Extraction — parse unstructured PDF text into lead records
# ---------------------------------------------------------------------------

_PDF_EXTRACTION_PROMPT = """
You are a data extraction assistant for Chin Hin Group's CRM system.
You will receive raw text extracted from a BCI (Building & Construction Information)
project report PDF. Your job is to identify every distinct construction project
mentioned and return them as a JSON array.

Each project object MUST have these keys (use null if information is unavailable):
  "project_name" : string  — full name of the project
  "location"     : string  — city / state / address
  "gdv"          : number  — project value / GDV / GDC in RM (digits only, 0 if unknown)
  "stage"        : string  — one of: Planning, Tender, Construction (default: "Planning")
  "project_type" : string  — one of: High-Rise, Industrial, Commercial, Infrastructure, Renovation (default: "Commercial")
  "developer"    : string or null — developer / main contractor name
  "gfa"          : number or null — gross floor area in sq ft
  "floors"       : number or null — number of floors / storeys

Return ONLY a valid JSON array. No markdown, no prose outside the JSON.
If no projects are found, return an empty array: []
"""


def extract_leads_from_pdf_text(pdf_text: str) -> List[Dict[str, Any]]:
    """
    Use GPT-4o to extract structured lead records from raw PDF text.

    Args:
        pdf_text: Plain text extracted from a PDF file (pdfplumber output).

    Returns:
        A list of dicts, each matching the BCI CSV field schema.
        Returns an empty list if no projects are found or parsing fails.
    """
    if not pdf_text or not pdf_text.strip():
        logger.warning("PDF extract: received empty text.")
        return []

    # Truncate to ~12,000 chars to stay comfortably within context limits.
    truncated = pdf_text[:12_000]

    logger.info("Calling GPT-4o to extract leads from PDF (%d chars).", len(truncated))

    try:
        response = _llm_pdf.invoke(
            [
                {"role": "system", "content": _PDF_EXTRACTION_PROMPT},
                {
                    "role": "user",
                    "content": f"Extract all projects from this PDF text:\n\n{truncated}",
                },
            ]
        )

        raw: str = response.content
        parsed = json.loads(raw)

        # GPT may return {"projects": [...]} or directly [...] — normalise both.
        if isinstance(parsed, list):
            leads = parsed
        elif isinstance(parsed, dict):
            # Try common wrapper keys
            for key in ("projects", "leads", "items", "data", "results"):
                if key in parsed and isinstance(parsed[key], list):
                    leads = parsed[key]
                    break
            else:
                # Single project returned as object — wrap it
                leads = [parsed] if "project_name" in parsed else []
        else:
            leads = []

        logger.info("PDF extraction complete — %d project(s) identified.", len(leads))
        return leads

    except json.JSONDecodeError as exc:
        logger.error("PDF extraction: GPT-4o returned invalid JSON: %s", exc)
        return []
    except Exception as exc:
        logger.error("PDF extraction failed: %s", exc)
        raise
