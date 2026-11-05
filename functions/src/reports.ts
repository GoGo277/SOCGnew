import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { db, requireUser, writeAudit, getSettings, str } from './common';
import { computeIntegrityHash, auditEntryHash } from '../../lib/integrity';
import { sha256 } from '../../lib/crypto';
import { nextAfter, periodFor } from '../../lib/scheduling';
import { markdownToHtml, MARKDOWN_CSS } from '../../lib/markdown';
import { DEFAULT_SLA } from '../../lib/sla';
import { buildExecutiveBrief, buildShiftDigest } from '../../services/briefService';
import { reportToMarkdown, defaultExportOptions } from '../../services/reportMarkdown';
import type { ArchivedReport, HandoverAck, ReportSchedule, ReportTemplate, ShiftReport, User } from '../../types';

/**
 * Server-side sealing: identity and time come from the verified token and the
 * server clock, and the hash is computed here — a modified client cannot seal
 * altered content or back-date a report.
 */
export const finalizeShiftReport = onCall(async req => {
  const actor = await requireUser(req);
  const settings = await getSettings();
  if (settings.rolePermissions?.[actor.role as 'Admin']?.canFinalizeReports === false && actor.role !== 'Admin') {
    throw new HttpsError('permission-denied', 'Your role cannot finalize reports');
  }
  const reportId = str(req.data?.reportId, 'reportId', 64);
  const ref = db.doc(`shift_reports/${reportId}`);
  const sealed = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Report not found');
    const r = snap.data() as ShiftReport;
    if (r.status !== 'draft') throw new HttpsError('failed-precondition', 'Report is already finalized');
    const now = new Date().toISOString();
    const next: ShiftReport = {
      ...r,
      status: 'finalized',
      contributors: Array.from(new Set([...(r.contributors || []), actor.username])),
      finalizedAt: now,
      finalizedBy: actor.username,
      updatedAt: now,
      updatedBy: actor.username,
      revision: (r.revision || 0) + 1,
    };
    next.integrityHash = await computeIntegrityHash(next);
    tx.set(ref, next);
    return next;
  });
  await writeAudit(actor, 'SHIFT_REPORT_FINALIZED', { id: reportId, name: sealed.title }, { integrityHash: sealed.integrityHash, events: sealed.events.length, sealedBy: 'server' });
  return sealed;
});

/**
 * Audit sink: every audit entry is re-verified and forwarded to Cloud Logging
 * (route the `geyes-audit` log to a retention-locked bucket for WORM storage).
 */
export const handleAuditEntry = async (id: string, entry: Record<string, any>): Promise<boolean> => {
  const valid = typeof entry.hash === 'string' && (await auditEntryHash(entry)) === entry.hash;
  const record = { geyesAudit: true, valid, ...entry };
  if (valid) logger.info(`audit ${entry.action}`, record);
  else {
    logger.error(`audit hash mismatch ${entry.action}`, record);
    await db.collection('audit_integrity_alerts').doc(id).set({ entryId: id, detectedAt: new Date().toISOString(), action: entry.action, userId: entry.userId });
  }
  return valid;
};

export const onAuditLogCreated = onDocumentCreated('audit_logs/{id}', async event => {
  const entry = event.data?.data();
  if (entry) await handleAuditEntry(event.params.id, entry);
});

/** Runs due report schedules, archives the result and queues e-mail (Trigger Email extension). */
export const runScheduledReports = onSchedule({ schedule: 'every 15 minutes', timeoutSeconds: 300 }, async () => {
  await runDueSchedules(new Date());
});

export const runDueSchedules = async (now: Date): Promise<number> => {
  const due = await db.collection('report_schedules').where('enabled', '==', true).where('nextRunAt', '<=', now.toISOString()).get();
  if (due.empty) return 0;
  const [reportsSnap, acksSnap, tplSnap, settings] = await Promise.all([
    db.collection('shift_reports').get(), db.collection('handover_acks').get(), db.collection('report_templates').get(), getSettings(),
  ]);
  const reports = reportsSnap.docs.map(d => d.data() as ShiftReport);
  const acks = acksSnap.docs.map(d => d.data() as HandoverAck);
  const templates = tplSnap.docs.map(d => d.data() as ReportTemplate);
  const sla = settings.sla ?? DEFAULT_SLA;
  let ran = 0;

  for (const doc of due.docs) {
    // Claim the run atomically so overlapping invocations cannot duplicate it.
    const claimed = await db.runTransaction(async tx => {
      const fresh = await tx.get(doc.ref);
      const s = fresh.data() as ReportSchedule;
      if (!s.enabled || s.nextRunAt > now.toISOString()) return null;
      tx.update(doc.ref, { lastRunAt: now.toISOString(), nextRunAt: nextAfter(new Date(s.nextRunAt), s.frequency, now).toISOString() });
      return s;
    });
    if (!claimed) continue;
    const s = claimed;
    const range = periodFor(new Date(s.nextRunAt), s.frequency);
    const tpl = templates.find(t => t.id === s.templateId);
    const markdown = s.kind === 'executive_brief'
      ? buildExecutiveBrief(reports, acks, range, sla, { generatedBy: 'cloud-scheduler', includeDrafts: s.includeDrafts, title: s.name })
      : buildShiftDigest(reports, acks, range, sla, { generatedBy: 'cloud-scheduler', title: s.name }, (r, ack) =>
          reportToMarkdown(r, { ...(tpl?.options ?? defaultExportOptions({ username: 'cloud-scheduler' } as User)), title: '' }, { ack, sla }));
    const ref = db.collection('report_archive').doc();
    const entry: ArchivedReport = {
      id: ref.id, scheduleId: s.id, scheduleName: s.name, kind: s.kind, periodFrom: range.from, periodTo: range.to,
      generatedAt: new Date().toISOString(), generatedBy: 'cloud-scheduler', markdown, sha256: await sha256(markdown),
      recipients: s.recipients, delivery: s.recipients.length ? 'queued' : 'archived_only',
    };
    await ref.set(entry);
    if (s.recipients.length) {
      await db.collection('mail').add({
        to: s.recipients,
        message: {
          subject: `[G-Eyes SR] ${s.name} — ${range.from} to ${range.to}`,
          text: markdown,
          html: `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Segoe UI,Arial,sans-serif;color:#18181b}${MARKDOWN_CSS}</style></head><body><div class="md">${markdownToHtml(markdown)}</div><p style="font-size:11px;color:#71717a">SHA-256 ${entry.sha256}</p></body></html>`,
          attachments: [{ filename: `${s.name.replace(/\W+/g, '_')}_${range.to}.md`, content: markdown }],
        },
      });
    }
    await writeAudit({ uid: 'system', username: 'cloud-scheduler', role: 'system' }, 'SCHEDULED_REPORT_GENERATED', { id: entry.id, name: s.name }, {
      scheduleId: s.id, period: `${range.from}..${range.to}`, recipients: s.recipients.length, sha256: entry.sha256,
    });
    ran++;
  }
  return ran;
};
