import express from 'express';
import path from 'node:path';
import { env } from './config/environment.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { errorHandler } from './middleware/error-handler.js';

import healthRoutes from './routes/health.routes.js';
import metricsRoutes from './routes/metrics.routes.js';
import statusRoutes from './routes/status.routes.js';
import configRoutes from './routes/config.routes.js';
import eventsRoutes from './routes/events.routes.js';
import deploymentRoutes from './routes/deployment.routes.js';
import demoRoutes from './routes/demo.routes.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(metricsMiddleware);

  // Serve static frontend assets
  app.use(express.static(env.FRONTEND_DIR));

  // Health and Core System Probes
  app.use(healthRoutes);

  // Prometheus Telemetry Endpoint
  app.use(metricsRoutes);

  // REST API Routes
  app.use('/api', statusRoutes);
  app.use('/api', configRoutes);
  app.use('/api', eventsRoutes);
  app.use('/api', deploymentRoutes);
  app.use('/api', demoRoutes);

  // Root endpoint serves index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(env.FRONTEND_DIR, 'index.html'));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
