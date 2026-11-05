import React, { useState } from 'react';
import { Building2, Plus, Edit3, Trash2 } from 'lucide-react';
import { Customer, User } from '../../types';
import { DfirData } from '../../hooks/useDfirData';
import { caseService } from '../../services/caseService';
import { INTERNAL_CUSTOMER_ID, isAlertOpen } from '../../lib/dfir';
import { uiConfirm } from '../../lib/dialogs';
import { Empty, Field, Modal, btn, card, inputCls } from './ui';
import { useT } from '../../i18n';

const CustomersPage: React.FC<{ data: DfirData; currentUser: User; onToast: (m: string) => void }> = ({ data, currentUser, onToast }) => {
  const t = useT();
  const isAdmin = currentUser.role === 'Admin';
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl sm:text-2xl font-bold text-zinc-100 flex items-center gap-2"><Building2 className="w-6 h-6 text-blue-500" /> {t('Customers')}</h3>
          <p className="text-sm text-zinc-500">{t('Organisations whose alerts and cases are handled by this SOC')}</p>
        </div>
        {isAdmin && <button onClick={() => setEditing('new')} className={btn.primary}><Plus className="w-4 h-4" /> {t('New customer')}</button>}
      </div>
      <div className={`${card} overflow-hidden`}>
        {data.customers.length === 0 ? <Empty>{t('No customers.')}</Empty> : (
          <ul className="divide-y divide-zinc-800">
            {data.customers.map(c => {
              const cases = data.cases.filter(x => x.customerId === c.id);
              const alerts = data.alerts.filter(x => x.customerId === c.id && isAlertOpen(x.status));
              return (
                <li key={c.id} className="p-4 flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[220px]">
                    <p className="font-bold text-zinc-100">{c.name}{c.id === INTERNAL_CUSTOMER_ID && <span className="ml-2 text-[10px] text-zinc-500 font-normal">{t('default')}</span>}</p>
                    {c.description && <p className="text-xs text-zinc-400">{c.description}</p>}
                    {c.contacts && <p className="text-xs text-zinc-500 whitespace-pre-wrap">{c.contacts}</p>}
                  </div>
                  <p className="text-xs text-zinc-400">{t('{o} open cases · {a} open alerts · {n} cases total', { o: cases.filter(x => x.state !== 'Closed').length, a: alerts.length, n: cases.length })}</p>
                  {isAdmin && c.id !== INTERNAL_CUSTOMER_ID && (
                    <div className="flex gap-1">
                      <button aria-label={t('Edit')} onClick={() => setEditing(c)} className={btn.icon}><Edit3 className="w-4 h-4" /></button>
                      <button aria-label={t('Delete')} onClick={async () => {
                        if (await uiConfirm(t('Delete customer "{name}"?', { name: c.name }), { tone: 'danger' })) {
                          try { await caseService.deleteCustomer(currentUser, c, data.cases, data.alerts); onToast(t('Customer deleted')); } catch (e: any) { onToast(t(e.message)); }
                        }
                      }} className={btn.icon}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {editing && <CustomerForm value={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSave={async d => { await caseService.saveCustomer(currentUser, d, editing === 'new' ? undefined : editing); setEditing(null); onToast(t('Customer saved')); }} />}
    </div>
  );
};

const CustomerForm: React.FC<{ value?: Customer; onClose: () => void; onSave: (d: Pick<Customer, 'name' | 'description' | 'contacts'>) => Promise<void> }> = ({ value, onClose, onSave }) => {
  const t = useT();
  const [f, setF] = useState({ name: value?.name ?? '', description: value?.description ?? '', contacts: value?.contacts ?? '' });
  const [error, setError] = useState('');
  return (
    <Modal title={value ? t('Edit customer') : t('New customer')} onClose={onClose} footer={<><button onClick={onClose} className={btn.ghost}>{t('Cancel')}</button><button onClick={() => onSave(f).catch(e => setError(t(e.message)))} className={btn.primary}>{t('Save')}</button></>}>
      <Field label={t('Name')}><input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
      <Field label={t('Description')}><textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className={inputCls} /></Field>
      <Field label={t('Contacts')} hint={t('Escalation contacts, one per line')}><textarea rows={3} value={f.contacts} onChange={e => setF({ ...f, contacts: e.target.value })} className={inputCls} /></Field>
      {error && <p role="alert" className="text-xs text-red-500">{error}</p>}
    </Modal>
  );
};

export default CustomersPage;
