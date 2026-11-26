import express from 'express';
import path from 'node:path';
import { env } from './config/environment.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { errorHandler } from './middleware/error-handler.js';
import { requireAdminAuth, createRateLimiter } from './middleware/security.middleware.js';

import healthRoutes from './routes/health.routes.js';
import metricsRoutes from './routes/metrics.routes.js';
import statusRoutes from './routes/status.routes.js';
import configRoutes from './routes/config.routes.js';
import eventsRoutes from './routes/events.routes.js';
import deploymentRoutes from './routes/deployment.routes.js';
import demoRoutes from './routes/demo.routes.js';
import researchRoutes from './routes/research.routes.js';

export function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');

  const sensitiveLimiter = options.rateLimiter || createRateLimiter();
  const adminAuth = options.adminAuth || requireAdminAuth();

  // Security headers and explicit CORS policy
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

    const origin = req.headers.origin;
    if (origin && env.ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(origin && !env.ALLOWED_ORIGINS.includes(origin) ? 403 : 204);
    }
    return next();
  });

  // Middleware
  app.use(express.json({ limit: '100kb' }));
  app.use(metricsMiddleware);

  // Protect sensitive mutating endpoints with rate limiting and configurable auth
  app.use('/api/deploy', sensitiveLimiter, adminAuth);
  app.use('/api/reset', sensitiveLimiter, adminAuth);
  app.use('/api/k8s/sync', sensitiveLimiter, adminAuth);
  app.use('/api/demo/failure-injection', sensitiveLimiter, adminAuth);

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
  app.use('/api', researchRoutes);

  // JSON 404 handler for unknown API routes
  app.use('/api', (req, res) => {
    res.status(404).json({
      status: 'error',
      message: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
  });

  // Root endpoint serves index.html
  app.get('/', (req, res) => {
    res.sendFile(path.join(env.FRONTEND_DIR, 'index.html'));
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}

export const app = createApp();
