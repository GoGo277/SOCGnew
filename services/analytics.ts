import { HandoverAck, Severity, ShiftEvent, ShiftReport, SlaPolicy } from '../types';
import { ShiftId, fromDateKey, toDateKey, SHIFT_ORDER } from '../lib/shifts';
import { DEFAULT_SLA, evaluateSla, eventStatus, isOpenItem, SlaEvaluation } from '../lib/sla';

/** Chronological sort key for a shift slot (night 00-08 < morning < evening). */
export const shiftSortKey = (date: string, shift: ShiftId) => `${date}#${SHIFT_ORDER.indexOf(shift)}`;
export const sortReportsChronologically = (reports: ShiftReport[]) =>
  [...reports].sort((a, b) => shiftSortKey(a.date, a.shift).localeCompare(shiftSortKey(b.date, b.shift)));

export const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low'];

export const SEVERITY_STYLE: Record<Severity, { badge: string; hex: string; meaning: string }> = {
  Critical: { badge: 'bg-red-500/10 text-red-400 border-red-500/30', hex: '#ef4444', meaning: 'Active breach, RCE or severe privilege escalation — immediate remediation.' },
  High: { badge: 'bg-orange-500/10 text-orange-400 border-orange-500/30', hex: '#f97316', meaning: 'Exploitation attempt, malware telemetry or unauthorized access vector.' },
  Medium: { badge: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/30', hex: '#eab308', meaning: 'Suspicious lateral movement, policy violation or anomalous port scan.' },
  Low: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', hex: '#10b981', meaning: 'Informational alert, benign probe or low-risk firewall drop.' },
};

export const ATTACK_TYPES = [
  'Brute Force', 'Phishing', 'Malware', 'Ransomware', 'Port Scan', 'DDoS', 'SQL Injection', 'XSS',
  'Remote Code Execution', 'Privilege Escalation', 'Lateral Movement', 'Data Exfiltration',
  'Command & Control', 'Unauthorized Access', 'Policy Violation', 'Reconnaissance', 'Insider Threat', 'Other',
];

export type RangePreset = 'today' | '7d' | '30d' | 'custom' | 'all';

export interface DateRange { from: string; to: string } // YYYY-MM-DD inclusive

export const presetRange = (preset: RangePreset, custom?: DateRange): DateRange | null => {
  const today = new Date();
  const key = toDateKey(today);
  if (preset === 'all') return null;
  if (preset === 'today') return { from: key, to: key };
  if (preset === 'custom') return custom ?? { from: key, to: key };
  const start = new Date(today);
  start.setDate(start.getDate() - (preset === '7d' ? 6 : 29));
  return { from: toDateKey(start), to: key };
};

export interface FlatEvent extends ShiftEvent { reportId: string; reportDate: string; shift: ShiftId; reportStatus: string }

/** All events, including carried-over copies. */
export const flattenEvents = (reports: ShiftReport[]): FlatEvent[] =>
  reports.flatMap(r => (r.events || []).map(e => ({ ...e, reportId: r.id, reportDate: r.date, shift: r.shift, reportStatus: r.status })));

/** Events first detected in these reports (carry-over copies excluded) — used for volume metrics. */
export const originalEvents = (reports: ShiftReport[]): FlatEvent[] => flattenEvents(reports).filter(e => !e.carriedFromEventId);

/**
 * One record per real-world event: the most recent copy across carry-overs,
 * so lifecycle timestamps (contained/resolved) reflect the latest state.
 */
export const latestEventStates = (reports: ShiftReport[]): FlatEvent[] => {
  const latest = new Map<string, { key: string; ev: FlatEvent }>();
  flattenEvents(reports).forEach(ev => {
    const root = ev.rootEventId || ev.id;
    const key = shiftSortKey(ev.reportDate, ev.shift);
    const cur = latest.get(root);
    if (!cur || key >= cur.key) latest.set(root, { key, ev });
  });
  return Array.from(latest.values()).map(v => v.ev);
};

export const filterReports = (reports: ShiftReport[], range: DateRange | null, includeDrafts = true) =>
  reports.filter(r => (includeDrafts || r.status === 'finalized') && (!range || (r.date >= range.from && r.date <= range.to)));

const topN = (counts: Record<string, number>, n = 10) =>
  Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }));

