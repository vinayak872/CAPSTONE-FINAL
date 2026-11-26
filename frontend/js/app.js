// CLOUD-05: GitOps Progressive Delivery & Auto-Rollback Dashboard Logic

let lastEventCount = 0;
let lastTopEventId = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchStatus();
    fetchEvents();
    fetchConfig();
    fetchResearch();

    // High-responsiveness polling (1s) to immediately reflect changes & deployment progress
    setInterval(fetchStatus, 1000);
    setInterval(fetchEvents, 1000);
    setInterval(fetchConfig, 1000);

    // Bind Action Buttons
    document.getElementById('btn-deploy-healthy').addEventListener('click', triggerHealthyDeploy);
    document.getElementById('btn-deploy-faulty').addEventListener('click', triggerFaultyDeploy);
    document.getElementById('btn-deploy-config').addEventListener('click', triggerConfigDeploy);
    document.getElementById('btn-reset').addEventListener('click', triggerReset);

    // Bind Demo Microservice Action Buttons
    const btnDemoProducts = document.getElementById('btn-demo-products');
    if (btnDemoProducts) btnDemoProducts.addEventListener('click', fetchDemoProducts);

    const btnDemoOrder = document.getElementById('btn-demo-order');
    if (btnDemoOrder) btnDemoOrder.addEventListener('click', placeDemoOrder);

    // Bind GitOps Force Sync Button
    const btnGitopsSync = document.getElementById('btn-gitops-sync');
    if (btnGitopsSync) btnGitopsSync.addEventListener('click', triggerGitopsSync);
});

async function fetchStatus() {
    const banner = document.getElementById('api-connection-banner');
    const errEl = document.getElementById('api-connection-error');
    const loadingEl = document.getElementById('loading-indicator');
    const refreshEl = document.getElementById('last-refresh-time');
    try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        if (banner) banner.classList.add('hidden');
        if (loadingEl) loadingEl.textContent = 'Polling (1s)';
        if (refreshEl) refreshEl.textContent = `Last refresh: ${new Date().toLocaleTimeString()}`;
        updateDashboardUI(data);
    } catch (err) {
        console.error('Failed to fetch status:', err);
        if (banner) banner.classList.remove('hidden');
        if (errEl) errEl.textContent = `Unable to reach /api/status (${err.message}). Retrying every 1s...`;
        if (loadingEl) loadingEl.textContent = 'Reconnecting...';
    }
}

async function fetchResearch() {
    const badge = document.getElementById('research-source-badge');
    const blastEl = document.getElementById('res-blast-radius');
    const blastSub = document.getElementById('res-blast-sub');
    const detectEl = document.getElementById('res-detection-latency');
    const mttrEl = document.getElementById('res-mttr');
    const mttrSub = document.getElementById('res-mttr-sub');
    const errEl = document.getElementById('res-error-rate');
    try {
        const res = await fetch('/api/research');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const base = data.baseline_aggregates || {};
        const prog = data.progressive_aggregates || {};
        const trials = data.metadata?.num_trials || '--';

        if (badge) badge.textContent = `${data.source || 'experiment_raw_data.json'} (${trials} trials)`;
        if (blastEl) blastEl.textContent = `${prog.blast_radius_reduction_percent ?? '--'}%`;
        if (blastSub) blastSub.textContent = `${prog.average_faulty_exposure_percent ?? '--'}% cumulative exposure (vs 100% direct cutover)`;
        if (detectEl) detectEl.textContent = `${prog.average_detection_time_sec ?? '--'}s`;
        if (mttrEl) mttrEl.textContent = `${prog.average_recovery_time_sec ?? '--'}s (${prog.mttr_speedup_factor ?? '--'}x)`;
        if (mttrSub) mttrSub.textContent = `vs ${base.average_recovery_time_sec ?? '--'}s conventional baseline`;
        if (errEl) errEl.textContent = `${prog.average_error_rate_percent ?? '--'}% vs ${base.average_error_rate_percent ?? '--'}%`;
    } catch {
        if (badge) badge.textContent = 'Unavailable';
        if (blastEl) blastEl.textContent = 'UNAVAILABLE';
        if (blastSub) blastSub.textContent = 'Failed to load /api/research';
        if (detectEl) detectEl.textContent = '--';
        if (mttrEl) mttrEl.textContent = '--';
        if (errEl) errEl.textContent = '--';
    }
}

