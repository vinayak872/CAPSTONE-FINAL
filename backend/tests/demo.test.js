import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { stateService } from '../src/services/state.service.js';

describe('Demo Microservice Business Operations & Safe Failure Injection', () => {
  beforeEach(() => {
    stateService.resetToBaseline();
  });

  it('1. GET /api/demo/products returns sample application catalog', async () => {
    const res = await request(app).get('/api/demo/products');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('cloud05-demo-microservice');
    expect(Array.isArray(res.body.products)).toBe(true);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  it('2. POST /api/demo/orders processes valid order transaction', async () => {
    const res = await request(app)
      .post('/api/demo/orders')
      .send({ productId: 'prod-001', quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('CONFIRMED');
    expect(res.body.order_id).toBeDefined();
    expect(res.body.processed_by_version).toBe(stateService.activeVersion);
  });

  it('3. POST /api/demo/orders rejects invalid payload with HTTP 400', async () => {
    const res = await request(app)
      .post('/api/demo/orders')
      .send({ productId: '', quantity: -1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Validation Error');
  });

  it('4. POST /api/demo/failure-injection allows test mode failure controls in development', async () => {
    const res = await request(app)
      .post('/api/demo/failure-injection')
      .send({ injectedLatencyMs: 50, unhealthyReadiness: true });

    expect(res.status).toBe(200);
    expect(res.body.active_failure_modes.injectedLatencyMs).toBe(50);
    expect(res.body.current_health).toBe('UNHEALTHY');

    // Clean up
    await request(app)
      .post('/api/demo/failure-injection')
      .send({ injectedLatencyMs: 0, unhealthyReadiness: false });
  });
});
