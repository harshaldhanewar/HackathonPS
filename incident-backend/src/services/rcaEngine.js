/**
 * Claude RCA Engine — Phase 3
 * Calls claude-opus-4-7 with adaptive thinking to generate structured root
 * cause analysis reports from incident metadata + correlated log entries.
 *
 * Design:
 *  - System prompt is marked ephemeral for prompt caching (5-min TTL)
 *  - Streaming via .stream() + .finalMessage() avoids socket timeouts
 *  - io is optional — auto-triggered RCA passes it; reanalyze API may not
 *  - On failure the incident reverts to OPEN so it doesn't stay stuck
 */

const Anthropic = require('@anthropic-ai/sdk');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const env    = require('../config/env');
const db     = require('../config/database');
const { findSimilarIncidents, seedMemory } = require('./ragService');

// Lazy singleton — not created if API key is absent
let _client = null;
function getClient() {
  if (!_client) {
    _client = new Anthropic.Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// Serial queue — one RCA at a time with a gap between calls to respect rate limits
let _queueTail = Promise.resolve();
const RCA_MIN_GAP_MS = 3000;

function enqueue(fn) {
  _queueTail = _queueTail.then(async () => {
    await fn();
    await new Promise(r => setTimeout(r, RCA_MIN_GAP_MS));
  });
  return _queueTail;
}

// ─── Cached system prompt ─────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert Site Reliability Engineer (SRE) specialising in distributed microservice systems. You analyse production incidents and produce precise, actionable root cause analysis reports.

The system you monitor has three Spring Boot microservices:
- PaymentService: handles payment processing and gateway calls
- OrderService: manages order lifecycle (CREATED → PAID → SHIPPED)
- InventoryService: tracks stock levels and reservations

Common failure patterns you should recognise:
- Gateway timeouts with client-side retries that lack idempotency keys → duplicate payments
- Non-atomic check-then-act inventory reads → race condition oversell (negative stock)
- Missing distributed transaction boundaries → orphaned payment without order update
- Async thread pool operations that lose MDC trace context → unlinked log entries
- Saga rollback failures → orders stuck in CREATED despite downstream failure

You will receive incident metadata and a sample of correlated log entries. Identify the exact root cause, assess impact, and recommend remediation.

CRITICAL: Respond with ONLY a single valid JSON object. No preamble. No markdown. No code fences. The JSON must match this schema exactly:

{
  "root_cause": "string — precise 1-3 sentence technical root cause",
  "impact_summary": "string — what failed, affected users/data, and business risk",
  "remediation_steps": [
    "string — actionable fix starting with an imperative verb"
  ],
  "automation_suggestions": [
    {
      "action": "string — uppercase identifier e.g. CREATE_GITHUB_ISSUE",
      "priority": "HIGH | MEDIUM | LOW",
      "description": "string — what this automates and why it helps"
    }
  ],
  "confidence_score": 0.0,
  "affected_components": ["string"],
  "pattern": "string — anti-pattern name e.g. missing-idempotency | race-condition | missing-transaction-boundary | async-context-loss | orphaned-record"
}

Rules:
- confidence_score: float 0.0–1.0
- remediation_steps: minimum 3 items
- automation_suggestions: minimum 1 item`;

// ─── Main entry point ─────────────────────────────────────────────────────────

function generateRCA(incident, logs, io) {
  if (!env.ANTHROPIC_API_KEY) {
    logger.warn('[RCA] Skipping — ANTHROPIC_API_KEY not configured');
    return Promise.resolve();
  }

  logger.info(`[RCA] Queued ${incident.incident_id} (${incident.type})`);
  return enqueue(() => _runRCA(incident, logs, io));
}

async function _runRCA(incident, logs, io) {
  const startTime = Date.now();
  logger.info(`[RCA] Analysing ${incident.incident_id} (${incident.type} / ${incident.severity})`);

  try {
    // Move to ANALYZING so the dashboard shows progress
    await db.run(
      `UPDATE incidents SET status = 'ANALYZING' WHERE incident_id = ?`,
      [incident.incident_id]
    );
    if (io) {
      io.emit('incident_update', { incident_id: incident.incident_id, status: 'ANALYZING' });
    }

    // Retrieve similar past incidents from RAG memory
    const similarIncidents = await findSimilarIncidents(incident);

    // Build user message
    const userPrompt = buildUserPrompt(incident, logs, similarIncidents);

    // Call Claude with adaptive thinking + cached system prompt
    const client = getClient();
    const stream = client.messages.stream({
      model:      'claude-opus-4-7',
      max_tokens: 8192,
      thinking:   { type: 'adaptive' },
      system: [
        {
          type:          'text',
          text:          SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userPrompt },
      ],
    });

    // Retry once on 429 after the Retry-After header delay (or 60s fallback)
    let message;
    try {
      message = await stream.finalMessage();
    } catch (e) {
      if (e.status === 429) {
        const retryAfter = parseInt(e.headers?.['retry-after'] || '60', 10) * 1000;
        logger.warn(`[RCA] Rate limited — retrying in ${retryAfter / 1000}s`);
        await new Promise(r => setTimeout(r, retryAfter));
        const retryStream = getClient().messages.stream({
          model: 'claude-opus-4-7', max_tokens: 8192, thinking: { type: 'adaptive' },
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: userPrompt }],
        });
        message = await retryStream.finalMessage();
      } else {
        throw e;
      }
    }
    const elapsed = Date.now() - startTime;

    logger.info(
      `[RCA] Response in ${elapsed}ms | ` +
      `in=${message.usage?.input_tokens ?? '?'} ` +
      `out=${message.usage?.output_tokens ?? '?'} ` +
      `cache_read=${message.usage?.cache_read_input_tokens ?? 0} ` +
      `cache_write=${message.usage?.cache_creation_input_tokens ?? 0}`
    );

    // Parse structured JSON from the text block
    const rca = extractAndParseRCA(message);

    // Persist the report
    const report_id = uuidv4();
    await db.run(
      `INSERT INTO rca_reports
         (report_id, incident_id, root_cause, impact_summary, remediation_steps,
          automation_suggestions, similar_incidents, confidence_score, model_used, token_usage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        report_id,
        incident.incident_id,
        rca.root_cause,
        rca.impact_summary,
        JSON.stringify(rca.remediation_steps),
        JSON.stringify(rca.automation_suggestions),
        JSON.stringify(
          similarIncidents.map(s => ({
            type:       s.incident_type,
            summary:    s.incident_summary,
            resolution: s.remediation,
          }))
        ),
        rca.confidence_score,
        'claude-opus-4-7',
        JSON.stringify({
          input_tokens:        message.usage?.input_tokens,
          output_tokens:       message.usage?.output_tokens,
          cache_read_tokens:   message.usage?.cache_read_input_tokens,
          cache_write_tokens:  message.usage?.cache_creation_input_tokens,
        }),
      ]
    );

    // Seed RAG memory so future incidents benefit from this analysis
    await seedMemory(incident, rca);

    // Push rca_complete event to all connected dashboard clients
    if (io) {
      io.emit('rca_complete', {
        incident_id:            incident.incident_id,
        report_id,
        root_cause:             rca.root_cause,
        impact_summary:         rca.impact_summary,
        confidence_score:       rca.confidence_score,
        remediation_steps:      rca.remediation_steps,
        automation_suggestions: rca.automation_suggestions,
        affected_components:    rca.affected_components,
        pattern:                rca.pattern,
        similar_count:          similarIncidents.length,
      });
    }

    logger.info(
      `[RCA] ✅ Complete for ${incident.incident_id} | ` +
      `confidence=${rca.confidence_score} pattern=${rca.pattern}`
    );

  } catch (err) {
    logger.error(`[RCA] Failed for ${incident.incident_id}: ${err.message}`);

    // Revert so the incident doesn't get permanently stuck in ANALYZING
    await db.run(
      `UPDATE incidents SET status = 'OPEN' WHERE incident_id = ?`,
      [incident.incident_id]
    ).catch(() => {});

    if (io) {
      io.emit('incident_update', { incident_id: incident.incident_id, status: 'OPEN' });
    }
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildUserPrompt(incident, logs, similarIncidents) {
  const affectedServices = safeParseArray(incident.affected_services);

  // Prioritise error logs, then fill with context logs — cap at 20 total
  const errorLogs  = logs.filter(l => l.error_type);
  const otherLogs  = logs.filter(l => !l.error_type);
  const selected   = [...errorLogs.slice(0, 8), ...otherLogs.slice(0, 12)].slice(0, 20);

  const logBlock = selected.length > 0
    ? selected.map(l =>
        `[${l.timestamp}] ${(l.level || 'INFO').padEnd(5)} ` +
        `${(l.service || '?').padEnd(18)} ` +
        (l.error_type ? `[${l.error_type}] ` : '') +
        (l.message || '')
      ).join('\n')
    : 'No logs available for this trace.';

  const ragBlock = similarIncidents.length > 0
    ? similarIncidents.map((s, i) =>
        `${i + 1}. Type: ${s.incident_type}\n` +
        `   Summary: ${s.incident_summary || 'N/A'}\n` +
        `   Past fix: ${s.remediation || 'N/A'}`
      ).join('\n\n')
    : 'No similar past incidents found in memory.';

  return `## Incident
- ID:                ${incident.incident_id}
- Type:              ${incident.type}
- Severity:          ${incident.severity}
- Title:             ${incident.title}
- Description:       ${incident.description || 'N/A'}
- Affected Services: ${affectedServices.join(', ') || 'Unknown'}
- First Seen:        ${incident.first_seen}
- Log Count:         ${incident.log_count}

## Correlated Logs (${selected.length} of ${logs.length})
\`\`\`
${logBlock}
\`\`\`

## Historical Context
${ragBlock}

Produce the RCA JSON report.`;
}

// ─── Response parser ──────────────────────────────────────────────────────────

function extractAndParseRCA(message) {
  // Skip thinking blocks — only the text block contains the JSON
  const textBlock = message.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('No text block in Claude response');

  let text = textBlock.text.trim();

  // Strip markdown code fences if Claude added them despite instructions
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();

  // Extract outermost JSON object
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in response');

  const parsed = JSON.parse(text.slice(start, end + 1));

  return {
    root_cause:             String(parsed.root_cause              || 'Root cause under investigation'),
    impact_summary:         String(parsed.impact_summary          || 'Impact assessment pending'),
    remediation_steps:      Array.isArray(parsed.remediation_steps)      ? parsed.remediation_steps      : [],
    automation_suggestions: Array.isArray(parsed.automation_suggestions)  ? parsed.automation_suggestions  : [],
    confidence_score:       typeof parsed.confidence_score === 'number'
                              ? Math.min(1, Math.max(0, parsed.confidence_score))
                              : 0.75,
    affected_components:    Array.isArray(parsed.affected_components)     ? parsed.affected_components     : [],
    pattern:                String(parsed.pattern || 'unknown'),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch { return [String(value)]; }
}

module.exports = { generateRCA };
