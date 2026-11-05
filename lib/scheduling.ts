import { ReportSchedule, ScheduleFrequency } from '../types';
import { toDateKey } from './shifts';

/** Pure scheduling maths shared by the browser runner and the Cloud Function. */

/** First run strictly after `from` matching the schedule's local hour/day. */
export const computeFirstRun = (s: Pick<ReportSchedule, 'frequency' | 'hour' | 'dayOfWeek' | 'dayOfMonth'>, from: Date = new Date()): Date => {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(s.hour);
  if (s.frequency === 'daily') {
    if (d <= from) d.setDate(d.getDate() + 1);
    return d;
  }
  if (s.frequency === 'weekly') {
    const target = s.dayOfWeek ?? 1;
    d.setDate(d.getDate() + ((target - d.getDay() + 7) % 7));
    if (d <= from) d.setDate(d.getDate() + 7);
    return d;
  }
  const dom = Math.min(Math.max(s.dayOfMonth ?? 1, 1), 28);
  d.setDate(dom);
  if (d <= from) d.setMonth(d.getMonth() + 1);
  return d;
};

/** Advance a run time by one period. */
export const advance = (at: Date, f: ScheduleFrequency): Date => {
  const d = new Date(at);
  if (f === 'daily') d.setDate(d.getDate() + 1);
  else if (f === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
};

/** Next run after `now`, skipping missed periods (no backlog storms). */
export const nextAfter = (runAt: Date, f: ScheduleFrequency, now: Date = new Date()): Date => {
  let n = advance(runAt, f);
  let guard = 0;
  while (n <= now && guard++ < 1000) n = advance(n, f);
  return n;
};

/** Reporting window covered by a run: the full period that ended at the run time. */
export const periodFor = (runAt: Date, f: ScheduleFrequency): { from: string; to: string } => {
  const end = new Date(runAt.getTime() - 1);
  const start = new Date(runAt);
  if (f === 'daily') start.setDate(start.getDate() - 1);
  else if (f === 'weekly') start.setDate(start.getDate() - 7);
  else start.setMonth(start.getMonth() - 1);
  return { from: toDateKey(start), to: toDateKey(end) };
};
