import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/environment.js';

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
      lastChecked: null
    };
  }

  async checkConnectivity() {
    // 1. Kubernetes cluster check
    try {
      const { stdout } = await execAsync('kubectl cluster-info --request-timeout=2s', { timeout: 3000 });
      this.status.kubernetesConnected = true;
      this.status.clusterInfo = stdout.split('\n')[0] || 'Connected';
    } catch {
      this.status.kubernetesConnected = false;
      this.status.clusterInfo = 'Cluster unreachable or Docker daemon not running';
    }

    // 2. Argo Rollouts CRD check
    try {
      await execAsync('kubectl get crd rollouts.argoproj.io --request-timeout=2s', { timeout: 3000 });
      this.status.argoRolloutsInstalled = true;
    } catch {
      this.status.argoRolloutsInstalled = false;
    }

    // 3. Argo CD Application controller check
    try {
      await execAsync('kubectl get applications -n argocd --request-timeout=2s', { timeout: 3000 });
      this.status.argoCdConnected = true;
    } catch {
      this.status.argoCdConnected = false;
    }

    // 4. In-cluster Prometheus Server check
    try {
      await execAsync('kubectl get pod -l app=prometheus-server -n monitoring --request-timeout=2s', { timeout: 3000 });
      this.status.prometheusConnected = true;
    } catch {
      this.status.prometheusConnected = false;
    }

    // 5. Query live cluster Rollout resource if connected
    if (this.status.kubernetesConnected && this.status.argoRolloutsInstalled) {
      try {
        const { stdout } = await execAsync(
          `kubectl get rollout ${env.ARGO_ROLLOUT_NAME} -n ${env.KUBERNETES_NAMESPACE} -o json`,
          { timeout: 3000 }
        );
        const ro = JSON.parse(stdout);
        const stepsCount = ro.spec?.strategy?.canary?.steps?.length || 9;
        const currentStep = ro.status?.currentStepIndex != null ? `${ro.status.currentStepIndex}/${stepsCount}` : `${stepsCount}/${stepsCount}`;
        this.status.clusterRollout = {
          name: ro.metadata?.name,
          phase: ro.status?.phase || 'Healthy',
          current_step: currentStep,
          replicas: ro.status?.replicas || 4,
          ready_replicas: ro.status?.readyReplicas || 4,
          updated_replicas: ro.status?.updatedReplicas || 4,
          images: ro.spec?.template?.spec?.containers?.[0]?.image || 'cloud05-capstone:v1.0'
        };
      } catch {
        this.status.clusterRollout = null;
      }
    } else {
      this.status.clusterRollout = null;
    }

    this.status.lastChecked = new Date().toISOString();
    return this.getStatus();
  }

  getStatus() {
    return {
      execution_mode: env.EXECUTION_MODE,
      kubernetes_connected: this.status.kubernetesConnected,
      argo_rollouts_connected: this.status.argoRolloutsInstalled,
      argocd_connected: this.status.argoCdConnected,
      prometheus_connected: this.status.prometheusConnected,
      cluster_info: this.status.clusterInfo,
      cluster_rollout: this.status.clusterRollout,
      namespace: env.KUBERNETES_NAMESPACE,
      rollout_name: env.ARGO_ROLLOUT_NAME,
      last_checked: this.status.lastChecked
    };
  }
}

export const k8sService = new K8sService();
