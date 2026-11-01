import express from 'express';
import client from 'prom-client';

const app = express();
app.use(express.json());

const PORT = Number.parseInt(process.env.PORT || '5006', 10);
const HOST = process.env.HOST || '0.0.0.0';
const RELEASE_VERSION = process.env.RELEASE_VERSION || 'v1.0';
const FAULT_MODE = process.env.FAULT_MODE === 'true';

// Prometheus Metrics Registry
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

// In-Memory Catalog Data
const products = [
  { id: 'prod-001', name: 'Cloud Native Telemetry Agent', price: 149.99, stock: 45 },
  { id: 'prod-002', name: 'Progressive Delivery Controller', price: 299.99, stock: 18 },
  { id: 'prod-003', name: 'Automated Circuit Breaker', price: 99.99, stock: 62 },
  { id: 'prod-004', name: 'GitOps Synchronization Engine', price: 499.99, stock: 12 }
];

// Health Probes
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

// Prometheus Scrape Endpoint
app.get('/metrics', async (req, res) => {
  try {
    // If running in faulty candidate mode, record elevated 500 error metrics
    if (FAULT_MODE || RELEASE_VERSION === 'v3.0') {
      orderRequestsTotal.inc({ method: 'POST', route: '/orders', status_code: '500' }, 12);
      orderRequestsTotal.inc({ method: 'GET', route: '/products', status_code: '500' }, 8);
      orderRequestsTotal.inc({ method: 'GET', route: '/products', status_code: '200' }, 4);
    }
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

// Business Endpoint: List Products
app.get('/products', (req, res) => {
  if (FAULT_MODE && Math.random() < 0.6) {
    return res.status(500).json({
      error: 'Order Microservice Database Deadlock (v3.0 Faulty Candidate)',
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

// Business Endpoint: Process Order
app.post('/orders', (req, res) => {
  const { productId, quantity } = req.body || {};

  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({
      error: 'Invalid order: productId and quantity >= 1 are required',
      service: 'order-service'
    });
  }

  if (FAULT_MODE && Math.random() < 0.5) {
    return res.status(503).json({
      error: 'Order Processing Pipeline Degraded (v3.0 Faulty Candidate)',
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

export default app;
