# =============================================================================
# Multi-stage Dockerfile: Frontend + Backend in single container for Railway
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend (Node.js)
# -----------------------------------------------------------------------------
FROM node:18-alpine AS frontend-builder

WORKDIR /build

# Copy package files first for better caching
COPY frontend/package.json frontend/package-lock.json ./

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Python Runtime (FastAPI + Uvicorn)
# -----------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt

# Copy backend source code
COPY backend /app/backend

# Copy frontend build output to backend static directory
COPY --from=frontend-builder /build/dist /app/backend/app/static

WORKDIR /app/backend

# Railway injects PORT; default to 8000 for local development
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
