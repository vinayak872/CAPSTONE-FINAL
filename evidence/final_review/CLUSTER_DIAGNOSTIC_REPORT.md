# CLOUD-05 — Complete Cluster Diagnostic Report

## 1. Executive Summary & Cluster Context
- **Kubernetes Context:** `docker-desktop` (Control plane v1.36.1, Node: `desktop-control-plane` Ready)
- **Target Namespace:** `cloud05-app`
- **Monitored Services:** `cloud05-service` (Gateway) and `order-service` (Microservice)
- **GitOps Controller:** Argo CD application `cloud05-progressive-delivery` in `argocd` namespace
- **Rollout Controller:** Argo Rollouts v1alpha1 in `cloud05-app`

---

## 2. Resource Inventory & Status Audit

| Component | Kind | Desired / Current | Ready | Phase / Status | Image Tag |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`cloud05-service`** | Rollout | 4 / 4 | 4 / 4 | Healthy (Step 9/9, 100%) | `cloud05-capstone:v1.0.1` |
| **`order-service`** | Rollout | 3 / 3 | 3 / 3 | Healthy (Step 9/9, 100%) | `cloud05-order-service:v1.0.1` |
| **`cloud05-progressive-delivery`** | Application | Synced | Healthy | Revision `9f02d5a` | Target `main` |
| **`prometheus-server`** | Pod (monitoring) | 1 / 1 | 1 / 1 | Running | Digest pinned |

---

## 3. Detailed Pod Health & Restart Analysis

### Pod Restarts Observed
- `cloud05-service-66b7fcc6c4-*`: Restarts ranging from 4 to 10
- `order-service-b857c455f-*`: Restarts ranging from 1 to 5

### Root Causes Identified
1. **Liveness & Readiness Probe Configuration:**
   - Previous configuration:
     - `periodSeconds: 10`
     - `timeoutSeconds: 3` (liveness) / `2` (readiness)
     - `failureThreshold: 3` (liveness) / `2` (readiness)
   - During local Docker Desktop burst loads (e.g. concurrent `kubectl` calls, Prometheus scrapes, and synthetic traffic generator), the single-threaded Node.js event loop had transient response times exceeding 2–3s.
   - Kubelet logged:
     - `Liveness probe failed: Get "http://<pod-ip>:5005/health": context deadline exceeded (Client.Timeout exceeded while awaiting headers)`
     - `Container app failed liveness probe, will be restarted`
2. **Graceful Shutdown Connection Lingering:**
   - On receiving `SIGTERM` from kubelet during probe failure restart, `server.close()` waited for open keep-alive HTTP sockets. If sockets didn't drain within 10s, timeout triggered `process.exit(1)`, registering an `Error` exit code.
3. **In-Cluster Background Check Contention:**
   - The backend `K8sService` ran frequent cluster checks and synthetic traffic loop every 1.5–2s, compounding latency under low-CPU container throttling (100m request / 500m limit).

---

## 4. Argo Rollouts & AnalysisRun Verification
- **Rollouts Analysis:**
  - `cloud05-service` Canary steps: 10% -> 25% -> 50% -> 100% with AnalysisRuns `cloud05-service-66b7fcc6c4-15-2`, `15-5`, `15-8`.
  - Latest AnalysisRun `cloud05-service-66b7fcc6c4-15-8`: Status **`Successful`** (`success-rate: [100]`, `error-rate-threshold: [0]`).
  - `order-service` Canary steps: Dedicated `AnalysisTemplate` configured with `order_requests_total`.
  - Latest AnalysisRun `order-service-b857c455f-3-8`: Status **`Successful`**.

---

## 5. Argo CD GitOps Synchronization Verification
- **App:** `cloud05-progressive-delivery`
- **Sync Status:** `Synced`
- **Health Status:** `Healthy`
- **Tracked Repo:** `https://github.com/vinayak872/CAPSTONE-FINAL.git` (`main`)
- **Revision:** `9f02d5afcfa04583c99998a0d40b0614e0b20a2a` (`9f02d5a`)
- **Reconciled At:** Recent timestamp, automated self-heal and sync active.

---

## 6. Action Plan for Permanent Pod Stabilization (Stage 2)
1. **Harden Probe Definitions in Manifests:**
   - Increase `timeoutSeconds` from 2–3s to 5s.
   - Increase `failureThreshold` from 2–3 to 4.
   - Adjust `periodSeconds` to 10s with `initialDelaySeconds: 10s`.
2. **Server Connection Draining & Keep-Alive Hardening:**
   - Ensure keep-alive headers are respected and sockets destroyed promptly on SIGTERM.
