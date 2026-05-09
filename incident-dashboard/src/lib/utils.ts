import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatDistanceToNow, format } from 'date-fns';
import type { IncidentSeverity, IncidentStatus } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Date formatting ──────────────────────────────────────────────────────────

export function timeAgo(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export function formatTimestamp(dateStr: string): string {
  return format(new Date(dateStr), 'MMM dd, HH:mm:ss');
}

export function formatShortTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm:ss');
}

// ─── Severity helpers ─────────────────────────────────────────────────────────

export function severityColor(severity: IncidentSeverity): string {
  const map: Record<IncidentSeverity, string> = {
    CRITICAL: 'text-red-400',
    HIGH:     'text-orange-400',
    MEDIUM:   'text-yellow-400',
    LOW:      'text-green-400',
  };
  return map[severity] ?? 'text-gray-400';
}

export function severityBadgeClass(severity: IncidentSeverity): string {
  const map: Record<IncidentSeverity, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border border-red-500/30',
    HIGH:     'bg-orange-500/20 text-orange-400 border border-orange-500/30',
    MEDIUM:   'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
    LOW:      'bg-green-500/20 text-green-400 border border-green-500/30',
  };
  return map[severity] ?? 'bg-gray-500/20 text-gray-400';
}

export function statusBadgeClass(status: IncidentStatus): string {
  const map: Record<IncidentStatus, string> = {
    OPEN:      'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    ANALYZING: 'bg-purple-500/20 text-purple-400 border border-purple-500/30',
    RESOLVED:  'bg-green-500/20 text-green-400 border border-green-500/30',
  };
  return map[status] ?? 'bg-gray-500/20 text-gray-400';
}

export function severityDotClass(severity: IncidentSeverity): string {
  const map: Record<IncidentSeverity, string> = {
    CRITICAL: 'bg-red-500',
    HIGH:     'bg-orange-500',
    MEDIUM:   'bg-yellow-500',
    LOW:      'bg-green-500',
  };
  return map[severity] ?? 'bg-gray-500';
}

// ─── Confidence score helpers ─────────────────────────────────────────────────

export function confidenceLabel(score: number): string {
  if (score >= 0.9) return 'Very High';
  if (score >= 0.75) return 'High';
  if (score >= 0.5) return 'Medium';
  return 'Low';
}

export function confidenceColor(score: number): string {
  if (score >= 0.9) return 'text-green-400';
  if (score >= 0.75) return 'text-yellow-400';
  if (score >= 0.5) return 'text-orange-400';
  return 'text-red-400';
}

// ─── Parse JSON safely ────────────────────────────────────────────────────────

export function safeParseJSON<T>(str: string | null, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

// ─── Incident type to human label ─────────────────────────────────────────────

export function incidentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    GATEWAY_TIMEOUT:           'Gateway Timeout',
    DUPLICATE_PAYMENT_DETECTED:'Duplicate Payment',
    ORDER_UPDATE_FAILURE:      'Order Update Failure',
    NEGATIVE_STOCK:            'Inventory Oversell',
    INCONSISTENT_STATE:        'Inconsistent State',
    ASYNC_TRACE_LOSS:          'Async Trace Loss',
    UNKNOWN:                   'Unknown Error',
  };
  return labels[type] ?? type;
}
