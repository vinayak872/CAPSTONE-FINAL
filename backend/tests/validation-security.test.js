import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { parseEnvironment } from '../src/config/environment.js';
import { createRateLimiter } from '../src/middleware/security.middleware.js';
import { stateService } from '../src/services/state.service.js';

describe('Backend Validation, Error Handling & Security Hardening (Stages 3 & 4)', () => {
  let prevToken;
  let prevReqAuth;

  beforeEach(() => {
    stateService.resetToBaseline();
    prevToken = process.env.ADMIN_API_TOKEN;
    prevReqAuth = process.env.REQUIRE_AUTH;
  });

  afterEach(() => {
    if (prevToken === undefined) delete process.env.ADMIN_API_TOKEN;
    else process.env.ADMIN_API_TOKEN = prevToken;
    if (prevReqAuth === undefined) delete process.env.REQUIRE_AUTH;
    else process.env.REQUIRE_AUTH = prevReqAuth;
  });

  it('1. parseEnvironment rejects invalid PORT values and unsupported EXECUTION_MODE', () => {
    expect(() => parseEnvironment({ PORT: 'notanumber' })).toThrow(/Invalid PORT/);
    expect(() => parseEnvironment({ PORT: '0' })).toThrow(/Invalid PORT/);
    expect(() => parseEnvironment({ PORT: '65536' })).toThrow(/Invalid PORT/);
    expect(() => parseEnvironment({ PORT: '5005abc' })).toThrow(/Invalid PORT/);
    expect(() => parseEnvironment({ PORT: '5005', EXECUTION_MODE: 'bogus' })).toThrow(/Invalid EXECUTION_MODE/);

    const valid = parseEnvironment({ PORT: '5010', EXECUTION_MODE: 'kubernetes' });
    expect(valid.PORT).toBe(5010);
    expect(valid.EXECUTION_MODE).toBe('kubernetes');
  });

  it('2. POST /api/demo/orders rejects 0, float, string, null, and missing productId with HTTP 400', async () => {
    const app = createApp();
    const invalidPayloads = [
      { productId: 'prod-001', quantity: 0 },
      { productId: 'prod-001', quantity: 1.5 },
      { productId: 'prod-001', quantity: '2' },
      { productId: 'prod-001', quantity: null },
      { productId: '   ', quantity: 2 }
    ];

    for (const payload of invalidPayloads) {
      const res = await request(app).post('/api/demo/orders').send(payload);
      expect(res.status).toBe(400);
    }
  });

  it('3. Malformed JSON returns structured HTTP 400 JSON error and >100kb payload returns 413', async () => {
    const app = createApp();
    const malformed = await request(app)
      .post('/api/demo/orders')
      .set('Content-Type', 'application/json')
      .send('{"bad":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.status).toBe('error');

    const huge = await request(app)
      .post('/api/demo/orders')
      .send({ productId: 'prod-001', quantity: 1, pad: 'x'.repeat(120 * 1024) });
    expect(huge.status).toBe(413);
  });

  it('4. Authentication protects sensitive endpoints when ADMIN_API_TOKEN or REQUIRE_AUTH is set', async () => {
    process.env.ADMIN_API_TOKEN = 'test-audit-token';
    const app = createApp();

    const missing = await request(app).post('/api/reset');
    expect(missing.status).toBe(401);

    const wrong = await request(app)
      .post('/api/reset')
      .set('Authorization', 'Bearer wrong-token');
    expect(wrong.status).toBe(403);

    const allowed = await request(app)
      .post('/api/reset')
      .set('Authorization', 'Bearer test-audit-token');
    expect(allowed.status).toBe(200);

    delete process.env.ADMIN_API_TOKEN;
    process.env.REQUIRE_AUTH = 'true';
    const unconfigured = await request(app).post('/api/reset');
    expect(unconfigured.status).toBe(503);
  });

  it('5. Rate limiter blocks excessive requests to sensitive endpoints with HTTP 429', async () => {
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 2 });
    const app = createApp({ rateLimiter: limiter });

    const r1 = await request(app).post('/api/reset');
    const r2 = await request(app).post('/api/reset');
    const r3 = await request(app).post('/api/reset');

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(429);
    expect(r3.headers['retry-after']).toBeDefined();
  });

  it('6. GET /api/research returns traceable benchmark data from experiment_raw_data.json', async () => {
    const app = createApp();
    const res = await request(app).get('/api/research');
    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.progressive_aggregates.blast_radius_reduction_percent).toBe(65.5);
  });
});
