# CL-05 Capstone: GitOps-Based Progressive Delivery and Automatic Rollback

A lightweight, robust, and verified demonstration of GitOps progressive delivery (canary rollout) with automated health probes and circuit-breaker automatic rollback. Built specifically for final-year college project evaluations and live technical demonstrations.

---

## 1. Project Overview & Architecture
This application simulates a cloud-native progressive delivery pipeline without requiring external heavy infrastructure (Kubernetes clusters, Argo CD controllers, or Prometheus servers):

- **Backend**: Python 3 + Flask with thread-safe in-memory state controller (`backend/app.py`).
- **Configuration Engine**: Real disk file (`backend/release_config.json`) evaluated at runtime with strict schema validation.
- **Frontend**: DevOps monitoring dashboard in dark mode (HTML5, Vanilla CSS, Vanilla JavaScript).
- **Telemetry**: Real-time 1-second polling of `/api/status`, `/api/config`, and `/api/events`.
- **Infrastructure Mode**: Local In-Memory Controller (Clearly labeled; does not claim external Kubernetes/Argo CD/Istio).

---

## 2. Directory Structure
```
cloud05-minimal-demo/
│
├── frontend/
│   ├── index.html              # DevOps monitoring dashboard layout
│   ├── css/
│   │   └── style.css           # Dark theme, metrics cards, badges, and animations
│   └── js/
│       └── app.js              # Real-time polling engine, dynamic updates & UI triggers
│
├── backend/
│   ├── app.py                  # Flask server, state machine & rollback worker logic
│   ├── release_config.json     # Live configuration file read and evaluated by the pipeline
│   ├── requirements.txt        # Backend dependencies (Flask)
│   └── test_e2e.py             # Automated end-to-end testing suite
│
├── test_e2e.py                 # One-command root automated test runner
├── README.md                   # Complete documentation & demonstration instructions
└── REVIEW_GUIDE.md             # In-depth architectural guide, code walkthrough & viva Q&A
```

---

## 3. Configuration Schema (`backend/release_config.json`)

The progressive delivery engine strictly validates `backend/release_config.json` before any candidate release is created.

### Schema Definition
```json
{
  "version": "v4.0",
  "message": "Healthy release",
  "error_rate": 0,
  "threshold": 5
}
```

### Validation Rules
| Field | Type | Constraint | Behavior on Violation |
| :--- | :--- | :--- | :--- |
| `version` | `string` | Required, non-empty | HTTP 400 rejection; active release preserved |
| `message` | `string` | Required, non-empty | HTTP 400 rejection; active release preserved |
| `error_rate` | `number` | Required, numeric, `0 <= error_rate <= 100` | HTTP 400 rejection; active release preserved |
| `threshold` | `number` | Required, numeric, `0 <= threshold <= 100` | HTTP 400 rejection; active release preserved |
| Syntax | JSON | Valid JSON syntax | HTTP 400 rejection; active release preserved |

*Note: Invalid configurations are strictly blocked and will never alter the active release.*

---

## 4. How to Run Locally

### Prerequisites
- Python 3.9+
- A modern web browser

### Start the Application
From the `cloud05-minimal-demo` directory:
```bash
# 1. Activate existing virtual environment
source backend/venv/bin/activate
# Or if using root venv:
# source venv/bin/activate

# 2. Run Flask server
python3 backend/app.py
```

The application runs at:
**`http://localhost:5005`**

---

## 5. One-Command Automated End-to-End Tests

To run the complete automated test suite verifying all healthy, faulty, boundary, and invalid validation cases:

```bash
python3 test_e2e.py
```
*(Or alternatively: `python3 backend/test_e2e.py`)*

### Test Cases Covered & Verified
| Test | Configuration | Evaluation Criteria | Expected Result |
| :--- | :--- | :--- | :--- |
| **Healthy Release** | `error_rate: 0%`, `threshold: 5%` | `0 <= 5` | Promoted to Active |
| **Healthy Boundary** | `error_rate: 5%`, `threshold: 5%` | `5 <= 5` | Promoted to Active |
| **Faulty Boundary** | `error_rate: 6%`, `threshold: 5%` | `6 > 5` | Auto-Rollback to previous stable |
| **Faulty Release** | `error_rate: 18%`, `threshold: 5%` | `18 > 5` | Auto-Rollback to previous stable |
| **Missing Field** | Missing `error_rate` | Schema check | HTTP 400 Rejected (Active preserved) |
| **Negative Rate** | `error_rate: -5%` | Range check | HTTP 400 Rejected (Active preserved) |
| **Out-of-Bounds** | `error_rate: 120%` | Range check | HTTP 400 Rejected (Active preserved) |
| **Malformed JSON** | Invalid syntax | JSON Parser | HTTP 400 Rejected (Active preserved) |

