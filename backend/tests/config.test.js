import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../src/app.js';
import { stateService } from '../src/services/state.service.js';
import { env } from '../src/config/environment.js';

describe('Configuration Validation & Active Version Preservation', () => {
  let originalConfigContent = '';

  beforeEach(() => {
    stateService.resetToBaseline();
    if (fs.existsSync(env.CONFIG_FILE)) {
      originalConfigContent = fs.readFileSync(env.CONFIG_FILE, 'utf-8');
    }
  });

  afterEach(() => {
    // Restore original file
    if (originalConfigContent) {
      fs.writeFileSync(env.CONFIG_FILE, originalConfigContent, 'utf-8');
    }
  });

  it('1. GET /api/config returns valid configuration details when config is correct', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(res.body.file_path).toBe('backend/release_config.json');
    expect(res.body.is_valid).toBe(true);
    expect(res.body.config).toBeDefined();
    expect(res.body.config.version).toBeDefined();
  });

  it('2. POST /api/deploy/current-config rejects missing required field with HTTP 400', async () => {
    fs.writeFileSync(env.CONFIG_FILE, JSON.stringify({ version: 'v9.0', message: 'Missing fields' }));

    const res = await request(app).post('/api/deploy/current-config');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('rejected');
    expect(res.body.error).toContain("Missing required field");
    expect(res.body.active_version).toBe('v1.0');
    expect(stateService.activeVersion).toBe('v1.0');
  });

  it('3. POST /api/deploy/current-config rejects negative error_rate with HTTP 400', async () => {
    fs.writeFileSync(env.CONFIG_FILE, JSON.stringify({
      version: 'v9.0',
      message: 'Negative error rate',
      error_rate: -5,
      threshold: 5
    }));

    const res = await request(app).post('/api/deploy/current-config');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('rejected');
    expect(res.body.error).toContain('must be between 0 and 100');
    expect(stateService.activeVersion).toBe('v1.0');
  });

  it('4. POST /api/deploy/current-config rejects error_rate > 100 with HTTP 400', async () => {
    fs.writeFileSync(env.CONFIG_FILE, JSON.stringify({
      version: 'v9.0',
      message: 'Out of bounds',
      error_rate: 150,
      threshold: 5
    }));

    const res = await request(app).post('/api/deploy/current-config');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('rejected');
    expect(res.body.error).toContain('must be between 0 and 100');
    expect(stateService.activeVersion).toBe('v1.0');
  });

  it('5. POST /api/deploy/current-config rejects malformed JSON with HTTP 400', async () => {
    fs.writeFileSync(env.CONFIG_FILE, '{\n "version": "v9.0",\n malformed_json_here\n}\n');

    const res = await request(app).post('/api/deploy/current-config');
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('rejected');
    expect(res.body.error).toContain('Malformed JSON syntax');
    expect(stateService.activeVersion).toBe('v1.0');
  });

  it('6. Active release remains strictly preserved across multiple validation rejections', async () => {
    const initialActive = stateService.activeVersion;

    fs.writeFileSync(env.CONFIG_FILE, JSON.stringify({ version: '', message: 'empty', error_rate: 0, threshold: 5 }));
    const res = await request(app).post('/api/deploy/current-config');
    expect(res.status).toBe(400);

    const statusRes = await request(app).get('/api/status');
    expect(statusRes.body.active_version).toBe(initialActive);
    expect(statusRes.body.candidate_version).toBe('NONE');
    expect(statusRes.body.deployment_status).toBe('STABLE');
  });
});
