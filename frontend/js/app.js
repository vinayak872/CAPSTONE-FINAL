// CL-05 Capstone: GitOps Progressive Delivery & Auto-Rollback Dashboard Logic

let lastEventCount = 0;
let lastTopEventId = null;
let isDeploying = false;

document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchStatus();
    fetchEvents();
    fetchConfig();

    // High-responsiveness polling (1s) to immediately reflect disk configuration changes & deployment progress
    setInterval(fetchStatus, 1000);
    setInterval(fetchEvents, 1000);
    setInterval(fetchConfig, 1000);

    // Bind Action Buttons
    document.getElementById('btn-deploy-healthy').addEventListener('click', triggerHealthyDeploy);
    document.getElementById('btn-deploy-faulty').addEventListener('click', triggerFaultyDeploy);
    document.getElementById('btn-deploy-config').addEventListener('click', triggerConfigDeploy);
    document.getElementById('btn-reset').addEventListener('click', triggerReset);
});

async function fetchStatus() {
    try {
        const response = await fetch('/api/status');
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        updateDashboardUI(data);
    } catch (err) {
        console.error('Failed to fetch status:', err);
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
    activeVersionEl.textContent = data.active_version;

    // Candidate Version
    const candidateVersionEl = document.getElementById('val-candidate-version');
    const candidateSubEl = document.getElementById('val-candidate-sub');
    candidateVersionEl.textContent = data.candidate_version;
    if (data.candidate_version !== 'NONE') {
        candidateSubEl.textContent = `Canary analysis active`;
        candidateVersionEl.style.color = '#F59E0B';
    } else {
        candidateSubEl.textContent = 'No canary in progress';
        candidateVersionEl.style.color = 'inherit';
    }

    // Deployment Status
    const statusEl = document.getElementById('val-deployment-status');
    const statusSubEl = document.getElementById('val-deployment-sub');
    statusEl.textContent = data.deployment_status;
    statusEl.className = 'metric-badge-large';

    if (data.deployment_status === 'STABLE') {
        statusEl.classList.add('status-stable');
        statusSubEl.textContent = 'Desired state converged';
        setButtonsDisabled(false);
        isDeploying = false;
    } else if (data.deployment_status === 'DEPLOYING') {
        statusEl.classList.add('status-deploying');
        statusSubEl.textContent = 'Canary analysis in progress...';
        setButtonsDisabled(true);
        isDeploying = true;
    } else if (data.deployment_status === 'ROLLED BACK') {
        statusEl.classList.add('status-rolledback');
        statusSubEl.textContent = 'Auto-reverted due to failed probe';
        setButtonsDisabled(false);
        isDeploying = false;
    }

    // Application Health
    const healthEl = document.getElementById('val-app-health');
    const healthSubEl = document.getElementById('val-app-health-sub');
    healthEl.textContent = data.application_health;
    healthEl.className = 'metric-badge-large';
    if (data.application_health === 'HEALTHY') {
        healthEl.classList.add('health-healthy');
        if (healthSubEl) healthSubEl.textContent = 'HTTP 200 via /health (Simulated Probe)';
    } else {
        healthEl.classList.add('health-unhealthy');
        if (healthSubEl) healthSubEl.textContent = 'HTTP 503 via /health (Simulated Failure)';
    }

    // Traffic Split
    const activePercent = data.traffic_split.active;
    const candidatePercent = data.traffic_split.candidate;

    document.getElementById('traffic-bar-active').style.width = `${activePercent}%`;
    document.getElementById('traffic-bar-candidate').style.width = `${candidatePercent}%`;
    document.getElementById('bar-active-text').textContent = `${activePercent}%`;
    document.getElementById('bar-candidate-text').textContent = `${candidatePercent}%`;
    document.getElementById('traffic-split-label').textContent = 
        `Active ${activePercent}% | Candidate ${candidatePercent}% (Configured)`;

    // Rollback Card
    const rollbackCard = document.getElementById('rollback-card');
    if (data.latest_rollback) {
        rollbackCard.classList.remove('hidden');
        document.getElementById('rollback-timestamp').textContent = data.latest_rollback.timestamp;
        document.getElementById('rollback-failed-version').textContent = data.latest_rollback.failed_version;
        document.getElementById('rollback-restored-version').textContent = data.latest_rollback.restored_version;
        document.getElementById('rollback-reason').textContent = data.latest_rollback.reason;
    } else {
        rollbackCard.classList.add('hidden');
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
    document.getElementById('log-count').textContent = `${events.length} events`;
    const topId = events.length > 0 ? events[0].id : null;
    if (events.length === lastEventCount && topId === lastTopEventId) return;
    lastEventCount = events.length;
    lastTopEventId = topId;

    const streamEl = document.getElementById('event-stream');
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