async function fetchEvents() {
    try {
        const response = await fetch('/api/events');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        updateEventsUI(data.events || []);
    } catch (err) {
        console.error('Failed to fetch events:', err);
    }
}

async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        updateConfigUI(data);
    } catch (err) {
        console.error('Failed to fetch config:', err);
    }
}

function updateDashboardUI(data) {
    // Active Version
    const activeVersionEl = document.getElementById('val-active-version');
    if (activeVersionEl) activeVersionEl.textContent = data.active_version;

    // Candidate Version
    const candidateVersionEl = document.getElementById('val-candidate-version');
    const candidateSubEl = document.getElementById('val-candidate-sub');
    if (candidateVersionEl) {
        candidateVersionEl.textContent = data.candidate_version;
        if (data.candidate_version !== 'NONE') {
            if (candidateSubEl) candidateSubEl.textContent = `Canary analysis active`;
            candidateVersionEl.style.color = '#F59E0B';
        } else {
            if (candidateSubEl) candidateSubEl.textContent = 'No canary in progress';
            candidateVersionEl.style.color = 'inherit';
        }
    }

    // Deployment Status
    const statusEl = document.getElementById('val-deployment-status');
    const statusSubEl = document.getElementById('val-deployment-sub');
    if (statusEl) {
        statusEl.textContent = data.deployment_status;
        statusEl.className = 'metric-badge-large';

        if (data.deployment_status === 'STABLE') {
            statusEl.classList.add('status-stable');
            if (statusSubEl) statusSubEl.textContent = 'Desired state converged';
            setButtonsDisabled(false);
        } else if (data.deployment_status === 'DEPLOYING') {
            statusEl.classList.add('status-deploying');
            if (statusSubEl) statusSubEl.textContent = 'Canary analysis in progress...';
            setButtonsDisabled(true);
        } else if (data.deployment_status === 'ROLLED BACK') {
            statusEl.classList.add('status-rolledback');
            if (statusSubEl) statusSubEl.textContent = 'Auto-reverted due to failed probe';
            setButtonsDisabled(false);
        }
    }

    // Application Health
    const healthEl = document.getElementById('val-app-health');
    const healthSubEl = document.getElementById('val-app-health-sub');
    if (healthEl) {
        healthEl.textContent = data.application_health;
        healthEl.className = 'metric-badge-large';
        if (data.application_health === 'HEALTHY') {
            healthEl.classList.add('health-healthy');
            if (healthSubEl) healthSubEl.textContent = 'HTTP 200 via /health probe';
        } else {
            healthEl.classList.add('health-unhealthy');
            if (healthSubEl) healthSubEl.textContent = 'HTTP 503 via /health (Probe Failure)';
        }
    }

    // Traffic Split
    const activePercent = data.traffic_split.active;
    const candidatePercent = data.traffic_split.candidate;

    const barActive = document.getElementById('traffic-bar-active');
    const barCandidate = document.getElementById('traffic-bar-candidate');
    if (barActive) barActive.style.width = `${activePercent}%`;
    if (barCandidate) barCandidate.style.width = `${candidatePercent}%`;

    const barActiveText = document.getElementById('bar-active-text');
    const barCandidateText = document.getElementById('bar-candidate-text');
    if (barActiveText) barActiveText.textContent = `${activePercent}%`;
    if (barCandidateText) barCandidateText.textContent = `${candidatePercent}%`;

    const trafficSplitLabel = document.getElementById('traffic-split-label');
    if (trafficSplitLabel) {
        trafficSplitLabel.textContent = `Active ${activePercent}% | Candidate ${candidatePercent}% (Configured)`;
    }

    // Update Cluster Connectivity & Execution Mode Pills
    updateConnectivityPills(data);

    // Update Pipeline Track Visualizer
    updatePipelineVisualizer(data);

    // Rollback Card
    const rollbackCard = document.getElementById('rollback-card');
    if (rollbackCard) {
        if (data.latest_rollback) {
            rollbackCard.classList.remove('hidden');
            const rbTs = document.getElementById('rollback-timestamp');
            const rbFailed = document.getElementById('rollback-failed-version');
            const rbRestored = document.getElementById('rollback-restored-version');
            const rbReason = document.getElementById('rollback-reason');

            if (rbTs) rbTs.textContent = data.latest_rollback.timestamp;
            if (rbFailed) rbFailed.textContent = data.latest_rollback.failed_version;
            if (rbRestored) rbRestored.textContent = data.latest_rollback.restored_version;
            if (rbReason) rbReason.textContent = data.latest_rollback.reason;
        } else {
            rollbackCard.classList.add('hidden');
        }
    }

    // Update Configuration Card Status
    const cfgActiveEl = document.getElementById('cfg-active-version');
    if (cfgActiveEl) cfgActiveEl.textContent = data.active_version;
    const cfgCandidateEl = document.getElementById('cfg-candidate-version');
    if (cfgCandidateEl) cfgCandidateEl.textContent = data.candidate_version;
    const cfgResultEl = document.getElementById('cfg-last-result');
    if (cfgResultEl) {
        if (data.last_config_deployment) {
            const res = data.last_config_deployment.result;
            cfgResultEl.textContent = `${res} (${data.last_config_deployment.version} at ${data.last_config_deployment.timestamp})`;
            cfgResultEl.className = `result-badge ${res === 'PROMOTED' ? 'result-promoted' : 'result-rolledback'} font-mono`;
        } else {
            cfgResultEl.textContent = 'NONE';
            cfgResultEl.className = 'result-badge result-none font-mono';
        }
    }

    // Update Live GitOps & Cluster Progressive Delivery Monitor
    updateGitopsUI(data);
}

