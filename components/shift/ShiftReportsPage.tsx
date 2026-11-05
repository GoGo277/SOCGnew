import React, { useEffect, useMemo, useState } from 'react';
import { useEscape } from '../../lib/useEscape';
import { Plus, Search, Download, BarChart3, CheckSquare, Square, Crosshair, X, CheckCircle2, Hourglass } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { Alert, Asset, DfirCase, DutySchedule, HandoverAck, ReportTemplate, RolePermissions, ShiftReport, SlaPolicy, User } from '../../types';
import { SHIFTS, ShiftId, getActiveShift, getShift, toDateKey } from '../../lib/shifts';
import { shiftReportService, reportId } from '../../services/shiftReportService';
import { handoverService } from '../../services/handoverService';
import { computeMetrics, filterReports, presetRange, RangePreset, SEVERITIES, SEVERITY_STYLE } from '../../services/analytics';
import { evaluateSla, isOpenItem } from '../../lib/sla';
import ShiftReportEditor, { ReportStatusBadge } from './ShiftReportEditor';
import HandoverPanel from './HandoverPanel';
import ReportCustomizer from '../ReportCustomizer';
import { useT } from '../../i18n';

interface Props {
  reports: ShiftReport[];
  acks: HandoverAck[];
  schedules: Record<string, DutySchedule>;
  assets: Asset[];
  templates: ReportTemplate[];
  sla: SlaPolicy;
  currentUser: User;
  permissions: RolePermissions;
  focusReportId?: string | null;
  onFocusConsumed?: () => void;
  onToast: (msg: string) => void;
  alerts: Alert[];
  cases: DfirCase[];
  onOpenAlert?: (id: string) => void;
}

const breachCount = (r: ShiftReport, sla: SlaPolicy) =>
  r.events.filter(e => { const s = evaluateSla(e, sla); return s.contain === 'breached' || s.resolve === 'breached'; }).length;

