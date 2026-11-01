# CLOUD-05: Project Review & Viva Preparation Guide

**Project Title:** Mini GitOps-Based Progressive Delivery and Automatic Rollback Demo  
**Project Code:** CLOUD-05  
**Target Review:** Academic Capstone / Project Review  
**Stack:** Python 3 (Flask), HTML5, Vanilla CSS, Vanilla JavaScript  
**Runtime Endpoint:** `http://localhost:5005`

---

## 1. Project Overview & Architecture

CLOUD-05 is a lightweight, cloud-native simulation demonstrating **Progressive Delivery (Canary Release)** and **Automated Circuit-Breaker Rollback**. Rather than requiring a compute-heavy multi-node Kubernetes cluster with Argo CD, Flagger, Prometheus, and Istio, this application distills the core control-loop mechanics into a thread-safe, transparent, and responsive full-stack architecture.

### Architectural Diagram

```
                 +------------------------------------------------+
                 |            Browser Dashboard Client           |
                 |  (HTML5 / CSS3 / Vanilla JS - Polling 2000ms)  |
                 +-----------------------+------------------------+
                                         |
                       HTTP GET / POST   | JSON Poll & Action Triggers
                                         v
+---------------------------------------------------------------------------------+
|                               Flask Application Backend                         |
|                               (backend/app.py : 5005)                           |
|                                                                                 |
|  [REST API Routes]                                                              |
|   ├── GET  /                          -> Serves frontend/index.html             |
|   ├── GET  /css/style.css             -> Serves static CSS                      |
|   ├── GET  /js/app.js                 -> Serves static client logic             |
|   ├── GET  /health                    -> Health probe (200 OK / 503 Unavail)    |
|   ├── GET  /api/status                -> Live JSON state telemetry              |
|   ├── GET  /api/config                -> Current release_config.json state      |
|   ├── GET  /api/events                -> Chronological audit log stream         |
|   ├── POST /api/deploy/healthy        -> Rollout worker (Preset v2.0 Healthy)   |
|   ├── POST /api/deploy/faulty         -> Rollout worker (Preset v3.0 Faulty)    |
|   ├── POST /api/deploy/current-config -> Live file-based rollout from disk      |
|   └── POST /api/reset                 -> Operator baseline state reset          |
|                                                                                 |
|  [State Controller & Synchronization]                                          |
|   ├── threading.Lock() (state_lock)                                             |
|   ├── In-Memory State Machine: active_version, candidate, traffic_split         |
|   └── Bounded Event Stream (Max 50 chronological audit events)                  |
|                                                                                 |
|  [Background Rollout Engine (Daemon Thread)]                                    |
|   ├── Step 1: Initialize Candidate & Route 10% Canary Traffic                   |
|   ├── Step 2: Ramp Traffic to 50% & Run Simulated Synthetic Probes              |
|   └── Step 3: Branch Decision:                                                  |
|         ├── Healthy: Promote candidate to 100% active, candidate -> NONE        |
|         └── Faulty: Probe failure (503) -> Trip Circuit Breaker -> Auto-Rollback|
+---------------------------------------------------------------------------------+
```

---

## 2. Source Code Walkthrough

### 2.1 Backend: `backend/app.py`

- **Lines 1–16 (Directory Resolution & Static Hosting):**
  Uses `os.path.abspath` to dynamically compute `FRONTEND_DIR` relative to `__file__`. Flask is configured with `template_folder=FRONTEND_DIR` and `static_folder=FRONTEND_DIR` (`static_url_path=""`). This allows the single Flask instance to serve `index.html`, `/css/style.css`, and `/js/app.js` under the same origin, completely preventing Cross-Origin Resource Sharing (CORS) issues.
