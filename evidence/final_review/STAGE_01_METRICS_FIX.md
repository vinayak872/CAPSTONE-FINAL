# STAGE 01 — Prometheus Metric Integrity Fix

**Status:** **PASS**

## 1. Root Cause
- [backend/src/routes/metrics.routes.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/routes/metrics.routes.js) and [services/order-service/src/server.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/services/order-service/src/server.js) artificially incremented `500` and `200` HTTP request counters inside `GET /metrics` whenever `FAULT_MODE === 'true'` or `RELEASE_VERSION === 'v3.0'`. Every Prometheus scrape fabricated application failures regardless of real traffic.
- In [backend/src/routes/demo.routes.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/routes/demo.routes.js), `GET /api/demo/products` and `POST /api/demo/orders` attempted to proxy to `order-service` before evaluating `failureModes.elevatedErrorRate`, masking gateway fault mode behind a healthy `order-service`.

## 2. Exact Changes Made
- Removed artificial counter increments from `GET /metrics` in `backend/src/routes/metrics.routes.js` and `services/order-service/src/server.js`.
- Moved `failureModes` evaluation ahead of `order-service` proxying in `backend/src/routes/demo.routes.js` so genuine HTTP `500`/`503` responses are emitted and counted by `metricsMiddleware`.
- Exported `createOrderApp()` with per-instance `prom-client` `Registry` in `services/order-service/src/server.js` to prevent duplicate collector registration during tests.
- Added [backend/tests/metrics.test.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/tests/metrics.test.js) and [services/order-service/tests/server.test.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/services/order-service/tests/server.test.js).

## 3. Verification Evidence
- `npm test` (`backend/tests/metrics.test.js` 3/3 **PASS**): verified `200` and `503` counter increments, real `500` increments under failure injection, and zero counter fabrication across repeated `/metrics` scrapes even with `FAULT_MODE=true` and `RELEASE_VERSION=v3.0`.
- `npm --prefix services/order-service test` (3/3 **PASS**): verified repeated `/metrics` scrapes with `FAULT_MODE=true` emit no fabricated `status_code="500"` counters.
