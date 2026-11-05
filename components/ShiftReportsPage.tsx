import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FileText, Plus, Search, Lock, Unlock, CloudUpload, ShieldCheck, ShieldX, Trash2, Edit3,
  ArrowLeft, Download, BarChart3, CheckSquare, Square, AlertTriangle, Clock, Users, Crosshair, X,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from 'recharts';
import { RolePermissions, ShiftEvent, ShiftReport, User } from '../types';
import { SHIFTS, ShiftId, getActiveShift, getShift, toDateKey } from '../lib/shifts';
import { shiftReportService, reportId } from '../services/shiftReportService';
import { computeMetrics, filterReports, presetRange, RangePreset, SEVERITIES, SEVERITY_STYLE } from '../services/analytics';
import ShiftEventForm from './ShiftEventForm';
import ReportCustomizer from './ReportCustomizer';

interface Props {
  reports: ShiftReport[];
  currentUser: User;
  permissions: RolePermissions;
  onToast: (msg: string) => void;
}

const statusBadge = (r: ShiftReport) =>
  r.status === 'finalized'
    ? <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border-emerald-500/30"><Lock className="w-2.5 h-2.5" /> Finalized</span>
    : <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-widest bg-amber-500/10 text-amber-400 border-amber-500/30"><Unlock className="w-2.5 h-2.5" /> Draft</span>;

