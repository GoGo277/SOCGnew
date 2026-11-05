import { ArchivedReport, HandoverAck, ReportSchedule, ReportTemplate, ShiftReport, SlaPolicy, User } from '../types';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { buildExecutiveBrief, buildShiftDigest } from './briefService';
import { defaultExportOptions, reportToMarkdown } from './reportExport';
import { computeFirstRun, nextAfter, periodFor } from '../lib/scheduling';
import { sha256 } from '../lib/crypto';

export const SCHEDULES_COLLECTION = 'report_schedules';
export const ARCHIVE_COLLECTION = 'report_archive';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const scheduleService = {
  subscribe(listener: (s: ReportSchedule[]) => void): () => void {
    return realtimeStore.subscribe<ReportSchedule>(SCHEDULES_COLLECTION, docs => listener([...docs].sort((a, b) => a.name.localeCompare(b.name))));
  },

  subscribeArchive(listener: (a: ArchivedReport[]) => void): () => void {
    return realtimeStore.subscribe<ArchivedReport>(ARCHIVE_COLLECTION, docs => listener([...docs].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))));
  },

  async save(actor: User, input: Omit<ReportSchedule, 'id' | 'createdBy' | 'createdAt' | 'updatedAt' | 'nextRunAt' | 'lastRunAt'>, existing?: ReportSchedule): Promise<ReportSchedule> {
    if (!input.name.trim()) throw new Error('Schedule name is required');
    if (input.hour < 0 || input.hour > 23) throw new Error('Hour must be between 0 and 23');
    const bad = input.recipients.filter(r => !EMAIL.test(r));
    if (bad.length) throw new Error(`Invalid recipient address: ${bad.join(', ')}`);
    const now = new Date().toISOString();
    const timingChanged = !existing || existing.frequency !== input.frequency || existing.hour !== input.hour || existing.dayOfWeek !== input.dayOfWeek || existing.dayOfMonth !== input.dayOfMonth;
    const s: ReportSchedule = {
      ...input,
      name: input.name.trim(),
      id: existing?.id ?? crypto.randomUUID(),
      createdBy: existing?.createdBy ?? actor.username,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: existing?.lastRunAt,
      nextRunAt: timingChanged || !existing ? computeFirstRun(input).toISOString() : existing.nextRunAt,
    };
    await realtimeStore.set(SCHEDULES_COLLECTION, s);
    auditService.log(actor, 'REPORT_SCHEDULE_SAVED', { id: s.id, name: s.name }, { frequency: s.frequency, hour: s.hour, recipients: s.recipients, enabled: s.enabled, kind: s.kind });
    return s;
  },

  async remove(actor: User, s: ReportSchedule): Promise<void> {
    await realtimeStore.remove(SCHEDULES_COLLECTION, s.id);
    auditService.log(actor, 'REPORT_SCHEDULE_DELETED', { id: s.id, name: s.name });
  },

  /** Build the markdown body for a schedule run. */
  render(s: ReportSchedule, range: { from: string; to: string }, reports: ShiftReport[], acks: HandoverAck[], sla: SlaPolicy, templates: ReportTemplate[], generatedBy: string): string {
    const tpl = templates.find(t => t.id === s.templateId);
    if (s.kind === 'executive_brief') {
      return buildExecutiveBrief(reports, acks, range, sla, { generatedBy, includeDrafts: s.includeDrafts, title: s.name });
    }
    const opts = tpl ? { ...tpl.options, preparedBy: generatedBy } : defaultExportOptions({ username: generatedBy } as User);
    return buildShiftDigest(reports, acks, range, sla, { generatedBy, title: s.name }, (r, ack) => reportToMarkdown(r, { ...opts, title: '' }, { ack, sla }));
  },

  /**
   * Execute one run (manual "run now" or due run). The schedule is advanced
   * *before* generation so concurrent tabs cannot produce duplicates.
   */
  async run(actorName: string, s: ReportSchedule, ctx: { reports: ShiftReport[]; acks: HandoverAck[]; sla: SlaPolicy; templates: ReportTemplate[] }, opts: { manual: boolean; actor?: User }): Promise<ArchivedReport> {
    const runAt = opts.manual ? new Date() : new Date(s.nextRunAt);
    if (!opts.manual) {
      await realtimeStore.set(SCHEDULES_COLLECTION, { ...s, lastRunAt: new Date().toISOString(), nextRunAt: nextAfter(runAt, s.frequency).toISOString() });
    }
    const range = periodFor(runAt, s.frequency);
    const markdown = scheduleService.render(s, range, ctx.reports, ctx.acks, ctx.sla, ctx.templates, actorName);
    const entry: ArchivedReport = {
      id: crypto.randomUUID(),
      scheduleId: s.id,
      scheduleName: s.name,
      kind: s.kind,
      periodFrom: range.from,
      periodTo: range.to,
      generatedAt: new Date().toISOString(),
      generatedBy: actorName,
      markdown,
      sha256: await sha256(markdown),
      recipients: s.recipients,
      delivery: 'archived_only',
    };
    await realtimeStore.set(ARCHIVE_COLLECTION, entry);
    auditService.log(opts.actor ?? { id: 'system', username: actorName, role: 'system' }, 'SCHEDULED_REPORT_GENERATED', { id: entry.id, name: s.name }, {
      scheduleId: s.id, period: `${range.from}..${range.to}`, manual: opts.manual, sha256: entry.sha256,
    });
    return entry;
  },

  /** Browser-side runner for local mode (cloud mode uses the Cloud Function). */
  async runDue(schedules: ReportSchedule[], ctx: { reports: ShiftReport[]; acks: HandoverAck[]; sla: SlaPolicy; templates: ReportTemplate[] }, now = new Date()): Promise<number> {
    let n = 0;
    for (const s of schedules) {
      if (s.enabled && new Date(s.nextRunAt) <= now) {
        await scheduleService.run('scheduler', s, ctx, { manual: false });
        n++;
      }
    }
    return n;
  },
};