function updateConnectivityPills(data) {
    const pillMode = document.getElementById('pill-execution-mode');
    const pillK8s = document.getElementById('pill-k8s-status');
    const pillArgo = document.getElementById('pill-argo-status');
    const pillArgocd = document.getElementById('pill-argocd-status');
    const pillProm = document.getElementById('pill-prom-status');
    const footerMode = document.getElementById('footer-execution-mode');

    const isK8s = data.execution_mode === 'kubernetes' || (data.cluster_connectivity && data.cluster_connectivity.kubernetes);

    if (pillMode) {
        pillMode.textContent = isK8s ? 'Mode: Kubernetes (Connected)' : 'Engine: Node.js (Simulation Mode)';
        pillMode.className = isK8s ? 'pill-active-tag' : 'pill-simulation-tag';
    }

    if (footerMode) {
        const clusterInfo = data.cluster_connectivity?.cluster_rollout;
        if (clusterInfo) {
            footerMode.textContent = `Kubernetes Connected (Rollout ${clusterInfo.phase}, Step ${clusterInfo.current_step}, Pods ${clusterInfo.ready_replicas}/${clusterInfo.replicas})`;
        } else {
            footerMode.textContent = isK8s ? 'Kubernetes Connected Mode' : 'Simulation Mode (In-Memory Controller)';
        }
    }

    if (pillK8s && data.cluster_connectivity) {
        const k8sOnline = data.cluster_connectivity.kubernetes;
        pillK8s.textContent = k8sOnline ? 'K8s: Online' : 'K8s: Unavailable';
        pillK8s.className = k8sOnline ? 'pill-active-tag' : 'pill-offline-tag';
    }

    if (pillArgo && data.cluster_connectivity) {
        const k8sOnline = data.cluster_connectivity.kubernetes;
        const argoOnline = data.cluster_connectivity.argoRollouts;
        pillArgo.textContent = !k8sOnline ? 'Argo Rollouts: Unknown' : (argoOnline ? 'Argo Rollouts: Active' : 'Argo Rollouts: Unavailable');
        pillArgo.className = argoOnline ? 'pill-active-tag' : 'pill-offline-tag';
    }

    if (pillArgocd && data.cluster_connectivity) {
        const k8sOnline = data.cluster_connectivity.kubernetes;
        const argoCdOnline = data.cluster_connectivity.argoCd;
        pillArgocd.textContent = !k8sOnline ? 'Argo CD: Unknown' : (argoCdOnline ? 'Argo CD: Connected' : 'Argo CD: Unavailable');
        pillArgocd.className = argoCdOnline ? 'pill-active-tag' : 'pill-offline-tag';
    }

    if (pillProm && data.cluster_connectivity) {
        const k8sOnline = data.cluster_connectivity.kubernetes;
        const promOnline = data.cluster_connectivity.prometheus === true;
        pillProm.textContent = !k8sOnline ? 'Prometheus: Unknown' : (promOnline ? 'Prometheus: Active' : 'Prometheus: Unavailable');
        pillProm.className = promOnline ? 'pill-active-tag' : 'pill-offline-tag';
    }
}

