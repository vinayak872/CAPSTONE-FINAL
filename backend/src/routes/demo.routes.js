import express from 'express';
import { stateService } from '../services/state.service.js';
import { env } from '../config/environment.js';

const router = express.Router();

// Mock store data for realistic demonstration operations
const sampleProducts = [
  { id: 'prod-001', name: 'Cloud Native Telemetry Agent', tier: 'enterprise', active: true },
  { id: 'prod-002', name: 'Progressive Delivery Controller', tier: 'pro', active: true },
  { id: 'prod-003', name: 'Automated Circuit Breaker', tier: 'standard', active: true },
  { id: 'prod-004', name: 'GitOps Synchronization Engine', tier: 'enterprise', active: true }
];

// Controlled failure state (ONLY active if injected in non-production test mode)
const failureModes = {
  elevatedErrorRate: false,
  injectedLatencyMs: 0,
  unhealthyReadiness: false
};

// Realistic business operation: List products
router.get('/demo/products', async (req, res) => {
  // Apply controlled failure mode if enabled in test environment
  if (failureModes.injectedLatencyMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, failureModes.injectedLatencyMs));
  }

  if (failureModes.elevatedErrorRate && Math.random() < 0.6) {
    return res.status(500).json({
      error: 'Simulated 500: Microservice database connection pool exhausted',
      fault_injected: true,
      active_version: stateService.activeVersion
    });
  }

  return res.json({
    service: 'cloud05-demo-microservice',
    active_version: stateService.activeVersion,
    products: sampleProducts,
    total: sampleProducts.length,
    timestamp: new Date().toISOString()
  });
});

// Realistic business operation: Process transaction / order
router.post('/demo/orders', async (req, res) => {
  const { productId, quantity } = req.body || {};

  if (!productId || !quantity || quantity < 1) {
    return res.status(400).json({
      error: 'Validation Error: Valid productId and positive quantity are required'
    });
  }

  if (failureModes.elevatedErrorRate && Math.random() < 0.5) {
    return res.status(503).json({
      error: 'Simulated 503: Order processing pipeline degraded in candidate version',
      fault_injected: true
    });
  }

  const orderId = `ord-${Date.now().toString(36)}`;
  return res.status(201).json({
    order_id: orderId,
    status: 'CONFIRMED',
    product_id: productId,
    quantity,
    processed_by_version: stateService.activeVersion,
    timestamp: new Date().toISOString()
  });
});

// Controlled failure injection (strictly restricted to non-production environments)
router.post('/demo/failure-injection', (req, res) => {
  if (env.NODE_ENV === 'production') {
    return res.status(403).json({
      error: 'Forbidden: Failure injection is disabled in production environment.'
    });
  }

  const { elevatedErrorRate, injectedLatencyMs, unhealthyReadiness } = req.body || {};

  if (typeof elevatedErrorRate === 'boolean') {
    failureModes.elevatedErrorRate = elevatedErrorRate;
  }
  if (typeof injectedLatencyMs === 'number' && injectedLatencyMs >= 0) {
    failureModes.injectedLatencyMs = injectedLatencyMs;
  }
  if (typeof unhealthyReadiness === 'boolean') {
    failureModes.unhealthyReadiness = unhealthyReadiness;
    stateService.setApplicationHealth(unhealthyReadiness ? 'UNHEALTHY' : 'HEALTHY');
  }

  return res.json({
    status: 'updated',
    environment: env.NODE_ENV,
    active_failure_modes: { ...failureModes },
    current_health: stateService.applicationHealth
  });
});

export default router;
