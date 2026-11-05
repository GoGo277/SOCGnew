import { HandoverAck, ShiftReport, SlaPolicy } from '../types';
import { SHIFTS } from '../lib/shifts';
import { computeHandoverCompliance, computeMetrics, filterReports, SEVERITIES } from './analytics';
import { formatMinutes } from '../lib/sla';

/** Pure markdown builder for the executive brief (also used by scheduled reports). */
export const buildExecutiveBrief = (
  reports: ShiftReport[], acks: HandoverAck[], range: { from: string; to: string } | null, sla: SlaPolicy,
  meta: { generatedBy: string; includeDrafts: boolean; title?: string }
): string => {
  const scoped = filterReports(reports, range, meta.includeDrafts);
  const m = computeMetrics(scoped, range, sla);
  const h = computeHandoverCompliance(scoped, acks);
  const rangeLabel = range ? `${range.from} → ${range.to}` : 'All time';
  const pct = (v: number | null) => (v === null ? 'n/a' : `${v}%`);
  return [
    `# ${meta.title ?? 'Executive Threat Brief'}`, '',
    `_Window: ${rangeLabel} · ${meta.includeDrafts ? 'drafts included' : 'finalized reports only'} · generated ${new Date().toLocaleString()} by ${meta.generatedBy}_`, '',
    '## Headline', '',
    `- Reports in scope: **${m.totalReports}** (${m.finalizedReports} finalized)`,
    `- Monitored events: **${m.totalEvents}**`,
    `- Criticality index: **${m.criticalityIndex}%**`,
    `- Severity: ${SEVERITIES.map(s => `${s} ${m.bySeverity[s]}`).join(' · ')}`, '',
    '## Response performance', '',
    `- SLA compliance: **${pct(m.sla.compliancePct)}** (contain met ${m.sla.containMet} / breached ${m.sla.containBreached}; resolve met ${m.sla.resolveMet} / breached ${m.sla.resolveBreached})`,
    `- Mean time to detect: ${formatMinutes(m.sla.mttdMinutes)} · to contain: ${formatMinutes(m.sla.mttcMinutes)} · to resolve: ${formatMinutes(m.sla.mttrMinutes)}`,
    `- Open items: **${m.sla.openItems}** (Open ${m.sla.byStatus.Open}, Contained ${m.sla.byStatus.Contained})`,
    `- Handover sign-off compliance: **${pct(h.pct)}** (${h.acknowledged}/${h.finalized} finalized reports acknowledged)`, '',
    '| Severity | MTTC | MTTR | Breached / total |', '|---|---|---|---|',
    ...SEVERITIES.map(s => `| ${s} | ${formatMinutes(m.sla.bySeverity[s].mttc)} | ${formatMinutes(m.sla.bySeverity[s].mttr)} | ${m.sla.bySeverity[s].breached} / ${m.sla.bySeverity[s].total} |`), '',
    ...(m.sla.breaches.length ? ['## SLA breaches', '', ...m.sla.breaches.slice(0, 20).map(b => `- **${b.event.severity}** ${b.event.eventName} (${b.event.reportId}) — ${b.kind} target missed, status ${b.event.status ?? 'Open'}`), ''] : []),
    '## Top threat vectors', '', ...(m.topAttackTypes.length ? m.topAttackTypes.map((a, i) => `${i + 1}. ${a.name} — ${a.count}`) : ['_None_']), '',
    '## Top hostile source IPs', '', ...(m.topSourceIps.length ? m.topSourceIps.map((a, i) => `${i + 1}. \`${a.name}\` — ${a.count} events (max ${a.maxSeverity})`) : ['_None_']), '',
    '## Most targeted assets', '', ...(m.topTargets.length ? m.topTargets.map((a, i) => `${i + 1}. \`${a.name}\` — ${a.count}`) : ['_None_']), '',
    '## Volume by shift', '', ...SHIFTS.map(s => `- ${s.label}: ${m.byShift[s.id]}`),
  ].join('\n');
};


/** Markdown digest of all finalized shift reports in a window (scheduled "shift digest"). */
export const buildShiftDigest = (
  reports: ShiftReport[], acks: HandoverAck[], range: { from: string; to: string }, sla: SlaPolicy,
  meta: { generatedBy: string; title?: string },
  renderReport: (r: ShiftReport, ack?: HandoverAck) => string
): string => {
  const scoped = filterReports(reports, range, false)
    .sort((a, b) => (a.date + a.shift).localeCompare(b.date + b.shift));
  const head = buildExecutiveBrief(reports, acks, range, sla, { generatedBy: meta.generatedBy, includeDrafts: false, title: meta.title ?? 'Shift Digest' });
  if (!scoped.length) return `${head}\n\n---\n\n_No finalized shift reports in this window._`;
  return [head, ...scoped.map(r => renderReport(r, acks.find(a => a.reportId === r.id)))].join('\n\n---\n\n');
};
