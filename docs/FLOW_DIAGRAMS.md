# CLOUD-05: Complete Architectural & Procedural Flow Diagrams

This document contains all formal flowcharts, sequence diagrams, state machines, and microservice topology diagrams for **CLOUD-05: GitOps CI/CD with Progressive Delivery and Automated Rollback Using Real-Time Application Health Analysis**.

---

## 1. End-to-End GitOps CI/CD & Delivery Flowchart

This flowchart maps the entire lifecycle of a code change: from developer commit in GitHub, through the CI pipeline and Docker build, into Argo CD GitOps reconciliation, Argo Rollouts progressive canary steps, and Prometheus telemetry evaluation to either stable promotion or automated rollback.

```mermaid
flowchart TD
    subgraph S1["1. Code & Desired State Management"]
        Dev["Developer Git Commit"] --> Git["GitHub Repository (main branch)"]
    end

    subgraph S2["2. Continuous Integration Pipeline (GitHub Actions)"]
        Git --> Lint["ESLint Static Analysis"]
        Lint --> Vitest["Vitest Backend Tests (35 Tests)"]
        Vitest --> OrderTest["Order Microservice Tests (3 Tests)"]
        OrderTest --> E2E["12-Stage HTTP E2E Test Suite"]
        E2E --> DockerBuild["Multi-Stage Alpine Docker Build"]
        DockerBuild --> Image["Docker Images (cloud05-capstone:v1.0.1)"]
    end

    subgraph S3["3. GitOps Continuous Delivery (Argo CD)"]
        Image --> Manifests["Kubernetes Manifests (k8s/rollout.yaml)"]
        Manifests --> ArgoCD["Argo CD Controller (Reconciliation Loop)"]
        ArgoCD --> K8s["Kubernetes Cluster (Namespace: cloud05-app)"]
    end

    subgraph S4["4. Progressive Delivery & Traffic Gating (Argo Rollouts)"]
        K8s --> RolloutCtrl["Argo Rollouts Controller"]
        RolloutCtrl --> Step1["Step 1: 10% Canary Weight (Canary Pods)"]
        Step1 --> Step2["Step 2-8: 20% - 80% Canary Weight"]
        Step2 --> Step3["Step 9: 100% Traffic Promotion"]
    end

    subgraph S5["5. Automated Health Analysis & Decision Gate"]
        Step1 --> PromScrape["Prometheus Scraper (/metrics every 5s)"]
        Step2 --> PromScrape
        PromScrape --> Analysis["Argo Rollouts AnalysisRun"]
        
        Analysis --> Decision{"Health Metric Evaluation<br/>Error Rate <= 5%<br/>Success Rate >= 95%"}
        
        Decision -- "PASS (3 Consecutive Checks)" --> Step2
        Decision -- "FAIL (Threshold Breached)" --> Rollback["Automated Circuit-Breaker Rollback<br/>(Abort Rollout & Revert Traffic to Stable)"]
    end

    subgraph S6["6. Telemetry & User Interface"]
        Step3 --> Dashboard["Live DevOps Dashboard (http://localhost:5005)"]
        Rollback --> Dashboard
    end
```

---

## 2. Runtime Telemetry Feedback & Analysis Sequence Diagram

This sequence diagram depicts the exact millisecond-level interaction between client requests, pods, Prometheus scraping, AnalysisRuns, and the Rollouts controller during healthy vs. faulty deployments.

```mermaid
sequenceDiagram
    autonumber
    participant Client as User / Client HTTP Traffic
    participant Gateway as API Gateway (cloud05-active-service)
    participant Canary as Canary Pod (Candidate v2.0)
    participant Stable as Stable Pods (Active v1.0.1)
    participant Prom as Prometheus Server (Port 9090)
    participant Analysis as Argo Rollouts AnalysisRun
    participant Rollout as Argo Rollouts Controller

    Client->>Gateway: Incoming HTTP Requests
    Gateway->>Canary: Route 10% Canary Traffic
    Gateway->>Stable: Route 90% Stable Traffic
    
    Canary-->>Gateway: HTTP Responses (With Errors if Defective)
    Prom->>Canary: Scrape /metrics (every 5 seconds)
    
    Rollout->>Analysis: Instantiate AnalysisRun for Current Step
    Analysis->>Prom: Query PromQL: Error Rate & Success Rate
    
    alt Scenario A: Healthy Candidate (Error Rate <= 5%)
        Prom-->>Analysis: Error Rate = 0.0% (PASS)
        Analysis-->>Rollout: Phase: Successful (3 consecutive passes)
        Rollout->>Gateway: Advance Traffic Weight (25% -> 50% -> 100%)
        Note over Rollout,Gateway: Candidate Successfully Promoted to Active Stable
    else Scenario B: Defective Candidate (Error Rate > 5%)
        Prom-->>Analysis: Error Rate = 18.2% (BREACH DETECTED)
        Analysis-->>Rollout: Phase: Failed (Failure limit reached)
        Rollout->>Canary: Abort Rollout (Scale Canary Pods to 0)
        Rollout->>Gateway: Immediate Cutover: 100% Traffic to Stable Release
        Note over Rollout,Stable: Autonomous Circuit Breaker Rollback (MTTR = 0.75s)
    end
```

---

## 3. Progressive Delivery State Machine

