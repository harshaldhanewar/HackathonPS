/**
 * Log Poller — Phase 2 implementation
 *
 * This stub starts cleanly so server.js can boot.
 * The full poller (fetch → deduplicate → detect → RCA) is built in Phase 2.
 */

const logger = require('../utils/logger');
const env = require('../config/env');

function startPoller(io) {
  logger.info(`[Poller] Initialized — full polling starts in Phase 2`);
  logger.info(`[Poller] Target: ${env.BACKEND_URL}/logs`);
  logger.info(`[Poller] Interval: ${env.POLL_INTERVAL}ms`);

  // Phase 2 will replace this with the real polling loop
}

module.exports = { startPoller };
