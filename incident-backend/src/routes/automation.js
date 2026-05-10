const express = require('express');
const db      = require('../config/database');

module.exports = function createAutomationRouter(io) {
  const router = express.Router();

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
      const result = await triggerAction(incident_id, action_type, {}, io);
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