export interface ThreatMetrics {
  totalEvents: number;
  totalReports: number;
  finalizedReports: number;
  bySeverity: Record<Severity, number>;
  criticalityIndex: number; // % High+Critical
  topAttackTypes: { name: string; count: number }[];
  topSourceIps: { name: string; count: number; maxSeverity: Severity }[];
  topTargets: { name: string; count: number }[];
  topPorts: { name: string; count: number }[];
  byShift: Record<ShiftId, number>;
  byAnalyst: { name: string; count: number }[];
  daily: { date: string; Critical: number; High: number; Medium: number; Low: number; total: number; mttc: number | null; mttr: number | null }[];
  carriedEvents: number;
  sla: SlaSummary;
}

export interface SlaBreach { event: FlatEvent; evaluation: SlaEvaluation; kind: 'contain' | 'resolve' }

export interface SlaSummary {
  openItems: number;
  byStatus: Record<string, number>;
  mttdMinutes: number | null;
  mttcMinutes: number | null;
  mttrMinutes: number | null;
  containMet: number;
  containBreached: number;
  resolveMet: number;
  resolveBreached: number;
  /** % of measurable SLA checkpoints that were met (contain + resolve). */
  compliancePct: number | null;
  bySeverity: Record<Severity, { mttc: number | null; mttr: number | null; breached: number; total: number }>;
  breaches: SlaBreach[];
  atRisk: SlaBreach[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export const computeSla = (reports: ShiftReport[], policy: SlaPolicy = DEFAULT_SLA, now = new Date()): SlaSummary => {
  const states = latestEventStates(reports);
  const byStatus: Record<string, number> = { Open: 0, Contained: 0, Resolved: 0, 'False Positive': 0 };
  const ttd: number[] = [], ttc: number[] = [], ttr: number[] = [];
  let containMet = 0, containBreached = 0, resolveMet = 0, resolveBreached = 0;
  const sev = Object.fromEntries(SEVERITIES.map(s => [s, { ttc: [] as number[], ttr: [] as number[], breached: 0, total: 0 }])) as Record<Severity, { ttc: number[]; ttr: number[]; breached: number; total: number }>;
  const breaches: SlaBreach[] = [];
  const atRisk: SlaBreach[] = [];

  states.forEach(ev => {
    byStatus[eventStatus(ev)]++;
    const e = evaluateSla(ev, policy, now);
    const s = sev[ev.severity] ?? sev.Low;
    s.total++;
    if (e.ttdMinutes !== null) ttd.push(e.ttdMinutes);
    if (e.ttcMinutes !== null && eventStatus(ev) !== 'False Positive') { ttc.push(e.ttcMinutes); s.ttc.push(e.ttcMinutes); }
    if (e.ttrMinutes !== null && eventStatus(ev) !== 'False Positive') { ttr.push(e.ttrMinutes); s.ttr.push(e.ttrMinutes); }
    if (e.contain === 'met') containMet++;
    if (e.contain === 'breached') { containBreached++; breaches.push({ event: ev, evaluation: e, kind: 'contain' }); }
    if (e.resolve === 'met') resolveMet++;
    if (e.resolve === 'breached') { resolveBreached++; if (e.contain !== 'breached') breaches.push({ event: ev, evaluation: e, kind: 'resolve' }); }
    if (e.contain === 'breached' || e.resolve === 'breached') s.breached++;
    if (isOpenItem(ev) && (e.contain === 'at_risk' || e.resolve === 'at_risk')) atRisk.push({ event: ev, evaluation: e, kind: e.contain === 'at_risk' ? 'contain' : 'resolve' });
  });

  const measured = containMet + containBreached + resolveMet + resolveBreached;
  const sevOrder = (b: SlaBreach) => SEVERITIES.indexOf(b.event.severity);
  return {
    openItems: byStatus.Open + byStatus.Contained,
    byStatus,
    mttdMinutes: avg(ttd),
    mttcMinutes: avg(ttc),
    mttrMinutes: avg(ttr),
    containMet, containBreached, resolveMet, resolveBreached,
    compliancePct: measured ? Math.round(((containMet + resolveMet) / measured) * 1000) / 10 : null,
    bySeverity: Object.fromEntries(SEVERITIES.map(s => [s, { mttc: avg(sev[s].ttc), mttr: avg(sev[s].ttr), breached: sev[s].breached, total: sev[s].total }])) as SlaSummary['bySeverity'],
    breaches: breaches.sort((a, b) => sevOrder(a) - sevOrder(b) || a.event.timestamp.localeCompare(b.event.timestamp)),
    atRisk: atRisk.sort((a, b) => a.evaluation.containDueAt.localeCompare(b.evaluation.containDueAt)),
  };
};

/** Handover sign-off compliance: finalized reports followed by an acknowledgement. */
export const computeHandoverCompliance = (reports: ShiftReport[], acks: HandoverAck[]) => {
  const finalized = reports.filter(r => r.status === 'finalized');
  const ackIds = new Set(acks.map(a => a.reportId));
  const acknowledged = finalized.filter(r => ackIds.has(r.id)).length;
  return {
    finalized: finalized.length,
    acknowledged,
    pct: finalized.length ? Math.round((acknowledged / finalized.length) * 1000) / 10 : null,
    pending: finalized.filter(r => !ackIds.has(r.id)),
  };
};

const SEV_RANK: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

export const computeMetrics = (reports: ShiftReport[], range: DateRange | null, policy: SlaPolicy = DEFAULT_SLA): ThreatMetrics => {
  const events = originalEvents(reports);
  const bySeverity: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  const attack: Record<string, number> = {};
  const ips: Record<string, number> = {};
  const ipSev: Record<string, Severity> = {};
  const targets: Record<string, number> = {};
  const ports: Record<string, number> = {};
  const analysts: Record<string, number> = {};
  const byShift: Record<ShiftId, number> = { morning: 0, evening: 0, night: 0 };
  const daily: Record<string, ThreatMetrics['daily'][number]> = {};

  // Seed the date axis so empty days still render.
  if (range) {
    const cur = fromDateKey(range.from);
    const end = fromDateKey(range.to);
    let guard = 0;
    while (cur <= end && guard++ < 400) {
      const k = toDateKey(cur);
      daily[k] = { date: k, Critical: 0, High: 0, Medium: 0, Low: 0, total: 0, mttc: null, mttr: null };
      cur.setDate(cur.getDate() + 1);
    }
  }

  events.forEach(e => {
    const sev = (e.severity || 'Low') as Severity;
    bySeverity[sev]++;
    const at = e.attackType || e.eventName || 'Unclassified';
    attack[at] = (attack[at] || 0) + 1;
    if (e.sourceIp) {
      ips[e.sourceIp] = (ips[e.sourceIp] || 0) + 1;
      if (!ipSev[e.sourceIp] || SEV_RANK[sev] > SEV_RANK[ipSev[e.sourceIp]]) ipSev[e.sourceIp] = sev;
    }
    if (e.destinationIp) targets[e.destinationIp] = (targets[e.destinationIp] || 0) + 1;
    if (e.port) ports[e.port] = (ports[e.port] || 0) + 1;
    if (e.loggedBy) analysts[e.loggedBy] = (analysts[e.loggedBy] || 0) + 1;
    byShift[e.shift]++;
    const d = e.reportDate;
    if (!daily[d]) daily[d] = { date: d, Critical: 0, High: 0, Medium: 0, Low: 0, total: 0, mttc: null, mttr: null };
    daily[d][sev]++;
    daily[d].total++;
  });

  // Daily mean time-to-contain / time-to-resolve (by detection day).
  const dayTimes: Record<string, { c: number[]; r: number[] }> = {};
  latestEventStates(reports).forEach(ev => {
    if (eventStatus(ev) === 'False Positive') return;
    const e = evaluateSla(ev, policy);
    const d = ev.timestamp ? toDateKey(new Date(ev.timestamp)) : ev.reportDate;
    const bucket = (dayTimes[d] ??= { c: [], r: [] });
    if (e.ttcMinutes !== null) bucket.c.push(e.ttcMinutes);
    if (e.ttrMinutes !== null) bucket.r.push(e.ttrMinutes);
  });
  Object.entries(dayTimes).forEach(([d, v]) => {
    if (!daily[d]) return;
    daily[d].mttc = avg(v.c) === null ? null : Math.round(avg(v.c)!);
    daily[d].mttr = avg(v.r) === null ? null : Math.round(avg(v.r)!);
  });

  const total = events.length;
  return {
    carriedEvents: flattenEvents(reports).length - events.length,
    sla: computeSla(reports, policy),
    totalEvents: total,
    totalReports: reports.length,
    finalizedReports: reports.filter(r => r.status === 'finalized').length,
    bySeverity,
    criticalityIndex: total ? Math.round(((bySeverity.Critical + bySeverity.High) / total) * 1000) / 10 : 0,
    topAttackTypes: topN(attack),
    topSourceIps: topN(ips).map(x => ({ ...x, maxSeverity: ipSev[x.name] })),
    topTargets: topN(targets),
    topPorts: topN(ports),
    byShift,
    byAnalyst: topN(analysts),
    daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
  };
};
