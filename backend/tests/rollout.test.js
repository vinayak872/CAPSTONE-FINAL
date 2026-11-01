import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import { app } from '../src/app.js';
import { stateService } from '../src/services/state.service.js';
import { rolloutService } from '../src/services/rollout.service.js';
import { env } from '../src/config/environment.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDeployment(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await request(app).get('/api/status');
    if (res.body.deployment_status !== 'DEPLOYING') {
      return res.body;
    }
    await sleep(50);
  }
  throw new Error(`Deployment did not converge within ${timeoutMs}ms`);
}

describe('Progressive Delivery Rollout & Automatic Rollback Engine', () => {
  let originalConfigContent = '';

  beforeEach(() => {
    // Configure fast step delay for test suite execution
    rolloutService.setStepDelay(150);
    stateService.resetToBaseline();
    if (fs.existsSync(env.CONFIG_FILE)) {
      originalConfigContent = fs.readFileSync(env.CONFIG_FILE, 'utf-8');
    }
  });

  afterEach(() => {
    if (originalConfigContent) {
      fs.writeFileSync(env.CONFIG_FILE, originalConfigContent, 'utf-8');
    }
  });

  it('1. GET /api/status returns valid state model with all required keys', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);

    const requiredKeys = [
      'project_name',
      'active_version',
      'candidate_version',
      'deployment_status',
      'application_health',
      'traffic_split',
      'events_count'
    ];
    for (const key of requiredKeys) {
      expect(res.body[key]).toBeDefined();
    }
  });

  it('2. POST /api/reset restores clean baseline v1.0 state', async () => {
    const resetRes = await request(app).post('/api/reset');
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.status).toBe('reset');
    expect(resetRes.body.active_version).toBe('v1.0');

    const statusRes = await request(app).get('/api/status');
    expect(statusRes.body.active_version).toBe('v1.0');
    expect(statusRes.body.candidate_version).toBe('NONE');
    expect(statusRes.body.deployment_status).toBe('STABLE');
    expect(statusRes.body.application_health).toBe('HEALTHY');
  });

  it('3. Healthy Release Promotion: Candidate v2.0 promotes to active', async () => {
    const triggerRes = await request(app).post('/api/deploy/healthy');
    expect(triggerRes.status).toBe(200);
    expect(triggerRes.body.status).toBe('initiated');
    expect(triggerRes.body.candidate).toBe('v2.0');

    const finalState = await waitForDeployment();
    expect(finalState.active_version).toBe('v2.0');
    expect(finalState.candidate_version).toBe('NONE');
    expect(finalState.deployment_status).toBe('STABLE');
    expect(finalState.application_health).toBe('HEALTHY');
    expect(finalState.traffic_split.active).toBe(100);
    expect(finalState.traffic_split.candidate).toBe(0);
  });

  it('4. Concurrent deployment prevention: Rejects second deploy with HTTP 409', async () => {
    const res1 = await request(app).post('/api/deploy/healthy');
    expect(res1.status).toBe(200);

    // Immediate second trigger while deployment is in flight
    const res2 = await request(app).post('/api/deploy/healthy');
    expect(res2.status).toBe(409);
    expect(res2.body.error).toContain('already in progress');

    await waitForDeployment();
  });

  it('5. Faulty Release Rollback: Candidate v3.0 fails analysis and rolls back to stable', async () => {
    // Current stable is v1.0
    const triggerRes = await request(app).post('/api/deploy/faulty');
    expect(triggerRes.status).toBe(200);
    expect(triggerRes.body.status).toBe('initiated');

    const finalState = await waitForDeployment();
    expect(finalState.active_version).toBe('v1.0'); // Restored stable version
    expect(finalState.candidate_version).toBe('NONE');
    expect(finalState.deployment_status).toBe('ROLLED BACK');
    expect(finalState.application_health).toBe('HEALTHY'); // Restored to healthy
    expect(finalState.latest_rollback).toBeDefined();
    expect(finalState.latest_rollback.failed_version).toBe('v3.0');
    expect(finalState.latest_rollback.restored_version).toBe('v1.0');
  });

  it('6. Live Config Healthy Boundary: 5% error_rate <= 5% threshold promotes candidate', async () => {
    fs.writeFileSync(env.CONFIG_FILE, JSON.stringify({
      version: 'v4.1',
      message: 'Healthy boundary test',
      error_rate: 5,
      threshold: 5
    }));

    const res = await request(app).post('/api/deploy/current-config');
    expect(res.status).toBe(200);
    expect(res.body.evaluation).toContain('PASS');

    const finalState = await waitForDeployment();
    expect(finalState.active_version).toBe('v4.1');
    expect(finalState.deployment_status).toBe('STABLE');
  });

  it('7. Live Config Faulty Boundary: 6% error_rate > 5% threshold rolls back candidate', async () => {
    // Pre-condition: active version is v4.1 from previous test or set to v4.1
    stateService.activeVersion = 'v4.1';

    fs.writeFileSync(env.CONFIG_FILE, JSON.stringify({
      version: 'v4.2',
      message: 'Faulty boundary test',
      error_rate: 6,
      threshold: 5
    }));

    const res = await request(app).post('/api/deploy/current-config');
    expect(res.status).toBe(200);
    expect(res.body.evaluation).toContain('FAIL');

    const finalState = await waitForDeployment();
    expect(finalState.active_version).toBe('v4.1'); // Preserved/restored
    expect(finalState.deployment_status).toBe('ROLLED BACK');
    expect(finalState.latest_rollback.failed_version).toBe('v4.2');
    expect(finalState.latest_rollback.restored_version).toBe('v4.1');
  });

  it('8. Event Stream logs chronological activity with full metadata', async () => {
    const res = await request(app).get('/api/events');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(res.body.events.length).toBeGreaterThanOrEqual(1);

    const firstEvent = res.body.events[0];
    expect(firstEvent.id).toBeDefined();
    expect(firstEvent.timestamp).toBeDefined();
    expect(firstEvent.type).toBeDefined();
    expect(firstEvent.message).toBeDefined();
  });
});
