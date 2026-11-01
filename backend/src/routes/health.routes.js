import express from 'express';
import { stateService } from '../services/state.service.js';
import { env } from '../config/environment.js';

const router = express.Router();

// Application health probe (Liveness Probe)
router.get('/health', (req, res) => {
  const isHealthy = stateService.applicationHealth === 'HEALTHY';
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: stateService.applicationHealth,
    active_version: stateService.activeVersion,
    timestamp: new Date().toISOString()
  });
});

// Application readiness probe (Readiness Probe)
router.get('/ready', (req, res) => {
  // Not ready if unhealthy or currently rolling back
  const isReady = stateService.applicationHealth === 'HEALTHY';
  const statusCode = isReady ? 200 : 503;

  res.status(statusCode).json({
    ready: isReady,
    status: isReady ? 'READY' : 'NOT_READY',
    active_version: stateService.activeVersion,
    timestamp: new Date().toISOString()
  });
});

// Service version endpoint
router.get('/version', (req, res) => {
  res.json({
    service: 'cloud05-capstone',
    active_version: stateService.activeVersion,
    candidate_version: stateService.candidateVersion,
    previous_stable_version: stateService.previousStableVersion,
    environment: env.NODE_ENV,
    execution_mode: env.EXECUTION_MODE,
    timestamp: new Date().toISOString()
  });
});

export default router;
