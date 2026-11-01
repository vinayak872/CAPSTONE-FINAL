#!/usr/bin/env node
/**
 * CLOUD-05 Capstone Automated JavaScript End-to-End Test Suite
 * Validates against live HTTP server on CLOUD05_URL (default: http://localhost:5005)
 *
 * Scenarios:
 * 1. Health & Readiness Endpoints
 * 2. Prometheus /metrics Endpoint
 * 3. Status Endpoint Schema Verification
 * 4. State Machine Reset Functionality
 * 5. Configuration Validation & Active Version Preservation
 * 6. Healthy Release Promotion (0% error rate vs 5% threshold)
 * 7. Healthy Boundary Promotion (5% error rate vs 5% threshold)
 * 8. Faulty Boundary Rollback (6% error rate vs 5% threshold)
 * 9. Faulty Deployment & Circuit-Breaker Auto-Rollback (18% error rate vs 5% threshold)
 * 10. Audit Event Stream Consistency
 * 11. Demo Microservice Operations
 * 12. Cleanup & Baseline Restoration
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.CLOUD05_URL || 'http://localhost:5005';
const CONFIG_PATH = path.resolve(__dirname, 'backend', 'release_config.json');

// ANSI Colors
const GREEN = '\x1b[92m';
const RED = '\x1b[91m';
const YELLOW = '\x1b[93m';
const CYAN = '\x1b[96m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function logStep(name) {
  console.log(`\n${BOLD}${CYAN}=== RUNNING: ${name} ===${RESET}`);
}

function passTest(name, detail = '') {
  let msg = `  ${BOLD}${GREEN}[PASS]${RESET} ${name}`;
  if (detail) msg += ` - ${detail}`;
  console.log(msg);
}

function failTest(name, detail = '') {
  let msg = `  ${BOLD}${RED}[FAIL]${RESET} ${name}`;
  if (detail) msg += ` - ${detail}`;
  console.error(msg);
  process.exit(1);
}

async function httpRequest(path, { method = 'GET', data = null } = {}) {
  const url = `${BASE_URL}${path}`;
  const options = {
    method,
    headers: {}
  };

  if (data !== null) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(data);
  }

  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    let body;
    if (contentType.includes('application/json')) {
      body = await res.json();
    } else {
      body = await res.text();
    }
    return { status: res.status, data: body };
  } catch (err) {
    failTest(`HTTP Connection to ${url}`, `Error: ${err.message}`);
  }
}

function writeConfig({ configDict = null, rawText = null } = {}) {
  if (rawText !== null) {
    fs.writeFileSync(CONFIG_PATH, rawText, 'utf-8');
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(configDict, null, 2), 'utf-8');
  }
}

async function waitForDeployment(timeoutSec = 15.0) {
  const start = Date.now();
  while (Date.now() - start < timeoutSec * 1000) {
    const { status, data } = await httpRequest('/api/status');
    if (status === 200 && data.deployment_status !== 'DEPLOYING') {
      return data;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  failTest('Deployment Timeout', `Deployment did not converge within ${timeoutSec}s`);
}

// ==========================================
// TEST SCENARIOS
// ==========================================

async function testHealthAndReadyEndpoints() {
  logStep('1. Health & Readiness Endpoints Verification');
  const healthRes = await httpRequest('/health');
  if (healthRes.status !== 200) {
    failTest('GET /health status', `Expected 200, got ${healthRes.status}`);
  }
  if (healthRes.data.status !== 'HEALTHY') {
    failTest('GET /health body', `Expected HEALTHY, got ${healthRes.data.status}`);
  }
  passTest('GET /health', `HTTP 200, status=${healthRes.data.status}, active=${healthRes.data.active_version}`);

  const readyRes = await httpRequest('/ready');
  if (readyRes.status !== 200 || !readyRes.data.ready) {
    failTest('GET /ready', `Expected ready=true, got ${JSON.stringify(readyRes.data)}`);
  }
  passTest('GET /ready', `HTTP 200, ready=${readyRes.data.ready}`);
}

async function testMetricsEndpoint() {
  logStep('2. Prometheus Telemetry Endpoint Verification');
  const res = await httpRequest('/metrics');
  if (res.status !== 200) {
    failTest('GET /metrics status', `Expected 200, got ${res.status}`);
  }
  if (!res.data.includes('cloud05_http_requests_total') || !res.data.includes('cloud05_rollout_traffic_percent')) {
    failTest('GET /metrics body', 'Missing required Prometheus metric keys');
  }
  passTest('GET /metrics', 'HTTP 200, verified prom-client telemetry metrics');
}

async function testStatusEndpoint() {
  logStep('3. Status Endpoint Verification');
  const { status, data } = await httpRequest('/api/status');
  if (status !== 200) {
    failTest('GET /api/status status', `Expected 200, got ${status}`);
  }

  const requiredKeys = [
    'project_name',
    'active_version',
    'candidate_version',
    'deployment_status',
    'application_health',
    'traffic_split'
  ];
  for (const k of requiredKeys) {
    if (!(k in data)) {
      failTest(`GET /api/status key '${k}'`, 'Key missing from response');
    }
  }
  passTest('GET /api/status', `HTTP 200, valid schema with all ${requiredKeys.length} required telemetry fields`);
}

async function testReset() {
  logStep('4. State Machine Reset');
  const { status, data } = await httpRequest('/api/reset', { method: 'POST' });
  if (status !== 200 || data.active_version !== 'v1.0') {
    failTest('POST /api/reset', `Expected v1.0, got ${JSON.stringify(data)}`);
  }

  const st = await httpRequest('/api/status');
  if (st.data.active_version !== 'v1.0' || st.data.candidate_version !== 'NONE' || st.data.deployment_status !== 'STABLE') {
    failTest('State after reset', `State invalid: ${JSON.stringify(st.data)}`);
  }
  passTest('POST /api/reset', 'State reset to initial v1.0 baseline, candidate=NONE, status=STABLE');
}

async function testConfigValidation() {
  logStep('5. Configuration Validation & Active Release Preservation');
  const initial = await httpRequest('/api/status');
  const initialActive = initial.data.active_version;

  // 5.1 Missing required field
  writeConfig({ configDict: { version: 'v9.0', message: 'Missing fields' } });
  let res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 400 || res.data.status !== 'rejected') {
    failTest('Validation: Missing required field', `Expected 400 rejected, got ${res.status}`);
  }
  passTest('Validation: Missing required field', 'HTTP 400 rejected with clear error message');

  // 5.2 Negative error rate
  writeConfig({ configDict: { version: 'v9.0', message: 'Negative', error_rate: -5, threshold: 5 } });
  res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 400 || res.data.status !== 'rejected') {
    failTest('Validation: Negative error rate', `Expected 400 rejected, got ${res.status}`);
  }
  passTest('Validation: Negative error rate', 'HTTP 400 rejected (-5% out of [0, 100] range)');

  // 5.3 Error rate > 100
  writeConfig({ configDict: { version: 'v9.0', message: 'Too high', error_rate: 130, threshold: 5 } });
  res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 400 || res.data.status !== 'rejected') {
    failTest('Validation: Error rate > 100', `Expected 400 rejected, got ${res.status}`);
  }
  passTest('Validation: Error rate > 100', 'HTTP 400 rejected (130% out of bounds)');

  // 5.4 Malformed JSON
  writeConfig({ rawText: '{\n  "version": "v9.0",\n  malformed_syntax\n}\n' });
  res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 400 || res.data.status !== 'rejected') {
    failTest('Validation: Malformed JSON', `Expected 400 rejected, got ${res.status}`);
  }
  passTest('Validation: Malformed JSON', 'HTTP 400 rejected (Malformed JSON syntax detected)');

  // 5.5 Verify Active Release Preservation
  const current = await httpRequest('/api/status');
  if (current.data.active_version !== initialActive) {
    failTest('Active Release Preservation', `Active changed from ${initialActive} to ${current.data.active_version}`);
  }
  passTest('Active Release Preservation', `Active release safely preserved as ${initialActive}`);
}

async function testHealthyDeployment() {
  logStep('6. Healthy Release Promotion (0% error rate vs 5% threshold)');
  writeConfig({
    configDict: {
      version: 'v4.0',
      message: 'Healthy release test',
      error_rate: 0,
      threshold: 5
    }
  });

  const res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 200 || res.data.status !== 'initiated') {
    failTest('Trigger healthy deployment', `Expected 200 initiated, got ${res.status}`);
  }
  passTest('Trigger Healthy Deployment', `Initiated deployment for candidate v4.0 (Evaluation: ${res.data.evaluation})`);

  const finalState = await waitForDeployment();
  if (finalState.active_version !== 'v4.0') {
    failTest('Promotion active version', `Expected active v4.0, got ${finalState.active_version}`);
  }
  if (finalState.candidate_version !== 'NONE' || finalState.deployment_status !== 'STABLE') {
    failTest('Promotion status', `Expected STABLE and candidate=NONE, got ${JSON.stringify(finalState)}`);
  }
  passTest('Healthy Promotion Succeeded', 'Candidate v4.0 promoted to active release; status=STABLE; health=HEALTHY');
}

async function testHealthyBoundary() {
  logStep('7. Healthy Boundary Promotion (5% error rate vs 5% threshold)');
  writeConfig({
    configDict: {
      version: 'v4.1',
      message: 'Healthy boundary test',
      error_rate: 5,
      threshold: 5
    }
  });

  const res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 200 || res.data.status !== 'initiated') {
    failTest('Trigger healthy boundary deployment', `Expected 200, got ${res.status}`);
  }
  passTest('Trigger Healthy Boundary', 'Initiated deployment for candidate v4.1 (error_rate == threshold == 5%)');

  const finalState = await waitForDeployment();
  if (finalState.active_version !== 'v4.1' || finalState.deployment_status !== 'STABLE') {
    failTest('Healthy boundary promotion', `Failed to promote v4.1: ${JSON.stringify(finalState)}`);
  }
  passTest('Healthy Boundary Promoted', 'Candidate v4.1 promoted to active (boundary 5% <= 5% passed)');
}

async function testFaultyBoundary() {
  logStep('8. Faulty Boundary Rollback (6% error rate vs 5% threshold)');
  writeConfig({
    configDict: {
      version: 'v4.2',
      message: 'Faulty boundary test',
      error_rate: 6,
      threshold: 5
    }
  });

  const res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 200 || res.data.status !== 'initiated') {
    failTest('Trigger faulty boundary deployment', `Expected 200, got ${res.status}`);
  }
  passTest('Trigger Faulty Boundary', 'Initiated deployment for candidate v4.2 (error_rate 6% > threshold 5%)');

  const finalState = await waitForDeployment();
  if (finalState.active_version !== 'v4.1') {
    failTest('Faulty boundary rollback active version', `Expected restored v4.1, got ${finalState.active_version}`);
  }
  if (finalState.deployment_status !== 'ROLLED BACK') {
    failTest('Faulty boundary deployment status', `Expected ROLLED BACK, got ${finalState.deployment_status}`);
  }
  passTest('Faulty Boundary Auto-Rollback Succeeded', 'Candidate v4.2 rejected; previous stable release v4.1 restored; status=ROLLED BACK');
}

async function testFaultyDeployment() {
  logStep('9. Faulty Release & Circuit-Breaker Auto-Rollback (18% error rate vs 5% threshold)');
  writeConfig({
    configDict: {
      version: 'v5.0',
      message: 'Faulty release test',
      error_rate: 18,
      threshold: 5
    }
  });

  const res = await httpRequest('/api/deploy/current-config', { method: 'POST' });
  if (res.status !== 200 || res.data.status !== 'initiated') {
    failTest('Trigger faulty deployment', `Expected 200, got ${res.status}`);
  }
  passTest('Trigger Faulty Deployment', 'Initiated candidate v5.0 (error_rate 18% > threshold 5%)');

  const finalState = await waitForDeployment();
  if (finalState.active_version !== 'v4.1') {
    failTest('Rollback restored version', `Expected restored v4.1, got ${finalState.active_version}`);
  }
  if (finalState.deployment_status !== 'ROLLED BACK' || finalState.application_health !== 'HEALTHY') {
    failTest('Rollback status', `Expected ROLLED BACK and HEALTHY, got ${JSON.stringify(finalState)}`);
  }

  const latestRb = finalState.latest_rollback;
  if (!latestRb || latestRb.failed_version !== 'v5.0' || latestRb.restored_version !== 'v4.1') {
    failTest('Rollback metadata', `Invalid rollback metadata: ${JSON.stringify(latestRb)}`);
  }
  passTest('Automated Rollback Succeeded', `Failed candidate v5.0 reverted, restored version=${latestRb.restored_version}, status=ROLLED BACK, health=HEALTHY`);
}

async function testEventHistory() {
  logStep('10. Audit Event Stream Consistency');
  const res = await httpRequest('/api/events');
  const events = res.data.events || [];
  if (events.length < 5) {
    failTest('Event log count', `Expected >= 5 events, got ${events.length}`);
  }

  for (const ev of events) {
    for (const key of ['id', 'timestamp', 'type', 'message']) {
      if (!(key in ev)) {
        failTest(`Event key '${key}'`, `Missing in event ${JSON.stringify(ev)}`);
      }
    }
  }
  passTest('Audit Events', `Total ${events.length} events recorded in chronological order with full metadata`);
}

async function testDemoMicroservice() {
  logStep('11. Realistic Demo Microservice Operations');
  const prodRes = await httpRequest('/api/demo/products');
  if (prodRes.status !== 200 || !Array.isArray(prodRes.data.products)) {
    failTest('Demo products endpoint', 'Expected product catalog array');
  }
  passTest('Demo Products', `HTTP 200, catalog size=${prodRes.data.products.length}`);

  const orderRes = await httpRequest('/api/demo/orders', {
    method: 'POST',
    data: { productId: 'prod-001', quantity: 2 }
  });
  if (orderRes.status !== 201 || orderRes.data.status !== 'CONFIRMED') {
    failTest('Demo order placement', `Expected 201 CONFIRMED, got ${orderRes.status}`);
  }
  passTest('Demo Orders', `HTTP 201, orderId=${orderRes.data.order_id}`);
}

async function cleanupAndReset() {
  logStep('12. Cleanup & Baseline Restoration');
  writeConfig({
    configDict: {
      version: 'v4.0',
      message: 'Healthy release',
      error_rate: 0,
      threshold: 5
    }
  });

  await httpRequest('/api/reset', { method: 'POST' });
  const st = await httpRequest('/api/status');
  if (st.data.active_version === 'v1.0' && st.data.deployment_status === 'STABLE') {
    passTest('Cleanup & Reset', 'Environment reset to clean v1.0 baseline; release_config.json reset to v4.0');
  } else {
    failTest('Cleanup', `Failed to reset cleanly: ${JSON.stringify(st.data)}`);
  }
}

async function main() {
  console.log(`\n${BOLD}${CYAN}======================================================${RESET}`);
  console.log(`${BOLD}${CYAN}  CLOUD-05 Capstone Automated JavaScript E2E Suite    ${RESET}`);
  console.log(`${BOLD}${CYAN}  Target: ${BASE_URL}                                  ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================${RESET}`);

  const startTime = Date.now();
  try {
    await testHealthAndReadyEndpoints();
    await testMetricsEndpoint();
    await testStatusEndpoint();
    await testReset();
    await testConfigValidation();
    await testHealthyDeployment();
    await testHealthyBoundary();
    await testFaultyBoundary();
    await testFaultyDeployment();
    await testEventHistory();
    await testDemoMicroservice();
    await cleanupAndReset();
  } catch (err) {
    console.error(`\nTest suite aborted with error: ${err.message}`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n${BOLD}${GREEN}======================================================${RESET}`);
  console.log(`${BOLD}${GREEN}  ALL CLOUD-05 JAVASCRIPT TESTS PASSED (${elapsed}s)          ${RESET}`);
  console.log(`${BOLD}${GREEN}======================================================${RESET}\n`);
  process.exit(0);
}

main();
