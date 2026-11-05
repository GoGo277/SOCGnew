import { ReportExportOptions, ShiftReport, Severity, User, CustomSection, HandoverAck, SlaPolicy, ShiftEvent } from '../types';
import { getShift } from '../lib/shifts';
import { computeMetrics, SEVERITIES } from './analytics';
import { DEFAULT_SLA, evaluateSla, eventStatus, formatMinutes, isOpenItem } from '../lib/sla';

/**
 * Text renderers shared by the browser export pipeline and Cloud Functions
 * (no DOM / jsPDF dependencies).
 */
/** Extra context rendered into exports. */
export interface ExportContext { ack?: HandoverAck; sla?: SlaPolicy }

export const slaLine = (e: ShiftEvent, sla: SlaPolicy) => {
  const v = evaluateSla(e, sla);
  return `contain ${v.contain}${v.ttcMinutes !== null ? ` (${formatMinutes(v.ttcMinutes)})` : ''} · resolve ${v.resolve}${v.ttrMinutes !== null ? ` (${formatMinutes(v.ttrMinutes)})` : ''}`;
};
export const lifecycleLine = (e: ShiftEvent) => [
  e.occurredAt && `first activity ${fmt(e.occurredAt)}`,
  `detected ${fmt(e.timestamp)}`,
  e.containedAt && `contained ${fmt(e.containedAt)}`,
  e.resolvedAt && `resolved ${fmt(e.resolvedAt)}`,
].filter(Boolean).join(' · ');
export const markers = (e: ShiftEvent) => [
  e.carriedFromReportId && `carried over from ${e.carriedFromReportId}`,
  e.escalatedIncidentId && `escalated to incident ${e.escalatedIncidentId} by ${e.escalatedBy}`,
].filter(Boolean).join(' · ');
export const ackLine = (a?: HandoverAck) => a
  ? `Acknowledged by ${a.acknowledgedBy} on ${fmt(a.acknowledgedAt)} (incoming ${a.incomingDate} ${a.incomingShift})${a.comment ? ` — "${a.comment}"` : ''}`
  : 'Not yet acknowledged by the incoming shift';

export const PLATFORM_NAME = 'G-Eyes SR';

export const defaultExportOptions = (user: User, title = ''): ReportExportOptions => ({
  title,
  subtitle: 'SOC Operations & Intelligence Report',
  classification: 'CONFIDENTIAL',
  preparedBy: user.username,
  organization: 'Security Operations Center',
  includePageNumbers: true,
  includeEventDetails: true,
  includeAnalytics: true,
  includeIntegrity: true,
  customSections: [],
});

export const sections = (opts: ReportExportOptions, pos: CustomSection['position']) =>
  opts.customSections.filter(s => s.position === pos && (s.heading.trim() || s.content.trim()));

export const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export const fileBase = (r: ShiftReport) => `GEYES_${r.date}_${r.shift}_${r.status}`;

export const reportTitle = (r: ShiftReport, opts: ReportExportOptions) => opts.title.trim() || r.title;

export const sevCounts = (r: ShiftReport) => {
  const c: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0 };
  r.events.forEach(e => c[e.severity]++);
  return c;
};

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------
export const mdEscapeCell = (v: string) => (v || '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');

