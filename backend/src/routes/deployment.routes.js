import express from 'express';
import { stateService } from '../services/state.service.js';
import { rolloutService } from '../services/rollout.service.js';
import { configService } from '../services/config.service.js';
import { eventService } from '../services/event.service.js';

const router = express.Router();

// Preset Healthy Release Deployment
router.post('/deploy/healthy', (req, res) => {
  if (stateService.isDeploying()) {
    return res.status(409).json({ error: 'A deployment is already in progress' });
  }

  let target = 'v2.0';
  if (stateService.activeVersion === 'v2.0') {
    target = 'v2.1';
  }

  rolloutService.triggerDeployment({
    targetVersion: target,
    shouldFail: false
  });

  return res.json({
    status: 'initiated',
    candidate: target,
    message: `Deployment pipeline initiated for healthy release ${target}`
  });
});

// Preset Faulty Release Deployment
router.post('/deploy/faulty', (req, res) => {
  if (stateService.isDeploying()) {
    return res.status(409).json({ error: 'A deployment is already in progress' });
  }

  const target = 'v3.0';

  rolloutService.triggerDeployment({
    targetVersion: target,
    shouldFail: true,
    failureReason: `Simulated probe failure: Error rate 18% exceeded 5% threshold on ${target}.`
  });

  return res.json({
    status: 'initiated',
    candidate: target,
    message: `Deployment pipeline initiated for faulty candidate ${target}`
  });
});

// Live Configuration Deployment from disk
router.post('/deploy/current-config', (req, res) => {
  if (stateService.isDeploying()) {
    return res.status(409).json({
      status: 'rejected',
      error: 'A deployment is already in progress',
      active_version: stateService.activeVersion
    });
  }

  eventService.addEvent(
    'Configuration File Read: backend/release_config.json loaded',
    'info',
    'Evaluating live release configuration from disk'
  );

  const { config, error } = configService.loadAndValidateConfig();

  if (error) {
    const currentActive = stateService.activeVersion;
    eventService.addEvent(
      `Configuration Validation Failed: ${error}`,
      'danger',
      'Deployment rejected safely. Active version preserved.'
    );

    return res.status(400).json({
      status: 'rejected',
      error,
      active_version: currentActive
    });
  }

  const target = config.version;
  const errorRate = config.error_rate;
  const threshold = config.threshold;
  const shouldFail = errorRate > threshold;

  eventService.addEvent(
    `Configuration Validated: ${target} (Error Rate: ${errorRate}%, Threshold: ${threshold}%)`,
    'info',
    `Release message: "${config.message}". Evaluating health check criteria.`
  );

  const failureReason = shouldFail
    ? `Simulated health probe failed: Configured error rate (${errorRate}%) exceeded allowed threshold (${threshold}%).`
    : null;

  rolloutService.triggerDeployment({
    targetVersion: target,
    shouldFail,
    failureReason,
    configMetadata: config
  });

  return res.status(200).json({
    status: 'initiated',
    candidate: target,
    error_rate: errorRate,
    threshold,
    evaluation: shouldFail ? 'FAIL (Will Roll Back)' : 'PASS (Will Promote)',
    message: `Deployment initiated for candidate ${target} from backend/release_config.json`
  });
});

// Operator State Reset
router.post('/reset', (req, res) => {
  if (stateService.isDeploying()) {
    return res.status(409).json({ error: 'Cannot reset while deployment is in progress' });
  }

  stateService.resetToBaseline();
  eventService.clear();
  eventService.addEvent(
    'Environment Reset: Restored baseline state (v1.0)',
    'info',
    'State machine reset to baseline v1.0. All prior audit events cleared.'
  );

  return res.json({
    status: 'reset',
    active_version: 'v1.0'
  });
});

export default router;
