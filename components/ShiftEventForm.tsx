import React, { useState } from 'react';
import { X, Crosshair, AlertCircle } from 'lucide-react';
import { Severity, ShiftEvent, User } from '../types';
import { ATTACK_TYPES, SEVERITIES, SEVERITY_STYLE } from '../services/analytics';
import { isValidIp, isValidPort } from '../services/shiftReportService';

interface Props {
  event: ShiftEvent | null;
  currentUser: User;
  defaultDate: string; // YYYY-MM-DD of the report
  onSave: (event: ShiftEvent) => Promise<void> | void;
  onCancel: () => void;
}

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ShiftEventForm: React.FC<Props> = ({ event, currentUser, defaultDate, onSave, onCancel }) => {
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
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (!form.eventName.trim()) errs.push('Event name is required');
    if (!form.timestamp || isNaN(new Date(form.timestamp).getTime())) errs.push('A valid timestamp is required');
    if (!isValidIp(form.sourceIp)) errs.push('Source IP is not a valid IPv4/IPv6 address');
    if (!isValidIp(form.destinationIp)) errs.push('Destination IP is not a valid IPv4/IPv6 address');
    if (!isValidPort(form.port)) errs.push('Port must be 0-65535 (lists and ranges allowed, e.g. 80,443 or 1000-2000)');
    setErrors(errs);
    if (errs.length) return;
    const ts = new Date().toISOString();
    setBusy(true);
    try {
      await onSave({
        id: event?.id ?? crypto.randomUUID(),
        ...form,
        eventName: form.eventName.trim(),
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
          <h3 className="text-lg font-black text-white flex items-center gap-2"><Crosshair className="w-5 h-5 text-red-400" /> {event ? 'Edit security event' : 'Log security event'}</h3>
          <button type="button" aria-label="Close" onClick={onCancel} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-5">
          <div className="grid md:grid-cols-3 gap-4">
            <label className="space-y-1 md:col-span-2"><span className={label}>Event name *</span>
              <input required value={form.eventName} onChange={e => set('eventName', e.target.value)} className={input} placeholder="e.g. SSH brute-force against bastion" /></label>
            <label className="space-y-1"><span className={label}>Timestamp *</span>
              <input type="datetime-local" required value={form.timestamp} onChange={e => set('timestamp', e.target.value)} className={input} /></label>
            <label className="space-y-1"><span className={label}>Source IP</span>
              <input value={form.sourceIp} onChange={e => set('sourceIp', e.target.value)} className={`${input} font-mono`} placeholder="203.0.113.45" /></label>
            <label className="space-y-1"><span className={label}>Destination IP</span>
              <input value={form.destinationIp} onChange={e => set('destinationIp', e.target.value)} className={`${input} font-mono`} placeholder="10.0.1.10" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1"><span className={label}>Target port</span>
                <input value={form.port} onChange={e => set('port', e.target.value)} className={`${input} font-mono`} placeholder="22" /></label>
              <label className="space-y-1"><span className={label}>Protocol</span>
                <select value={form.protocol} onChange={e => set('protocol', e.target.value)} className={input}>
                  <option value="">—</option>{['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'DNS', 'SMB', 'RDP', 'SSH', 'Other'].map(p => <option key={p}>{p}</option>)}
                </select></label>
            </div>
            <label className="space-y-1 md:col-span-1"><span className={label}>Attack type / vector</span>
              <input list="attack-types" value={form.attackType} onChange={e => set('attackType', e.target.value)} className={input} placeholder="Brute Force" />
              <datalist id="attack-types">{ATTACK_TYPES.map(a => <option key={a} value={a} />)}</datalist></label>
          </div>

          <fieldset>
            <legend className={`${label} mb-2`}>Severity classification</legend>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {SEVERITIES.map(s => (
                <label key={s} className={`cursor-pointer rounded-xl border p-3 transition-all ${form.severity === s ? SEVERITY_STYLE[s].badge + ' ring-1 ring-current' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700'}`}>
                  <input type="radio" name="severity" value={s} checked={form.severity === s} onChange={() => set('severity', s)} className="sr-only" />
                  <span className="text-xs font-black uppercase tracking-widest">{s}</span>
                  <span className="block text-[10px] mt-1 opacity-80 leading-snug">{SEVERITY_STYLE[s].meaning}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="block space-y-1"><span className={label}>Investigation / forensic findings</span>
            <textarea rows={4} value={form.investigation} onChange={e => set('investigation', e.target.value)} className={input} placeholder="Packet analysis, log correlation, IOCs, affected hosts…" /></label>
          <label className="block space-y-1"><span className={label}>Remediation actions</span>
            <textarea rows={3} value={form.remediation} onChange={e => set('remediation', e.target.value)} className={input} placeholder="Containment, blocking, patching, escalation…" /></label>
          <label className="block space-y-1"><span className={label}>SOC conclusion</span>
            <textarea rows={2} value={form.conclusion} onChange={e => set('conclusion', e.target.value)} className={input} placeholder="True positive / false positive, status, follow-up owner…" /></label>

          {errors.length > 0 && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs space-y-1">
              {errors.map(e => <p key={e} className="flex items-center gap-2"><AlertCircle className="w-3.5 h-3.5" /> {e}</p>)}
            </div>
          )}
        </div>
        <div className="p-6 border-t border-zinc-800 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-xl border border-zinc-800 text-zinc-400 text-xs font-bold">Cancel</button>
          <button disabled={busy} className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-bold">{busy ? 'Syncing…' : event ? 'Update event' : 'Log event'}</button>
        </div>
      </form>
    </div>
  );
};

export default ShiftEventForm;
