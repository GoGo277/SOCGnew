import { Severity, ShiftEvent, ShiftReport } from '../types';
import { ShiftId, fromDateKey, toDateKey } from '../lib/shifts';

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

export const flattenEvents = (reports: ShiftReport[]): FlatEvent[] =>
  reports.flatMap(r => (r.events || []).map(e => ({ ...e, reportId: r.id, reportDate: r.date, shift: r.shift, reportStatus: r.status })));

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
  daily: { date: string; Critical: number; High: number; Medium: number; Low: number; total: number }[];
}

const SEV_RANK: Record<Severity, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };

export const computeMetrics = (reports: ShiftReport[], range: DateRange | null): ThreatMetrics => {
  const events = flattenEvents(reports);
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
      daily[k] = { date: k, Critical: 0, High: 0, Medium: 0, Low: 0, total: 0 };
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
    if (!daily[d]) daily[d] = { date: d, Critical: 0, High: 0, Medium: 0, Low: 0, total: 0 };
    daily[d][sev]++;
    daily[d].total++;
  });

  const total = events.length;
  return {
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