- **Lines 18–34 (In-Memory State Model & Lock):**
  Defines `state_lock = threading.Lock()`. Global `state` dictionary stores:
  - `active_version`: Current stable release serving 100% baseline traffic.
  - `previous_stable_version`: Retained release for rollback target.
  - `candidate_version`: Active canary version (or `"NONE"`).
  - `deployment_status`: `"STABLE"`, `"DEPLOYING"`, or `"ROLLED BACK"`.
  - `application_health`: `"HEALTHY"` or `"UNHEALTHY"`.
  - `traffic_split`: `{"active": int, "candidate": int}`.
  - `latest_rollback`: Metadata dictionary with failed version, restored version, timestamp, and reason.
  - `events`: List of chronological audit items.
- **Lines 36–53 (`add_event()` Audit Logger):**
  Prepends events with timestamp, unique ID, classification (`info`, `warning`, `danger`, `success`), and details. Enforces a ceiling of 50 events to prevent unbounded memory growth.
- **Lines 55–142 (`run_deployment_worker()` Engine):**
  Simulates a progressive delivery control loop inside a background daemon thread:
  1. Sets candidate version, status `DEPLOYING`, and configured split `90% active / 10% candidate`.
  2. Sleeps 2.0s to allow client polling to render the canary stage.
  3. Ramps traffic to `50% active / 50% candidate` and logs simulated probe execution.
  4. If `should_fail=False`: Promotes candidate to `active_version`, resets candidate to `"NONE"`, status to `"STABLE"`, split to `100/0`.
  5. If `should_fail=True`: Sets `application_health = "UNHEALTHY"`, logs probe error. Sleeps 2.2s so the client renders HTTP 503 in red. Automatically activates the circuit breaker: restores `active_version = current_stable`, sets status to `"ROLLED BACK"`, cleans candidate to `"NONE"`, resets split to `100/0`, and logs detailed rollback metadata.
- **Lines 144–185 (Core Endpoints):**
  - `/`: Serves `frontend/index.html`.
  - `/health`: Returns HTTP 200 when `HEALTHY`, HTTP 503 when `UNHEALTHY`.
  - `/api/status`: JSON telemetry consumed by the dashboard every 2 seconds.
  - `/api/events`: Complete event stream for the dashboard audit log.
- **Lines 186–243 (Trigger Endpoints):**
  - `POST /api/deploy/healthy`: Spawns worker with candidate `v2.0` (or `v2.1` if active is `v2.0`) and `should_fail=False`. Rejects request with HTTP 409 if a deployment is already in progress.
  - `POST /api/deploy/faulty`: Spawns worker with candidate `v3.0` and `should_fail=True`. Returns HTTP 409 if already deploying.
  - `POST /api/reset`: Resets state to initial `v1.0` baseline. Rejects request with HTTP 409 if a deployment is currently active to prevent race conditions.

### 2.2 Frontend Client Logic: `frontend/js/app.js`

- **Lines 1–20 (Initialization & Polling Engine):**
  Sets 2000ms polling intervals for `fetchStatus()` and `fetchEvents()`. Binds click listeners to action buttons.
- **Lines 22–42 (Telemetry Fetchers):**
  Asynchronously queries `/api/status` and `/api/events` using `fetch()`. Passes payload to DOM rendering functions.
- **Lines 44–118 (`updateDashboardUI()`):**
  - Dynamically updates active version, candidate version badge, and deployment status.
  - Updates Application Health badge and subtext (`HTTP 200 (Simulated Probe: PASS)` or `HTTP 503 (Simulated Failure)`).
  - Updates progress bar widths for `Active` and `Canary` splits.
  - Toggles visibility of the Rollback Alert Card (`#rollback-card`) and populates failure metadata.
- **Lines 120–145 (`updateEventsUI()`):**
  Tracks both `events.length` and `lastTopEventId`. Only updates the DOM when new events arrive, avoiding unnecessary reflows while preventing the log from freezing at the 50-event limit.
- **Lines 147–208 (Action Handlers & Safety Locking):**
  Disables action buttons and the Reset button while `DEPLOYING` is active (`setButtonsDisabled(true)`), preventing operator race conditions during ongoing rollouts. Displays toast feedback banners.

### 2.3 Dashboard UI: `frontend/index.html`

