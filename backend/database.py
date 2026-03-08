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
from typing import Any, Dict, List, Optional

from azure.cosmos import CosmosClient, PartitionKey, ThroughputProperties, exceptions
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
CONTAINER_USERS: str = os.environ.get("COSMOS_CONTAINER_USERS", "Users")
CONTAINER_ACTIVITIES: str = os.environ.get("COSMOS_CONTAINER_ACTIVITIES", "Activities")
CONTAINER_AUDIT: str = os.environ.get("COSMOS_CONTAINER_AUDIT", "AuditLogs")

# ---------------------------------------------------------------------------
# Throughput configuration — read from env vars so you can tune without redeploy.
#
# COSMOS_THROUGHPUT_MODE   : "autoscale" (default) | "manual"
# COSMOS_AUTOSCALE_MAX_RU  : max RU/s for autoscale mode   (default 4000)
#   → Cosmos DB automatically scales between 10% of max and max.
#   → You are billed for the peak used per hour, not the max.
#   → 4000 RU/s max = scales between 400 and 4000; covers ~50 concurrent users.
# COSMOS_MANUAL_RU         : fixed RU/s for manual mode     (default 1000)
# COSMOS_CONFIGURE_THROUGHPUT: set to "false" to skip throughput updates (CI/read-only accounts)
# ---------------------------------------------------------------------------
_THROUGHPUT_MODE         = os.environ.get("COSMOS_THROUGHPUT_MODE",          "autoscale")
_AUTOSCALE_MAX_RU        = int(os.environ.get("COSMOS_AUTOSCALE_MAX_RU",     "4000"))
_MANUAL_RU               = int(os.environ.get("COSMOS_MANUAL_RU",            "1000"))
_CONFIGURE_THROUGHPUT    = os.environ.get("COSMOS_CONFIGURE_THROUGHPUT",     "true").lower() == "true"

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


# ---------------------------------------------------------------------------
# Throughput helper — upgrades a container from the creation default (400 RU/s)
# to the configured production setting (autoscale or higher manual).
#
# Called immediately after create_container_if_not_exists() for every container.
# Idempotent: safe to call on every startup; Cosmos DB ignores no-op updates.
# Set COSMOS_CONFIGURE_THROUGHPUT=false for read-only RBAC accounts or CI.
# ---------------------------------------------------------------------------
def _configure_throughput(container, container_name: str) -> None:
    """Apply the project's throughput policy to a Cosmos DB container.

    Args:
        container:      A ContainerProxy returned by create_container_if_not_exists.
        container_name: Human-readable name used in log messages.
    """
    if not _CONFIGURE_THROUGHPUT:
        return
    try:
        if _THROUGHPUT_MODE == "autoscale":
            props = ThroughputProperties(
                auto_scale_max_throughput=_AUTOSCALE_MAX_RU,
                auto_scale_increment_percent=0,
            )
            logger.info(
                "Throughput → autoscale max=%d RU/s on container='%s'",
                _AUTOSCALE_MAX_RU, container_name,
            )
        else:
            props = ThroughputProperties(offer_throughput=_MANUAL_RU)
            logger.info(
                "Throughput → manual %d RU/s on container='%s'",
                _MANUAL_RU, container_name,
            )
        container.replace_throughput(props)
    except Exception as exc:  # noqa: BLE001
        # Non-fatal: log and continue. Common causes:
        #   • the account principal lacks RBAC "Cosmos DB Operator" write role
        #   • the container uses shared database-level throughput (replace not needed)
        logger.warning(
            "Could not set throughput on container='%s' (non-fatal): %s",
            container_name, exc,
        )

_leads_container = _database.create_container_if_not_exists(
    id=CONTAINER_LEADS,
    partition_key=PartitionKey(path="/id"),
    offer_throughput=400,  # Initial creation default; _configure_throughput() upgrades this immediately.
)
_configure_throughput(_leads_container, CONTAINER_LEADS)

