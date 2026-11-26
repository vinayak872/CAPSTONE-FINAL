#!/usr/bin/env node
/**
 * CLOUD-05: Real HTTP Benchmark Runner (No Math.random() Fabrication)
 *
 * Sends genuine HTTP requests to a target service URL (local or port-forwarded Kubernetes Service),
 * measures real HTTP status codes, P50/P95/P99 latency percentiles, and timestamps,
 * and saves raw results to JSON + CSV without modifying published simulation artifacts.
 *
 * Usage:
 *   TARGET_URL=http://localhost:5005 EXPERIMENT_ID=EXP-01 DURATION_MS=10000 node experiments/run_k8s_benchmark.js
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:5005';
const TARGET_PATH = process.env.TARGET_PATH || '/api/demo/products';
const EXPERIMENT_ID = process.env.EXPERIMENT_ID || 'EXP-REAL-HTTP';
const DURATION_MS = Number.parseInt(process.env.DURATION_MS || '5000', 10);
const INTERVAL_MS = Number.parseInt(process.env.INTERVAL_MS || '50', 10);

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return Number.parseFloat(sorted[Math.max(0, Math.min(idx, sorted.length - 1))].toFixed(2));
}

async function main() {
  const startIso = new Date().toISOString();
  const startMs = Date.now();
  const latenciesMs = [];
  let totalRequests = 0;
  let successRequests = 0;
  let failed5xx = 0;
  let otherNon2xx = 0;
  let networkErrors = 0;
  let firstErrorAtMs = null;

  while (Date.now() - startMs < DURATION_MS) {
    const reqStart = performance.now();
    totalRequests += 1;
    try {
      const res = await fetch(`${TARGET_URL}${TARGET_PATH}`);
      const elapsed = performance.now() - reqStart;
      latenciesMs.push(elapsed);

      if (res.status >= 200 && res.status < 300) {
        successRequests += 1;
      } else if (res.status >= 500) {
        failed5xx += 1;
        if (firstErrorAtMs === null) firstErrorAtMs = Date.now() - startMs;
      } else {
        otherNon2xx += 1;
      }
      await res.arrayBuffer();
    } catch {
      const elapsed = performance.now() - reqStart;
      latenciesMs.push(elapsed);
      networkErrors += 1;
      if (firstErrorAtMs === null) firstErrorAtMs = Date.now() - startMs;
    }

    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  const endIso = new Date().toISOString();
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const failedTotal = failed5xx + networkErrors;
  const errorRatePercent = totalRequests > 0
    ? Number.parseFloat(((failedTotal / totalRequests) * 100).toFixed(2))
    : 0;

  const result = {
    experiment_id: EXPERIMENT_ID,
    target_url: `${TARGET_URL}${TARGET_PATH}`,
    started_at: startIso,
    completed_at: endIso,
    duration_ms: Date.now() - startMs,
    total_requests: totalRequests,
    successful_requests: successRequests,
    failed_5xx_requests: failed5xx,
    network_errors: networkErrors,
    other_non_2xx: otherNon2xx,
    error_rate_percent: errorRatePercent,
    latency_ms: {
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99)
    },
    first_error_observed_ms: firstErrorAtMs
  };

  const outDir = path.resolve(__dirname, '..', 'evidence', 'final_review');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'real_http_benchmark.json');
  const csvPath = path.join(outDir, 'real_http_benchmark.csv');

  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');
  const csvHeader = 'experiment_id,started_at,total_requests,successful_requests,failed_5xx_requests,network_errors,error_rate_percent,p50_ms,p95_ms,p99_ms,first_error_observed_ms\n';
  const csvRow = `${result.experiment_id},${result.started_at},${result.total_requests},${result.successful_requests},${result.failed_5xx_requests},${result.network_errors},${result.error_rate_percent},${result.latency_ms.p50},${result.latency_ms.p95},${result.latency_ms.p99},${result.first_error_observed_ms ?? ''}\n`;
  fs.writeFileSync(csvPath, csvHeader + csvRow, 'utf-8');

  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
