# Testing & Verification Guide

This guide details the complete testing strategy, test commands, coverage criteria, and automated verification suites for the CLOUD-05 capstone project.

---

## 1. Testing Pyramid Overview

CLOUD-05 incorporates a multi-tiered testing strategy spanning unit, integration, microservice, end-to-end, and container-level tests:

```
          / \
         /   \      12-Stage Live HTTP End-to-End Suite (test_e2e.js)
        / E2E \     -------------------------------------------------
       /-------\    Order Microservice Test Suite (Node.js Test Runner)
      / Service \   -------------------------------------------------
     /-----------\  Gateway Unit & Integration Tests (Vitest: 35 Tests)
    /    Unit     \ -------------------------------------------------
   /---------------\
  / Static Analysis \ ESLint Code Quality & Security Linter
 /___________________\
```

---

## 2. Test Execution Commands

### 2.1 Static Code Analysis (ESLint)
Executes linting across all JavaScript source files, tests, scripts, and front-end assets:
```bash
npm run lint
```
*Expected Output:* Clean exit with **0 errors and 0 warnings**.

### 2.2 Backend Gateway Tests (Vitest)
Executes all 35 unit and integration tests across 6 test suites:
```bash
npm test
```
*Suites executed:*
1. `tests/rollout.test.js` (8 tests): State machine transitions, concurrent deployment prevention, healthy promotion, boundary promotion, circuit-breaker rollback.
2. `tests/validation-security.test.js` (6 tests): Environment variable parsing, order payload validation, malformed JSON handling, token authentication, rate limiting, research traceability.
3. `tests/demo.test.js` (5 tests): Product catalog endpoints, order placement, invalid order rejections, test failure injection.
4. `tests/config.test.js` (6 tests): Release configuration schema validation, negative error rates, error rate > 100, syntax error handling, active version preservation.
5. `tests/health.test.js` (7 tests): `/health` probes, `/ready` probes, `/version` metadata, `/metrics` Prometheus formatting, security headers, JSON 404 responses.
6. `tests/metrics.test.js`: Prometheus metric registration and counter increments.

### 2.3 Independent Order Microservice Tests
Executes unit tests for the order microservice:
```bash
(cd services/order-service && npm test)
```
*Tests executed:*
1. `GET /health` and `GET /products` return HTTP 200 OK.
2. `POST /orders` validates integer quantity strictly (rejecting floats, strings, and missing attributes).
3. `GET /metrics` does not fabricate synthetic 500 errors on repeated scrapes during fault mode.

### 2.4 End-to-End System Suite (`test_e2e.js`)
Executes a 12-stage automated lifecycle test against a running server (`http://localhost:5005`):
```bash
# Terminal 1: Start Server
npm start

# Terminal 2: Run Suite
npm run test:e2e
```
*12 Stages Verified:*
1. Health & Readiness Verification (`/health`, `/ready`)
2. Prometheus Telemetry Verification (`/metrics`)
3. Status Schema Verification (`/api/status`)
4. State Machine Reset (`/api/reset`)
5. Configuration Validation & Active Version Preservation (4 boundary rejections)
6. Healthy Release Promotion (`v4.0`, 0% error vs 5% threshold)
7. Healthy Boundary Promotion (`v4.1`, 5% error == 5% threshold)
8. Faulty Boundary Rollback (`v4.2`, 6% error > 5% threshold)
9. Faulty Release & Circuit-Breaker Auto-Rollback (`v5.0`, 18% error > 5% threshold)
10. Audit Event Stream Consistency (Chronological order)
11. Realistic Demo Microservice Operations (`/api/demo/products`, `/api/demo/orders`)
12. Cleanup & Baseline Restoration (`/api/reset`)

---

## 3. Kubernetes & GitOps Verification

To verify the live cluster state directly via `kubectl`:

```bash
# 1. Verify Rollouts in cloud05-app
kubectl get rollouts -n cloud05-app -o wide

# 2. Verify Pod Health and Readiness
kubectl get pods -n cloud05-app -o wide

# 3. Verify Argo CD GitOps Application Health
kubectl get application cloud05-progressive-delivery -n argocd -o wide

# 4. Verify Prometheus AnalysisRuns
kubectl get analysisruns -n cloud05-app --sort-by=.metadata.creationTimestamp

# 5. Verify In-Cluster Prometheus Server
kubectl get pods -n monitoring
```

---

## 4. Docker Build & Container Healthcheck Verification

Validate container image builds and runtime health checks:

```bash
# Test Gateway Container
docker build -t cloud05-capstone:test -f backend/Dockerfile .
docker run -d --name test-cloud05 -p 5005:5005 cloud05-capstone:test
sleep 5
curl -f http://localhost:5005/health
curl -f http://localhost:5005/ready
docker stop test-cloud05 && docker rm test-cloud05

# Test Order Service Container
docker build -t cloud05-order-service:test -f services/order-service/Dockerfile .
docker run -d --name test-order -p 5006:5006 cloud05-order-service:test
sleep 4
curl -f http://localhost:5006/health
docker stop test-order && docker rm test-order
```