function updateGitopsUI(data) {
    const conn = data.cluster_connectivity;
    if (!conn) return;

    // 1. Argo CD Live Telemetry
    const app = conn.argocd_app;
    const badgeArgo = document.getElementById('badge-argocd-sync');
    const gitopsBranch = document.getElementById('gitops-branch');
    const gitopsCommitSha = document.getElementById('gitops-commit-sha');
    const gitopsCommitLink = document.getElementById('gitops-commit-link');
    const gitopsSyncBadge = document.getElementById('gitops-sync-status-badge');
    const gitopsReconciled = document.getElementById('gitops-reconciled-time');

    if (app) {
        if (badgeArgo) {
            badgeArgo.textContent = `Argo CD: ${app.sync_status}`;
            badgeArgo.className = `badge ${app.sync_status === 'Synced' ? 'badge-success' : 'badge-warning'} font-mono`;
        }
        if (gitopsBranch) gitopsBranch.textContent = app.target_revision || 'main';
        if (gitopsCommitSha) gitopsCommitSha.textContent = app.short_revision || '--';
        if (gitopsCommitLink && app.revision && app.revision !== 'unknown') {
            gitopsCommitLink.href = `https://github.com/vinayak872/CAPSTONE-FINAL/commit/${app.revision}`;
        }
        if (gitopsSyncBadge) {
            gitopsSyncBadge.textContent = app.sync_status.toUpperCase();
            gitopsSyncBadge.className = `badge ${app.sync_status === 'Synced' ? 'badge-success' : 'badge-warning'} font-mono`;
        }
        if (gitopsReconciled && app.reconciled_at) {
            const dt = new Date(app.reconciled_at);
            gitopsReconciled.textContent = dt.toLocaleTimeString();
        }
    } else {
        if (badgeArgo) {
            badgeArgo.textContent = 'Argo CD: Offline';
            badgeArgo.className = 'badge badge-subtle font-mono';
        }
        if (gitopsBranch) gitopsBranch.textContent = '--';
        if (gitopsCommitSha) gitopsCommitSha.textContent = '--';
        if (gitopsCommitLink) gitopsCommitLink.href = '#';
        if (gitopsSyncBadge) {
            gitopsSyncBadge.textContent = 'OFFLINE';
            gitopsSyncBadge.className = 'badge badge-subtle font-mono';
        }
        if (gitopsReconciled) gitopsReconciled.textContent = '--';
    }

    // 2. Argo Rollout Live Telemetry
    const ro = conn.cluster_rollout;
    const badgeRo = document.getElementById('badge-rollout-phase');
    const liveRoPhase = document.getElementById('live-rollout-phase');
    const liveRoStep = document.getElementById('live-rollout-step');
    const liveRoPods = document.getElementById('live-rollout-pods');
    const liveRoImage = document.getElementById('live-rollout-image');
    const liveAbortBanner = document.getElementById('live-cluster-abort-banner');
    const liveAbortDesc = document.getElementById('live-abort-desc');

    if (ro) {
        if (badgeRo) {
            badgeRo.textContent = `Rollout: ${ro.phase}`;
            badgeRo.className = `badge ${ro.phase === 'Healthy' ? 'badge-success' : (ro.phase === 'Degraded' ? 'badge-danger' : 'badge-warning')} font-mono`;
        }
        if (liveRoPhase) {
            liveRoPhase.textContent = ro.phase.toUpperCase();
            liveRoPhase.className = `badge ${ro.phase === 'Healthy' ? 'badge-success' : (ro.phase === 'Degraded' ? 'badge-danger' : 'badge-warning')} font-mono`;
        }
        if (liveRoStep) {
            if (ro.phase === 'Progressing' || ro.phase === 'Paused') {
                liveRoStep.textContent = `Step ${ro.current_step} (${ro.current_weight}% Canary Weight)`;
                liveRoStep.style.color = '#F59E0B';
            } else if (ro.phase === 'Degraded' || ro.aborted) {
                liveRoStep.textContent = 'Rollout Aborted (Automated Circuit Breaker)';
                liveRoStep.style.color = '#EF4444';
            } else {
                liveRoStep.textContent = `Step ${ro.current_step} (100% Stable)`;
                liveRoStep.style.color = '#10B981';
            }
        }
        if (liveRoPods) {
            liveRoPods.textContent = `${ro.ready_replicas} Ready / ${ro.replicas} Total (${ro.updated_replicas || 0} Canary)`;
        }
        if (liveRoImage) {
            liveRoImage.textContent = ro.images;
            liveRoImage.className = 'gitops-stat-value font-mono highlight-green';
        }

        // Abort & Rollback Banner
        if (liveAbortBanner) {
            if (ro.aborted || ro.phase === 'Degraded') {
                liveAbortBanner.classList.remove('hidden');
                if (liveAbortDesc) {
                    liveAbortDesc.textContent = ro.abort_reason || 'Candidate breached Prometheus error rate threshold (<= 5%). Rollout aborted by Argo Rollouts controller; traffic reverted safely to stable.';
                }
            } else {
                liveAbortBanner.classList.add('hidden');
            }
        }
    } else {
        if (badgeRo) {
            badgeRo.textContent = 'Rollout: Offline';
            badgeRo.className = 'badge badge-subtle font-mono';
        }
        if (liveRoPhase) {
            liveRoPhase.textContent = 'OFFLINE';
            liveRoPhase.className = 'badge badge-subtle font-mono';
        }
        if (liveRoStep) {
            liveRoStep.textContent = 'Cluster not connected';
            liveRoStep.style.color = '';
        }
        if (liveRoPods) liveRoPods.textContent = '-- / --';
        if (liveRoImage) {
            liveRoImage.textContent = '--';
            liveRoImage.className = 'gitops-stat-value font-mono';
        }
        if (liveAbortBanner) liveAbortBanner.classList.add('hidden');
    }

    // 3. In-Cluster Prometheus AnalysisRun Details
    const ar = conn.latest_analysis_run;
    const analysisBadge = document.getElementById('live-analysis-badge');
    const analysisMetrics = document.getElementById('live-analysis-metrics');

    if (ar) {
        if (analysisBadge) {
            analysisBadge.textContent = ar.phase.toUpperCase();
            analysisBadge.className = `badge ${ar.phase === 'Successful' ? 'badge-success' : (ar.phase === 'Failed' ? 'badge-danger' : 'badge-warning')} font-mono`;
        }
        if (analysisMetrics && ar.metrics && ar.metrics.length > 0) {
            const summary = ar.metrics.map(m => `${m.name}: ${m.value}`).join(' | ');
            analysisMetrics.textContent = summary;
        }
    } else {
        if (analysisBadge) {
            analysisBadge.textContent = 'OFFLINE';
            analysisBadge.className = 'badge badge-subtle font-mono';
        }
        if (analysisMetrics) analysisMetrics.textContent = 'Awaiting live AnalysisRun telemetry';
    }

    // 4. Microservices Mesh Topology
    const orderRollout = conn.order_service_rollout;
    const meshLinkStatus = document.getElementById('mesh-link-status');
    const meshGwVersion = document.getElementById('mesh-gw-version');
    const meshGwBadge = document.getElementById('mesh-gw-badge');
    const meshGwHealth = document.getElementById('mesh-gw-health');
    const msOrderBadge = document.getElementById('ms-order-badge');
    const msOrderPhase = document.getElementById('ms-order-phase');
    const msOrderPods = document.getElementById('ms-order-pods');

    if (meshGwVersion) meshGwVersion.textContent = data.active_version;
    if (meshGwBadge) {
        meshGwBadge.textContent = `${data.deployment_status} (${data.traffic_split.active}%)`;
        meshGwBadge.className = `badge ${data.deployment_status === 'STABLE' ? 'badge-success' : 'badge-warning'} font-mono`;
    }
    if (meshGwHealth) {
        meshGwHealth.textContent = data.application_health;
        meshGwHealth.className = `${data.application_health === 'HEALTHY' ? 'text-success' : 'text-danger'} font-bold`;
    }

    if (orderRollout) {
        if (meshLinkStatus) {
            meshLinkStatus.textContent = 'Gateway \u2194 Order-Service: Cluster Active';
            meshLinkStatus.className = 'badge badge-success font-mono';
        }
        if (msOrderBadge) {
            msOrderBadge.textContent = orderRollout.phase.toUpperCase();
            msOrderBadge.className = `badge ${orderRollout.phase === 'Healthy' ? 'badge-success' : (orderRollout.phase === 'Degraded' ? 'badge-danger' : 'badge-warning')} font-mono`;
        }
        if (msOrderPhase) {
            msOrderPhase.textContent = `${orderRollout.phase} (${orderRollout.current_step})`;
            msOrderPhase.className = `font-mono ${orderRollout.phase === 'Healthy' ? 'text-success' : (orderRollout.phase === 'Degraded' ? 'text-danger' : 'text-warning')} font-bold`;
        }
        if (msOrderPods) {
            msOrderPods.textContent = `${orderRollout.ready_replicas} Ready / ${orderRollout.replicas} Total (${orderRollout.updated_replicas || 0} Canary)`;
        }
    } else {
        if (meshLinkStatus) {
            meshLinkStatus.textContent = 'Gateway \u2194 Order-Service: Fallback Mode (Offline)';
            meshLinkStatus.className = 'badge badge-subtle font-mono';
        }
        if (msOrderBadge) {
            msOrderBadge.textContent = 'OFFLINE';
            msOrderBadge.className = 'badge badge-subtle font-mono';
        }
        if (msOrderPhase) {
            msOrderPhase.textContent = '--';
            msOrderPhase.className = 'font-mono text-muted';
        }
        if (msOrderPods) msOrderPods.textContent = '-- / --';
    }
}

