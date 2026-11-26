import express from 'express';
import client from 'prom-client';
import { fileURLToPath } from 'node:url';

export function createOrderApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  const RELEASE_VERSION = process.env.RELEASE_VERSION || 'v1.0';
  const FAULT_MODE = process.env.FAULT_MODE === 'true';

  // Prometheus Metrics Registry (isolated per app instance to prevent duplicate registration)
  const register = new client.Registry();
  client.collectDefaultMetrics({ register, prefix: 'order_service_' });

  const orderRequestsTotal = new client.Counter({
    name: 'order_requests_total',
    help: 'Total HTTP requests processed by Order Microservice',
    labelNames: ['method', 'route', 'status_code'],
    registers: [register]
  });

  const orderProcessingDuration = new client.Histogram({
    name: 'order_processing_duration_seconds',
    help: 'Histogram of order service processing duration',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [register]
  });

  // Metrics middleware
  app.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
      const diff = process.hrtime(start);
      const duration = diff[0] + diff[1] / 1e9;
      const route = req.route ? req.baseUrl + req.route.path : req.path;
      const statusCode = res.statusCode.toString();

      orderRequestsTotal.inc({ method: req.method, route, status_code: statusCode });
      orderProcessingDuration.observe({ method: req.method, route, status_code: statusCode }, duration);
    });
    next();
  });

  const products = [
    { id: 'prod-001', name: 'Cloud Native Telemetry Agent', price: 149.99, stock: 45 },
    { id: 'prod-002', name: 'Progressive Delivery Controller', price: 299.99, stock: 18 },
    { id: 'prod-003', name: 'Automated Circuit Breaker', price: 99.99, stock: 62 },
    { id: 'prod-004', name: 'GitOps Synchronization Engine', price: 499.99, stock: 12 }
  ];

  app.get('/health', (req, res) => {
    res.json({
      status: 'HEALTHY',
      service: 'order-service',
      version: RELEASE_VERSION,
      fault_mode: FAULT_MODE,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/ready', (req, res) => {
    res.json({
      ready: true,
      service: 'order-service',
      version: RELEASE_VERSION,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/version', (req, res) => {
    res.json({
      service: 'order-service',
      version: RELEASE_VERSION,
      fault_mode: FAULT_MODE,
      node: process.version,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/metrics', async (req, res) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (err) {
      res.status(500).end(err.message);
    }
  });

  app.get('/products', (req, res) => {
    if (FAULT_MODE && Math.random() < 0.6) {
      return res.status(500).json({
        error: 'Order Microservice Database Deadlock (Faulty Candidate)',
        service: 'order-service',
        version: RELEASE_VERSION,
        timestamp: new Date().toISOString()
      });
    }

    return res.json({
      service: 'order-service',
      version: RELEASE_VERSION,
      total: products.length,
      products,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/orders', (req, res) => {
    const { productId, quantity } = req.body || {};

    if (
      typeof productId !== 'string' ||
      !productId.trim() ||
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1
    ) {
      return res.status(400).json({
        error: 'Invalid order: valid productId and positive integer quantity are required',
        service: 'order-service'
      });
    }

    if (FAULT_MODE && Math.random() < 0.5) {
      return res.status(503).json({
        error: 'Order Processing Pipeline Degraded (Faulty Candidate)',
        service: 'order-service',
        version: RELEASE_VERSION,
        timestamp: new Date().toISOString()
      });
    }

    const orderId = `ord-${Date.now().toString(36)}`;
    return res.status(201).json({
      order_id: orderId,
      status: 'CONFIRMED',
      product_id: productId,
      quantity,
      processed_by: `order-service@${RELEASE_VERSION}`,
      service: 'order-service',
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const app = isDirectRun ? createOrderApp() : null;

if (isDirectRun) {
  const PORT = Number.parseInt(process.env.PORT || '5006', 10);
  const HOST = process.env.HOST || '0.0.0.0';
  const RELEASE_VERSION = process.env.RELEASE_VERSION || 'v1.0';
  const FAULT_MODE = process.env.FAULT_MODE === 'true';

  const server = app.listen(PORT, HOST, () => {
    console.log(JSON.stringify({
      level: 'INFO',
      service: 'order-service',
      version: RELEASE_VERSION,
      fault_mode: FAULT_MODE,
      port: PORT,
      host: HOST,
      timestamp: new Date().toISOString()
    }));
  });

  const handleShutdown = (signal) => {
    console.log(JSON.stringify({ level: 'INFO', service: 'order-service', message: `Received ${signal}, shutting down` }));
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

export default app;
