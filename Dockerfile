# Un solo contenedor en ejecución: FastAPI + programador + export web de la app.
# La etapa Node solo compila la web (npx expo export) y no queda en la imagen final.
FROM node:22-slim AS web
WORKDIR /mobile
COPY mobile/package.json mobile/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mobile/ ./
RUN npx expo export -p web

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    STATIC_DIR=/app/static

WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY backend/cli.py .
COPY --from=web /mobile/dist ./static

RUN useradd --create-home --uid 1000 screener && mkdir -p /data && chown screener /data
USER screener
VOLUME /data
EXPOSE 8000

HEALTHCHECK --interval=60s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4)"

# un único worker: el programador vive dentro del proceso y no debe duplicarse
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
