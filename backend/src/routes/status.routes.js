import express from 'express';
import { stateService } from '../services/state.service.js';
import { eventService } from '../services/event.service.js';
import { k8sService } from '../services/k8s.service.js';

const router = express.Router();

let lastK8sCheck = 0;

router.get('/status', async (req, res) => {
  // Throttle cluster checks to at most once every 5 seconds to keep polling ultra-responsive
  if (Date.now() - lastK8sCheck > 5000) {
    lastK8sCheck = Date.now();
    try {
      await k8sService.checkConnectivity();
    } catch {
      // Non-blocking fallback
    }
  }

  const state = stateService.getState();
  const k8sStatus = k8sService.getStatus();

  res.json({
    ...state,
    cluster_connectivity: {
      kubernetes: k8sStatus.kubernetes_connected,
      argoRollouts: k8sStatus.argo_rollouts_connected,
      argoCd: k8sStatus.argocd_connected,
      prometheus: k8sStatus.prometheus_connected,
      cluster_info: k8sStatus.cluster_info,
      cluster_rollout: k8sStatus.cluster_rollout
    },
    events_count: eventService.getCount()
  });
});

export default router;
