import React, { useState, useMemo } from 'react';
import { ApprovalRequest, User, RequestAction, Language } from '../types';
import { requestService } from '../services/requestService';
import { ClipboardList, Clock, CheckCircle2, XCircle, Search, Filter, Eye, Plus, X, Send } from 'lucide-react';
import { getTranslator } from '../translations';

interface MyRequestsPageProps {
  currentUser: User;
  requests: ApprovalRequest[];
  onViewDetails: (request: ApprovalRequest) => void;
  onRefresh: () => void;
  language: Language;
}

const MyRequestsPage: React.FC<MyRequestsPageProps> = ({ currentUser, requests, onViewDetails, onRefresh, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [formData, setFormData] = useState({
    type: 'ASSET' as 'ASSET' | 'INCIDENT' | 'ANNOUNCEMENT' | 'GUIDELINE',
    actionType: 'ADD' as 'ADD' | 'EDIT' | 'REMOVE',
    reason: '',
    payload: ''
  });

  const myRequests = requests
    .filter(r => r.requesterId === currentUser.id)
    .filter(r => r.action.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const actionKey = `${formData.actionType}_${formData.type}` as RequestAction;
    let parsedPayload = {};
    try {
      parsedPayload = formData.payload ? JSON.parse(formData.payload) : {};
    } catch(e) {
      parsedPayload = { placeholder: formData.payload };
    }

    requestService.createRequest(currentUser, actionKey, parsedPayload, formData.reason);
    setIsFormOpen(false);
    setFormData({ type: 'ASSET', actionType: 'ADD', reason: '', payload: '' });
    onRefresh();
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-3xl font-extrabold tracking-tight text-white drop-shadow-sm">{t('request_tracking')}</h3>
          <p className="text-zinc-500 text-sm mt-1">{t('audit_log')}</p>
        </div>
        <button 
          onClick={() => setIsFormOpen(true)}
          className="flex items-center gap-3 px-8 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-amber-600/20 active:scale-95 transition-all shrink-0"
        >
          <Plus className="w-5 h-5" /> {t('new_request')}
        </button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/30 flex items-center gap-4">
           <div className="flex items-center gap-3 bg-zinc-900/50 px-3 py-2 rounded-xl border border-zinc-800 flex-1 group focus-within:border-amber-500/50 transition-all">
                <Search className="w-4 h-4 text-zinc-500" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('command_history')} 
                  className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-zinc-700" 
                />
           </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40">
                <th className="p-5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('command')}</th>
                <th className="p-5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('logged')}</th>
                <th className="p-5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('all_status')}</th>
                <th className="p-5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {myRequests.map(req => (
                <tr key={req.id} className="tactical-row group hover:bg-zinc-800/20 transition-all">
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-zinc-800 text-zinc-500 group-hover:text-amber-400 group-hover:bg-amber-500/10 transition-all`}>
                        <ClipboardList className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white uppercase tracking-tight">{req.action.replace('_', ' ')}</p>
                        <p className="text-[10px] text-zinc-600 font-mono italic truncate max-w-[200px]">{req.reason || t('nominal')}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(req.createdAt).toLocaleString()}
                    </div>
                  </td>
                  <td className="p-5">
                    <span className={`text-[9px] px-2 py-0.5 rounded-full border font-black uppercase tracking-widest flex items-center w-fit gap-1.5 ${
                      req.status === 'APPROVED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                      req.status === 'REJECTED' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                      'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                      {req.status === 'APPROVED' ? <CheckCircle2 className="w-3 h-3" /> : 
                       req.status === 'REJECTED' ? <XCircle className="w-3 h-3" /> : 
                       <Clock className="w-3 h-3" />}
                      {req.status}
                    </span>
                  </td>
                  <td className="p-5 text-right">
                    <button 
                      onClick={() => onViewDetails(req)}
                      className="p-2 bg-zinc-800 hover:bg-blue-600 hover:text-white rounded-lg transition-all text-zinc-400"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsFormOpen(false)} />
           <div className="relative bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
              <form onSubmit={handleSubmit}>
                 <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
                    <h4 className="text-lg font-black text-white uppercase tracking-widest">{t('new_request')}</h4>
                    <button type="button" onClick={() => setIsFormOpen(false)} className="text-zinc-500 hover:text-white transition-all"><X className="w-6 h-6" /></button>
                 </div>
                 <div className="p-8 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t('classification')}</label>
                          <select 
                            value={formData.type}
                            onChange={(e) => setFormData(p => ({ ...p, type: e.target.value as any }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-amber-500/50 outline-none"
                          >
                             <option value="ASSET">{t('assets')}</option>
                             <option value="INCIDENT">{t('incidents')}</option>
                             <option value="ANNOUNCEMENT">{t('announcements')}</option>
                             <option value="GUIDELINE">{t('guidelines')}</option>
                          </select>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t('actions')}</label>
                          <select 
                            value={formData.actionType}
                            onChange={(e) => setFormData(p => ({ ...p, actionType: e.target.value as any }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-amber-500/50 outline-none"
                          >
                             <option value="ADD">{t('add')}</option>
                             <option value="EDIT">{t('edit')}</option>
                             <option value="REMOVE">{t('delete')}</option>
                          </select>
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t('justification')}</label>
                       <textarea 
                         required
                         value={formData.reason}
                         onChange={(e) => setFormData(p => ({ ...p, reason: e.target.value }))}
                         placeholder="Explain necessity..."
                         className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-zinc-300 focus:border-amber-500/50 outline-none h-24 resize-none"
                       />
                    </div>
                 </div>
                 <div className="p-8 border-t border-zinc-800 flex justify-end bg-zinc-950/30">
                    <button 
                      type="submit"
                      className="flex items-center gap-3 px-10 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-amber-600/20 active:scale-95 transition-all"
                    >
                      <Send className="w-4 h-4" /> {t('commit')}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default MyRequestsPage;
