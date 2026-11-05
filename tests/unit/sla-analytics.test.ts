import { describe, expect, it } from 'vitest';
import { evaluateSla, DEFAULT_SLA, formatMinutes } from '../../lib/sla';
import { computeMetrics, computeSla, computeHandoverCompliance, latestEventStates, presetRange } from '../../services/analytics';
import { ShiftEvent, ShiftReport } from '../../types';

const ev = (p: Partial<ShiftEvent>): ShiftEvent => ({
  id: p.id ?? 'e', timestamp: '2026-11-05T09:00:00.000Z', eventName: 'x', attackType: 'Brute Force', sourceIp: '203.0.113.1',
  destinationIp: '10.0.0.1', port: '22', protocol: 'TCP', severity: 'High', investigation: '', remediation: '', conclusion: '',
  loggedBy: 'alice', loggedById: 'a', createdAt: '', updatedAt: '', ...p,
});
const report = (id: string, events: ShiftEvent[], status: 'draft' | 'finalized' = 'finalized'): ShiftReport => ({
  id, date: id.slice(0, 10), shift: id.slice(11) as any, title: id, status, events, summary: '', handoverNotes: '',
  contributors: [], createdBy: 'a', createdById: 'a', createdAt: '', updatedAt: '', updatedBy: 'a', revision: 1,
});

describe('evaluateSla', () => {
  const at = (iso: string) => new Date(iso);
  it('marks checkpoints met within target', () => {
    const r = evaluateSla(ev({ severity: 'Critical', containedAt: '2026-11-05T09:30:00.000Z', resolvedAt: '2026-11-05T12:00:00.000Z', status: 'Resolved' }));
    expect(r).toMatchObject({ contain: 'met', resolve: 'met', ttcMinutes: 30, ttrMinutes: 180 });
  });
  it('marks late containment as breached', () => {
    const r = evaluateSla(ev({ severity: 'Critical', containedAt: '2026-11-05T10:30:00.000Z', status: 'Contained' }), DEFAULT_SLA, at('2026-11-05T10:31:00Z'));
    expect(r.contain).toBe('breached');
    expect(r.resolve).toBe('on_track');
  });
  it('tracks open items against the clock (on track → at risk → breached)', () => {
    const e = ev({ severity: 'Critical' }); // contain target 60m
    expect(evaluateSla(e, DEFAULT_SLA, at('2026-11-05T09:10:00Z')).contain).toBe('on_track');
    expect(evaluateSla(e, DEFAULT_SLA, at('2026-11-05T09:50:00Z')).contain).toBe('at_risk');
    expect(evaluateSla(e, DEFAULT_SLA, at('2026-11-05T10:01:00Z')).contain).toBe('breached');
  });
  it('excludes false positives from SLA measurement', () => {
    expect(evaluateSla(ev({ status: 'False Positive' })).contain).toBe('n/a');
  });
  it('computes time to detect from first activity', () => {
    expect(evaluateSla(ev({ occurredAt: '2026-11-05T08:15:00.000Z' })).ttdMinutes).toBe(45);
  });
  it('formats durations', () => {
    expect([formatMinutes(null), formatMinutes(42), formatMinutes(125), formatMinutes(3000)]).toEqual(['—', '42m', '2h 05m', '2d 2h']);
  });
});

describe('carry-over aware analytics', () => {
  const original = ev({ id: 'e1', severity: 'Critical' });
  const carried = { ...original, id: 'e1b', rootEventId: 'e1', carriedFromEventId: 'e1', carriedFromReportId: '2026-11-05_night', status: 'Resolved' as const, containedAt: '2026-11-05T09:20:00.000Z', resolvedAt: '2026-11-05T10:00:00.000Z' };
  const reports = [report('2026-11-05_night', [original]), report('2026-11-05_morning', [carried, ev({ id: 'e2', severity: 'Low' })])];

  it('counts a carried event once in volume metrics', () => {
    const m = computeMetrics(reports, null);
    expect(m.totalEvents).toBe(2);
    expect(m.carriedEvents).toBe(1);
    expect(m.bySeverity.Critical).toBe(1);
    expect(m.criticalityIndex).toBe(50);
  });
  it('uses the latest copy for lifecycle state', () => {
    const states = latestEventStates(reports);
    expect(states.find(s => (s.rootEventId ?? s.id) === 'e1')?.status).toBe('Resolved');
    const sla = computeSla(reports, DEFAULT_SLA, new Date('2026-11-05T10:05:00Z'));
    expect(sla.byStatus.Resolved).toBe(1);
    expect(sla.mttcMinutes).toBe(20);
    expect(sla.containMet).toBe(1);
  });
  it('measures handover sign-off compliance', () => {
    const h = computeHandoverCompliance(reports, [{ reportId: '2026-11-05_night' } as any]);
    expect(h).toMatchObject({ finalized: 2, acknowledged: 1, pct: 50 });
  });
  it('builds inclusive date windows', () => {
    const r = presetRange('7d')!;
    expect((new Date(r.to).getTime() - new Date(r.from).getTime()) / 864e5).toBe(6);
  });
});
