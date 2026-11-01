import client from 'prom-client';

// Create a dedicated Registry
export const register = new client.Registry();

// Add default system metrics (CPU, Memory, Event Loop Lag, etc.)
client.collectDefaultMetrics({
  register,
  prefix: 'cloud05_'
});

// Custom Progressive Delivery & Application Metrics
export const httpRequestsTotal = new client.Counter({
  name: 'cloud05_http_requests_total',
  help: 'Total number of HTTP requests processed by CLOUD-05',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const httpRequestDurationSeconds = new client.Histogram({
  name: 'cloud05_http_request_duration_seconds',
  help: 'Histogram of HTTP request latencies in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register]
});

export const rolloutTrafficPercent = new client.Gauge({
  name: 'cloud05_rollout_traffic_percent',
  help: 'Current traffic percentage routed to release',
  labelNames: ['version', 'role'], // role: 'active' | 'candidate'
  registers: [register]
});

export const rolloutRollbackTotal = new client.Counter({
  name: 'cloud05_rollout_rollback_total',
  help: 'Total number of automated rollbacks executed',
  labelNames: ['failed_version', 'restored_version', 'trigger_reason'],
  registers: [register]
});

export const serviceHealthStatus = new client.Gauge({
  name: 'cloud05_service_health_status',
  help: 'Current application health status (1 = HEALTHY, 0 = UNHEALTHY / DEGRADED)',
  labelNames: ['status'],
  registers: [register]
});

export const releaseConfigErrorRate = new client.Gauge({
  name: 'cloud05_release_config_error_rate',
  help: 'Configured error rate percentage from release_config.json',
  registers: [register]
});

export const releaseConfigThreshold = new client.Gauge({
  name: 'cloud05_release_config_threshold',
  help: 'Configured allowed error threshold percentage from release_config.json',
  registers: [register]
});

// Initialize default metric states
serviceHealthStatus.set({ status: 'HEALTHY' }, 1);
rolloutTrafficPercent.set({ version: 'v1.0', role: 'active' }, 100);
rolloutTrafficPercent.set({ version: 'NONE', role: 'candidate' }, 0);
releaseConfigErrorRate.set(0);
releaseConfigThreshold.set(5);

export const metricsService = {
  register,
  httpRequestsTotal,
  httpRequestDurationSeconds,
  rolloutTrafficPercent,
  rolloutRollbackTotal,
  serviceHealthStatus,
  releaseConfigErrorRate,
  releaseConfigThreshold,
  async getMetrics() {
    return register.metrics();
  },
  getContentType() {
    return register.contentType;
  }
};
