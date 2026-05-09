const express = require('express');
const router  = express.Router();
const db      = require('../config/database');

// GET /api/automation
router.get('/', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const actions = await db.all(
      'SELECT * FROM automation_actions ORDER BY created_at DESC LIMIT ?',
      [parseInt(limit)]
    );
    res.json({ actions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/automation/trigger
router.post('/trigger', async (req, res) => {
  const { incident_id, action_type } = req.body;
  if (!incident_id || !action_type) {
    return res.status(400).json({ error: 'incident_id and action_type are required' });
  }
  try {
    const { triggerAction } = require('../services/automationService');
    const result = await triggerAction(incident_id, action_type);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
