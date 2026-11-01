import express from 'express';
import { stateService } from '../services/state.service.js';
import { eventService } from '../services/event.service.js';
import { k8sService } from '../services/k8s.service.js';

const router = express.Router();

router.get('/status', (req, res) => {
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
      cluster_rollout: k8sStatus.cluster_rollout,
      order_service_rollout: k8sStatus.order_service_rollout,
      argocd_app: k8sStatus.argocd_app,
      latest_analysis_run: k8sStatus.latest_analysis_run
    },
    events_count: eventService.getCount()
  });
});

router.post('/k8s/sync', async (req, res) => {
  const result = await k8sService.triggerArgoCdSync();
  res.json(result);
});

export default router;
