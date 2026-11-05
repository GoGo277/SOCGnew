import React, { useState } from 'react';
import { useEscape } from '../lib/useEscape';
import { X, Crosshair, AlertCircle } from 'lucide-react';
import { EventStatus, Severity, ShiftEvent, SlaPolicy, User } from '../types';
import { DEFAULT_SLA, EVENT_STATUSES, EVENT_STATUS_STYLE, evaluateSla, formatMinutes } from '../lib/sla';
import { useT } from '../i18n';
import { ATTACK_TYPES, SEVERITIES, SEVERITY_STYLE } from '../services/analytics';
import { isValidIp, isValidPort } from '../services/shiftReportService';

interface Props {
  event: ShiftEvent | null;
  currentUser: User;
  defaultDate: string; // YYYY-MM-DD of the report
  sla?: SlaPolicy;
  onSave: (event: ShiftEvent) => Promise<void> | void;
  onCancel: () => void;
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const optIso = (local: string) => (local ? new Date(local).toISOString() : undefined);

const ShiftEventForm: React.FC<Props> = ({ event, currentUser, defaultDate, sla = DEFAULT_SLA, onSave, onCancel }) => {
  const t = useT();
  useEscape(onCancel);
  const now = new Date();
  const initialTs = event?.timestamp ?? (defaultDate === toLocalInput(now.toISOString()).slice(0, 10) ? now.toISOString() : new Date(`${defaultDate}T00:00`).toISOString());
  const [form, setForm] = useState({
    timestamp: toLocalInput(initialTs),
    eventName: event?.eventName ?? '',
    attackType: event?.attackType ?? '',
    sourceIp: event?.sourceIp ?? '',
    destinationIp: event?.destinationIp ?? '',
    port: event?.port ?? '',
    protocol: event?.protocol ?? '',
    severity: (event?.severity ?? 'Medium') as Severity,
    investigation: event?.investigation ?? '',
    remediation: event?.remediation ?? '',
    conclusion: event?.conclusion ?? '',
    status: (event?.status ?? 'Open') as EventStatus,
    occurredAt: event?.occurredAt ? toLocalInput(event.occurredAt) : '',
    containedAt: event?.containedAt ? toLocalInput(event.containedAt) : '',
    resolvedAt: event?.resolvedAt ? toLocalInput(event.resolvedAt) : '',
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const nowLocal = () => toLocalInput(new Date().toISOString());

  /** Status changes stamp lifecycle times automatically (editable afterwards). */
  const setStatus = (st: EventStatus) => setForm(f => {
    const next = { ...f, status: st };
    if ((st === 'Contained' || st === 'Resolved') && !f.containedAt) next.containedAt = nowLocal();
    if (st === 'Resolved' && !f.resolvedAt) next.resolvedAt = nowLocal();
    if (st === 'Open') { next.containedAt = ''; next.resolvedAt = ''; }
    if (st === 'Contained') next.resolvedAt = '';
    return next;
  });

  const preview = form.timestamp && !isNaN(new Date(form.timestamp).getTime())
    ? evaluateSla({ severity: form.severity, timestamp: new Date(form.timestamp).toISOString(), status: form.status, containedAt: optIso(form.containedAt), resolvedAt: optIso(form.resolvedAt), occurredAt: optIso(form.occurredAt) } as ShiftEvent, sla)
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!form.eventName.trim()) errs.push(t('Event name is required'));
    if (!form.timestamp || isNaN(new Date(form.timestamp).getTime())) errs.push(t('A valid timestamp is required'));
    if (!isValidIp(form.sourceIp)) errs.push(t('Source IP is not a valid IPv4/IPv6 address'));
    if (!isValidIp(form.destinationIp)) errs.push(t('Destination IP is not a valid IPv4/IPv6 address'));
    if (!isValidPort(form.port)) errs.push(t('Port must be 0-65535 (lists and ranges allowed, e.g. 80,443 or 1000-2000)'));
    const det = new Date(form.timestamp).getTime();
    if (form.occurredAt && new Date(form.occurredAt).getTime() > det) errs.push(t('First activity time cannot be after detection'));
    if (form.containedAt && new Date(form.containedAt).getTime() < det) errs.push(t('Containment time cannot be before detection'));
    if (form.resolvedAt && new Date(form.resolvedAt).getTime() < det) errs.push(t('Resolution time cannot be before detection'));
    if (form.containedAt && form.resolvedAt && new Date(form.resolvedAt) < new Date(form.containedAt)) errs.push(t('Resolution time cannot be before containment'));
    if (form.status === 'Resolved' && !form.resolvedAt) errs.push(t('Resolved events need a resolution time'));
    if (form.status === 'Contained' && !form.containedAt) errs.push(t('Contained events need a containment time'));
    if (new Date(form.timestamp).getTime() > Date.now() + 5 * 60_000) errs.push(t('Detection time cannot be in the future'));
    setErrors(errs);
    if (errs.length) return;
    const ts = new Date().toISOString();
    setBusy(true);
    try {
      const id = event?.id ?? crypto.randomUUID();
      await onSave({
        ...form,
        id,
        eventName: form.eventName.trim(),
        occurredAt: optIso(form.occurredAt),
        containedAt: optIso(form.containedAt),
        resolvedAt: optIso(form.resolvedAt),
        rootEventId: event?.rootEventId ?? id,
        carriedFromReportId: event?.carriedFromReportId,
        carriedFromEventId: event?.carriedFromEventId,
        escalatedIncidentId: event?.escalatedIncidentId,
        escalatedAt: event?.escalatedAt,
        escalatedBy: event?.escalatedBy,
        sourceIp: form.sourceIp.trim(),
        destinationIp: form.destinationIp.trim(),
        port: form.port.trim(),
        timestamp: new Date(form.timestamp).toISOString(),
        loggedBy: event?.loggedBy ?? currentUser.username,
        loggedById: event?.loggedById ?? currentUser.id,
        createdAt: event?.createdAt ?? ts,
        updatedAt: ts,
      });
    } finally {
      setBusy(false);
    }
  };

  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-red-500/50';
  const label = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest';

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="modal-entrance w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h3 className="text-lg font-black text-white flex items-center gap-2"><Crosshair className="w-5 h-5 text-red-400" /> {event ? t('Edit security event') : t('Log security event')}</h3>
          <button type="button" aria-label={t('Close')} onClick={onCancel} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid md:grid-cols-3 gap-4">
            <label className="space-y-1 md:col-span-2"><span className={label}>{t('Event name')} *</span>
              <input required value={form.eventName} onChange={e => set('eventName', e.target.value)} className={input} placeholder={t('e.g. SSH brute-force against bastion')} /></label>
            <label className="space-y-1"><span className={label}>{t('Detection time')} *</span>
              <input type="datetime-local" required value={form.timestamp} onChange={e => set('timestamp', e.target.value)} className={input} /></label>
            <label className="space-y-1"><span className={label}>{t('Source IP')}</span>
              <input value={form.sourceIp} onChange={e => set('sourceIp', e.target.value)} className={`${input} font-mono`} placeholder="203.0.113.45" /></label>
            <label className="space-y-1"><span className={label}>{t('Destination IP')}</span>
              <input value={form.destinationIp} onChange={e => set('destinationIp', e.target.value)} className={`${input} font-mono`} placeholder="10.0.1.10" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className={label}>{t('Target port')}</span>
                <input value={form.port} onChange={e => set('port', e.target.value)} className={`${input} font-mono`} placeholder="22" /></label>
              <label className="space-y-1"><span className={label}>{t('Protocol')}</span>
                <select value={form.protocol} onChange={e => set('protocol', e.target.value)} className={input}>
                  <option value="">—</option>{['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'DNS', 'SMB', 'RDP', 'SSH', 'Other'].map(p => <option key={p}>{p}</option>)}
                </select></label>
            </div>
            <label className="space-y-1 md:col-span-1"><span className={label}>{t('Attack type / vector')}</span>
              <input list="attack-types" value={form.attackType} onChange={e => set('attackType', e.target.value)} className={input} placeholder="Brute Force" />
              <datalist id="attack-types">{ATTACK_TYPES.map(a => <option key={a} value={a} />)}</datalist></label>
          </div>

          <fieldset>
            <legend className={`${label} mb-2`}>{t('Severity classification')}</legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SEVERITIES.map(s => (
                <label key={s} className={`cursor-pointer rounded-xl border p-3 transition-all ${form.severity === s ? SEVERITY_STYLE[s].badge + ' ring-1 ring-current' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>
                  <input type="radio" name="severity" value={s} checked={form.severity === s} onChange={() => set('severity', s)} className="sr-only" />
                  <span className="text-xs font-black uppercase tracking-widest">{t(s)}</span>
                  <span className="block text-[10px] mt-1 opacity-80 leading-snug">{t(SEVERITY_STYLE[s].meaning)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="rounded-2xl border border-zinc-800 p-4 space-y-3">
            <legend className={`${label} px-1`}>{t('Lifecycle & response times')}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Status')}>
              {EVENT_STATUSES.map(st => (
                <button type="button" key={st} role="radio" aria-checked={form.status === st} onClick={() => setStatus(st)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${form.status === st ? EVENT_STATUS_STYLE[st] + ' ring-1 ring-current' : 'border-zinc-800 text-zinc-500'}`}>{t(st)}</button>
              ))}
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <label className="space-y-1"><span className={label}>{t('First activity (optional)')}</span>
                <input type="datetime-local" value={form.occurredAt} onChange={e => set('occurredAt', e.target.value)} className={input} /></label>
              <label className="space-y-1"><span className={label}>{t('Contained at')}</span>
                <input type="datetime-local" value={form.containedAt} onChange={e => set('containedAt', e.target.value)} className={input} /></label>
              <label className="space-y-1"><span className={label}>{t('Resolved at')}</span>
                <input type="datetime-local" value={form.resolvedAt} onChange={e => set('resolvedAt', e.target.value)} className={input} /></label>
            </div>
            {preview && (
              <p className="text-[11px] text-zinc-400">
                {t('SLA ({sev}): contain by {c} · resolve by {r}', { sev: t(form.severity), c: new Date(preview.containDueAt).toLocaleString(), r: new Date(preview.resolveDueAt).toLocaleString() })}
                {preview.ttdMinutes !== null && <> · {t('time to detect')} <b>{formatMinutes(preview.ttdMinutes)}</b></>}
              </p>
            )}
          </fieldset>

          <label className="block space-y-1"><span className={label}>{t('Investigation / forensic findings')}</span>
            <textarea rows={4} value={form.investigation} onChange={e => set('investigation', e.target.value)} className={input} placeholder={t('Packet analysis, log correlation, IOCs, affected hosts…')} /></label>
          <label className="block space-y-1"><span className={label}>{t('Remediation actions')}</span>
            <textarea rows={3} value={form.remediation} onChange={e => set('remediation', e.target.value)} className={input} placeholder={t('Containment, blocking, patching, escalation…')} /></label>
          <label className="block space-y-1"><span className={label}>{t('SOC conclusion')}</span>
            <textarea rows={2} value={form.conclusion} onChange={e => set('conclusion', e.target.value)} className={input} placeholder={t('True positive / false positive, status, follow-up owner…')} /></label>

          {errors.length > 0 && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs space-y-1">
              {errors.map(e => <p key={e} className="flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {e}</p>)}
            </div>
          )}
        </div>
        <div className="p-6 border-t border-zinc-800 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 text-xs font-bold">{t('Cancel')}</button>
          <button disabled={busy} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold">{busy ? t('Syncing…') : event ? t('Update event') : t('Log event')}</button>
        </div>
      </form>
    </div>
  );
};

export default ShiftEventForm;
