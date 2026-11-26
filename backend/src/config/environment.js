import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '..', '..');
const VALID_EXECUTION_MODES = new Set(['simulation', 'kubernetes']);

export function parseEnvironment(rawEnv = process.env) {
  const portRaw = rawEnv.PORT ?? '5005';
  if (!/^\d+$/.test(String(portRaw).trim())) {
    throw new Error(`Invalid PORT environment variable: "${portRaw}". Must be an integer between 1 and 65535.`);
  }
  const parsedPort = Number.parseInt(String(portRaw).trim(), 10);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(`Invalid PORT environment variable: "${portRaw}". Must be an integer between 1 and 65535.`);
  }

  const executionMode = rawEnv.EXECUTION_MODE || 'simulation';
  if (!VALID_EXECUTION_MODES.has(executionMode)) {
    throw new Error(`Invalid EXECUTION_MODE "${executionMode}". Must be one of: simulation, kubernetes.`);
  }

  const rateLimitMaxRaw = rawEnv.RATE_LIMIT_MAX ?? '60';
  const rateLimitMax = Number.parseInt(String(rateLimitMaxRaw), 10);
  if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1) {
    throw new Error(`Invalid RATE_LIMIT_MAX "${rateLimitMaxRaw}". Must be a positive integer.`);
  }

  const nodeEnv = rawEnv.NODE_ENV || 'development';
  const frontendDir = rawEnv.FRONTEND_PATH
    ? path.resolve(BASE_DIR, rawEnv.FRONTEND_PATH)
    : path.resolve(BASE_DIR, '..', 'frontend');

  const configFile = rawEnv.RELEASE_CONFIG_PATH
    ? path.resolve(BASE_DIR, rawEnv.RELEASE_CONFIG_PATH)
    : path.resolve(BASE_DIR, 'release_config.json');

  const researchFile = rawEnv.RESEARCH_DATA_PATH
    ? path.resolve(BASE_DIR, rawEnv.RESEARCH_DATA_PATH)
    : path.resolve(BASE_DIR, '..', 'evidence', 'final_review', 'experiment_raw_data.json');

  const allowedOrigins = (rawEnv.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return {
    PORT: parsedPort,
    HOST: rawEnv.HOST || '0.0.0.0',
    NODE_ENV: nodeEnv,
    EXECUTION_MODE: executionMode,
    RELEASE_VERSION: rawEnv.RELEASE_VERSION || 'v1.0',
    KUBERNETES_NAMESPACE: rawEnv.KUBERNETES_NAMESPACE || 'cloud05-app',
    ARGO_ROLLOUT_NAME: rawEnv.ARGO_ROLLOUT_NAME || 'cloud05-service',
    BASE_DIR,
    FRONTEND_DIR: frontendDir,
    CONFIG_FILE: configFile,
    RESEARCH_FILE: researchFile,
    ALLOWED_ORIGINS: allowedOrigins,
    ADMIN_API_TOKEN: rawEnv.ADMIN_API_TOKEN || '',
    REQUIRE_AUTH: rawEnv.REQUIRE_AUTH === 'true',
    RATE_LIMIT_MAX: rateLimitMax,
    RATE_LIMIT_WINDOW_MS: Number.parseInt(rawEnv.RATE_LIMIT_WINDOW_MS || '60000', 10),
    PROMETHEUS_METRICS_ENABLED: rawEnv.PROMETHEUS_METRICS_ENABLED !== 'false'
  };
}

export const env = parseEnvironment(process.env);
