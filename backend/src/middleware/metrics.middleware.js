import { httpRequestsTotal, httpRequestDurationSeconds } from '../services/metrics.service.js';

export function metricsMiddleware(req, res, next) {
  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSeconds = diff[0] + diff[1] / 1e9;
    const route = req.route ? req.baseUrl + req.route.path : req.path;
    const statusCode = res.statusCode.toString();

    httpRequestsTotal.inc({
      method: req.method,
      route,
      status_code: statusCode
    });

    httpRequestDurationSeconds.observe({
      method: req.method,
      route,
      status_code: statusCode
    }, durationSeconds);
  });

  next();
}
