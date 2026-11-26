import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderApp } from '../src/server.js';

describe('Order Microservice API & Metric Integrity', () => {
  let server;
  let baseUrl;
  const prevFault = process.env.FAULT_MODE;
  const prevVer = process.env.RELEASE_VERSION;

  beforeEach(async () => {
    delete process.env.FAULT_MODE;
    process.env.RELEASE_VERSION = 'v1.0';
    const app = createOrderApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    process.env.FAULT_MODE = prevFault;
    process.env.RELEASE_VERSION = prevVer;
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /health and /products return 200', async () => {
    const h = await fetch(`${baseUrl}/health`);
    assert.equal(h.status, 200);
    const p = await fetch(`${baseUrl}/products`);
    assert.equal(p.status, 200);
    const body = await p.json();
    assert.equal(body.service, 'order-service');
  });

  it('POST /orders validates integer quantity', async () => {
    const bad = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'prod-001', quantity: 'abc' })
    });
    assert.equal(bad.status, 400);

    const ok = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: 'prod-001', quantity: 2 })
    });
    assert.equal(ok.status, 201);
  });

  it('GET /metrics does not fabricate 500s on repeated scrapes when FAULT_MODE=true', async () => {
    await new Promise((resolve) => server.close(resolve));
    process.env.FAULT_MODE = 'true';
    process.env.RELEASE_VERSION = 'v3.0';
    const faultApp = createOrderApp();
    await new Promise((resolve) => {
      server = faultApp.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    const m1 = await (await fetch(`${baseUrl}/metrics`)).text();
    const m2 = await (await fetch(`${baseUrl}/metrics`)).text();
    assert.equal(m1.includes('status_code="500"'), false);
    assert.equal(m2.includes('status_code="500"'), false);
  });
});
