# STAGE 10 — Research Experiments and Academic Integrity

**Status:** **PASS** (Published results preserved; real HTTP benchmark tool added; live K8s `EXP-01`–`EXP-04` suite **NOT RUN** pending cluster experiment approval)

## 1. Audit & Reconciliation
- **Preserved Reference Artifacts:** [experiment_raw_data.json](file:///Users/vinayakkumar/Desktop/cloud05-capstone/evidence/final_review/experiment_raw_data.json) and [research_paper.md](file:///Users/vinayakkumar/Desktop/cloud05-capstone/evidence/final_review/research_paper.md) were **preserved untouched** (Rule 13).
- **Methodology Transparency:** `experiments/run_experiments.js` is explicitly documented as a **local simulation** (`n = 3` trials, insufficient for statistical significance) that produced `experiment_raw_data.json` (`65.5%` cumulative blast-radius reduction, `34.50%` exposure, `14.06%` vs `40.26%` error rate, `0.75s` vs `9.30s` MTTR, `12.4x` speedup).
- **Documentation Alignment:** Updated [VIVA_GUIDE.md](file:///Users/vinayakkumar/Desktop/cloud05-capstone/VIVA_GUIDE.md) and [frontend/index.html](file:///Users/vinayakkumar/Desktop/cloud05-capstone/frontend/index.html) (via `GET /api/research`) to match `experiment_raw_data.json` and `research_paper.md` (whereas historical [final_verification_report.md](file:///Users/vinayakkumar/Desktop/cloud05-capstone/evidence/final_review/final_verification_report.md) is retained untouched as an archived pre-correction artifact).

## 2. New Reproducible Real-HTTP Benchmark Tooling
- Added standalone [k8s/experiments/baseline-rollingupdate.yaml](file:///Users/vinayakkumar/Desktop/cloud05-capstone/k8s/experiments/baseline-rollingupdate.yaml) (excluded from `k8s/kustomization.yaml`) for `RollingUpdate` vs Canary comparisons.
- Added [experiments/run_k8s_benchmark.js](file:///Users/vinayakkumar/Desktop/cloud05-capstone/experiments/run_k8s_benchmark.js) — sends real HTTP requests without `Math.random()` result fabrication, measures real HTTP 2xx/5xx/network errors and P50/P95/P99 latency percentiles, and saves JSON + CSV.
- Executed a non-destructive local verification (`LOCAL-HTTP-CHECK` against `http://localhost:5005/api/demo/products`) producing real measured [real_http_benchmark.json](file:///Users/vinayakkumar/Desktop/cloud05-capstone/evidence/final_review/real_http_benchmark.json) and [real_http_benchmark.csv](file:///Users/vinayakkumar/Desktop/cloud05-capstone/evidence/final_review/real_http_benchmark.csv).
