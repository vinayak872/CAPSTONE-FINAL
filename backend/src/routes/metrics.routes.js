import express from 'express';
import { metricsService } from '../services/metrics.service.js';

const router = express.Router();

router.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsService.getContentType());
    res.end(await metricsService.getMetrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

export default router;
