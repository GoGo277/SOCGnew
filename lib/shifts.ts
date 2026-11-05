/** 3-shift, 24/7 SOC duty model. */

export type ShiftId = 'morning' | 'evening' | 'night';

export interface ShiftDefinition {
  id: ShiftId;
  label: string;
  startHour: number; // inclusive, 0-23
  endHour: number;   // exclusive, 1-24
  timing: string;
  timing12h: string;
  focus: string[];
  /** Tailwind classes for badges */
  badge: string;
  dot: string;
  text: string;
  hex: string;
}

export const SHIFTS: ShiftDefinition[] = [
  {
    id: 'morning',
    label: 'Morning Shift',
    startHour: 8,
    endHour: 16,
    timing: '08:00 - 16:00',
    timing12h: '8 AM - 4 PM',
    focus: ['Morning vulnerability scans', 'Daily log triage', 'Initial threat hunting'],
    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30',
    dot: 'bg-cyan-400',
    text: 'text-cyan-400',
    hex: '#22d3ee',
  },
  {
    id: 'evening',
    label: 'Evening Shift',
    startHour: 16,
    endHour: 24,
    timing: '16:00 - 00:00',
    timing12h: '4 PM - 12 AM',
    focus: ['Peak traffic monitoring', 'Active intrusion detection alerts', 'Incident escalation'],
    badge: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    hex: '#fbbf24',
  },
  {
    id: 'night',
    label: 'Night Shift',
    startHour: 0,
    endHour: 8,
    timing: '00:00 - 08:00',
    timing12h: '12 AM - 8 AM',
    focus: ['Quiet-hour anomaly detection', 'Automated SIEM alert review', 'Shift handover summaries'],
    badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30',
    dot: 'bg-indigo-400',
    text: 'text-indigo-400',
    hex: '#818cf8',
  },
];

export const SHIFT_ORDER: ShiftId[] = ['night', 'morning', 'evening']; // chronological within a calendar day

export const getShift = (id: ShiftId): ShiftDefinition => SHIFTS.find(s => s.id === id)!;

export const getShiftForHour = (hour: number): ShiftDefinition =>
  SHIFTS.find(s => hour >= s.startHour && hour < s.endHour)!;

/** Local-time YYYY-MM-DD key (Firestore duty_schedules document id). */
export const toDateKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const fromDateKey = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** Absolute window of a shift on a calendar date. */
export const getShiftWindow = (dateKey: string, shiftId: ShiftId): { start: Date; end: Date } => {
  const base = fromDateKey(dateKey);
  const def = getShift(shiftId);
  const start = new Date(base); start.setHours(def.startHour, 0, 0, 0);
  const end = new Date(base); end.setHours(def.endHour, 0, 0, 0); // setHours(24) rolls to next day
  return { start, end };
};

export interface ActiveShiftInfo {
  shift: ShiftDefinition;
  dateKey: string;
  start: Date;
  end: Date;
  progress: number; // 0..1
  remainingMs: number;
  next: { shift: ShiftDefinition; dateKey: string };
}

export const getActiveShift = (now: Date = new Date()): ActiveShiftInfo => {
  const shift = getShiftForHour(now.getHours());
  const dateKey = toDateKey(now);
  const { start, end } = getShiftWindow(dateKey, shift.id);
  const total = end.getTime() - start.getTime();
  const nextId: ShiftId = shift.id === 'night' ? 'morning' : shift.id === 'morning' ? 'evening' : 'night';
  const nextDate = shift.id === 'evening' ? toDateKey(new Date(end)) : dateKey;
  return {
    shift,
    dateKey,
    start,
    end,
    progress: Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / total)),
    remainingMs: Math.max(0, end.getTime() - now.getTime()),
    next: { shift: getShift(nextId), dateKey: nextDate },
  };
};

export const formatDuration = (ms: number): string => {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${String(m).padStart(2, '0')}m`;
};
