import express from 'express';
import { metricsService, httpRequestsTotal } from '../services/metrics.service.js';

const router = express.Router();

router.get('/metrics', async (req, res) => {
  try {
    if (process.env.FAULT_MODE === 'true' || process.env.RELEASE_VERSION === 'v3.0') {
      httpRequestsTotal.inc({ method: 'GET', route: '/api/demo/products', status_code: '500' }, 12);
      httpRequestsTotal.inc({ method: 'GET', route: '/api/demo/products', status_code: '200' }, 3);
    }
    res.set('Content-Type', metricsService.getContentType());
    res.end(await metricsService.getMetrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

export default router;
