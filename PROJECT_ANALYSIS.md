# Synergy Sales Genius — Full Project Analysis

> **Project:** Synergy Sales Genius  
> **Client:** Chin Hin Group, Malaysia  
> **Purpose:** Enterprise AI-powered CRM for routing construction project leads to the most profitable Business Unit (BU)  
> **Analysis Date:** March 8, 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Frontend](#3-frontend)
4. [Backend](#4-backend)
5. [Database — Azure Cosmos DB](#5-database--azure-cosmos-db)
6. [AI Engine — Azure OpenAI](#6-ai-engine--azure-openai)
7. [Authentication & RBAC](#7-authentication--rbac)
8. [Notification System](#8-notification-system)
9. [Telemetry & Monitoring](#9-telemetry--monitoring)
10. [Security](#10-security)
11. [Full Tech Stack Summary](#11-full-tech-stack-summary)
12. [Data Flow — Lead Ingestion Pipeline](#12-data-flow--lead-ingestion-pipeline)
13. [Business Units (BU)](#13-business-units-bu)

---

## 1. Project Overview

**Synergy Sales Genius** হলো Chin Hin Group-এর জন্য তৈরি একটি AI-powered Enterprise CRM system। এই সিস্টেমটি নির্মাণ (construction) ইন্ডাস্ট্রির ইনকামিং project leads গুলোকে automatically বিশ্লেষণ করে এবং সবচেয়ে লাভজনক Business Unit-এ route করে।

**মূল সমস্যা যা সমাধান করে:**
- Manual lead routing — সেলস টিম manually decide করত কোন BU-তে lead যাবে
- Duplicate leads — একই project বিভিন্ন সময়ে ভিন্ন নামে enter হওয়া
- Cross-selling missed — group-wide revenue maximize না হওয়া
- No data visibility — কোন BU কতটা ভালো করছে সেই ডেটা ছিল না

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                   │
│   localhost:5173  |  TanStack Query  |  Axios  |  Tailwind  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP REST (JSON)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│               BACKEND (FastAPI + Python)                     │
│         localhost:8000  |  Uvicorn ASGI  |  SlowAPI         │
│    main.py → auth.py → ai_engine.py → database.py          │
└────────────────────┬──────────────────┬─────────────────────┘
                     │                  │
          ┌──────────▼──────┐    ┌──────▼──────────────┐
          │  Azure OpenAI   │    │  Azure Cosmos DB     │
          │  GPT-4o         │    │  (NoSQL, 5 containers│
          │  text-embedding │    │   SynergyDB)         │
          │  -3-small       │    └─────────────────────┘
          └─────────────────┘
                     │
          ┌──────────▼──────────────────┐
          │  Azure Application Insights  │
          │  (OpenTelemetry Monitoring)  │
          └─────────────────────────────┘
```

**Communication Pattern:**
- Frontend → Backend: REST API (JSON over HTTP)
- Backend → AI: Azure OpenAI SDK (Python)
- Backend → Database: Azure Cosmos SDK (Python)
- Auth: JWT Bearer Token (stored in localStorage)

---

## 3. Frontend

### Framework & Build Tool
| Tool | Version | কাজ |
|------|---------|------|
| **React** | 18.3.1 | UI framework |
| **TypeScript** | — | Type safety |
| **Vite** | — | Build tool & dev server (port 5173) |
| **Bun** | — | Package manager (bun.lockb present) |

### Routing
**React Router DOM** ব্যবহার করা হয়েছে। Routes:

| Path | Page | Access |
|------|------|--------|
| `/` or `/auth` | `Auth.tsx` | Public (login page) |
| `/dashboard` | `Dashboard.tsx` | Protected |
| `/leads` | `LeadWorkbench.tsx` | Protected |
| `/conflicts` | `ConflictResolution.tsx` | Protected |
| `/ingest` | `DataIngestion.tsx` | Protected |
| `/admin/users` | `AdminUsers.tsx` | Protected (Admin only) |
| `/reports` | `Reports.tsx` | Protected |

সমস্ত protected route গুলো `ProtectedRoute` component দিয়ে wrap করা — unauthorized user কে `/auth`-এ redirect করে।

### State Management
- **TanStack Query (React Query) v5** — সার্ভার থেকে ডেটা fetch, cache, refetch
- **React Context (AuthContext)** — global auth state (user, token, login/logout)
- **Local useState** — component-level UI state

### UI Component Library
সম্পূর্ণ **shadcn/ui** + **Radix UI** primitive দিয়ে তৈরি:

| Category | Components |
|----------|-----------|
| Layout | `Card`, `Separator`, `Sheet`, `Sidebar` |
| Form | `Input`, `Label`, `Select`, `Checkbox`, `Switch`, `Textarea`, `Form` |
| Feedback | `Toast`, `Sonner`, `Alert`, `AlertDialog`, `Progress` |
| Display | `Badge`, `Avatar`, `Table`, `Skeleton`, `Calendar` |
| Navigation | `Tabs`, `Breadcrumb`, `Pagination`, `NavigationMenu` |
| Overlay | `Dialog`, `Drawer`, `Popover`, `Tooltip`, `HoverCard` |

### Styling
- **Tailwind CSS** — utility-first CSS
- **CSS Variables** — dark/light theme support (`next-themes`)
- **`cn()` utility** — `clsx` + `tailwind-merge` দিয়ে conditional classnames

### Animation
- **Framer Motion v12** — page transitions, drawer slide-in/out, list animations

### Charts & Visualization
- **Recharts** — Bar chart, Area chart, Pie chart (Dashboard এবং Reports page-এ)

### Drag & Drop
- **@dnd-kit** (core + sortable + utilities) — Lead Pipeline kanban board drag-and-drop

### HTTP Client
- **Axios** — সমস্ত API call এই একটি configured instance দিয়ে যায় (`src/lib/api.ts`)
  - Base URL configured in one place
  - Auth token automatically injected as Bearer header
  - Error interceptors globally handle 401/403

### Key Pages বিস্তারিত

#### Dashboard (`/dashboard`)
- Live KPI cards: Total Leads, Won, Pending Conflicts, Pipeline Value
- Bar chart: Leads by BU
- Area chart: Monthly trend
- Pie chart: Stage distribution
- Recent activity feed
- Role-based greeting (Admin vs Sales_Rep)

#### Lead Workbench (`/leads`)
- **List view** — paginated table of all leads with status badges
- **Pipeline view** — Kanban board (stages: Planning → Tender → Construction → Completed)
- Click any lead → opens **SmartDrawer** (AI recommendation panel)
- Pagination: 100 leads/page

#### SmartDrawer (Component)
- AI match score badge + top BU recommendation
- Synergy bundle: other BUs to cross-sell
- AI rationale (GPT-4o generated explanation)
- BU contact info (phone, email)
- Lead activity log (Notes, Calls, Emails)
- Audit trail (all stage/status changes)
- "Assign Lead" button → triggers status update + email notification

#### Data Ingestion (`/ingest`)
- **Manual form**: project name, location, value, type, stage, developer, floors, GFA
- **Bulk CSV upload**: drag-and-drop or file picker
- **PDF upload** support
- Animated pipeline steps visualization (Upload → AI Scoring → Stored → Dashboard)
- File size limit: 50 MB

#### Conflict Resolution (`/conflicts`)
- Shows duplicate lead pairs flagged by AI
- Side-by-side comparison with highlighted matching fields
- Actions: **Merge**, **Discard**, **Keep Both**

#### Reports (`/reports`)
- Filter by BU, Status, Date Range
- Summary stats: Total Value, Won Rate, Avg Match Score
- Bar chart by BU
- **Export to CSV** (bulk download with auth token)

#### Admin Users (`/admin/users`)
- List all users
- Create new user (email, name, role, BU)
- Edit existing user
- Delete user
- Admin-only access

### Frontend File Structure
```
src/
├── App.tsx               # Root: QueryClient, AuthProvider, Router, Routes
├── main.tsx              # React DOM mount
├── context/
│   └── AuthContext.tsx   # JWT auth state, login(), logout()
├── hooks/
│   ├── useLeads.ts       # TanStack Query hooks (useLeads, useConflicts, etc.)
│   ├── useTheme.ts       # Dark/light theme toggle
│   └── use-mobile.tsx    # Responsive breakpoint hook
├── lib/
│   ├── api.ts            # Axios instance + all TypeScript interfaces
│   ├── exportUtils.ts    # CSV export helpers
│   └── utils.ts          # cn() utility
├── data/
│   └── mockData.ts       # Lead/BU type definitions + static fallback data
├── pages/                # Route-level page components
└── components/
    ├── AppSidebar.tsx    # Navigation sidebar
    ├── SmartDrawer.tsx   # AI recommendation slide-over
    ├── LeadsTable.tsx    # Paginated table
    ├── LeadPipeline.tsx  # Kanban drag-and-drop
    ├── KPICard.tsx       # Metric display card
    └── ui/               # shadcn/ui base components
```

---

## 4. Backend

### Framework
| Tool | Version | কাজ |
|------|---------|------|
| **FastAPI** | 0.115.5 | Web framework, REST API |
| **Uvicorn** | 0.32.1 | ASGI server |
| **Pydantic v2** | 2.10.3 | Data validation & serialization |
| **pydantic-settings** | 2.6.1 | Environment config |

### API Endpoints

#### Authentication
| Method | Endpoint | কাজ | Rate Limit |
|--------|----------|------|-----------|
| POST | `/api/auth/login` | Email/password → JWT tokens | 5/min |
| POST | `/api/auth/refresh` | Refresh token → new access token | 5/min |

#### Leads
| Method | Endpoint | কাজ | Rate Limit |
|--------|----------|------|-----------|
| GET | `/api/leads` | Leads list (paginated, RBAC filtered) | 200/min |
| POST | `/api/leads` | Create lead + run AI analysis | 30/min |
| PATCH | `/api/leads/{id}` | Update stage/status | 60/min |
| GET | `/api/leads/{id}/activities` | Lead activity log | 200/min |
| POST | `/api/leads/{id}/activities` | Add note/call/email | 60/min |
| GET | `/api/leads/{id}/audit` | Audit trail | 200/min |
| POST | `/api/leads/bulk` | Bulk CSV/PDF ingest | 5/min |
| GET | `/api/leads/export` | Export all leads as CSV | 200/min |

#### Conflicts
| Method | Endpoint | কাজ |
|--------|----------|------|
| GET | `/api/conflicts` | Pending duplicate conflicts |
| PATCH | `/api/conflicts/{id}` | Resolve: Merge/Discard/Keep Both |

#### Admin
| Method | Endpoint | কাজ |
|--------|----------|------|
| GET | `/api/admin/users` | List all users |
| POST | `/api/admin/users` | Create user |
| PATCH | `/api/admin/users/{id}` | Update user |
| DELETE | `/api/admin/users/{id}` | Delete user |

#### Utility
| Method | Endpoint | কাজ |
|--------|----------|------|
| GET | `/api/bu-contacts` | BU manager contacts |
| GET | `/health` | Health check |
| GET | `/docs` | Swagger UI |
| GET | `/redoc` | ReDoc UI |

### Backend Modules

#### `main.py` — Application Entry Point
- FastAPI app instantiation
- CORS middleware (configurable via `ALLOWED_ORIGINS` env var)
- Rate limiting (SlowAPI — IP-based, in-memory)
- Global exception handler (catches all unhandled 500s)
- Startup lifespan: seeds demo users on first boot

#### `ai_engine.py` — AI Intelligence Layer
- Azure OpenAI GPT-4o integration
- Embedding generation (text-embedding-3-small)
- Structured system prompt with Chin Hin tribal knowledge
- JSON-mode enforced response

#### `database.py` — Data Access Layer
- Cosmos DB singleton client
- Container references (Leads, Conflicts, Users, Activities, AuditLogs)
- CRUD operations for all containers
- Throughput management (autoscale: 400–4000 RU/s)

#### `auth.py` — JWT Authentication
- bcrypt password hashing (passlib)
- JWT sign/verify (python-jose, HS256)
- Access token: 30 minutes
- Refresh token: 7 days
- `get_current_user()` FastAPI dependency

#### `models.py` — Pydantic Schemas
- `LeadCreate` — input validation
- `AIAnalysis` — GPT-4o output schema
- `LeadDB` — full document (stored in Cosmos)
- `LeadResponse` — API response (excludes raw vector)
- `LeadUpdate`, `ConflictResolutionUpdate`, `LeadActivity`, `AuditLog`

#### `notifications.py` — Email Service
- Gmail SMTP (smtplib, no extra packages)
- Async sends in daemon thread (never blocks API)
- HTML email templates

#### `telemetry.py` — Azure Monitor
- OpenTelemetry auto-instrumentation
- Request traces, dependency tracking, exception telemetry
- No-op when env var absent (safe for local dev)

#### `seed_master.py` — Database Seeder
- Seeds Cosmos DB with realistic sample leads
- Used for initial setup and demo

### Middleware Stack (top to bottom)
```
SlowAPIMiddleware (Rate Limiting)
    ↓
CORSMiddleware
    ↓
Azure Monitor ASGI Middleware (Telemetry)
    ↓
FastAPI Application Routes
```

### Rate Limiting Strategy
| Endpoint Type | Default Limit | Override Env Var |
|--------------|--------------|-----------------|
| Auth (login) | 5/minute | `RATE_LIMIT_AUTH` |
| Write (AI ingest) | 30/minute | `RATE_LIMIT_WRITE` |
| Bulk CSV | 5/minute | `RATE_LIMIT_BULK` |
| PATCH | 60/minute | `RATE_LIMIT_PATCH` |
| GET | 200/minute | `RATE_LIMIT_READ` |

---

## 5. Database — Azure Cosmos DB

### Database: `SynergyDB`

**Type:** Azure Cosmos DB NoSQL API  
**Throughput:** Autoscale 400–4000 RU/s (configurable via env vars)  
**SDK:** `azure-cosmos==4.9.0`

### Containers

| Container | Partition Key | Purpose |
|-----------|--------------|---------|
| `Leads` | `/id` | Primary lead documents (AI-enriched) |
| `Conflicts` | `/id` | Flagged duplicate pairs for review |
| `Users` | `/id` | User accounts (bcrypt hashed passwords) |
| `Activities` | `/lead_id` | Per-lead activity log (notes, calls, emails) |
| `AuditLogs` | `/lead_id` | Immutable audit trail of all changes |

### Lead Document Structure (stored in `Leads` container)
```json
{
  "id": "uuid-v4",
  "project_name": "Pavilion Damansara Heights Tower C",
  "location": "Damansara Heights, KL",
  "value_rm": 85000000,
  "project_type": "High-Rise Residential",
  "stage": "Tender",
  "status": "New",
  "developer": "Pavilion Group",
  "floors": 45,
  "gfa": 920000,
  "is_duplicate": false,
  "vector": [0.023, -0.441, ...],   // 1536-dim embedding (text-embedding-3-small)
  "ai_analysis": {
    "top_match_bu": "Stucken AAC",
    "match_score": 91,
    "rationale": "GPT-4o explanation citing past wins...",
    "synergy_bundle": ["Ajiya Metal / Glass", "Signature Alliance"]
  },
  "created_date": "2026-03-08T10:30:00Z",
  "assigned_to": null
}
```

### Duplicate Detection (Cosine Similarity)
1. নতুন lead আসলে `project_name + location` দিয়ে embedding generate হয়
2. এই vector Cosmos DB-তে সব existing lead-এর vector-এর সাথে cosine similarity calculate হয় (NumPy)
3. Similarity ≥ **0.92** হলে lead টিকে duplicate flag করা হয়
4. একটি Conflict document create হয় `Conflicts` container-এ
5. Sales rep Conflict Resolution page থেকে manually resolve করে

---

## 6. AI Engine — Azure OpenAI

### Models Used

| Model | Deployment | কাজ |
|-------|-----------|------|
| **GPT-4o** | `gpt-4o` | Lead analysis, BU routing, rationale generation |
| **text-embedding-3-small** | `text-embedding-3-small` | 1536-dim semantic vectors for duplicate detection |

### Lead Analysis Flow (GPT-4o)

**Input (User Prompt):**
```
PROJECT NAME  : Pavilion Damansara Heights Tower C
LOCATION      : Damansara Heights, KL
PROJECT TYPE  : High-Rise Residential
STAGE         : Tender
VALUE (RM)    : 85,000,000
```

**System Prompt এ কী আছে:**
- Chin Hin Group-এর 7টি Business Unit-এর বিস্তারিত বিবরণ
- প্রতিটি BU-এর past wins (real project examples)
- Signal keywords (যেমন: "High-Rise" → Stucken AAC)
- Scoring guide (90–100: Perfect match, 50–69: Moderate)
- Strict JSON output format

**Output (JSON-mode enforced):**
```json
{
  "top_match_bu": "Stucken AAC",
  "match_score": 91,
  "rationale": "Stucken AAC has delivered 3 similar...",
  "synergy_bundle": ["Ajiya Metal / Glass", "Signature Kitchen"]
}
```

**Design Choices:**
- `response_format={"type": "json_object"}` — deterministic JSON output, no markdown
- Singleton OpenAI client — TCP connection reuse (no per-request handshake overhead)
- Separate embedding client (different API version for embedding endpoint)

---

## 7. Authentication & RBAC

### Authentication Flow
```
1. POST /api/auth/login
   → Cosmos DB থেকে user খোঁজা (email by)
   → bcrypt password verify
   → JWT access token (30 min) + refresh token (7 day) sign

2. Frontend stores:
   → token → localStorage: "synergy_token"
   → user  → localStorage: "synergy_user"

3. Every API request:
   → Axios interceptor adds: Authorization: Bearer <token>

4. Backend:
   → get_current_user() Depends() extracts + verifies JWT
   → Claims: email, name, role, bu
```

### Roles

| Role | Access |
|------|--------|
| **Admin** | সমস্ত leads দেখতে পারে, user management করতে পারে |
| **Sales_Rep** | শুধু নিজের BU-র leads দেখতে পারে (server-side filter) |

### Demo Accounts (auto-seeded on startup)
| Email | Role | BU |
|-------|------|----|
| `marvis@chinhin.com` / `admin123` | Admin | All |
| `sales@stucken.com` / `sales123` | Sales_Rep | Stucken AAC |
| `sales@ajiya.com` / `sales123` | Sales_Rep | Ajiya Metal/Glass |
| `sales@gcast.com` / `sales123` | Sales_Rep | G-Cast |
| `sales@signature.com` / `sales123` | Sales_Rep | Signature Alliance |
| `sales@kitchen.com` / `sales123` | Sales_Rep | Signature Kitchen |
| `sales@fiamma.com` / `sales123` | Sales_Rep | Fiamma Holding |
| `sales@ppghing.com` / `sales123` | Sales_Rep | PPG Hing |

### JWT Configuration
- Algorithm: **HS256**
- Access Token: **30 minutes**
- Refresh Token: **7 days** (sliding window)
- Secret: `JWT_SECRET_KEY` env var (⚠️ must be replaced in production)

---

## 8. Notification System

### Email via Gmail SMTP
- Library: Python built-in `smtplib` (STARTTLS, port 587)
- All sends run in **background daemon threads** — never blocks API response
- HTML email templates with Synergy branding (indigo color scheme)
- Gracefully disabled when `NOTIFY_EMAIL_*` env vars are absent

### Trigger Events
| Event | Email Sent |
|-------|-----------|
| New lead ingested | `send_new_lead_email()` |
| Duplicate detected | `send_duplicate_alert_email()` |
| Conflict resolved | `send_conflict_resolved_email()` |
| Lead assigned | `send_lead_assigned_email()` |

### Configuration
```env
NOTIFY_EMAIL_TO=manager@chinhin.com,director@chinhin.com
NOTIFY_EMAIL_FROM=synergy@chinhin.com
NOTIFY_SMTP_PASSWORD=gmail-app-password-here
NOTIFY_SMTP_HOST=smtp.gmail.com
NOTIFY_SMTP_PORT=587
```

---

## 9. Telemetry & Monitoring

### Azure Application Insights
- SDK: `azure-monitor-opentelemetry==1.6.4`
- Integration: OpenTelemetry auto-instrumentation
- **No-op** when `APPLICATIONINSIGHTS_CONNECTION_STRING` env var absent

### What's Tracked Automatically
| Telemetry Type | Details |
|---------------|---------|
| Request traces | URL, method, status code, duration — every HTTP request |
| Dependency tracking | Outbound calls to Azure OpenAI + Cosmos DB |
| Exception telemetry | All 5xx errors with full stack trace |
| Log correlation | Every `logging.*` call tagged with trace_id/span_id |
| Performance counters | CPU %, memory, process metrics |

### Service Configuration
```env
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx;IngestionEndpoint=...
OTEL_SERVICE_NAME=synergy-sales-genius-api
APPLICATIONINSIGHTS_SAMPLE_RATE=1.0   # 1.0 = 100% sampling
```

---

## 10. Security

### Implemented Security Measures

| Area | Measure |
|------|---------|
| **Password Storage** | bcrypt hashing via passlib (never stored plain) |
| **Authentication** | JWT (HS256), short-lived access tokens (30 min) |
| **Authorization** | Role-based: Admin / Sales_Rep, server-side filtering |
| **Rate Limiting** | SlowAPI — brute force guard on login (5/min) |
| **CORS** | Allowlist-based origin control via `ALLOWED_ORIGINS` env var |
| **Input Validation** | Pydantic v2 — all input validated at API boundary |
| **Error Handling** | Global handler never leaks stack traces to clients |
| **File Upload** | 50 MB limit, only CSV/PDF accepted |
| **Secrets** | All credentials via `.env` / environment variables |
| **Token Refresh** | Refresh token pattern (7-day sliding window) |

### Production Checklist (noted in codebase)
- [ ] Replace `JWT_SECRET_KEY` with Azure Key Vault managed secret
- [ ] Set `ALLOWED_ORIGINS` to exact production domain
- [ ] Set `COSMOS_CONFIGURE_THROUGHPUT=false` for read-only CI accounts
- [ ] Use Azure Managed Identity instead of `AZURE_COSMOS_KEY`

---

## 11. Full Tech Stack Summary

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Vite | Build tool & HMR |
| Bun | Package manager |
| React Router DOM | Client-side routing |
| TanStack Query v5 | Server state, caching, refetching |
| Axios | HTTP client |
| shadcn/ui | Component library |
| Radix UI | Headless primitives |
| Tailwind CSS | Utility CSS |
| Framer Motion | Animations |
| Recharts | Data visualization charts |
| @dnd-kit | Drag-and-drop |
| next-themes | Dark/light mode |
| React Hook Form | Form handling |
| Zod / @hookform/resolvers | Form validation |
| lucide-react | Icon set |
| date-fns | Date formatting |

### Backend
| Technology | Purpose |
|-----------|---------|
| Python 3.12+ | Runtime |
| FastAPI | Web framework |
| Uvicorn | ASGI server |
| Pydantic v2 | Validation & serialization |
| openai SDK v1.57 | Azure OpenAI calls |
| azure-cosmos SDK | Cosmos DB access |
| python-jose + cryptography | JWT encode/decode |
| passlib + bcrypt | Password hashing |
| slowapi + limits | Rate limiting |
| pdfplumber | PDF text extraction |
| numpy | Cosine similarity calculation |
| azure-monitor-opentelemetry | Application Insights |
| httpx | Async HTTP (used by openai SDK) |
| python-multipart | File upload parsing |
| python-dotenv | .env loading |

### Cloud (Azure)
| Service | Purpose |
|---------|---------|
| Azure OpenAI | GPT-4o (lead analysis) + text-embedding-3-small (vectors) |
| Azure Cosmos DB | NoSQL database (5 containers) |
| Azure Application Insights | Monitoring, tracing, alerting |

---

## 12. Data Flow — Lead Ingestion Pipeline

### Single Lead (Manual Form)
```
1. User fills form in DataIngestion.tsx
2. POST /api/leads  →  FastAPI
3. Pydantic LeadCreate validates input
4. ai_engine.generate_embedding(project_name + location)
   → Azure OpenAI text-embedding-3-small → 1536-dim vector
5. ai_engine.analyze_lead(lead_dict)
   → Azure OpenAI GPT-4o (with tribal knowledge system prompt)
   → JSON: { top_match_bu, match_score, rationale, synergy_bundle }
6. Duplicate check:
   → Fetch all existing lead vectors from Cosmos DB
   → numpy cosine_similarity against new vector
   → If similarity ≥ 0.92: is_duplicate=True, create Conflict document
7. Save complete LeadDB document to Cosmos DB Leads container
8. notifications.send_new_lead_email() [background thread]
9. Return LeadResponse to frontend
10. TanStack Query cache invalidated → Dashboard KPIs refresh
```

### Bulk CSV Upload
```
1. User uploads CSV file (drag-and-drop)
2. POST /api/leads/bulk  →  FastAPI
3. pdfplumber (if PDF) or csv.reader parses file
4. For each row: same pipeline as single lead (steps 4–9)
5. Returns BulkIngestResponse: { imported: N, flagged: M, errors: [...] }
```

---

## 13. Business Units (BU)

Chin Hin Group-এর **7টি Business Unit** রয়েছে যেগুলোতে AI lead route করে:

| # | BU Name | Specialty | Key Signals |
|---|---------|-----------|------------|
| 1 | **Stucken AAC** | Autoclaved Aerated Concrete Blocks, High-rise | "High-Rise", "blocks", "mass housing", "PPR" |
| 2 | **Ajiya Metal / Glass** | Aluminium Curtain Wall, Roofing, Cladding | "Commercial", "factory", "curtain wall", "roofing" |
| 3 | **PPG Hing** | Paints & Coatings (Trading) | "Refurbishment", "hospital", "school", "repainting" |
| 4 | **Signature Alliance** | Premium Office Fit-out | "Office", "corporate", "fit-out", "interior", "bank" |
| 5 | **Signature Kitchen** | Premium Kitchen Systems | "Serviced apartment", "hotel", "kitchen", "luxury" |
| 6 | **Fiamma Holding** | Home Appliances Distribution | "Hotel", "condominium handover", "appliances" |
| 7 | **G-Cast** | Precast Concrete | "Bridge", "tunnel", "precast", "MRT", "civil works" |

---

## Project Summary

**Synergy Sales Genius** একটি full-stack enterprise application যেখানে:

- **Frontend** (React/Vite) একটি modern, responsive SPA — সুন্দর dashboard, kanban pipeline, AI recommendation drawer, conflict resolution UI সহ।
- **Backend** (FastAPI/Python) একটি production-grade REST API — rate limiting, RBAC, JWT auth, audit logs সহ।
- **AI** (Azure OpenAI) দুটি model ব্যবহার করে: GPT-4o for intelligent routing + text-embedding-3-small for semantic duplicate detection।
- **Database** (Azure Cosmos DB) NoSQL document store — 5টি container এ সমস্ত data organized।
- **Monitoring** (Azure Application Insights) full observability — traces, logs, exceptions, performance metrics।
- **Notifications** (Gmail SMTP) real-time email alerts on key business events।

এই প্রজেক্টটি Chin Hin Group-এর sales team কে AI দিয়ে empower করার জন্য তৈরি — যাতে প্রতিটি construction lead সবচেয়ে সঠিক BU-তে যায় এবং group-wide cross-selling maximize হয়।
