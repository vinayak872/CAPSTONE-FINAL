import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, _next) {
  logger.error('Unhandled Application Error', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method
  });

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    status: 'error',
    message: err.message || 'Internal Server Error'
  });
}
