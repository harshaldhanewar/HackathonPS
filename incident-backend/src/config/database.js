const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

const DATA_DIR = path.join(__dirname, '../../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'incidents.db');

// createClient with file:// URL uses libsql's embedded SQLite — no server needed
const db = createClient({ url: `file:${DB_PATH}` });

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id      TEXT    UNIQUE NOT NULL,
    timestamp   TEXT    NOT NULL,
    trace_id    TEXT,
    service     TEXT,
    level       TEXT,
    error_type  TEXT,
    message     TEXT,
    raw_json    TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_logs_trace_id   ON logs(trace_id);
  CREATE INDEX IF NOT EXISTS idx_logs_error_type ON logs(error_type);
  CREATE INDEX IF NOT EXISTS idx_logs_timestamp  ON logs(timestamp);

  CREATE TABLE IF NOT EXISTS incidents (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    incident_id       TEXT    UNIQUE NOT NULL,
    trace_id          TEXT,
    type              TEXT    NOT NULL,
    severity          TEXT    NOT NULL DEFAULT 'MEDIUM',
    status            TEXT    NOT NULL DEFAULT 'OPEN',
    title             TEXT,
    description       TEXT,
    affected_services TEXT,
    log_count         INTEGER DEFAULT 0,
    first_seen        DATETIME,
    last_seen         DATETIME,
    resolved_at       DATETIME,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_incidents_status   ON incidents(status);
  CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
  CREATE INDEX IF NOT EXISTS idx_incidents_type     ON incidents(type);

  CREATE TABLE IF NOT EXISTS rca_reports (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    report_id              TEXT    UNIQUE NOT NULL,
    incident_id            TEXT    NOT NULL,
    root_cause             TEXT,
    impact_summary         TEXT,
    remediation_steps      TEXT,
    automation_suggestions TEXT,
    similar_incidents      TEXT,
    confidence_score       REAL,
    model_used             TEXT,
    token_usage            TEXT,
    generated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id)
  );

  CREATE INDEX IF NOT EXISTS idx_rca_incident_id ON rca_reports(incident_id);

  CREATE TABLE IF NOT EXISTS automation_actions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    action_id     TEXT    UNIQUE NOT NULL,
    incident_id   TEXT,
    action_type   TEXT    NOT NULL,
    status        TEXT    NOT NULL DEFAULT 'PENDING',
    input_data    TEXT,
    result_data   TEXT,
    error_message TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at  DATETIME,
    FOREIGN KEY (incident_id) REFERENCES incidents(incident_id)
  );

  CREATE TABLE IF NOT EXISTS rag_memory (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id        TEXT UNIQUE NOT NULL,
    incident_type    TEXT,
    incident_summary TEXT,
    rca_summary      TEXT,
    remediation      TEXT,
    keywords         TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_rag_type ON rag_memory(incident_type);
`;

/**
 * Initialize schema. Called once at startup.
 * libsql doesn't support multi-statement exec, so split on semicolon.
 */
async function initializeSchema() {
  const statements = SCHEMA
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const sql of statements) {
    await db.execute(sql);
  }

  logger.info(`[DB] Schema ready at ${DB_PATH}`);
}

/**
 * Convenience wrappers that mirror the better-sqlite3 synchronous API shape.
 * All are async — callers must await them.
 */
const dbHelpers = {
  /** Run a SELECT and return all matching rows as plain objects */
  async all(sql, args = []) {
    const result = await db.execute({ sql, args });
    return result.rows;
  },

  /** Run a SELECT and return the first matching row, or null */
  async get(sql, args = []) {
    const result = await db.execute({ sql, args });
    return result.rows[0] ?? null;
  },

  /** Run an INSERT / UPDATE / DELETE */
  async run(sql, args = []) {
    const result = await db.execute({ sql, args });
    return { lastInsertRowid: result.lastInsertRowid, rowsAffected: result.rowsAffected };
  },

  /** Expose raw client for advanced usage */
  client: db,

  initializeSchema,
};

module.exports = dbHelpers;