async function triggerGitopsSync() {
    const btn = document.getElementById('btn-gitops-sync');
    const icon = document.getElementById('gitops-sync-icon');
    if (btn) btn.disabled = true;
    if (icon) icon.textContent = '⏳';
    try {
        const res = await fetch('/api/k8s/sync', { method: 'POST' });
        await res.json();
        if (icon) icon.textContent = '✓';
        setTimeout(() => {
            if (icon) icon.textContent = '🔄';
            if (btn) btn.disabled = false;
        }, 1500);
        fetchStatus();
        fetchEvents();
    } catch (err) {
        console.error('Failed to trigger GitOps sync:', err);
        if (icon) icon.textContent = '❌';
        setTimeout(() => {
            if (icon) icon.textContent = '🔄';
            if (btn) btn.disabled = false;
        }, 2000);
    }
}

function updatePipelineVisualizer(data) {
    const overall = document.getElementById('pipeline-overall-status');
    const step5 = document.getElementById('pipe-step-5');
    const step6 = document.getElementById('pipe-step-6');
    const step7 = document.getElementById('pipe-step-7');
    const canaryMeta = document.getElementById('pipe-canary-meta');
    const analysisMeta = document.getElementById('pipe-analysis-meta');
    const finalTitle = document.getElementById('pipe-final-title');
    const finalMeta = document.getElementById('pipe-final-meta');

    if (!overall || !step5 || !step6 || !step7) return;

    if (data.deployment_status === 'DEPLOYING') {
        const candidateSplit = data.traffic_split.candidate;
        overall.textContent = `Deploying Candidate ${data.candidate_version} (${candidateSplit}% Canary)`;
        overall.className = 'badge badge-warning font-mono';

        step5.className = 'pipe-step step-active';
        if (canaryMeta) canaryMeta.textContent = `Weight: ${candidateSplit}%`;

        if (candidateSplit >= 50) {
            step6.className = 'pipe-step step-active';
            if (analysisMeta) analysisMeta.textContent = 'Probes Evaluating...';
        } else {
            step6.className = 'pipe-step';
            if (analysisMeta) analysisMeta.textContent = 'Awaiting Exposure';
        }

        step7.className = 'pipe-step';
        if (finalTitle) finalTitle.textContent = 'Decision Gated';
        if (finalMeta) finalMeta.textContent = 'Analyzing...';
    } else if (data.deployment_status === 'ROLLED BACK') {
        overall.textContent = `Automated Rollback Executed (Restored ${data.active_version})`;
        overall.className = 'badge badge-danger font-mono';

        step5.className = 'pipe-step step-complete';
        if (canaryMeta) canaryMeta.textContent = 'Canary Aborted';

        step6.className = 'pipe-step step-failed';
        if (analysisMeta) analysisMeta.textContent = 'Probe Breached 503';

        step7.className = 'pipe-step step-failed';
        if (finalTitle) finalTitle.textContent = 'Rollback Triggered';
        if (finalMeta) finalMeta.textContent = `Restored ${data.active_version}`;
    } else {
        // STABLE
        overall.textContent = `Pipeline Converged (Active: ${data.active_version})`;
        overall.className = 'badge badge-success font-mono';

        step5.className = 'pipe-step';
        if (canaryMeta) canaryMeta.textContent = 'No active canary';

        step6.className = 'pipe-step';
        if (analysisMeta) analysisMeta.textContent = 'Probes Idle';

        step7.className = 'pipe-step step-complete';
        if (finalTitle) finalTitle.textContent = 'Active Stable';
        if (finalMeta) finalMeta.textContent = `Serving ${data.active_version}`;
    }
}

