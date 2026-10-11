# MIRA: Deployment and Production Configuration Guide

This guide details the deployment architecture, containerization, local execution, CI/CD pipeline, and Render cloud deployment for **MIRA** (Track 1: Bhumi Vikas Sahayak, Bhopal Impact Lab 2026).

---

## 1. Target Deployment Architecture

MIRA is packaged as a **single-origin monolithic container**. This architecture:
* Eliminates Cross-Origin Resource Sharing (CORS) complexity and security risks.
* Avoids multi-container orchestration overhead.
* Guarantees that the browser accesses the React single-page application and the FastAPI REST API through the exact same origin (`https://<domain>/` and `https://<domain>/api/*`).
* Requires **no cloud database**, **no authentication service**, and **no persistent volume**.

```mermaid
graph TD
    Client["Browser / Municipal Counter Client"] -->|HTTPS (Port 443 / $PORT)| Render["Render Web Service / Container Gateway"]
    subgraph Container ["MIRA Container (Single Origin)"]
        Uvicorn["Uvicorn Server (0.0.0.0:$PORT)"]
        FastAPI["FastAPI Application (app.main:app)"]
        API["REST API (/api/health, /api/rules/*, /api/answer, /api/calculate)"]
        SPA["Static SPA Mount (/ -> frontend/dist)"]
        RuleStore["In-Memory Rule Store (RAM: 106 rules, 787 passages)"]
        CerebrasClient["Optional Cerebras LLM Client (cerebras-cloud-sdk)"]
    end
    Render --> Uvicorn
    Uvicorn --> FastAPI
    FastAPI --> API
    FastAPI --> SPA
    API --> RuleStore
    API -.->|Optional AI Inference| CerebrasClient
    CerebrasClient -.->|Upstream TLS| CerebrasAPI["Cerebras Inference Cloud (llama3.1-70b / gpt-oss-120b)"]
```

* **Frontend:** React 19 + TypeScript + Vite, compiled into static assets in `frontend/dist/`.
* **Backend:** FastAPI + Uvicorn, serving the API routes under `/api/*` and serving `frontend/dist/` at the root path (`/`). Any non-API route falls back to `index.html` for client-side routing.
* **Statutory Data:** Packaged locally in `data/` (`bhumi_vikas_rules.jsonl`, `bhumi_vikas_rules_fulltext_by_page.txt`, `DATA_DICTIONARY.md`). No external data fetching during container boot.

---

## 2. Environment Variables Specification

The application uses Pydantic Settings (`backend/app/config.py`). All variables are optional for startup:

| Variable | Type | Default | Required | Purpose |
|---|---|---|:---:|---|
| `APP_ENV` | String | `development` | No | Environment identifier (`development`, `production`, `test`). |
| `PORT` | Integer | `8000` | No | Port on which Uvicorn binds HTTP requests. Set dynamically by Render via `$PORT`. |
| `CEREBRAS_API_KEY` | String (Secret) | *None* | No | Optional API key for Cerebras Cloud inference. If absent, the app operates in offline deterministic mode. |
| `CEREBRAS_MODEL` | String | `gpt-oss-120b` | No | Cerebras model identifier (e.g., `llama-3.3-70b`, `llama3.1-70b`, `gpt-oss-120b`). |
| `CEREBRAS_TIMEOUT_S` | Float | `20.0` | No | Timeout in seconds before abandoning live AI and providing verified rule citations. |

> [!IMPORTANT]
> **Secret Safety Rule:** Real credentials must **never** be committed to Git. `CEREBRAS_API_KEY` is read strictly on the server via `SecretStr`. Never prefix secrets with `VITE_` or expose them in client bundles.

---

## 3. Local Execution Modes

### Mode A: Separate Development Servers (Hot Reloading)

Used during active development of frontend components and backend endpoints:

