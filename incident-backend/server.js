/**
 * HackSys AI Incident Assistant — Backend Server
 *
 * Boot order:
 *  1. Load env
 *  2. Initialize SQLite schema (async)
 *  3. Create Express + Socket.io app
 *  4. Mount routes
 *  5. Start background log poller
 *  6. Listen
 */

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');

const env    = require('./src/config/env');
const db     = require('./src/config/database');
const logger = require('./src/utils/logger');

async function main() {
  // ─── 1. Initialize database schema ─────────────────────────────────────────
  await db.initializeSchema();

  // ─── 2. Express + Socket.io ─────────────────────────────────────────────────
  const app        = express();
  const httpServer = http.createServer(app);
  const io         = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
      methods: ['GET', 'POST'],
    },
  });

  app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
  app.use(express.json());

  // ─── 3. Health check ────────────────────────────────────────────────────────
  app.get('/health', (req, res) => {
    res.json({
      status: 'UP',
      timestamp: new Date().toISOString(),
      services: {
        database: 'UP',
        poller: 'RUNNING',
        ai: env.ANTHROPIC_API_KEY ? 'UP' : 'DISABLED',
        rag: 'UP',
      },
    });
  });

  // ─── 4. API routes ──────────────────────────────────────────────────────────
  app.use('/api/logs',       require('./src/routes/logs'));
  app.use('/api/incidents',  require('./src/routes/incidents'));
  app.use('/api/rca',        require('./src/routes/rca'));
  app.use('/api/automation', require('./src/routes/automation'));

  // ─── 5. WebSocket ───────────────────────────────────────────────────────────
  require('./src/socket/socketHandler')(io);

  // ─── 6. Background poller ───────────────────────────────────────────────────
  const { startPoller } = require('./src/services/logPoller');
  startPoller(io);

  // ─── 7. Listen ──────────────────────────────────────────────────────────────
  httpServer.listen(env.PORT, () => {
    logger.info(`HackSys Backend  →  http://localhost:${env.PORT}`);
    logger.info(`Polling target   →  ${env.BACKEND_URL}/logs  (every ${env.POLL_INTERVAL / 1000}s)`);
    logger.info(`Claude AI RCA    →  ${env.ANTHROPIC_API_KEY ? 'ENABLED' : 'DISABLED — set ANTHROPIC_API_KEY'}`);
  });

  // Export for testing / other modules
  return { app, io };
}

main().catch(err => {
  console.error('[FATAL] Server failed to start:', err);
  process.exit(1);
});
