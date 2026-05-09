const express = require('express');
const db      = require('../config/database');

module.exports = function createIncidentRouter(io) {
const router = express.Router();

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

    // Attach the latest RCA to each incident
    const enriched = await Promise.all(
      incidents.map(async (inc) => {
        const rca = await db.get(
          'SELECT * FROM rca_reports WHERE incident_id = ? ORDER BY generated_at DESC LIMIT 1',
          [inc.incident_id]
        );
        return { ...inc, rca: rca || null };
      })
    );

    res.json({ incidents: enriched, total: enriched.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/incidents/stats
router.get('/stats', async (req, res) => {
  try {
    const [total, open, critical, resolved, analyzing] = await Promise.all([
      db.get("SELECT COUNT(*) as c FROM incidents"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'OPEN'"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE severity = 'CRITICAL'"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'RESOLVED'"),
      db.get("SELECT COUNT(*) as c FROM incidents WHERE status = 'ANALYZING'"),
    ]);

    res.json({
      total:     Number(total?.c ?? 0),
      open:      Number(open?.c ?? 0),
      critical:  Number(critical?.c ?? 0),
      resolved:  Number(resolved?.c ?? 0),
      analyzing: Number(analyzing?.c ?? 0),
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
        'SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC',
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