function updateConfigUI(data) {
    const targetVersionEl = document.getElementById('cfg-target-version');
    const errorRateEl = document.getElementById('cfg-error-rate');
    const thresholdEl = document.getElementById('cfg-threshold');
    const projectedEl = document.getElementById('cfg-projected-outcome');
    const statusBadge = document.getElementById('config-status-badge');

    if (data.is_valid && data.config) {
        if (targetVersionEl) {
            targetVersionEl.textContent = data.config.version;
            targetVersionEl.style.color = '#60A5FA';
        }
        if (errorRateEl) errorRateEl.textContent = `${data.config.error_rate}%`;
        if (thresholdEl) thresholdEl.textContent = `${data.config.threshold}%`;

        const willPass = data.config.error_rate <= data.config.threshold;
        if (projectedEl) {
            projectedEl.textContent = willPass ? 'PASS (Promote)' : 'FAIL (Rollback)';
            projectedEl.style.color = willPass ? '#10B981' : '#EF4444';
        }

        if (statusBadge) {
            statusBadge.textContent = `Valid (${data.config.version})`;
            statusBadge.className = 'badge badge-success';
            statusBadge.title = `Message: "${data.config.message}"`;
        }
    } else {
        if (targetVersionEl) {
            targetVersionEl.textContent = 'INVALID';
            targetVersionEl.style.color = '#EF4444';
        }
        if (errorRateEl) errorRateEl.textContent = '--';
        if (thresholdEl) thresholdEl.textContent = '--';
        if (projectedEl) {
            projectedEl.textContent = 'REJECTED';
            projectedEl.style.color = '#EF4444';
        }
        if (statusBadge) {
            statusBadge.textContent = 'Invalid Config';
            statusBadge.className = 'badge badge-danger';
            statusBadge.title = data.validation_error || 'Configuration syntax or validation error';
        }
    }
}

