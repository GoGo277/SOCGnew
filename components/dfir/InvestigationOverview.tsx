import React from 'react';
import { Siren, Briefcase, ListChecks, ArrowRight } from 'lucide-react';
import { User } from '../../types';
import { DfirData } from '../../hooks/useDfirData';
import { ALERT_STATUS_STYLE, CASE_STATE_STYLE, TASK_STATUS_STYLE, isAlertOpen } from '../../lib/dfir';
import { Badge, SeverityBadge, card } from './ui';
import { useT } from '../../i18n';

/** IRIS-style overview: alert queue, my cases and my tasks. */
const InvestigationOverview: React.FC<{ data: DfirData; currentUser: User; onOpenAlert: (id: string) => void; onOpenCase: (id: string) => void; onNav: (tab: string) => void }> = ({ data, currentUser, onOpenAlert, onOpenCase, onNav }) => {
  const t = useT();
  const openAlerts = data.alerts.filter(a => isAlertOpen(a.status));
  const myCases = data.cases.filter(c => c.ownerId === currentUser.id && c.state !== 'Closed');
  const myTasks = data.tasks.filter(x => x.assigneeIds.includes(currentUser.id) && x.status !== 'Done' && x.status !== 'Canceled');
  const caseNo = (id: string) => data.cases.find(c => c.id === id)?.number;
  const Panel: React.FC<{ icon: React.ElementType; title: string; count: number; tab: string; children: React.ReactNode }> = ({ icon: Icon, title, count, tab, children }) => (
    <section className={`${card} p-4 min-w-0`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-zinc-100 flex items-center gap-2"><Icon className="w-4 h-4 text-blue-500" /> {title} <span className="text-xs text-zinc-500 font-normal">{count}</span></h4>
        <button onClick={() => onNav(tab)} className="text-xs text-blue-500 hover:underline inline-flex items-center gap-1">{t('View all')} <ArrowRight className="w-3 h-3" /></button>
      </div>
      {children}
    </section>
  );
  const empty = (s: string) => <p className="text-xs text-zinc-500 py-3">{s}</p>;
  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <Panel icon={Siren} title={t('Open alerts')} count={openAlerts.length} tab="alerts">
        {openAlerts.length === 0 ? empty(t('No open alerts.')) : (
          <ul className="space-y-2">{openAlerts.slice(0, 5).map(a => (
            <li key={a.id}><button onClick={() => onOpenAlert(a.id)} className="w-full text-left flex items-center gap-2 text-sm hover:bg-zinc-800/50 rounded-md p-1 -m-1">
              <SeverityBadge s={a.severity} /><span className="truncate flex-1 text-zinc-200">#{a.number} {a.title}</span><Badge className={ALERT_STATUS_STYLE[a.status]}>{t(a.status)}</Badge>
            </button></li>
          ))}</ul>
        )}
      </Panel>
      <Panel icon={Briefcase} title={t('My open cases')} count={myCases.length} tab="cases">
        {myCases.length === 0 ? empty(t('No cases assigned to you.')) : (
          <ul className="space-y-2">{myCases.slice(0, 5).map(c => (
            <li key={c.id}><button onClick={() => onOpenCase(c.id)} className="w-full text-left flex items-center gap-2 text-sm hover:bg-zinc-800/50 rounded-md p-1 -m-1">
              <span className="font-mono text-xs text-zinc-500">#{c.number}</span><span className="truncate flex-1 text-zinc-200">{c.name}</span><Badge className={CASE_STATE_STYLE[c.state]}>{t(c.state)}</Badge>
            </button></li>
          ))}</ul>
        )}
      </Panel>
      <Panel icon={ListChecks} title={t('My tasks')} count={myTasks.length} tab="cases">
        {myTasks.length === 0 ? empty(t('No open tasks assigned to you.')) : (
          <ul className="space-y-2">{myTasks.slice(0, 5).map(x => (
            <li key={x.id}><button onClick={() => onOpenCase(x.caseId)} className="w-full text-left flex items-center gap-2 text-sm hover:bg-zinc-800/50 rounded-md p-1 -m-1">
              <span className="font-mono text-xs text-zinc-500">#{caseNo(x.caseId)}</span><span className="truncate flex-1 text-zinc-200">{x.title}</span><Badge className={TASK_STATUS_STYLE[x.status]}>{t(x.status)}</Badge>
            </button></li>
          ))}</ul>
        )}
      </Panel>
    </div>
  );
};

export default InvestigationOverview;
