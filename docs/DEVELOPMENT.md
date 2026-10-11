# NIYAMLENS: Development Guide

This guide details how to set up, run, test, and troubleshoot the NIYAMLENS development environment.

---

## 1. Prerequisites

Ensure your workstation has the following tools installed:
* **Python**: 3.11 or higher (`python --version`)
* **Node.js**: 18.0 or higher (`node --version` — Node 20 LTS recommended)
* **npm**: 9.0 or higher (`npm --version`)
* **Git**: Installed and configured

---

## 2. Repository Layout

```text
ImpactLab/
├── backend/                  # FastAPI application & calculation engines
│   ├── app/
│   │   ├── api/              # REST endpoints (/api)
│   │   ├── calculations/     # Deterministic legal math (setbacks, fees, electric)
│   │   ├── models/           # Pydantic schemas and types
│   │   ├── rules/            # Rule loaders, chunker, verified tables, warnings
│   │   └── services/         # Answer orchestration, retrieval, LLM client
│   ├── scripts/              # Evaluation scripts (eval_samples.py)
│   ├── tests/                # Pytest test suite (116 tests)
│   ├── requirements.txt      # Production runtime dependencies
│   └── requirements-dev.txt  # Test & development dependencies
├── data/                     # Statutory datasets (JSONL, full text, dictionary)
├── docs/                     # Technical specifications and guides
├── frontend/                 # React 19 + TypeScript + Vite SPA
│   ├── src/
│   │   ├── components/       # UI primitives (shadcn / Radix)
│   │   ├── features/         # plot3d (PlotScene3D.tsx) & inputs panel
│   │   ├── lib/              # API clients, geometry helpers, input schemas
│   │   └── types/            # TypeScript API types
│   └── package.json          # Frontend dependencies & scripts
├── resources/                # Official PDFs, problem statement, sample questions
├── .env.example              # Environment variables template
├── prd.md                    # Product Requirements Document
└── README.md                 # Project landing page
```

---

## 3. Backend Setup & Local Server

### 3.1. Virtual Environment Setup
Open a terminal in the repository root:

```bash
# 1. Create a Python virtual environment
python -m venv .venv

# 2. Activate the virtual environment
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Linux / macOS:
source .venv/bin/activate

# 3. Install backend dependencies
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### 3.2. Environment Configuration
Copy the sample environment file to the repository root:

```bash
cp ../.env.example ../.env
```

| Variable | Description | Default | Required? |
| -------- | ----------- | ------- | --------- |
| `CEREBRAS_API_KEY` | Cerebras Cloud API Key for AI explanations. | *Empty* | **No** (runs offline with template answers) |
| `CEREBRAS_MODEL` | Cerebras model identifier. | `gpt-oss-120b` | No |
| `CEREBRAS_TIMEOUT_S`| Timeout before falling back to templates. | `20` | No |
| `PORT` | HTTP port for backend server. | `8000` | No |

### 3.3. Running the Backend Server
Start the development server with live reload:

```bash
uvicorn app.main:app --reload --port 8000
```

Verify that the backend is running:
* **Health Check**: [http://localhost:8000/api/health](http://localhost:8000/api/health)
* **OpenAPI Docs**: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
* **Sources Metadata**: [http://localhost:8000/api/sources](http://localhost:8000/api/sources)

---

## 4. Frontend Setup & Development

### 4.1. Installing Frontend Dependencies
Open a second terminal window:

```bash
cd frontend
npm install
```

### 4.2. Running the Frontend Dev Server
```bash
npm run dev
```
The Vite development server runs at `http://localhost:5173`. By default, Vite proxies `/api` requests to the FastAPI backend running at `http://localhost:8000`.

### 4.3. Available Frontend Scripts
* `npm run dev`: Starts local Vite development server with Hot Module Replacement (HMR).
* `npm run lint`: Runs `oxlint` for fast code linting.
* `npm run build`: Compiles TypeScript and builds the production bundle into `frontend/dist`.
* `npm run preview`: Previews the production build locally.

---

## 5. Testing & Verification

### 5.1. Running Backend Unit Tests
Execute the comprehensive Pytest suite:

```bash
cd backend
pytest -v
```
All 116 tests should pass in under 2 seconds.

### 5.2. Running the 17 Sample Questions Benchmark
To test the end-to-end question answering pipeline against the real Track 1 counter questions:

```bash
cd backend
python scripts/eval_samples.py
```
This script evaluates each question, checks for expected primary statuses, verifies citations, and records the output to `docs/evaluation_results.json`.

To run with live Cerebras AI explanation enabled (requires valid `CEREBRAS_API_KEY` in `.env`):
```bash
python scripts/eval_samples.py --ai
```

---

## 6. Known Development Caveats & Troubleshooting

### 6.1. TypeScript 6 Compiler Deprecation (`baseUrl`)
When running `npm run build` with TypeScript 6 (`typescript@~6.0.2`), you may observe:
```text
tsconfig.app.json(27,5): error TS5101: Option 'baseUrl' is deprecated and will stop functioning in TypeScript 7.0.
```
**Fix:** In `frontend/tsconfig.app.json`, add `"ignoreDeprecations": "6.0"` under `compilerOptions` or remove the redundant `baseUrl: "."` if path aliases are already configured.

### 6.2. Port 8000 Already in Use
If port 8000 is occupied by another process:
```bash
uvicorn app.main:app --reload --port 8080
```
Update Vite's proxy configuration in `frontend/vite.config.ts` accordingly.

### 6.3. Running Without Cerebras API Key
If no `CEREBRAS_API_KEY` is provided, the backend logs:
```text
INFO niyamlens: AI explanation disabled (no CEREBRAS_API_KEY)
```
This is expected behavior. The application seamlessly serves deterministic, verified template answers in English and Hindi without error.
