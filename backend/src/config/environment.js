import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_DIR = path.resolve(__dirname, '..', '..');
const FRONTEND_DIR = process.env.FRONTEND_PATH 
  ? path.resolve(BASE_DIR, process.env.FRONTEND_PATH)
  : path.resolve(BASE_DIR, '..', 'frontend');

const CONFIG_FILE = process.env.RELEASE_CONFIG_PATH
  ? path.resolve(BASE_DIR, process.env.RELEASE_CONFIG_PATH)
  : path.resolve(BASE_DIR, 'release_config.json');

export const env = {
  PORT: Number.parseInt(process.env.PORT || '5005', 10),
  HOST: process.env.HOST || '0.0.0.0',
  NODE_ENV: process.env.NODE_ENV || 'development',
  EXECUTION_MODE: process.env.EXECUTION_MODE || 'simulation',
  KUBERNETES_NAMESPACE: process.env.KUBERNETES_NAMESPACE || 'cloud05-app',
  ARGO_ROLLOUT_NAME: process.env.ARGO_ROLLOUT_NAME || 'cloud05-service',
  BASE_DIR,
  FRONTEND_DIR,
  CONFIG_FILE,
  PROMETHEUS_METRICS_ENABLED: process.env.PROMETHEUS_METRICS_ENABLED !== 'false'
};
