const express = require('express');
const db      = require('../config/database');

module.exports = function createIncidentRouter(io) {
const router = express.Router();




// DELETE /api/incidents/reset
router.delete('/reset', async (req, res) => {
  try {

    // Remove all table data
    await db.run('DELETE FROM incidents');
    await db.run('DELETE FROM logs');
    await db.run('DELETE FROM rca_reports');
    await db.run('DELETE FROM automation_actions');

    // Reset SQLite auto increment counters
    await db.run("DELETE FROM sqlite_sequence WHERE name='incidents'");
    await db.run("DELETE FROM sqlite_sequence WHERE name='logs'");
    await db.run("DELETE FROM sqlite_sequence WHERE name='rca_reports'");
    await db.run("DELETE FROM sqlite_sequence WHERE name='automation_actions'");

    // Emit live dashboard reset
    io.emit('stats_update', {
      total: 0,
      open: 0,
      critical: 0,
      resolved: 0,
      analyzing: 0,
    });

    res.json({
      success: true,
      message: 'All table data cleared successfully'
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// GET /api/incidents
router.get('/', async (req, res) => {
  try {
    const { status, severity, limit = 50 } = req.query;

    let sql  = 'SELECT * FROM incidents WHERE 1=1';
    const args = [];

    if (status)   { sql += ' AND status = ?';   args.push(status.toUpperCase()); }
    if (severity) { sql += ' AND severity = ?'; args.push(severity.toUpperCase()); }

    sql += ' ORDER BY created_at DESC LIMIT ?';
    args.push(parseInt(limit));

    const incidents = await db.all(sql, args);
    if (incidents.length === 0) return res.json({ incidents: [], total: 0 });

    // Single bulk query for latest RCA per incident — avoids N+1
    const ids          = incidents.map(i => i.incident_id);
    const placeholders = ids.map(() => '?').join(',');
    const rcas         = await db.all(
      `SELECT r.* FROM rca_reports r
       INNER JOIN (
         SELECT incident_id, MAX(generated_at) AS max_gen
         FROM rca_reports WHERE incident_id IN (${placeholders})
         GROUP BY incident_id
       ) latest ON r.incident_id = latest.incident_id
              AND r.generated_at = latest.max_gen`,
      ids
    );
    const rcaMap  = Object.fromEntries(rcas.map(r => [r.incident_id, r]));
    const enriched = incidents.map(inc => ({ ...inc, rca: rcaMap[inc.incident_id] || null }));

    res.json({ incidents: enriched, total: enriched.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/stats
router.get('/stats', async (req, res) => {
  try {
    const row = await db.get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status   = 'OPEN'      THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN severity = 'CRITICAL'  THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN status   = 'RESOLVED'  THEN 1 ELSE 0 END) AS resolved,
        SUM(CASE WHEN status   = 'ANALYZING' THEN 1 ELSE 0 END) AS analyzing
      FROM incidents
    `);
    res.json({
      total:     Number(row?.total     ?? 0),
      open:      Number(row?.open      ?? 0),
      critical:  Number(row?.critical  ?? 0),
      resolved:  Number(row?.resolved  ?? 0),
      analyzing: Number(row?.analyzing ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/:id
router.get('/:id', async (req, res) => {
  try {
    const incident = await db.get(
      'SELECT * FROM incidents WHERE incident_id = ?',
      [req.params.id]
    );
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const [rca, logs, actions] = await Promise.all([
      db.get(
        'SELECT * FROM rca_reports WHERE incident_id = ? ORDER BY generated_at DESC LIMIT 1',
        [req.params.id]
      ),
      db.all(
        'SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC LIMIT 100',
        [incident.trace_id || '']
      ),
      db.all(
        'SELECT * FROM automation_actions WHERE incident_id = ? ORDER BY created_at DESC',
        [req.params.id]
      ),
    ]);

    res.json({ incident, rca: rca || null, logs, actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/incidents/:id/resolve
router.post('/:id/resolve', async (req, res) => {
  try {
    await db.run(
      "UPDATE incidents SET status = 'RESOLVED', resolved_at = CURRENT_TIMESTAMP WHERE incident_id = ?",
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/incidents/:id/reanalyze
router.post('/:id/reanalyze', async (req, res) => {
  try {
    const incident = await db.get(
      'SELECT * FROM incidents WHERE incident_id = ?',
      [req.params.id]
    );
    if (!incident) return res.status(404).json({ error: 'Incident not found' });

    const { generateRCA } = require('../services/rcaEngine');
    const logs = await db.all(
      'SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC',
      [incident.trace_id || '']
    );

    generateRCA(incident, logs, io).catch(console.error);
    res.json({ success: true, message: 'RCA analysis queued' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

return router;
};
