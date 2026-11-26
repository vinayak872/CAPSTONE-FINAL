# STAGE 02 — Argo Rollouts and Analysis Templates Fix

**Status:** **PASS** (Manifests & dry-run validated; canary traffic router remains **NOT IMPLEMENTED**)

## 1. Root Cause
- [k8s/order-service-rollout.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/order-service-rollout.yaml) referenced `cloud05-health-analysis` (querying `cloud05_http_requests_total` instead of `order_requests_total`) and contained an empty `trafficRouting: {}` block.
- [k8s/analysis-template.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/analysis-template.yaml) aggregated metrics across both stable and canary pods, penalized non-2xx/non-5xx codes (`status_code=~"2.."`), and used `or on() vector(100)` / `or on() vector(0)` so zero traffic automatically passed.

## 2. Exact Changes Made
- Created `order-service-health-analysis` in `k8s/analysis-template.yaml` querying `order_requests_total` and updated `k8s/order-service-rollout.yaml` to reference it and remove `trafficRouting: {}`.
- Added `args: [{ name: latest-hash }]` (`valueFrom: { podTemplateHashValue: Latest }`) in [k8s/rollout.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/rollout.yaml), `k8s/order-service-rollout.yaml`, and `k8s/analysis-template.yaml` to filter Prometheus series by `rollouts_pod_template_hash="{{args.latest-hash}}"` (label verified present on `cloud05_http_requests_total` in live Prometheus).
- Removed `or on() vector(100)` / `or on() vector(0)` and configured `successCondition: len(result) > 0 && ...` with `inconclusiveLimit: 2` and `failureLimit: 1` so zero traffic is not treated as automatically healthy.
- Explicit architectural distinction: No service mesh (Istio/Linkerd) or ingress traffic router is installed, so canary steps (`10%`, `25%`, `50%`) scale **pod replica ratios** rather than performing exact request-level percentage routing.

## 3. Verification Evidence
- `kubectl kustomize k8s/` exited `0` (`492` lines).
- `kubectl apply --dry-run=client -k k8s/` exited `0` (`cloud05-health-analysis`, `order-service-health-analysis`, `cloud05-service`, `order-service` all valid).
- Live cluster rollout test was **NOT RUN** after adding `latest-hash` + removing fallback vectors (the earlier live healthy/faulty rollout test ran before this manifest refinement; re-running live fault injection requires explicit approval).
