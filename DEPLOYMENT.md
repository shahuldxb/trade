# TF_genie Trade Finance — Deployment Summary

## Architecture Overview

The application consists of three tiers:

| Tier | Technology | Port | Status |
|------|-----------|------|--------|
| **Frontend** | React + Vite + TailwindCSS | 5173 | Served by Node.js Express |
| **Node.js API Server** | Express + TypeScript | 5000 | Running |
| **Python FastAPI Backend** | FastAPI + Uvicorn | 8000 | Running |

---

## Public Deployed URLs (Manus Sandbox)

| Service | Public URL |
|---------|-----------|
| **Frontend / Node.js Server** | https://5000-i9sk63h7wa75q86yhehrw-a8f06176.sg1.manus.computer |
| **Python FastAPI Backend** | https://8000-i9sk63h7wa75q86yhehrw-a8f06176.sg1.manus.computer |
| **Python API Docs (Swagger)** | https://8000-i9sk63h7wa75q86yhehrw-a8f06176.sg1.manus.computer/docs |

---

## Environment Files

### Python Backend (`Python/.env`)
- Azure OpenAI (gpt-4o, text-embedding-3-large)
- Azure Document Intelligence
- PostgreSQL (pgvector)
- SQL Server (203.101.44.46 — TF_genie, universal, tf_back)
- SMTP (Gmail)

### Node.js Server (`server/.env`)
- SQL Server (192.168.1.72 — cosmicdust, TF_genie, mlc)
- Azure OpenAI
- JWT Secret

### Frontend (`client/.env`)
- `VITE_NODE_API_URL` → Node.js server
- `VITE_BACKEND_URL` → Python FastAPI server

---

## How to Start Services

### Python FastAPI (port 8000)
```bash
cd Python
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Node.js Express + Frontend (port 5000)
```bash
# From project root
pnpm tsx server/index.ts
```

### All at once (development)
```bash
pnpm dev
```

---

## Python FastAPI Routes (114 total)

Key route groups:
- `/api/lc/*` — Letter of Credit analysis, OCR, MT conversion, QA
- `/api/lc/sanction/*` — Sanctions screening
- `/api/lc/tbml/*` — Trade-Based Money Laundering detection
- `/api/lc/goods-matcher/*` — Goods description matching
- `/api/lc/mt/*` — SWIFT MT message generation
- `/api/lc/amendment/*` — LC amendment processing
- `/api/lc/fourtysix_a/*` — Field 46A processing
- `/api/lc/ingest/*` — Document ingestion
- `/api/lc/email/*` — Email notifications

Full Swagger UI: `http://localhost:8000/docs`

---

## Node.js API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Database health check |
| POST | `/api/login` | User authentication |
| GET | `/api/status` | **NEW** Full system status dashboard |
| GET | `/api/python-health` | **NEW** Python FastAPI health proxy |
| GET | `/api/routes` | **NEW** Route registry |

---

## Enhancements Added

### 1. `server/statusRoutes.ts` (New File)
A comprehensive system diagnostics API with three new endpoints:

- **`GET /api/status`** — Returns server uptime, memory usage, CPU info, database health, and Python API URL
- **`GET /api/python-health`** — Proxies a health check to the Python FastAPI backend and returns connectivity status
- **`GET /api/routes`** — Self-documenting route registry listing all available API endpoints

### 2. `audit/audit_middleware.py` (New File)
Request/response audit logging middleware for the Python FastAPI backend that:
- Attaches a unique `request_id` to every request
- Logs method, path, status code, user ID, and duration
- Stores audit context in `request.state.audit` for downstream use

### 3. `audit/audit_service.py` (New File)
Route-level audit configuration service that:
- Scans all registered FastAPI routes at startup
- Maintains a registry of audit settings per route
- Supports enabling/disabling audit logging per route

### 4. `routes/qa.py` (Fixed)
Fixed a critical bug where the RAG pipeline initialization failure raised an `HTTPException` at **import time**, preventing the entire FastAPI application from starting. Changed to lazy initialization — the app starts normally and returns HTTP 503 only when the `/api/lc/trade_qa` endpoint is actually called.

---

## Database Connectivity Note

The SQL Server databases (`192.168.1.72` and `203.101.44.46`) are on your **local network** and are not reachable from this cloud sandbox. All API routes that do not require database access will work normally. Routes that query the database will return connection errors until the app is deployed on a machine with network access to those servers.
