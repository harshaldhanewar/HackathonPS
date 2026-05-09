/**
 * Log Poller
 *
 * Polls the Spring Boot backend's /logs endpoint on a fixed interval.
 * Deduplicates by content hash, stores new entries to SQLite,
 * and hands new logs to the incident detector.
 *
 * Key design choices:
 *  - One in-flight poll at a time (isPolling guard) — prevents queue buildup
 *  - Deduplication at DB layer (INSERT OR IGNORE) — deterministic, no in-memory state
 *  - First poll fires immediately on startup for a fast demo experience
 */

const axios  = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const env    = require('../config/env');
const db     = require('../config/database');
const { detectIncidents } = require('./incidentDetector');

let isPolling = false;
let totalPolls = 0;
let totalNewLogs = 0;

// ─── Main poll function ───────────────────────────────────────────────────────

async function pollLogs(io) {
  if (isPolling) {
    logger.debug('[Poller] Skipping — previous poll still running');
    return;
  }

  isPolling = true;
  totalPolls++;

  try {
    const url = `${env.BACKEND_URL}/logs`;
    logger.debug(`[Poller] Polling ${url} (poll #${totalPolls})`);

    const response = await axios.get(url, { timeout: 15_000 });

    // The Spring Boot endpoint may return an array directly or wrap it
    let rawLogs = response.data;
    if (!Array.isArray(rawLogs)) {
      rawLogs = rawLogs?.logs ?? rawLogs?.data ?? [];
    }

    if (rawLogs.length === 0) {
      logger.debug('[Poller] No logs returned this cycle');
      return;
    }

    logger.debug(`[Poller] Fetched ${rawLogs.length} total logs from backend`);

    // Normalize + insert — collect only the ones that are brand-new
    const newLogs = [];

    for (const raw of rawLogs) {
      const log = normalizeLog(raw);

      const result = await db.run(
        `INSERT OR IGNORE INTO logs
           (log_id, timestamp, trace_id, service, level, error_type, message, raw_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          log.log_id,
          log.timestamp,
          log.trace_id,
          log.service,
          log.level,
          log.error_type,
          log.message,
          log.raw_json,
        ]
      );

      // rowsAffected === 0 means the row already existed (ignored)
      if (Number(result.rowsAffected) > 0) {
        newLogs.push(log);
        io.emit('new_log', log);
      }
    }

    totalNewLogs += newLogs.length;

    if (newLogs.length > 0) {
      logger.info(`[Poller] +${newLogs.length} new logs  (total ingested: ${totalNewLogs})`);

      // Run incident detection on the fresh batch
      await detectIncidents(newLogs, io);

      // Push updated dashboard stats
      await emitStats(io);
    } else {
      logger.debug('[Poller] All logs already seen — nothing new');
    }

  } catch (err) {
    if (['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(err.code)) {
      logger.warn(`[Poller] Backend unreachable: ${env.BACKEND_URL}`);
    } else if (err.response) {
      logger.warn(`[Poller] Backend returned ${err.response.status}: ${err.response.statusText}`);
    } else {
      logger.error(`[Poller] Unexpected error: ${err.message}`);
    }
  } finally {
    isPolling = false;
  }
}

// ─── Log normalization ────────────────────────────────────────────────────────

function normalizeLog(raw) {
  const timestamp  = raw.timestamp  || raw['@timestamp'] || new Date().toISOString();
  const trace_id   = raw.trace_id   || raw.traceId       || null;
  const service    = raw.service    || raw.logger_name   || raw.app || null;
  const level      = (raw.level     || raw.log_level     || 'INFO').toUpperCase();
  const error_type = raw.error_type || raw.errorType     || null;
  const message    = raw.message    || raw.msg           || raw.formatted_message || '';

  // Deterministic ID: same log content always produces the same hash
  const hashInput = `${timestamp}::${trace_id || 'no-trace'}::${message}`;
  const log_id    = crypto
    .createHash('sha256')
    .update(hashInput)
    .digest('hex')
    .substring(0, 32);

  return {
    log_id,
    timestamp,
    trace_id,
    service,
    level,
    error_type,
    message,
    raw_json: JSON.stringify(raw),
  };
}

// ─── Stats emitter ────────────────────────────────────────────────────────────

async function emitStats(io) {
  try {
    const [total, open, critical, resolved, analyzing] = await Promise.all([
      db.get("SELECT COUNT(*) as c FROM incidents"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'OPEN'"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE severity = 'CRITICAL'"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'RESOLVED'"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'ANALYZING'"),
    ]);

    io.emit('stats_update', {
      total:     Number(total?.c     ?? 0),
      open:      Number(open?.c      ?? 0),
      critical:  Number(critical?.c  ?? 0),
      resolved:  Number(resolved?.c  ?? 0),
      analyzing: Number(analyzing?.c ?? 0),
    });
  } catch (err) {
    logger.error('[Poller] emitStats failed:', err.message);
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

function startPoller(io) {
  logger.info(`[Poller] Starting — target: ${env.BACKEND_URL}/logs`);
  logger.info(`[Poller] Interval: ${env.POLL_INTERVAL / 1000}s`);

  // Fire immediately so the dashboard shows data without a 20s wait
  pollLogs(io).catch(err => logger.error('[Poller] First poll failed:', err.message));

  setInterval(() => {
    pollLogs(io).catch(err => logger.error('[Poller] Poll failed:', err.message));
  }, env.POLL_INTERVAL);
}

module.exports = { startPoller, pollLogs };
