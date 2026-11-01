import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { stateService } from '../src/services/state.service.js';

describe('Health, Readiness, Version, and Telemetry Endpoints', () => {
  beforeEach(() => {
    stateService.resetToBaseline();
  });

  it('1. GET /health returns HTTP 200 and HEALTHY when application is normal', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('HEALTHY');
    expect(res.body.active_version).toBe('v1.0');
    expect(res.body.timestamp).toBeDefined();
  });

  it('2. GET /health returns HTTP 503 and UNHEALTHY when probe fails', async () => {
    stateService.setApplicationHealth('UNHEALTHY');
    const res = await request(app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('UNHEALTHY');
  });

  it('3. GET /ready returns HTTP 200 when ready to receive traffic', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.status).toBe('READY');
  });

  it('4. GET /ready returns HTTP 503 when application is unhealthy', async () => {
    stateService.setApplicationHealth('UNHEALTHY');
    const res = await request(app).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.status).toBe('NOT_READY');
  });

  it('5. GET /version returns service identifier and active version metadata', async () => {
    const res = await request(app).get('/version');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('cloud05-capstone');
    expect(res.body.active_version).toBe('v1.0');
    expect(res.body.candidate_version).toBe('NONE');
  });

  it('6. GET /metrics returns Prometheus formatted metric data', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('cloud05_http_requests_total');
    expect(res.text).toContain('cloud05_rollout_traffic_percent');
    expect(res.text).toContain('cloud05_service_health_status');
  });
});
