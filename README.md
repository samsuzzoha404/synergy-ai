<div align="center">

<img src="public/logo/logo.png" alt="Synergy Sales Genius Logo" width="80" />

# Synergy Sales Genius

**AI-powered Enterprise CRM for the Chin Hin Group**

Automatically analyze, score, and route construction project leads to the most profitable Business Unit — powered by Azure OpenAI GPT-4o.

[![Frontend](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://synergy-ai-roan.vercel.app)
[![Backend](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=white)](https://synergy-ai-ucpt.onrender.com)
[![License](https://img.shields.io/badge/License-Private-red)](LICENSE)

</div>

---

## Live URLs

| Service | URL |
|---------|-----|
| **Frontend** | https://synergy-ai-roan.vercel.app |
| **Backend API** | https://synergy-ai-ucpt.onrender.com |
| **API Docs (Swagger)** | https://synergy-ai-ucpt.onrender.com/docs |
| **API Docs (ReDoc)** | https://synergy-ai-ucpt.onrender.com/redoc |
| **Health Check** | https://synergy-ai-ucpt.onrender.com/health |



---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Tech Stack](#tech-stack)
4. [Architecture](#architecture)
5. [Getting Started](#getting-started)
6. [Environment Variables](#environment-variables)
7. [API Reference](#api-reference)
8. [Project Structure](#project-structure)
9. [Deployment](#deployment)
10. [Business Units](#business-units)

---

## Overview

**Synergy Sales Genius** is an enterprise-grade AI sales intelligence platform built for **Chin Hin Group**, a leading construction materials conglomerate in Malaysia. It solves three critical problems:

- **Manual lead routing** — Sales reps previously decided manually which Business Unit (BU) to assign each incoming construction project lead to.
- **Duplicate leads** — The same project would appear multiple times under different names, causing internal conflicts.
- **Missed cross-sell opportunities** — No visibility into which BUs could bundle together to maximize deal value.

The system ingests leads (manually or via bulk CSV/PDF), runs them through a GPT-4o analysis pipeline, and surfaces a ranked BU recommendation with a match score, rationale, and synergy bundle — all in under 5 seconds.

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Lead Scoring** | GPT-4o analyzes every lead and produces a match score (0–100) with a human-readable rationale |
| **BU Routing** | Automatically recommends the optimal Business Unit based on project type, location, and value |
| **Synergy Bundles** | Identifies cross-sell opportunities across multiple BUs for the same project |
| **Duplicate Detection** | Cosine similarity (1536-dim embeddings) flags duplicate leads with ≥ 0.92 similarity |
| **Conflict Resolution** | Side-by-side UI to Merge, Discard, or Keep Both duplicate leads |
| **Lead Workbench** | Paginated table + Kanban pipeline board with drag-and-drop stage management |
| **Bulk Ingestion** | Upload CSV files (up to 50 MB) or PDFs — all processed by the AI pipeline |
| **Activity Log** | Per-lead notes, calls, and emails with full audit trail |
| **Reports & Export** | BU performance charts with CSV export |
| **Role-Based Access** | Admin and Sales Rep roles with fine-grained UI and API-level control |
| **Email Notifications** | Automatic HTML email alerts when a lead is assigned |
| **Dark / Light Theme** | Full dark mode support via `next-themes` |

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18.3.1 | UI framework |
| **TypeScript** | — | Type safety |
| **Vite** | — | Build tool & dev server |
| **Tailwind CSS** | — | Utility-first styling |
| **shadcn/ui + Radix UI** | — | Accessible component library |
| **TanStack Query v5** | — | Server state management & caching |
| **React Router DOM** | — | Client-side routing |
| **Axios** | — | HTTP client |
| **Framer Motion v12** | — | Animations & page transitions |
| **Recharts** | — | Charts (Bar, Area, Pie) |
| **@dnd-kit** | — | Drag-and-drop Kanban board |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **FastAPI** | 0.115.5 | REST API framework |
| **Uvicorn** | 0.32.1 | ASGI server |
| **Pydantic v2** | 2.10.3 | Data validation & serialization |
| **Azure OpenAI SDK** | 1.68.2 | GPT-4o & embedding API |
| **LangChain / LangGraph** | 0.3.x | Agentic AI workflow orchestration |
| **Azure Cosmos SDK** | 4.9.0 | NoSQL database client |
| **python-jose** | 3.3.0 | JWT authentication |
| **passlib + bcrypt** | — | Password hashing |
| **SlowAPI** | 0.1.9 | IP-based rate limiting |
| **pdfplumber** | 0.11.4 | PDF text extraction |
| **OpenTelemetry** | — | Azure Application Insights tracing |

### Cloud Infrastructure

| Service | Purpose |
|---------|---------|
| **Azure OpenAI** | GPT-4o (lead analysis) + text-embedding-3-small (duplicate detection) |
| **Azure Cosmos DB** | NoSQL database (autoscale 400–4000 RU/s) |
| **Render** | Backend hosting (Dockerized) |
| **Vercel** | Frontend hosting (static SPA) |
| **Azure Application Insights** | Monitoring, traces, and telemetry |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│               FRONTEND  (React + Vite on Vercel)             │
│         TanStack Query  │  Axios  │  Tailwind CSS            │
└────────────────────────┬─────────────────────────────────────┘
                         │  REST API (JSON / HTTP)
                         ▼
┌──────────────────────────────────────────────────────────────┐
│          BACKEND  (FastAPI + Uvicorn on Azure Container Apps) │
│   main.py → auth.py → ai_engine.py → database.py            │
│   SlowAPI rate limiting  │  CORS  │  JWT Bearer Auth         │
└───────────┬──────────────────────────┬───────────────────────┘
            │                          │
  ┌─────────▼──────────┐    ┌──────────▼──────────────┐
  │   Azure OpenAI     │    │   Azure Cosmos DB        │
  │   GPT-4o           │    │   SynergyDB (NoSQL)      │
  │   text-embedding   │    │   5 containers           │
  │   -3-small         │    └─────────────────────────┘
  └─────────┬──────────┘
            │
  ┌─────────▼──────────────────────┐
  │  Azure Application Insights    │
  │  (OpenTelemetry Monitoring)    │
  └────────────────────────────────┘
```

**Auth flow:** Login → JWT access token (30 min) + refresh token (7 days) stored in `localStorage`. All API requests include `Authorization: Bearer <token>` automatically.

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 18 or **Bun**
- **Python** 3.10+
- An Azure account with Cosmos DB and Azure OpenAI resources provisioned

### Frontend

```sh
# Clone and install dependencies
npm install

# Create a local env file
cp .env.example .env.local
# Set VITE_API_BASE_URL to your backend URL (or http://localhost:8000 for local dev)

# Start development server (http://localhost:8080)
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

### Backend

```sh
cd backend

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate      # Windows
source .venv/bin/activate   # macOS / Linux

# Install dependencies
pip install -r requirements.txt

# Copy and fill in environment variables
cp .env.example .env

# Start the API server (http://localhost:8000)
uvicorn main:app --reload --port 8000
```

### Docker (Backend)

```sh
# Build image
docker build -t synergy-backend ./backend

# Run with env file
docker run -p 8000:8000 --env-file backend/.env synergy-backend
```

---

## Environment Variables

### Frontend (`.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend API base URL |

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_COSMOS_ENDPOINT` | ✅ | Cosmos DB account endpoint |
| `AZURE_COSMOS_KEY` | ✅ | Cosmos DB primary key |
| `AZURE_OPENAI_ENDPOINT` | ✅ | Azure OpenAI resource endpoint |
| `AZURE_OPENAI_API_KEY` | ✅ | Azure OpenAI API key |
| `AZURE_OPENAI_API_VERSION` | ✅ | API version (e.g. `2024-02-01`) |
| `JWT_SECRET_KEY` | ✅ | Strong random secret for signing JWTs |
| `COSMOS_DATABASE_NAME` | `SynergyDB` | Cosmos DB database name |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | `gpt-4o` | Chat model deployment name |
| `AZURE_EMBEDDING_DEPLOYMENT_NAME` | `text-embedding-3-small` | Embedding model deployment name |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins (set to frontend URL in production) |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | — | Azure Monitor connection string (optional) |

> Generate a strong JWT secret: `python -c "import secrets; print(secrets.token_hex(32))"`

---

## API Reference

All endpoints are prefixed with `/api`. Interactive documentation is available at `/docs` (Swagger UI) and `/redoc`.

### Authentication

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|-----------|
| `POST` | `/api/auth/login` | Email + password → JWT tokens | 5 / min |
| `POST` | `/api/auth/refresh` | Refresh token → new access token | 5 / min |

### Leads

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|-----------|
| `GET` | `/api/leads` | List leads (paginated, RBAC filtered) | 200 / min |
| `POST` | `/api/leads` | Create lead + run AI analysis | 30 / min |
| `PATCH` | `/api/leads/{id}` | Update stage / status | 60 / min |
| `GET` | `/api/leads/{id}/activities` | Activity log for a lead | 200 / min |
| `POST` | `/api/leads/{id}/activities` | Add note / call / email | 60 / min |
| `GET` | `/api/leads/{id}/audit` | Audit trail | 200 / min |
| `POST` | `/api/leads/bulk` | Bulk CSV or PDF ingest | 5 / min |
| `GET` | `/api/leads/export` | Export all leads as CSV | 200 / min |

### Conflicts

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/conflicts` | List pending duplicate conflicts |
| `PATCH` | `/api/conflicts/{id}` | Resolve: Merge / Discard / Keep Both |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List all users |
| `POST` | `/api/admin/users` | Create a new user |
| `PATCH` | `/api/admin/users/{id}` | Update user details |
| `DELETE` | `/api/admin/users/{id}` | Delete a user |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/bu-contacts` | BU manager contact directory |
| `GET` | `/health` | Health check (used by container probes) |

---

## Project Structure

```
synergy-ai/
├── src/                        # React frontend
│   ├── App.tsx                 # Root: QueryClient, AuthProvider, Router
│   ├── context/
│   │   └── AuthContext.tsx     # JWT auth state (login / logout)
│   ├── hooks/
│   │   └── useLeads.ts         # TanStack Query data hooks
│   ├── lib/
│   │   ├── api.ts              # Axios instance + TypeScript API types
│   │   └── exportUtils.ts      # CSV export helpers
│   ├── pages/
│   │   ├── Dashboard.tsx       # KPI cards, charts, activity feed
│   │   ├── LeadWorkbench.tsx   # Table + Kanban pipeline view
│   │   ├── ConflictResolution.tsx
│   │   ├── DataIngestion.tsx   # Manual form + bulk upload
│   │   ├── Reports.tsx         # BU performance analytics
│   │   └── AdminUsers.tsx      # User management (Admin only)
│   └── components/
│       ├── SmartDrawer.tsx     # AI recommendation slide-over panel
│       ├── LeadPipeline.tsx    # Drag-and-drop Kanban board
│       ├── LeadsTable.tsx      # Paginated lead table
│       └── ui/                 # shadcn/ui base components
│
├── backend/
│   ├── main.py                 # FastAPI app, routes, middleware
│   ├── ai_engine.py            # Azure OpenAI + LangGraph AI pipeline
│   ├── database.py             # Cosmos DB client + CRUD operations
│   ├── auth.py                 # JWT auth, bcrypt hashing, RBAC
│   ├── models.py               # Pydantic schemas
│   ├── notifications.py        # Gmail SMTP email service
│   ├── telemetry.py            # Azure Application Insights setup
│   ├── seed_master.py          # Database seeder for demo data
│   ├── requirements.txt
│   └── Dockerfile
│
├── public/
│   └── logo/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── staticwebapp.config.json    # Azure Static Web Apps config (SPA routing)
```

---

## Deployment

### Frontend → Vercel

```sh
# Install Vercel CLI
npm install -g vercel

# Deploy to production
vercel --prod
```

Set `VITE_API_BASE_URL=https://synergy-ai-ucpt.onrender.com` in your Vercel project settings.

### Backend → Render

1. Create a new **Web Service** on [Render](https://render.com) and connect your GitHub repository.
2. Set **Root Directory** to `backend`.
3. Set **Dockerfile Path** to `backend/Dockerfile`.
4. Add all required environment variables in the Render dashboard under **Environment**.
5. Deploy — Render will build the Docker image and start the Uvicorn server on port 8000.

The live backend is running at: `https://synergy-ai-ucpt.onrender.com`

---

## Business Units

Synergy Sales Genius routes leads across the following Chin Hin Group Business Units:

| Business Unit | Specialization |
|---------------|---------------|
| Stucken AAC | Autoclaved Aerated Concrete panels |
| Ajiya Metal / Glass | Roofing, cladding, glass façades |
| Signature Alliance | Interior fit-out & partitions |
| Chin Hin Cement | Ready-mix concrete & cement products |
| CH Precast | Precast structural components |
| Muar Ban Lee | Hardware & building materials distribution |

---

## Roles & Access

| Role | Permissions |
|------|-------------|
| **Admin** | Full access: manage users, view all leads, resolve conflicts, export reports |
| **Sales Rep** | View and update leads assigned to their BU; add activities; view reports |

---

<div align="center">

Built with ❤️ for **Chin Hin Group** · Powered by **Azure OpenAI GPT-4o**

</div>
