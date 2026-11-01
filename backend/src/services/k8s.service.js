import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { env } from '../config/environment.js';
import { stateService } from './state.service.js';
import { eventService } from './event.service.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

class K8sService {
  constructor() {
    this.status = {
      kubernetesConnected: false,
      argoRolloutsInstalled: false,
      argoCdConnected: false,
      prometheusConnected: false,
      clusterInfo: null,
      clusterRollout: null,
      argoCdApp: null,
      latestAnalysisRun: null,
      lastChecked: null
    };

    this.lastObservedRevision = null;
    this.lastObservedPhase = null;
    this.lastObservedStep = null;
    this.lastObservedAnalysisPhase = null;
    this.isChecking = false;

    // Start background sync loop
    this.startBackgroundSync();
  }

  startBackgroundSync() {
    // Initial check
    this.checkConnectivity().catch(() => {});

    // High frequency cluster check every 1500ms
    setInterval(() => {
      if (!this.isChecking) {
        this.checkConnectivity().catch(() => {});
      }
    }, 1500);

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
      const { stdout } = await execAsync(
        'kubectl patch application cloud05-progressive-delivery -n argocd --type merge -p \'{"metadata":{"annotations":{"argocd.argoproj.io/refresh":"hard"}}}\'',
        { timeout: 5000 }
      );
      eventService.addEvent(
        'Argo CD GitOps: Triggered hard refresh from GitHub',
        'info',
        'Polling repository https://github.com/vinayak872/CAPSTONE-FINAL.git for desired state changes.'
      );
      // Immediately run check
      setTimeout(() => this.checkConnectivity().catch(() => {}), 500);
      return { success: true, message: stdout.trim() };
    } catch (err) {
      logger.error('Failed to trigger Argo CD sync', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async checkConnectivity() {
    this.isChecking = true;
    try {
      // 1. Kubernetes cluster check
      try {
        const { stdout } = await execAsync('kubectl cluster-info --request-timeout=2s', { timeout: 3000 });
        this.status.kubernetesConnected = true;
        this.status.clusterInfo = stdout.split('\n')[0] || 'Connected';
      } catch {
        this.status.kubernetesConnected = false;
        this.status.clusterInfo = 'Cluster unreachable or Docker daemon not running';
      }

      if (!this.status.kubernetesConnected) {
        this.status.clusterRollout = null;
        this.status.argoCdApp = null;
        this.status.latestAnalysisRun = null;
        this.status.lastChecked = new Date().toISOString();
        return this.getStatus();
      }

      // 2. Argo Rollouts CRD check
      try {
        await execAsync('kubectl get crd rollouts.argoproj.io --request-timeout=2s', { timeout: 3000 });
        this.status.argoRolloutsInstalled = true;
      } catch {
        this.status.argoRolloutsInstalled = false;
      }

      // 3. Prometheus Server check
      try {
        await execAsync('kubectl get pod -l app=prometheus-server -n monitoring --request-timeout=2s', { timeout: 3000 });
        this.status.prometheusConnected = true;
      } catch {
        this.status.prometheusConnected = false;
      }

      // 4. Query Argo CD Application
      try {
        const { stdout: appOut } = await execAsync(
          'kubectl get application cloud05-progressive-delivery -n argocd -o json',
          { timeout: 4000 }
        );
        const app = JSON.parse(appOut);
        const syncStatus = app.status?.sync?.status || 'Unknown';
        const healthStatus = app.status?.health?.status || 'Unknown';
        const revision = app.status?.sync?.revision || 'unknown';
        const repoUrl = app.spec?.source?.repoURL || 'https://github.com/vinayak872/CAPSTONE-FINAL.git';
        const targetRevision = app.spec?.source?.targetRevision || 'main';
        const reconciledAt = app.status?.reconciledAt || null;

        this.status.argoCdConnected = true;
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
        this.status.argoCdConnected = false;
        this.status.argoCdApp = null;
      }

      // 5. Query Argo Rollout
      if (this.status.argoRolloutsInstalled) {
        try {
          const { stdout: roOut } = await execAsync(
            `kubectl get rollout ${env.ARGO_ROLLOUT_NAME} -n ${env.KUBERNETES_NAMESPACE} -o json`,
            { timeout: 4000 }
          );
          const ro = JSON.parse(roOut);
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

          this.status.clusterRollout = {
            name: ro.metadata?.name,
            phase,
            current_step_index: stepIndex,
            total_steps: stepsCount,
            current_step: currentStep,
            current_weight: currentWeight,
            replicas: ro.status?.replicas || 4,
            ready_replicas: ro.status?.readyReplicas || 4,
            updated_replicas: ro.status?.updatedReplicas || 0,
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
        } catch {
          this.status.clusterRollout = null;
        }
      }

      // 6. Query AnalysisRuns
      try {
        const { stdout: arOut } = await execAsync(
          `kubectl get analysisrun -n ${env.KUBERNETES_NAMESPACE} -o json --sort-by=.metadata.creationTimestamp`,
          { timeout: 4000 }
        );
        const arList = JSON.parse(arOut);
        const runs = arList.items || [];
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
    if (!rollout) return;

    const imageName = rollout.images || 'cloud05-capstone:v1.0';
    const imageVersion = imageName.split(':')[1] || 'v1.0';

    if (rollout.phase === 'Progressing' || rollout.phase === 'Paused') {
      stateService.deploymentStatus = 'DEPLOYING';
      stateService.candidateVersion = imageVersion;
      const weight = rollout.current_weight || 10;
      stateService.trafficSplit = { active: 100 - weight, candidate: weight };
      stateService.setApplicationHealth('HEALTHY');
    } else if (rollout.aborted || rollout.phase === 'Degraded') {
      stateService.deploymentStatus = 'ROLLED BACK';
      stateService.candidateVersion = 'NONE';
      stateService.activeVersion = 'v1.0';
      stateService.trafficSplit = { active: 100, candidate: 0 };
      stateService.latestRollback = {
        failed_version: imageVersion,
        restored_version: 'v1.0',
        timestamp: new Date().toTimeString().split(' ')[0],
        reason: rollout.abort_reason || `AnalysisRun failed: Metric threshold breached in candidate ${imageVersion}`
      };
    } else if (rollout.phase === 'Healthy') {
      if (stateService.deploymentStatus === 'DEPLOYING') {
        stateService.deploymentStatus = 'STABLE';
        stateService.activeVersion = imageVersion;
        stateService.candidateVersion = 'NONE';
        stateService.trafficSplit = { active: 100, candidate: 0 };
      }
    }
  }

  getStatus() {
    return {
      execution_mode: this.status.kubernetesConnected ? 'kubernetes' : 'simulation',
      kubernetes_connected: this.status.kubernetesConnected,
      argo_rollouts_connected: this.status.argoRolloutsInstalled,
      argocd_connected: this.status.argoCdConnected,
      prometheus_connected: this.status.prometheusConnected,
      cluster_info: this.status.clusterInfo,
      cluster_rollout: this.status.clusterRollout,
      argocd_app: this.status.argoCdApp,
      latest_analysis_run: this.status.latestAnalysisRun,
      namespace: env.KUBERNETES_NAMESPACE,
      rollout_name: env.ARGO_ROLLOUT_NAME,
      last_checked: this.status.lastChecked
    };
  }
}

export const k8sService = new K8sService();
