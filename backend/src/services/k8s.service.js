import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { env } from '../config/environment.js';
import { stateService } from './state.service.js';
import { eventService } from './event.service.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);
const SA_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const SA_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

class K8sService {
  constructor() {
    this.status = {
      kubernetesConnected: false,
      argoRolloutsInstalled: false,
      argoCdConnected: false,
      prometheusConnected: false,
      clusterInfo: null,
      clusterRollout: null,
      orderServiceRollout: null,
      argoCdApp: null,
      latestAnalysisRun: null,
      lastChecked: null
    };

    this.lastObservedRevision = null;
    this.lastObservedPhase = null;
    this.lastObservedStep = null;
    this.lastObservedAnalysisPhase = null;
    this.hasSyncedRollout = false;
    this.isChecking = false;
    this.consecutiveFailures = 0;
    this.argoRolloutsFailures = 0;
    this.argoCdFailures = 0;
    this.prometheusFailures = 0;
    this.rolloutQueryFailures = 0;

    // Start background sync loop
    this.startBackgroundSync();
  }

  isInCluster() {
    return Boolean(process.env.KUBERNETES_SERVICE_HOST && fs.existsSync(SA_TOKEN_PATH));
  }

  inClusterRequest(apiPath, { method = 'GET', body = null, contentType = 'application/json' } = {}) {
    return new Promise((resolve, reject) => {
      const token = fs.readFileSync(SA_TOKEN_PATH, 'utf-8').trim();
      const ca = fs.existsSync(SA_CA_PATH) ? fs.readFileSync(SA_CA_PATH) : undefined;
      const host = process.env.KUBERNETES_SERVICE_HOST;
      const port = Number.parseInt(process.env.KUBERNETES_SERVICE_PORT || '443', 10);

      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      };
      if (body) {
        headers['Content-Type'] = contentType;
        headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req = https.request({ host, port, path: apiPath, method, ca, headers, timeout: 3000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data);
            }
          } else {
            reject(new Error(`Kubernetes API ${method} ${apiPath} returned HTTP ${res.statusCode}`));
          }
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error(`Kubernetes API timeout for ${apiPath}`));
      });
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  async checkPrometheusReady() {
    if (this.isInCluster()) {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 2000);
      try {
        const res = await fetch('http://prometheus-server.monitoring.svc.cluster.local:9090/-/ready', {
          signal: controller.signal
        });
        return res.ok;
      } finally {
        clearTimeout(t);
      }
    }
    const { stdout } = await execAsync(
      'kubectl get pod -l app=prometheus-server -n monitoring -o json',
      { timeout: 3000 }
    );
    const list = JSON.parse(stdout);
    const pod = list.items?.[0];
    return Boolean(
      pod &&
      pod.status?.phase === 'Running' &&
      pod.status?.containerStatuses?.every((c) => c.ready)
    );
  }

  startBackgroundSync() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    // Initial check
    this.checkConnectivity().catch(() => {});

    // Cluster connectivity sync every 3000ms with debouncing
    setInterval(() => {
      if (!this.isChecking) {
        this.checkConnectivity().catch(() => {});
      }
    }, 3000);

    // Synthetic traffic generator: sends a lightweight GET request every 2s
    // so Prometheus has live request telemetry to evaluate error and success rates.
    setInterval(() => {
      this.sendSyntheticTraffic();
    }, 2000);
  }

  sendSyntheticTraffic() {
    const options = {
      hostname: '127.0.0.1',
      port: env.PORT,
      path: '/api/demo/products',
      method: 'GET',
      timeout: 1000
    };
    const req = http.request(options, (res) => {
      res.resume(); // consume response body
    });
    req.on('error', () => {});
    req.end();
  }

  async triggerArgoCdSync() {
    try {
      const patchBody = JSON.stringify({
        metadata: { annotations: { 'argocd.argoproj.io/refresh': 'hard' } }
      });
      let message = 'Argo CD hard refresh triggered';
      if (this.isInCluster()) {
        await this.inClusterRequest(
          '/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/cloud05-progressive-delivery',
          { method: 'PATCH', body: patchBody, contentType: 'application/merge-patch+json' }
        );
      } else {
        const { stdout } = await execAsync(
          'kubectl patch application cloud05-progressive-delivery -n argocd --type merge -p \'{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}\'',
          { timeout: 5000 }
        );
        message = stdout.trim();
      }
      eventService.addEvent(
        'Argo CD GitOps: Triggered hard refresh from GitHub',
        'info',
        'Polling repository https://github.com/vinayak872/CAPSTONE-FINAL.git for desired state changes.'
      );
      // Immediately run check
      setTimeout(() => this.checkConnectivity().catch(() => {}), 500);
      return { success: true, message };
    } catch (err) {
      logger.error('Failed to trigger Argo CD sync', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async checkConnectivity() {
    this.isChecking = true;
    const inCluster = this.isInCluster();
    try {
      // 1. Kubernetes cluster check
      let k8sSuccess = false;
      let clusterInfoText = null;
      try {
        if (inCluster) {
          const versionInfo = await this.inClusterRequest('/version');
          k8sSuccess = true;
          clusterInfoText = `In-cluster Kubernetes API (${versionInfo.gitVersion || 'connected'})`;
        } else {
          const { stdout } = await execAsync('kubectl cluster-info --request-timeout=5s', { timeout: 6000 });
          k8sSuccess = true;
          clusterInfoText = stdout.split('\n')[0] || 'Connected';
        }
      } catch {
        k8sSuccess = false;
      }

      if (k8sSuccess) {
        this.status.kubernetesConnected = true;
        this.status.clusterInfo = clusterInfoText;
        this.consecutiveFailures = 0;
      } else {
        this.consecutiveFailures += 1;
        // Require 2 consecutive failures before marking K8s offline to absorb transient local API jitter
        if (this.consecutiveFailures >= 2) {
          this.status.kubernetesConnected = false;
          this.status.clusterInfo = 'Cluster unreachable or Docker daemon not running';
          this.status.argoRolloutsInstalled = false;
          this.status.argoCdConnected = false;
          this.status.prometheusConnected = false;
          this.status.clusterRollout = null;
          this.status.orderServiceRollout = null;
          this.status.argoCdApp = null;
          this.status.latestAnalysisRun = null;
          this.status.lastChecked = new Date().toISOString();
          return this.getStatus();
        }
      }

      if (env.EXECUTION_MODE === 'kubernetes') {
        stateService.executionMode = 'kubernetes';
      }

      // 2. Argo Rollouts CRD check
      try {
        if (inCluster) {
          await this.inClusterRequest(`/apis/argoproj.io/v1alpha1/namespaces/${env.KUBERNETES_NAMESPACE}/rollouts`);
        } else {
          await execAsync('kubectl get crd rollouts.argoproj.io --request-timeout=4s', { timeout: 5000 });
        }
        this.status.argoRolloutsInstalled = true;
        this.argoRolloutsFailures = 0;
      } catch {
        this.argoRolloutsFailures += 1;
        if (this.argoRolloutsFailures >= 2) {
          this.status.argoRolloutsInstalled = false;
        }
      }

      // 3. Prometheus Server check
      try {
        const promReady = await this.checkPrometheusReady();
        if (promReady) {
          this.status.prometheusConnected = true;
          this.prometheusFailures = 0;
        } else {
          this.prometheusFailures += 1;
          if (this.prometheusFailures >= 2) {
            this.status.prometheusConnected = false;
          }
        }
      } catch {
        this.prometheusFailures += 1;
        if (this.prometheusFailures >= 2) {
          this.status.prometheusConnected = false;
        }
      }

      // 4. Query Argo CD Application
      try {
        const app = inCluster
          ? await this.inClusterRequest('/apis/argoproj.io/v1alpha1/namespaces/argocd/applications/cloud05-progressive-delivery')
          : JSON.parse((await execAsync('kubectl get application cloud05-progressive-delivery -n argocd -o json', { timeout: 5000 })).stdout);
        const syncStatus = app.status?.sync?.status || 'Unknown';
        const healthStatus = app.status?.health?.status || 'Unknown';
        const revision = app.status?.sync?.revision || 'unknown';
        const repoUrl = app.spec?.source?.repoURL || 'https://github.com/vinayak872/CAPSTONE-FINAL.git';
        const targetRevision = app.spec?.source?.targetRevision || 'main';
        const reconciledAt = app.status?.reconciledAt || null;

        this.status.argoCdConnected = true;
        this.argoCdFailures = 0;
        this.status.argoCdApp = {
          name: app.metadata?.name || 'cloud05-progressive-delivery',
          sync_status: syncStatus,
          health_status: healthStatus,
          revision,
          short_revision: revision.substring(0, 7),
          repo_url: repoUrl,
          target_revision: targetRevision,
          reconciled_at: reconciledAt,
          operation_phase: app.status?.operationState?.phase || null,
          operation_message: app.status?.operationState?.message || null
        };

        // Emit audit event when revision changes
        if (this.lastObservedRevision && this.lastObservedRevision !== revision && revision !== 'unknown') {
          eventService.addEvent(
            `Argo CD GitOps: Pulled commit ${revision.substring(0, 7)} from GitHub`,
            'info',
            `Reconciliation synchronized desired state from ${repoUrl} [branch: ${targetRevision}]`
          );
        }
        this.lastObservedRevision = revision;
      } catch {
        this.argoCdFailures += 1;
        if (this.argoCdFailures >= 2) {
          this.status.argoCdConnected = false;
          this.status.argoCdApp = null;
        }
      }

      // 5. Query Argo Rollout
      if (this.status.argoRolloutsInstalled) {
        try {
          const ro = inCluster
            ? await this.inClusterRequest(`/apis/argoproj.io/v1alpha1/namespaces/${env.KUBERNETES_NAMESPACE}/rollouts/${env.ARGO_ROLLOUT_NAME}`)
            : JSON.parse((await execAsync(`kubectl get rollout ${env.ARGO_ROLLOUT_NAME} -n ${env.KUBERNETES_NAMESPACE} -o json`, { timeout: 4000 })).stdout);
          const stepsCount = ro.spec?.strategy?.canary?.steps?.length || 9;
          const stepIndex = ro.status?.currentStepIndex != null ? ro.status.currentStepIndex : stepsCount;
          const currentStep = `${stepIndex}/${stepsCount}`;

          // Calculate current canary weight from steps definition
          let currentWeight = 0;
          if (stepIndex < stepsCount) {
            const stepDef = ro.spec?.strategy?.canary?.steps?.[stepIndex];
            if (stepDef?.setWeight) {
              currentWeight = stepDef.setWeight;
            } else {
              // Look backward for most recent setWeight
              for (let i = stepIndex; i >= 0; i--) {
                const s = ro.spec?.strategy?.canary?.steps?.[i];
                if (s?.setWeight) {
                  currentWeight = s.setWeight;
                  break;
                }
              }
            }
          }

          const phase = ro.status?.phase || 'Healthy';
          const isAborted = ro.status?.abort === true;
          let abortReason = null;

          if (ro.status?.conditions) {
            const abortedCond = ro.status.conditions.find((c) => c.reason === 'RolloutAborted' || c.message?.includes('aborted'));
            if (abortedCond) {
              abortReason = abortedCond.message;
            }
          }

          const containerImage = ro.spec?.template?.spec?.containers?.[0]?.image || 'cloud05-capstone:v1.0';

          // Accurately classify stable vs canary replicas using Rollout status and phase
          const totalReplicas = ro.status?.replicas || 0;
          const readyReplicas = ro.status?.readyReplicas || 0;
          const updatedReplicas = ro.status?.updatedReplicas || 0;
          const isFullyStable = (phase === 'Healthy' && (stepIndex >= stepsCount || ro.status?.stableRS === ro.status?.currentPodHash));
          const canaryReplicas = isFullyStable ? 0 : Math.max(0, updatedReplicas);
          const stableReplicas = isFullyStable ? readyReplicas : Math.max(0, readyReplicas - canaryReplicas);

          this.status.clusterRollout = {
            name: ro.metadata?.name,
            phase,
            current_step_index: stepIndex,
            total_steps: stepsCount,
            current_step: currentStep,
            current_weight: currentWeight,
            replicas: totalReplicas,
            ready_replicas: readyReplicas,
            updated_replicas: updatedReplicas,
            stable_replicas: stableReplicas,
            canary_replicas: canaryReplicas,
            stable_rs: ro.status?.stableRS,
            current_pod_hash: ro.status?.currentPodHash,
            images: containerImage,
            aborted: isAborted,
            abort_reason: abortReason
          };

          // Synchronize cluster rollout state with in-memory stateService
          this.syncWithStateService(this.status.clusterRollout);

          // Track changes and emit audit log events
          if (this.lastObservedPhase !== phase) {
            if (phase === 'Progressing') {
              eventService.addEvent(
                `Argo Rollouts: Progressive Canary active for ${containerImage}`,
                'warning',
                `Rollout controller initialized step ${currentStep} (${currentWeight}% traffic weight)`
              );
            } else if (phase === 'Degraded' || isAborted) {
              eventService.addEvent(
                `AUTOMATIC ROLLBACK TRIGGERED: Argo Rollouts aborted ${containerImage}`,
                'danger',
                abortReason || 'Analysis metric failed threshold: automated circuit breaker restored stable v1.0.'
              );
            } else if (phase === 'Healthy' && this.lastObservedPhase === 'Progressing') {
              eventService.addEvent(
                `Argo Rollouts: Rollout successfully promoted to 100% stable`,
                'success',
                `All canary steps and Prometheus analysis checks passed.`
              );
            }
            this.lastObservedPhase = phase;
          }

          if (this.lastObservedStep !== currentStep && phase === 'Progressing') {
            eventService.addEvent(
              `Argo Rollouts: Advanced to Step ${currentStep} (${currentWeight}% Canary Weight)`,
              'info',
              `Running Prometheus health probes and automated metric analysis.`
            );
            this.lastObservedStep = currentStep;
          }
          this.rolloutQueryFailures = 0;
        } catch {
          this.rolloutQueryFailures += 1;
          if (this.rolloutQueryFailures >= 2) {
            this.status.clusterRollout = null;
          }
        }

        // Query Order Microservice Rollout
        try {
          const os = inCluster
            ? await this.inClusterRequest(`/apis/argoproj.io/v1alpha1/namespaces/${env.KUBERNETES_NAMESPACE}/rollouts/order-service`)
            : JSON.parse((await execAsync(`kubectl get rollout order-service -n ${env.KUBERNETES_NAMESPACE} -o json`, { timeout: 3000 })).stdout);
          const osStepsCount = os.spec?.strategy?.canary?.steps?.length || 9;
          const osStepIndex = os.status?.currentStepIndex != null ? os.status.currentStepIndex : osStepsCount;
          const osPhase = os.status?.phase || 'Healthy';
          const osTotalReplicas = os.status?.replicas || 0;
          const osReadyReplicas = os.status?.readyReplicas || 0;
          const osUpdatedReplicas = os.status?.updatedReplicas || 0;
          const osIsFullyStable = (osPhase === 'Healthy' && (osStepIndex >= osStepsCount || os.status?.stableRS === os.status?.currentPodHash));
          const osCanaryReplicas = osIsFullyStable ? 0 : Math.max(0, osUpdatedReplicas);
          const osStableReplicas = osIsFullyStable ? osReadyReplicas : Math.max(0, osReadyReplicas - osCanaryReplicas);

          this.status.orderServiceRollout = {
            name: 'order-service',
            phase: osPhase,
            current_step: `${osStepIndex}/${osStepsCount}`,
            replicas: osTotalReplicas,
            ready_replicas: osReadyReplicas,
            updated_replicas: osUpdatedReplicas,
            stable_replicas: osStableReplicas,
            canary_replicas: osCanaryReplicas,
            stable_rs: os.status?.stableRS,
            current_pod_hash: os.status?.currentPodHash,
            images: os.spec?.template?.spec?.containers?.[0]?.image || 'cloud05-order-service:v1.0',
            aborted: os.status?.abort === true
          };
        } catch {
          this.status.orderServiceRollout = null;
        }
      }

      // 6. Query AnalysisRuns
      try {
        const arList = inCluster
          ? await this.inClusterRequest(`/apis/argoproj.io/v1alpha1/namespaces/${env.KUBERNETES_NAMESPACE}/analysisruns`)
          : JSON.parse((await execAsync(`kubectl get analysisrun -n ${env.KUBERNETES_NAMESPACE} -o json --sort-by=.metadata.creationTimestamp`, { timeout: 4000 })).stdout);
        // Focus on AnalysisRuns associated with cloud05-service (primary rollout)
        const allItems = arList.items || [];
        const cloud05Runs = allItems.filter(item => {
          const owner = item.metadata?.ownerReferences?.[0]?.name;
          const name = item.metadata?.name || '';
          return owner === env.ARGO_ROLLOUT_NAME || name.startsWith(env.ARGO_ROLLOUT_NAME);
        });
        const targetRuns = cloud05Runs.length > 0 ? cloud05Runs : allItems;
        const runs = targetRuns.sort(
          (a, b) => new Date(a.metadata?.creationTimestamp || 0) - new Date(b.metadata?.creationTimestamp || 0)
        );
        if (runs.length > 0) {
          const latest = runs[runs.length - 1];
          const metrics = (latest.status?.metricResults || []).map((m) => {
            const lastVal = m.measurements?.[m.measurements.length - 1]?.value || 'N/A';
            return {
              name: m.name,
              phase: m.phase,
              count: m.count,
              value: lastVal,
              consecutive_success: m.consecutiveSuccess || 0
            };
          });

          this.status.latestAnalysisRun = {
            name: latest.metadata?.name,
            phase: latest.status?.phase || 'Running',
            metrics,
            started_at: latest.status?.startedAt,
            completed_at: latest.status?.completedAt
          };

          if (this.lastObservedAnalysisPhase !== this.status.latestAnalysisRun.phase) {
            const p = this.status.latestAnalysisRun.phase;
            if (p === 'Failed') {
              eventService.addEvent(
                `Prometheus AnalysisRun: Metric Failure Detected on ${latest.metadata?.name}`,
                'danger',
                `Health threshold breached. Triggering automated rollout abort & rollback.`
              );
            } else if (p === 'Successful') {
              eventService.addEvent(
                `Prometheus AnalysisRun: All Metrics Passed on ${latest.metadata?.name}`,
                'success',
                `Error rate <= 5% and success rate >= 95% confirmed by in-cluster Prometheus.`
              );
            }
            this.lastObservedAnalysisPhase = p;
          }
        }
      } catch {
        this.status.latestAnalysisRun = null;
      }

      this.status.lastChecked = new Date().toISOString();
      return this.getStatus();
    } finally {
      this.isChecking = false;
    }
  }

  syncWithStateService(rollout) {
    if (!rollout || process.env.NODE_ENV === 'test') return;

    const imageName = rollout.images || 'cloud05-capstone:v1.0';
    const imageVersion = imageName.split(':')[1] || 'v1.0';

    if (rollout.phase === 'Progressing' || rollout.phase === 'Paused') {
      stateService.deploymentStatus = 'DEPLOYING';
      stateService.candidateVersion = imageVersion;
      const weight = rollout.current_weight || 10;
      stateService.trafficSplit = { active: 100 - weight, candidate: weight };
      stateService.setApplicationHealth('HEALTHY');
    } else if (rollout.aborted || rollout.phase === 'Degraded') {
      const stableVer = stateService.previousStableVersion || 'v1.0';
      stateService.deploymentStatus = 'ROLLED BACK';
      stateService.candidateVersion = 'NONE';
      stateService.activeVersion = stableVer;
      stateService.trafficSplit = { active: 100, candidate: 0 };
      stateService.latestRollback = {
        failed_version: imageVersion,
        restored_version: stableVer,
        timestamp: new Date().toTimeString().split(' ')[0],
        reason: rollout.abort_reason || `AnalysisRun failed: Metric threshold breached in candidate ${imageVersion}`
      };
    } else if (rollout.phase === 'Healthy') {
      if (!stateService.isDeploying()) {
        stateService.deploymentStatus = 'STABLE';
        stateService.previousStableVersion = imageVersion;
        if (!stateService.lastConfigDeployment) {
          stateService.activeVersion = imageVersion;
        }
        stateService.candidateVersion = 'NONE';
        stateService.trafficSplit = { active: 100, candidate: 0 };
        this.hasSyncedRollout = true;
      }
    }
  }

  getStatus() {
    // argo_rollouts_connected: true when the CRD exists AND we have live rollout data.
    // Using cluster_rollout existence as the authoritative signal avoids a split where
    // the CRD check passes but we have no actual rollout data (and vice-versa).
    const argoRolloutsActive =
      this.status.argoRolloutsInstalled && this.status.clusterRollout != null;

    return {
      execution_mode: this.status.kubernetesConnected ? 'kubernetes' : 'simulation',
      kubernetes_connected: this.status.kubernetesConnected,
      argo_rollouts_connected: argoRolloutsActive,
      argo_rollouts_crd_installed: this.status.argoRolloutsInstalled,
      argocd_connected: this.status.argoCdConnected,
      prometheus_connected: this.status.prometheusConnected,
      cluster_info: this.status.clusterInfo,
      cluster_rollout: this.status.clusterRollout,
      order_service_rollout: this.status.orderServiceRollout,
      argocd_app: this.status.argoCdApp,
      latest_analysis_run: this.status.latestAnalysisRun,
      namespace: env.KUBERNETES_NAMESPACE,
      rollout_name: env.ARGO_ROLLOUT_NAME,
      last_checked: this.status.lastChecked
    };
  }
}

export const k8sService = new K8sService();
