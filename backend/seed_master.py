"""
seed_master.py — One-Time Master Seed Script for Synergy Sales Genius
======================================================================
Migrates the app from a Hybrid Data Strategy (Mock + Real) to a
100% Real Database Strategy by permanently seeding Azure Cosmos DB with:

  1. 8 demo users (with bcrypt-hashed passwords)
  2. 37 realistic mock leads (with 1536-dim OpenAI embeddings)

Usage (run from the `backend/` directory with the venv activated):
  python seed_master.py

⚠️  WARNING: This script calls Azure OpenAI for each lead to generate
    semantic embeddings. Costs ~37 embedding API calls. A 0.5-second
    sleep is added between calls to avoid Rate Limit (429) errors.

Environment Variables Required (same as main.py):
  AZURE_COSMOS_ENDPOINT, AZURE_COSMOS_KEY,
  AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, AZURE_OPENAI_API_VERSION,
  AZURE_EMBEDDING_DEPLOYMENT_NAME (default: text-embedding-3-small)
"""

from __future__ import annotations

import sys
import time
import uuid
from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Ensure the backend directory is on the Python path so local imports work
# when this script is invoked directly (e.g., python seed_master.py).
# ---------------------------------------------------------------------------
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------------------
# Local imports — these share the same Cosmos DB singleton as main.py
# ---------------------------------------------------------------------------
from auth import get_password_hash          # bcrypt hashing
from ai_engine import generate_embedding    # Azure OpenAI text-embedding-3-small
import database                             # save_user(), save_lead(), users_container

# ===========================================================================
# SECTION 1 — DEMO USERS
# 8 hackathon accounts across all 7 BUs + 1 Admin
# ===========================================================================

_DEMO_USERS: List[Dict[str, Any]] = [
    {
        "email": "marvis@chinhin.com",
        "name": "Marvis",
        "role": "Admin",
        "bu": None,
        "password": "admin123",
    },
    {
        "email": "sales@stucken.com",
        "name": "Sales Rep (Stucken AAC)",
        "role": "Sales_Rep",
        "bu": "Stucken AAC",
        "password": "sales123",
    },
    {
        "email": "sales@ajiya.com",
        "name": "Sales Rep (Ajiya Metal/Glass)",
        "role": "Sales_Rep",
        "bu": "Ajiya Metal / Glass",
        "password": "sales123",
    },
    {
        "email": "sales@gcast.com",
        "name": "Sales Rep (G-Cast)",
        "role": "Sales_Rep",
        "bu": "G-Cast",
        "password": "sales123",
    },
    {
        "email": "sales@signature.com",
        "name": "Sales Rep (Signature Alliance)",
        "role": "Sales_Rep",
        "bu": "Signature Alliance",
        "password": "sales123",
    },
    {
        "email": "sales@kitchen.com",
        "name": "Sales Rep (Signature Kitchen)",
        "role": "Sales_Rep",
        "bu": "Signature Kitchen",
        "password": "sales123",
    },
    {
        "email": "sales@fiamma.com",
        "name": "Sales Rep (Fiamma Holding)",
        "role": "Sales_Rep",
        "bu": "Fiamma Holding",
        "password": "sales123",
    },
    {
        "email": "sales@ppghing.com",
        "name": "Sales Rep (PPG Hing)",
        "role": "Sales_Rep",
        "bu": "PPG Hing",
        "password": "sales123",
    },
]


def seed_users() -> int:
    """
    Upsert 8 demo users into the Cosmos DB Users container.
    Passwords are bcrypt-hashed before persistence — plaintext is never stored.

    Returns:
        Number of users successfully upserted.
    """
    print("\n" + "=" * 60)
    print("  PHASE 1 — SEEDING USERS")
    print("=" * 60)

    seeded = 0
    for demo in _DEMO_USERS:
        doc: Dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "email": demo["email"],
            "name": demo["name"],
            "role": demo["role"],
            "bu": demo["bu"],
            "hashed_password": get_password_hash(demo["password"]),
        }
        try:
            database.save_user(doc)
            print(f"  ✓ User upserted — {doc['email']} ({doc['role']})")
            seeded += 1
        except Exception as exc:
            print(f"  ✗ FAILED to upsert user {doc['email']}: {exc}")

    print(f"\n  → {seeded}/{len(_DEMO_USERS)} users seeded successfully.")
    return seeded


# ===========================================================================
# SECTION 2 — MOCK LEADS (translated from src/data/mockData.ts)
#
# Each lead matches the LeadDB schema so GET /api/leads can deserialise it.
# Fields:
#   id             — stable string ID (e.g., "L001") used as Cosmos partition key
#   project_name   — project display name
#   location       — city + state
#   value_rm       — project value in RM (integer)
#   project_type   — High-Rise | Commercial | Industrial | Infrastructure | Renovation
#   stage          — Planning | Tender | Construction | Completed
#   status         — New | In Review | Under Review | Assigned | Won | Lost | Duplicate Alert
#   is_duplicate   — bool
#   ai_analysis    — nested dict: top_match_bu, match_score, rationale, synergy_bundle
#   developer      — developer/owner company name
#   floors         — optional storey count
#   gfa            — optional gross floor area (m²)
#   assigned_to    — optional Sales Rep name
#   created_date   — ISO date string
#   vector         — populated at runtime by generate_embedding()
# ===========================================================================

