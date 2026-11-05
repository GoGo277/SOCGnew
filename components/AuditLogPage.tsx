import React, { useMemo, useState } from 'react';
import { ScrollText, Search, ShieldCheck, ShieldX, Download, FileJson } from 'lucide-react';
import { User } from '../types';
import { AuditLog, auditService } from '../services/auditService';
import { downloadBlob } from '../services/reportExport';
import { toDateKey } from '../lib/shifts';

interface Props { logs: AuditLog[]; currentUser: User; onToast: (m: string) => void }

const CATEGORY: Record<string, string> = {
  LOGIN: 'auth', LOGOUT: 'auth', LOGIN_FAILED: 'security', ACCOUNT_LOCKED: 'security', SESSION_EXPIRED: 'auth',
  PASSWORD_CHANGED: 'security', PASSWORD_RESET: 'security', FORCED_PASSWORD_CHANGE: 'security',
  USER_CREATED: 'admin', USER_UPDATED: 'admin', USER_DELETED: 'admin', ROLE_CHANGED: 'admin', SETTINGS_CHANGED: 'admin',
  DUTY_SCHEDULE_UPDATED: 'roster',
};
const catStyle: Record<string, string> = {
  security: 'text-red-400 bg-red-500/10 border-red-500/20',
  admin: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  auth: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  roster: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20',
  ops: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20',
};

const AuditLogPage: React.FC<Props> = ({ logs, currentUser, onToast }) => {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('all');
  const [user, setUser] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ verified: number; tampered: string[]; unsigned: number } | null>(null);
  const [limit, setLimit] = useState(200);

  const actions = useMemo(() => Array.from(new Set(logs.map(l => l.action))).sort(), [logs]);
  const usersList = useMemo(() => Array.from(new Set(logs.map(l => l.username))).sort(), [logs]);

  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return logs.filter(l =>
      (action === 'all' || l.action === action) &&
      (user === 'all' || l.username === user) &&
      (!from || l.timestamp.slice(0, 10) >= from) &&
      (!to || l.timestamp.slice(0, 10) <= to) &&
      (!ql || [l.username, l.action, l.targetName, l.targetId, JSON.stringify(l.metadata ?? '')].some(v => (v || '').toLowerCase().includes(ql)))
    );
  }, [logs, q, action, user, from, to]);

  const verify = async () => {
    setVerifying(true);
    const r = await auditService.verify(filtered);
    setResult(r);
    setVerifying(false);
  };

  const exportAs = (fmt: 'csv' | 'json') => {
    const body = fmt === 'csv' ? auditService.toCsv(filtered) : JSON.stringify({ exportedAt: new Date().toISOString(), exportedBy: currentUser.username, count: filtered.length, logs: filtered }, null, 2);
    downloadBlob(new Blob([body], { type: fmt === 'csv' ? 'text/csv' : 'application/json' }), `GEYES_audit_${toDateKey(new Date())}.${fmt}`);
    auditService.log(currentUser, 'AUDIT_LOG_EXPORTED', { id: 'audit', name: `Audit export (${fmt})` }, { count: filtered.length, filters: { q, action, user, from, to } });
    onToast(`Exported ${filtered.length} audit entries`);
  };

  const tampered = new Set(result?.tampered ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-3xl font-black text-white flex items-center gap-3"><ScrollText className="w-7 h-7 text-amber-400" /> Audit Trail</h3>
          <p className="text-zinc-500 text-sm">Tamper-evident record of authentication, administration and operational activity</p>
        </div>
        <div className="flex gap-2">
          <button onClick={verify} disabled={verifying} className="px-4 py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> {verifying ? 'Verifying…' : 'Verify integrity'}</button>
          <button onClick={() => exportAs('csv')} className="px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2"><Download className="w-4 h-4" /> CSV</button>
          <button onClick={() => exportAs('json')} className="px-4 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs font-bold flex items-center gap-2"><FileJson className="w-4 h-4" /> JSON</button>
        </div>
      </div>

      {result && (
        <div className={`p-4 rounded-2xl border text-sm flex items-center gap-3 ${result.tampered.length ? 'border-red-500/30 bg-red-500/5 text-red-300' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'}`}>
          {result.tampered.length ? <ShieldX className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          {result.verified} entries verified · {result.tampered.length} failed verification · {result.unsigned} legacy unsigned entries
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/30 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-[220px] bg-zinc-900/50 px-3 py-2 rounded-xl border border-zinc-800">
            <Search className="w-4 h-4 text-zinc-500" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search user, action, target, metadata…" className="bg-transparent outline-none text-sm text-zinc-200 w-full" />
          </div>
          <select value={action} onChange={e => setAction(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300"><option value="all">All actions</option>{actions.map(a => <option key={a}>{a}</option>)}</select>
          <select value={user} onChange={e => setUser(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-300"><option value="all">All users</option>{usersList.map(u => <option key={u}>{u}</option>)}</select>
          <input type="date" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
          <input type="date" aria-label="To" value={to} onChange={e => setTo(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-2 py-1.5 text-xs text-zinc-300" />
          <span className="text-xs text-zinc-500">{filtered.length} entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[900px]">
            <thead><tr className="border-b border-zinc-800 bg-zinc-950/40 text-[10px] font-bold text-zinc-500 uppercase">
              <th className="p-3">Timestamp</th><th className="p-3">User</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Details</th><th className="p-3">Hash</th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filtered.slice(0, limit).map(l => {
                const cat = CATEGORY[l.action] ?? 'ops';
                return (
                  <tr key={l.id} className={tampered.has(l.id) ? 'bg-red-500/10' : 'hover:bg-zinc-800/20'}>
                    <td className="p-3 text-xs font-mono text-zinc-400 whitespace-nowrap">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="p-3 text-xs text-zinc-200 font-bold">{l.username}{l.role && <span className="ml-1 text-[9px] text-zinc-500">{l.role}</span>}</td>
                    <td className="p-3"><span className={`text-[9px] px-2 py-0.5 rounded border font-black ${catStyle[cat]}`}>{l.action}</span></td>
                    <td className="p-3 text-xs text-zinc-300 max-w-[220px] truncate" title={l.targetId}>{l.targetName || l.targetId || '—'}</td>
                    <td className="p-3 text-[11px] text-zinc-500 font-mono max-w-[320px] truncate" title={l.metadata ? JSON.stringify(l.metadata) : ''}>{l.metadata ? JSON.stringify(l.metadata) : ''}</td>
                    <td className="p-3 text-[10px] font-mono text-zinc-600" title={l.hash}>{l.hash ? l.hash.slice(0, 10) + '…' : 'unsigned'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length > limit && (
          <div className="p-4 text-center"><button onClick={() => setLimit(l => l + 300)} className="text-xs font-bold text-blue-400">Show more ({filtered.length - limit} remaining)</button></div>
        )}
      </div>
    </div>
  );
};

export default AuditLogPage;
