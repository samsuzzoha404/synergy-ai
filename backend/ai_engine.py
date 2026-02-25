"""
ai_engine.py — The AI Brain of Synergy Sales Genius
=====================================================
Two core functions power the intelligence layer:

  1. generate_embedding(text)
       Calls Azure OpenAI text-embedding-3-small to convert a lead's
       (project_name + location) into a 1536-dimensional float vector.
       This vector is stored in CosmosDB for semantic duplicate detection.

  2. analyze_lead(lead_dict)
       Calls Azure OpenAI GPT-4o with a structured system prompt encoding
       Chin Hin Group's tribal knowledge. Returns a JSON object with:
         - top_match_bu   : best Business Unit for this lead
         - match_score    : 0–100 confidence
         - rationale      : explanation citing past similar projects
         - synergy_bundle : other BUs to cross-sell

Design principles:
  • Uses the new openai Python SDK AzureOpenAI client (v1.x+).
  • response_format={"type": "json_object"} ensures deterministic JSON output.
  • All errors are caught and re-raised with context for FastAPI error handlers.
"""

import json
import logging
import os
from typing import Any, Dict, List

from openai import AzureOpenAI
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Initialise environment & logging
# ---------------------------------------------------------------------------
load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Azure OpenAI Client — Singleton, reused for all AI calls.
# The client automatically handles retries and connection pooling.
# ---------------------------------------------------------------------------
_openai_client = AzureOpenAI(
    azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
    api_key=os.environ["AZURE_OPENAI_API_KEY"],
    api_version=os.environ["AZURE_OPENAI_API_VERSION"],
)

# Deployment names from .env
GPT4O_DEPLOYMENT: str = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
EMBEDDING_DEPLOYMENT: str = os.environ.get(
    "AZURE_EMBEDDING_DEPLOYMENT_NAME", "text-embedding-3-small"
)
EMBEDDING_API_VERSION: str = os.environ.get("AZURE_EMBEDDING_API_VERSION", "2023-05-15")

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
# Public API
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
        openai.OpenAIError: On API failure (network, quota, auth).
    """
    # Embeddings use a different API version; create a scoped client.
    embedding_client = AzureOpenAI(
        azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        api_version=EMBEDDING_API_VERSION,
    )

    logger.info("Generating embedding for text: '%s'", text[:80])

    try:
        response = embedding_client.embeddings.create(
            model=EMBEDDING_DEPLOYMENT,
            input=text.strip(),
        )
        vector: List[float] = response.data[0].embedding
        logger.info("Embedding generated — dimensions: %d", len(vector))
        return vector
    except Exception as exc:
        logger.error("Embedding generation failed: %s", exc)
        raise


def analyze_lead(lead_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
    Analyse a lead using GPT-4o and Chin Hin tribal knowledge.

    Constructs a rich user prompt from the lead payload and calls GPT-4o
    with JSON-mode enforced. Parses and validates the structured response.

    Args:
        lead_dict: A dict with at minimum: project_name, location,
                   value_rm, project_type, stage.

    Returns:
        A dict matching the AIAnalysis schema:
        {
            "top_match_bu": str,
            "match_score": int,
            "rationale": str,
            "synergy_bundle": List[str]
        }

    Raises:
        ValueError: If GPT-4o returns malformed JSON.
        openai.OpenAIError: On API failure.
    """
    # Build a structured user prompt with all available lead signals.
    user_prompt = f"""
Analyse this inbound construction lead and return the optimal BU routing:

PROJECT NAME  : {lead_dict.get('project_name', 'N/A')}
LOCATION      : {lead_dict.get('location', 'N/A')}
PROJECT TYPE  : {lead_dict.get('project_type', 'N/A')}
STAGE         : {lead_dict.get('stage', 'N/A')}
VALUE (RM)    : {lead_dict.get('value_rm', 0):,}

Based on Chin Hin Group tribal knowledge and the BU profiles in your system prompt,
provide the optimal BU assignment with match score, rationale, and synergy bundle.
    """.strip()

    logger.info(
        "Calling GPT-4o for lead analysis — project='%s'",
        lead_dict.get("project_name"),
    )

    try:
        completion = _openai_client.chat.completions.create(
            model=GPT4O_DEPLOYMENT,
            response_format={"type": "json_object"},  # Enforces valid JSON output
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,      # Low temperature = more deterministic BU routing
            max_tokens=512,       # AIAnalysis fields are concise; 512 is generous
        )

        raw_content: str = completion.choices[0].message.content
        logger.debug("GPT-4o raw response: %s", raw_content)

        # Parse and return the structured JSON
        result: Dict[str, Any] = json.loads(raw_content)

        # Validate required keys are present
        required_keys = {"top_match_bu", "match_score", "rationale", "synergy_bundle"}
        missing = required_keys - result.keys()
        if missing:
            raise ValueError(f"GPT-4o response missing required keys: {missing}")

        logger.info(
            "AI analysis complete — BU='%s', score=%d",
            result.get("top_match_bu"),
            result.get("match_score", 0),
        )
        return result

    except json.JSONDecodeError as exc:
        logger.error("GPT-4o returned invalid JSON: %s", exc)
        raise ValueError(f"AI engine returned non-JSON response: {exc}") from exc
    except Exception as exc:
        logger.error("GPT-4o analysis failed: %s", exc)
        raise
