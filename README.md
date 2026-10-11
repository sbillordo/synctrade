# SyncTrade

Screener técnico: retroceso de Fibonacci (0.618 / 0.786) + POC de volumen por encima + RSI en la banda inferior (30) + EWO negativo + sin huecos abiertos, en 1h, 4h y 1d.
Escaneos programados en horario de Nueva York, API FastAPI, app iOS (Expo) con notificaciones push.

Herramienta de cribado técnico; no es una recomendación de inversión.

## Estructura

```
backend/
  app/
    core/        indicadores y evaluación (fibo, POC, RSI, EWO, score, plan de trade)
    data/        fuente de datos (yfinance) + caché incremental en Parquet
    db.py        SQLite: escaneos, últimos resultados, señales, universos, favoritos, ajustes
    scanner.py   escaneo completo y ficha de un ticker
    scheduler.py horarios de los escaneos
    notify.py    notificaciones push (Expo Push -> APNs)
    main.py      API
  cli.py         escaneo desde terminal
  tests/
mobile/          app Expo (iOS + export web servido por FastAPI)
prototype/       prototipo HTML aprobado (referencia de diseño)
data/            (se crea solo) screener.db + cache/
```

## Local

```bash
cd backend
pip install -r requirements-dev.txt
pytest
python cli.py --universe nasdaq100 --min-cond 3
python cli.py --tickers AAPL NVDA --tf 4h 1d
SCHEDULER_ENABLED=0 uvicorn app.main:app --reload     # API en http://localhost:8000/docs
```

## Servidor (Linux + Docker + Tailscale)

```bash
cp .env.example .env
mkdir -p data && sudo chown 1000:1000 data
docker compose up -d --build
tailscale serve --bg 8000     # HTTPS en https://<server>.<tailnet>.ts.net
curl -X POST localhost:8000/api/push/test   # tras activar las notificaciones en la app
```

El contenedor escucha solo en `127.0.0.1:8000`; el acceso externo es únicamente por Tailscale.

## Horario (Nueva York, lunes a viernes)

| Hora | Temporalidades |
|---|---|
| 07:30 | 1h · 4h · 1d (+ precio pre-market) |
| 10:35, 11:35, 12:35, 14:35, 15:35 | 1h |
| 13:35 | 1h · 4h |
| 16:10 | 1h · 4h · 1d |
| Sábado 08:00 | refresco de universos |

Los festivos están en `backend/app/market.py`: revisar cada año contra el calendario oficial de NYSE.

## App iOS (Expo)

```bash
cd mobile
npm install
npx expo export -p web          # versión web: la sirve FastAPI en la misma dirección
npx eas-cli@latest login        # cuenta Expo (gratis)
npx eas-cli@latest init         # crea el proyecto EAS (projectId, necesario para push)
# en app.json: cambia ios.bundleIdentifier (com.CHANGE-ME.synctrade) por uno tuyo
npx eas-cli@latest build -p ios --profile production    # pide tu cuenta Apple Developer y crea certificados y clave APNs
npx eas-cli@latest submit -p ios --latest                # sube a App Store Connect -> TestFlight
```

En el iPhone: instala TestFlight, acepta la build, abre SyncTrade, en **Settings** pon la dirección de Tailscale del servidor (`https://<server>.<tailnet>.ts.net`) y activa **Notifications**. Tailscale tiene que estar activo en el iPhone para ver los datos; las notificaciones llegan siempre.

## Notificaciones

Un setup se identifica por ticker + temporalidad + swing (fechas del mínimo y máximo) + nivel fibo.
Se avisa la primera vez que alcanza `ALERT_MIN_COND` condiciones (5 de 5 por defecto) y cuando sube de nivel; nunca se repite.
Solo se marca como avisado si el servicio de push acepta el envío; si falla, se reintenta en el siguiente escaneo.
