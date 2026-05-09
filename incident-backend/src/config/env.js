require('dotenv').config();

const env = {
  BACKEND_URL: process.env.BACKEND_URL || 'https://hackathonps.onrender.com',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  CHROMA_URL: process.env.CHROMA_URL || 'http://localhost:8000',
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  POLL_INTERVAL: parseInt(process.env.POLL_INTERVAL || '20000', 10),
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL || '',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN || '',
  GITHUB_REPO: process.env.GITHUB_REPO || '',
};

// Warn about missing critical keys at startup (don't crash — allow demo without them)
if (!env.ANTHROPIC_API_KEY) {
  console.warn('[ENV] ANTHROPIC_API_KEY not set — RCA generation will be disabled');
}

module.exports = env;
