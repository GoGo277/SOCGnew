import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, Plus, Search } from 'lucide-react';
import { CaseState, Severity, User } from '../../types';
import { DfirData } from '../../hooks/useDfirData';
import { caseService } from '../../services/caseService';
import { CaseReportTemplate } from '../../services/caseReport';
import { CASE_STATE_STYLE, CLASSIFICATIONS, INTERNAL_CUSTOMER_ID } from '../../lib/dfir';
import { SEVERITIES } from '../../services/analytics';
import CaseView from './CaseView';
import { Badge, Empty, Field, Modal, SeverityBadge, TagInput, btn, card, fmtDate, inputCls } from './ui';
import { useT } from '../../i18n';

interface Props {
  data: DfirData;
  users: User[];
  currentUser: User;
  reportTemplates: CaseReportTemplate[];
  focusCaseId?: string | null;
  onFocusConsumed?: () => void;
  onOpenAlert: (id: string) => void;
  onToast: (m: string) => void;
  iris?: React.ComponentProps<typeof CaseView>['iris'];
}

const CasesPage: React.FC<Props> = ({ data, users, currentUser, reportTemplates, focusCaseId, onFocusConsumed, onOpenAlert, onToast, iris }) => {
  const t = useT();
  const [openId, setOpenId] = useState<string | null>(null);
  const [scope, setScope] = useState<'open' | 'mine' | 'closed' | 'all'>('open');
  const [q, setQ] = useState('');
  const [cust, setCust] = useState('all');
  const [creating, setCreating] = useState(false);

  useEffect(() => { if (focusCaseId) { setOpenId(focusCaseId); onFocusConsumed?.(); } }, [focusCaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const ql = q.toLowerCase();
    return data.cases.filter(c =>
      (scope === 'all' || (scope === 'open' && c.state !== 'Closed') || (scope === 'closed' && c.state === 'Closed') || (scope === 'mine' && c.ownerId === currentUser.id && c.state !== 'Closed')) &&
      (cust === 'all' || c.customerId === cust) &&
      (!ql || `#${c.number} ${c.name} ${c.tags.join(' ')} ${c.classification} ${c.socId ?? ''}`.toLowerCase().includes(ql)));
  }, [data.cases, scope, cust, q, currentUser.id]);

  if (openId) return <CaseView caseId={openId} data={data} users={users} currentUser={currentUser} reportTemplates={reportTemplates} onBack={() => setOpenId(null)} onOpenAlert={onOpenAlert} onToast={onToast} iris={iris} />;

  const customerName = (id: string) => data.customers.find(c => c.id === id)?.name ?? id;
  const taskProgress = (id: string) => { const ts = data.tasks.filter(x => x.caseId === id); return ts.length ? `${ts.filter(x => x.status === 'Done').length}/${ts.length}` : '—'; };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-zinc-100 flex items-center gap-2"><Briefcase className="w-6 h-6 text-blue-500" /> {t('Cases')}</h3>
          <p className="text-sm text-zinc-500">{t('Investigations with timeline, IOCs, assets, evidence, notes and tasks')}</p>
        </div>
        <button onClick={() => setCreating(true)} className={btn.primary}><Plus className="w-4 h-4" /> {t('New case')}</button>
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="flex flex-wrap items-center gap-2 p-3 border-b border-zinc-800">
          <div role="tablist" aria-label={t('Case views')} className="flex flex-wrap gap-1">
            {([['open', t('Open')], ['mine', t('My cases')], ['closed', t('Closed')], ['all', t('All')]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${scope === k ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-800/60'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-zinc-800 bg-[var(--app-bg)]">
            <Search className="w-4 h-4 text-zinc-500" />
            <input aria-label={t('Search')} value={q} onChange={e => setQ(e.target.value)} placeholder={t('Search number, name, tag, classification…')} className="bg-transparent outline-none text-sm w-full" />
          </div>
          <select aria-label={t('Customer')} value={cust} onChange={e => setCust(e.target.value)} className={`${inputCls} w-auto`}><option value="all">{t('All customers')}</option>{data.customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </div>
        {list.length === 0 ? <Empty>{t('No cases in this view.')}</Empty> : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="text-[11px] uppercase text-zinc-500 border-b border-zinc-800 bg-[var(--app-bg)]">
                  <th className="px-4 py-2.5">#</th><th className="px-4 py-2.5">{t('Case')}</th><th className="px-4 py-2.5">{t('Customer')}</th><th className="px-4 py-2.5">{t('State')}</th>
                  <th className="px-4 py-2.5">{t('Severity')}</th><th className="px-4 py-2.5">{t('Owner')}</th><th className="px-4 py-2.5">{t('Tasks')}</th><th className="px-4 py-2.5">{t('Opened')}</th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-800">
                  {list.map(c => (
                    <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-zinc-800/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{c.number}</td>
                      <td className="px-4 py-2.5"><button className="font-bold text-zinc-100 text-left hover:text-blue-500" onClick={() => setOpenId(c.id)}>{c.name}</button><span className="block text-[11px] text-zinc-500">{c.classification}{c.iris?.remoteId ? ` · IRIS #${c.iris.remoteId}` : ''}</span></td>
                      <td className="px-4 py-2.5 text-xs text-zinc-300">{customerName(c.customerId)}</td>
                      <td className="px-4 py-2.5"><Badge className={CASE_STATE_STYLE[c.state]}>{t(c.state)}</Badge></td>
                      <td className="px-4 py-2.5"><SeverityBadge s={c.severity} /></td>
                      <td className="px-4 py-2.5 text-xs text-zinc-300">{c.ownerName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-300">{taskProgress(c.id)}</td>
                      <td className="px-4 py-2.5 text-xs text-zinc-500 whitespace-nowrap">{fmtDate(c.openedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="md:hidden divide-y divide-zinc-800">
              {list.map(c => (
                <li key={c.id}><button onClick={() => setOpenId(c.id)} className="w-full text-left p-3 space-y-1.5">
                  <p className="text-sm font-bold text-zinc-100"><span className="font-mono text-zinc-500 mr-1">#{c.number}</span>{c.name}</p>
                  <div className="flex flex-wrap gap-1.5"><Badge className={CASE_STATE_STYLE[c.state]}>{t(c.state)}</Badge><SeverityBadge s={c.severity} /></div>
                  <p className="text-[11px] text-zinc-500">{customerName(c.customerId)} · {c.ownerName ?? '—'} · {t('Tasks')} {taskProgress(c.id)}</p>
                </button></li>
              ))}
            </ul>
          </>
        )}
      </div>
      {creating && <NewCaseModal data={data} users={users} currentUser={currentUser} onClose={() => setCreating(false)} onCreated={id => { setCreating(false); setOpenId(id); onToast(t('Case opened')); }} />}
    </div>
  );
};

const NewCaseModal: React.FC<{ data: DfirData; users: User[]; currentUser: User; onClose: () => void; onCreated: (id: string) => void }> = ({ data, users, currentUser, onClose, onCreated }) => {
  const t = useT();
  const [f, setF] = useState({ name: '', description: '', customerId: INTERNAL_CUSTOMER_ID, severity: 'Medium' as Severity, classification: 'other:other', templateId: '', ownerId: currentUser.id, tags: [] as string[], socId: '' });
  const [error, setError] = useState('');
  const applyTemplate = (id: string) => {
    const tpl = data.templates.find(x => x.id === id);
    setF(x => ({ ...x, templateId: id, ...(tpl ? { classification: tpl.classification, severity: tpl.severity, tags: Array.from(new Set([...x.tags, ...tpl.tags])), description: x.description || tpl.description } : {}) }));
  };
  const save = async () => {
    setError('');
    try {
      const c = await caseService.createCase(currentUser, { ...f, ownerName: users.find(u => u.id === f.ownerId)?.username, templateId: f.templateId || undefined, socId: f.socId || undefined }, data.templates);
      onCreated(c.id);
    } catch (e: any) { setError(t(e.message)); }
  };
  return (
    <Modal wide title={t('New case')} onClose={onClose} footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={save} className={btn.primary}>{t('Open case')}</button></>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={t('Case template')} className="sm:col-span-2"><select value={f.templateId} onChange={e => applyTemplate(e.target.value)} className={inputCls}><option value="">{t('— No template —')}</option>{data.templates.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label={t('Name')} className="sm:col-span-2"><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Customer')}><select value={f.customerId} onChange={e => setF({ ...f, customerId: e.target.value })} className={inputCls}>{data.customers.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
        <Field label={t('Severity')}><select value={f.severity} onChange={e => setF({ ...f, severity: e.target.value as Severity })} className={inputCls}>{SEVERITIES.map(s => <option key={s} value={s}>{t(s)}</option>)}</select></Field>
        <Field label={t('Classification')}><select value={f.classification} onChange={e => setF({ ...f, classification: e.target.value })} className={inputCls}>{CLASSIFICATIONS.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label={t('Owner')}><select value={f.ownerId} onChange={e => setF({ ...f, ownerId: e.target.value })} className={inputCls}>{users.filter(u => !u.disabled).map(u => <option key={u.id} value={u.id}>{u.username}</option>)}</select></Field>
        <Field label={t('SOC ticket ID')}><input value={f.socId} onChange={e => setF({ ...f, socId: e.target.value })} className={inputCls} /></Field>
        <Field label={t('Tags')}><TagInput value={f.tags} onChange={v => setF({ ...f, tags: v })} /></Field>
        <Field label={t('Description (Markdown)')} className="sm:col-span-2"><textarea rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      </div>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

export default CasesPage;
