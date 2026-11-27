# Deployment Guide: Docker, Kubernetes & GitOps

This guide covers building, configuring, and deploying CLOUD-05 across local environments and Kubernetes clusters with Argo CD and Argo Rollouts.

---

## 1. Prerequisites

- **Node.js:** v18.0.0+ (v20 LTS recommended)
- **Docker:** Docker Desktop v24+ with Kubernetes enabled
- **Kubernetes CLI (`kubectl`):** v1.28+
- **Argo CD:** Installed in namespace `argocd`
- **Argo Rollouts:** Controller installed in namespace `argo-rollouts`
- **Prometheus:** Installed in namespace `monitoring`

---

## 2. Containerization (Multi-Stage Dockerfiles)

Both microservices utilize multi-stage Docker builds to produce lightweight, secure, non-root production images:

### Gateway Service Image (`backend/Dockerfile`)
```dockerfile
# Stage 1: Builder
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
RUN apk add --no-cache libc6-compat
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm prune --production

# Stage 2: Runner (Non-root user nodeapp:1001)
FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ARG RELEASE_VERSION=v1.0
ENV NODE_ENV=production PORT=5005 HOST=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nodeapp
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/src ./src
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/package*.json ./
COPY --from=builder --chown=nodeapp:nodejs /usr/src/app/release_config.json ./
COPY --chown=nodeapp:nodejs frontend /usr/src/frontend
COPY --chown=nodeapp:nodejs evidence/final_review/experiment_raw_data.json /usr/src/evidence/final_review/experiment_raw_data.json
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5005/health || exit 1
EXPOSE 5005
USER nodeapp
CMD ["node", "src/server.js"]
```

### Build Commands
```bash
# Build Gateway Docker Image
docker build -t cloud05-capstone:v1.0.1 -f backend/Dockerfile .

# Build Order Microservice Docker Image
docker build -t cloud05-order-service:v1.0.1 -f services/order-service/Dockerfile .
```

---

## 3. Kubernetes Infrastructure Breakdown

All Kubernetes manifests are maintained in the [`k8s/`](../k8s/) directory:

| Manifest | Purpose & Key Details |
| :--- | :--- |
| `namespace.yaml` | Creates isolated namespace `cloud05-app`. |
| `configmap.yaml` | Application configuration (`NODE_ENV=production`, `PORT=5005`, `EXECUTION_MODE=kubernetes`). |
| `rbac.yaml` | ServiceAccount, Role, and RoleBinding granting read-only access to Rollouts, Services, AnalysisRuns, and Argo CD resources. |
| `services.yaml` | `cloud05-active-service` (target for stable traffic) and `cloud05-preview-service` (target for canary traffic). |
| `rollout.yaml` | Argo Rollouts specification for `cloud05-service` (4 replicas, 9-step canary strategy, `analysis-template` linkage). |
| `order-service-services.yaml` | `order-active-service` and `order-preview-service` for the microservice. |
| `order-service-rollout.yaml` | Argo Rollouts specification for `order-service` (3 replicas, canary strategy). |
| `analysis-template.yaml` | Defines Prometheus PromQL queries (`success-rate >= 95%`, `error-rate <= 5%`) executed during rollout progression. |
| `argocd-application.yaml` | Declarative Argo CD Application pointing to `https://github.com/vinayak872/CAPSTONE-FINAL.git`. |
| `kustomization.yaml` | Kustomize bundle linking all resources for single-command deployment. |

---

## 4. Deployment Steps

### Step 4.1: Validate Manifests Offline
```bash
kubectl kustomize k8s/
```

### Step 4.2: Apply Resources to Cluster
```bash
kubectl apply -k k8s/
```

### Step 4.3: Deploy Prometheus Monitoring
```bash
kubectl apply -f monitoring/prometheus-k8s.yaml
```

### Step 4.4: Register Argo CD Application
```bash
kubectl apply -f k8s/argocd-application.yaml
```

### Step 4.5: Verify Deployment Status
```bash
# Check Rollouts in cloud05-app
kubectl get rollouts -n cloud05-app

# Check Pods
kubectl get pods -n cloud05-app

# Check Argo CD Application
kubectl get application -n argocd

# Check Prometheus Pod
kubectl get pods -n monitoring
```

---

## 5. Port Forwarding for Local Access

If running on Docker Desktop or Minikube without an Ingress controller:

```bash
# Gateway UI & REST API
kubectl port-forward svc/cloud05-active-service -n cloud05-app 5005:5005 &

# Order Microservice
kubectl port-forward svc/order-active-service -n cloud05-app 5006:5006 &

# Prometheus Server
kubectl port-forward svc/prometheus-server -n monitoring 9090:9090 &

# Argo CD Server
kubectl port-forward svc/argocd-server -n argocd 8080:443 &
```

Open your browser to **`http://localhost:5005`** to view the live monitoring dashboard.
