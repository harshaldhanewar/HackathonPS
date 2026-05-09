// ─── Log Entry ───────────────────────────────────────────────────────────────
export interface LogEntry {
  id: number;
  log_id: string;
  timestamp: string;
  trace_id: string | null;
  service: string | null;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  error_type: string | null;
  message: string;
  raw_json: string;
  created_at: string;
}

// ─── Incident ─────────────────────────────────────────────────────────────────
export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus   = 'OPEN' | 'ANALYZING' | 'RESOLVED';

export type IncidentType =
  | 'GATEWAY_TIMEOUT'
  | 'DUPLICATE_PAYMENT_DETECTED'
  | 'ORDER_UPDATE_FAILURE'
  | 'NEGATIVE_STOCK'
  | 'INCONSISTENT_STATE'
  | 'ASYNC_TRACE_LOSS'
  | 'UNKNOWN';

export interface Incident {
  id: number;
  incident_id: string;
  trace_id: string | null;
  type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  affected_services: string;         // JSON array string
  log_count: number;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
  created_at: string;
  rca: RCAReport | null;             // joined from rca_reports
}

// ─── RCA Report ───────────────────────────────────────────────────────────────
export interface RCAReport {
  id: number;
  report_id: string;
  incident_id: string;
  root_cause: string;
  impact_summary: string;
  remediation_steps: string;         // JSON array string
  automation_suggestions: string;    // JSON array string
  similar_incidents: string;         // JSON array string
  confidence_score: number;          // 0–1
  model_used: string;
  token_usage: string;               // JSON string
  generated_at: string;
}

export interface RemediationStep {
  step: number;
  action: string;
  priority: 'IMMEDIATE' | 'SHORT_TERM' | 'LONG_TERM';
}

export interface SimilarIncident {
  type: string;
  summary: string;
  resolution: string;
  similarity: number;                // 0–1
}

// ─── Automation Action ────────────────────────────────────────────────────────
export type ActionType =
  | 'SLACK_ALERT'
  | 'GITHUB_ISSUE'
  | 'RESTART_SIMULATION'
  | 'SCALING_SIMULATION';

export type ActionStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface AutomationAction {
  id: number;
  action_id: string;
  incident_id: string;
  action_type: ActionType;
  status: ActionStatus;
  input_data: string;                // JSON string
  result_data: string | null;        // JSON string
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────
export interface DashboardStats {
  total: number;
  open: number;
  critical: number;
  resolved: number;
  analyzing: number;
}

// ─── API Responses ────────────────────────────────────────────────────────────
export interface IncidentsResponse {
  incidents: Incident[];
  total: number;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
}

export interface IncidentDetailResponse {
  incident: Incident;
  rca: RCAReport | null;
  logs: LogEntry[];
  actions: AutomationAction[];
}

// ─── WebSocket Events ─────────────────────────────────────────────────────────
export interface WSNewIncident {
  incident: Incident;
}

export interface WSIncidentUpdate {
  incident_id: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
}

export interface WSRCAComplete {
  incident_id: string;
  rca: RCAReport;
}

export interface WSAutomationDone {
  incident_id: string;
  action: AutomationAction;
}

export interface WSStatsUpdate {
  total: number;
  open: number;
  critical: number;
  resolved: number;
}

// ─── Timeline Event (for visualization) ──────────────────────────────────────
export interface TimelineEvent {
  id: string;
  timestamp: string;
  service: string;
  event: string;
  severity: 'info' | 'warn' | 'error';
  trace_id: string | null;
}
