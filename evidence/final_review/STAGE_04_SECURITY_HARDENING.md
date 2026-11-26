# STAGE 04 — Security and Secret Management Hardening

**Status:** **PASS** (Git secret history remains in prior commits; live cluster rollout with `readOnlyRootFilesystem` **NOT RUN**)

## 1. Root Cause
- `k8s/secrets.yaml` was committed in Git containing a static placeholder `API_SECRET_KEY` (verified unused anywhere in application code—not a live production credential).
- Mutating endpoints (`/api/deploy/*`, `/api/reset`, `/api/k8s/sync`, `/api/demo/failure-injection`) lacked authentication and rate limiting.
- Express exposed `X-Powered-By`, lacked security headers and configurable CORS, and Kubernetes containers lacked `allowPrivilegeEscalation: false`, `capabilities.drop: ["ALL"]`, and `readOnlyRootFilesystem: true`.

## 2. Exact Changes Made
- Untracked and removed `k8s/secrets.yaml` (`git rm --cached`), added ignore patterns (`k8s/secrets.yaml`, `k8s/*.secret.yaml`) to [.gitignore](file:///Users/vinayakkumar/Desktop/cloud05-capstone/.gitignore), removed `secrets.yaml` from [k8s/kustomization.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/kustomization.yaml) and `secretRef` from [k8s/rollout.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/rollout.yaml), and created sanitized [k8s/secrets.example.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/secrets.example.yaml) with `kubectl create secret` instructions.
- Added [backend/src/middleware/security.middleware.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/middleware/security.middleware.js) implementing constant-time `requireAdminAuth` (`ADMIN_API_TOKEN` / `REQUIRE_AUTH` / production enforcement) and fixed-window `createRateLimiter` (`HTTP 429` + `Retry-After`), mounted on `/api/deploy`, `/api/reset`, `/api/k8s/sync`, and `/api/demo/failure-injection` in [backend/src/app.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/app.js).
- Disabled `x-powered-by`, added `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin`, and explicit `ALLOWED_ORIGINS` CORS handling.
- Added `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities: { drop: ["ALL"] }`, and `/tmp` `emptyDir` volume mounts to `k8s/rollout.yaml` and `k8s/order-service-rollout.yaml`.

## 3. Verification Evidence
- `backend/tests/validation-security.test.js` **PASS**: verified `401`/`403`/`200` auth token enforcement, `503` when `REQUIRE_AUTH=true` without token, and `429` rate limiting.
- `backend/tests/health.test.js` **PASS**: verified security headers and absence of `x-powered-by`.
- `kubectl apply --dry-run=client -k k8s/` **PASS**; Docker `--read-only --tmpfs /tmp` container runtime check executed on both images.
- Note: Historical Git commits prior to HEAD still contain the old placeholder `k8s/secrets.yaml` (rewriting Git history requires explicit approval).
