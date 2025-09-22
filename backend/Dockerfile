# syntax=docker/dockerfile:1

FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System deps: libheif for HEIC decode
RUN apt-get update && apt-get install -y --no-install-recommends \
    libheif1 libheif-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && pip install -r requirements.txt

COPY backend /app

EXPOSE 8000

# Expect env via docker-compose: GEMINI_API_KEY
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 