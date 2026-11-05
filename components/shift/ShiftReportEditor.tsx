import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, CloudUpload, Download, Lock, Trash2, Users, ShieldCheck, ShieldX, Plus, Crosshair, AlertTriangle, CornerDownRight, CheckCircle2, Hourglass } from 'lucide-react';
import { Asset, EventStatus, HandoverAck, Incident, RolePermissions, ShiftEvent, ShiftReport, SlaPolicy, User } from '../../types';
import { getShift } from '../../lib/shifts';
import { shiftReportService } from '../../services/shiftReportService';
import { computeMetrics } from '../../services/analytics';
import { evaluateSla, eventStatus, isOpenItem } from '../../lib/sla';
import ShiftEventForm from '../ShiftEventForm';
import EventList from './EventList';
import { useT } from '../../i18n';

export interface EditorProps {
  report: ShiftReport;
  reports: ShiftReport[];
  acks: HandoverAck[];
  assets: Asset[];
  sla: SlaPolicy;
  currentUser: User;
  permissions: RolePermissions;
  onBack: () => void;
  onToast: (msg: string) => void;
  onExport: () => void;
  saveIncident: (i: Partial<Incident>) => Promise<Incident>;
}

export const ReportStatusBadge: React.FC<{ r: ShiftReport }> = ({ r }) => {
  const t = useT();
  return r.status === 'finalized'
    ? <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border-emerald-500/30"><Lock className="w-2.5 h-2.5" /> {t('Finalized')}</span>
    : <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-widest bg-amber-500/10 text-amber-400 border-amber-500/30">{t('Draft')}</span>;
};