This state machine visualizes the life cycle and status transitions of deployments within both the Kubernetes cluster and the Gateway engine.

```mermaid
stateDiagram-v2
    [*] --> STABLE: System Initialized (v1.0.1 Active)

    STABLE --> DEPLOYING: Candidate Deployment Triggered (e.g. v2.0)

    state DEPLOYING {
        [*] --> Canary10: Step 1 (10% Canary / 90% Stable)
        Canary10 --> HealthProbe1: Prometheus AnalysisRun Probe
        HealthProbe1 --> Canary25: Pass (Error Rate <= 5%)
        Canary25 --> HealthProbe2: Prometheus AnalysisRun Probe
        HealthProbe2 --> Canary50: Pass (Error Rate <= 5%)
        Canary50 --> Canary100: Pass (Error Rate <= 5%)
    }

    DEPLOYING --> STABLE: 100% Promoted (Candidate becomes new Stable)
    DEPLOYING --> ROLLED_BACK: Health Threshold Breached (Error Rate > 5%)

    state ROLLED_BACK {
        [*] --> AbortCanary: Abort Rollout & Terminate Candidate Pods
        AbortCanary --> RestoreStable: Route 100% Traffic to Previous Stable
    }

    ROLLED_BACK --> STABLE: State Machine Reset or New Valid Deployment
```

---

## 4. Microservice Mesh & Cluster Network Topology

This diagram details the networking boundaries, service endpoints, port allocations, and inter-service HTTP proxies across the `cloud05-app`, `monitoring`, and `argocd` Kubernetes namespaces.

```mermaid
graph TD
    subgraph ClientLayer["Client & Web Access"]
        Browser["DevOps Dashboard: http://localhost:5005"]
        ArgoUI["Argo Rollouts UI: http://localhost:3100/rollouts"]
        ArgoCDUI["Argo CD Console: https://localhost:8443"]
        PromUI["Prometheus UI: http://localhost:9090"]
    end

    subgraph NamespaceApp["Kubernetes Namespace: cloud05-app"]
        SvcActive["Service: cloud05-active-service (:80, :5005)"]
        SvcPreview["Service: cloud05-preview-service (:80)"]
        SvcOrder["Service: order-active-service (:5006)"]
        
        GW_Pods["cloud05-service Pods (4 Replicas)<br/>Image: cloud05-capstone:v1.0.1"]
        OS_Pods["order-service Pods (3 Replicas)<br/>Image: cloud05-order-service:v1.0.1"]
        
        SvcActive --> GW_Pods
        SvcPreview -.-> GW_Pods
        SvcOrder --> OS_Pods
        
        GW_Pods -->|Internal Proxy: /api/demo/orders| SvcOrder
    end

    subgraph NamespaceMonitoring["Kubernetes Namespace: monitoring"]
        PromServer["Prometheus Server (:9090)"]
        PromServer -->|Scrapes /metrics| GW_Pods
        PromServer -->|Scrapes /metrics| OS_Pods
    end

    subgraph NamespaceArgoCD["Kubernetes Namespace: argocd"]
        ArgoCDApp["Argo CD Application: cloud05-progressive-delivery"]
        ArgoCDApp -.->|Reconciles Manifests| NamespaceApp
    end

    Browser --> SvcActive
    ArgoUI --> GW_Pods
    ArgoCDUI --> ArgoCDApp
    PromUI --> PromServer
```

---

## 5. Step-by-Step Flow Description (Review Walkthrough)

### Step 1: Desired State Change
- A developer pushes code to `main` branch on GitHub repository `https://github.com/vinayak872/CAPSTONE-FINAL.git`.
- GitHub Actions CI executes ESLint, 35 Vitest backend tests, 3 order microservice tests, and the 12-stage E2E suite.
- If all tests pass, Docker Buildx compiles the multi-stage Alpine image tagged with the commit SHA or release version.

### Step 2: GitOps Reconciliation
- Argo CD detects the Git commit and reconciles the target Kubernetes cluster (`cloud05-app`).
- The `Rollout` manifest updates the container image reference to candidate `v2.0`.

### Step 3: Canary Traffic Gating
- The Argo Rollouts controller starts with **Step 1** at **10% canary traffic weight**.
- 1 replica runs the candidate image, while 3 replicas continue running the active stable release.
- Client requests hitting `cloud05-active-service` are distributed across pods via Kubernetes service endpoints.

### Step 4: Real-Time Prometheus Health Gating
- Candidate pods emit HTTP request counters and latencies on `/metrics`.
- In-cluster Prometheus scrapes these metrics every 5 seconds.
- An `AnalysisRun` instantiates and executes PromQL queries:
  - Error rate must be $\le 5\%$.
  - Success rate must be $\ge 95\%$.
  - Requires 3 consecutive passes (`count: 3`).

### Step 5: Automated Decision & Recovery
- **If Healthy:** The controller advances through steps (20%, 30%, 40%, 50%, 60%, 70%, 80%, 100%) until the candidate becomes the new 100% active stable release.
- **If Faulty:** The threshold breach is detected within **4.01s**, tripping the circuit breaker. The candidate rollout aborts immediately, scaling candidate pods to 0 and restoring 100% of traffic to the stable release in **0.75s** (MTTR), achieving a **65.5% reduction in cumulative blast radius**.
