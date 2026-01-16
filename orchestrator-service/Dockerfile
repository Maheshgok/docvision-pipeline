# Orchestrator Service - LIGHTWEIGHT
# Uses google-cloud-firestore directly (NOT firebase_admin) for CRUD ops
FROM python:3.11-slim

WORKDIR /app

# Use lightweight requirements (no firebase_admin, no openai)
COPY requirements.txt requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Use refactored main.py (no job creation - handled by initial-api)
COPY main.py main.py

ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PROJECT_ID=watch-mail-trial

CMD exec gunicorn --bind :$PORT --workers 1 --threads 2 --timeout 60 main:app