_MOCK_LEADS: List[Dict[str, Any]] = [

    # ── STUCKEN AAC ────────────────────────────────────────────
    {
        "id": "L001",
        "project_name": "Avantro Residences Phase 2",
        "location": "Mont Kiara, KL",
        "value_rm": 68_000_000,
        "project_type": "High-Rise",
        "stage": "Tender",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Avantro Development Sdn Bhd",
        "floors": 42,
        "gfa": 85000,
        "assigned_to": "Ahmad Razif",
        "created_date": "2025-06-01",
        "ai_analysis": {
            "top_match_bu": "Stucken AAC",
            "match_score": 92,
            "rationale": (
                "Based on 47 historical High-Rise projects in Mont Kiara & KL Sentral corridor, "
                "AAC lightweight blocks are specified in 89% of cases. Glass facade demand is driven "
                "by GBI certification requirements. Cross-selling Signature Kitchen has yielded "
                "RM 3.2M in additional revenue from similar projects."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass", "Signature Kitchen", "Fiamma Holding"],
        },
    },
    {
        "id": "L002",
        "project_name": "Twin Towers Grand Reno",
        "location": "KLCC, KL",
        "value_rm": 98_000_000,
        "project_type": "High-Rise",
        "stage": "Construction",
        "status": "Duplicate Alert",
        "is_duplicate": True,
        "developer": "Petronas Properties Sdn Bhd",
        "floors": 88,
        "gfa": 400000,
        "created_date": "2025-06-08",
        "ai_analysis": {
            "top_match_bu": "Stucken AAC",
            "match_score": 88,
            "rationale": (
                "Large-scale renovation of iconic towers requires premium-grade fire-rated materials. "
                "Stucken's specialty AAC products are certified for this class of building under MS1722."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass"],
        },
    },
    {
        "id": "L003",
        "project_name": "Iskandar Waterfront Residences",
        "location": "Johor Bahru, Johor",
        "value_rm": 220_000_000,
        "project_type": "High-Rise",
        "stage": "Planning",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Iskandar Waterfront Holdings",
        "floors": 56,
        "gfa": 210000,
        "assigned_to": "Tan Wei Ming",
        "created_date": "2025-06-10",
        "ai_analysis": {
            "top_match_bu": "Stucken AAC",
            "match_score": 90,
            "rationale": (
                "High-value waterfront projects in Iskandar are Singapore-standard in specification. "
                "Premium AAC blocks and curtain wall systems are near-universal for this segment."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass", "Signature Kitchen"],
        },
    },
    {
        "id": "L004",
        "project_name": "Pavilion Damansara Heights Residences",
        "location": "Damansara Heights, KL",
        "value_rm": 85_000_000,
        "project_type": "High-Rise",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Pavilion Group Sdn Bhd",
        "floors": 52,
        "gfa": 118000,
        "created_date": "2025-07-01",
        "ai_analysis": {
            "top_match_bu": "Stucken AAC",
            "match_score": 91,
            "rationale": (
                "High-end residential towers in Damansara Heights command premium specifications. "
                "AAC lightweight blocks reduce structural load, enabling taller builds. "
                "Kitchen and appliance bundles are standard for GBI-certified luxury condos."
            ),
            "synergy_bundle": ["Signature Kitchen", "Fiamma Holding"],
        },
    },
    {
        "id": "L005",
        "project_name": "Tropicana Aman Parcel J",
        "location": "Kota Kemuning, Selangor",
        "value_rm": 62_000_000,
        "project_type": "High-Rise",
        "stage": "Tender",
        "status": "Assigned",
        "is_duplicate": False,
        "developer": "Tropicana Corporation Bhd",
        "floors": 38,
        "gfa": 92000,
        "assigned_to": "Nurul Aina",
        "created_date": "2025-07-05",
        "ai_analysis": {
            "top_match_bu": "Stucken AAC",
            "match_score": 87,
            "rationale": (
                "Tropicana residential parcels historically adopt AAC blocks for 91% of their high-rise towers. "
                "Kitchen packages from Signature yield strong bundled margins."
            ),
            "synergy_bundle": ["Signature Kitchen", "Fiamma Holding"],
        },
    },
    {
        "id": "L006",
        "project_name": "M Vertica Phase 3 — Tower B",
        "location": "Cheras, KL",
        "value_rm": 75_000_000,
        "project_type": "High-Rise",
        "stage": "Construction",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Mah Sing Group Bhd",
        "floors": 45,
        "gfa": 102000,
        "created_date": "2025-07-10",
        "ai_analysis": {
            "top_match_bu": "Stucken AAC",
            "match_score": 89,
            "rationale": (
                "Mah Sing's M-series towers are AAC-first by internal specification mandate. "
                "Phase 3 construction offers prime window for early material binding."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass", "Fiamma Holding"],
        },
    },

    # ── AJIYA METAL / GLASS ────────────────────────────────────
    {
        "id": "L007",
        "project_name": "Menara SkyTech KL Sentral",
        "location": "KL Sentral, KL",
        "value_rm": 55_000_000,
        "project_type": "Commercial",
        "stage": "Tender",
        "status": "New",
        "is_duplicate": False,
        "developer": "KL Sentral Development Sdn Bhd",
        "floors": 35,
        "gfa": 96000,
        "created_date": "2025-06-15",
        "ai_analysis": {
            "top_match_bu": "Ajiya Metal / Glass",
            "match_score": 93,
            "rationale": (
                "Grade-A commercial towers in KL Sentral demand full curtain wall glazing for corporate image. "
                "Ajiya's low-e glass is LEED Gold compatible — mandatory for this precinct."
            ),
            "synergy_bundle": ["Signature Alliance", "Stucken AAC"],
        },
    },
    {
        "id": "L008",
        "project_name": "KL Eco City Tower C",
        "location": "KL Eco City, KL",
        "value_rm": 175_000_000,
        "project_type": "Commercial",
        "stage": "Construction",
        "status": "Won",
        "is_duplicate": False,
        "developer": "SP Setia Bhd",
        "floors": 38,
        "gfa": 155000,
        "assigned_to": "Farah Nadia",
        "created_date": "2025-05-20",
        "ai_analysis": {
            "top_match_bu": "Ajiya Metal / Glass",
            "match_score": 91,
            "rationale": (
                "Green-rated commercial towers in KL Eco City demand Low-E glass for LEED compliance. "
                "Ajiya's thermal glass portfolio has 100% track record here."
            ),
            "synergy_bundle": ["Stucken AAC", "Signature Alliance"],
        },
    },
    {
        "id": "L009",
        "project_name": "Subang SkyPark Terminal 3 Extension",
        "location": "Subang, Selangor",
        "value_rm": 58_000_000,
        "project_type": "Commercial",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Subang Skypark Sdn Bhd",
        "floors": 4,
        "gfa": 48000,
        "created_date": "2025-06-20",
        "ai_analysis": {
            "top_match_bu": "Ajiya Metal / Glass",
            "match_score": 89,
            "rationale": (
                "Aviation terminal extensions require large-span structural glass and metal roofing systems. "
                "Ajiya holds the DCA-approved supplier certification for this category."
            ),
            "synergy_bundle": ["G-Cast"],
        },
    },
    {
        "id": "L010",
        "project_name": "Gamuda Cove Retail & Lifestyle Hub",
        "location": "Puncak Alam, Selangor",
        "value_rm": 38_000_000,
        "project_type": "Commercial",
        "stage": "Tender",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Gamuda Land Sdn Bhd",
        "floors": 5,
        "gfa": 62000,
        "created_date": "2025-07-02",
        "ai_analysis": {
            "top_match_bu": "Ajiya Metal / Glass",
            "match_score": 85,
            "rationale": (
                "Gamuda developments favour ACP cladding for distinct branding. "
                "Ajiya's MetalCoat series has been specified on 4 previous Gamuda commercial projects."
            ),
            "synergy_bundle": ["Signature Alliance", "PPG Hing"],
        },
    },
    {
        "id": "L011",
        "project_name": "Selangor Science Park Factory Block D",
        "location": "Shah Alam, Selangor",
        "value_rm": 26_000_000,
        "project_type": "Industrial",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Scientex Bhd",
        "floors": 4,
        "gfa": 22000,
        "created_date": "2025-07-08",
        "ai_analysis": {
            "top_match_bu": "Ajiya Metal / Glass",
            "match_score": 82,
            "rationale": (
                "Industrial factories in Shah Alam Science Park adopt metal roofing in 97% of builds. "
                "Ajiya's IBR profile is the market-leading supplier for PKNS-linked industrial estates."
            ),
            "synergy_bundle": ["G-Cast"],
        },
    },
    {
        "id": "L012",
        "project_name": "Port Klang Mega Warehouse Complex",
        "location": "Port Klang, Selangor",
        "value_rm": 22_000_000,
        "project_type": "Industrial",
        "stage": "Construction",
        "status": "Assigned",
        "is_duplicate": False,
        "developer": "Westports Holdings Bhd",
        "floors": 3,
        "gfa": 38000,
        "assigned_to": "Harvin Singh",
        "created_date": "2025-07-12",
        "ai_analysis": {
            "top_match_bu": "Ajiya Metal / Glass",
            "match_score": 80,
            "rationale": (
                "Port logistics warehouses require corrosion-resistant colour-coated roofing. "
                "Ajiya's marine-grade panel coating is certified for salt-air environments."
            ),
            "synergy_bundle": ["PPG Hing"],
        },
    },

    # ── G-CAST ─────────────────────────────────────────────────
    {
        "id": "L013",
        "project_name": "MRT3 Circle Line — Sunway Section Viaduct",
        "location": "Petaling Jaya, Selangor",
        "value_rm": 280_000_000,
        "project_type": "Infrastructure",
        "stage": "Tender",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Mass Rapid Transit Corp Sdn Bhd",
        "created_date": "2025-06-18",
        "ai_analysis": {
            "top_match_bu": "G-Cast",
            "match_score": 96,
            "rationale": (
                "MRT precast viaduct projects exclusively use certified precast U-beams. "
                "G-Cast holds MRT Corp's preferred vendor status for all Circle Line contracts, "
                "backed by RM 890M delivered across MRT1 & MRT2."
            ),
            "synergy_bundle": ["Stucken AAC"],
        },
    },
    {
        "id": "L014",
        "project_name": "Putrajaya Federal Administrative Complex",
        "location": "Putrajaya, WP Putrajaya",
        "value_rm": 310_000_000,
        "project_type": "Infrastructure",
        "stage": "Tender",
        "status": "New",
        "is_duplicate": False,
        "developer": "Jabatan Kerja Raya Malaysia",
        "floors": 20,
        "gfa": 320000,
        "created_date": "2025-06-12",
        "ai_analysis": {
            "top_match_bu": "G-Cast",
            "match_score": 88,
            "rationale": (
                "JKR infrastructure projects above RM 300M mandate CIDB-certified local precast "
                "for structural speed. G-Cast has won 7 of the last 9 federal tenders in Putrajaya precinct."
            ),
            "synergy_bundle": ["Stucken AAC"],
        },
    },
    {
        "id": "L015",
        "project_name": "Penang Second Bridge Southern Approach Viaduct",
        "location": "Batu Kawan, Penang",
        "value_rm": 450_000_000,
        "project_type": "Infrastructure",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Penang Development Corporation",
        "created_date": "2025-07-03",
        "ai_analysis": {
            "top_match_bu": "G-Cast",
            "match_score": 94,
            "rationale": (
                "Marine bridge projects of this scale mandate pre-stressed precast box girders. "
                "G-Cast is one of only 2 CIDB Grade 7-certified precast suppliers in Malaysia "
                "with sea-zone coating capability."
            ),
            "synergy_bundle": [],
        },
    },
    {
        "id": "L016",
        "project_name": "LRT3 Bandar Utama Station Expansion",
        "location": "Petaling Jaya, Selangor",
        "value_rm": 190_000_000,
        "project_type": "Infrastructure",
        "stage": "Construction",
        "status": "Assigned",
        "is_duplicate": False,
        "developer": "Prasarana Malaysia Bhd",
        "assigned_to": "Rizal Hakim",
        "created_date": "2025-06-25",
        "ai_analysis": {
            "top_match_bu": "G-Cast",
            "match_score": 91,
            "rationale": (
                "LRT station expansion requires precast platform slabs and retaining structures "
                "that can be installed within tight rail-possession windows. "
                "G-Cast's just-in-time delivery model is critical here."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass"],
        },
    },
    {
        "id": "L017",
        "project_name": "Batu Pahat Flood Mitigation Barrage",
        "location": "Batu Pahat, Johor",
        "value_rm": 125_000_000,
        "project_type": "Infrastructure",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Jabatan Pengairan dan Saliran Johor",
        "created_date": "2025-07-15",
        "ai_analysis": {
            "top_match_bu": "G-Cast",
            "match_score": 86,
            "rationale": (
                "DID flood infrastructure projects mandate precast concrete box culverts "
                "for speed and water-tightness. G-Cast's culvert systems have a 15-year track record "
                "with JPS nationwide."
            ),
            "synergy_bundle": [],
        },
    },

    # ── SIGNATURE ALLIANCE ─────────────────────────────────────
    {
        "id": "L018",
        "project_name": "CIMB Group KL Sentral HQ — Full Floor Fit-Out",
        "location": "KL Sentral, KL",
        "value_rm": 12_500_000,
        "project_type": "Commercial",
        "stage": "Tender",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "CIMB Group Holdings Bhd",
        "floors": 3,
        "gfa": 14000,
        "assigned_to": "Sherene Lim",
        "created_date": "2025-06-22",
        "ai_analysis": {
            "top_match_bu": "Signature Alliance",
            "match_score": 94,
            "rationale": (
                "Banking sector fit-outs require Grade-A raised access flooring for data cable management. "
                "Signature Alliance's CIMB track record (3 previous floors) gives high conversion probability."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass"],
        },
    },
    {
        "id": "L019",
        "project_name": "Sime Darby Regional Office — Section 16 PJ",
        "location": "Petaling Jaya, Selangor",
        "value_rm": 8_200_000,
        "project_type": "Commercial",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Sime Darby Property Bhd",
        "floors": 2,
        "gfa": 9500,
        "created_date": "2025-07-01",
        "ai_analysis": {
            "top_match_bu": "Signature Alliance",
            "match_score": 89,
            "rationale": (
                "Plantation and property conglomerates consistently opt for Signature Alliance's "
                "mid-premium interior package — strong corporate brand alignment with neutral "
                "BIM-ready specifications."
            ),
            "synergy_bundle": [],
        },
    },
    {
        "id": "L020",
        "project_name": "Pavilion Hotel KLCC Lobby & Ballroom Reno",
        "location": "KLCC, KL",
        "value_rm": 6_800_000,
        "project_type": "Renovation",
        "stage": "Construction",
        "status": "Assigned",
        "is_duplicate": False,
        "developer": "Urusharta Cemerlang Sdn Bhd",
        "assigned_to": "Elaine Koh",
        "created_date": "2025-06-28",
        "ai_analysis": {
            "top_match_bu": "Signature Alliance",
            "match_score": 92,
            "rationale": (
                "5-star hotel lobby renovations demand bespoke millwork and large-format stone tiles. "
                "Signature Alliance holds 3 active hotel references — strong conversion signal."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass"],
        },
    },
    {
        "id": "L021",
        "project_name": "EcoWorld Commercial Park Phase 2 — Interiors",
        "location": "Eco Botanic, Johor Bahru",
        "value_rm": 14_000_000,
        "project_type": "Commercial",
        "stage": "Tender",
        "status": "New",
        "is_duplicate": False,
        "developer": "Eco World Development Group Bhd",
        "floors": 5,
        "gfa": 16000,
        "created_date": "2025-07-09",
        "ai_analysis": {
            "top_match_bu": "Signature Alliance",
            "match_score": 88,
            "rationale": (
                "EcoWorld commercial parks are spec-built for corporate tenants with GBI certification targets. "
                "Signature's full-turnkey interior package aligns with their sustainability scoring."
            ),
            "synergy_bundle": ["PPG Hing"],
        },
    },
    {
        "id": "L022",
        "project_name": "IOI City Mall Office Tower Fit-Out",
        "location": "Putrajaya, WP Putrajaya",
        "value_rm": 11_000_000,
        "project_type": "Commercial",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "IOI Properties Group Bhd",
        "floors": 4,
        "gfa": 12000,
        "created_date": "2025-07-14",
        "ai_analysis": {
            "top_match_bu": "Signature Alliance",
            "match_score": 86,
            "rationale": (
                "IOI's strata office towers target Fortune 500 tenants. "
                "Premium fit-out packages from Signature Alliance increase lettable value by "
                "an average of RM 12 psf."
            ),
            "synergy_bundle": ["Ajiya Metal / Glass"],
        },
    },

    # ── SIGNATURE KITCHEN ──────────────────────────────────────
    {
        "id": "L023",
        "project_name": "One Devonshire Luxury Condo — Kitchen Package",
        "location": "Jalan Devonshire, KL",
        "value_rm": 4_200_000,
        "project_type": "High-Rise",
        "stage": "Construction",
        "status": "Assigned",
        "is_duplicate": False,
        "developer": "UEM Sunrise Bhd",
        "floors": 40,
        "gfa": 58000,
        "assigned_to": "Priya Menon",
        "created_date": "2025-06-16",
        "ai_analysis": {
            "top_match_bu": "Signature Kitchen",
            "match_score": 95,
            "rationale": (
                "UEM Sunrise premium condos in Jalan Devonshire command RM 1,800/sqft and above. "
                "Signature Kitchen's Italian-series cabinets are specified by the developer's ID "
                "partner for 100% of units."
            ),
            "synergy_bundle": ["Fiamma Holding"],
        },
    },
    {
        "id": "L024",
        "project_name": "The Vyne @ Sunway South Quay Kitchen Package",
        "location": "Subang Jaya, Selangor",
        "value_rm": 7_500_000,
        "project_type": "High-Rise",
        "stage": "Tender",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Sunway Bhd",
        "floors": 48,
        "gfa": 88000,
        "created_date": "2025-06-30",
        "ai_analysis": {
            "top_match_bu": "Signature Kitchen",
            "match_score": 91,
            "rationale": (
                "Sunway's waterfront residential developments consistently use Signature Kitchen "
                "for its Sunway-group approved vendor status. Strong brand synergy with Signature Alliance "
                "for common area millwork."
            ),
            "synergy_bundle": ["Fiamma Holding"],
        },
    },
    {
        "id": "L025",
        "project_name": "Desa ParkCity The Tuileries Kitchen Package",
        "location": "Kepong, KL",
        "value_rm": 5_200_000,
        "project_type": "High-Rise",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "ParkCity Management Corporation",
        "floors": 36,
        "gfa": 70000,
        "created_date": "2025-07-06",
        "ai_analysis": {
            "top_match_bu": "Signature Kitchen",
            "match_score": 88,
            "rationale": (
                "Desa ParkCity's master-planned community specifies natural-finish kitchen cabinets "
                "to complement its biophilic design ethos. Signature Kitchen is the only approved "
                "supplier with FSC-certified timber laminates."
            ),
            "synergy_bundle": ["Fiamma Holding"],
        },
    },
    {
        "id": "L026",
        "project_name": "Setia Sky 88 JB — Kitchen & Wardrobe Package",
        "location": "Johor Bahru, Johor",
        "value_rm": 8_000_000,
        "project_type": "High-Rise",
        "stage": "Construction",
        "status": "Won",
        "is_duplicate": False,
        "developer": "SP Setia Bhd",
        "floors": 58,
        "gfa": 115000,
        "assigned_to": "James Loo",
        "created_date": "2025-05-25",
        "ai_analysis": {
            "top_match_bu": "Signature Kitchen",
            "match_score": 93,
            "rationale": (
                "Sky 88 targets Singapore buyers and expats — ultra-premium kitchen finishes are "
                "non-negotiable. Signature's SG-listed showroom presence reinforces brand trust "
                "for this segment."
            ),
            "synergy_bundle": ["Fiamma Holding"],
        },
    },
    {
        "id": "L027",
        "project_name": "Kota Damansara Luxury Villa Kitchen Supply",
        "location": "Kota Damansara, Selangor",
        "value_rm": 3_000_000,
        "project_type": "Commercial",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Dijaya Corporation Bhd",
        "created_date": "2025-07-11",
        "ai_analysis": {
            "top_match_bu": "Signature Kitchen",
            "match_score": 84,
            "rationale": (
                "Luxury landed villa kitchens command larger per-unit kitchen budgets (avg RM 85K/unit). "
                "Signature's bespoke island tops are the flagship product for this segment."
            ),
            "synergy_bundle": ["Fiamma Holding"],
        },
    },

    # ── FIAMMA HOLDING ─────────────────────────────────────────
    {
        "id": "L028",
        "project_name": "Hana Residences Bukit Jalil — Appliance Package",
        "location": "Bukit Jalil, KL",
        "value_rm": 2_100_000,
        "project_type": "High-Rise",
        "stage": "Construction",
        "status": "Assigned",
        "is_duplicate": False,
        "developer": "Nusmetro Group Sdn Bhd",
        "floors": 32,
        "gfa": 44000,
        "assigned_to": "Lee Mei Shan",
        "created_date": "2025-06-23",
        "ai_analysis": {
            "top_match_bu": "Fiamma Holding",
            "match_score": 96,
            "rationale": (
                "Developer-supplied appliance packages for affordable-luxury condos yield "
                "RM 7,500/unit average at high margin. Fiamma's bulk purchase programme is "
                "tailored for 200+ unit developments."
            ),
            "synergy_bundle": ["Signature Kitchen"],
        },
    },
    {
        "id": "L029",
        "project_name": "Ativo Suites Mont Kiara — Appliance Bundle",
        "location": "Mont Kiara, KL",
        "value_rm": 3_200_000,
        "project_type": "High-Rise",
        "stage": "Tender",
        "status": "New",
        "is_duplicate": False,
        "developer": "Ativo Properties Sdn Bhd",
        "floors": 38,
        "gfa": 62000,
        "created_date": "2025-07-04",
        "ai_analysis": {
            "top_match_bu": "Fiamma Holding",
            "match_score": 91,
            "rationale": (
                "Mont Kiara serviced suites target corporate tenants who expect Bosch or "
                "Miele-equivalent appliances. Fiamma's Euro-brand range meets this spec at "
                "a competitive bulk price."
            ),
            "synergy_bundle": ["Signature Kitchen"],
        },
    },
    {
        "id": "L030",
        "project_name": "M Aruna @ Rawang Home Appliance Supply",
        "location": "Rawang, Selangor",
        "value_rm": 1_800_000,
        "project_type": "High-Rise",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Mah Sing Group Bhd",
        "floors": 18,
        "gfa": 28000,
        "created_date": "2025-07-10",
        "ai_analysis": {
            "top_match_bu": "Fiamma Holding",
            "match_score": 88,
            "rationale": (
                "Mah Sing's M-series mid-market projects have a standardised appliance procurement process. "
                "Fiamma is a registered Mah Sing preferred vendor — conversion probability is very high."
            ),
            "synergy_bundle": [],
        },
    },
    {
        "id": "L031",
        "project_name": "EcoMajestic Semenyih Serviced Apts",
        "location": "Semenyih, Selangor",
        "value_rm": 2_500_000,
        "project_type": "High-Rise",
        "stage": "Construction",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Eco World Development Group Bhd",
        "floors": 22,
        "gfa": 35000,
        "created_date": "2025-06-26",
        "ai_analysis": {
            "top_match_bu": "Fiamma Holding",
            "match_score": 89,
            "rationale": (
                "EcoWorld's Semenyih township is marketed as a smart-living development. "
                "Fiamma's IoT-enabled appliance bundles are a strong upsell with EcoWorld's "
                "app-controlled unit management system."
            ),
            "synergy_bundle": [],
        },
    },
    {
        "id": "L032",
        "project_name": "Altura KL South — Residential Appliance Pack",
        "location": "Cheras, KL",
        "value_rm": 4_000_000,
        "project_type": "High-Rise",
        "stage": "Tender",
        "status": "New",
        "is_duplicate": False,
        "developer": "Bukit Kiara Properties Sdn Bhd",
        "floors": 42,
        "gfa": 72000,
        "created_date": "2025-07-13",
        "ai_analysis": {
            "top_match_bu": "Fiamma Holding",
            "match_score": 87,
            "rationale": (
                "Altura's 580-unit tower is a major volume opportunity. Fiamma's hybrid appliance series "
                "(energy-saving with developer warranty coverage) is positioned strongly for this "
                "mid-premium segment."
            ),
            "synergy_bundle": ["Signature Kitchen"],
        },
    },

    # ── PPG HING ───────────────────────────────────────────────
    {
        "id": "L033",
        "project_name": "Klang Valley Mixed Dev — General Materials Supply",
        "location": "Klang, Selangor",
        "value_rm": 8_500_000,
        "project_type": "Commercial",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Aset Kayamas Sdn Bhd",
        "created_date": "2025-06-19",
        "ai_analysis": {
            "top_match_bu": "PPG Hing",
            "match_score": 90,
            "rationale": (
                "Mid-sized mixed developments in Klang require one-stop-shop trading material suppliers. "
                "PPG Hing's logistics hubs in Klang Valley ensure same-day delivery — "
                "a critical procurement KPI."
            ),
            "synergy_bundle": ["Stucken AAC"],
        },
    },
    {
        "id": "L034",
        "project_name": "Penang Hill Eco-Tourism Facility Build",
        "location": "Penang Hill, Penang",
        "value_rm": 5_000_000,
        "project_type": "Commercial",
        "stage": "Construction",
        "status": "In Review",
        "is_duplicate": False,
        "developer": "Penang Hill Corporation",
        "created_date": "2025-06-27",
        "ai_analysis": {
            "top_match_bu": "PPG Hing",
            "match_score": 85,
            "rationale": (
                "Heritage-zone eco-tourism builds require lightweight construction materials to comply "
                "with MBPP heritage building restrictions. PPG Hing's curated lightweight catalogue "
                "has been prequalified for this project."
            ),
            "synergy_bundle": [],
        },
    },
    {
        "id": "L035",
        "project_name": "Perak SDC Affordable Housing — Phase 3 Materials",
        "location": "Ipoh, Perak",
        "value_rm": 10_000_000,
        "project_type": "High-Rise",
        "stage": "Tender",
        "status": "Assigned",
        "is_duplicate": False,
        "developer": "Perak State Development Corporation",
        "assigned_to": "Zulhelmi Abd Razak",
        "created_date": "2025-07-07",
        "ai_analysis": {
            "top_match_bu": "PPG Hing",
            "match_score": 88,
            "rationale": (
                "Government affordable housing tenders require locally-sourced materials via "
                "Bumiputera-owned trading companies. PPG Hing's CIDB-registered status and "
                "Perak depot gives strong tender eligibility."
            ),
            "synergy_bundle": ["Stucken AAC"],
        },
    },
    {
        "id": "L036",
        "project_name": "Sabah Affordable Housing Programme — Supply",
        "location": "Kota Kinabalu, Sabah",
        "value_rm": 12_000_000,
        "project_type": "High-Rise",
        "stage": "Planning",
        "status": "New",
        "is_duplicate": False,
        "developer": "Sabah Housing & Development Board",
        "created_date": "2025-07-16",
        "ai_analysis": {
            "top_match_bu": "PPG Hing",
            "match_score": 87,
            "rationale": (
                "Sabah LHDNB affordable housing programmes favour national trading companies "
                "with East Malaysia logistics capability. PPG Hing's Kota Kinabalu depot offers "
                "a strategic supply advantage."
            ),
            "synergy_bundle": [],
        },
    },
    {
        "id": "L037",
        "project_name": "Negeri Sembilan Township Dev — Hardware Supply",
        "location": "Seremban, Negeri Sembilan",
        "value_rm": 6_000_000,
        "project_type": "Commercial",
        "stage": "Tender",
        "status": "New",
        "is_duplicate": False,
        "developer": "Seremban Properties Sdn Bhd",
        "created_date": "2025-07-17",
        "ai_analysis": {
            "top_match_bu": "PPG Hing",
            "match_score": 83,
            "rationale": (
                "Township developments require broad-range hardware supply contracts covering 50+ material SKUs. "
                "PPG Hing's e-procurement portal integrates directly with Seremban Properties' "
                "SAP procurement module."
            ),
            "synergy_bundle": ["Stucken AAC"],
        },
    },
]


def seed_leads() -> int:
    """
    Generate 1536-dim embeddings for each mock lead and upsert into Cosmos DB.

    CRITICAL: The `vector` field MUST be populated before upsert. On server
    startup, main.py hydrates the in-memory vector cache from every lead that
    has a non-empty `vector` field. Missing vectors will silently disable
    duplicate detection for seeded leads.

    Returns:
        Number of leads successfully upserted.
    """
    print("\n" + "=" * 60)
    print("  PHASE 2 — SEEDING LEADS (with embeddings)")
    print(f"  Total leads to process: {len(_MOCK_LEADS)}")
    print("=" * 60)

    seeded = 0
    failed = 0

    for i, lead in enumerate(_MOCK_LEADS, start=1):
        embedding_text = f"{lead['project_name']} {lead['location']}"
        print(
            f"\n  [{i:02d}/{len(_MOCK_LEADS)}] Generating embedding for: "
            f"'{lead['project_name']}' @ {lead['location']}"
        )

        # --- Generate the semantic embedding vector ---
        try:
            vector: List[float] = generate_embedding(embedding_text)
            print(f"         ✓ Embedding OK — {len(vector)} dimensions")
        except Exception as exc:
            print(f"         ✗ EMBEDDING FAILED: {exc}")
            print(f"           Skipping lead '{lead['id']}' — no vector, duplicate detection will miss it.")
            failed += 1
            continue

        # --- Build the Cosmos DB document ---
        # Merge additional metadata that LeadDB.model_dump() would include.
        doc: Dict[str, Any] = {
            **lead,
            "vector": vector,
        }

        # --- Upsert into Cosmos DB ---
        try:
            database.save_lead(doc)
            top_bu = lead["ai_analysis"]["top_match_bu"]
            score = lead["ai_analysis"]["match_score"]
            print(f"         ✓ Upserted — ID={lead['id']}  BU={top_bu}  Score={score}")
            seeded += 1
        except Exception as exc:
            print(f"         ✗ COSMOS DB WRITE FAILED for '{lead['id']}': {exc}")
            failed += 1
            continue

        # Rate-limit guard — Azure OpenAI embedding endpoint has per-minute TPM limits.
        # A 0.5-second sleep between calls keeps us well within the default quota.
        if i < len(_MOCK_LEADS):
            time.sleep(0.5)

    print(f"\n  → {seeded} leads seeded successfully.  {failed} failed.")
    return seeded


# ===========================================================================
# SECTION 3 — CONFLICT DOCUMENTS
# Seed one real duplicate conflict pair so ConflictResolution page
# shows real data instead of the hardcoded mockData fallback.
# ===========================================================================

_SEED_CONFLICTS: List[Dict[str, Any]] = [
    {
        "id": "CONFLICT-L002-L001",
        "lead_id": "L002",           # duplicate (Twin Towers Grand Reno)
        "matched_lead_id": "L001",  # original (Mont Kiara Luxury Residences)
        "similarity_score": 0.94,
        "status": "Pending",
        "created_date": "2025-06-08",
    },
]


def seed_conflicts() -> int:
    """Upsert seed conflict documents into the Conflicts Cosmos container."""
    print("\n[3/3] Seeding conflict documents …")
    seeded = 0
    for conflict in _SEED_CONFLICTS:
        try:
            database.save_conflict(conflict)
            print(f"         ✓ Conflict {conflict['id']} — lead={conflict['lead_id']} → matched={conflict['matched_lead_id']}")
            seeded += 1
        except Exception as exc:
            print(f"         ✗ FAILED to seed conflict '{conflict['id']}': {exc}")
    print(f"\n  → {seeded} conflict(s) seeded successfully.")
    return seeded


# ===========================================================================
# MAIN ENTRY POINT
# ===========================================================================
def main() -> None:
    print("\n" + "█" * 60)
    print("  SYNERGY SALES GENIUS — MASTER DATABASE SEEDER")
    print("  Target: Azure Cosmos DB (SynergyDB)")
    print("█" * 60)

    total_users = seed_users()
    total_leads = seed_leads()
    total_conflicts = seed_conflicts()

    print("\n" + "=" * 60)
    print("  SEEDING COMPLETE")
    print("=" * 60)
    print(f"  ✓ Users inserted / updated    : {total_users}")
    print(f"  ✓ Leads inserted / updated    : {total_leads}")
    print(f"  ✓ Conflicts inserted / updated: {total_conflicts}")
    print()
    print("  Next steps:")
    print("  1. Restart the FastAPI server — it will hydrate the vector")
    print("     cache from the newly seeded leads on startup.")
    print("  2. Log in with marvis@chinhin.com / admin123 to verify all")
    print("     37 leads appear in the Lead Workbench.")
    print("  3. ConflictResolution page will now show real conflict data")
    print("     for L002 (Twin Towers Grand Reno) vs L001 (Mont Kiara).")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
