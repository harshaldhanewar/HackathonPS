/**
 * Incident Detection Engine
 *
 * Processes a batch of new log entries and decides whether they constitute
 * an incident. Uses rule-based matching (fast, reliable, demo-friendly).
 *
 * Detection strategy:
 *  1. Group new logs by trace_id so related events are evaluated together
 *  2. Match each log's error_type against the INCIDENT_RULES table
 *  3. Suppress duplicates: if an OPEN/ANALYZING incident already exists for
 *     this trace_id + type, update it instead of creating a new one
 *  4. Special case: ASYNC_TRACE_LOSS — detected from null/orphan trace_ids
 *
 * Severity ladder:
 *   CRITICAL — data corruption, financial loss risk (negative stock, duplicate payment)
 *   HIGH     — service degradation, partial failures (timeouts, orphaned records)
 *   MEDIUM   — operational issues (trace loss, state inconsistencies)
 *   LOW      — informational anomalies
 */

const logger = require('../utils/logger');
const db     = require('../config/database');

// ─── Incident rules ───────────────────────────────────────────────────────────
// Each rule maps an error_type (from Spring Boot logs) to incident metadata.

const INCIDENT_RULES = [
  {
    errorType:        'GATEWAY_TIMEOUT',
    incidentType:     'GATEWAY_TIMEOUT',
    severity:         'HIGH',
    title:            'Payment Gateway Timeout',
    getDescription:   (log) =>
      `Payment gateway in ${log.service || 'PaymentService'} did not respond within SLA. ` +
      `Client-side retries without idempotency keys may cause duplicate charges.`,
    affectedServices: ['PaymentService'],
  },
  {
    errorType:        'DUPLICATE_PAYMENT_DETECTED',
    incidentType:     'DUPLICATE_PAYMENT_DETECTED',
    severity:         'CRITICAL',
    title:            'Duplicate Payment Detected',
    getDescription:   (log) =>
      `Multiple payment records created for the same order. ` +
      `Root cause: gateway timeout triggered client retry with no idempotency protection.`,
    affectedServices: ['PaymentService'],
  },
  {
    errorType:        'ORDER_UPDATE_FAILURE',
    incidentType:     'ORDER_UPDATE_FAILURE',
    severity:         'HIGH',
    title:            'Order Update Failure — Partial Write',
    getDescription:   (log) =>
      `Payment recorded successfully but order status was not updated to PAID. ` +
      `Orphaned payment record detected — missing transaction boundary.`,
    affectedServices: ['PaymentService', 'OrderService'],
  },
  {
    errorType:        'NEGATIVE_STOCK',
    incidentType:     'NEGATIVE_STOCK',
    severity:         'CRITICAL',
    title:            'Inventory Oversell — Negative Stock',
    getDescription:   (log) =>
      `Stock level went negative due to a race condition. ` +
      `Non-atomic check-then-act pattern allows concurrent requests to bypass the stock guard.`,
    affectedServices: ['InventoryService'],
  },
  {
    errorType:        'INCONSISTENT_STATE',
    incidentType:     'INCONSISTENT_STATE',
    severity:         'HIGH',
    title:            'Inconsistent Order State',
    getDescription:   (log) =>
      `Order persisted in CREATED state despite a downstream reservation failure. ` +
      `Missing compensating transaction or saga rollback.`,
    affectedServices: ['OrderService', 'InventoryService'],
  },
  {
    errorType:        'CONFIRM_NOTIFICATION_FAILED',
    incidentType:     'ASYNC_TRACE_LOSS',
    severity:         'MEDIUM',
    title:            'Async Trace Context Loss',
    getDescription:   (log) =>
      `Async background job lost MDC trace context. ` +
      `Orphaned log entries cannot be correlated to their originating HTTP request.`,
    affectedServices: ['OrderService'],
  },
];

// O(1) lookup by error_type
const RULE_BY_ERROR_TYPE = Object.fromEntries(
  INCIDENT_RULES.map(r => [r.errorType, r])
);

// ─── Main detection entry point ───────────────────────────────────────────────

async function detectIncidents(newLogs, io) {
  if (newLogs.length === 0) return;

  const traceGroups = groupByTraceId(newLogs);
  const errorLogs   = newLogs.filter(l => l.error_type);
  const orphanLogs  = newLogs.filter(
    l => !l.trace_id || l.trace_id === 'unknown' || l.trace_id === 'ASYNC-ORPHAN'
  );

  // Process error logs grouped by trace
  for (const [traceId, logs] of Object.entries(traceGroups)) {
    for (const log of logs) {
      const rule = RULE_BY_ERROR_TYPE[log.error_type];
      if (!rule) continue;

      // Skip async-trace-loss rule here — handled separately below
      if (rule.incidentType === 'ASYNC_TRACE_LOSS') continue;

      await processLogForIncident(log, rule, logs, io);
    }
  }

  // Async trace loss detection (orphaned logs without trace context)
  if (orphanLogs.length > 0) {
    await detectAsyncTraceLoss(orphanLogs, io);
  }

  logger.debug(`[Detector] Processed ${errorLogs.length} error logs across ${Object.keys(traceGroups).length} traces`);
}

