'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Brain, CheckCircle, RefreshCw,
  Layers, Clock, Hash, Server,
} from 'lucide-react';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import {
  timeAgo,
  formatTimestamp,
  severityBadgeClass,
  statusBadgeClass,
  confidenceLabel,
  confidenceColor,
  safeParseJSON,
  incidentTypeLabel,
  severityDotClass,
} from '@/lib/utils';
import type { Incident, RCAReport, LogEntry, AutomationAction } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Detail {
  incident: Incident;
  rca:      RCAReport | null;
  logs:     LogEntry[];
  actions:  AutomationAction[];
}

type Tab = 'rca' | 'logs';

interface AutomationSuggestion {
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function IncidentDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router  = useRouter();
  const { socket } = useSocket();

  const [data,       setData]       = useState<Detail | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState<Tab>('rca');
  const [resolving,  setResolving]  = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  // ─── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    api.getIncident(id)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  // ─── Real-time updates ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!socket) return;

    const onRca = async (ev: { incident_id: string }) => {
      if (ev.incident_id !== id) return;
      const fresh = await api.getIncident(id).catch(() => null);
      if (fresh) { setData(fresh); setReanalyzing(false); }
    };

    const onUpdate = (u: { incident_id: string; status?: string }) => {
      if (u.incident_id !== id) return;
      setData(prev => prev ? { ...prev, incident: { ...prev.incident, ...u } as Incident } : null);
    };

