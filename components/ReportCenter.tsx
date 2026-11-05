import React, { useMemo, useState } from 'react';
import { useEscape } from '../lib/useEscape';
import { CalendarClock, Archive, LayoutTemplate, Plus, Play, Edit3, Trash2, X, Download, ShieldCheck, ShieldX, Mail, Eye } from 'lucide-react';
import { ArchivedReport, HandoverAck, ReportSchedule, ReportTemplate, ScheduleFrequency, ShiftReport, SlaPolicy, User } from '../types';
import { scheduleService } from '../services/scheduleService';
import { templateService } from '../services/templateService';
import { downloadBlob } from '../services/reportExport';
import { realtimeStore } from '../services/realtimeStore';
import { markdownToHtml, MARKDOWN_CSS } from '../lib/markdown';
import { sha256 } from '../lib/crypto';
import { useI18n } from '../i18n';

interface Props {
  schedules: ReportSchedule[];
  archive: ArchivedReport[];
  templates: ReportTemplate[];
  reports: ShiftReport[];
  acks: HandoverAck[];
  sla: SlaPolicy;
  currentUser: User;
  canManage: boolean;
  onToast: (m: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const ReportCenter: React.FC<Props> = ({ schedules, archive, templates, reports, acks, sla, currentUser, canManage, onToast }) => {
  const { t } = useI18n();
  const [tab, setTab] = useState<'schedules' | 'archive' | 'templates'>('schedules');
  const [editing, setEditing] = useState<ReportSchedule | 'new' | null>(null);
  const [viewing, setViewing] = useState<ArchivedReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const describe = (s: ReportSchedule) => {
    const at = `${String(s.hour).padStart(2, '0')}:00`;
    if (s.frequency === 'daily') return t('Daily at {at}', { at });
    if (s.frequency === 'weekly') return t('Weekly on {day} at {at}', { day: t(WEEKDAYS[s.dayOfWeek ?? 1]), at });
    return t('Monthly on day {d} at {at}', { d: s.dayOfMonth ?? 1, at });
  };

  const runNow = async (s: ReportSchedule) => {
    setBusy(s.id);
    try {
      const entry = await scheduleService.run(currentUser.username, s, { reports, acks, sla, templates }, { manual: true, actor: currentUser });
      onToast(t('Report generated for {from} → {to}', { from: entry.periodFrom, to: entry.periodTo }));
      setTab('archive');
    } catch (e: any) { onToast(e.message); } finally { setBusy(null); }
  };

  const toggle = async (s: ReportSchedule) => {
    const { id, createdAt, createdBy, updatedAt, nextRunAt, lastRunAt, ...rest } = s;
    await scheduleService.save(currentUser, { ...rest, enabled: !s.enabled }, s);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-2xl sm:text-3xl font-black text-white">{t('Report Center')}</h3>
          <p className="text-zinc-500 text-sm">{t('Scheduled executive briefs and shift digests, delivery archive and report templates')}</p>
        </div>
        {canManage && tab === 'schedules' && (
          <button onClick={() => setEditing('new')} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> {t('New schedule')}</button>
        )}
      </div>

      <div className="flex flex-wrap bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit" role="tablist">
        {([['schedules', t('Schedules'), CalendarClock, schedules.length], ['archive', t('Archive'), Archive, archive.length], ['templates', t('Templates'), LayoutTemplate, templates.length]] as const).map(([k, l, Icon, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 ${tab === k ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}>
            <Icon className="w-4 h-4" /> {l} <span className="opacity-60">{n}</span>
          </button>
        ))}
      </div>

      {!realtimeStore.isCloud() && tab === 'schedules' && (
        <p className="text-xs text-amber-300 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-center gap-2"><Mail className="w-4 h-4 shrink-0" />
          {t('Local mode: due schedules run while the platform is open and are stored in the archive. Email delivery requires cloud mode (Cloud Functions + Trigger Email).')}</p>
      )}

      {tab === 'schedules' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {schedules.length === 0 ? <p className="p-10 text-center text-sm text-zinc-500">{t('No scheduled reports yet.')}</p> : (
            <ul className="divide-y divide-zinc-800/60">
              {schedules.map(s => (
                <li key={s.id} className="p-4 sm:p-5 flex flex-wrap items-center gap-4">
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm font-bold text-white flex items-center gap-2">{s.name}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded border font-black uppercase ${s.enabled ? 'text-emerald-300 border-emerald-500/30' : 'text-zinc-500 border-zinc-700'}`}>{s.enabled ? t('Active') : t('Paused')}</span>
                    </p>
                    <p className="text-[11px] text-zinc-400">{t(s.kind === 'executive_brief' ? 'Executive brief' : 'Shift digest')} · {describe(s)} · {s.recipients.length ? s.recipients.join(', ') : t('archive only')}</p>
                    <p className="text-[11px] text-zinc-500">{t('Next run')}: {s.enabled ? new Date(s.nextRunAt).toLocaleString() : '—'}{s.lastRunAt ? ` · ${t('Last run')}: ${new Date(s.lastRunAt).toLocaleString()}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button disabled={busy === s.id} onClick={() => runNow(s)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> {t('Run now')}</button>
                    {canManage && (
                      <>
                        <button onClick={() => toggle(s)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 text-xs font-bold">{s.enabled ? t('Pause') : t('Resume')}</button>
                        <button aria-label={t('Edit schedule')} onClick={() => setEditing(s)} className="p-2 rounded-lg text-zinc-500 hover:text-blue-400"><Edit3 className="w-4 h-4" /></button>
                        <button aria-label={t('Delete schedule')} onClick={async () => { if (confirm(t('Delete schedule "{name}"?', { name: s.name }))) await scheduleService.remove(currentUser, s); }} className="p-2 rounded-lg text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'archive' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {archive.length === 0 ? <p className="p-10 text-center text-sm text-zinc-500">{t('No generated reports yet.')}</p> : (
            <ul className="divide-y divide-zinc-800/60">
              {archive.slice(0, 100).map(a => (
                <li key={a.id} className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <p className="text-sm font-bold text-white">{a.scheduleName} <span className="text-zinc-500 font-normal text-xs">{a.periodFrom} → {a.periodTo}</span></p>
                    <p className="text-[11px] text-zinc-500">{t('Generated {time} by {by}', { time: new Date(a.generatedAt).toLocaleString(), by: a.generatedBy })} · {a.delivery === 'queued' ? t('emailed to {n} recipient(s)', { n: a.recipients.length }) : t('archived')}</p>
                    <p className="text-[10px] text-zinc-600 font-mono break-all">SHA-256 {a.sha256}</p>
                  </div>
                  <button onClick={() => setViewing(a)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> {t('View')}</button>
                  <button onClick={() => downloadBlob(new Blob([a.markdown], { type: 'text/markdown' }), `GEYES_${a.scheduleName.replace(/\W+/g, '_')}_${a.periodTo}.md`)} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> .md</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <p className="px-4 pt-4 text-[11px] text-zinc-500">{t('Templates are created from the report customizer ("Save as template") and can be applied to exports and shift digests.')}</p>
          {templates.length === 0 ? <p className="p-10 text-center text-sm text-zinc-500">{t('No templates yet.')}</p> : (
            <ul className="divide-y divide-zinc-800/60">
              {templates.map(x => (
                <li key={x.id} className="p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-sm font-bold text-white">{x.name}</p>
                    <p className="text-[11px] text-zinc-500">{x.options.classification} · {t('{n} custom section(s)', { n: x.options.customSections.length })} · {t('by {user}', { user: x.createdBy })} · {new Date(x.updatedAt).toLocaleDateString()}</p>
                  </div>
                  {(canManage || x.createdBy === currentUser.username) && (
                    <button aria-label={t('Delete template')} onClick={async () => { if (confirm(t('Delete template "{name}"?', { name: x.name }))) await templateService.remove(currentUser, x); }} className="p-2 rounded-lg text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editing && <ScheduleEditor schedule={editing === 'new' ? null : editing} templates={templates} currentUser={currentUser} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onToast(t('Schedule saved')); }} />}
      {viewing && <ArchiveViewer entry={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
};

const ScheduleEditor: React.FC<{ schedule: ReportSchedule | null; templates: ReportTemplate[]; currentUser: User; onClose: () => void; onSaved: () => void }> = ({ schedule, templates, currentUser, onClose, onSaved }) => {
  const { t } = useI18n();
  useEscape(onClose);
  const [form, setForm] = useState({
    name: schedule?.name ?? '',
    kind: schedule?.kind ?? 'executive_brief' as ReportSchedule['kind'],
    frequency: schedule?.frequency ?? 'weekly' as ScheduleFrequency,
    dayOfWeek: schedule?.dayOfWeek ?? 1,
    dayOfMonth: schedule?.dayOfMonth ?? 1,
    hour: schedule?.hour ?? 7,
    recipients: (schedule?.recipients ?? []).join(', '),
    templateId: schedule?.templateId ?? '',
    includeDrafts: schedule?.includeDrafts ?? false,
    enabled: schedule?.enabled ?? true,
  });
  const [error, setError] = useState('');
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setError('');
    try {
      await scheduleService.save(currentUser, {
        name: form.name, kind: form.kind, frequency: form.frequency,
        dayOfWeek: form.frequency === 'weekly' ? Number(form.dayOfWeek) : undefined,
        dayOfMonth: form.frequency === 'monthly' ? Number(form.dayOfMonth) : undefined,
        hour: Number(form.hour),
        recipients: form.recipients.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean),
        templateId: form.templateId || undefined,
        includeDrafts: form.includeDrafts,
        enabled: form.enabled,
      }, schedule ?? undefined);
      onSaved();
    } catch (e: any) { setError(e.message); }
  };

  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50';
  const label = 'text-[10px] font-black text-zinc-500 uppercase tracking-widest';
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="sched-title">
      <div className="modal-entrance w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h3 id="sched-title" className="text-lg font-black text-white flex items-center gap-2"><CalendarClock className="w-5 h-5 text-blue-400" /> {schedule ? t('Edit schedule') : t('New schedule')}</h3>
          <button aria-label={t('Close')} onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <label className="block space-y-1"><span className={label}>{t('Name')}</span><input value={form.name} onChange={e => set('name', e.target.value)} className={input} placeholder={t('e.g. Weekly CISO brief')} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className={label}>{t('Report')}</span>
              <select value={form.kind} onChange={e => set('kind', e.target.value as any)} className={input}>
                <option value="executive_brief">{t('Executive brief')}</option><option value="shift_digest">{t('Shift digest')}</option>
              </select></label>
            <label className="space-y-1"><span className={label}>{t('Frequency')}</span>
              <select value={form.frequency} onChange={e => set('frequency', e.target.value as ScheduleFrequency)} className={input}>
                <option value="daily">{t('Daily')}</option><option value="weekly">{t('Weekly')}</option><option value="monthly">{t('Monthly')}</option>
              </select></label>
            {form.frequency === 'weekly' && (
              <label className="space-y-1"><span className={label}>{t('Day')}</span>
                <select value={form.dayOfWeek} onChange={e => set('dayOfWeek', Number(e.target.value))} className={input}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}</select></label>
            )}
            {form.frequency === 'monthly' && (
              <label className="space-y-1"><span className={label}>{t('Day of month')}</span>
                <select value={form.dayOfMonth} onChange={e => set('dayOfMonth', Number(e.target.value))} className={input}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
            )}
            <label className="space-y-1"><span className={label}>{t('Hour (local)')}</span>
              <select value={form.hour} onChange={e => set('hour', Number(e.target.value))} className={input}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>)}</select></label>
          </div>
          <label className="block space-y-1"><span className={label}>{t('Recipients (comma separated)')}</span><input value={form.recipients} onChange={e => set('recipients', e.target.value)} className={input} placeholder="ciso@company.com, soc-leads@company.com" /></label>
          {form.kind === 'shift_digest' && (
            <label className="block space-y-1"><span className={label}>{t('Template')}</span>
              <select value={form.templateId} onChange={e => set('templateId', e.target.value)} className={input}>
                <option value="">{t('— Default —')}</option>{templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select></label>
          )}
          {form.kind === 'executive_brief' && (
            <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" className="accent-blue-500" checked={form.includeDrafts} onChange={e => set('includeDrafts', e.target.checked)} /> {t('Include draft reports')}</label>
          )}
          <label className="flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" className="accent-blue-500" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} /> {t('Enabled')}</label>
          <p className="text-[11px] text-zinc-500">{t('Each run covers the full period that ended at the run time (previous day, week or month).')}</p>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="p-6 border-t border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 font-bold">{t('Cancel')}</button>
          <button onClick={save} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold">{t('Save schedule')}</button>
        </div>
      </div>
    </div>
  );
};

const ArchiveViewer: React.FC<{ entry: ArchivedReport; onClose: () => void }> = ({ entry, onClose }) => {
  const { t } = useI18n();
  useEscape(onClose);
  const [verified, setVerified] = useState<boolean | null>(null);
  const html = useMemo(() => markdownToHtml(entry.markdown), [entry.markdown]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={entry.scheduleName}>
      <div className="modal-entrance w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5 border-b border-zinc-800">
          <div><h3 className="text-base font-black text-white">{entry.scheduleName}</h3><p className="text-xs text-zinc-500">{entry.periodFrom} → {entry.periodTo}</p></div>
          <div className="flex items-center gap-2">
            {verified !== null && (verified
              ? <span className="text-xs text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> {t('Integrity verified')}</span>
              : <span className="text-xs text-red-400 flex items-center gap-1"><ShieldX className="w-4 h-4" /> {t('HASH MISMATCH')}</span>)}
            <button onClick={async () => setVerified((await sha256(entry.markdown)) === entry.sha256)} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 text-xs font-bold">{t('Verify integrity')}</button>
            <button aria-label={t('Close')} onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <style>{MARKDOWN_CSS}</style>
        <div className="md p-6 overflow-y-auto text-zinc-200" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
};

export default ReportCenter;