// ─── Per-log processing ───────────────────────────────────────────────────────

async function processLogForIncident(log, rule, contextLogs, io) {
  const traceId = log.trace_id || 'no-trace';

  // Look for an existing OPEN or ANALYZING incident with the same trace + type
  const existing = await db.get(
    `SELECT * FROM incidents
     WHERE trace_id = ? AND type = ? AND status IN ('OPEN', 'ANALYZING')
     LIMIT 1`,
    [traceId, rule.incidentType]
  );

  if (existing) {
    // Suppress duplicate — just update the count and timestamp
    await db.run(
      `UPDATE incidents
       SET log_count = log_count + 1, last_seen = ?
       WHERE incident_id = ?`,
      [log.timestamp, existing.incident_id]
    );

    io.emit('incident_update', {
      incident_id: existing.incident_id,
      log_count:   existing.log_count + 1,
      last_seen:   log.timestamp,
    });

    logger.debug(`[Detector] Suppressed duplicate — updated ${existing.incident_id}`);
    return;
  }

  // Create a fresh incident
  const incident = await createIncident(log, rule, contextLogs);

  io.emit('new_incident', incident);
  logger.info(`[Detector] 🚨 ${incident.severity} | ${incident.type} | ${incident.incident_id}`);

  // Kick off RCA async — Phase 3 fills this in; Phase 2 stub is a no-op
  triggerRCAAsync(incident, contextLogs, io);
}

// ─── Incident creation ────────────────────────────────────────────────────────

async function createIncident(triggerLog, rule, contextLogs) {
  const incident_id = generateIncidentId();
  const now         = triggerLog.timestamp || new Date().toISOString();

  await db.run(
    `INSERT INTO incidents
       (incident_id, trace_id, type, severity, status, title, description,
        affected_services, log_count, first_seen, last_seen)
     VALUES (?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?, ?)`,
    [
      incident_id,
      triggerLog.trace_id || 'no-trace',
      rule.incidentType,
      rule.severity,
      rule.title,
      rule.getDescription(triggerLog),
      JSON.stringify(rule.affectedServices),
      contextLogs.length,
      now,
      now,
    ]
  );

  return db.get('SELECT * FROM incidents WHERE incident_id = ?', [incident_id]);
}

// ─── Async trace loss detection ───────────────────────────────────────────────

async function detectAsyncTraceLoss(orphanedLogs, io) {
  // Suppress noise: if a recent ASYNC_TRACE_LOSS incident exists (< 3 min), update it
  const recent = await db.get(
    `SELECT * FROM incidents
     WHERE type = 'ASYNC_TRACE_LOSS'
       AND status IN ('OPEN', 'ANALYZING')
       AND created_at > datetime('now', '-3 minutes')
     LIMIT 1`
  );

  if (recent) {
    await db.run(
      `UPDATE incidents SET log_count = log_count + ?, last_seen = ? WHERE incident_id = ?`,
      [orphanedLogs.length, orphanedLogs[0].timestamp, recent.incident_id]
    );
    io.emit('incident_update', {
      incident_id: recent.incident_id,
      log_count:   recent.log_count + orphanedLogs.length,
    });
    return;
  }

  const rule = {
    incidentType:     'ASYNC_TRACE_LOSS',
    severity:         'MEDIUM',
    title:            'Async Trace Context Loss',
    getDescription:   (log) =>
      `${orphanedLogs.length} log(s) generated without trace context in ${log.service || 'background jobs'}. ` +
      `MDC trace propagation lost across async thread boundaries.`,
    affectedServices: ['OrderService'],
  };

  const incident = await createIncident(
    { ...orphanedLogs[0], trace_id: 'ASYNC-ORPHAN' },
    rule,
    orphanedLogs
  );

  io.emit('new_incident', incident);
  logger.info(`[Detector] 🔶 MEDIUM | ASYNC_TRACE_LOSS | ${incident.incident_id} (${orphanedLogs.length} orphaned logs)`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByTraceId(logs) {
  return logs.reduce((groups, log) => {
    const key = log.trace_id || 'no-trace';
    if (!groups[key]) groups[key] = [];
    groups[key].push(log);
    return groups;
  }, {});
}

function generateIncidentId() {
  const ts     = Date.now().toString(36).toUpperCase();
  const rand   = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INC-${ts}-${rand}`;
}

function triggerRCAAsync(incident, logs, io) {
  // Phase 3 wires this up fully. For Phase 2, require() will call the stub.
  const { generateRCA } = require('./rcaEngine');
  generateRCA(incident, logs, io).catch(() => {
    // Stub throws "not yet implemented" — silently ignored in Phase 2
  });
}

module.exports = { detectIncidents };
