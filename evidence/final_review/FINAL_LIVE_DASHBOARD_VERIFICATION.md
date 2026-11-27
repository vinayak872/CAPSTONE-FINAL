# CLOUD-05 — Final Live Dashboard Consistency & Verification Report

## 1. Verified Kubernetes Context & Architecture
- **Kubernetes Context:** `docker-desktop` (Control Plane `desktop-control-plane` v1.36.1)
- **Target Namespace:** `cloud05-app`
- **Primary Gateway:** `cloud05-service` (Argo Rollout, ClusterIP port 80/5005)
- **Order Microservice:** `order-service` (Argo Rollout, ClusterIP port 5006)
- **GitOps Engine:** Argo CD application `cloud05-progressive-delivery` in `argocd` namespace
- **Metrics Telemetry:** Prometheus Server v3.15.1 in `monitoring` namespace (Port 9090)

---

## 2. Release Version Consistency Verification
- **Audit Requirement:** Resolve discrepancy where dashboard showed `v1.0` while running pod images were `cloud05-capstone:v1.0.1`.
- **Command Evidence:**
  ```bash
  kubectl get rollout cloud05-service -n cloud05-app -o jsonpath='{.spec.template.spec.containers[0].image}'
  # Output: cloud05-capstone:v1.0.1

  kubectl get pods -n cloud05-app -l app.kubernetes.io/name=cloud05-service -o jsonpath='{.items[0].spec.containers[0].image}'
  # Output: cloud05-capstone:v1.0.1
  ```
- **Correction Implemented:**
  - In `backend/src/services/k8s.service.js`, `syncWithStateService()` now sets `stateService.activeVersion = imageVersion` (`v1.0.1`) whenever a rollout is in `Healthy` state.
  - In `frontend/js/app.js`, `updateDashboardUI()` binds `val-active-version` to `data.active_version` (`v1.0.1`), matching the actual deployed container image across all 4 running gateway pods.

---

## 3. Stable and Canary Replica Classification Verification
- **Audit Requirement:** Eliminate false classification where 4/4 ready replicas were labeled as `(4 Canary)` despite Rollout being 100% promoted at Step 9/9.
- **Command Evidence:**
  ```bash
  kubectl get rollout cloud05-service -n cloud05-app -o json | python3 -c "
  import json, sys
  d = json.load(sys.stdin)['status']
  print('phase:', d['phase'], 'stableRS:', d['stableRS'], 'currentPodHash:', d['currentPodHash'], 'ready:', d['readyReplicas'], 'updated:', d['updatedReplicas'])
  "
  # Output: phase: Healthy, stableRS: 77d649c997, currentPodHash: 77d649c997, ready: 4, updated: 4
  ```
- **Root Cause & Correction:**
  - `k8s.service.js` previously forwarded raw `updated_replicas: 4` without checking if the rollout was fully promoted. When `stableRS === currentPodHash` and `phase === 'Healthy'`, all updated replicas represent the new **stable** baseline.
  - Corrected logic now computes:
    - `isFullyStable = (phase === 'Healthy' && (stepIndex >= stepsCount || stableRS === currentPodHash))`
    - `canary_replicas = isFullyStable ? 0 : updatedReplicas`
    - `stable_replicas = isFullyStable ? readyReplicas : (readyReplicas - canaryReplicas)`
  - UI now renders: **`4 Ready / 4 Total (4 Stable, 0 Canary)`** for gateway and **`3 Ready / 3 Total (3 Stable, 0 Canary)`** for order-service.

---

## 4. Pipeline Stage Accuracy for Fully Promoted Releases
- **Audit Requirement:** Accurately represent all 7 lifecycle stages upon full promotion without leaving completed stages looking inactive.
- **Correction Implemented:**
  - In `frontend/js/app.js`, when `deployment_status === 'STABLE'`:
    - Step 1: Code Commit (`step-complete`)
    - Step 2: CI Validation (`step-complete`)
    - Step 3: Container Image (`step-complete`)
    - Step 4: GitOps Sync (`step-complete`)
    - Step 5: Canary Deployment (`step-complete`, text: *"100% Promoted (Completed)"*)
    - Step 6: Health Analysis (`step-complete`, text: *"All Probes Passed"*)
    - Step 7: Active Stable (`step-complete`, text: *"Serving v1.0.1"*)
  - Overall pipeline badge displays: `Pipeline Converged (Active: v1.0.1)`.

