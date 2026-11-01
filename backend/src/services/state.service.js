import { env } from '../config/environment.js';
import { metricsService } from './metrics.service.js';

class StateService {
  constructor() {
    this.resetToBaseline();
  }

  resetToBaseline() {
    this.projectName = 'CLOUD-05 Capstone';
    this.activeVersion = 'v1.0';
    this.previousStableVersion = 'v1.0';
    this.candidateVersion = 'NONE';
    this.deploymentStatus = 'STABLE'; // 'STABLE' | 'DEPLOYING' | 'ROLLED BACK'
    this.applicationHealth = 'HEALTHY'; // 'HEALTHY' | 'UNHEALTHY' | 'DEGRADED'
    this.healthCheckMode = 'PASS';
    this.trafficSplit = { active: 100, candidate: 0 };
    this.latestRollback = null;
    this.lastConfigDeployment = null;
    this.executionMode = env.EXECUTION_MODE;
    this.clusterConnectivity = {
      kubernetes: false,
      argoRollouts: false,
      prometheus: true
    };

    // Update Prometheus gauges
    metricsService.serviceHealthStatus.set({ status: 'HEALTHY' }, 1);
    metricsService.rolloutTrafficPercent.set({ version: this.activeVersion, role: 'active' }, 100);
    metricsService.rolloutTrafficPercent.set({ version: 'NONE', role: 'candidate' }, 0);
  }

  getState() {
    return {
      project_name: this.projectName,
      active_version: this.activeVersion,
      previous_stable_version: this.previousStableVersion,
      candidate_version: this.candidateVersion,
      deployment_status: this.deploymentStatus,
      application_health: this.applicationHealth,
      traffic_split: { ...this.trafficSplit },
      latest_rollback: this.latestRollback ? { ...this.latestRollback } : null,
      last_config_deployment: this.lastConfigDeployment ? { ...this.lastConfigDeployment } : null,
      execution_mode: this.executionMode,
      cluster_connectivity: { ...this.clusterConnectivity }
    };
  }

  isDeploying() {
    return this.deploymentStatus === 'DEPLOYING';
  }

  startDeployment(candidateVersion, initialSplit = { active: 90, candidate: 10 }) {
    this.deploymentStatus = 'DEPLOYING';
    this.candidateVersion = candidateVersion;
    this.trafficSplit = { ...initialSplit };

    metricsService.rolloutTrafficPercent.set({ version: this.activeVersion, role: 'active' }, initialSplit.active);
    metricsService.rolloutTrafficPercent.set({ version: candidateVersion, role: 'candidate' }, initialSplit.candidate);
  }

  updateTrafficSplit(split) {
    this.trafficSplit = { ...split };
    metricsService.rolloutTrafficPercent.set({ version: this.activeVersion, role: 'active' }, split.active);
    metricsService.rolloutTrafficPercent.set({ version: this.candidateVersion, role: 'candidate' }, split.candidate);
  }

  setApplicationHealth(health) {
    this.applicationHealth = health;
    const isHealthy = health === 'HEALTHY' ? 1 : 0;
    metricsService.serviceHealthStatus.set({ status: health }, isHealthy);
  }

  promoteCandidate(configMetadata = null) {
    const currentStable = this.activeVersion;
    const promotedCandidate = this.candidateVersion;

    this.previousStableVersion = currentStable;
    this.activeVersion = promotedCandidate;
    this.candidateVersion = 'NONE';
    this.deploymentStatus = 'STABLE';
    this.setApplicationHealth('HEALTHY');
    this.trafficSplit = { active: 100, candidate: 0 };

    if (configMetadata) {
      const now = new Date().toTimeString().split(' ')[0];
      this.lastConfigDeployment = {
        version: promotedCandidate,
        error_rate: configMetadata.error_rate,
        threshold: configMetadata.threshold,
        result: 'PROMOTED',
        timestamp: now
      };
    }

    metricsService.rolloutTrafficPercent.set({ version: this.activeVersion, role: 'active' }, 100);
    metricsService.rolloutTrafficPercent.set({ version: 'NONE', role: 'candidate' }, 0);
  }

  executeRollback(failedVersion, restoredVersion, reason, configMetadata = null) {
    const now = new Date().toTimeString().split(' ')[0];

    this.candidateVersion = 'NONE';
    this.activeVersion = restoredVersion;
    this.deploymentStatus = 'ROLLED BACK';
    this.setApplicationHealth('HEALTHY'); // Restored to healthy stable version
    this.trafficSplit = { active: 100, candidate: 0 };

    this.latestRollback = {
      failed_version: failedVersion,
      restored_version: restoredVersion,
      timestamp: now,
      reason
    };

    if (configMetadata) {
      this.lastConfigDeployment = {
        version: failedVersion,
        error_rate: configMetadata.error_rate,
        threshold: configMetadata.threshold,
        result: 'ROLLED BACK',
        timestamp: now
      };
    }

    metricsService.rolloutRollbackTotal.inc({
      failed_version: failedVersion,
      restored_version: restoredVersion,
      trigger_reason: reason
    });

    metricsService.rolloutTrafficPercent.set({ version: this.activeVersion, role: 'active' }, 100);
    metricsService.rolloutTrafficPercent.set({ version: 'NONE', role: 'candidate' }, 0);
  }
}

export const stateService = new StateService();
