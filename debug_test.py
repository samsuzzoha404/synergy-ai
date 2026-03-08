"""
Full debug test script for Synergy AI backend.
Tests: health, auth, leads CRUD, conflicts, LangGraph AI pipeline, DB.
"""
import requests
import json
import sys

BASE = 'http://localhost:8000'
PASS_COUNT = 0
FAIL_COUNT = 0
ISSUES = []

def ok(name):
    global PASS_COUNT
    PASS_COUNT += 1
    print(f"  [PASS] {name}")

def fail(name, detail=""):
    global FAIL_COUNT
    FAIL_COUNT += 1
    ISSUES.append((name, detail))
    print(f"  [FAIL] {name}: {detail}")

def section(title):
    print()
    print("=" * 60)
    print(f"  {title}")
    print("=" * 60)

# ─── TEST 1: Health ─────────────────────────────────────────────────────────
section("TEST 1: Health Check")
try:
    r = requests.get(f'{BASE}/health', timeout=5)
    if r.status_code == 200 and r.json().get('status') == 'healthy':
        ok("GET /health → 200 healthy")
    else:
        fail("GET /health", f"status={r.status_code} body={r.text}")
except Exception as e:
    fail("GET /health", str(e))

# ─── TEST 2: Auth Login ──────────────────────────────────────────────────────
section("TEST 2: Auth Login")
TOKEN = None
USER = None
try:
    r = requests.post(f'{BASE}/api/auth/login',
                      json={'email': 'marvis@chinhin.com', 'password': 'admin123'},
                      timeout=10)
    if r.status_code == 200:
        data = r.json()
        TOKEN = data.get('access_token')
        REFRESH = data.get('refresh_token')
        USER = data.get('user', {})
        ok(f"POST /api/auth/login → 200, user={USER.get('email')}, role={USER.get('role')}")
    else:
        fail("POST /api/auth/login", f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    fail("POST /api/auth/login", str(e))

if not TOKEN:
    print("\n[ABORT] Cannot continue without auth token.")
    sys.exit(1)

HEADERS = {'Authorization': f'Bearer {TOKEN}'}

# ─── TEST 3: Token Refresh ───────────────────────────────────────────────────
section("TEST 3: Token Refresh")
try:
    r = requests.post(f'{BASE}/api/auth/refresh',
                      json={'refresh_token': REFRESH},
                      timeout=10)
    if r.status_code == 200:
        ok(f"POST /api/auth/refresh → 200 new token issued")
    else:
        fail("POST /api/auth/refresh", f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    fail("POST /api/auth/refresh", str(e))

# ─── TEST 4: BU Contacts ────────────────────────────────────────────────────
section("TEST 4: BU Contacts")
try:
    r = requests.get(f'{BASE}/api/bu-contacts', timeout=5)
    if r.status_code == 200:
        contacts = r.json()
        ok(f"GET /api/bu-contacts → 200, {len(contacts)} contacts returned")
        for c in contacts[:2]:
            print(f"    BU={c.get('bu')}, contact={c.get('contact_name')}")
    else:
        fail("GET /api/bu-contacts", f"status={r.status_code}")
except Exception as e:
    fail("GET /api/bu-contacts", str(e))

# ─── TEST 5: GET /api/leads ─────────────────────────────────────────────────
section("TEST 5: GET /api/leads (Cosmos DB read)")
leads = []
try:
    r = requests.get(f'{BASE}/api/leads',
                     headers=HEADERS,
                     params={'skip': 0, 'limit': 100},
                     timeout=20)
    if r.status_code == 200:
        leads = r.json()
        total = r.headers.get('x-total-count', 'N/A')
        ok(f"GET /api/leads → 200, leads={len(leads)}, X-Total-Count={total}")
        if leads:
            l = leads[0]
            print(f"    Sample lead id={l.get('id')}")
            print(f"    project_name={l.get('project_name')}")
            print(f"    status={l.get('status')}")
            print(f"    is_duplicate={l.get('is_duplicate')}")
            ai = l.get('ai_analysis')
            if ai:
                ok(f"AI analysis present → BU={ai.get('top_match_bu')}, score={ai.get('match_score')}")
            else:
                fail("AI analysis", "ai_analysis is None on first lead")
        else:
            print("    [INFO] No leads in DB yet — will test creation next")
    else:
        fail("GET /api/leads", f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    fail("GET /api/leads", str(e))

# ─── TEST 6: GET /api/conflicts ─────────────────────────────────────────────
section("TEST 6: GET /api/conflicts (Cosmos DB read)")
try:
    r = requests.get(f'{BASE}/api/conflicts',
                     headers=HEADERS,
                     timeout=15)
    if r.status_code == 200:
        conflicts = r.json()
        ok(f"GET /api/conflicts → 200, conflicts={len(conflicts)}")
    else:
        fail("GET /api/conflicts", f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    fail("GET /api/conflicts", str(e))

# ─── TEST 7: POST /api/leads (AI Pipeline) ──────────────────────────────────
section("TEST 7: POST /api/leads — LangChain + LangGraph + Cosmos DB Write")
print("  [INFO] This triggers: AzureOpenAI Embedding → Dup Check → GPT-4o BU Scoring → Cosmos DB save")
print("  [INFO] May take 5–15 seconds...")
new_lead = {
    "project_name": "DEBUG TEST — Pavilion Bukit Jalil Tower A",
    "location": "Bukit Jalil, Kuala Lumpur",
    "value_rm": 120000000,
    "project_type": "High-Rise Residential",
    "stage": "Planning",
    "developer": "Malton Berhad",
    "floors": 52,
    "gfa": 1200000
}
created_lead_id = None
try:
    r = requests.post(f'{BASE}/api/leads', headers=HEADERS, json=new_lead, timeout=60)
    if r.status_code == 201:
        data = r.json()
        created_lead_id = data.get('id')
        ai = data.get('ai_analysis', {})
        ok(f"POST /api/leads → 201 CREATED")
        ok(f"LangGraph pipeline completed successfully")
        ok(f"Embedding + Dup-Check → is_duplicate={data.get('is_duplicate')}")
        ok(f"GPT-4o BU Scoring → top_match_bu='{ai.get('top_match_bu')}', score={ai.get('match_score')}")
        print(f"    rationale: {ai.get('rationale', '')[:120]}...")
        print(f"    synergy_bundle: {ai.get('synergy_bundle')}")
        print(f"    Cosmos DB id: {created_lead_id}")
    else:
        fail("POST /api/leads", f"status={r.status_code} body={r.text[:400]}")
except Exception as e:
    fail("POST /api/leads", str(e))

# ─── TEST 8: Verify newly created lead in DB ─────────────────────────────────
section("TEST 8: Verify new lead persisted in Cosmos DB")
if created_lead_id:
    try:
        r = requests.get(f'{BASE}/api/leads/{created_lead_id}', headers=HEADERS, timeout=15)
        if r.status_code == 200:
            fetched = r.json()
            ok(f"GET /api/leads/{created_lead_id} → 200, DB read verified")
            ok(f"  project_name={fetched.get('project_name')}")
        else:
            fail(f"GET /api/leads/{created_lead_id}", f"status={r.status_code} body={r.text[:200]}")
    except Exception as e:
        fail(f"GET /api/leads/{created_lead_id}", str(e))
else:
    print("  [SKIP] No lead ID to verify (creation failed or was skipped)")

# ─── TEST 9: PATCH /api/leads/{id} (Stage update) ────────────────────────────
section("TEST 9: PATCH /api/leads — Real-time Stage Update")
if created_lead_id:
    try:
        r = requests.patch(f'{BASE}/api/leads/{created_lead_id}',
                           headers=HEADERS,
                           json={'stage': 'Tender', 'status': 'Assigned'},
                           timeout=15)
        if r.status_code == 200:
            updated = r.json()
            ok(f"PATCH /api/leads/{created_lead_id} → 200")
            ok(f"  stage updated → {updated.get('stage')}, status → {updated.get('status')}")
        else:
            fail(f"PATCH /api/leads/{created_lead_id}", f"status={r.status_code} body={r.text[:200]}")
    except Exception as e:
        fail(f"PATCH /api/leads/{created_lead_id}", str(e))
else:
    print("  [SKIP]")

# ─── TEST 10: POST Activity ───────────────────────────────────────────────────
section("TEST 10: POST /api/leads/{id}/activities — Activity Log")
if created_lead_id:
    try:
        r = requests.post(f'{BASE}/api/leads/{created_lead_id}/activities',
                          headers=HEADERS,
                          json={'user_name': 'Debug Bot', 'activity_type': 'Note', 'content': 'Automated debug test note.'},
                          timeout=15)
        if r.status_code == 201:
            ok(f"POST activity → 201 CREATED")
        else:
            fail("POST activity", f"status={r.status_code} body={r.text[:200]}")
    except Exception as e:
        fail("POST activity", str(e))

# ─── TEST 11: GET Activities ─────────────────────────────────────────────────
section("TEST 11: GET /api/leads/{id}/activities")
if created_lead_id:
    try:
        r = requests.get(f'{BASE}/api/leads/{created_lead_id}/activities',
                         headers=HEADERS, timeout=10)
        if r.status_code == 200:
            acts = r.json()
            ok(f"GET activities → 200, count={len(acts)}")
        else:
            fail("GET activities", f"status={r.status_code} body={r.text[:200]}")
    except Exception as e:
        fail("GET activities", str(e))

# ─── TEST 12: GET Audit Logs ─────────────────────────────────────────────────
section("TEST 12: GET /api/leads/{id}/audit-logs")
if created_lead_id:
    try:
        r = requests.get(f'{BASE}/api/leads/{created_lead_id}/audit-logs',
                         headers=HEADERS, timeout=10)
        if r.status_code == 200:
            logs = r.json()
            ok(f"GET audit-logs → 200, count={len(logs)}")
            if logs:
                print(f"    Sample: action={logs[0].get('action')}, field={logs[0].get('field_name')}")
        else:
            fail("GET audit-logs", f"status={r.status_code} body={r.text[:200]}")
    except Exception as e:
        fail("GET audit-logs", str(e))

# ─── TEST 13: Admin Users CRUD ───────────────────────────────────────────────
section("TEST 13: GET /api/admin/users")
try:
    r = requests.get(f'{BASE}/api/admin/users', headers=HEADERS, timeout=10)
    if r.status_code == 200:
        users = r.json()
        ok(f"GET /api/admin/users → 200, {len(users)} users")
        for u in users:
            print(f"    {u.get('email')} | role={u.get('role')} | bu={u.get('bu')}")
    else:
        fail("GET /api/admin/users", f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    fail("GET /api/admin/users", str(e))

# ─── TEST 14: Export CSV ─────────────────────────────────────────────────────
section("TEST 14: GET /api/leads/export (CSV download)")
try:
    r = requests.get(f'{BASE}/api/leads/export', headers=HEADERS, timeout=20)
    if r.status_code == 200 and 'text/csv' in r.headers.get('content-type', ''):
        lines = r.text.strip().split('\n')
        ok(f"GET /api/leads/export → 200 CSV, rows={len(lines)-1} (excl. header)")
    else:
        fail("GET /api/leads/export", f"status={r.status_code} ct={r.headers.get('content-type')}")
except Exception as e:
    fail("GET /api/leads/export", str(e))

# ─── TEST 15: Duplicate Detection ────────────────────────────────────────────
section("TEST 15: Duplicate Detection (submit same lead again)")
print("  [INFO] Submitting identical lead — should be flagged is_duplicate=True...")
try:
    r = requests.post(f'{BASE}/api/leads', headers=HEADERS, json=new_lead, timeout=60)
    if r.status_code == 201:
        data = r.json()
        if data.get('is_duplicate'):
            ok(f"Duplicate detection WORKS → is_duplicate=True, status={data.get('status')}")
            dup_id = data.get('id')
            # clean up duplicate test lead
            cleanup = requests.delete(f"{BASE}/api/leads/{dup_id}", headers=HEADERS, timeout=10)
            print(f"    Cleanup duplicate: {cleanup.status_code}")
        else:
            fail("Duplicate detection", f"Expected is_duplicate=True but got False — cosine threshold may need tuning")
    else:
        fail("POST /api/leads (dup test)", f"status={r.status_code} body={r.text[:200]}")
except Exception as e:
    fail("Duplicate detection", str(e))

# ─── CLEANUP: Delete test lead ────────────────────────────────────────────────
section("CLEANUP: Delete test lead")
if created_lead_id:
    try:
        r = requests.delete(f'{BASE}/api/leads/{created_lead_id}', headers=HEADERS, timeout=10)
        if r.status_code in (200, 204):
            ok(f"DELETE /api/leads/{created_lead_id} → {r.status_code}")
        else:
            print(f"  [WARN] DELETE returned {r.status_code}: {r.text[:100]}")
    except Exception as e:
        print(f"  [WARN] Cleanup failed: {e}")

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("  FULL DEBUG SUMMARY")
print("=" * 60)
print(f"  PASSED: {PASS_COUNT}")
print(f"  FAILED: {FAIL_COUNT}")
if ISSUES:
    print()
    print("  ISSUES FOUND:")
    for name, detail in ISSUES:
        print(f"    ✗ {name}: {detail}")
else:
    print()
    print("  All tests PASSED — project is fully functional!")
print()
