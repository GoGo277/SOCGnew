import React, { useState } from 'react';
import { ArrowRightLeft, CheckCircle2, AlertTriangle, X, Lock, Clock } from 'lucide-react';
import { HandoverAck, ShiftReport, SlaPolicy, User } from '../../types';
import { getActiveShift, getShift } from '../../lib/shifts';
import { HandoverStatus, handoverService } from '../../services/handoverService';
import { computeMetrics } from '../../services/analytics';
import { EVENT_STATUS_STYLE, eventStatus, evaluateSla, isOpenItem, SLA_STYLE } from '../../lib/sla';
import { SEVERITY_STYLE } from '../../services/analytics';
import { useT } from '../../i18n';

interface Props {
  status: HandoverStatus;
  acks: HandoverAck[];
  currentUser: User;
  sla: SlaPolicy;
  canAcknowledge: boolean;
  onToast: (m: string) => void;
  onOpenReport?: (id: string) => void;
}

/** Banner that drives the incoming-shift handover sign-off. */
const HandoverPanel: React.FC<Props> = ({ status, acks, currentUser, sla, canAcknowledge, onToast, onOpenReport }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const prevShift = getShift(status.previousSlot.shift);
  const prevLabel = `${t(prevShift.label)} · ${status.previousSlot.date}`;

  if (status.state === 'acknowledged' && status.ack) {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-xs text-emerald-300">
        <CheckCircle2 className="w-4 h-4" />
        <span>{t('Handover from {shift} acknowledged by {user} at {time}', { shift: prevLabel, user: status.ack.acknowledgedBy, time: new Date(status.ack.acknowledgedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</span>
      </div>
    );
  }

  if (status.state === 'missing') {
    return (
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl border border-zinc-800 bg-zinc-900 text-xs text-zinc-400">
        <ArrowRightLeft className="w-4 h-4" /> {t('No report was filed for the previous shift ({shift}).', { shift: prevLabel })}
      </div>
    );
  }

  if (status.state === 'draft') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-300">
        <span className="flex items-center gap-2"><Clock className="w-4 h-4" /> {t('Previous shift report ({shift}) is still a draft — handover cannot be signed off until it is finalized.', { shift: prevLabel })}</span>
        {onOpenReport && status.previous && <button onClick={() => onOpenReport(status.previous!.id)} className="font-bold underline">{t('Open report')}</button>}
      </div>
    );
  }

  // pending_ack
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-sky-500/30 bg-sky-500/10 text-xs text-sky-200" role="status">
        <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-sky-300" />
          {status.responsible
            ? t('Handover sign-off required: review and acknowledge the {shift} report.', { shift: prevLabel })
            : t('Handover from {shift} is awaiting acknowledgement by the on-duty crew.', { shift: prevLabel })}
        </span>
        {canAcknowledge && <button onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-bold">{t('Review & acknowledge')}</button>}
      </div>
      {open && status.previous && (
        <AckModal report={status.previous} acks={acks} currentUser={currentUser} sla={sla} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onToast(t('Handover acknowledged')); }} />
      )}
    </>
  );
};

const AckModal: React.FC<{ report: ShiftReport; acks: HandoverAck[]; currentUser: User; sla: SlaPolicy; onClose: () => void; onDone: () => void }> = ({ report, acks, currentUser, sla, onClose, onDone }) => {
  const t = useT();
  const [reviewed, setReviewed] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const m = computeMetrics([report], null, sla);
  const openItems = report.events.filter(isOpenItem);
  const shift = getShift(report.shift);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const active = getActiveShift();
      await handoverService.acknowledge(currentUser, report, { date: active.dateKey, shift: active.shift.id }, comment, acks);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="ack-title">
      <div className="modal-entrance w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <div>
            <h3 id="ack-title" className="text-lg font-black text-white flex items-center gap-2"><ArrowRightLeft className="w-5 h-5 text-sky-400" /> {t('Shift handover sign-off')}</h3>
            <p className="text-xs text-zinc-500">{report.title} · {t('finalized by {user}', { user: report.finalizedBy ?? '' })}</p>
          </div>
          <button aria-label={t('Close')} onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[[t('Events'), m.totalEvents], [t('Open items'), openItems.length], [t('Critical/High'), m.bySeverity.Critical + m.bySeverity.High], [t('Shift'), t(shift.label)]].map(([k, v]) => (
              <div key={String(k)} className="p-3 rounded-xl bg-zinc-950/50 border border-zinc-800"><p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">{k}</p><p className="text-lg font-black text-white truncate">{v}</p></div>
            ))}
          </div>
          <section>
            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('Shift summary')}</h4>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{report.summary || '—'}</p>
          </section>
          <section>
            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('Handover notes for next shift')}</h4>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap p-3 rounded-xl bg-sky-500/5 border border-sky-500/20">{report.handoverNotes || '—'}</p>
          </section>
          <section>
            <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-2">{t('Open items carried into your shift')} ({openItems.length})</h4>
            {openItems.length === 0 ? <p className="text-xs text-zinc-500">{t('No open items.')}</p> : (
              <ul className="space-y-2">
                {openItems.map(e => {
                  const ev = evaluateSla(e, sla);
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs p-2 rounded-lg border border-zinc-800">
                      <span className={`px-1.5 rounded border font-bold ${SEVERITY_STYLE[e.severity].badge}`}>{t(e.severity)}</span>
                      <span className={`px-1.5 rounded border font-bold ${EVENT_STATUS_STYLE[eventStatus(e)]}`}>{t(eventStatus(e))}</span>
                      <span className="text-zinc-200 font-bold flex-1 min-w-[160px]">{e.eventName}</span>
                      <span className={`px-1.5 rounded border ${SLA_STYLE[ev.contain === 'met' ? ev.resolve : ev.contain]}`}>{t('SLA')}: {t(ev.contain === 'met' ? ev.resolve : ev.contain)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 break-all"><Lock className="w-3 h-3 shrink-0" /> SHA-256 {report.integrityHash}</p>
          <label className="block space-y-1">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('Comment (optional)')}</span>
            <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white outline-none" />
          </label>
          <label className="flex items-start gap-3 text-sm text-zinc-200 cursor-pointer">
            <input type="checkbox" className="accent-sky-500 mt-1" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
            {t('I have reviewed the summary, handover notes and open items, and accept responsibility for them for the incoming shift.')}
          </label>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="p-6 border-t border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 font-bold">{t('Cancel')}</button>
          <button disabled={!reviewed || busy} onClick={submit} className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-xs font-bold">{busy ? t('Saving…') : t('Acknowledge handover')}</button>
        </div>
      </div>
    </div>
  );
};

export default HandoverPanel;
