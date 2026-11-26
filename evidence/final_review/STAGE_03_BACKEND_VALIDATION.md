# STAGE 03 — Backend Validation and Error Handling Fix

**Status:** **PASS**

## 1. Root Cause
- [backend/src/routes/demo.routes.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/routes/demo.routes.js) checked `!quantity || quantity < 1`, allowing non-numeric strings (`"abc"`), floats, etc. to pass (`HTTP 201`).
- [backend/src/config/environment.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/config/environment.js) did not validate `PORT` or `EXECUTION_MODE`.
- [backend/src/app.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/app.js) had no JSON 404 handler for unknown `/api/*` routes and no explicit JSON body limit.

## 2. Exact Changes Made
- Exported `parseEnvironment()` in `environment.js` validating `PORT` (`^\d+$`, `1..65535`), `EXECUTION_MODE` (`simulation` | `kubernetes`), and `RATE_LIMIT_MAX` (`>= 1`).
- Enforced strict validation in `POST /api/demo/orders` (`typeof productId === 'string' && productId.trim()`, `typeof quantity === 'number' && Number.isInteger(quantity) && quantity >= 1`) and in `services/order-service/src/server.js`.
- Set `express.json({ limit: '100kb' })` and added a JSON 404 handler for `/api/*` in `backend/src/app.js`.
- Added negative tests in [backend/tests/demo.test.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/tests/demo.test.js), [backend/tests/health.test.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/tests/health.test.js), and [backend/tests/validation-security.test.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/tests/validation-security.test.js).

## 3. Verification Evidence
- `npm test` (`35/35` **PASS**): verified `0`, `1.5`, `"2"`, `"abc"`, `null`, and blank `productId` return `HTTP 400`; `PORT` and `EXECUTION_MODE` rejections; malformed JSON (`400`), oversized payload >100kb (`413`), and unknown `/api/*` JSON `404`.
- `node test_e2e.js` (`12/12` **PASS** in `23.98s`).
