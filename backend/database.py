"""
database.py — Azure Cosmos DB Client & Data Access Layer
=========================================================
Initialises the CosmosClient once at module load (singleton pattern).
Provides a clean DAO (Data Access Object) interface used by main.py.

Cosmos DB NoSQL containers:
  • Leads      — primary lead documents (partition key: /id)
  • Conflicts  — flagged duplicate pairs for human review

Best practices applied:
  • Connection reuse via module-level singleton.
  • Structured error logging.
  • Explicit serialisation/deserialisation to strip Cosmos metadata.
"""

import logging
import os
from typing import Any, Dict, List

from azure.cosmos import CosmosClient, PartitionKey, exceptions
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load environment variables from .env (safe to call multiple times)
# ---------------------------------------------------------------------------
load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration — pulled from environment at import time
# ---------------------------------------------------------------------------
COSMOS_ENDPOINT: str = os.environ["AZURE_COSMOS_ENDPOINT"]
COSMOS_KEY: str = os.environ["AZURE_COSMOS_KEY"]
DATABASE_NAME: str = os.environ.get("COSMOS_DATABASE_NAME", "SynergyDB")
CONTAINER_LEADS: str = os.environ.get("COSMOS_CONTAINER_LEADS", "Leads")
CONTAINER_CONFLICTS: str = os.environ.get("COSMOS_CONTAINER_CONFLICTS", "Conflicts")

# ---------------------------------------------------------------------------
# Singleton Cosmos client — created once, reused across all requests.
# This avoids the cost of TCP connection setup on every API call.
# ---------------------------------------------------------------------------
_cosmos_client: CosmosClient = CosmosClient(
    url=COSMOS_ENDPOINT,
    credential=COSMOS_KEY,
)

# Obtain references to the database and containers.
# create_if_not_exists ensures the app bootstraps cleanly in a fresh environment.
_database = _cosmos_client.create_database_if_not_exists(id=DATABASE_NAME)

_leads_container = _database.create_container_if_not_exists(
    id=CONTAINER_LEADS,
    partition_key=PartitionKey(path="/id"),
    offer_throughput=400,  # Minimum RU/s — scale up for production load
)

_conflicts_container = _database.create_container_if_not_exists(
    id=CONTAINER_CONFLICTS,
    partition_key=PartitionKey(path="/id"),
    offer_throughput=400,
)

logger.info(
    "CosmosDB connected — database='%s', leads='%s', conflicts='%s'",
    DATABASE_NAME,
    CONTAINER_LEADS,
    CONTAINER_CONFLICTS,
)


# ---------------------------------------------------------------------------
# Data Access Functions
# ---------------------------------------------------------------------------

def save_lead(lead_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Upsert a lead document into the Cosmos DB Leads container.

    Args:
        lead_data: A dict representation of a LeadDB instance.
                   Must contain an 'id' string field (serves as partition key).

    Returns:
        The document as stored in Cosmos DB (includes system metadata like _ts).

    Raises:
        azure.cosmos.exceptions.CosmosHttpResponseError on write failure.
    """
    try:
        response = _leads_container.upsert_item(body=lead_data)
        logger.info("Lead saved to CosmosDB — id='%s'", lead_data.get("id"))
        return response
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to save lead id='%s': %s", lead_data.get("id"), exc)
        raise


def get_all_leads() -> List[Dict[str, Any]]:
    """
    Retrieve all lead documents from the Leads container.

    Returns:
        A list of raw Cosmos DB item dicts. Cosmos metadata fields
        (e.g., _rid, _ts) are present but stripped before API responses.

    NOTE: For large datasets (>1000 leads), add pagination using
          max_item_count and continuation tokens.
    """
    try:
        items = list(
            _leads_container.query_items(
                query="SELECT * FROM c ORDER BY c._ts DESC",
                enable_cross_partition_query=True,
            )
        )
        logger.info("Fetched %d leads from CosmosDB", len(items))
        return items
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch leads: %s", exc)
        raise


def save_conflict(conflict_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Persist a conflict document (duplicate pair flagged for human review)
    into the Conflicts container.

    Args:
        conflict_data: Dict with 'id', 'lead_id', 'matched_lead_id', 'score'.

    Returns:
        The upserted Cosmos DB document.
    """
    try:
        response = _conflicts_container.upsert_item(body=conflict_data)
        logger.info("Conflict saved — id='%s'", conflict_data.get("id"))
        return response
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to save conflict: %s", exc)
        raise


def get_all_conflicts() -> List[Dict[str, Any]]:
    """
    Retrieve all conflict documents for the ConflictResolution dashboard.
    """
    try:
        return list(
            _conflicts_container.query_items(
                query="SELECT * FROM c ORDER BY c._ts DESC",
                enable_cross_partition_query=True,
            )
        )
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch conflicts: %s", exc)
        raise


def update_conflict(conflict_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Apply a partial update to an existing conflict document (e.g., resolve it).

    Reads the current document, merges the update dict in, then upserts it back.
    This pattern is safe because conflict documents are small and low-traffic.

    Args:
        conflict_id: The 'id' (and partition key) of the conflict document.
        updates: Dict of fields to merge in (e.g., {"status": "Merged", ...}).

    Returns:
        The updated Cosmos DB document.

    Raises:
        KeyError: If the conflict document is not found.
        azure.cosmos.exceptions.CosmosHttpResponseError on DB failure.
    """
    try:
        # Read the existing document using id as both item id and partition key
        existing = _conflicts_container.read_item(
            item=conflict_id,
            partition_key=conflict_id,
        )
    except exceptions.CosmosResourceNotFoundError:
        raise KeyError(f"Conflict id='{conflict_id}' not found in Cosmos DB.")
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to read conflict id='%s': %s", conflict_id, exc)
        raise

    existing.update(updates)
    try:
        response = _conflicts_container.upsert_item(body=existing)
        logger.info(
            "Conflict id='%s' updated — new status='%s'",
            conflict_id,
            updates.get("status"),
        )
        return response
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to update conflict id='%s': %s", conflict_id, exc)
        raise
