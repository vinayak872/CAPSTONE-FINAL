import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from '../config/environment.js';

const execAsync = promisify(exec);

class K8sService {
  constructor() {
    this.status = {
      kubernetesConnected: false,
      argoRolloutsInstalled: false,
      clusterInfo: null,
      lastChecked: null
    };
  }

  async checkConnectivity() {
    try {
      const { stdout } = await execAsync('kubectl cluster-info --request-timeout=2s', { timeout: 3000 });
      this.status.kubernetesConnected = true;
      this.status.clusterInfo = stdout.split('\n')[0] || 'Connected';
    } catch {
      this.status.kubernetesConnected = false;
      this.status.clusterInfo = 'Cluster unreachable or Docker daemon not running';
    }

    try {
      await execAsync('kubectl get crd rollouts.argoproj.io --request-timeout=2s', { timeout: 3000 });
      this.status.argoRolloutsInstalled = true;
    } catch {
      this.status.argoRolloutsInstalled = false;
    }

    this.status.lastChecked = new Date().toISOString();
    return this.getStatus();
  }

  getStatus() {
    return {
      execution_mode: env.EXECUTION_MODE,
      kubernetes_connected: this.status.kubernetesConnected,
      argo_rollouts_connected: this.status.argoRolloutsInstalled,
      cluster_info: this.status.clusterInfo,
      namespace: env.KUBERNETES_NAMESPACE,
      rollout_name: env.ARGO_ROLLOUT_NAME,
      last_checked: this.status.lastChecked
    };
  }
}

export const k8sService = new K8sService();