- Semantic HTML5 structure structured into a 2-column DevOps monitoring dashboard:
  - **Left Panel:** Action trigger cards, core telemetry metric cards (Active Release, Candidate Release, Deployment Status, Application Health), simulated traffic distribution visualizer, and collapsible automated rollback event card.
  - **Right Panel:** Live audit stream displaying chronological deployment events.
  - **Header & Footer:** Explicit badges declaring `Health Checks: Simulated Probes` and in-memory architecture details.

### 2.4 Styling & Dark Theme: `frontend/css/style.css`

- Modern DevOps terminal styling using CSS custom properties (`--bg-main: #0B0F19`, `--bg-card: #111827`, `--color-green: #10B981`, `--color-red: #EF4444`, `--color-yellow: #F59E0B`).
- Includes smooth micro-animations: `.pulse-dot` for live connection indicator, `@keyframes flash` for flashing yellow badge during `DEPLOYING`, and subtle card hover states.

---

## 3. Real vs. Simulated Concepts Matrix

To ensure absolute academic integrity, here is the exact demarcation between implemented code and simulated concepts:

| Dimension | Implemented in CLOUD-05 Codebase | Simulated / Conceptual Equivalent |
|---|---|---|
| **Delivery Model** | In-memory progressive state controller running inside Python Flask. | Kubernetes Custom Resource Definitions (CRDs), Argo Rollouts controller, Flagger. |
| **Traffic Splitting** | Configured programmatic splits (`90/10` $\rightarrow$ `50/50` $\rightarrow$ `100/0`) enforced in state and visualized on dashboard. | Envoy / Istio VirtualService weights or AWS ALB target group weights. |
| **Health Probes** | Live HTTP endpoint (`/health`) returning real `HTTP 200` or `HTTP 503` codes. | Kubernetes Readiness/Liveness probes or Prometheus metric queries (e.g. `http_requests_total{status=~"5.*"}`). |
| **Failure Detection** | Synthetic error threshold evaluation tripping an automated circuit-breaker. | Real-world application error rate spiking due to buggy code / memory leak. |
| **Rollback Trigger** | Thread-safe Python function restoring previous stable version and purging candidate. | Argo Rollouts automated abort or Kubernetes `kubectl rollout undo deployment`. |
| **Audit Log** | Real-time in-memory event stream polled via REST API. | Kubernetes cluster events (`kubectl get events`) or Git commit history in GitOps repo. |
| **Client UI** | Reactive Vanilla JS client polling `/api/status` and `/api/events` every 2s. | Datadog, Grafana, or Argo CD web dashboard. |

---

## 4. Actual Test Results & Verification Log

The following tests were executed against the live application running on `http://localhost:5005`:

### 4.1 Test 1: Healthy Release Promotion (`v1.0` $\rightarrow$ `v2.0`)

1. **Initial Baseline:**
   - `GET /health` $\rightarrow$ `HTTP 200 OK`, `{"status": "HEALTHY", "active_version": "v1.0"}`
   - `GET /api/status` $\rightarrow$ `HTTP 200 OK`, `active_version: "v1.0"`, `candidate_version: "NONE"`, `deployment_status: "STABLE"`
2. **Trigger:**
   - `POST /api/deploy/healthy` $\rightarrow$ `HTTP 200 OK`, `{"candidate": "v2.0", "status": "initiated"}`
3. **Canary Stage 1 (T+1.0s):**
   - `status: "DEPLOYING"`, `candidate_version: "v2.0"`, `traffic_split: {"active": 90, "candidate": 10}`
4. **Canary Stage 2 (T+3.0s):**
   - `status: "DEPLOYING"`, `candidate_version: "v2.0"`, `traffic_split: {"active": 50, "candidate": 50}`
5. **Promotion Complete (T+5.5s):**
   - `status: "STABLE"`, `active_version: "v2.0"`, `candidate_version: "NONE"`, `traffic_split: {"active": 100, "candidate": 0}`
   - `GET /health` $\rightarrow$ `HTTP 200 OK`

