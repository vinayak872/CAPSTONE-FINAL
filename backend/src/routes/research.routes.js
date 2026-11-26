import express from 'express';
import fs from 'node:fs';
import { env } from '../config/environment.js';

const router = express.Router();

router.get('/research', (req, res) => {
  if (!fs.existsSync(env.RESEARCH_FILE)) {
    return res.status(404).json({
      available: false,
      error: 'Research raw data file not found'
    });
  }

  try {
    const raw = fs.readFileSync(env.RESEARCH_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return res.json({
      available: true,
      source: 'evidence/final_review/experiment_raw_data.json',
      ...parsed
    });
  } catch (err) {
    return res.status(500).json({
      available: false,
      error: `Failed to parse research data: ${err.message}`
    });
  }
});

export default router;
