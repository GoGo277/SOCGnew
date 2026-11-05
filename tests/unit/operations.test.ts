import { describe, expect, it } from 'vitest';
import { getActiveShift, previousSlot, nextSlot, getShiftWindow, getShiftForHour } from '../../lib/shifts';
import { computeFirstRun, nextAfter, periodFor } from '../../lib/scheduling';
import { swapService } from '../../services/swapService';
import { shiftReportService } from '../../services/shiftReportService';
import { DutySchedule, ShiftReport } from '../../types';

describe('three-shift engine', () => {
  it('maps hours to shifts', () => {
    expect([0, 7, 8, 15, 16, 23].map(h => getShiftForHour(h).id)).toEqual(['night', 'night', 'morning', 'morning', 'evening', 'evening']);
  });
  it('computes windows, including the evening shift ending at midnight', () => {
    const w = getShiftWindow('2026-11-05', 'evening');
    expect([w.start.getHours(), w.end.getDate(), w.end.getHours()]).toEqual([16, 6, 0]);
  });
  it('walks adjacent slots across midnight', () => {
    expect(previousSlot('2026-11-05', 'night')).toEqual({ date: '2026-11-04', shift: 'evening' });
    expect(nextSlot('2026-11-05', 'evening')).toEqual({ date: '2026-11-06', shift: 'night' });
  });
  it('reports the active shift, progress and the next crew slot', () => {
    const a = getActiveShift(new Date(2026, 10, 5, 20, 0));
    expect(a.shift.id).toBe('evening');
    expect(a.progress).toBe(0.5);
    expect(a.next).toMatchObject({ dateKey: '2026-11-06' });
  });
});

describe('report scheduling', () => {
  const from = new Date(2026, 10, 5, 10, 0); // Thursday
  it('finds the first daily, weekly and monthly run', () => {
    expect(computeFirstRun({ frequency: 'daily', hour: 7 }, from)).toEqual(new Date(2026, 10, 6, 7));
    expect(computeFirstRun({ frequency: 'weekly', hour: 7, dayOfWeek: 1 }, from)).toEqual(new Date(2026, 10, 9, 7));
    expect(computeFirstRun({ frequency: 'monthly', hour: 7, dayOfMonth: 1 }, from)).toEqual(new Date(2026, 11, 1, 7));
  });
  it('skips missed periods instead of back-filling', () => {
    expect(nextAfter(new Date(2026, 10, 1, 7), 'daily', from)).toEqual(new Date(2026, 10, 6, 7));
  });
  it('covers the period that ended at the run time', () => {
    expect(periodFor(new Date(2026, 10, 9, 7), 'weekly')).toEqual({ from: '2026-11-02', to: '2026-11-09' });
  });
});

describe('shift swap validation', () => {
  const day = (d: string, morning: string[]): DutySchedule => ({ id: d, date: d, morning, evening: [], night: [], updatedAt: '', updatedBy: '' });
  const future = new Date(Date.now() + 3 * 864e5);
  const d = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
  const schedules = { [d]: day(d, ['alice']) };
  it('accepts a valid cover request', () => {
    expect(() => swapService.validate({ requesterId: 'alice', peerId: 'bob', date: d, shift: 'morning' }, schedules)).not.toThrow();
  });
  it('rejects swaps the roster no longer supports', () => {
    expect(() => swapService.validate({ requesterId: 'carol', peerId: 'bob', date: d, shift: 'morning' }, schedules)).toThrow(/no longer assigned/);
    expect(() => swapService.validate({ requesterId: 'alice', peerId: 'alice', date: d, shift: 'morning' }, schedules)).toThrow(/different colleague/);
    expect(() => swapService.validate({ requesterId: 'alice', peerId: 'bob', date: '2020-01-01', shift: 'morning' }, { '2020-01-01': day('2020-01-01', ['alice']) })).toThrow(/future/);
  });
});

describe('open-item carry-over', () => {
  const base = (id: string, status: 'draft' | 'finalized', events: any[]): ShiftReport => ({ id, date: id.slice(0, 10), shift: id.slice(11) as any, title: id, status, events, summary: '', handoverNotes: '', contributors: [], createdBy: 'a', createdById: 'a', createdAt: '', updatedAt: '', updatedBy: 'a', revision: 0 });
  const prev = base('2026-11-05_night', 'finalized', [
    { id: 'open1', status: 'Open', timestamp: 't' }, { id: 'cont1', status: 'Contained', timestamp: 't' }, { id: 'done1', status: 'Resolved', timestamp: 't' }, { id: 'fp1', status: 'False Positive', timestamp: 't' },
  ]);
  it('selects the latest finalized report before the slot', () => {
    const draftOlder = base('2026-11-04_evening', 'draft', []);
    expect(shiftReportService.carryOverSource([draftOlder, prev], '2026-11-05', 'morning')?.id).toBe('2026-11-05_night');
    expect(shiftReportService.carryOverSource([prev], '2026-11-05', 'night')).toBeUndefined();
  });
  it('carries only unresolved events, once, keeping their lineage', () => {
    const target = base('2026-11-05_morning', 'draft', []);
    const items = shiftReportService.openItemsToCarry(prev, target);
    expect(items.map(i => i.rootEventId)).toEqual(['open1', 'cont1']);
    expect(items.every(i => i.carriedFromReportId === prev.id && i.id !== i.rootEventId)).toBe(true);
    expect(shiftReportService.openItemsToCarry(prev, { ...target, events: items })).toHaveLength(0);
  });
  it('stamps lifecycle times on status transitions', () => {
    const e: any = { id: 'x', status: 'Open' };
    const c = shiftReportService.withStatus(e, 'Contained', 'T1');
    expect([c.containedAt, c.resolvedAt]).toEqual(['T1', undefined]);
    const r = shiftReportService.withStatus(c, 'Resolved', 'T2');
    expect([r.containedAt, r.resolvedAt]).toEqual(['T1', 'T2']);
    expect(shiftReportService.withStatus(r, 'Open', 'T3').containedAt).toBeUndefined();
  });
});