const ShiftReportEditor: React.FC<EditorProps> = ({ report, reports, acks, assets, sla, currentUser, permissions, onBack, onToast, onExport, saveIncident }) => {
  const t = useT();
  const locked = report.status === 'finalized';
  const canLog = permissions.canLogShiftEvents !== false && !locked;
  const canFinalize = permissions.canFinalizeReports !== false && !locked;
  const canDelete = !!permissions.canDeleteReports;
  const canEscalate = permissions.canCreateIncident !== false;

  const [title, setTitle] = useState(report.title);
  const [summary, setSummary] = useState(report.summary);
  const [handover, setHandover] = useState(report.handoverNotes);
  const [dirty, setDirty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>(report.updatedAt);
  const [eventForm, setEventForm] = useState<{ open: boolean; event: ShiftEvent | null }>({ open: false, event: null });
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [escalating, setEscalating] = useState<ShiftEvent | null>(null);
  const [verify, setVerify] = useState<null | boolean>(null);
  const [busy, setBusy] = useState(false);
  const latestRef = useRef(report);
  latestRef.current = report;

  // Follow remote changes when there are no local unsaved edits (multi-analyst collaboration).
  useEffect(() => {
    if (!dirty) {
      setTitle(report.title);
      setSummary(report.summary);
      setHandover(report.handoverNotes);
      setLastSynced(report.updatedAt);
    }
  }, [report.revision, report.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async (silent = false) => {
    if (locked) return;
    setSyncing(true);
    try {
      const next = await shiftReportService.syncDraft(currentUser, { ...latestRef.current, title, summary, handoverNotes: handover }, latestRef.current);
      setDirty(false);
      setLastSynced(next.updatedAt);
      if (!silent) onToast(t('Draft synchronized'));
    } catch (e: any) {
      onToast(t('Sync failed: {msg}', { msg: e.message }));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    if (!dirty || locked) return;
    const id = setTimeout(() => sync(true), 2500);
    return () => clearTimeout(id);
  }, [title, summary, handover, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setter(e.target.value); setDirty(true); };

  const guard = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) onToast(ok); }
    catch (e: any) { onToast(t('Failed: {msg}', { msg: e.message })); }
    finally { setBusy(false); }
  };

  const saveEvent = (ev: ShiftEvent) => guard(async () => {
    await shiftReportService.upsertEvent(currentUser, report, ev, latestRef.current);
    setEventForm({ open: false, event: null });
  }, eventForm.event ? t('Event updated') : t('Event logged'));

  const removeEvent = (ev: ShiftEvent) => {
    if (!confirm(t('Remove event "{name}" from this draft?', { name: ev.eventName }))) return;
    guard(() => shiftReportService.removeEvent(currentUser, latestRef.current, ev.id), t('Event removed'));
  };

  const setStatus = (ev: ShiftEvent, st: EventStatus) =>
    guard(() => shiftReportService.setEventStatus(currentUser, latestRef.current, ev, st), t('Status set to {s}', { s: t(st) }));

  const escalate = (ev: ShiftEvent) => guard(async () => {
    const inc = await shiftReportService.escalate(currentUser, latestRef.current, ev, assets, saveIncident);
    setEscalating(null);
    onToast(t('Incident {id} created', { id: inc.id.slice(0, 8) }));
  });

  const carrySource = useMemo(() => (locked ? undefined : shiftReportService.carryOverSource(reports, report.date, report.shift)), [locked, reports, report.date, report.shift]);
  const pendingCarry = carrySource ? shiftReportService.openItemsToCarry(carrySource, report).length : 0;

  const finalize = () => guard(async () => {
    await shiftReportService.finalize(currentUser, { ...latestRef.current, title, summary, handoverNotes: handover });
    setDirty(false);
    setConfirmFinalize(false);
  }, t('Report finalized and sealed'));

  const del = async () => {
    const typed = prompt(t('Deleting a {status} report is permanent and audited.\nType the report ID to confirm:\n{id}', { status: t(report.status), id: report.id }));
    if (typed !== report.id) return;
    await guard(() => shiftReportService.remove(currentUser, report), t('Report deleted'));
    onBack();
  };

  const m = computeMetrics([report], null, sla);
  const openItems = report.events.filter(isOpenItem).length;
  const breaches = report.events.filter(e => { const s = evaluateSla(e, sla); return s.contain === 'breached' || s.resolve === 'breached'; }).length;
  const shift = getShift(report.shift);
  const ack = acks.find(a => a.reportId === report.id);
  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-70';

  const finalizeWarnings = [
    !summary.trim() && t('No shift summary written'),
    !handover.trim() && t('No handover notes written'),
    report.events.length === 0 && t('No events logged (a "quiet shift" report will be sealed)'),
    report.events.some(e => (e.severity === 'Critical' || e.severity === 'High') && !e.conclusion.trim()) && t('Some High/Critical events have no SOC conclusion'),
    report.events.some(e => e.severity === 'Critical' && eventStatus(e) === 'Open') && t('Critical events are still Open (not contained)'),
    openItems > 0 && t('{n} open item(s) will be carried over to the next shift', { n: openItems }),
    dirty && t('Unsaved edits will be included'),
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> {t('All reports')}</button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500 flex items-center gap-1.5" aria-live="polite">
            <Clock className="w-3.5 h-3.5" />
            {locked ? t('Sealed {time}', { time: new Date(report.finalizedAt!).toLocaleString() }) : syncing ? t('Syncing…') : dirty ? t('Unsaved changes') : t('Synced {time}', { time: new Date(lastSynced).toLocaleTimeString() })}
          </span>
          {!locked && <button onClick={() => sync()} disabled={syncing} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2 border border-zinc-700"><CloudUpload className="w-4 h-4" /> {t('Sync draft')}</button>}
          {permissions.canExportReports !== false && <button onClick={onExport} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2 border border-zinc-700"><Download className="w-4 h-4" /> {t('Export')}</button>}
          {canFinalize && <button onClick={() => setConfirmFinalize(true)} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2"><Lock className="w-4 h-4" /> {t('Finalize')}</button>}
          {canDelete && <button onClick={del} aria-label={t('Delete report')} title={t('Delete report')} className="p-2 rounded-xl border border-zinc-800 text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-5 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: shift.hex }} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-[240px]">
            <div className="flex flex-wrap items-center gap-2 mb-2"><ReportStatusBadge r={report} /><span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${shift.badge}`}>{t(shift.label)} · {shift.timing}</span><span className="text-[10px] text-zinc-500 font-mono">{report.id} · rev {report.revision}</span></div>
            <input value={title} onChange={edit(setTitle)} disabled={locked} aria-label={t('Report title')} className="w-full bg-transparent text-xl sm:text-2xl font-black text-white outline-none disabled:opacity-100" />
            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 shrink-0" /> {(report.contributors || []).join(', ')} · {t('created by {user}', { user: report.createdBy })} {new Date(report.createdAt).toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center w-full sm:w-auto">
            {[
              [t('New events'), m.totalEvents, 'text-white'],
              [t('Open items'), openItems, openItems ? 'text-amber-300' : 'text-white'],
              [t('Critical/High'), m.bySeverity.Critical + m.bySeverity.High, 'text-red-400'],
              [t('SLA breaches'), breaches, breaches ? 'text-red-400' : 'text-emerald-400'],
            ].map(([k, v, c]) => (
              <div key={String(k)} className="px-3 py-2 rounded-xl bg-zinc-950/50 border border-zinc-800"><p className="text-[9px] font-black text-zinc-500 uppercase">{k}</p><p className={`text-xl font-black ${c}`}>{v}</p></div>
            ))}
          </div>
        </div>

        {locked && (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex flex-wrap items-center justify-between gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-400 flex items-center gap-2"><Lock className="w-3.5 h-3.5" /> {t('Immutable operational record — finalized by {user}', { user: report.finalizedBy ?? '' })}</p>
                <p className="text-[11px] font-mono text-zinc-400 break-all mt-1">SHA-256 {report.integrityHash}</p>
              </div>
              <div className="flex items-center gap-2">
                {verify !== null && (verify
                  ? <span className="text-xs font-bold text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> {t('Integrity verified')}</span>
                  : <span className="text-xs font-bold text-red-400 flex items-center gap-1"><ShieldX className="w-4 h-4" /> {t('HASH MISMATCH — record altered')}</span>)}
                <button onClick={async () => setVerify(await shiftReportService.verify(currentUser, report))} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 text-xs font-bold">{t('Verify integrity')}</button>
              </div>
            </div>
            <div className={`p-4 rounded-2xl border text-xs flex items-center gap-2 ${ack ? 'border-sky-500/20 bg-sky-500/5 text-sky-200' : 'border-zinc-800 text-zinc-400'}`}>
              {ack ? <CheckCircle2 className="w-4 h-4 text-sky-300 shrink-0" /> : <Hourglass className="w-4 h-4 shrink-0" />}
              <span>{ack
                ? <>{t('Handover acknowledged by {user} at {time}', { user: ack.acknowledgedBy, time: new Date(ack.acknowledgedAt).toLocaleString() })}{ack.comment && <> — “{ack.comment}”</>}</>
                : t('Awaiting handover acknowledgement by the incoming shift')}</span>
            </div>
          </div>
        )}
      </div>

      {pendingCarry > 0 && canLog && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-violet-500/30 bg-violet-500/5 text-xs text-violet-200">
          <span className="flex items-center gap-2"><CornerDownRight className="w-4 h-4" /> {t('{n} open item(s) from {id} are not in this report yet.', { n: pendingCarry, id: carrySource!.id })}</span>
          <button disabled={busy} onClick={() => guard(async () => { const n = await shiftReportService.importOpenItems(currentUser, latestRef.current, reports); onToast(t('{n} open item(s) carried over', { n })); })} className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-bold">{t('Carry over now')}</button>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between gap-2">
          <p className="text-sm font-black text-white flex items-center gap-2"><Crosshair className="w-4 h-4 text-red-400" /> {t('Event stack')} <span className="text-zinc-500 font-bold">({report.events.length})</span></p>
          {canLog && <button onClick={() => setEventForm({ open: true, event: null })} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> {t('Log event')}</button>}
        </div>
        <EventList events={report.events} sla={sla} editable={canLog} canEscalate={canEscalate}
          onEdit={e => setEventForm({ open: true, event: e })} onRemove={removeEvent} onStatus={setStatus} onEscalate={setEscalating} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <label className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('Shift summary')}</span>
          <textarea rows={6} value={summary} onChange={edit(setSummary)} disabled={locked} className={input} placeholder={t('Overall posture, notable trends, escalations raised…')} />
        </label>
        <label className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('Handover notes for next shift')}</span>
          <textarea rows={6} value={handover} onChange={edit(setHandover)} disabled={locked} className={input} placeholder={t('Open investigations, pending actions, watch-list IPs…')} />
        </label>
      </div>

      {eventForm.open && <ShiftEventForm event={eventForm.event} currentUser={currentUser} defaultDate={report.date} sla={sla} onSave={saveEvent} onCancel={() => setEventForm({ open: false, event: null })} />}

      {escalating && (
        <Confirm title={t('Escalate to incident?')} confirmLabel={t('Create incident')} tone="red" busy={busy} onCancel={() => setEscalating(null)} onConfirm={() => escalate(escalating)}>
          <p>{t('A tracked incident will be created in the Incidents module from "{name}" and linked to this event.', { name: escalating.eventName })}</p>
          {(() => {
            const match = (ip: string) => assets.find(a => ip && (a.ipv4 === ip || a.ipv6 === ip))?.name;
            const s = match(escalating.sourceIp), d = match(escalating.destinationIp);
            return (s || d) ? <p className="text-emerald-300">{t('Linked assets')}: {[s, d].filter(Boolean).join(', ')}</p> : <p className="text-zinc-500">{t('No inventory asset matches these IPs.')}</p>;
          })()}
        </Confirm>
      )}

      {confirmFinalize && (
        <Confirm title={t('Finalize & seal report?')} confirmLabel={t('Finalize & seal')} tone="emerald" busy={busy} onCancel={() => setConfirmFinalize(false)} onConfirm={finalize}>
          <p>{t('Finalizing locks the event stack into an immutable operational record. A SHA-256 integrity hash is computed and stored; no further edits are possible.')}</p>
          {finalizeWarnings.length > 0 && (
            <ul className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1">
              {finalizeWarnings.map(w => <li key={w} className="text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {w}</li>)}
            </ul>
          )}
        </Confirm>
      )}
    </div>
  );
};

const Confirm: React.FC<{ title: string; confirmLabel: string; tone: 'red' | 'emerald'; busy: boolean; onCancel: () => void; onConfirm: () => void; children: React.ReactNode }> = ({ title, confirmLabel, tone, busy, onCancel, onConfirm, children }) => {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-entrance w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
        <h3 className="text-lg font-black text-white">{title}</h3>
        <div className="text-xs text-zinc-400 space-y-3">{children}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 font-bold">{t('Cancel')}</button>
          <button disabled={busy} onClick={onConfirm} className={`px-4 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50 ${tone === 'red' ? 'bg-red-600 hover:bg-red-500' : 'bg-emerald-600 hover:bg-emerald-500'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};

export default ShiftReportEditor;
