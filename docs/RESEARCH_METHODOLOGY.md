# Research Methodology, Benchmark Design & Empirical Results

This document presents the formal experimental methodology, benchmark configuration, statistical equations, comparative results, and research limitations for the CLOUD-05 capstone evaluation.

---

## 1. Experimental Design & Objectives

The primary research objective is to empirically quantify the blast-radius reduction and recovery speedup achieved by combining declarative GitOps progressive delivery with real-time Prometheus telemetry gating compared to traditional direct cutover deployments.

### Research Hypotheses
1. **Hypothesis 1 (Blast Radius Reduction):** Introducing a 10% initial canary traffic gate with automatic health threshold analysis reduces cumulative user exposure to a faulty release by at least 50% compared to a direct 100% cutover.
2. **Hypothesis 2 (Recovery Speedup):** Automated circuit-breaker rollback driven by real-time metric evaluation achieves a sub-second Mean Time to Recover (MTTR), representing at least a 10x improvement over manual operator intervention.

---

## 2. Benchmark Parameters & Controlled Environment

All trials were executed under strictly controlled, identical workload parameters:

| Parameter | Value | Description |
| :--- | :--- | :--- |
| **Number of Controlled Trials ($n$)** | 3 | Independent trials with identical synthetic defect rates. |
| **Workload Duration** | 5,000 ms | Duration of client traffic generation per trial. |
| **Request Frequency** | 50 Hz (~50 RPS) | Continuous Poisson-distributed synthetic traffic. |
| **Total Requests Generated** | ~210–240 | Total HTTP operations per trial. |
| **Candidate Defect Probability ($p$)** | 0.40 (40%) | Probability of candidate pod returning HTTP 500. |
| **Initial Canary Traffic Weight** | 10% | Traffic percentage routed to candidate during Step 1. |
| **Health Safety Threshold** | $\le 5\%$ | Maximum acceptable HTTP error rate before abort. |

---

## 3. Mathematical Formulations

### 3.1 Cumulative Faulty Exposure Percentage ($E_{faulty}$)
Quantifies the proportion of total client requests that were exposed to the defective candidate version:

$$E_{faulty} = \frac{R_{candidate}}{R_{total}} \times 100$$

Where $R_{candidate}$ is requests routed to candidate pods, and $R_{total}$ is total client requests ($R_{candidate} + R_{active}$).

### 3.2 Blast Radius Reduction ($\Delta B$)
The relative reduction in faulty exposure provided by progressive delivery ($E_{prog}$) compared to conventional direct cutover ($E_{base} = 100\%$):

$$\Delta B = \frac{E_{base} - E_{prog}}{E_{base}} \times 100 = 100\% - 34.50\% = \mathbf{65.5\%}$$

### 3.3 Mean User Error Rate ($\bar{U}$)
The proportion of total user requests that experienced an unhandled HTTP 5xx error:

$$\bar{U} = \frac{R_{failed}}{R_{total}} \times 100$$

### 3.4 Recovery Speedup Factor ($S_{MTTR}$)
The ratio of baseline manual recovery time ($MTTR_{base}$) to automated circuit-breaker rollback time ($MTTR_{prog}$):

$$S_{MTTR} = \frac{MTTR_{base}}{MTTR_{prog}} = \frac{9.30\,\text{s}}{0.75\,\text{s}} = \mathbf{12.4\times}$$

---

## 4. Empirical Benchmark Comparison

Data source: [`evidence/final_review/experiment_raw_data.json`](../evidence/final_review/experiment_raw_data.json).

| Metric | Conventional Baseline (Direct Cutover) | Progressive Delivery (CLOUD-05) | Improvement / Difference |
| :--- | :--- | :--- | :--- |
| **Initial Traffic Exposure** | 100% | 10% | **90% initial isolation** |
| **Cumulative Faulty Exposure** | 100.0% (239.33 req) | 34.50% (72.00 req) | **65.5% blast radius reduction** |
| **Mean User Error Rate** | 40.26% (96.33 failed req) | 14.06% (29.33 failed req) | **26.20 percentage point reduction** |
| **Overall Availability** | 59.74% | 85.94% | **+26.20 percentage points** |
| **Detection Latency** | 4.01 s | 4.01 s | Identical threshold detection |
| **Recovery Time (MTTR)** | 9.30 s (operator triage) | 0.75 s (circuit breaker) | **12.4x faster recovery** |
| **Human Intervention Required** | Yes (Manual rollback) | No (Autonomous rollback) | **Fully automated** |

---

## 5. Trial-by-Trial Data Traceability

### Baseline Trials (Direct Cutover to Faulty Candidate v3.0)
- **Trial 1:** 238 requests &rarr; 105 failed &rarr; 44.12% error rate &rarr; MTTR 8.90s.
- **Trial 2:** 240 requests &rarr; 92 failed &rarr; 38.33% error rate &rarr; MTTR 9.30s.
- **Trial 3:** 240 requests &rarr; 92 failed &rarr; 38.33% error rate &rarr; MTTR 9.70s.
- **Baseline Means:** Total: 239.33 req, Failed: 96.33 req, Error rate: 40.26%, MTTR: 9.30s.

### Progressive Delivery Trials (Canary Gating & Auto-Rollback)
- **Trial 1:** 206 requests &rarr; 69 to candidate &rarr; 29 failed &rarr; 14.08% error rate &rarr; MTTR 0.75s &rarr; 66.5% reduction.
- **Trial 2:** 210 requests &rarr; 72 to candidate &rarr; 29 failed &rarr; 13.81% error rate &rarr; MTTR 0.75s &rarr; 65.7% reduction.
- **Trial 3:** 210 requests &rarr; 75 to candidate &rarr; 30 failed &rarr; 14.29% error rate &rarr; MTTR 0.75s &rarr; 64.3% reduction.
- **Progressive Means:** Total: 208.67 req, Failed: 29.33 req, Error rate: 14.06%, MTTR: 0.75s, Reduction: 65.5%.

---

## 6. Research Limitations & Future Work

1. **Traffic Routing Granularity:**
   - The current Kubernetes deployment utilizes **pod-replica count based** canary routing (e.g. 1 candidate pod out of 4 total pods = ~25% traffic allocation).
   - In production enterprise environments, request-level L7 traffic splitting (via Istio VirtualService, Linkerd, or Envoy SMI) allows precise percentage-based routing regardless of pod counts.
2. **Sample Size:**
   - The reported benchmark consists of 3 controlled trials ($n = 3$). While mathematically consistent and reproducible, broader industrial validation across heterogeneous microservice topographies is recommended for formal generalization.
3. **Synthetic Failure Inversion:**
   - Failure was simulated via HTTP 500 injection. Real-world failures often manifest as subtle memory leaks, connection pool exhaustion, or downstream service timeout cascades.
