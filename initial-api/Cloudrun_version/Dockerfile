# Python 3.11
FROM python:3.11-slim
# or, if you’re fine with 3.12
# FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -U pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8080
CMD ["gunicorn", "--bind", ":8080", "--workers", "1", "--worker-class", "sync", "--timeout", "300", "main:app"]