const ShiftReportsPage: React.FC<Props> = ({ reports, currentUser, permissions, onToast }) => {
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

  const canLog = permissions.canLogShiftEvents !== false;
  const canExport = permissions.canExportReports !== false;

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

  if (openReport) {
    return (
      <>
        <ShiftReportEditor
          report={openReport}
          currentUser={currentUser}
          permissions={permissions}
          onBack={() => setOpenId(null)}
          onToast={onToast}
          onExport={() => setExportFor([openReport])}
        />
        {exportFor && <ReportCustomizer reports={exportFor} currentUser={currentUser} onClose={() => setExportFor(null)} onDone={onToast} />}
      </>
    );
  }

  const toggle = (id: string) => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]));
  const allSelected = filtered.length > 0 && filtered.every(r => selected.includes(r.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h3 className="text-3xl font-black text-white">Shift Reports</h3>
          <p className="text-zinc-500 text-sm">Incident logging, threat triage, draft sync and immutable finalization</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canLog && (
            <>
              <button onClick={() => setNewOpen(true)} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-700 flex items-center gap-2"><Plus className="w-3.5 h-3.5" /> Report for date…</button>
              <button onClick={startCurrentShift} className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-red-500/20 flex items-center gap-2">
                <Crosshair className="w-4 h-4" /> Open current shift ({active.shift.label.replace(' Shift', '')})
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/30 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[240px] bg-zinc-900/50 px-3 py-2 rounded-xl border border-zinc-800">
            <Search className="w-4 h-4 text-zinc-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search title, event, IP, vector…" className="bg-transparent outline-none text-sm text-zinc-200 w-full" />
          </div>
          <select value={preset} onChange={e => setPreset(e.target.value as RangePreset)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 font-bold">
            <option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="custom">Custom range</option><option value="all">All time</option>
          </select>
          {preset === 'custom' && (
            <>
              <input type="date" value={custom.from} onChange={e => setCustom(c => ({ ...c, from: e.target.value }))} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
              <input type="date" value={custom.to} onChange={e => setCustom(c => ({ ...c, to: e.target.value }))} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
            </>
          )}
          <select value={status} onChange={e => setStatus(e.target.value as any)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 font-bold">
            <option value="all">All status</option><option value="draft">Drafts</option><option value="finalized">Finalized</option>
          </select>
          <select value={shiftF} onChange={e => setShiftF(e.target.value as any)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300 font-bold">
            <option value="all">All shifts</option>{SHIFTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {selected.length > 0 && (
          <div className="px-4 py-3 bg-blue-500/5 border-b border-blue-500/20 flex flex-wrap items-center gap-3">
            <span className="text-xs font-bold text-blue-300">{selected.length} selected</span>
            {canExport && <button onClick={() => setExportFor(selectedReports)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5"><Download className="w-3.5 h-3.5" /> Export ZIP</button>}
            <button disabled={selected.length < 2} onClick={() => setCompareOpen(true)} className="px-3 py-1.5 rounded-lg bg-zinc-800 disabled:opacity-40 text-zinc-200 text-xs font-bold flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5" /> Compare</button>
            <button onClick={() => setSelected([])} className="text-xs text-zinc-500 hover:text-white">Clear</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[860px]">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40">
                <th className="p-4 w-10"><button aria-label="Select all" onClick={() => setSelected(allSelected ? [] : filtered.map(r => r.id))} className="text-zinc-500">{allSelected ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4" />}</button></th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase">Report</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase">Shift</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase">Events</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase">Criticality</th>
                <th className="p-4 text-[10px] font-bold text-zinc-500 uppercase">Contributors</th>
                <th className="p-4 text-right text-[10px] font-bold text-zinc-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-10 text-center text-sm text-zinc-500">No shift reports match the current filters.</td></tr>
              )}
              {filtered.map(r => {
                const m = computeMetrics([r], null);
                const s = getShift(r.shift);
                return (
                  <tr key={r.id} className="tactical-row hover:bg-red-500/[0.03] cursor-pointer" onClick={() => setOpenId(r.id)}>
                    <td className="p-4" onClick={e => { e.stopPropagation(); toggle(r.id); }}>
                      {selected.includes(r.id) ? <CheckSquare className="w-4 h-4 text-blue-400" /> : <Square className="w-4 h-4 text-zinc-600" />}
                    </td>
                    <td className="p-4"><p className="font-bold text-sm text-zinc-200">{r.title}</p><p className="text-[10px] text-zinc-500 font-mono">{r.id} · rev {r.revision}</p></td>
                    <td className="p-4"><span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${s.badge}`}>{s.label}</span></td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-black text-white mr-1">{m.totalEvents}</span>
                        {SEVERITIES.map(sev => m.bySeverity[sev] > 0 && <span key={sev} className={`text-[9px] px-1.5 rounded border font-bold ${SEVERITY_STYLE[sev].badge}`}>{sev[0]}{m.bySeverity[sev]}</span>)}
                      </div>
                    </td>
                    <td className="p-4 text-sm font-bold text-zinc-300">{m.criticalityIndex}%</td>
                    <td className="p-4 text-xs text-zinc-400 truncate max-w-[180px]">{(r.contributors || []).join(', ')}</td>
                    <td className="p-4 text-right">{statusBadge(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {newOpen && <NewReportModal reports={reports} currentUser={currentUser} onClose={() => setNewOpen(false)} onCreated={id => { setNewOpen(false); setOpenId(id); }} />}
      {exportFor && <ReportCustomizer reports={exportFor} currentUser={currentUser} onClose={() => setExportFor(null)} onDone={onToast} />}
      {compareOpen && <ComparativeAnalysis reports={selectedReports} onClose={() => setCompareOpen(false)} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
const NewReportModal: React.FC<{ reports: ShiftReport[]; currentUser: User; onClose: () => void; onCreated: (id: string) => void }> = ({ reports, currentUser, onClose, onCreated }) => {
  const [date, setDate] = useState(toDateKey(new Date()));
  const [shift, setShift] = useState<ShiftId>(getActiveShift().shift.id);
  const exists = reports.find(r => r.id === reportId(date, shift));
  const create = async () => {
    const r = await shiftReportService.create(currentUser, date, shift, reports);
    onCreated(r.id);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-entrance w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-white">Open shift report</h3>
        <label className="block space-y-1"><span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Date</span>
          <input type="date" value={date} max={toDateKey(new Date())} onChange={e => setDate(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white" /></label>
        <div className="grid grid-cols-3 gap-2">
          {SHIFTS.map(s => (
            <button key={s.id} onClick={() => setShift(s.id)} className={`p-3 rounded-xl border text-left ${shift === s.id ? s.badge : 'border-zinc-800 text-zinc-500'}`}>
              <span className="block text-xs font-black">{s.label}</span><span className="text-[10px] font-mono">{s.timing}</span>
            </button>
          ))}
        </div>
        {exists && <p className="text-xs text-amber-400">A report already exists for this shift ({exists.status}). It will be opened.</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 font-bold">Cancel</button>
          <button onClick={create} className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">{exists ? 'Open' : 'Create draft'}</button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
const ComparativeAnalysis: React.FC<{ reports: ShiftReport[]; onClose: () => void }> = ({ reports, onClose }) => {
  const rows = useMemo(() => [...reports].sort((a, b) => (a.date + a.shift).localeCompare(b.date + b.shift)).map(r => ({ r, m: computeMetrics([r], null) })), [reports]);
  const agg = useMemo(() => computeMetrics(reports, null), [reports]);
  const chart = rows.map(({ r, m }) => ({ name: `${r.date.slice(5)} ${r.shift[0].toUpperCase()}`, ...m.bySeverity }));
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="modal-entrance w-full max-w-6xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col max-h-[94vh]">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800">
          <h3 className="text-lg font-black text-white flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-400" /> Comparative multi-report analysis</h3>
          <button aria-label="Close" onClick={onClose} className="p-2 text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Reports', reports.length], ['Total events', agg.totalEvents], ['Aggregate criticality', `${agg.criticalityIndex}%`], ['Top vector', agg.topAttackTypes[0]?.name ?? '—']].map(([k, v]) => (
              <div key={k as string} className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800"><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{k}</p><p className="text-xl font-black text-white truncate">{v}</p></div>
            ))}
          </div>
          <div className="h-72 bg-zinc-950/40 rounded-2xl border border-zinc-800 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid stroke="#27272a" vertical={false} />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 12 }} />
                <Legend />
                {SEVERITIES.map(s => <Bar key={s} dataKey={s} stackId="a" fill={SEVERITY_STYLE[s].hex} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[800px]">
              <thead><tr className="border-b border-zinc-800 text-zinc-500 uppercase text-[10px]">
                <th className="p-2">Report</th><th className="p-2">Status</th><th className="p-2">Events</th>{SEVERITIES.map(s => <th key={s} className="p-2">{s}</th>)}<th className="p-2">Criticality</th><th className="p-2">Top vector</th><th className="p-2">Top hostile IP</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
                {rows.map(({ r, m }) => (
                  <tr key={r.id}><td className="p-2 font-bold">{r.date} · {getShift(r.shift).label}</td><td className="p-2">{statusBadge(r)}</td><td className="p-2">{m.totalEvents}</td>
                    {SEVERITIES.map(s => <td key={s} className="p-2">{m.bySeverity[s]}</td>)}
                    <td className="p-2 font-bold">{m.criticalityIndex}%</td><td className="p-2">{m.topAttackTypes[0]?.name ?? '—'}</td><td className="p-2 font-mono">{m.topSourceIps[0]?.name ?? '—'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
interface EditorProps {
  report: ShiftReport;
  currentUser: User;
  permissions: RolePermissions;
  onBack: () => void;
  onToast: (msg: string) => void;
  onExport: () => void;
}

const ShiftReportEditor: React.FC<EditorProps> = ({ report, currentUser, permissions, onBack, onToast, onExport }) => {
  const locked = report.status === 'finalized';
  const canLog = permissions.canLogShiftEvents !== false && !locked;
  const canFinalize = permissions.canFinalizeReports !== false && !locked;
  const canDelete = !!permissions.canDeleteReports;

  const [title, setTitle] = useState(report.title);
  const [summary, setSummary] = useState(report.summary);
  const [handover, setHandover] = useState(report.handoverNotes);
  const [dirty, setDirty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<string>(report.updatedAt);
  const [eventForm, setEventForm] = useState<{ open: boolean; event: ShiftEvent | null }>({ open: false, event: null });
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [verify, setVerify] = useState<null | boolean>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
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
      if (!silent) onToast('Draft synchronized');
    } catch (e: any) {
      onToast(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Debounced auto-sync of narrative fields.
  useEffect(() => {
    if (!dirty || locked) return;
    const id = setTimeout(() => sync(true), 2500);
    return () => clearTimeout(id);
  }, [title, summary, handover, dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setter(e.target.value); setDirty(true); };

  const saveEvent = async (ev: ShiftEvent) => {
    try {
      await shiftReportService.upsertEvent(currentUser, report, ev, latestRef.current);
      setEventForm({ open: false, event: null });
      onToast(eventForm.event ? 'Event updated' : 'Event logged');
    } catch (e: any) {
      onToast(`Failed: ${e.message}`);
    }
  };

  const removeEvent = async (ev: ShiftEvent) => {
    if (!confirm(`Remove event "${ev.eventName}" from this draft?`)) return;
    await shiftReportService.removeEvent(currentUser, latestRef.current, ev.id);
    onToast('Event removed');
  };

  const finalize = async () => {
    try {
      await shiftReportService.finalize(currentUser, { ...latestRef.current, title, summary, handoverNotes: handover });
      setDirty(false);
      setConfirmFinalize(false);
      onToast('Report finalized and sealed');
    } catch (e: any) {
      onToast(`Finalize failed: ${e.message}`);
    }
  };

  const del = async () => {
    const typed = prompt(`Deleting a ${report.status} report is permanent and audited.\nType the report ID to confirm:\n${report.id}`);
    if (typed !== report.id) return;
    await shiftReportService.remove(currentUser, report);
    onToast('Report deleted');
    onBack();
  };

  const runVerify = async () => setVerify(await shiftReportService.verify(currentUser, report));

  const m = computeMetrics([report], null);
  const shift = getShift(report.shift);
  const input = 'w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500/50 disabled:opacity-70';

  const finalizeWarnings = [
    !summary.trim() && 'No shift summary written',
    !handover.trim() && 'No handover notes written',
    report.events.length === 0 && 'No events logged (a "quiet shift" report will be sealed)',
    report.events.some(e => (e.severity === 'Critical' || e.severity === 'High') && !e.conclusion.trim()) && 'Some High/Critical events have no SOC conclusion',
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="text-xs font-bold text-zinc-400 hover:text-white flex items-center gap-2"><ArrowLeft className="w-4 h-4" /> All reports</button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {locked ? `Sealed ${new Date(report.finalizedAt!).toLocaleString()}` : syncing ? 'Syncing…' : dirty ? 'Unsaved changes' : `Synced ${new Date(lastSynced).toLocaleTimeString()}`}
          </span>
          {!locked && <button onClick={() => sync()} disabled={syncing} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2 border border-zinc-700"><CloudUpload className="w-4 h-4" /> Sync draft</button>}
          {permissions.canExportReports !== false && <button onClick={onExport} className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2 border border-zinc-700"><Download className="w-4 h-4" /> Export</button>}
          {canFinalize && <button onClick={() => setConfirmFinalize(true)} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2"><Lock className="w-4 h-4" /> Finalize</button>}
          {canDelete && <button onClick={del} aria-label="Delete report" className="p-2 rounded-xl border border-zinc-800 text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: shift.hex }} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2 mb-2">{statusBadge(report)}<span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${shift.badge}`}>{shift.label} · {shift.timing}</span><span className="text-[10px] text-zinc-500 font-mono">{report.id} · rev {report.revision}</span></div>
            <input value={title} onChange={edit(setTitle)} disabled={locked} aria-label="Report title" className="w-full bg-transparent text-2xl font-black text-white outline-none disabled:opacity-100" />
            <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {(report.contributors || []).join(', ')} · created by {report.createdBy} {new Date(report.createdAt).toLocaleString()}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="px-4 py-2 rounded-xl bg-zinc-950/50 border border-zinc-800"><p className="text-[9px] font-black text-zinc-500 uppercase">Events</p><p className="text-xl font-black text-white">{m.totalEvents}</p></div>
            <div className="px-4 py-2 rounded-xl bg-zinc-950/50 border border-zinc-800"><p className="text-[9px] font-black text-zinc-500 uppercase">Critical/High</p><p className="text-xl font-black text-red-400">{m.bySeverity.Critical + m.bySeverity.High}</p></div>
            <div className="px-4 py-2 rounded-xl bg-zinc-950/50 border border-zinc-800"><p className="text-[9px] font-black text-zinc-500 uppercase">Criticality</p><p className="text-xl font-black text-white">{m.criticalityIndex}%</p></div>
          </div>
        </div>
        {locked && (
          <div className="mt-5 p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-emerald-400 flex items-center gap-2"><Lock className="w-3.5 h-3.5" /> Immutable operational record — finalized by {report.finalizedBy}</p>
              <p className="text-[11px] font-mono text-zinc-400 break-all mt-1">SHA-256 {report.integrityHash}</p>
            </div>
            <div className="flex items-center gap-2">
              {verify !== null && (verify
                ? <span className="text-xs font-bold text-emerald-400 flex items-center gap-1"><ShieldCheck className="w-4 h-4" /> Integrity verified</span>
                : <span className="text-xs font-bold text-red-400 flex items-center gap-1"><ShieldX className="w-4 h-4" /> HASH MISMATCH — record altered</span>)}
              <button onClick={runVerify} className="px-3 py-1.5 rounded-lg border border-emerald-500/30 text-emerald-300 text-xs font-bold">Verify integrity</button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <p className="text-sm font-black text-white flex items-center gap-2"><Crosshair className="w-4 h-4 text-red-400" /> Event stack</p>
          {canLog && <button onClick={() => setEventForm({ open: true, event: null })} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center gap-2"><Plus className="w-4 h-4" /> Log event</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead><tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] font-bold text-zinc-500 uppercase">
              <th className="p-3">Time</th><th className="p-3">Severity</th><th className="p-3">Event</th><th className="p-3">Source → Destination</th><th className="p-3">Port</th><th className="p-3">Analyst</th><th className="p-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {report.events.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sm text-zinc-500">No events logged for this shift yet.</td></tr>}
              {report.events.map(ev => (
                <React.Fragment key={ev.id}>
                  <tr className="hover:bg-zinc-800/20 cursor-pointer" onClick={() => setExpanded(x => (x === ev.id ? null : ev.id))}>
                    <td className="p-3 text-xs font-mono text-zinc-400">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="p-3"><span className={`text-[10px] px-2 py-0.5 rounded border font-black uppercase ${SEVERITY_STYLE[ev.severity].badge}`}>{ev.severity}</span></td>
                    <td className="p-3"><p className="text-sm font-bold text-zinc-200">{ev.eventName}</p><p className="text-[10px] text-zinc-500">{ev.attackType || 'Unclassified'}</p></td>
                    <td className="p-3 text-xs font-mono"><span className="text-red-400/80">{ev.sourceIp || '—'}</span> <span className="text-zinc-600">→</span> <span className="text-blue-400/80">{ev.destinationIp || '—'}</span></td>
                    <td className="p-3 text-xs font-mono text-zinc-400">{ev.port || '—'}{ev.protocol ? `/${ev.protocol}` : ''}</td>
                    <td className="p-3 text-xs text-zinc-400">{ev.loggedBy}</td>
                    <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                      {canLog && <div className="flex justify-end gap-1">
                        <button aria-label="Edit event" onClick={() => setEventForm({ open: true, event: ev })} className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-400"><Edit3 className="w-4 h-4" /></button>
                        <button aria-label="Remove event" onClick={() => removeEvent(ev)} className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                      </div>}
                    </td>
                  </tr>
                  {expanded === ev.id && (
                    <tr className="bg-zinc-950/40"><td colSpan={7} className="p-4">
                      <div className="grid md:grid-cols-3 gap-4 text-xs">
                        {[['Investigation / forensic findings', ev.investigation], ['Remediation', ev.remediation], ['SOC conclusion', ev.conclusion]].map(([k, v]) => (
                          <div key={k}><p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{k}</p><p className="text-zinc-300 whitespace-pre-wrap">{v || '—'}</p></div>
                        ))}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <label className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Shift summary</span>
          <textarea rows={6} value={summary} onChange={edit(setSummary)} disabled={locked} className={input} placeholder="Overall posture, notable trends, escalations raised…" />
        </label>
        <label className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-2">
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Handover notes for next shift</span>
          <textarea rows={6} value={handover} onChange={edit(setHandover)} disabled={locked} className={input} placeholder="Open investigations, pending actions, watch-list IPs…" />
        </label>
      </div>

      {eventForm.open && <ShiftEventForm event={eventForm.event} currentUser={currentUser} defaultDate={report.date} onSave={saveEvent} onCancel={() => setEventForm({ open: false, event: null })} />}

      {confirmFinalize && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="modal-entrance w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2"><Lock className="w-5 h-5 text-emerald-400" /> Finalize & seal report?</h3>
            <p className="text-xs text-zinc-400">Finalizing locks the event stack into an immutable operational record. A SHA-256 integrity hash is computed and stored; no further edits are possible.</p>
            {finalizeWarnings.length > 0 && (
              <ul className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-1">
                {finalizeWarnings.map(w => <li key={w} className="text-xs text-amber-400 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" /> {w}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmFinalize(false)} className="px-4 py-2 rounded-xl border border-zinc-800 text-xs text-zinc-400 font-bold">Cancel</button>
              <button onClick={finalize} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Finalize & seal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShiftReportsPage;