1. **Terminal 1 — Backend:**
   ```bash
   cd backend
   python -m venv .venv
   # Windows PowerShell:
   .venv\Scripts\Activate.ps1
   # Linux / macOS:
   source .venv/bin/activate

   pip install -r requirements-dev.txt
   uvicorn app.main:app --reload --port 8000
   ```
   * Backend runs at: [http://localhost:8000](http://localhost:8000)
   * Swagger docs: [http://localhost:8000/api/docs](http://localhost:8000/api/docs)
   * Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

2. **Terminal 2 — Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   * Frontend runs at: [http://localhost:5173](http://localhost:5173)
   * Vite proxies all `/api/*` calls directly to `http://localhost:8000`.

---

### Mode B: Local Single-Origin Production Simulation

To verify how the application behaves in production without Docker:

```bash
# 1. Build the frontend production bundle
cd frontend
npm run build
cd ..

# 2. Run the FastAPI backend
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser. FastAPI serves both the React UI and the `/api/*` endpoints from port 8000.

---

## 4. Docker Containerization

### 4.1. Multi-Stage Dockerfile (`Dockerfile`)

The production Dockerfile uses a clean two-stage build:
* **Stage 1 (`node:22-slim`):** Compiles the TypeScript + React frontend into static assets (`frontend/dist`).
* **Stage 2 (`python:3.13-slim`):** Installs Python dependencies, copies backend code, copies static assets from Stage 1, packages local regulatory datasets, and executes under a non-root `appuser` (UID 10001).

```dockerfile
# Stage 1: Build frontend
FROM node:22-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# Stage 2: Python runtime
FROM python:3.13-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install -r backend/requirements.txt

COPY backend/app backend/app
COPY data/ data/
COPY --from=frontend /build/frontend/dist frontend/dist

RUN useradd --create-home --uid 10001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/health', timeout=4)" || exit 1

WORKDIR /app/backend
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
```

### 4.2. Building and Running the Image

When Docker is installed on your workstation:

```bash
# Build the production image
docker build -t mira:latest .

# Run the container (offline mode without Cerebras key)
docker run -d --name mira -p 8000:8000 mira:latest

# Or run with Cerebras AI enabled
docker run -d --name mira -p 8000:8000 \
  -e CEREBRAS_API_KEY="your_api_key_here" \
  -e CEREBRAS_MODEL="gpt-oss-120b" \
  mira:latest
```

Verify the container:
```bash
# Test health endpoint
curl http://localhost:8000/api/health

# Open UI
# Visit http://localhost:8000
```

---

## 5. Production Health Check & Readiness

The endpoint `GET /api/health` validates system health without requiring authentication or AI credentials:

```bash
curl http://localhost:8000/api/health
```

### Response Schema (HTTP 200 OK):
```json
{
  "status": "ok",
  "rules_loaded": 106,
  "passages_indexed": 787,
  "pages_loaded": 108,
  "verified_sources": {
    "ok": 13,
    "total": 13
  },
  "ai_configured": false,
  "frontend_built": true
}
```

* **`status`**: `"ok"` when regulatory rules and text are loaded; returns `"degraded"` (HTTP 503) if essential data files are missing.
* **`rules_loaded`**: Total statutory rules indexed in memory (106 rules).
* **`passages_indexed`**: Total searchable passages (787 passages).
* **`pages_loaded`**: Total gazette pages extracted (108 pages).
* **`verified_sources`**: Object detailing verified statutory source tables (`ok`: verified count, `total`: table count).
* **`ai_configured`**: Boolean indicating whether `CEREBRAS_API_KEY` is present.
* **`frontend_built`**: Boolean confirming `frontend/dist/index.html` exists.

---

## 6. Render Deployment (Blueprint Specification)

The repository includes a root-level `render.yaml` declaring the web service:

```yaml
services:
  - type: web
    name: mira
    runtime: docker
    region: singapore
    plan: free
    dockerfilePath: ./Dockerfile
    dockerContext: .
    healthCheckPath: /api/health
    autoDeploy: true
    envVars:
      - key: APP_ENV
        value: production
      - key: CEREBRAS_API_KEY
        sync: false
      - key: CEREBRAS_MODEL
        value: gpt-oss-120b
      - key: CEREBRAS_TIMEOUT_S
        value: "20"
```

### Manual Steps to Deploy on Render

1. **Commit and Push:**
   Ensure all changes are pushed to your GitHub repository on `main`.
2. **Open Render Dashboard:**
   Sign in to [dashboard.render.com](https://dashboard.render.com).
3. **Deploy with Blueprint:**
   * Click **New +** and select **Blueprint**.
   * Connect your GitHub repository (`ut3av/ImpactLab`).
   * Render detects `render.yaml` and displays the service specification.
   * Click **Apply**.
4. **Configure Secrets (Optional):**
   * In the service dashboard, open the **Environment** tab.
   * Enter your `CEREBRAS_API_KEY` value under the `CEREBRAS_API_KEY` variable.
   * Click **Save Changes**.
5. **Verify Deployment:**
   * Render will assign a public domain: `https://mira.onrender.com` (or similar).
   * Test health: `https://<your-service>.onrender.com/api/health`.
   * Open the URL in a browser and submit a building regulation query.

> [!NOTE]
> **Render Free Plan Limitations:**
> * The free web service spins down after 15 minutes of inactivity.
> * The first request after spindown may incur a cold-start delay of ~30–50 seconds while the container initializes. Subsequent requests respond in < 150ms.

---

## 7. Vercel Deployment (Frontend Edge Deployment)

For teams preferring Vercel's global Edge CDN for the React frontend while running the FastAPI service on Render:

### Architecture

```mermaid
graph LR
    Browser["Client Browser"] -->|HTTPS (Edge CDN)| Vercel["Vercel (React 19 SPA)"]
    Vercel -->|Rewrites /api/*| RenderBackend["Render Web Service (FastAPI /api/*)"]
```

The repository includes `vercel.json` (root) and `frontend/vercel.json` with SPA routing and API proxy rewrites:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "buildCommand": "npm --prefix frontend run build",
  "outputDirectory": "frontend/dist",
  "cleanUrls": true,
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://mira.onrender.com/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Steps to Deploy Frontend to Vercel:
1. **Push code to GitHub.**
2. **Import into Vercel:** In [vercel.com/dashboard](https://vercel.com/dashboard), click **Add New...** $\to$ **Project**, then import `ImpactLab`.
3. **Configure Project:**
   * **Framework Preset:** Vite
   * **Root Directory:** `./` (or `frontend` if deploying only the frontend folder)
   * **Build Command:** `npm --prefix frontend run build` (or `npm run build` if Root is `frontend`)
   * **Output Directory:** `frontend/dist` (or `dist` if Root is `frontend`)
4. **Environment Variables (Optional):**
   * If your Render backend is not `https://mira.onrender.com`, set:
     `VITE_API_BASE_URL=https://<your-actual-service>.onrender.com`
5. **Click Deploy:** Vercel deploys the application with global edge caching and instant atomic invalidation.

---

## 8. Continuous Integration (GitHub Actions)

The repository includes `.github/workflows/ci.yml` which triggers on every pull request and push to `main`:
1. **Frontend Job:** Runs Node 22, `npm ci`, `oxlint`, `vitest` unit tests, and production build (`tsc -b && vite build`).
2. **Backend Job:** Runs Python 3.13, installs `requirements-dev.txt`, executes 116 pytest tests, and runs the 17-question evaluation benchmark (`backend/scripts/eval_samples.py`).
3. **Docker Job:** Validates that the multi-stage Dockerfile builds successfully using `docker/build-push-action`.

---

## 9. Troubleshooting & Common Issues

| Symptom | Likely Cause | Resolution |
|---|---|---|
| **Health endpoint returns 503 `status: degraded`** | `data/bhumi_vikas_rules.jsonl` or `bhumi_vikas_rules_fulltext_by_page.txt` missing or unreadable | Ensure `data/` directory is copied in Dockerfile and not excluded in `.dockerignore`. |
| **Blank white page in browser** | Frontend build assets missing in `frontend/dist/` | Run `npm run build` in `frontend/` before launching backend locally, or check Stage 1 in Dockerfile. |
| **Live AI explanation shows "AI Inference Offline"** | `CEREBRAS_API_KEY` not set | This is expected behavior; the system falls back to verified deterministic templates. Add the key in `.env` or Render environment settings to enable live LLM generation. |
| **Port binding conflict (EADDRINUSE: 8000)** | Another process is already running on port 8000 | Set `PORT=8080` in `.env` or run `uvicorn app.main:app --port 8080`. |
| **Docker command not recognized on local host** | Docker Desktop is not installed on the Windows machine | Install Docker Desktop for Windows or rely on the GitHub Actions CI workflow to verify container builds. |
