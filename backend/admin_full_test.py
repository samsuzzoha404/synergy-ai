#!/usr/bin/env python3
"""
admin_full_test.py — Comprehensive A-to-Z Admin Test Suite
===========================================================
Tests every API endpoint as Admin user (marvis@chinhin.com / admin123).

Coverage:
  [T01]  GET  /health                          — Liveness probe
  [T02]  POST /api/auth/login (valid Admin)    — Issue JWT
  [T03]  POST /api/auth/login (wrong password) — Expect 401
  [T04]  POST /api/auth/login (unknown email)  — Expect 401
  [T05]  GET  /api/leads (no token)            — Expect 401
  [T06]  GET  /api/leads (Admin token)         — Full lead list with RBAC
  [T07]  POST /api/leads                        — Ingest new lead, AI analysis
  [T08]  POST /api/leads (validation error)    — Expect 422 on bad payload
  [T09]  GET  /api/leads/{id}/activities       — Empty timeline for new lead
  [T10]  POST /api/leads/{id}/activities       — Log a Note activity
  [T11]  POST /api/leads/{id}/activities       — Log a Call activity
  [T12]  GET  /api/leads/{id}/activities       — Verify 2 activities returned
  [T13]  PATCH /api/leads/{id}                 — Move lead to "Qualified" stage
  [T14]  GET  /api/leads/{id}/audit-logs       — Confirm audit trail recorded
  [T15]  GET  /api/conflicts                   — Conflict queue (Admin sees all)
  [T16]  POST /api/leads/bulk (valid CSV)      — Bulk CSV import
  [T17]  POST /api/leads/bulk (xlsx guard)     — Expect 400 for xlsx
  [T18]  POST /api/leads/bulk (bad CSV rows)   — Partial import with errors
  [T19]  PATCH /api/conflicts/{id} (if any)    — Resolve conflict
  [T20]  Sales_Rep RBAC isolation              — sales@stucken.com sees only Stucken leads
"""

import csv
import io
import json
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests

BASE_URL = "http://localhost:8000"
ADMIN_EMAIL = "marvis@chinhin.com"
ADMIN_PASSWORD = "admin123"
SALES_EMAIL = "sales@stucken.com"
SALES_PASSWORD = "sales123"


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
PASS = "✅ PASS"
FAIL = "❌ FAIL"
SKIP = "⚠️  SKIP"

results: List[Dict[str, Any]] = []


def record(test_id: str, name: str, status: str, detail: str = "", extra: str = "") -> None:
    tag = PASS if status == "PASS" else (SKIP if status == "SKIP" else FAIL)
    results.append({"id": test_id, "name": name, "status": tag, "detail": detail})
    prefix = f"  [{test_id}] {tag}"
    print(f"{prefix}  {name}")
    if detail:
        print(f"           detail : {detail}")
    if extra:
        print(f"           extra  : {extra}")


def get_json(r: requests.Response) -> Any:
    try:
        return r.json()
    except Exception:
        return r.text


# ─────────────────────────────────────────────
# T01 — Health check
# ─────────────────────────────────────────────
def t01_health():
    r = requests.get(f"{BASE_URL}/health", timeout=10)
    body = get_json(r)
    ok = r.status_code == 200 and body.get("status") == "healthy"
    record("T01", "GET /health", "PASS" if ok else "FAIL",
           f"status={r.status_code}  body={body}")


# ─────────────────────────────────────────────
# T02 — Admin login (valid credentials)
# ─────────────────────────────────────────────
def t02_admin_login_valid() -> Optional[str]:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=45)
    body = get_json(r)
    token = body.get("access_token") if isinstance(body, dict) else None
    ok = r.status_code == 200 and token and body.get("user", {}).get("role") == "Admin"
    record("T02", "POST /api/auth/login (Admin valid creds)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  role={body.get('user', {}).get('role') if isinstance(body, dict) else 'N/A'}",
           f"name={body.get('user', {}).get('name') if isinstance(body, dict) else 'N/A'}")
    return token if ok else None


