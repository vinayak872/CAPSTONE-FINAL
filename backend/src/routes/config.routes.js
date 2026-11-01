import express from 'express';
import { configService } from '../services/config.service.js';
import { stateService } from '../services/state.service.js';

const router = express.Router();

router.get('/config', (req, res) => {
  const { config, error } = configService.loadAndValidateConfig();
  const state = stateService.getState();

  res.json({
    file_path: 'backend/release_config.json',
    config,
    is_valid: error === null,
    validation_error: error,
    last_deployment: state.last_config_deployment
  });
});

export default router;