function updateEventsUI(events) {
    const logCountEl = document.getElementById('log-count');
    if (logCountEl) logCountEl.textContent = `${events.length} events`;

    const topId = events.length > 0 ? events[0].id : null;
    if (events.length === lastEventCount && topId === lastTopEventId) return;
    lastEventCount = events.length;
    lastTopEventId = topId;

    const streamEl = document.getElementById('event-stream');
    if (!streamEl) return;
    streamEl.innerHTML = '';

    events.forEach(event => {
        const item = document.createElement('div');
        item.className = `event-item event-${event.type || 'info'}`;

        item.innerHTML = `
            <div class="event-meta">
                <span class="event-time">${event.timestamp}</span>
                <span class="badge badge-subtle font-mono">#${event.id}</span>
            </div>
            <div class="event-message">${escapeHtml(event.message)}</div>
            ${event.details ? `<div class="event-details">${escapeHtml(event.details)}</div>` : ''}
        `;
        streamEl.appendChild(item);
    });
}

async function triggerHealthyDeploy() {
    showFeedback('Submitting trigger for healthy release (v2.0)...', 'info');
    try {
        const response = await fetch('/api/deploy/healthy', { method: 'POST' });
        const res = await response.json();
        if (response.ok) {
            showFeedback(`Trigger accepted: ${res.message}`, 'success');
            fetchStatus();
            fetchEvents();
        } else {
            showFeedback(res.error || 'Deployment rejected', 'danger');
        }
    } catch (err) {
        showFeedback(`Network error: ${err.message}`, 'danger');
    }
}

