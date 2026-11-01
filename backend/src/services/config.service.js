import fs from 'node:fs';
import { env } from '../config/environment.js';
import { metricsService } from './metrics.service.js';

function formatNum(val) {
  if (typeof val === 'number') {
    return Number.isInteger(val) ? val : Number.parseFloat(val.toFixed(2));
  }
  return val;
}

export class ConfigService {
  constructor(configFilePath = env.CONFIG_FILE) {
    this.configFilePath = configFilePath;
  }

  loadAndValidateConfig() {
    if (!fs.existsSync(this.configFilePath)) {
      return {
        config: null,
        error: `Configuration file ${this.configFilePath} not found on disk.`
      };
    }

    let rawText;
    let configData;
    try {
      rawText = fs.readFileSync(this.configFilePath, 'utf-8');
      configData = JSON.parse(rawText);
    } catch (err) {
      return {
        config: null,
        error: `Malformed JSON syntax in release_config.json: ${err.message}`
      };
    }

    if (!configData || typeof configData !== 'object' || Array.isArray(configData)) {
      return {
        config: null,
        error: 'Configuration root must be a JSON object.'
      };
    }

    const requiredFields = ['version', 'message', 'error_rate', 'threshold'];
    for (const field of requiredFields) {
      if (!(field in configData)) {
        return {
          config: null,
          error: `Missing required field: '${field}'.`
        };
      }
    }

    const { version, message, error_rate: errorRate, threshold } = configData;

    if (typeof version !== 'string' || !version.trim()) {
      return {
        config: null,
        error: "Field 'version' must be a non-empty string."
      };
    }

    if (typeof message !== 'string' || !message.trim()) {
      return {
        config: null,
        error: "Field 'message' must be a non-empty string."
      };
    }

    if (typeof errorRate !== 'number' || typeof errorRate === 'boolean' || Number.isNaN(errorRate)) {
      return {
        config: null,
        error: "Field 'error_rate' must be a numeric value."
      };
    }

    if (errorRate < 0 || errorRate > 100) {
      return {
        config: null,
        error: `Field 'error_rate' (${errorRate}) must be between 0 and 100.`
      };
    }

    if (typeof threshold !== 'number' || typeof threshold === 'boolean' || Number.isNaN(threshold)) {
      return {
        config: null,
        error: "Field 'threshold' must be a numeric value."
      };
    }

    if (threshold < 0 || threshold > 100) {
      return {
        config: null,
        error: `Field 'threshold' (${threshold}) must be between 0 and 100.`
      };
    }

    const validatedConfig = {
      version: version.trim(),
      message: message.trim(),
      error_rate: formatNum(errorRate),
      threshold: formatNum(threshold)
    };

    // Update Prometheus gauges
    metricsService.releaseConfigErrorRate.set(validatedConfig.error_rate);
    metricsService.releaseConfigThreshold.set(validatedConfig.threshold);

    return {
      config: validatedConfig,
      error: null
    };
  }

  writeConfig(newConfig) {
    fs.writeFileSync(this.configFilePath, JSON.stringify(newConfig, null, 2), 'utf-8');
  }
}

export const configService = new ConfigService();
