# CLOUD-05 Documentation

Welcome to the comprehensive documentation suite for **CLOUD-05: GitOps CI/CD with Progressive Delivery and Automated Rollback Using Real-Time Application Health Analysis**.

This repository provides an enterprise-grade cloud-native demonstration and academic benchmark comparing conventional direct cutover deployments against automated progressive delivery with real-time Prometheus health gating.

---

## Documentation Index

| Document | Purpose & Key Topics |
| :--- | :--- |
| [**Architecture Overview**](ARCHITECTURE.md) | High-level system design, microservice topology, state machine transitions, event journaling, and dual execution modes (simulation vs. Kubernetes). |
| [**Flow Diagrams**](FLOW_DIAGRAMS.md) | Dedicated flowcharts, sequence diagrams, state machines, and microservice mesh topology diagrams for project review. |
| [**Deployment Guide**](DEPLOYMENT_GUIDE.md) | Multi-stage Docker builds, Kubernetes manifests, Kustomize packaging, Argo CD GitOps synchronization, and Argo Rollouts controller setup. |
| [**Monitoring & Rollback Guide**](MONITORING_AND_ROLLBACK.md) | Prometheus metrics schema, PromQL query design, Argo Rollouts `AnalysisTemplate`, health thresholds, and automated circuit-breaker rollback triggers. |
| [**Testing & Verification Guide**](TESTING_AND_VERIFICATION.md) | Test pyramid execution: ESLint, Vitest backend tests (35 tests), Order Service tests (3 tests), End-to-End integration suite (12 stages), and Docker healthchecks. |
| [**Research Methodology & Data**](RESEARCH_METHODOLOGY.md) | Academic benchmark design, statistical comparison between baseline and progressive delivery, mathematical formulas, raw data traceability, and limitations. |
| [**Viva Defense Guide**](VIVA_DEFENSE_GUIDE.md) | Academic capstone defense preparation, comprehensive Q&A, theoretical foundations, architectural trade-offs, and live demonstration tips. |

---

## Authoritative Evidence & Audit Reports

All final verification records, cluster telemetry captures, and empirical datasets are maintained under [`evidence/final_review/`](../evidence/final_review/):

- [**Final Submission Readiness Report**](../evidence/final_review/FINAL_SUBMISSION_READINESS_REPORT.md) — Comprehensive readiness audit confirming 100% test passes, live Kubernetes stability, and research consistency (`READY` verdict).
- [**Final Live Dashboard Verification**](../evidence/final_review/FINAL_LIVE_DASHBOARD_VERIFICATION.md) — Read-only verification of the live Kubernetes-connected dashboard, replica classification, and Argo CD sync state.
- [**Final Repository Cleanup Report**](../evidence/final_review/FINAL_REPOSITORY_CLEANUP_REPORT.md) — Complete repository inventory, file classification, security audit, and post-cleanup verification evidence.
- [**Research Paper**](../evidence/final_review/research_paper.md) — Full academic capstone paper formatted for peer review.
- [**Experiment Raw Data**](../evidence/final_review/experiment_raw_data.json) — Source of truth JSON containing all 3 controlled benchmark trial measurements.

---

## Quick Start Commands

```bash
# 1. Install all dependencies
npm install
npm --prefix backend install
npm --prefix services/order-service install

# 2. Run static code analysis and tests
npm run lint
npm test
(cd services/order-service && npm test)

# 3. Start application locally on port 5005
npm start

# 4. In a separate terminal, run the 12-stage automated E2E suite
npm run test:e2e
```
