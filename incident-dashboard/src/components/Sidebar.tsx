'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, AlertTriangle, Home, Zap } from 'lucide-react';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

const NAV = [
  { href: '/',          icon: Home,     label: 'Home' },
  { href: '/dashboard', icon: Activity, label: 'Overview' },
];

export default function Sidebar() {
  const path = usePathname();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const r = await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(3000) });
        if (mounted) setConnected(r.ok);
      } catch {
        if (mounted) setConnected(false);
      }
    };
    check();
    const t = setInterval(check, 15_000);
    return () => { mounted = false; clearInterval(t); };
  }, []);

  return (
    <aside className="w-52 shrink-0 border-r border-[#1f2937] flex flex-col bg-[#0a0d14]">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#1f2937]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 glow-primary">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">HackSys AI</p>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-none">Incident Assistant</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 pt-3 space-y-0.5">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                active
                  ? 'bg-indigo-500/15 text-indigo-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {/* Incidents is not a separate page — highlight when on /dashboard or /dashboard/incidents/... */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
            path.startsWith('/dashboard/incidents')
              ? 'bg-indigo-500/15 text-indigo-400 font-medium'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Incidents
        </Link>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-[#1f2937]">
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-slate-600'}`} />
          <span className={`text-xs ${connected ? 'text-green-400' : 'text-slate-500'}`}>
            {connected ? 'Live' : 'Connecting…'}
          </span>
        </div>
        <p className="text-[10px] text-slate-600">Spring Boot → Claude → Next.js</p>
      </div>
    </aside>
  );
}
