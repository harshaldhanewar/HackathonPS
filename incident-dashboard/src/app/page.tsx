'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  Brain,
  Database,
  GitBranch,
  Radio,
  Shield,
  Terminal,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from 'lucide-react';

interface ServiceStatus {
  name: string;
  status: 'UP' | 'DOWN' | 'DEGRADED' | 'CHECKING';
  icon: React.ReactNode;
  description: string;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

export default function HomePage() {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: 'Node.js Backend',    status: 'CHECKING', icon: <Zap size={16} />,      description: 'Express API + Socket.io' },
    { name: 'Claude AI (RCA)',    status: 'CHECKING', icon: <Brain size={16} />,     description: 'Root Cause Analysis engine' },
    { name: 'SQLite Database',    status: 'CHECKING', icon: <Database size={16} />,  description: 'Incidents + logs storage' },
    { name: 'Log Poller',         status: 'CHECKING', icon: <Radio size={16} />,     description: 'Spring Boot backend polling' },
    { name: 'RAG Memory',         status: 'CHECKING', icon: <GitBranch size={16} />, description: 'Similar incident retrieval' },
    { name: 'Spring Boot Source', status: 'CHECKING', icon: <Terminal size={16} />,  description: 'hackathonps.onrender.com' },
  ]);

  const [backendReady, setBackendReady] = useState(false);
  const [checkDone, setCheckDone] = useState(false);

  useEffect(() => {
    checkHealth();
  }, []);

  async function checkHealth() {
    try {
      const res = await fetch(`${BACKEND_URL}/health`);
      if (res.ok) {
        const data = await res.json();
        setBackendReady(true);

        setServices([
          {
            name: 'Node.js Backend',
            status: data.status === 'UP' ? 'UP' : 'DOWN',
            icon: <Zap size={16} />,
            description: 'Express API + Socket.io',
          },
          {
            name: 'Claude AI (RCA)',
            status: data.services?.ai === 'UP' ? 'UP' : 'DEGRADED',
            icon: <Brain size={16} />,
            description: data.services?.ai === 'UP' ? 'ANTHROPIC_API_KEY set' : 'Set ANTHROPIC_API_KEY to enable',
          },
          {
            name: 'SQLite Database',
            status: data.services?.database === 'UP' ? 'UP' : 'DOWN',
            icon: <Database size={16} />,
            description: 'Incidents + logs storage',
          },
          {
            name: 'Log Poller',
            status: 'UP',
            icon: <Radio size={16} />,
            description: 'Polls /logs every 20s',
          },
          {
            name: 'RAG Memory',
            status: data.services?.rag === 'UP' ? 'UP' : 'DEGRADED',
            icon: <GitBranch size={16} />,
            description: 'Similar incident retrieval',
          },
          {
            name: 'Spring Boot Source',
            status: 'UP',
            icon: <Terminal size={16} />,
            description: 'hackathonps.onrender.com',
          },
        ]);
      } else {
        markAllDown();
      }
    } catch {
      markAllDown();
    } finally {
      setCheckDone(true);
    }
  }

  function markAllDown() {
    setServices(prev =>
      prev.map(s => ({
        ...s,
        status: 'DOWN' as const,
        description: s.name === 'Node.js Backend'
          ? 'Run: cd incident-backend && npm run dev'
          : s.description,
      }))
    );
  }

  const upCount = services.filter(s => s.status === 'UP').length;

  return (
    <div className="min-h-screen grid-bg flex flex-col">
      {/* Header */}
      <header className="border-b border-[#1f2937] bg-[#0a0d14]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center glow-primary">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <span className="font-semibold text-white text-sm">HackSys AI</span>
              <span className="text-slate-500 text-xs ml-2">Incident Assistant</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`status-dot-pulse ${backendReady ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs text-slate-400">
              {backendReady ? 'System Online' : 'Backend Offline'}
            </span>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 max-w-6xl mx-auto px-6 py-16 w-full">
        {/* Title */}
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium mb-6">
            <Activity size={12} />
            AI-Powered Observability Platform
          </div>

          <h1 className="text-5xl font-bold text-white mb-4 tracking-tight">
            Self-Healing
            <span className="text-indigo-400"> Incident </span>
            Assistant
          </h1>

          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed">
            Automatically detects incidents, generates root cause analysis using Claude AI,
            retrieves similar historical incidents, and triggers remediation workflows.
          </p>
        </div>

        {/* System Status Grid */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title">System Status</h2>
            <div className="flex items-center gap-2">
              {checkDone && (
                <span className="text-xs text-slate-500">
                  {upCount}/{services.length} services operational
                </span>
              )}
              <button
                onClick={checkHealth}
                className="btn-ghost text-xs"
              >
                <Activity size={12} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {services.map((svc) => (
              <ServiceCard key={svc.name} service={svc} />
            ))}
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mb-12">
          <h2 className="section-title mb-4">Platform Capabilities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-4">
                <div className="text-indigo-400 mb-2">{f.icon}</div>
                <div className="font-medium text-white text-sm mb-1">{f.title}</div>
                <div className="text-xs text-slate-500">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          {backendReady ? (
            <Link href="/dashboard" className="btn-primary text-base px-8 py-3">
              <Activity size={18} />
              Open Dashboard
            </Link>
          ) : (
            <div className="card-elevated p-6 max-w-lg mx-auto text-left">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <div className="font-medium text-white mb-2">Start the backend first</div>
                  <div className="terminal text-slate-400">
                    <div className="text-slate-500 mb-1"># Terminal 1 — Backend</div>
                    <div>cd incident-backend</div>
                    <div>npm install</div>
                    <div>cp .env.example .env  <span className="text-slate-600"># add your API key</span></div>
                    <div>npm run dev</div>
                    <div className="mt-2 text-slate-500"># Terminal 2 — Dashboard</div>
                    <div>cd incident-dashboard</div>
                    <div>npm install</div>
                    <div>npm run dev</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1f2937] py-4 text-center">
        <p className="text-xs text-slate-600">
          Powered by{' '}
          <span className="text-indigo-400">Claude AI</span>
          {' · '}
          <span className="text-slate-500">Next.js · Express · Socket.io · SQLite · ChromaDB</span>
        </p>
      </footer>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function ServiceCard({ service }: { service: ServiceStatus }) {
  const statusConfig = {
    UP:       { color: 'text-green-400',  bg: 'bg-green-500',  label: 'UP',       icon: <CheckCircle2 size={14} /> },
    DOWN:     { color: 'text-red-400',    bg: 'bg-red-500',    label: 'DOWN',     icon: <AlertTriangle size={14} /> },
    DEGRADED: { color: 'text-yellow-400', bg: 'bg-yellow-500', label: 'DEGRADED', icon: <AlertTriangle size={14} /> },
    CHECKING: { color: 'text-slate-400',  bg: 'bg-slate-500',  label: 'CHECKING', icon: <Clock size={14} /> },
  }[service.status];

  return (
    <div className="card p-4 flex items-start gap-3">
      <div className={`mt-0.5 ${statusConfig.color}`}>{service.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-sm font-medium text-white truncate">{service.name}</span>
          <span className={`badge text-xs ${statusConfig.color} bg-transparent border-0 shrink-0`}>
            <span className={`status-dot mr-1 ${statusConfig.bg} ${service.status === 'CHECKING' ? 'animate-pulse' : ''}`} />
            {statusConfig.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{service.description}</p>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: <Radio size={20} />,
    title: 'Real-time Log Ingestion',
    desc: 'Polls Spring Boot backend every 20s, deduplicates and groups by trace_id',
  },
  {
    icon: <AlertTriangle size={20} />,
    title: 'Incident Detection',
    desc: 'Rule-based engine detects 6 incident types and assigns severity',
  },
  {
    icon: <Brain size={20} />,
    title: 'Claude AI RCA',
    desc: 'Deep root cause analysis with confidence scoring and remediation steps',
  },
  {
    icon: <GitBranch size={20} />,
    title: 'RAG Memory',
    desc: 'Retrieves similar historical incidents to enrich RCA context',
  },
  {
    icon: <Zap size={20} />,
    title: 'Self-Healing Actions',
    desc: 'Triggers Slack alerts, GitHub issues, and restart simulations',
  },
  {
    icon: <Activity size={20} />,
    title: 'Timeline View',
    desc: 'Visual trace-correlated event timeline per incident',
  },
  {
    icon: <Shield size={20} />,
    title: 'Auto Suppression',
    desc: 'Deduplicates alerts and groups related errors by trace',
  },
  {
    icon: <Terminal size={20} />,
    title: 'Live Dashboard',
    desc: 'WebSocket-powered real-time updates with zero page refresh',
  },
];