### 4.2 Test 2: Faulty Release & Automatic Rollback (`v3.0` $\rightarrow$ Rollback to `v2.0`)

1. **Trigger:**
   - `POST /api/deploy/faulty` $\rightarrow$ `HTTP 200 OK`, `{"candidate": "v3.0", "status": "initiated"}`
2. **Canary Initiation (T+1.0s):**
   - `status: "DEPLOYING"`, `candidate_version: "v3.0"`, `traffic_split: {"active": 90, "candidate": 10}`
3. **Traffic Ramping (T+3.0s):**
   - `status: "DEPLOYING"`, `candidate_version: "v3.0"`, `traffic_split: {"active": 50, "candidate": 50}`
4. **Probe Failure Detection (T+4.5s):**
   - `GET /health` $\rightarrow$ **`HTTP 503 SERVICE UNAVAILABLE`**, `{"status": "UNHEALTHY"}`
   - `GET /api/status` $\rightarrow$ `application_health: "UNHEALTHY"`
   - Dashboard Application Health card turns **RED**.
5. **Automated Circuit-Breaker Rollback (T+7.0s):**
   - `status: "ROLLED BACK"`
   - `active_version: "v2.0"` (restored previous stable version)
   - `candidate_version: "NONE"` (candidate purged)
   - `application_health: "HEALTHY"` (restored to 200 OK)
   - `traffic_split: {"active": 100, "candidate": 0}`
   - `latest_rollback`:
     ```json
     {
       "failed_version": "v3.0",
       "restored_version": "v2.0",
       "timestamp": "11:21:58",
       "reason": "Simulated health probe failed on v3.0: HTTP 503 synthetic error threshold exceeded (18% > 5%)."
     }
     ```

---

## 5. 15 Viva Questions and Answers

### Q1: What is Progressive Delivery, and how does it differ from a standard rolling update?
**Answer:** In a standard rolling update, pods are gradually replaced with new versions without evaluating real-world application performance. Progressive delivery introduces canary analysis and metric-based gating: new versions receive a small fraction of traffic (e.g., 10%, then 50%) while automated health probes monitor latency and error rates. If thresholds are breached, traffic is instantly rolled back before 100% of users are impacted.

### Q2: Why does this project use an in-memory dictionary rather than a database like PostgreSQL or SQLite?
**Answer:** The primary objective of CLOUD-05 is to demonstrate real-time state machine transitions and canary control loops without external operational dependencies. An in-memory data store with thread locking provides microsecond read/write performance for high-frequency polling, eliminates database migration overhead, and allows clean resets between demonstrations.

### Q3: How is thread safety maintained between HTTP request handlers and background deployment threads?
**Answer:** Python's `threading.Lock()` (`state_lock` in `backend/app.py`) synchronizes access to the global `state` dictionary. Any modification to versions, health status, or traffic splits acquires `with state_lock:`, ensuring that concurrent polling requests (`GET /api/status`) never read inconsistent or partially updated states.

### Q4: What happens if a user clicks "Deploy Healthy Release" while another deployment is in flight?
**Answer:** The endpoint checks `if state["deployment_status"] == "DEPLOYING":` under the lock and immediately returns `HTTP 409 Conflict` with an error message: `{"error": "A deployment is already in progress"}`. Additionally, the frontend JavaScript disables both action buttons while deploying.

### Q5: How does the `/health` endpoint reflect application state?
**Answer:** The `/health` endpoint checks `state["application_health"]`. When `HEALTHY`, it returns `HTTP 200 OK`. When the faulty deployment triggers a probe failure, `application_health` transitions to `UNHEALTHY`, causing `/health` to return `HTTP 503 Service Unavailable`. Once the rollback completes, it returns to `HTTP 200 OK`.

### Q6: What is a circuit breaker in this architecture?
**Answer:** A circuit breaker is an automated pattern that interrupts an operation when failure criteria are met. In CLOUD-05, when synthetic error rates breach the 5% threshold during canary analysis on `v3.0`, the circuit breaker trips, halts traffic routing to the candidate, purges `v3.0`, and restores 100% traffic to the stable release `v2.0`.