const ShiftReportsPage: React.FC<Props> = ({ reports, acks, schedules, assets, templates, sla, currentUser, permissions, focusReportId, onFocusConsumed, onToast, alerts, cases, onOpenAlert }) => {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [preset, setPreset] = useState<RangePreset>('30d');
  const [custom, setCustom] = useState({ from: toDateKey(new Date()), to: toDateKey(new Date()) });
  const [status, setStatus] = useState<'all' | 'draft' | 'finalized'>('all');
  const [shiftF, setShiftF] = useState<'all' | ShiftId>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [exportFor, setExportFor] = useState<ShiftReport[] | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (focusReportId) { setOpenId(focusReportId); onFocusConsumed?.(); }
  }, [focusReportId]); // eslint-disable-line react-hooks/exhaustive-deps

  const canLog = permissions.canLogShiftEvents !== false;
  const canExport = permissions.canExportReports !== false;
  const ackIds = useMemo(() => new Set(acks.map(a => a.reportId)), [acks]);
  const handover = handoverService.currentStatus(reports, acks, schedules, currentUser);

  const filtered = useMemo(() => {
    const range = presetRange(preset, custom);
    const ql = q.toLowerCase();
    return filterReports(reports, range).filter(r =>
      (status === 'all' || r.status === status) &&
      (shiftF === 'all' || r.shift === shiftF) &&
      (!ql || r.title.toLowerCase().includes(ql) || r.events.some(e =>
        [e.eventName, e.sourceIp, e.destinationIp, e.attackType].some(v => (v || '').toLowerCase().includes(ql))))
    );
  }, [reports, preset, custom, status, shiftF, q]);

  const openReport = reports.find(r => r.id === openId) ?? null;
  const selectedReports = reports.filter(r => selected.includes(r.id));
  const active = getActiveShift();

  const startCurrentShift = async () => {
    const r = await shiftReportService.create(currentUser, active.dateKey, active.shift.id, reports);
    setOpenId(r.id);
  };

  const customizer = exportFor && <ReportCustomizer reports={exportFor} acks={acks} templates={templates} sla={sla} currentUser={currentUser} onClose={() => setExportFor(null)} onDone={onToast} />;

  if (openReport) {
    return (
      <>
        <ShiftReportEditor report={openReport} reports={reports} acks={acks} assets={assets} sla={sla} currentUser={currentUser} permissions={permissions}
          onBack={() => setOpenId(null)} onToast={onToast} onExport={() => setExportFor([openReport])} alerts={alerts} cases={cases} onOpenAlert={onOpenAlert} />
        {customizer}
      </>
    );
  }

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const allSelected = filtered.length > 0 && filtered.every(r => selected.includes(r.id));
  const control = 'bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 font-bold';

  const AckState: React.FC<{ r: ShiftReport }> = ({ r }) => r.status !== 'finalized' ? <span className="text-[10px] text-zinc-600">—</span> : ackIds.has(r.id)
    ? <span className="inline-flex items-center gap-1 text-[10px] text-sky-300"><CheckCircle2 className="w-3 h-3" /> {t('Acknowledged')}</span>
    : <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500"><Hourglass className="w-3 h-3" /> {t('Pending')}</span>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h3 className="text-2xl sm:text-3xl font-black text-white">{t('Shift Reports')}</h3>
          <p className="text-zinc-500 text-sm">{t('Incident logging, threat triage, draft sync and immutable finalization')}</p>
        </div>
        {canLog && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setNewOpen(true)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-700 flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> {t('Report for date…')}</button>
            <button onClick={startCurrentShift} className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 flex items-center gap-2">
              <Crosshair className="w-4 h-4" /> {t('Open current shift ({shift})', { shift: t(active.shift.label) })}
            </button>
          </div>
        )}
      </div>

      <HandoverPanel status={handover} acks={acks} currentUser={currentUser} sla={sla} canAcknowledge={canLog} onToast={onToast} onOpenReport={setOpenId} />

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/30 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[200px] bg-zinc-900/50 px-3 py-2 rounded-xl border border-zinc-800">
            <Search className="w-4 h-4 text-zinc-500" />
            <input aria-label={t('Search')} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search title, event, IP, vector…')} className="bg-transparent outline-none text-sm text-zinc-200 w-full" />
          </div>
          <select aria-label={t('Date range')} value={preset} onChange={e => setPreset(e.target.value as RangePreset)} className={control}>
            <option value="today">{t('Today')}</option><option value="7d">{t('Last 7 days')}</option><option value="30d">{t('Last 30 days')}</option><option value="custom">{t('Custom range')}</option><option value="all">{t('All time')}</option>
          </select>
          {preset === 'custom' && (
            <>
              <input type="date" aria-label={t('From')} value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className={control} />
              <input type="date" aria-label={t('To')} value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className={control} />
            </>
          )}
          <select aria-label={t('Status')} value={status} onChange={e => setStatus(e.target.value as any)} className={control}>
            <option value="all">{t('All status')}</option><option value="draft">{t('Drafts')}</option><option value="finalized">{t('Finalized')}</option>
          </select>
          <select aria-label={t('Shift')} value={shiftF} onChange={e => setShiftF(e.target.value as any)} className={control}>
            <option value="all">{t('All shifts')}</option>{SHIFTS.map(s => <option key={s.id} value={s.id}>{t(s.label)}</option>)}
          </select>
        </div>

        {selected.length > 0 && (
          <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/20 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-blue-300">{t('{n} selected', { n: selected.length })}</span>
            {canExport && <button onClick={() => setExportFor(selectedReports)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> {t('Export ZIP')}</button>}
            <button disabled={selected.length < 2} onClick={() => setCompareOpen(true)} className="px-3 py-1.5 rounded-lg bg-zinc-800 disabled:opacity-40 text-zinc-200 text-xs font-bold flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> {t('Compare')}</button>
            <button onClick={() => setSelected([])} className="text-xs text-zinc-500 hover:text-white">{t('Clear')}</button>
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] font-bold text-zinc-500 uppercase">
                <th className="p-4 w-10"><button aria-label={t('Select all')} onClick={() => setSelected(allSelected ? [] : filtered.map(r => r.id))} className="text-zinc-500">{allSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}</button></th>
                <th className="p-4">{t('Report')}</th><th className="p-4">{t('Shift')}</th><th className="p-4">{t('Events')}</th>
                <th className="p-4">{t('Open')}</th><th className="p-4">{t('SLA breaches')}</th><th className="p-4">{t('Criticality')}</th><th className="p-4">{t('Handover')}</th><th className="p-4 text-right">{t('Status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filtered.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm text-zinc-500">{t('No shift reports match the current filters.')}</td></tr>}
              {filtered.map(r => {
                const m = computeMetrics([r], null, sla);
                const s = getShift(r.shift);
                const br = breachCount(r, sla);
                return (
                  <tr key={r.id} className="tactical-row hover:bg-red-500/[0.03] cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <td className="p-4" onClick={e => { e.stopPropagation(); toggle(r.id); }}>
                      <button aria-label={t('Select {id}', { id: r.id })}>{selected.includes(r.id) ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 text-zinc-600" />}</button>
                    </td>
                    <td className="p-4"><p className="font-bold text-sm text-zinc-200">{r.title}</p><p className="text-[10px] text-zinc-500 font-mono">{r.id} · rev {r.revision}</p></td>
                    <td className="p-4"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold whitespace-nowrap ${s.badge}`}>{t(s.label)}</span></td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-white mr-1">{m.totalEvents}</span>
                        {SEVERITIES.map(sev => m.bySeverity[sev] > 0 && <span key={sev} className={`text-[9px] px-1.5 rounded border font-bold ${SEVERITY_STYLE[sev].badge}`}>{t(sev)[0]}{m.bySeverity[sev]}</span>)}
                        {m.carriedEvents > 0 && <span className="text-[9px] px-1.5 rounded border border-violet-500/30 text-violet-300">+{m.carriedEvents} {t('carried')}</span>}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-bold text-zinc-300">{r.events.filter(isOpenItem).length}</td>
                    <td className={`p-4 text-sm font-bold ${br ? 'text-red-400' : 'text-zinc-500'}`}>{br}</td>
                    <td className="p-4 text-sm font-bold text-zinc-300">{m.criticalityIndex}%</td>
                    <td className="p-4"><AckState r={r} /></td>
                    <td className="p-4 text-right"><ReportStatusBadge r={r} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <ul className="md:hidden divide-y divide-zinc-800/60">
          {filtered.length === 0 && <li className="p-8 text-center text-sm text-zinc-500">{t('No shift reports match the current filters.')}</li>}
          {filtered.map(r => {
            const m = computeMetrics([r], null, sla);
            const s = getShift(r.shift);
            return (
              <li key={r.id} className="p-4 flex gap-3">
                <button aria-label={t('Select {id}', { id: r.id })} onClick={() => toggle(r.id)} className="pt-0.5">{selected.includes(r.id) ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 text-zinc-600" />}</button>
                <button className="flex-1 text-left min-w-0 space-y-1.5" onClick={() => setOpenId(r.id)}>
                  <p className="font-bold text-sm text-zinc-100">{r.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ReportStatusBadge r={r} />
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${s.badge}`}>{t(s.label)}</span>
                    <AckState r={r} />
                  </div>
                  <p className="text-[11px] text-zinc-500">{t('{n} events', { n: m.totalEvents })} · {t('{n} open', { n: r.events.filter(isOpenItem).length })} · {t('{n} SLA breaches', { n: breachCount(r, sla) })} · {m.criticalityIndex}%</p>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {newOpen && <NewReportModal reports={reports} currentUser={currentUser} onClose={() => setNewOpen(false)} onCreated={id => { setNewOpen(false); setOpenId(id); }} />}
      {customizer}
      {compareOpen && <ComparativeAnalysis reports={selectedReports} sla={sla} onClose={() => setCompareOpen(false)} />}
    </div>
  );
};

const NewReportModal: React.FC<{ reports: ShiftReport[]; currentUser: User; onClose: () => void; onCreated: (id: string) => void }> = ({ reports, currentUser, onClose, onCreated }) => {
  const t = useT();
  useEscape(onClose);
  const [date, setDate] = useState(toDateKey(new Date()));
  const [shift, setShift] = useState<ShiftId>(getActiveShift().shift.id);
  const exists = reports.find(r => r.id === reportId(date, shift));
  const create = async () => onCreated((await shiftReportService.create(currentUser, date, shift, reports)).id);
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('Open shift report')} onClick={onClose}>
      <div className="modal-entrance w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-white">{t('Open shift report')}</h3>
        <label className="block space-y-1"><span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('Date')}</span>
          <input type="date" value={date} max={toDateKey(new Date())} onChange={e => setDate(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white" /></label>
        <div className="grid grid-cols-3 gap-2">
          {SHIFTS.map(s => (
            <button key={s.id} onClick={() => setShift(s.id)} aria-pressed={shift === s.id} className={`p-3 rounded-xl border text-left ${shift === s.id ? s.badge : 'border-zinc-800 text-zinc-500'}`}>
              <span className="block text-xs font-black">{t(s.label)}</span><span className="text-[10px] font-mono">{s.timing}</span>
            </button>
          ))}
        </div>
        {exists && <p className="text-xs text-amber-400">{t('A report already exists for this shift ({status}). It will be opened.', { status: t(exists.status) })}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 font-bold">{t('Cancel')}</button>
          <button onClick={create} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">{exists ? t('Open') : t('Create draft')}</button>
        </div>
      </div>
    </div>
  );
};

const ComparativeAnalysis: React.FC<{ reports: ShiftReport[]; sla: SlaPolicy; onClose: () => void }> = ({ reports, sla, onClose }) => {
  const t = useT();
  useEscape(onClose);
  const rows = useMemo(() => [...reports].sort((a, b) => (a.date + a.shift).localeCompare(b.date + b.shift)).map(r => ({ r, m: computeMetrics([r], null, sla) })), [reports, sla]);
  const agg = useMemo(() => computeMetrics(reports, null, sla), [reports, sla]);
  const chart = rows.map(({ r, m }) => ({ name: `${r.date.slice(5)} ${t(getShift(r.shift).label).slice(0, 1)}`, ...m.bySeverity }));
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={t('Comparative multi-report analysis')}>
      <div className="modal-entrance w-full max-w-6xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h3 className="text-lg font-black text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-400" /> {t('Comparative multi-report analysis')}</h3>
          <button aria-label={t('Close')} onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[[t('Reports'), reports.length], [t('Total events'), agg.totalEvents], [t('Aggregate criticality'), `${agg.criticalityIndex}%`], [t('SLA compliance'), agg.sla.compliancePct === null ? '—' : `${agg.sla.compliancePct}%`], [t('Top vector'), agg.topAttackTypes[0]?.name ?? '—']].map(([k, v]) => (
              <div key={String(k)} className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800"><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{k}</p><p className="text-xl font-black text-white truncate">{v}</p></div>
            ))}
          </div>
          <div className="h-72 bg-zinc-950/40 rounded-2xl border border-zinc-800 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--app-surface)', border: '1px solid var(--color-zinc-700)', borderRadius: 8, color: 'var(--color-zinc-100)' }} />
                <Legend />
                {SEVERITIES.map(s => <Bar key={s} dataKey={s} name={t(s)} stackId="a" fill={SEVERITY_STYLE[s].hex} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[860px]">
              <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase text-[10px]">
                <th className="p-2">{t('Report')}</th><th className="p-2">{t('Status')}</th><th className="p-2">{t('Events')}</th>{SEVERITIES.map(s => <th key={s} className="p-2">{t(s)}</th>)}<th className="p-2">{t('Criticality')}</th><th className="p-2">{t('SLA compliance')}</th><th className="p-2">{t('Top vector')}</th><th className="p-2">{t('Top hostile IP')}</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {rows.map(({ r, m }) => (
                  <tr key={r.id}><td className="p-2 font-bold">{r.date} · {t(getShift(r.shift).label)}</td><td className="p-2"><ReportStatusBadge r={r} /></td><td className="p-2">{m.totalEvents}</td>
                    {SEVERITIES.map(s => <td key={s} className="p-2">{m.bySeverity[s]}</td>)}
                    <td className="p-2 font-bold">{m.criticalityIndex}%</td><td className="p-2">{m.sla.compliancePct === null ? '—' : `${m.sla.compliancePct}%`}</td><td className="p-2">{m.topAttackTypes[0]?.name ?? '—'}</td><td className="p-2 font-mono">{m.topSourceIps[0]?.name ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShiftReportsPage;