_conflicts_container = _database.create_container_if_not_exists(
    id=CONTAINER_CONFLICTS,
    partition_key=PartitionKey(path="/id"),
    offer_throughput=400,
)
_configure_throughput(_conflicts_container, CONTAINER_CONFLICTS)

# New containers — Users (partitioned by /email), Activities & AuditLogs (partitioned by /lead_id)
users_container = _database.create_container_if_not_exists(
    id=CONTAINER_USERS,
    partition_key=PartitionKey(path="/email"),
    offer_throughput=400,
)
_configure_throughput(users_container, CONTAINER_USERS)

activities_container = _database.create_container_if_not_exists(
    id=CONTAINER_ACTIVITIES,
    partition_key=PartitionKey(path="/lead_id"),
    offer_throughput=400,
)
_configure_throughput(activities_container, CONTAINER_ACTIVITIES)

audit_container = _database.create_container_if_not_exists(
    id=CONTAINER_AUDIT,
    partition_key=PartitionKey(path="/lead_id"),
    offer_throughput=400,
)
_configure_throughput(audit_container, CONTAINER_AUDIT)

logger.info(
    "CosmosDB connected — database='%s', leads='%s', conflicts='%s', users='%s', activities='%s', audit='%s'",
    DATABASE_NAME,
    CONTAINER_LEADS,
    CONTAINER_CONFLICTS,
    CONTAINER_USERS,
    CONTAINER_ACTIVITIES,
    CONTAINER_AUDIT,
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

def read_lead(lead_id: str) -> Dict[str, Any]:
    """
    Point-read a single lead document by its ID (O(1) Cosmos DB RU cost).

    Uses the item id directly as the partition key because the Leads container
    is partitioned on /id. This is significantly cheaper than a cross-partition
    query over the entire collection (BUG-M6 fix).

    Args:
        lead_id: The UUID string of the lead to fetch.

    Returns:
        The raw Cosmos DB document dict.

    Raises:
        KeyError: If the document does not exist.
        azure.cosmos.exceptions.CosmosHttpResponseError on DB failure.
    """
    try:
        item = _leads_container.read_item(item=lead_id, partition_key=lead_id)
        logger.info("Point-read lead id='%s' from CosmosDB", lead_id)
        return item
    except exceptions.CosmosResourceNotFoundError:
        raise KeyError(f"Lead id='{lead_id}' not found in Cosmos DB.")
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to point-read lead id='%s': %s", lead_id, exc)
        raise


def get_all_leads() -> List[Dict[str, Any]]:
    """
    Retrieve ALL lead documents including Merged/Discarded ones.
    Internal use only (e.g. RBAC BU filtering for conflict queue).
    Use get_leads_page() or get_active_leads() for API responses.
    """
    try:
        items = list(
            _leads_container.query_items(
                query="SELECT * FROM c ORDER BY c._ts DESC",
                enable_cross_partition_query=True,
            )
        )
        logger.info("Fetched %d leads from CosmosDB (all, incl. resolved)", len(items))
        return items
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch leads: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Soft-exclude filters
# Leads with these statuses are removed from specific query scopes:
#
#   _DISCARDED_FILTER  — pipeline pages & counts (Discarded leads are gone).
#                        Merged leads remain visible in the workbench so users
#                        can see the audit trail and AI data post-resolution.
#
#   _RESOLVED_VECTOR_FILTER — vector comparison for duplicate detection.
#                        Both Merged AND Discarded are excluded so a newly
#                        ingested lead cannot be flagged as a duplicate of an
#                        already-resolved record.
# ---------------------------------------------------------------------------
_DISCARDED_FILTER = "c.status != 'Discarded'"
_RESOLVED_VECTOR_FILTER = "c.status != 'Merged' AND c.status != 'Discarded'"


def get_active_leads() -> List[Dict[str, Any]]:
    """
    Retrieve only ACTIVE lead documents (excludes Discarded).
    Merged leads are included — they remain visible in the pipeline with their
    AI analysis intact, but carry a 'Merged' status badge.
    Use this for RBAC filtering where truly-gone leads should be ignored.
    """
    try:
        items = list(
            _leads_container.query_items(
                query=f"SELECT * FROM c WHERE {_DISCARDED_FILTER} ORDER BY c._ts DESC",
                enable_cross_partition_query=True,
            )
        )
        logger.info("Fetched %d active leads from CosmosDB", len(items))
        return items
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch active leads: %s", exc)
        raise


def get_all_lead_vectors() -> List[Dict[str, Any]]:
    """
    Fetch ONLY the ``id`` and ``vector`` fields from every ACTIVE lead document.

    Merged and Discarded leads are excluded so they cannot re-trigger a
    duplicate-conflict alert against a freshly ingested lead.

    This is the authoritative, DB-backed source used for duplicate detection.
    Because it is sourced from Cosmos DB rather than an in-memory cache, it is:

    • Consistent across all server instances (multi-instance safe).
    • Persistent across server restarts.
    • Lightweight — the projection query transfers only ~6 KB per lead
      (1 536-dim float32 vector ≈ 6 KB), vs. the full document (~1–2 KB extra).

    Returns:
        List of dicts: [{"id": str, "vector": List[float]}, ...]
        Documents without a vector field are silently skipped.
    """
    try:
        items = list(
            _leads_container.query_items(
                query=(
                    "SELECT c.id, c.vector FROM c "
                    f"WHERE IS_DEFINED(c.vector) AND {_RESOLVED_VECTOR_FILTER}"
                ),
                enable_cross_partition_query=True,
            )
        )
        vectors = [{"id": doc["id"], "vector": doc["vector"]} for doc in items if doc.get("vector")]
        logger.debug("Vector projection fetched — %d active leads with embeddings", len(vectors))
        return vectors
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch lead vectors: %s", exc)
        raise


def get_leads_page(skip: int = 0, limit: int = 100) -> List[Dict[str, Any]]:
    """
    Fetch a paginated page of ACTIVE leads using Cosmos DB OFFSET LIMIT syntax.
    Soft-excludes Merged and Discarded leads (resolved duplicates) so they do
    not appear in the active pipeline view.

    Args:
        skip:  Number of records to skip (0-based offset).
        limit: Maximum number of records to return (capped at 500 by the API layer).

    Returns:
        A list of raw Cosmos DB item dicts sorted newest-first.
    """
    try:
        items = list(
            _leads_container.query_items(
                query=(
                    f"SELECT * FROM c "
                    f"WHERE {_DISCARDED_FILTER} "
                    f"ORDER BY c._ts DESC "
                    f"OFFSET {int(skip)} LIMIT {int(limit)}"
                ),
                enable_cross_partition_query=True,
            )
        )
        logger.info("Paged active leads — skip=%d limit=%d returned=%d", skip, limit, len(items))
        return items
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch paged leads (skip=%d, limit=%d): %s", skip, limit, exc)
        raise


def count_leads() -> int:
    """
    Return the count of ACTIVE lead documents (excludes Merged and Discarded).
    Used to populate the X-Total-Count response header for pagination.
    """
    try:
        results = list(
            _leads_container.query_items(
                query=f"SELECT VALUE COUNT(1) FROM c WHERE {_DISCARDED_FILTER}",
                enable_cross_partition_query=True,
            )
        )
        return int(results[0]) if results else 0
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to count leads: %s", exc)
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


def get_all_conflicts(pending_only: bool = True) -> List[Dict[str, Any]]:
    """
    Retrieve conflict documents for the ConflictResolution dashboard.

    Args:
        pending_only: When True (default), only returns unresolved conflicts
                      (status = 'Pending Review'). Pass False to retrieve ALL
                      conflicts including already-resolved ones (for audit use).
    """
    try:
        if pending_only:
            query = "SELECT * FROM c WHERE c.status = 'Pending Review' ORDER BY c._ts DESC"
        else:
            query = "SELECT * FROM c ORDER BY c._ts DESC"
        return list(
            _conflicts_container.query_items(
                query=query,
                enable_cross_partition_query=True,
            )
        )
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch conflicts: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Users Data Access
# ---------------------------------------------------------------------------

def save_user(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Upsert a user document into the Cosmos DB Users container.
    The document must contain 'id' and 'email' fields.
    'email' is the partition key; 'id' is used as the document identifier.
    """
    try:
        response = users_container.upsert_item(body=user_data)
        logger.info("User upserted — email='%s'", user_data.get("email"))
        return response
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to save user email='%s': %s", user_data.get("email"), exc)
        raise


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    """
    Point-read a user by email address (partition key).
    Returns None if no matching user is found.
    """
    try:
        results = list(
            users_container.query_items(
                query="SELECT * FROM c WHERE c.email = @email",
                parameters=[{"name": "@email", "value": email}],
                partition_key=email,
            )
        )
        return results[0] if results else None
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to query user by email='%s': %s", email, exc)
        raise


def count_users() -> int:
    """
    Return the number of DISTINCT email addresses in the Users container.
    Using distinct emails prevents a re-bootstrap when duplicate documents exist.
    """
    try:
        # Cosmos DB NoSQL does not support SELECT COUNT(DISTINCT ...) directly,
        # so we fetch all emails and count unique values in Python.
        results = list(
            users_container.query_items(
                query="SELECT VALUE c.email FROM c",
                enable_cross_partition_query=True,
            )
        )
        return len(set(results))
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to count users: %s", exc)
        raise


def list_users() -> List[Dict[str, Any]]:
    """
    Return unique user documents (excluding hashed_password) for the admin panel.
    Deduplicates by email — keeps the document with the lexicographically smallest id
    so the result is stable across calls.
    Cross-partition query — acceptable for the small Users container.
    """
    try:
        results = list(
            users_container.query_items(
                query="SELECT c.id, c.email, c.name, c.role, c.bu FROM c",
                enable_cross_partition_query=True,
            )
        )
        # Deduplicate by email — keep the entry with the smallest id (stable sort).
        # This guards against accidental bootstrap re-runs that left duplicate docs.
        seen: Dict[str, Any] = {}
        for doc in results:
            email = doc.get("email", "")
            if email not in seen or doc.get("id", "") < seen[email].get("id", ""):
                seen[email] = doc
        return list(seen.values())
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to list users: %s", exc)
        raise


def cleanup_duplicate_users() -> int:
    """
    Hard-delete duplicate user documents from Cosmos DB, keeping exactly one
    document per email address (the one with the lexicographically smallest id).

    Returns the number of duplicate documents deleted.
    Called once via GET /api/admin/users/cleanup (admin-only endpoint).
    """
    try:
        all_docs = list(
            users_container.query_items(
                query="SELECT c.id, c.email FROM c",
                enable_cross_partition_query=True,
            )
        )
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("cleanup_duplicate_users: query failed: %s", exc)
        raise

    # Group all document ids by email
    from collections import defaultdict
    grouped: Dict[str, list] = defaultdict(list)
    for doc in all_docs:
        grouped[doc["email"]].append(doc["id"])

    deleted = 0
    for email, ids in grouped.items():
        if len(ids) <= 1:
            continue
        # Keep the smallest id, delete the rest
        ids.sort()
        for dup_id in ids[1:]:
            try:
                users_container.delete_item(item=dup_id, partition_key=email)
                logger.info("Deleted duplicate user doc id='%s' email='%s'", dup_id, email)
                deleted += 1
            except exceptions.CosmosHttpResponseError as exc:
                logger.error("Failed to delete dup id='%s': %s", dup_id, exc)
    return deleted


def update_user(user_id: str, email: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    """
    Partial-update a user document by reading the current state then upserting
    the merged result.  hashed_password is never overwritten unless explicitly
    included in ``fields``.

    Args:
        user_id:  Cosmos document ``id`` (for logging only — uniqueness by email).
        email:    Partition key used to retrieve the existing document.
        fields:   Dict of fields to update (name, role, bu, hashed_password, …).

    Returns the updated document (without hashed_password).
    """
    existing = get_user_by_email(email)
    if existing is None:
        raise KeyError(f"User not found: {email}")
    existing.update(fields)
    try:
        users_container.upsert_item(body=existing)
        logger.info("User updated — email='%s' fields=%s", email, list(fields.keys()))
        existing.pop("hashed_password", None)
        return existing
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to update user email='%s': %s", email, exc)
        raise


def delete_user(user_id: str, email: str) -> None:
    """
    Hard-delete a user document from Cosmos DB.

    Args:
        user_id:  Cosmos document ``id`` (item id).
        email:    Partition key of the document.
    """
    try:
        users_container.delete_item(item=user_id, partition_key=email)
        logger.info("User deleted — email='%s' id='%s'", email, user_id)
    except exceptions.CosmosResourceNotFoundError:
        logger.warning("Delete user: not found email='%s' id='%s'", email, user_id)
        raise
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to delete user email='%s': %s", email, exc)
        raise


# ---------------------------------------------------------------------------
# Activities Data Access
# ---------------------------------------------------------------------------

def save_activity(activity_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Upsert an activity document into the Cosmos DB Activities container.
    Partition key: /lead_id.
    """
    try:
        response = activities_container.upsert_item(body=activity_data)
        logger.info(
            "Activity saved — id='%s' lead='%s'",
            activity_data.get("id"),
            activity_data.get("lead_id"),
        )
        return response
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to save activity: %s", exc)
        raise


def get_activities_by_lead(lead_id: str) -> List[Dict[str, Any]]:
    """
    Fetch all activities for a given lead, sorted newest-first.
    Uses a partition-key query (efficient single-partition read).
    """
    try:
        return list(
            activities_container.query_items(
                query=(
                    "SELECT * FROM c WHERE c.lead_id = @lead_id "
                    "ORDER BY c.timestamp DESC"
                ),
                parameters=[{"name": "@lead_id", "value": lead_id}],
                partition_key=lead_id,
            )
        )
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch activities for lead='%s': %s", lead_id, exc)
        raise


# ---------------------------------------------------------------------------
# Audit Logs Data Access
# ---------------------------------------------------------------------------

def save_audit_log(audit_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Persist an immutable audit log entry to the AuditLogs container.
    Partition key: /lead_id.
    """
    try:
        response = audit_container.upsert_item(body=audit_data)
        logger.info(
            "Audit log saved — id='%s' lead='%s'",
            audit_data.get("id"),
            audit_data.get("lead_id"),
        )
        return response
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to save audit log: %s", exc)
        raise


def get_audit_logs_by_lead(lead_id: str) -> List[Dict[str, Any]]:
    """
    Fetch the full change history for a lead, sorted oldest-first.
    Uses a partition-key query for efficient single-partition read.
    """
    try:
        return list(
            audit_container.query_items(
                query=(
                    "SELECT * FROM c WHERE c.lead_id = @lead_id "
                    "ORDER BY c.timestamp ASC"
                ),
                parameters=[{"name": "@lead_id", "value": lead_id}],
                partition_key=lead_id,
            )
        )
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to fetch audit logs for lead='%s': %s", lead_id, exc)
        raise


def delete_lead(lead_id: str) -> None:
    """
    Hard-delete a lead document from the Cosmos DB Leads container.

    Args:
        lead_id: The UUID of the lead to delete (also the partition key).

    Raises:
        KeyError: If the document does not exist.
        azure.cosmos.exceptions.CosmosHttpResponseError on DB failure.
    """
    try:
        _leads_container.delete_item(item=lead_id, partition_key=lead_id)
        logger.info("Lead deleted — id='%s'", lead_id)
    except exceptions.CosmosResourceNotFoundError:
        raise KeyError(f"Lead id='{lead_id}' not found in Cosmos DB.")
    except exceptions.CosmosHttpResponseError as exc:
        logger.error("Failed to delete lead id='%s': %s", lead_id, exc)
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
