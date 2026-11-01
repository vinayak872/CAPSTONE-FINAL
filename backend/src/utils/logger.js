/**
 * Structured Logger for CLOUD-05 Progressive Delivery Controller
 */

function formatTimestamp() {
  return new Date().toISOString();
}

export const logger = {
  info(message, meta = {}) {
    console.log(JSON.stringify({
      level: 'INFO',
      timestamp: formatTimestamp(),
      message,
      ...meta
    }));
  },
  warn(message, meta = {}) {
    console.warn(JSON.stringify({
      level: 'WARN',
      timestamp: formatTimestamp(),
      message,
      ...meta
    }));
  },
  error(message, meta = {}) {
    console.error(JSON.stringify({
      level: 'ERROR',
      timestamp: formatTimestamp(),
      message,
      ...meta
    }));
  },
  debug(message, meta = {}) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({
        level: 'DEBUG',
        timestamp: formatTimestamp(),
        message,
        ...meta
      }));
    }
  }
};
