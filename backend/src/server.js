import { app } from './app.js';
import { env } from './config/environment.js';
import { logger } from './utils/logger.js';
import { k8sService } from './services/k8s.service.js';

const server = app.listen(env.PORT, env.HOST, async () => {
  logger.info('CLOUD-05 Node.js Server listening', {
    port: env.PORT,
    host: env.HOST,
    environment: env.NODE_ENV,
    executionMode: env.EXECUTION_MODE,
    frontendDir: env.FRONTEND_DIR,
    configFile: env.CONFIG_FILE
  });

  // Perform background connectivity check for cluster integration
  const k8sStatus = await k8sService.checkConnectivity();
  logger.info('Cluster connectivity check completed', k8sStatus);
});

// Graceful shutdown handling
function handleShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Force shutdown after timeout if pending connections hang
  setTimeout(() => {
    logger.error('Forceful shutdown triggered after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
