/**
 * RAG Service — Phase 3 (keyword-based similarity)
 * Phase 4 replaces keyword matching with ChromaDB vector embeddings.
 */

const { v4: uuidv4 } = require('uuid');
const db     = require('../config/database');
const logger = require('../utils/logger');

// ─── Find similar past incidents ──────────────────────────────────────────────

async function findSimilarIncidents(incident, limit = 3) {
  try {
    // Exact type match is always most relevant
    const byType = await db.all(
      `SELECT * FROM rag_memory WHERE incident_type = ? ORDER BY created_at DESC LIMIT ?`,
      [incident.type, limit]
    );
    if (byType.length >= limit) return byType.slice(0, limit);

    // Fill remaining slots via keyword overlap
    const remaining = limit - byType.length;
    const keywords  = extractKeywords(
      `${incident.title || ''} ${incident.description || ''} ${incident.type}`
    );
    if (keywords.length === 0) return byType;

    const candidates = await db.all(
      `SELECT * FROM rag_memory WHERE incident_type != ? ORDER BY created_at DESC LIMIT 50`,
      [incident.type]
    );

    const scored = candidates
      .map(mem => ({
        ...mem,
        _score: computeOverlap(keywords, (mem.keywords || '').split(',').filter(Boolean)),
      }))
      .filter(m => m._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, remaining);

    return [...byType, ...scored];
  } catch (err) {
    logger.warn(`[RAG] findSimilarIncidents failed: ${err.message}`);
    return [];
  }
}

// ─── Seed memory after each RCA ───────────────────────────────────────────────

async function seedMemory(incident, rca) {
  try {
    const keywords = extractKeywords([
      incident.type,
      incident.title  || '',
      incident.description || '',
      rca.root_cause  || '',
      rca.pattern     || '',
      ...(rca.affected_components || []),
    ].join(' ')).join(',');

    await db.run(
      `INSERT OR IGNORE INTO rag_memory
         (memory_id, incident_type, incident_summary, rca_summary, remediation, keywords)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        incident.type,
        `${incident.title}: ${incident.description || ''}`.substring(0, 500),
        `${rca.root_cause} | Pattern: ${rca.pattern}`.substring(0, 500),
        JSON.stringify(rca.remediation_steps || []).substring(0, 1000),
        keywords,
      ]
    );

    logger.debug(`[RAG] Seeded memory for type: ${incident.type}`);
  } catch (err) {
    logger.warn(`[RAG] seedMemory failed: ${err.message}`);
  }
}

// ─── Keyword helpers ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
  'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'out', 'but', 'and', 'or', 'not', 'no', 'nor', 'so', 'yet',
  'both', 'either', 'neither', 'whether', 'that', 'which', 'who', 'what', 'this',
  'these', 'those', 'it', 'its', 'if', 'then', 'than', 'because', 'while',
  'their', 'there', 'they', 'them', 'your', 'our', 'we', 'us', 'my', 'me',
]);

function extractKeywords(text) {
  return [...new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )];
}

function computeOverlap(setA, setB) {
  if (!setA.length || !setB.length) return 0;
  const bSet = new Set(setB);
  return setA.filter(w => bSet.has(w)).length / Math.max(setA.length, setB.length);
}

module.exports = { findSimilarIncidents, seedMemory };