    socket.on('rca_complete',    onRca);
    socket.on('incident_update', onUpdate);
    return () => {
      socket.off('rca_complete',    onRca);
      socket.off('incident_update', onUpdate);
    };
  }, [socket, id]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleResolve = async () => {
    setResolving(true);
    try {
      await api.resolveIncident(id);
      setData(prev => prev ? { ...prev, incident: { ...prev.incident, status: 'RESOLVED' } } : null);
    } finally {
      setResolving(false);
    }
  };

  const handleReanalyze = async () => {
    setReanalyzing(true);
    await api.reanalyze(id).catch(() => setReanalyzing(false));
    // rca_complete socket event will update state
  };

  // ─── Loading / error states ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-slate-500 text-sm">
        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        Loading incident…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
        <Hash className="w-8 h-8 opacity-30" />
        <p className="text-sm">Incident not found</p>
        <button onClick={() => router.back()} className="btn-ghost text-xs">← Go back</button>
      </div>
    );
  }

  const { incident, rca, logs } = data;
  const services        = safeParseJSON<string[]>(incident.affected_services, []);
  const remSteps        = safeParseJSON<string[]>(rca?.remediation_steps ?? null, []);
  const autoSuggestions = safeParseJSON<AutomationSuggestion[]>(rca?.automation_suggestions ?? null, []);
  const tokenUsage      = safeParseJSON<{ input_tokens?: number; output_tokens?: number; cache_read_tokens?: number }>(
    rca?.token_usage ?? null, {}
  );

  const isAnalyzing = incident.status === 'ANALYZING' || reanalyzing;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-6 py-3.5 border-b border-[#1f2937] flex items-center gap-3 shrink-0">
        <button onClick={() => router.back()} className="btn-ghost px-2 py-1.5 shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-slate-500 shrink-0">{incident.incident_id}</span>
          <span className={`badge ${severityBadgeClass(incident.severity)} shrink-0`}>
            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${severityDotClass(incident.severity)}`} />
            {incident.severity}
          </span>
          <span className={`badge ${statusBadgeClass(incident.status)} shrink-0`}>
            {isAnalyzing && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse mr-1.5" />}
            {incident.status}
          </span>
          <span className="text-slate-300 font-medium text-sm truncate">{incident.title}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReanalyze}
            disabled={isAnalyzing || incident.status === 'RESOLVED'}
            className="btn-ghost disabled:opacity-40 text-indigo-400 hover:text-indigo-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAnalyzing ? 'animate-spin' : ''}`} />
            {isAnalyzing ? 'Analysing…' : 'Re-analyse'}
          </button>
          {incident.status !== 'RESOLVED' && (
            <button onClick={handleResolve} disabled={resolving} className="btn-primary">
              <CheckCircle className="w-3.5 h-3.5" />
              {resolving ? 'Resolving…' : 'Resolve'}
            </button>
          )}
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 min-h-0">

        {/* Meta row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Hash,   label: 'Type',              value: incidentTypeLabel(incident.type), mono: true },
            { icon: Server, label: 'Affected Services',  value: services.join(', ') || '—',        mono: false },
            { icon: Clock,  label: 'First Seen',         value: timeAgo(incident.first_seen),      mono: false },
            { icon: Layers, label: 'Correlated Logs',    value: `${incident.log_count} entries`,   mono: false },
          ].map(({ icon: Icon, label, value, mono }) => (
            <div key={label} className="card px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3 h-3 text-slate-600" />
                <p className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</p>
              </div>
              <p className={`text-sm text-slate-200 font-medium truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Description */}
        {incident.description && (
          <div className="card p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Description</p>
            <p className="text-sm text-slate-300 leading-relaxed">{incident.description}</p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-[#1f2937]">
          {([
            { key: 'rca',  label: 'AI Root Cause Analysis', icon: Brain,  badge: rca ? `${Math.round(rca.confidence_score * 100)}%` : null },
            { key: 'logs', label: 'Correlated Logs',         icon: Layers, badge: `${logs.length}` },
          ] as const).map(({ key, label, icon: Icon, badge }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === key
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {badge && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  tab === key ? 'bg-indigo-500/20 text-indigo-300' : 'bg-white/5 text-slate-500'
                }`}>{badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── RCA tab ──────────────────────────────────────────────────────── */}
        {tab === 'rca' && (
          <div className="space-y-4 animate-fade-in">
            {!rca ? (
              /* No RCA yet */
              <div className="card p-12 flex flex-col items-center text-center">
                {isAnalyzing ? (
                  <>
                    <div className="w-10 h-10 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin mb-4" />
                    <p className="text-slate-200 font-medium">Claude is analysing this incident</p>
                    <p className="text-slate-500 text-sm mt-1">Typically completes in 10–30 seconds</p>
                    <div className="mt-4 flex gap-1.5">
                      {['Fetching logs', 'Building context', 'Calling Claude'].map((s, i) => (
                        <span key={s} className="text-xs text-slate-600 flex items-center gap-1">
                          {i > 0 && <span className="text-slate-700">→</span>}
                          <span className="text-indigo-400">{s}</span>
                        </span>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <Brain className="w-10 h-10 text-slate-700 mb-4" />
                    <p className="text-slate-400 mb-4">No RCA report generated yet</p>
                    <button onClick={handleReanalyze} className="btn-primary">
                      <Brain className="w-3.5 h-3.5" />
                      Generate AI Analysis
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                {/* Root cause + confidence */}
                <div className="card p-5">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm font-semibold text-slate-200">Root Cause</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium ${confidenceColor(rca.confidence_score)}`}>
                        {confidenceLabel(rca.confidence_score)}
                      </span>
                      <div className="w-28 h-1.5 bg-[#1f2937] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full transition-all duration-700"
                          style={{ width: `${rca.confidence_score * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono font-bold ${confidenceColor(rca.confidence_score)}`}>
                        {Math.round(rca.confidence_score * 100)}%
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-slate-200 leading-relaxed font-medium">{rca.root_cause}</p>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">{rca.impact_summary}</p>

                  <div className="mt-3 pt-3 border-t border-[#1f2937] flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1">
                      <Brain className="w-3 h-3" /> {rca.model_used}
                    </span>
                    <span>Generated {timeAgo(rca.generated_at)}</span>
                    {tokenUsage.input_tokens && (
                      <span>
                        {tokenUsage.input_tokens.toLocaleString()} in / {tokenUsage.output_tokens?.toLocaleString()} out
                        {tokenUsage.cache_read_tokens ? ` · ${tokenUsage.cache_read_tokens.toLocaleString()} cached` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Remediation steps */}
                {remSteps.length > 0 && (
                  <div className="card p-5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-4">Remediation Steps</p>
                    <ol className="space-y-3">
                      {remSteps.map((step, i) => (
                        <li key={i} className="flex gap-3 items-start">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600/20 text-indigo-400 text-xs flex items-center justify-center font-semibold mt-0.5">
                            {i + 1}
                          </span>
                          <span className="text-sm text-slate-300 leading-snug">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Automation suggestions */}
                {autoSuggestions.length > 0 && (
                  <div className="card p-5">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-4">Automation Suggestions</p>
                    <div className="space-y-2">
                      {autoSuggestions.map((s, i) => (
                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-black/20 border border-[#1f2937]">
                          <span className={`badge shrink-0 text-[10px] mt-0.5 ${
                            s.priority === 'HIGH'   ? 'bg-red-500/15    text-red-400    border-red-500/20' :
                            s.priority === 'MEDIUM' ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20' :
                                                      'bg-green-500/15  text-green-400  border-green-500/20'
                          } border`}>
                            {s.priority}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-mono text-indigo-300">{s.action}</p>
                            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{s.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Logs tab ─────────────────────────────────────────────────────── */}
        {tab === 'logs' && (
          <div className="animate-fade-in">
            <div className="terminal overflow-y-auto" style={{ maxHeight: '520px' }}>
              {logs.length === 0 ? (
                <p className="text-slate-600 text-xs">No logs found for trace {incident.trace_id || '(no trace)'}</p>
              ) : (
                logs.map(log => (
                  <div
                    key={log.log_id}
                    className={`py-0.5 leading-relaxed ${
                      log.error_type ? 'text-red-300'
                      : log.level === 'WARN' ? 'text-yellow-300'
                      : 'text-slate-400'
                    }`}
                  >
                    <span className="text-slate-600 select-none">{formatTimestamp(log.timestamp)} </span>
                    <span className={`${
                      log.level === 'ERROR' ? 'text-red-500'
                      : log.level === 'WARN' ? 'text-yellow-500'
                      : 'text-slate-600'
                    } select-none`}>{log.level.padEnd(5)} </span>
                    <span className="text-indigo-400/80">{(log.service ?? '?').padEnd(18)} </span>
                    {log.error_type && (
                      <span className="text-orange-400">[{log.error_type}] </span>
                    )}
                    <span>{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