The script prints color-coded `[PASS]` / `[FAIL]` indicators and exits with code `0` on success or non-zero on failure.

---

## 6. Live Demonstration Guide for Reviewers

### Scenario 1: Healthy Deployment (Promotion Demonstration)
Demonstrates safe canary analysis and automated promotion:
1. Open `backend/release_config.json` in your editor.
2. Set the configuration:
   ```json
   {
     "version": "v4.0",
     "message": "Healthy release",
     "error_rate": 0,
     "threshold": 5
   }
   ```
3. Save the file.
4. Open the dashboard at `http://localhost:5005`. Notice the **Live Configuration Deployment** card immediately syncs and displays `v4.0`, `0%` error rate, `5%` threshold, and projected outcome `PASS (Promote)`.
5. Click **Deploy Current Configuration**.
6. Observe the progressive deployment process:
   - Configuration is validated.
   - Candidate release `v4.0` is created.
   - Canary traffic routes 10%, ramping to 50%.
   - Simulated health probes pass (`error_rate 0% <= threshold 5%`).
   - Candidate is promoted to Active Release (`v4.0`).
   - Deployment status becomes `STABLE`, health is `HEALTHY`, candidate becomes `NONE`.
   - Previous release `v1.0` is retained as rollback version.

### Scenario 2: Faulty Deployment (Circuit-Breaker Auto-Rollback Demonstration)
Demonstrates simulated anomaly detection and automated rollback:
1. Open `backend/release_config.json` in your editor.
2. Set the configuration:
   ```json
   {
     "version": "v5.0",
     "message": "Faulty release test",
     "error_rate": 18,
     "threshold": 5
   }
   ```
3. Save the file.
4. On the dashboard, observe the card immediately updates to `v5.0`, `18%`, `5%`, and projected outcome `FAIL (Rollback)`.
5. Click **Deploy Current Configuration**.
6. Observe the automatic rollback lifecycle:
   - Candidate release `v5.0` is created.
   - Canary traffic routes 10%, ramping to 50%.
   - Simulated probes fail because configured error rate (18%) exceeds threshold (5%).
   - Circuit breaker trips: health probe returns HTTP 503 (`UNHEALTHY`).
   - Automated rollback triggers: candidate `v5.0` is discarded.
   - Previous stable release (`v4.0`) is restored to 100% active traffic.
   - Deployment status transitions to `ROLLED BACK`.
   - Red **Automated Rollback Event Detected** alert card appears with timestamp and trigger reason.
   - Candidate returns to `NONE`, application health returns to `HEALTHY`.

### Scenario 3: Invalid Configuration Rejection Demonstration
Demonstrates schema protection:
1. Set `error_rate` to `-10` or remove the `version` field in `backend/release_config.json`.
2. Notice the dashboard badge changes to `Invalid Config`.
3. Click **Deploy Current Configuration**.
4. Result: The deployment is immediately rejected (HTTP 400). A danger alert appears, a danger event is logged in the live audit stream, and the active version remains completely untouched.

---

## 7. Real vs. Simulated Concepts

- **Real Implemented Components**:
  - Python Flask REST API (`/health`, `/api/status`, `/api/config`, `/api/events`, `/api/deploy/*`, `/api/reset`).
  - Strict JSON schema validation and error handling on live disk file.
  - Thread-safe in-memory progressive delivery state machine.
  - Automatic circuit-breaker rollback restoring previous stable version.
  - Real-time client-side polling and reactive UI rendering.
- **Simulated Concepts**:
  - Synthetic health probes and error rate calculations (simulates Prometheus metrics without requiring heavy daemon setups).
  - Configured traffic split ratios (simulates Istio/Envoy service mesh routing).

---

## 8. API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Interactive DevOps Monitoring Dashboard |
| `/health` | `GET` | Health probe (HTTP 200 = Healthy, HTTP 503 = Unhealthy) |
| `/api/status` | `GET` | Current telemetry state, active release, candidate, traffic split |
| `/api/config` | `GET` | Current disk file content, schema validation status & last deployment |
| `/api/events` | `GET` | Chronological audit stream of all pipeline events |
| `/api/deploy/healthy` | `POST` | Preset healthy trigger (candidate `v2.0` -> promoted) |
| `/api/deploy/faulty` | `POST` | Preset faulty trigger (candidate `v3.0` -> auto-rollback) |
| `/api/deploy/current-config` | `POST` | Live disk file deployment with validation & health evaluation |
| `/api/reset` | `POST` | Resets state machine & audit log back to clean `v1.0` baseline |
