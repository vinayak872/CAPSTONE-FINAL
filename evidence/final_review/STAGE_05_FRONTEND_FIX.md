# STAGE 05 — Frontend Dashboard Corrections

**Status:** **PASS** (Static assets, ESLint, and API integration verified; live Chrome DevTools inspection **BLOCKED**; React migration **NOT APPLICABLE** per `research_paper.md`)

## 1. Root Cause
- [frontend/index.html](file:///Users/vinayakkumar/Desktop/cloud05-capstone/frontend/index.html) hardcoded `HEALTHY`, `Step 9/9`, `4 Ready / 4 Total`, `cloud05-capstone:v1.0`, `SUCCESSFUL`, `Gateway ↔ Order-Service: Connected`, and outdated `80%-90%` research figures.
- [frontend/js/app.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/frontend/js/app.js) only logged `console.error` on polling failure without showing an offline banner, loading indicator, or last-refresh timestamp, and left stale GitOps DOM values intact when cluster objects were `null`.

## 2. Exact Changes Made
- Added [backend/src/routes/research.routes.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/routes/research.routes.js) (`GET /api/research`) serving [experiment_raw_data.json](file:///Users/vinayakkumar/Desktop/cloud05-capstone/evidence/final_review/experiment_raw_data.json), and updated `frontend/index.html` + `frontend/js/app.js` (`fetchResearch()`) to load recorded benchmark numbers dynamically (showing `Unavailable` if unreachable).
- Changed initial HTML defaults to `Unknown` / `Offline` / `--`, added `#loading-indicator` (`Loading...` -> `Polling (1s)`), `#last-refresh-time`, and `#api-connection-banner` on `/api/status` failure.
- Clearly separated App Health, K8s, Argo Rollouts, Argo CD, and Prometheus pills (`Online` vs `Unavailable` vs `Unknown`), and updated Mesh card to reflect actual `order_service_rollout` state.
- **React Decision:** `research_paper.md` (Section 4.1) and `README.md` explicitly specify **Vanilla JavaScript** polling `/api/status`, `/api/config`, and `/api/events`. Preserving the existing Vanilla JS dashboard avoids breaking working features or introducing unnecessary build complexity (Rules 1 & 2).

## 3. Verification Evidence
- `npm run lint` (`frontend/js/app.js`): **PASS** (`0` errors, `0` warnings).
- Live `GET /`, `GET /css/style.css`, `GET /js/app.js`, and `GET /api/research`: **PASS** (`HTTP 200`).
- Live Chrome DevTools console/DOM check: **BLOCKED** (`DevToolsActivePort` missing; Chrome remote debugging disabled).