async function triggerFaultyDeploy() {
    showFeedback('Submitting trigger for faulty release (v3.0)...', 'warning');
    try {
        const response = await fetch('/api/deploy/faulty', { method: 'POST' });
        const res = await response.json();
        if (response.ok) {
            showFeedback(`Trigger accepted: ${res.message}`, 'warning');
            fetchStatus();
            fetchEvents();
        } else {
            showFeedback(res.error || 'Deployment rejected', 'danger');
        }
    } catch (err) {
        showFeedback(`Network error: ${err.message}`, 'danger');
    }
}

async function triggerReset() {
    try {
        const response = await fetch('/api/reset', { method: 'POST' });
        const res = await response.json();
        if (response.ok) {
            showFeedback('Environment state reset to baseline v1.0', 'info');
            lastEventCount = 0;
            lastTopEventId = null;
            await fetchStatus();
            await fetchEvents();
            await fetchConfig();
        } else {
            showFeedback(res.error || 'Reset failed', 'danger');
        }
    } catch (err) {
        console.error('Reset failed:', err);
    }
}

function setButtonsDisabled(disabled) {
    const btnHealthy = document.getElementById('btn-deploy-healthy');
    const btnFaulty = document.getElementById('btn-deploy-faulty');
    const btnConfig = document.getElementById('btn-deploy-config');
    const btnReset = document.getElementById('btn-reset');

    if (btnHealthy) btnHealthy.disabled = disabled;
    if (btnFaulty) btnFaulty.disabled = disabled;
    if (btnConfig) btnConfig.disabled = disabled;
    if (btnReset) btnReset.disabled = disabled;
}

async function triggerConfigDeploy() {
    showConfigFeedback('Loading backend/release_config.json & evaluating...', 'info');
    try {
        const response = await fetch('/api/deploy/current-config', { method: 'POST' });
        const res = await response.json();
        if (response.ok) {
            const isPassing = res.error_rate <= res.threshold;
            showConfigFeedback(
                `Deployment Initiated: ${res.candidate} (Error Rate: ${res.error_rate}%, Threshold: ${res.threshold}%) [${res.evaluation}]`,
                isPassing ? 'success' : 'warning'
            );
            fetchStatus();
            fetchEvents();
            fetchConfig();
        } else {
            showConfigFeedback(`Deployment Rejected: ${res.error || 'Validation error'}`, 'danger');
            fetchEvents();
            fetchConfig();
        }
    } catch (err) {
        showConfigFeedback(`Network error: ${err.message}`, 'danger');
    }
}

async function fetchDemoProducts() {
    const feedbackEl = document.getElementById('demo-feedback');
    if (!feedbackEl) return;
    feedbackEl.classList.remove('hidden');
    feedbackEl.textContent = 'Querying GET /api/demo/products...';

    try {
        const res = await fetch('/api/demo/products');
        const data = await res.json();
        feedbackEl.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        feedbackEl.textContent = `Error: ${err.message}`;
    }
}

async function placeDemoOrder() {
    const feedbackEl = document.getElementById('demo-feedback');
    if (!feedbackEl) return;
    feedbackEl.classList.remove('hidden');
    feedbackEl.textContent = 'Posting order to /api/demo/orders...';

    try {
        const res = await fetch('/api/demo/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: 'prod-001', quantity: 2 })
        });
        const data = await res.json();
        feedbackEl.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
        feedbackEl.textContent = `Error: ${err.message}`;
    }
}

function showConfigFeedback(msg, type = 'info') {
    const feedbackEl = document.getElementById('config-feedback');
    if (!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.className = `action-feedback feedback-${type}`;
    feedbackEl.classList.remove('hidden');
    setTimeout(() => {
        feedbackEl.classList.add('hidden');
    }, 5000);
}

function showFeedback(msg, type = 'info') {
    const feedbackEl = document.getElementById('action-feedback');
    if (!feedbackEl) return;
    feedbackEl.textContent = msg;
    feedbackEl.className = `action-feedback feedback-${type}`;
    feedbackEl.classList.remove('hidden');
    setTimeout(() => {
        feedbackEl.classList.add('hidden');
    }, 4000);
}

function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
