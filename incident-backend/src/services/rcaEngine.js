/**
 * Claude RCA Engine — Phase 3 implementation
 * Stub so Phase 2 can call it without crashing.
 * Phase 3 replaces this with real Claude API calls.
 */

async function generateRCA(incident, logs, io) {
  // Intentional no-op in Phase 2
  // Phase 3 will: call Claude, parse JSON, store report, emit rca_complete
}

module.exports = { generateRCA };
