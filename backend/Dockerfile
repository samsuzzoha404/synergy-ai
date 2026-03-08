# =============================================================================
# Synergy Sales Genius — Backend Dockerfile
# =============================================================================
# Builds a production-ready image for Azure Container Apps / App Service.
#   docker build -t synergy-backend ./backend
#   docker run -p 8000:8000 --env-file backend/.env synergy-backend
# =============================================================================

FROM python:3.10-slim

# --- Security: run as non-root user ---
RUN groupadd --gid 1001 appuser && \
    useradd --uid 1001 --gid appuser --shell /bin/bash --create-home appuser

# --- Set working directory ---
WORKDIR /app

# --- Install system dependencies required by pdfplumber (poppler-utils) ---
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpoppler-cpp-dev \
    && rm -rf /var/lib/apt/lists/*

# --- Copy and install Python dependencies first (layer-cached) ---
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# --- Copy application source ---
COPY --chown=appuser:appuser . .

# --- Switch to non-root user ---
USER appuser

# --- Expose the API port ---
EXPOSE 8000

# --- Health check for Azure Container Apps ---
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# --- Start the API server ---
# Use 4 workers; tune via UVICORN_WORKERS env var for the container size.
# --proxy-headers: trusts X-Forwarded-For from Azure Front Door / Application Gateway.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-4} --proxy-headers --forwarded-allow-ips='*'"]
