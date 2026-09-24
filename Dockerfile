FROM node:22-bookworm-slim AS frontend-build

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    QLP_FRONTEND_DIST=/app/frontend/dist \
    QLP_PUBLIC_MODE=true \
    PORT=10000

WORKDIR /app/backend
COPY backend/requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && \
    python -m pip install -r requirements.txt && \
    useradd --create-home --uid 10001 appuser

COPY --chown=appuser:appuser backend/ /app/backend/
COPY --from=frontend-build --chown=appuser:appuser /build/frontend/dist /app/frontend/dist

USER appuser
EXPOSE 10000

CMD ["sh", "-c", "exec python -m uvicorn app.main:create_app --factory --host 0.0.0.0 --port \"${PORT:-10000}\""]
