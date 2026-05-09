const logger = require('../utils/logger');
const db     = require('../config/database');

/**
 * WebSocket events pushed to the dashboard:
 *  new_log         — raw log ingested
 *  new_incident    — incident detected
 *  incident_update — status / severity changed
 *  rca_complete    — Claude finished RCA
 *  automation_done — automation workflow completed
 *  stats_update    — dashboard numbers refreshed
 */
function setupSocketHandler(io) {
  io.on('connection', (socket) => {
    logger.info(`[WS] Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
      logger.info(`[WS] Client disconnected: ${socket.id}`);
    });

    socket.on('request_stats', async () => {
      try {
        const [total, open, critical, resolved] = await Promise.all([
          db.get("SELECT COUNT(*) as c FROM incidents"),
          db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'OPEN'"),
          db.get("SELECT COUNT(*) as c FROM incidents WHERE severity = 'CRITICAL'"),
          db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'RESOLVED'"),
        ]);

        socket.emit('stats_update', {
          total:    Number(total?.c ?? 0),
          open:     Number(open?.c ?? 0),
          critical: Number(critical?.c ?? 0),
          resolved: Number(resolved?.c ?? 0),
        });
      } catch (err) {
        logger.error('[WS] stats_update failed:', err.message);
      }
    });
  });
}

module.exports = setupSocketHandler;