export const reportToMarkdown = (r: ShiftReport, opts: ReportExportOptions, ctx: ExportContext = {}): string => {
  const shift = getShift(r.shift);
  const sla = ctx.sla ?? DEFAULT_SLA;
  const m = computeMetrics([r], null, sla);
  const out: string[] = [];
  out.push(`> **${opts.classification}** — ${opts.organization}`, '');
  sections(opts, 'header').forEach(s => out.push(`**${s.heading}**`, '', s.content, ''));
  out.push(`# ${reportTitle(r, opts)}`, '');
  if (opts.subtitle) out.push(`_${opts.subtitle}_`, '');
  out.push('| Field | Value |', '|---|---|',
    `| Report ID | \`${r.id}\` |`,
    `| Date | ${r.date} |`,
    `| Shift | ${shift.label} (${shift.timing}) |`,
    `| Status | ${r.status.toUpperCase()} |`,
    `| Created | ${fmt(r.createdAt)} by ${r.createdBy} |`,
    `| Finalized | ${r.finalizedAt ? `${fmt(r.finalizedAt)} by ${r.finalizedBy}` : 'Not finalized (draft)'} |`,
    `| Contributors | ${(r.contributors || []).join(', ') || '—'} |`,
    `| Prepared by | ${opts.preparedBy} |`, '');

  if (opts.includeAnalytics) {
    out.push('## Threat Metrics', '',
      `- **New events:** ${m.totalEvents}${m.carriedEvents ? ` (+${m.carriedEvents} carried over)` : ''}`,
      `- **Open items at report time:** ${r.events.filter(isOpenItem).length}`,
      `- **SLA compliance:** ${m.sla.compliancePct === null ? 'n/a' : m.sla.compliancePct + '%'} · MTTC ${formatMinutes(m.sla.mttcMinutes)} · MTTR ${formatMinutes(m.sla.mttrMinutes)}`,
      `- **Criticality index (High + Critical):** ${m.criticalityIndex}%`,
      `- **Severity:** ${SEVERITIES.map(s => `${s} ${m.bySeverity[s]}`).join(' · ')}`,
      `- **Top attack vector:** ${m.topAttackTypes[0]?.name ?? '—'}`,
      `- **Primary hostile IP:** ${m.topSourceIps[0]?.name ?? '—'}`, '');
  }

  if (r.summary) out.push('## Shift Summary', '', r.summary, '');

  out.push('## Event Log', '');
  if (r.events.length === 0) out.push('_No events recorded during this shift._', '');
  else {
    out.push('| Time | Severity | Status | Event | Attack Type | Source IP | Destination IP | Port |', '|---|---|---|---|---|---|---|---|');
    r.events.forEach(e => out.push(`| ${fmtTime(e.timestamp)} | ${e.severity} | ${eventStatus(e)} | ${mdEscapeCell(e.eventName)}${e.carriedFromReportId ? ' ↪' : ''} | ${mdEscapeCell(e.attackType)} | ${mdEscapeCell(e.sourceIp)} | ${mdEscapeCell(e.destinationIp)} | ${mdEscapeCell(e.port)} |`));
    if (r.events.some(e => e.carriedFromReportId)) out.push('', '_↪ carried over from a previous shift_');
    out.push('');
  }

  if (opts.includeEventDetails && r.events.length) {
    out.push('## Investigation & Remediation Details', '');
    r.events.forEach((e, i) => {
      out.push(`### ${i + 1}. ${e.eventName} — ${e.severity} · ${eventStatus(e)}`, '',
        `*logged by ${e.loggedBy} · ${e.sourceIp || '?'} → ${e.destinationIp || '?'}${e.port ? `:${e.port}` : ''}${e.protocol ? ` (${e.protocol})` : ''}*`, '',
        `- Lifecycle: ${lifecycleLine(e)}`, `- SLA: ${slaLine(e, sla)}`, ...(markers(e) ? [`- ${markers(e)}`] : []), '');
      if (e.investigation) out.push('**Investigation / Forensic Findings**', '', e.investigation, '');
      if (e.remediation) out.push('**Remediation**', '', e.remediation, '');
      if (e.conclusion) out.push('**SOC Conclusion**', '', e.conclusion, '');
    });
  }

  sections(opts, 'body').forEach(s => out.push(`## ${s.heading}`, '', s.content, ''));
  if (r.handoverNotes) out.push('## Shift Handover Notes', '', r.handoverNotes, '');
  if (r.status === 'finalized') out.push('## Handover Sign-off', '', ackLine(ctx.ack), '');
  if (opts.includeIntegrity) {
    out.push('## Record Integrity', '',
      r.integrityHash ? `SHA-256: \`${r.integrityHash}\`` : '_Draft record — not sealed. Content may still change._', '');
  }
  sections(opts, 'footer').forEach(s => out.push('---', '', `**${s.heading}**`, '', s.content, ''));
  out.push('---', `_Generated by ${PLATFORM_NAME} on ${new Date().toLocaleString()} · ${opts.classification}_`);
  return out.join('\n');
};

export const comparativeMarkdown = (reports: ShiftReport[], sla: SlaPolicy = DEFAULT_SLA): string => {
  const rows = reports.map(r => ({ r, m: computeMetrics([r], null, sla) }));
  const all = computeMetrics(reports, null, sla);
  const out = [
    `# Comparative Multi-Report Analysis`, '',
    `_${reports.length} reports · generated ${new Date().toLocaleString()} by ${PLATFORM_NAME}_`, '',
    '| Report | Shift | Status | Events | Critical | High | Medium | Low | Criticality | SLA compliance | Top vector | Top hostile IP |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map(({ r, m }) => `| ${r.date} | ${getShift(r.shift).label} | ${r.status} | ${m.totalEvents} | ${m.bySeverity.Critical} | ${m.bySeverity.High} | ${m.bySeverity.Medium} | ${m.bySeverity.Low} | ${m.criticalityIndex}% | ${m.sla.compliancePct === null ? 'n/a' : m.sla.compliancePct + '%'} | ${mdEscapeCell(m.topAttackTypes[0]?.name ?? '—')} | ${m.topSourceIps[0]?.name ?? '—'} |`),
    '', '## Aggregate', '',
    `- Total events: **${all.totalEvents}**`,
    `- Aggregate criticality index: **${all.criticalityIndex}%**`,
    `- SLA compliance: **${all.sla.compliancePct === null ? 'n/a' : all.sla.compliancePct + '%'}** · MTTC ${formatMinutes(all.sla.mttcMinutes)} · MTTR ${formatMinutes(all.sla.mttrMinutes)}`,
    `- Top attack vectors: ${all.topAttackTypes.slice(0, 5).map(a => `${a.name} (${a.count})`).join(', ') || '—'}`,
    `- Top hostile IPs: ${all.topSourceIps.slice(0, 5).map(a => `${a.name} (${a.count})`).join(', ') || '—'}`,
  ];
  return out.join('\n');
};