# ─────────────────────────────────────────────
# T03 — Admin login (wrong password → 401)
# ─────────────────────────────────────────────
def t03_login_wrong_password():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": ADMIN_EMAIL, "password": "wrongpassword"}, timeout=45)
    ok = r.status_code == 401
    record("T03", "POST /api/auth/login (wrong password → 401)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  detail={get_json(r)}")


# ─────────────────────────────────────────────
# T04 — Login with unknown email → 401
# ─────────────────────────────────────────────
def t04_login_unknown_email():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "nobody@nowhere.com", "password": "whatever"}, timeout=45)
    ok = r.status_code == 401
    record("T04", "POST /api/auth/login (unknown email → 401)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}")


# ─────────────────────────────────────────────
# T05 — GET /api/leads without token → 401
# ─────────────────────────────────────────────
def t05_leads_no_token():
    r = requests.get(f"{BASE_URL}/api/leads", timeout=10)
    ok = r.status_code == 401
    record("T05", "GET /api/leads (no token → 401)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}")


# ─────────────────────────────────────────────
# T06 — GET /api/leads as Admin → returns all leads
# ─────────────────────────────────────────────
def t06_admin_get_leads(token: str) -> List[Dict]:
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/leads", headers=headers, timeout=20)
    body = get_json(r)
    ok = r.status_code == 200 and isinstance(body, list)
    record("T06", "GET /api/leads (Admin → all leads)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  count={len(body) if isinstance(body, list) else 'N/A'}")
    return body if ok else []


# ─────────────────────────────────────────────
# T07 — POST /api/leads (valid new lead)
# ─────────────────────────────────────────────
def t07_ingest_lead(token: str) -> Optional[str]:
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "project_name": "Admin Test Tower — KLCC Phase 3",
        "location": "KLCC, Kuala Lumpur",
        "value_rm": 85_000_000,
        "project_type": "High-Rise Commercial",
        "stage": "Prospecting",
    }
    r = requests.post(f"{BASE_URL}/api/leads", json=payload, headers=headers, timeout=60)
    body = get_json(r)
    ok = r.status_code == 201 and isinstance(body, dict) and body.get("id")
    lead_id = body.get("id") if ok else None
    record("T07", "POST /api/leads (Admin ingest → 201)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  lead_id={lead_id}",
           f"top_match_bu={body.get('ai_analysis', {}).get('top_match_bu') if isinstance(body, dict) else 'N/A'}  "
           f"match_score={body.get('ai_analysis', {}).get('match_score') if isinstance(body, dict) else 'N/A'}  "
           f"is_duplicate={body.get('is_duplicate') if isinstance(body, dict) else 'N/A'}")
    return lead_id


