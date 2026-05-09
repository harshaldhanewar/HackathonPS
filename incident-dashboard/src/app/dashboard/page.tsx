'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ChevronRight, RefreshCw } from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import {
  timeAgo,
  severityBadgeClass,
  statusBadgeClass,
  severityDotClass,
  incidentTypeLabel,
  safeParseJSON,
} from '@/lib/utils';
import type { Incident, DashboardStats } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type SeverityFilter = 'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type StatusFilter   = 'ALL' | 'OPEN' | 'ANALYZING' | 'RESOLVED';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const { socket, connected } = useSocket();

  const [stats,    setStats]    = useState<DashboardStats>({ total: 0, open: 0, critical: 0, resolved: 0, analyzing: 0 });
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [severity, setSeverity] = useState<SeverityFilter>('ALL');
  const [status,   setStatus]   = useState<StatusFilter>('OPEN');
  const [lastAt,   setLastAt]   = useState(new Date());

  // ─── Data loading ───────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    try {
      const [s, inc] = await Promise.all([
        api.getStats(),
        api.getIncidents({
          severity: severity !== 'ALL' ? severity : undefined,
          status:   status   !== 'ALL' ? status   : undefined,
          limit:    200,
        }),
      ]);
      setStats(s);
      setIncidents(inc.incidents);
      setLastAt(new Date());
    } catch (e) {
      console.error('[Dashboard] load error', e);
    } finally {
      setLoading(false);
    }
  }, [severity, status]);

  useEffect(() => { load(); }, [load]);

  // ─── Socket events ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onNew = (inc: Incident) => {
      setIncidents(prev => [inc, ...prev]);
      setStats(prev => ({
        ...prev,
        total:    prev.total + 1,
        open:     prev.open  + 1,
        critical: inc.severity === 'CRITICAL' ? prev.critical + 1 : prev.critical,
      }));
      setLastAt(new Date());
    };

    const onUpdate = (u: { incident_id: string; status?: string; log_count?: number; last_seen?: string }) => {
      setIncidents(prev =>
        prev.map(i => i.incident_id === u.incident_id ? { ...i, ...u } as Incident : i)
      );
      setLastAt(new Date());
    };

    const onStats = (s: DashboardStats) => setStats(s);

    const onRca = (d: { incident_id: string }) => {
      // Re-fetch the single incident to get the attached RCA
      api.getIncident(d.incident_id)
        .then(detail => setIncidents(prev =>
          prev.map(i => i.incident_id === d.incident_id ? { ...detail.incident, rca: detail.rca } : i)
        ))
        .catch(() => {});
    };

    socket.on('new_incident',    onNew);
    socket.on('incident_update', onUpdate);
    socket.on('stats_update',    onStats);
    socket.on('rca_complete',    onRca);

    return () => {
      socket.off('new_incident',    onNew);
      socket.off('incident_update', onUpdate);
      socket.off('stats_update',    onStats);
      socket.off('rca_complete',    onRca);
    };
  }, [socket]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const SEVERITIES: SeverityFilter[] = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  const STATUSES:   StatusFilter[]   = ['ALL', 'OPEN', 'ANALYZING', 'RESOLVED'];

  const statCards = [
    { label: 'Total',     value: stats.total,    color: 'text-slate-100' },
    { label: 'Open',      value: stats.open,     color: 'text-blue-400' },
    { label: 'Critical',  value: stats.critical, color: 'text-red-400' },
    { label: 'Analyzing', value: stats.analyzing,color: 'text-purple-400' },
    { label: 'Resolved',  value: stats.resolved, color: 'text-green-400' },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1f2937] flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-base font-semibold text-white">Incident Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">Updated {timeAgo(lastAt.toISOString())}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-slate-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
            {connected ? 'LIVE' : 'Reconnecting'}
          </span>
          <button onClick={load} className="btn-ghost p-1.5" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="px-6 py-4 grid grid-cols-5 gap-3 shrink-0">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="px-6 pb-3 flex items-center gap-4 shrink-0 flex-wrap">
        {/* Severity pills */}
        <div className="flex items-center gap-1">
          {SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => setSeverity(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                severity === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-[#1f2937] shrink-0" />
        {/* Status pills */}
        <div className="flex items-center gap-1">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                status === s ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-slate-500 shrink-0">{incidents.length} shown</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-500 text-sm gap-2">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading incidents…
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
            <Activity className="w-8 h-8 opacity-30" />
            <p className="text-sm">No incidents match the current filters</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1f2937] text-left">
                  {['Severity', 'Type', 'Title', 'Services', 'First Seen', 'Status', 'RCA', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2937]">
                {incidents.map(inc => (
                  <IncidentRow key={inc.incident_id} inc={inc} onClick={() => router.push(`/dashboard/incidents/${inc.incident_id}`)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Incident row ─────────────────────────────────────────────────────────────

function IncidentRow({ inc, onClick }: { inc: Incident; onClick: () => void }) {
  const services = safeParseJSON<string[]>(inc.affected_services, []);

  return (
    <tr onClick={onClick} className="incident-row cursor-pointer animate-fade-in group">
      {/* Severity */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`badge ${severityBadgeClass(inc.severity)} ${inc.severity === 'CRITICAL' ? 'glow-critical' : ''}`}>
          <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${severityDotClass(inc.severity)} ${inc.severity === 'CRITICAL' ? 'animate-pulse' : ''}`} />
          {inc.severity}
        </span>
      </td>

      {/* Type */}
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-slate-400">{incidentTypeLabel(inc.type)}</span>
      </td>

      {/* Title */}
      <td className="px-4 py-3 max-w-xs">
        <p className="text-slate-200 font-medium leading-snug truncate">{inc.title}</p>
        <p className="text-[10px] text-slate-600 font-mono mt-0.5">{inc.incident_id}</p>
      </td>

      {/* Services */}
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {services.map(s => (
            <span key={s} className="badge bg-[#1a2035] text-slate-500 text-[10px] border border-[#1f2937]">{s}</span>
          ))}
        </div>
      </td>

      {/* First seen */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs text-slate-400">{timeAgo(inc.first_seen)}</span>
      </td>

      {/* Status */}
      <td className="px-4 py-3 whitespace-nowrap">
        <span className={`badge ${statusBadgeClass(inc.status)}`}>
          {inc.status === 'ANALYZING' && (
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse mr-1.5" />
          )}
          {inc.status}
        </span>
      </td>

      {/* RCA */}
      <td className="px-4 py-3 whitespace-nowrap">
        {inc.rca ? (
          <span className="badge bg-green-500/10 text-green-400 border border-green-500/20 text-[10px]">
            ✓ {Math.round((inc.rca as { confidence_score: number }).confidence_score * 100)}%
          </span>
        ) : (
          <span className="text-xs text-slate-600">—</span>
        )}
      </td>

      {/* Arrow */}
      <td className="px-4 py-3">
        <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" />
      </td>
    </tr>
  );
}