### Q7: How does the frontend dashboard update without page refreshes?
**Answer:** `frontend/js/app.js` runs a non-blocking asynchronous polling loop using `setInterval()` set to 2000 milliseconds. Every 2 seconds, it fetches `/api/status` and `/api/events`, compares changes against cached values, and selectively updates DOM elements (text, CSS classes, progress bar widths).

### Q8: Why is the traffic distribution labelled as "simulated / configured"?
**Answer:** Because the application does not have an active data-plane proxy (such as Envoy, NGINX, or HAProxy) dynamically routing user network packets. Instead, the configured traffic split reflects the intended target state of the progressive delivery pipeline. Labelling it as "configured / simulated" maintains academic integrity.

### Q9: How are race conditions prevented when an operator clicks "Reset"?
**Answer:** In `backend/app.py`, `reset_state()` verifies that `state["deployment_status"] != "DEPLOYING"`. If a rollout worker is active, the reset request is rejected with `HTTP 409 Conflict`. In the frontend, the Reset button is also disabled while `isDeploying = true`.

### Q10: How are CORS issues avoided in this project?
**Answer:** The Flask backend serves both the API endpoints (`/api/*`) and the static frontend assets (`/`, `/css/style.css`, `/js/app.js`) from the exact same origin (`http://localhost:5005`). Since requests originate from the same host, port, and protocol, browser Same-Origin Policy applies without needing CORS headers.

### Q11: How is the event audit log prevented from consuming infinite memory?
**Answer:** In `add_event()`, after a new event is inserted at the front of `state["events"]`, the list is sliced to a maximum of 50 items (`state["events"] = state["events"][:50]`). This ring-buffer approach caps memory usage while preserving the latest 50 audit entries.

### Q12: How does the frontend avoid re-rendering the event log if no new events arrived?
**Answer:** `updateEventsUI()` inspects both `events.length` and the unique ID of the latest event (`events[0].id`). If both match the previously rendered state, the function immediately returns without touching the DOM, preventing UI flicker.

### Q13: What exact HTTP code is returned when a health probe fails, and why?
**Answer:** It returns `HTTP 503 Service Unavailable`. In cloud computing, HTTP 503 is standard for health probe failures indicating that a service replica is unhealthy and should be removed from ingress routing.

### Q14: How does this project simulate a GitOps trigger?
**Answer:** In production GitOps (e.g. Argo CD), a Git commit updates a deployment manifest in a repository, which the controller detects. In this demo, clicking the deployment button simulates this trigger by invoking the backend rollout worker with the new target candidate version.

### Q15: What are the main limitations of this lightweight architecture compared to a production Kubernetes deployment?
**Answer:** 
1. **Single-Process Scope:** It runs inside a single Python process rather than containerized microservices across multiple nodes.
2. **Simulated Wire Traffic:** Traffic splits are logical state representations rather than physical packet distributions across pods.
3. **In-Memory Ephemerality:** State is reset if the Python process restarts, unlike GitOps where Git is the persistent single source of truth.
*However, it fully proves the algorithmic logic of automated progressive delivery and circuit breaker rollbacks without overhead.*

---

## 6. How to Run & Demonstrate

```bash
# 1. Activate environment
source backend/venv/bin/activate

# 2. Run Flask server
python3 backend/app.py
```

Open **`http://localhost:5005`** and follow the 2-minute demonstration script:
1. Show baseline state (`v1.0`).
2. Click **Deploy Healthy Release** $\rightarrow$ Watch canary ramp and promotion to `v2.0`.
3. Click **Deploy Faulty Release** $\rightarrow$ Watch canary ramp, probe failure (`UNHEALTHY` / 503), circuit-breaker trip, and auto-rollback to `v2.0`.
4. Click **Reset** $\rightarrow$ Restore clean baseline.