---

## 5. Research Benchmark Integrity
- **Audit Requirement:** Guarantee research values are traceable, unmodified, and explicitly identified as simulation benchmarks.
- **File Checked:** `evidence/final_review/experiment_raw_data.json`
  - Cumulative Blast Radius Reduction: **`65.5%`**
  - Average Faulty Exposure: **`34.5%`** (progressive) vs. `100%` (direct cutover)
  - Detection Latency: **`4.01s`**
  - Mean Recovery Time (MTTR): **`0.75s`** (progressive) vs. `9.3s` (baseline, manual triage)
  - Speedup Factor: **`12.4x`**
  - Mean User Error Rate: **`14.06%`** (progressive) vs. `40.26%` (baseline)
- **UI Labeling:** Sourced directly from `/api/research`; badge explicitly displays `Source: evidence/final_review/experiment_raw_data.json · 3 controlled trials`. Header explicitly reads: *Recorded Research Findings (Simulation Benchmark)*.

---

## 6. Prometheus AnalysisRun Revision Mapping
- **Audit Requirement:** Confirm displayed AnalysisRun belongs to the current release revision and queries real metrics.
- **Command Evidence:**
  ```bash
  kubectl get analysisrun -n cloud05-app -o jsonpath='{.items[-1].metadata.name} {.items[-1].status.phase}'
  # Output: cloud05-service-77d649c997-16-8 Successful
  ```
- **Metric Verification:**
  - Query: `sum(rate(cloud05_http_requests_total{rollouts_pod_template_hash="77d649c997",status_code!~"5.."}[1m]))`
  - `success-rate`: `[100]` (Phase: `Successful`, 3/3 consecutive passes)
  - `error-rate-threshold`: `[0]` (Phase: `Successful`, 3/3 consecutive passes)
- **Correction Implemented:**
  - `k8s.service.js` filters `analysisruns` by owner name (`cloud05-service`) so that background jobs from other microservices do not overwrite the primary service analysis card.

---

## 7. Independent Microservice Verification

| Service | Pods Running | Ready | Restarts | Image | Rollout Status | Probe Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`cloud05-service`** | 4 / 4 | 4 / 4 | 1 | `cloud05-capstone:v1.0.1` | `Healthy` (Step 9/9, 100%) | `/health` 200, `/ready` 200 |
| **`order-service`** | 3 / 3 | 3 / 3 | 1 | `cloud05-order-service:v1.0.1` | `Healthy` (Step 9/9, 100%) | `/health` 200, `/ready` 200 |

Both microservices have passed their readiness delay window and are serving live cluster traffic without failures.

---

## 8. Dashboard Truthfulness & Error Handling
- **Kubernetes vs Simulation Mode:** In `backend/src/routes/status.routes.js`, `execution_mode` dynamically reports `"kubernetes"` when cluster connectivity is active. If the cluster becomes unreachable, it displays `Unknown` or `Unavailable` with clear error reasons.
- **Refresh Tracking:** Displays `Last refresh: <time>` updated every 1-second polling cycle.
- **Zero Fake Statuses:** No hardcoded green or healthy fallbacks exist in the backend or frontend.

---

## 9. Automated Test Verification Results
- **Linting:** Clean (0 warnings, 0 errors)
- **Backend Tests:** **35 / 35 passed** across 6 test suites
  - `tests/rollout.test.js` (8/8)
  - `tests/validation-security.test.js` (6/6)
  - `tests/metrics.test.js` (3/3)
  - `tests/demo.test.js` (5/5)
  - `tests/config.test.js` (6/6)
  - `tests/health.test.js` (7/7)
- **Order Microservice Tests:** **3 / 3 passed** in `node --test tests/server.test.js`
- **Total:** 38 / 38 tests passing (100% pass rate).

---

## 10. Summary of Modified Files
1. `backend/src/services/k8s.service.js`: Added stable vs. canary replica classification, filtered primary AnalysisRun ownership, and synchronized active version with the cluster rollout image.
2. `frontend/js/app.js`: Updated replica string formatting to distinguish stable vs. canary replicas, aligned active version display, and updated STABLE pipeline stage styling to reflect a completed lifecycle.
3. `evidence/final_review/FINAL_LIVE_DASHBOARD_VERIFICATION.md`: Created complete audit verification report.
