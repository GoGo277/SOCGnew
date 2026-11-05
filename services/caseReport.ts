import { CaseActivity, CaseAsset, CaseEvidence, CaseIoc, CaseNote, CaseTask, CaseTimelineEvent, Customer, DfirCase, ExportFormat, User } from '../types';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { markdownToHtml, MARKDOWN_CSS } from '../lib/markdown';
import { markdownToPdf } from './markdownPdf';
import { escapeHtml } from './reportExport';

export const CASE_REPORT_TEMPLATES = 'case_report_templates';

export interface CaseReportTemplate {
  id: string;
  name: string;
  description: string;
  content: string; // markdown with {{placeholders}}
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CaseReportContext {
  case: DfirCase;
  customer?: Customer;
  iocs: CaseIoc[];
  assets: CaseAsset[];
  timeline: CaseTimelineEvent[];
  evidence: CaseEvidence[];
  notes: CaseNote[];
  tasks: CaseTask[];
  activity: CaseActivity[];
  generatedBy: string;
  classification: string;
}

/** Placeholders available in case report templates (documented in the template editor). */
export const PLACEHOLDERS: { key: string; description: string }[] = [
  { key: 'case.number', description: 'Case number' }, { key: 'case.name', description: 'Case name' },
  { key: 'case.state', description: 'Current state' }, { key: 'case.severity', description: 'Severity' },
  { key: 'case.classification', description: 'Classification' }, { key: 'case.outcome', description: 'Outcome' },
  { key: 'case.owner', description: 'Case owner' }, { key: 'case.opened_at', description: 'Opened date' },
  { key: 'case.closed_at', description: 'Closed date' }, { key: 'case.description', description: 'Case description' },
  { key: 'case.tags', description: 'Tags' }, { key: 'customer.name', description: 'Customer' },
  { key: 'report.generated_at', description: 'Generation time' }, { key: 'report.generated_by', description: 'Author' },
  { key: 'report.classification', description: 'Classification / TLP marking' },
  { key: 'summary_timeline', description: 'Timeline events flagged for the summary' },
  { key: 'timeline_table', description: 'Full timeline table' }, { key: 'iocs_table', description: 'IOC table' },
  { key: 'assets_table', description: 'Asset table' }, { key: 'evidence_table', description: 'Evidence register with hashes' },
  { key: 'tasks_table', description: 'Task table' }, { key: 'notes', description: 'All case notes' },
  { key: 'statistics', description: 'Key figures' },
];

export const BUILTIN_TEMPLATE: CaseReportTemplate = {
  id: 'builtin-investigation',
  name: 'Standard investigation report',
  description: 'Executive summary, timeline, observables, evidence and actions.',
  createdBy: 'system', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  content: `> **{{report.classification}}** — {{customer.name}}

# Case #{{case.number}} — {{case.name}}

| Field | Value |
|---|---|
| Customer | {{customer.name}} |
| State | {{case.state}} |
| Severity | {{case.severity}} |
| Classification | {{case.classification}} |
| Outcome | {{case.outcome}} |
| Owner | {{case.owner}} |
| Opened | {{case.opened_at}} |
| Closed | {{case.closed_at}} |

## Executive summary

{{case.description}}

{{statistics}}

## Key events

{{summary_timeline}}

## Detailed timeline

{{timeline_table}}

## Indicators of compromise

{{iocs_table}}

## Affected assets

{{assets_table}}

## Evidence register

{{evidence_table}}

## Response actions

{{tasks_table}}

## Analyst notes

{{notes}}

---
_Generated {{report.generated_at}} by {{report.generated_by}} — G-Eyes SR_`,
};

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');
const cell = (v: unknown) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ') || '—';
const table = (head: string[], rows: unknown[][]) =>
  rows.length ? [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n') : '_None recorded._';

export const renderCaseReport = (tpl: CaseReportTemplate, ctx: CaseReportContext): string => {
  const c = ctx.case;
  const own = <T extends { caseId: string }>(xs: T[]) => xs.filter(x => x.caseId === c.id);
  const timeline = own(ctx.timeline).sort((a, b) => a.date.localeCompare(b.date));
  const iocs = own(ctx.iocs), assets = own(ctx.assets), evidence = own(ctx.evidence), tasks = own(ctx.tasks), notes = own(ctx.notes);
  const done = tasks.filter(x => x.status === 'Done').length;
  const values: Record<string, string> = {
    'case.number': String(c.number), 'case.name': c.name, 'case.state': c.state, 'case.severity': c.severity,
    'case.classification': c.classification, 'case.outcome': c.outcome, 'case.owner': c.ownerName ?? '—',
    'case.opened_at': fmt(c.openedAt), 'case.closed_at': fmt(c.closedAt), 'case.description': c.description || '_No description._',
    'case.tags': c.tags.join(', ') || '—', 'customer.name': ctx.customer?.name ?? '—',
    'report.generated_at': new Date().toLocaleString(), 'report.generated_by': ctx.generatedBy, 'report.classification': ctx.classification,
    statistics: [`- Timeline events: **${timeline.length}**`, `- IOCs: **${iocs.length}**`, `- Assets: **${assets.length}** (${assets.filter(a => a.compromiseStatus === 'Compromised').length} compromised)`, `- Evidence items: **${evidence.length}**`, `- Tasks: **${done}/${tasks.length}** done`].join('\n'),
    summary_timeline: timeline.filter(e => e.inSummary).map(e => `- **${fmt(e.date)}** — ${e.title} _(${e.category})_`).join('\n') || '_No events flagged for the summary._',
    timeline_table: table(['Date', 'Category', 'Event', 'Source'], timeline.map(e => [fmt(e.date), e.category, e.title, e.source])),
    iocs_table: table(['Type', 'Value', 'TLP', 'Description'], iocs.map(i => [i.type, `\`${i.value}\``, i.tlp, i.description])),
    assets_table: table(['Asset', 'Type', 'IP', 'Compromise', 'Analysis'], assets.map(a => [a.name, a.type, a.ip, a.compromiseStatus, a.analysisStatus])),
    evidence_table: table(['File', 'Type', 'Size', 'SHA-256', 'Custody entries'], evidence.map(e => [e.filename, e.type, `${e.size} B`, `\`${e.sha256}\``, e.custody.length])),
    tasks_table: table(['Task', 'Status', 'Due'], tasks.map(x => [x.title, x.status, x.dueDate ?? '—'])),
    notes: notes.map(n => `### ${n.directory} / ${n.title}\n\n${n.content}`).join('\n\n') || '_No notes._',
  };
  return tpl.content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => (k in values ? values[k] : m));
};

export const caseReportService = {
  subscribe: (l: (t: CaseReportTemplate[]) => void) =>
    realtimeStore.subscribe<CaseReportTemplate>(CASE_REPORT_TEMPLATES, d => l([BUILTIN_TEMPLATE, ...[...d].sort((a, b) => a.name.localeCompare(b.name))])),

  async saveTemplate(actor: User, data: Pick<CaseReportTemplate, 'name' | 'description' | 'content'>, existing?: CaseReportTemplate) {
    if (!data.name.trim()) throw new Error('Template name is required');
    if (existing?.id === BUILTIN_TEMPLATE.id) throw new Error('The built-in template cannot be changed — duplicate it instead');
    const t = new Date().toISOString();
    const tpl: CaseReportTemplate = { ...data, name: data.name.trim(), id: existing?.id ?? crypto.randomUUID(), createdBy: existing?.createdBy ?? actor.username, createdAt: existing?.createdAt ?? t, updatedAt: t };
    await realtimeStore.set(CASE_REPORT_TEMPLATES, tpl);
    auditService.log(actor, 'REPORT_TEMPLATE_SAVED', { id: tpl.id, name: tpl.name }, { kind: 'case-report' });
    return tpl;
  },

  async deleteTemplate(actor: User, tpl: CaseReportTemplate) {
    if (tpl.id === BUILTIN_TEMPLATE.id) throw new Error('The built-in template cannot be deleted');
    await realtimeStore.remove(CASE_REPORT_TEMPLATES, tpl.id);
    auditService.log(actor, 'REPORT_TEMPLATE_DELETED', { id: tpl.id, name: tpl.name }, { kind: 'case-report' });
  },

  render(format: ExportFormat, tpl: CaseReportTemplate, ctx: CaseReportContext): { blob: Blob; filename: string } {
    const base = `GEYES_case_${ctx.case.number}_${new Date().toISOString().slice(0, 10)}`;
    const md = renderCaseReport(tpl, ctx);
    if (format === 'md') return { blob: new Blob([md], { type: 'text/markdown' }), filename: `${base}.md` };
    if (format === 'pdf') return { blob: markdownToPdf(md, { footer: `${ctx.classification} — Case #${ctx.case.number} — G-Eyes SR` }), filename: `${base}.pdf` };
    if (format === 'json') {
      const own = <T extends { caseId: string }>(xs: T[]) => xs.filter(x => x.caseId === ctx.case.id);
      return {
        blob: new Blob([JSON.stringify({
          schema: 'geyes.case.v1', exportedAt: new Date().toISOString(), exportedBy: ctx.generatedBy, classification: ctx.classification,
          case: ctx.case, customer: ctx.customer, iocs: own(ctx.iocs), assets: own(ctx.assets), timeline: own(ctx.timeline),
          evidence: own(ctx.evidence), notes: own(ctx.notes), tasks: own(ctx.tasks), activity: own(ctx.activity),
        }, null, 2)], { type: 'application/json' }),
        filename: `${base}.json`,
      };
    }
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(`Case #${ctx.case.number} — ${ctx.case.name}`)}</title><style>body{font-family:Lato,Segoe UI,Arial,sans-serif;color:#1a2035;background:#f4f6fb;margin:0;padding:32px}.doc{max-width:960px;margin:0 auto;background:#fff;border:1px solid #e3e7ef;border-radius:10px;padding:32px 40px}${MARKDOWN_CSS}</style></head><body><div class="doc md">${markdownToHtml(md)}</div></body></html>`;
    return { blob: new Blob([html], { type: 'text/html' }), filename: `${base}.html` };
  },
};