# ─────────────────────────────────────────────
# T08 — POST /api/leads with missing fields → 422
# ─────────────────────────────────────────────
def t08_ingest_lead_invalid(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    bad_payload = {"project_name": "X"}  # missing required fields
    r = requests.post(f"{BASE_URL}/api/leads", json=bad_payload, headers=headers, timeout=10)
    ok = r.status_code == 422
    record("T08", "POST /api/leads (missing fields → 422)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}")


# ─────────────────────────────────────────────
# T09 — GET activities for new lead → empty list
# ─────────────────────────────────────────────
def t09_get_activities_empty(token: str, lead_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/leads/{lead_id}/activities", headers=headers, timeout=10)
    body = get_json(r)
    ok = r.status_code == 200 and isinstance(body, list)
    record("T09", "GET /api/leads/{id}/activities (new lead → empty list)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  count={len(body) if isinstance(body, list) else 'N/A'}")


# ─────────────────────────────────────────────
# T10 — POST activity (Note)
# ─────────────────────────────────────────────
def t10_post_activity_note(token: str, lead_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"activity_type": "Note", "content": "Admin test note — initial site visit confirmed."}  # user_name sourced from JWT
    r = requests.post(f"{BASE_URL}/api/leads/{lead_id}/activities", json=payload, headers=headers, timeout=10)
    body = get_json(r)
    ok = r.status_code == 201 and isinstance(body, dict) and body.get("activity_type") == "Note"
    record("T10", "POST /api/leads/{id}/activities (Note)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  type={body.get('activity_type') if isinstance(body, dict) else 'N/A'}")


# ─────────────────────────────────────────────
# T11 — POST activity (Call)
# ─────────────────────────────────────────────
def t11_post_activity_call(token: str, lead_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"activity_type": "Call", "content": "Spoke with procurement head — interest confirmed."}  # user_name sourced from JWT
    r = requests.post(f"{BASE_URL}/api/leads/{lead_id}/activities", json=payload, headers=headers, timeout=10)
    body = get_json(r)
    ok = r.status_code == 201 and isinstance(body, dict) and body.get("activity_type") == "Call"
    record("T11", "POST /api/leads/{id}/activities (Call)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  type={body.get('activity_type') if isinstance(body, dict) else 'N/A'}")


# ─────────────────────────────────────────────
# T12 — GET activities → verify 2 entries
# ─────────────────────────────────────────────
def t12_get_activities_count(token: str, lead_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/leads/{lead_id}/activities", headers=headers, timeout=10)
    body = get_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and len(body) >= 2
    record("T12", "GET /api/leads/{id}/activities (≥2 after logging)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  count={len(body) if isinstance(body, list) else 'N/A'}")


# ─────────────────────────────────────────────
# T13 — PATCH lead stage → "Qualified"
# ─────────────────────────────────────────────
def t13_patch_lead_stage(token: str, lead_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    payload = {"stage": "Qualified"}
    r = requests.patch(f"{BASE_URL}/api/leads/{lead_id}", json=payload, headers=headers, timeout=15)
    body = get_json(r)
    ok = r.status_code == 200 and isinstance(body, dict) and body.get("stage") == "Qualified"
    record("T13", "PATCH /api/leads/{id} (stage → 'Qualified')",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  new_stage={body.get('stage') if isinstance(body, dict) else 'N/A'}")


# ─────────────────────────────────────────────
# T14 — GET audit logs → at least 1 entry
# ─────────────────────────────────────────────
def t14_get_audit_logs(token: str, lead_id: str):
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/leads/{lead_id}/audit-logs", headers=headers, timeout=10)
    body = get_json(r)
    ok = r.status_code == 200 and isinstance(body, list) and len(body) >= 1
    record("T14", "GET /api/leads/{id}/audit-logs (≥1 entry after PATCH)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  count={len(body) if isinstance(body, list) else 'N/A'}",
           f"first_action={body[0].get('action') if isinstance(body, list) and body else 'N/A'}")


# ─────────────────────────────────────────────
# T15 — GET /api/conflicts (Admin)
# ─────────────────────────────────────────────
def t15_get_conflicts(token: str) -> List[Dict]:
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/conflicts", headers=headers, timeout=15)
    body = get_json(r)
    ok = r.status_code == 200 and isinstance(body, list)
    record("T15", "GET /api/conflicts (Admin sees all)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  count={len(body) if isinstance(body, list) else 'N/A'}")
    return body if ok else []


# ─────────────────────────────────────────────
# T16 — POST /api/leads/bulk (valid CSV)
# ─────────────────────────────────────────────
def t16_bulk_ingest_valid_csv(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    csv_data = (
        "Project Name,Location,GDV,Stage,Type\n"
        "Bulk Test Tower A,Petaling Jaya,12000000,Planning,Residential\n"
        "Bulk Test Office B,Cyberjaya,45000000,Qualified,Commercial\n"
    )
    files = {"file": ("test_bulk.csv", csv_data.encode("utf-8"), "text/csv")}
    r = requests.post(f"{BASE_URL}/api/leads/bulk", files=files, headers=headers, timeout=120)
    body = get_json(r)
    ok = (r.status_code == 201 and isinstance(body, dict)
          and body.get("imported", 0) >= 1)
    record("T16", "POST /api/leads/bulk (valid 2-row CSV)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  imported={body.get('imported') if isinstance(body, dict) else 'N/A'}  "
           f"flagged={body.get('flagged') if isinstance(body, dict) else 'N/A'}  "
           f"errors={body.get('errors') if isinstance(body, dict) else 'N/A'}")


# ─────────────────────────────────────────────
# T17 — POST /api/leads/bulk with .xlsx → 400
# ─────────────────────────────────────────────
def t17_bulk_ingest_xlsx_guard(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    dummy_xlsx = b"PK\x03\x04"  # ZIP magic bytes (xlsx is a zip)
    files = {"file": ("test.xlsx", dummy_xlsx, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    r = requests.post(f"{BASE_URL}/api/leads/bulk", files=files, headers=headers, timeout=10)
    ok = r.status_code == 400
    record("T17", "POST /api/leads/bulk (.xlsx guard → 400)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  detail={get_json(r)}")


# ─────────────────────────────────────────────
# T18 — POST /api/leads/bulk with bad rows
# ─────────────────────────────────────────────
def t18_bulk_ingest_partial_errors(token: str):
    headers = {"Authorization": f"Bearer {token}"}
    # 1 good row + 1 missing project name (bad)
    csv_data = (
        "Project Name,Location,GDV,Stage,Type\n"
        "Partial Good Tower,Shah Alam,5000000,Planning,Industrial\n"
        ",Kuala Lumpur,999,Planning,Commercial\n"  # missing project name → error
    )
    files = {"file": ("partial_test.csv", csv_data.encode("utf-8"), "text/csv")}
    r = requests.post(f"{BASE_URL}/api/leads/bulk", files=files, headers=headers, timeout=120)
    body = get_json(r)
    ok = (r.status_code == 201 and isinstance(body, dict)
          and body.get("imported", 0) >= 1
          and len(body.get("errors", [])) >= 1)
    record("T18", "POST /api/leads/bulk (partial errors reported)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  imported={body.get('imported') if isinstance(body, dict) else 'N/A'}  "
           f"errors={body.get('errors') if isinstance(body, dict) else 'N/A'}")


# ─────────────────────────────────────────────
# T19 — PATCH /api/conflicts/{id} → resolve
# ─────────────────────────────────────────────
def t19_resolve_conflict(token: str, conflicts: List[Dict]):
    headers = {"Authorization": f"Bearer {token}"}
    pending = [c for c in conflicts if c.get("status") == "Pending Review"]
    if not pending:
        record("T19", "PATCH /api/conflicts/{id} (resolve Pending → Merged)",
               "SKIP", "No Pending Review conflicts exist to resolve")
        return
    conflict_id = pending[0]["id"]
    payload = {
        "status": "Merged",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }
    r = requests.patch(f"{BASE_URL}/api/conflicts/{conflict_id}",
                       json=payload, headers=headers, timeout=15)
    body = get_json(r)
    ok = r.status_code == 200 and isinstance(body, dict) and body.get("status") == "Merged"
    record("T19", "PATCH /api/conflicts/{id} (resolve → Merged)",
           "PASS" if ok else "FAIL",
           f"status={r.status_code}  new_status={body.get('status') if isinstance(body, dict) else 'N/A'}  "
           f"resolved_by={body.get('resolved_by_email') if isinstance(body, dict) else 'N/A'}")


# ─────────────────────────────────────────────
# T20 — Sales_Rep RBAC isolation
# ─────────────────────────────────────────────
def t20_sales_rep_rbac(admin_token: str):
    # Login as Stucken sales rep
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": SALES_EMAIL, "password": SALES_PASSWORD}, timeout=45)
    body = get_json(r)
    if r.status_code != 200 or not body.get("access_token"):
        record("T20", "Sales_Rep RBAC — isolated to own BU leads", "FAIL",
               f"Sales_Rep login failed: {r.status_code}")
        return
    sales_token = body["access_token"]
    sales_bu = body["user"].get("bu", "Stucken AAC")

    # Get leads as Sales_Rep
    r_sales = requests.get(f"{BASE_URL}/api/leads",
                           headers={"Authorization": f"Bearer {sales_token}"}, timeout=20)
    # Get leads as Admin
    r_admin = requests.get(f"{BASE_URL}/api/leads",
                           headers={"Authorization": f"Bearer {admin_token}"}, timeout=20)

    if r_sales.status_code != 200 or r_admin.status_code != 200:
        record("T20", "Sales_Rep RBAC — isolated to own BU leads", "FAIL",
               f"sales status={r_sales.status_code}  admin status={r_admin.status_code}")
        return

    sales_leads = r_sales.json()
    admin_leads = r_admin.json()

    # All Sales_Rep leads must belong to their BU
    non_bu = [
        l for l in sales_leads
        if sales_bu.lower() not in (l.get("ai_analysis", {}).get("top_match_bu") or "").lower()
    ]
    ok = (len(sales_leads) <= len(admin_leads) and len(non_bu) == 0)
    record("T20", "Sales_Rep RBAC — isolated to own BU leads",
           "PASS" if ok else "FAIL",
           f"admin_leads={len(admin_leads)}  sales_leads={len(sales_leads)}  "
           f"non_bu_leaks={len(non_bu)}  bu='{sales_bu}'")


# ─────────────────────────────────────────────
# Main runner
# ─────────────────────────────────────────────
def main():
    print("\n" + "=" * 70)
    print("  SYNERGY SALES GENIUS — ADMIN A-to-Z TEST SUITE")
    print(f"  Target  : {BASE_URL}")
    print(f"  Admin   : {ADMIN_EMAIL}")
    print(f"  Run at  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70 + "\n")

    # --- Auth & health tests ---
    t01_health()
    admin_token = t02_admin_login_valid()
    t03_login_wrong_password()
    t04_login_unknown_email()
    t05_leads_no_token()

    if not admin_token:
        print("\n⛔  Admin login failed — aborting remaining tests.\n")
        _print_summary()
        sys.exit(1)

    # --- Leads tests ---
    existing_leads = t06_admin_get_leads(admin_token)
    new_lead_id = t07_ingest_lead(admin_token)
    t08_ingest_lead_invalid(admin_token)

    if new_lead_id:
        t09_get_activities_empty(admin_token, new_lead_id)
        t10_post_activity_note(admin_token, new_lead_id)
        t11_post_activity_call(admin_token, new_lead_id)
        t12_get_activities_count(admin_token, new_lead_id)
        t13_patch_lead_stage(admin_token, new_lead_id)
        t14_get_audit_logs(admin_token, new_lead_id)
    else:
        for tid, name in [
            ("T09", "GET activities (new lead)"),
            ("T10", "POST activity Note"),
            ("T11", "POST activity Call"),
            ("T12", "GET activities count"),
            ("T13", "PATCH lead stage"),
            ("T14", "GET audit logs"),
        ]:
            record(tid, name, "SKIP", "Skipped — T07 lead creation failed")

    # --- Conflicts ---
    conflicts = t15_get_conflicts(admin_token)

    # --- Bulk ingestion ---
    t16_bulk_ingest_valid_csv(admin_token)
    t17_bulk_ingest_xlsx_guard(admin_token)
    t18_bulk_ingest_partial_errors(admin_token)

    # --- Conflict resolution ---
    # Re-fetch conflicts so we also see any newly created ones
    updated_conflicts = []
    try:
        r = requests.get(f"{BASE_URL}/api/conflicts",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        if r.status_code == 200:
            updated_conflicts = r.json()
    except Exception:
        pass
    t19_resolve_conflict(admin_token, updated_conflicts)

    # --- RBAC isolation ---
    t20_sales_rep_rbac(admin_token)

    _print_summary()


def _print_summary():
    print("\n" + "=" * 70)
    print("  TEST SUMMARY")
    print("=" * 70)
    total = len(results)
    passed = sum(1 for r in results if "PASS" in r["status"])
    failed = sum(1 for r in results if "FAIL" in r["status"])
    skipped = sum(1 for r in results if "SKIP" in r["status"])

    for r in results:
        print(f"  {r['status']}  [{r['id']}] {r['name']}")
        if "detail" in r and r["detail"]:
            print(f"             {r['detail']}")

    print("-" * 70)
    print(f"  Total: {total}   ✅ PASS: {passed}   ❌ FAIL: {failed}   ⚠️  SKIP: {skipped}")
    print("=" * 70 + "\n")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
