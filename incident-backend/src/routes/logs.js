const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

// GET /api/logs
router.get('/', async (req, res) => {
  try {
    const { trace_id, limit = 200, error_type } = req.query;

    let sql  = 'SELECT * FROM logs WHERE 1=1';
    const args = [];

    if (trace_id)   { sql += ' AND trace_id = ?';   args.push(trace_id); }
    if (error_type) { sql += ' AND error_type = ?';  args.push(error_type); }

    sql += ' ORDER BY timestamp DESC LIMIT ?';
    args.push(parseInt(limit));

    const logs = await db.all(sql, args);
    res.json({ logs, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logs/trace/:traceId
router.get('/trace/:traceId', async (req, res) => {
  try {
    const logs = await db.all(
      'SELECT * FROM logs WHERE trace_id = ? ORDER BY timestamp ASC',
      [req.params.traceId]
    );
    res.json({ logs, total: logs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
