import crypto from 'node:crypto';
import { env } from '../config/environment.js';

function safeTokenEquals(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Protects administrative/mutating endpoints.
 * - If ADMIN_API_TOKEN is configured (or REQUIRE_AUTH=true / production), enforces Bearer or x-api-key header.
 * - In local development/test without a configured token, permits local demo workflows unless REQUIRE_AUTH is set.
 */
export function requireAdminAuth(options = {}) {
  return (req, res, next) => {
    const token = options.getToken ? options.getToken() : (process.env.ADMIN_API_TOKEN ?? env.ADMIN_API_TOKEN);
    const requireAuth = options.isAuthRequired
      ? options.isAuthRequired()
      : (process.env.REQUIRE_AUTH === 'true' || env.REQUIRE_AUTH || process.env.NODE_ENV === 'production');

    if (!token) {
      if (requireAuth) {
        return res.status(503).json({
          status: 'error',
          error: 'Authentication is required but ADMIN_API_TOKEN is not configured'
        });
      }
      return next();
    }

    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const apiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : '';
    const provided = bearer || apiKey;

    if (!provided) {
      return res.status(401).json({
        status: 'error',
        error: 'Unauthorized: Missing API token'
      });
    }

    if (!safeTokenEquals(provided, token)) {
      return res.status(403).json({
        status: 'error',
        error: 'Forbidden: Invalid API token'
      });
    }

    return next();
  };
}

/**
 * Lightweight fixed-window rate limiter for sensitive endpoints.
 */
export function createRateLimiter({ windowMs = env.RATE_LIMIT_WINDOW_MS, maxRequests = env.RATE_LIMIT_MAX } = {}) {
  const hits = new Map();

  const middleware = (req, res, next) => {
    const now = Date.now();
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const key = `${clientIp}:${req.baseUrl || req.path}`;
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(key, { windowStart: now, count: 1 });
      return next();
    }

    entry.count += 1;
    if (entry.count > maxRequests) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.windowStart + windowMs - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        status: 'error',
        error: `Too many requests. Limit is ${maxRequests} per ${Math.round(windowMs / 1000)}s.`
      });
    }

    return next();
  };

  middleware.reset = () => hits.clear();
  return middleware;
}
