import axios from 'axios';
import type {
  IncidentsResponse,
  LogsResponse,
  IncidentDetailResponse,
  DashboardStats,
  AutomationAction,
} from '@/types';

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const client = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});

// ─── Incidents ────────────────────────────────────────────────────────────────

export const api = {
  // Dashboard stats
  getStats(): Promise<DashboardStats> {
    return client.get<DashboardStats>('/incidents/stats').then(r => r.data);
  },

  // Incident list
  getIncidents(params?: {
    status?: string;
    severity?: string;
    limit?: number;
  }): Promise<IncidentsResponse> {
    return client.get<IncidentsResponse>('/incidents', { params }).then(r => r.data);
  },

  // Single incident with RCA + logs + actions
  getIncident(id: string): Promise<IncidentDetailResponse> {
    return client.get<IncidentDetailResponse>(`/incidents/${id}`).then(r => r.data);
  },

  // Resolve an incident
  resolveIncident(id: string): Promise<void> {
    return client.post(`/incidents/${id}/resolve`).then(() => undefined);
  },

  // Trigger a fresh RCA run
  reanalyze(id: string): Promise<void> {
    return client.post(`/incidents/${id}/reanalyze`).then(() => undefined);
  },

  // ─── Logs ──────────────────────────────────────────────────────────────────
  getLogs(params?: {
    trace_id?: string;
    error_type?: string;
    limit?: number;
  }): Promise<LogsResponse> {
    return client.get<LogsResponse>('/logs', { params }).then(r => r.data);
  },

  getTraceLog(traceId: string): Promise<LogsResponse> {
    return client.get<LogsResponse>(`/logs/trace/${traceId}`).then(r => r.data);
  },

  // ─── Automation ────────────────────────────────────────────────────────────
  getAutomationHistory(): Promise<{ actions: AutomationAction[] }> {
    return client.get('/automation').then(r => r.data);
  },

  triggerAutomation(incidentId: string, actionType: string): Promise<void> {
    return client.post('/automation/trigger', {
      incident_id: incidentId,
      action_type: actionType,
    }).then(() => undefined);
  },

  // ─── Health ────────────────────────────────────────────────────────────────
  health(): Promise<{ status: string }> {
    return client.get('/health').then(r => r.data);
  },
};
