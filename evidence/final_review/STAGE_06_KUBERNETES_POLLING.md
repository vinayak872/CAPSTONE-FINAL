# STAGE 06 — Kubernetes Status Polling Fix

**Status:** **PASS**

## 1. Root Cause
- [backend/src/services/k8s.service.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/src/services/k8s.service.js) exclusively shelled out to `kubectl`, which is absent in [backend/Dockerfile](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/Dockerfile) and lacked RBAC inside the cluster.
- `syncWithStateService()` hardcoded `activeVersion = 'v1.0'` on `Degraded`/abort and ignored initial `Healthy` version sync on startup.

## 2. Exact Changes Made
- Added native `node:https` in-cluster Kubernetes REST API client (`inClusterRequest()`) using the mounted `ServiceAccount` token and CA cert when `KUBERNETES_SERVICE_HOST` is present, keeping `kubectl` CLI only for local host runs.
- Created least-privilege [k8s/rbac.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/rbac.yaml) (`ServiceAccount/cloud05-app-sa`, `Role/cloud05-rollout-reader` for `pods`, `services`, `rollouts`, `analysisruns`, `analysistemplates`, and `Role/cloud05-argocd-app-reader` for `applications/cloud05-progressive-delivery`) and assigned `serviceAccountName: cloud05-app-sa` in `k8s/rollout.yaml`.
- Updated `checkPrometheusReady()` to query `http://prometheus-server.monitoring.svc.cluster.local:9090/-/ready` in-cluster (and pod `Ready` condition locally).
- Fixed `syncWithStateService()` to preserve `stateService.previousStableVersion` on abort and synchronize `activeVersion` on initial `Healthy` observation.

## 3. Verification Evidence
- Local host mode (`node test_e2e.js` + `GET /api/status`): **PASS**.
- In-cluster pod mode (verified live in pod `cloud05-service-77d96bf899-dlsb8` with `cloud05-app-sa`): **PASS** (`execution_mode: "kubernetes"`, `kubernetes: true`, `argoRollouts: true`, `argoCd: true`, `prometheus: true`, `"In-cluster Kubernetes API (v1.36.1)"`).
