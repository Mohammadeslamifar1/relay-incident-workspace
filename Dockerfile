FROM node:24-alpine AS web
WORKDIR /build
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM python:3.14-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml requirements.lock README.md LICENSE ./
COPY apps/api ./apps/api
RUN pip install --no-cache-dir -c requirements.lock . \
    && useradd --create-home --uid 10001 relay
COPY alembic.ini ./
COPY migrations ./migrations
COPY scripts/container-entrypoint.sh ./entrypoint.sh
COPY --from=web /build/dist ./apps/web/dist
RUN mkdir -p /app/data && chown -R relay:relay /app \
    && sed -i 's/\r$//' /app/entrypoint.sh && chmod +x /app/entrypoint.sh
USER relay
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"
ENTRYPOINT ["/app/entrypoint.sh"]
