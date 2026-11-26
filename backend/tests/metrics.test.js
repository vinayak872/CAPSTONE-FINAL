import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { stateService } from '../src/services/state.service.js';

function extractMetricValue(metricsText, metricName, labelFragment) {
  const lines = metricsText.split('\n');
  for (const line of lines) {
    if (line.startsWith('#')) continue;
    if (line.startsWith(metricName) && line.includes(labelFragment)) {
      const parts = line.trim().split(/\s+/);
      return Number.parseFloat(parts[parts.length - 1]);
    }
  }
  return 0;
}

describe('Prometheus Metric Integrity (Stage 1)', () => {
  const prevFault = process.env.FAULT_MODE;
  const prevVersion = process.env.RELEASE_VERSION;

  beforeEach(() => {
    stateService.resetToBaseline();
  });

  afterEach(async () => {
    process.env.FAULT_MODE = prevFault;
    process.env.RELEASE_VERSION = prevVersion;
    await request(app)
      .post('/api/demo/failure-injection')
      .send({ elevatedErrorRate: false, injectedLatencyMs: 0, unhealthyReadiness: false });
  });

  it('1. Repeated GET /metrics scrapes do NOT fabricate 500 error counters even when FAULT_MODE=true', async () => {
    process.env.FAULT_MODE = 'true';
    process.env.RELEASE_VERSION = 'v3.0';

    const m1 = await request(app).get('/metrics');
    expect(m1.status).toBe(200);
    const errBefore = extractMetricValue(m1.text, 'cloud05_http_requests_total', 'status_code="500"');

    await request(app).get('/metrics');
    await request(app).get('/metrics');
    const m4 = await request(app).get('/metrics');
    const errAfter = extractMetricValue(m4.text, 'cloud05_http_requests_total', 'status_code="500"');

    expect(errAfter).toBe(errBefore);
  });

  it('2. Actual HTTP 200 and HTTP 503 requests increment their exact status_code counters', async () => {
    const before = await request(app).get('/metrics');
    const okBefore = extractMetricValue(before.text, 'cloud05_http_requests_total', 'route="/health",status_code="200"');
    const err503Before = extractMetricValue(before.text, 'cloud05_http_requests_total', 'route="/health",status_code="503"');

    const okRes = await request(app).get('/health');
    expect(okRes.status).toBe(200);

    stateService.setApplicationHealth('UNHEALTHY');
    const failRes = await request(app).get('/health');
    expect(failRes.status).toBe(503);

    const after = await request(app).get('/metrics');
    const okAfter = extractMetricValue(after.text, 'cloud05_http_requests_total', 'route="/health",status_code="200"');
    const err503After = extractMetricValue(after.text, 'cloud05_http_requests_total', 'route="/health",status_code="503"');

    expect(okAfter).toBe(okBefore + 1);
    expect(err503After).toBe(err503Before + 1);
  });

  it('3. Actual HTTP 500 failure from demo endpoint increments status_code="500" counter', async () => {
    const before = await request(app).get('/metrics');
    const err500Before = extractMetricValue(before.text, 'cloud05_http_requests_total', 'status_code="500"');

    await request(app)
      .post('/api/demo/failure-injection')
      .send({ elevatedErrorRate: true });

    let observed500 = 0;
    for (let i = 0; i < 20; i++) {
      const r = await request(app).get('/api/demo/products');
      if (r.status === 500) observed500 += 1;
    }

    const after = await request(app).get('/metrics');
    const err500After = extractMetricValue(after.text, 'cloud05_http_requests_total', 'status_code="500"');

    expect(observed500).toBeGreaterThan(0);
    expect(err500After).toBe(err500Before + observed500);
  });
});
