# STAGE 08 — Docker and Dependency Corrections

**Status:** **PASS**

## 1. Root Cause
- `cloud05-capstone:v1.0` and `v2.0` shared the same Docker image ID (`e7c845f2e25d`) because `RELEASE_VERSION` was only injected at runtime.
- `services/order-service` lacked a `package-lock.json` and used `npm install --production`.
- [monitoring/prometheus-k8s.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/monitoring/prometheus-k8s.yaml) used `prom/prometheus:latest` without resource limits or health probes.

## 2. Exact Changes Made
- Added `ARG RELEASE_VERSION=v1.0` and `ENV RELEASE_VERSION=${RELEASE_VERSION}` in [backend/Dockerfile](file:///Users/vinayakkumar/Desktop/cloud05-capstone/backend/Dockerfile) and [services/order-service/Dockerfile](file:///Users/vinayakkumar/Desktop/cloud05-capstone/services/order-service/Dockerfile), and included `evidence/final_review/experiment_raw_data.json` in the backend image via [.dockerignore](file:///Users/vinayakkumar/Desktop/cloud05-capstone/.dockerignore).
- Generated [services/order-service/package-lock.json](file:///Users/vinayakkumar/Desktop/cloud05-capstone/services/order-service/package-lock.json) and switched `services/order-service/Dockerfile` to `npm ci --omit=dev`.
- Pinned `monitoring/prometheus-k8s.yaml` to the verified cached Prometheus `v3.15.1` digest (`prom/prometheus@sha256:fa3302279710be2f21a8301ec17a8b4f2301fd829bd113839b3b6b02b6f191a2`), added CPU/memory requests & limits (`100m/256Mi` – `500m/512Mi`) and `/-/healthy` + `/-/ready` probes, and documented its ephemeral `emptyDir` TSDB scope for local demo use.

## 3. Verification Evidence
- `npm --prefix services/order-service audit --omit=dev --audit-level=high`: `0` vulnerabilities.
- Built `cloud05-capstone:audit-v2` (`79baf044a69a`) and `audit-v3` (`6c9f41675aa9`) with distinct IDs; built both updated Dockerfiles and verified `--read-only --tmpfs /tmp` execution as non-root `nodeapp`.
- `kubectl apply --dry-run=client -f monitoring/prometheus-k8s.yaml`: **PASS**.
