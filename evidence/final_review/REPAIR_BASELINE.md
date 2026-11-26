# CLOUD-05 — Repair Baseline & Safety Checkpoint

**Timestamp:** 2026-11-26T14:48+05:30  
**Repository:** `/Users/vinayakkumar/Desktop/cloud05-capstone`  

---

## 1. Git State at Checkpoint

- **Active Branch:** `main`
- **HEAD Commit:** `00f2e9a` (`chore(k8s): restore healthy baseline v1.0 in rollout manifest`, aligned with `origin/main`)
- **Working Tree Status:** Uncommitted remediation changes from the prior audit session are present and preserved on `main` (per Section 2 rule: *preserve uncommitted changes*).
  - Modified (`26` files): `.github/workflows/ci-cd.yml`, `VIVA_GUIDE.md`, `backend/Dockerfile`, `backend/package-lock.json`, `backend/package.json`, `backend/src/app.js`, `backend/src/config/environment.js`, `backend/src/routes/demo.routes.js`, `backend/src/routes/metrics.routes.js`, `backend/src/services/k8s.service.js`, `backend/src/services/state.service.js`, `backend/tests/config.test.js`, `backend/tests/demo.test.js`, `backend/tests/health.test.js`, `experiments/run_experiments.js`, `frontend/index.html`, `frontend/js/app.js`, `k8s/analysis-template.yaml`, `k8s/kustomization.yaml`, `k8s/order-service-rollout.yaml`, `k8s/rollout.yaml`, `monitoring/prometheus-k8s.yaml`, `package.json`, `services/order-service/Dockerfile`, `services/order-service/src/server.js`, `test_e2e.js`.
  - Untracked (`3` files): `eslint.config.mjs`, `evidence/final_review/FINAL_IMPLEMENTATION_AUDIT.md`, `k8s/rbac.yaml`.

---

## 2. Active Kubernetes Context & Live Cluster Health

- **Current Context:** `docker-desktop` (other kubeconfig contexts present: `kind-cloud05`, `minikube`)
- **Node:** `desktop-control-plane` — `Ready`, `v1.36.1`, `containerd://2.3.1`
- **Workloads (`cloud05-app`):** `cloud05-service` (`4/4` `Running`), `order-service` (`3/3` `Running`)
- **Argo CD (`argocd`):** `cloud05-progressive-delivery` `Synced` & `Healthy` at `00f2e9a`
- **Prometheus (`monitoring`):** `prometheus-server-55cf678888-jdhgz` `Running`, scraping `7/7` `cloud05-pods` targets (`rollouts_pod_template_hash` label verified present on `cloud05_http_requests_total`)

---

## 3. Baseline Test Results at Checkpoint

- **`npm run lint`:** `PASS` (`0` errors, `0` warnings)
- **`npm test` (Vitest):** `PASS` (`4/4` files, `26/26` tests passed in `8.20s`)

---

## 4. Remaining Gaps to Repair Across Stages 1–10

1. **Stage 1 (Metrics):** Add dedicated unit tests verifying real `200`/`500`/`503` increments and zero metric fabrication across repeated `/metrics` scrapes even when `FAULT_MODE=true`.
2. **Stage 2 (Rollouts/Analysis):** Isolate canary measurements via `rollouts_pod_template_hash` (`podTemplateHashValue: Latest`) and remove `or on() vector(...)` default-pass fallbacks so zero traffic is treated as inconclusive rather than healthy.
3. **Stage 3 (Backend Validation):** Export testable `parseEnvironment()`, enforce `express.json({ limit: '100kb' })`, and add comprehensive negative validation tests.
4. **Stage 4 (Security & Secrets):** Stop tracking plaintext `k8s/secrets.yaml` (provide safe `k8s/secrets.example.yaml` + `.gitignore` rules), add configurable token authentication + sliding-window rate limiting on `/api/deploy/*`, `/api/reset`, `/api/k8s/sync`, `/api/demo/failure-injection`, and verify `readOnlyRootFilesystem: true` compatibility.
5. **Stage 5 & 9 (Frontend & Architecture):** Add `GET /api/research` serving `experiment_raw_data.json` dynamically, add loading indicator & last-refresh timestamp, clearly separate App/K8s/Argo CD/Argo Rollouts/Prometheus statuses, document why Vanilla JS is retained per `research_paper.md`, and add legacy notice to `REVIEW_GUIDE.md`.
6. **Stage 6 (K8s Polling):** Add `pods`/`services` read verbs to `k8s/rbac.yaml`, verify offline `UNKNOWN`/`UNAVAILABLE` handling in `k8s.service.js`.
7. **Stage 7 & 8 (CI/CD & Docker):** Generate `services/order-service/package-lock.json`, add `order-service` `node:test` tests, run E2E + order-service tests in `.github/workflows/ci-cd.yml`, pin Prometheus image digest/version in `monitoring/prometheus-k8s.yaml`, and add optional `docker-compose.yml` for local multi-container reproduction.
8. **Stage 10 (Research Integrity):** Preserve `experiment_raw_data.json` and `research_paper.md` results untouched; add real HTTP Kubernetes benchmark runner (`experiments/run_k8s_benchmark.js` + `k8s/experiments/baseline-rollingupdate.yaml`) for genuine `RollingUpdate` vs Canary measurement without `Math.random()` fabrication.
