import { stateService } from './state.service.js';
import { eventService } from './event.service.js';
import { logger } from '../utils/logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class RolloutService {
  constructor() {
    this.activeRolloutPromise = null;
    this.stepDelayMs = Number.parseInt(process.env.ROLLOUT_STEP_DELAY_MS || '2000', 10);
  }

  setStepDelay(ms) {
    this.stepDelayMs = ms;
  }

  async runDeploymentLifecycle({
    targetVersion,
    shouldFail,
    failureReason = null,
    configMetadata = null
  }) {
    const currentStable = stateService.activeVersion;

    // Step 1: Initialize Candidate & Route 10% Canary Traffic (90/10 split)
    stateService.startDeployment(targetVersion, { active: 90, candidate: 10 });
    const sourceLabel = configMetadata ? ' (via release_config.json)' : '';

    eventService.addEvent(
      `Pipeline Trigger: New deployment initiated for candidate ${targetVersion}${sourceLabel}`,
      'warning',
      `Routing 10% canary traffic to ${targetVersion}, 90% to ${currentStable} (configured split)`
    );
    logger.info('Deployment initiated', { targetVersion, currentStable, split: '90/10' });

    await sleep(this.stepDelayMs);

    // Step 2: Ramp Traffic to 50% & Run Health Probes (50/50 split)
    stateService.updateTrafficSplit({ active: 50, candidate: 50 });
    const probeDesc = configMetadata
      ? `Evaluating error rate ${configMetadata.error_rate}% against threshold ${configMetadata.threshold}% (simulated)`
      : 'Evaluating HTTP /health synthetic probes and error rate thresholds (simulated)';

    eventService.addEvent(
      `Canary Analysis: Executing simulated health probes on ${targetVersion}`,
      'info',
      probeDesc
    );
    logger.info('Canary analysis progressing', { targetVersion, split: '50/50' });

    await sleep(this.stepDelayMs);

    // Step 3: Evaluation Decision
    if (!shouldFail) {
      // HEALTHY PROMOTION PATH
      stateService.promoteCandidate(configMetadata);

      eventService.addEvent(
        `Release Promoted: Candidate ${targetVersion} passed all simulated health probes`,
        'success',
        `100% traffic routed to ${targetVersion}. Previous stable retained as ${currentStable}.`
      );
      logger.info('Release successfully promoted', { activeVersion: targetVersion, previousStable: currentStable });
    } else {
      // FAULTY PATH - Step A: Probe Failure & Circuit Breaker Trip
      stateService.setApplicationHealth('UNHEALTHY');
      const errMsg = failureReason || `Simulated probe failure: Error rate exceeded allowed threshold on ${targetVersion}.`;

      eventService.addEvent(
        `Simulated Probe Failed: Candidate ${targetVersion} returned HTTP 503`,
        'danger',
        errMsg
      );

      eventService.addEvent(
        `Circuit Breaker Tripped: Health check failed for ${targetVersion}`,
        'danger',
        'Automated rollback initiated immediately.'
      );
      logger.warn('Canary health check failed; circuit breaker tripped', { targetVersion, errMsg });

      // Allow dashboard & telemetry to record UNHEALTHY state
      await sleep(this.stepDelayMs + 200);

      // FAULTY PATH - Step B: Automatic Rollback restores previous stable version
      const rollbackReason = failureReason || `Simulated health probe failed on ${targetVersion}: HTTP 503 synthetic error threshold exceeded.`;
      stateService.executeRollback(targetVersion, currentStable, rollbackReason, configMetadata);

      eventService.addEvent(
        `AUTOMATIC ROLLBACK EXECUTED: Restored stable release ${currentStable}`,
        'danger',
        `Candidate ${targetVersion} removed. Traffic safely restored to ${currentStable}.`
      );
      logger.info('Rollback completed successfully', { failedVersion: targetVersion, restoredVersion: currentStable });
    }
  }

  triggerDeployment({ targetVersion, shouldFail, failureReason = null, configMetadata = null }) {
    if (stateService.isDeploying()) {
      return {
        success: false,
        status: 409,
        error: 'A deployment is already in progress'
      };
    }

    // Launch asynchronously in background without blocking caller response
    this.activeRolloutPromise = this.runDeploymentLifecycle({
      targetVersion,
      shouldFail,
      failureReason,
      configMetadata
    }).catch((err) => {
      logger.error('Unexpected rollout worker failure', { error: err.message, stack: err.stack });
      eventService.addEvent(
        `Rollout Worker Failure: ${err.message}`,
        'danger',
        'Rollout process encountered an internal error'
      );
    });

    return {
      success: true,
      status: 200
    };
  }
}

export const rolloutService = new RolloutService();
