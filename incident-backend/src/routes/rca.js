const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

// GET /api/rca/:incidentId
router.get('/:incidentId', async (req, res) => {
  try {
    const reports = await db.all(
      'SELECT * FROM rca_reports WHERE incident_id = ? ORDER BY generated_at DESC',
      [req.params.incidentId]
    );
    res.json({ reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
