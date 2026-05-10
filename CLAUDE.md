# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

HackSys is an AI-powered incident monitoring and self-healing platform built on top of an intentionally buggy Spring Boot e-commerce backend (`hackathonps.onrender.com`). It polls that backend for structured JSON logs, detects incidents, runs Claude-powered RCA, and triggers automations (Slack alerts, GitHub issues).

The Spring Boot backend is **external and read-only** — we never modify it. All our code lives in two local services:

- `incident-backend/` — Node.js/Express/Socket.io API + background services (port 3001)
- `incident-dashboard/` — Next.js 14 App Router frontend (port 3000)

## Commands

### Backend (`incident-backend/`)
```bash
npm run dev       # nodemon hot-reload (development)
npm start         # node server.js (production)
```

### Dashboard (`incident-dashboard/`)
```bash
npm run dev       # Next.js dev server with hot-reload
npm run build     # Production build
npm run lint      # ESLint via next lint
npx tsc --noEmit  # Type-check without emitting (run before committing)
```

Both services must run simultaneously. The dashboard connects to the backend via HTTP (`localhost:3001`) and WebSocket.

## Environment setup

Copy `incident-backend/.env.example` to `incident-backend/.env` and fill in:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API — required for RCA |
| `BACKEND_URL` | Spring Boot log source (default: `https://hackathonps.onrender.com`) |
| `POLL_INTERVAL` | Log polling interval in ms (default: 20000) |
| `SLACK_WEBHOOK_URL` | Slack automation (optional) |
| `GITHUB_TOKEN` + `GITHUB_REPO` | GitHub issue automation (optional) |

The dashboard needs `incident-dashboard/.env.local` with:
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

## Architecture

### Data flow

```
Spring Boot backend (hackathonps.onrender.com)
  → logPoller (polls /logs every POLL_INTERVAL)
    → incidentDetector (rule-based pattern matching → creates incidents)
      → rcaEngine (Claude API → structured JSON RCA)
        → automationService (Slack / GitHub / simulated)
  → Socket.io events → Next.js dashboard (real-time updates)
```

### Backend service layer (`incident-backend/src/services/`)

- **`logPoller.js`** — Fetches logs from Spring Boot backend, deduplicates by SHA-256 content hash, batch-inserts via `db.client.batch()`, hands new logs to `incidentDetector`.
- **`incidentDetector.js`** — Rule table (`INCIDENT_RULES`) maps `error_type` values to incident types. Suppresses duplicates by checking for existing OPEN/ANALYZING incidents with the same `trace_id + type`. Triggers RCA async after creating an incident.
- **`rcaEngine.js`** — Serial queue (one RCA at a time, 500ms gap). Calls `claude-sonnet-4-20250514` with a cached system prompt, `max_tokens: 2000`. Parses a strict JSON schema from the response. Auto-triggers HIGH-priority `automation_suggestions` after completion. Retries on 429 with exponential backoff (up to 4 retries, 15s→120s).
- **`ragService.js`** — Keyword-based similarity search over `rag_memory` table. Seeds memory after each RCA. No vector DB — pure SQLite keyword overlap scoring.
- **`automationService.js`** — Dispatches to `createGitHubIssue`, `sendSlackAlert`, or `simulateAction`. Matching is flexible: action types containing "GITHUB"/"ISSUE" → GitHub, containing "SLACK"/"NOTIFY" → Slack. Tracks all actions in `automation_actions` table with PENDING→SUCCESS/FAILED lifecycle.

### Database (`@libsql/client`, file-based SQLite)

**Critical constraint**: Node.js v24 on Windows has no prebuilt binaries for `better-sqlite3`. Always use `@libsql/client` with its async API (`db.all`, `db.get`, `db.run`). The raw client is exposed as `db.client` for batch operations.

Tables: `logs`, `incidents`, `rca_reports`, `automation_actions`, `rag_memory`

Foreign key order for deletes: `automation_actions` → `rca_reports` → `incidents` (child before parent).

### Routes (`incident-backend/src/routes/`)

All incident/automation routes are factory functions that receive `io` (Socket.io instance):
```js
app.use('/api/incidents', require('./src/routes/incidents')(io));
app.use('/api/automation', require('./src/routes/automation')(io));
```

The `GET /api/incidents` route bulk-fetches the latest RCA for all incidents in a single JOIN query (not N+1).

### Frontend (`incident-dashboard/src/`)

- **`app/dashboard/page.tsx`** — Main incident list. Client-side search filters by incident ID, title, and type against the already-loaded list. Socket events (`new_incident`, `incident_update`, `stats_update`, `rca_complete`) update state directly without re-fetching.
- **`app/dashboard/incidents/[id]/page.tsx`** — Incident detail with three tabs: RCA, Logs, Automation. Automation suggestions have "Run" buttons that call `POST /api/automation/trigger`. `automation_done` socket events update the actions list live.
- **`lib/api.ts`** — Axios client with 30s timeout (Claude RCA can take 15–25s).
- **`hooks/useSocket.ts`** — Singleton Socket.io connection to `NEXT_PUBLIC_BACKEND_URL`.

### Socket.io events

| Event | Direction | Payload |
|---|---|---|
| `new_incident` | server→client | full incident object |
| `incident_update` | server→client | `{ incident_id, status?, log_count?, last_seen? }` |
| `rca_complete` | server→client | `{ incident_id, report_id, root_cause, ... }` |
| `automation_done` | server→client | `{ incident_id, action }` |
| `stats_update` | server→client | `{ total, open, critical, resolved, analyzing }` |

## Claude API usage notes

- Model: `claude-sonnet-4-20250514`, `max_tokens: 2000`
- System prompt is marked `cache_control: { type: 'ephemeral' }` for 5-min prompt caching
- The RCA response must be a single valid JSON object (no markdown, no fences) — the parser extracts the outermost `{...}` and strips fences if Claude adds them
- If `stop_reason === 'max_tokens'`, the engine throws immediately rather than passing truncated JSON to the parser
- Automation action names from Claude are unpredictable — the dispatcher uses `includes()` matching, not exact equality. The system prompt instructs Claude to use `SEND_SLACK_ALERT` and `CREATE_GITHUB_ISSUE` as the first two suggestions
- Workspace rate limits must be set in [console.anthropic.com](https://console.anthropic.com) — a 0 RPM workspace limit causes all calls to fail with 429
