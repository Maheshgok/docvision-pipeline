# Optimized Dockerfile for data-combiner  
# Focus: Faster startup, memory efficiency, Firestore SDK optimization
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies efficiently
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy and install requirements first (for layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Optimize Python runtime and Google Cloud SDK
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    GOOGLE_CLOUD_PROJECT="" \
    GOOGLE_APPLICATION_CREDENTIALS="" 

# Configure Gunicorn for Cloud Run with startup optimizations
ENV PORT=8080 \
    GUNICORN_CMD_ARGS="--bind 0.0.0.0:8080 --workers 1 --worker-class gthread --threads 4 --timeout 120 --keep-alive 2 --max-requests 1000 --max-requests-jitter 100 --worker-tmp-dir /dev/shm"

# Health check optimized for startup delays  
HEALTHCHECK --interval=30s --timeout=30s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080

# Use gunicorn directly for better startup control
CMD exec gunicorn main:app