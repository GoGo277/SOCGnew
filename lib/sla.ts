import { EventStatus, Severity, ShiftEvent, SlaPolicy } from '../types';

export const DEFAULT_SLA: SlaPolicy = {
  Critical: { containMinutes: 60, resolveMinutes: 240 },
  High: { containMinutes: 240, resolveMinutes: 1440 },
  Medium: { containMinutes: 1440, resolveMinutes: 4320 },
  Low: { containMinutes: 4320, resolveMinutes: 10080 },
};

export const EVENT_STATUSES: EventStatus[] = ['Open', 'Contained', 'Resolved', 'False Positive'];

export const EVENT_STATUS_STYLE: Record<EventStatus, string> = {
  Open: 'bg-red-500/10 text-red-300 border-red-500/30',
  Contained: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  Resolved: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  'False Positive': 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
};

export const eventStatus = (e: ShiftEvent): EventStatus => e.status ?? 'Open';
export const isClosed = (e: ShiftEvent) => eventStatus(e) === 'Resolved' || eventStatus(e) === 'False Positive';
export const isOpenItem = (e: ShiftEvent) => !isClosed(e);

const minutesBetween = (a?: string, b?: string) =>
  a && b ? Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000) : null;

export type SlaState = 'met' | 'breached' | 'on_track' | 'at_risk' | 'n/a';

export interface SlaEvaluation {
  ttdMinutes: number | null; // occurredAt -> timestamp
  ttcMinutes: number | null; // timestamp -> containedAt (or resolvedAt)
  ttrMinutes: number | null; // timestamp -> resolvedAt
  contain: SlaState;
  resolve: SlaState;
  containDueAt: string;
  resolveDueAt: string;
}

/** Evaluate an event against the SLA policy at a point in time. */
export const evaluateSla = (e: ShiftEvent, policy: SlaPolicy = DEFAULT_SLA, now: Date = new Date()): SlaEvaluation => {
  const target = policy[e.severity as Severity] ?? DEFAULT_SLA[e.severity as Severity];
  const detected = new Date(e.timestamp).getTime();
  const containDue = detected + target.containMinutes * 60_000;
  const resolveDue = detected + target.resolveMinutes * 60_000;
  const fp = eventStatus(e) === 'False Positive';
  const containedAt = e.containedAt ?? e.resolvedAt;
  const ttc = minutesBetween(e.timestamp, containedAt);
  const ttr = minutesBetween(e.timestamp, e.resolvedAt);

  const state = (doneMinutes: number | null, targetMin: number, due: number): SlaState => {
    if (fp) return 'n/a';
    if (doneMinutes !== null) return doneMinutes <= targetMin ? 'met' : 'breached';
    const left = due - now.getTime();
    if (left < 0) return 'breached';
    return left < targetMin * 60_000 * 0.25 ? 'at_risk' : 'on_track';
  };

  return {
    ttdMinutes: minutesBetween(e.occurredAt, e.timestamp),
    ttcMinutes: ttc,
    ttrMinutes: ttr,
    contain: state(ttc, target.containMinutes, containDue),
    resolve: state(ttr, target.resolveMinutes, resolveDue),
    containDueAt: new Date(containDue).toISOString(),
    resolveDueAt: new Date(resolveDue).toISOString(),
  };
};

export const SLA_STYLE: Record<SlaState, string> = {
  met: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  breached: 'text-red-400 border-red-500/30 bg-red-500/10',
  on_track: 'text-sky-300 border-sky-500/30 bg-sky-500/5',
  at_risk: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  'n/a': 'text-zinc-500 border-zinc-700',
};

export const formatMinutes = (m: number | null | undefined): string => {
  if (m === null || m === undefined || isNaN(m)) return '—';
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
  return `${Math.floor(m / 1440)}d ${Math.round((m % 1440) / 60)}h`;
};
