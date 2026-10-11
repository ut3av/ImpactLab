# Stage 1: Build React Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /build

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
# Build production assets into /build/dist
RUN npm run build || true

# Stage 2: Production Python Runtime
FROM python:3.11-slim
WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install backend dependencies
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and statutory datasets
COPY backend/app ./app
COPY data/ ./data
COPY resources/ ./resources

# Copy built frontend assets (if built) into frontend/dist
COPY --from=frontend-builder /build/dist ./frontend/dist

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
