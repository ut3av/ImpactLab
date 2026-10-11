# NIYAMLENS — single-service image: FastAPI serves the API (/api) and the built React app (/).
# The image keeps the repository layout (/app/backend, /app/data, /app/frontend/dist) so the
# backend finds its data and static files exactly as it does in local development.

# ---- Stage 1: build the React frontend -------------------------------------------------
FROM node:22-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
# Type-check and build; a failing build fails the image build.
RUN npm run build

# ---- Stage 2: Python runtime -----------------------------------------------------------
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
# Packaged regulatory data the server reads at runtime (JSONL + page text + dictionary).
COPY data/ data/
COPY --from=frontend /build/frontend/dist frontend/dist

RUN useradd --create-home --uid 10001 appuser && chown -R appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/health', timeout=4)" || exit 1

WORKDIR /app/backend
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
