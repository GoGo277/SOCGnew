
import React, { useState, useMemo, useEffect } from 'react';
import { ApprovalRequest, User, RequestStatus, Language } from '../types';
import { requestService } from '../services/requestService';
import { 
  ShieldCheck, Clock, CheckCircle2, XCircle, Search, 
  Filter, Eye, ChevronRight, Activity, Zap, Terminal,
  ShieldAlert, User as UserIcon
} from 'lucide-react';
import { getTranslator } from '../translations';

interface AdminRequestsPageProps {
  currentUser: User;
  requests: ApprovalRequest[];
  onViewDetails: (request: ApprovalRequest) => void;
  onRefresh: () => void;
  language: Language;
}

const AdminRequestsPage: React.FC<AdminRequestsPageProps> = ({ 
  currentUser, 
  requests, 
  onViewDetails, 
  onRefresh, 
  language 
}) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'All'>('All');

  const filteredRequests = useMemo(() => {
    return requests
      .filter(r => statusFilter === 'All' || r.status === statusFilter)
      .filter(r => 
        r.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.action.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    return {
      pending: requests.filter(r => r.status === 'PENDING').length,
      approved: requests.filter(r => r.status === 'APPROVED').length,
      rejected: requests.filter(r => r.status === 'REJECTED').length
    };
  }, [requests]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
            <ShieldCheck className="w-10 h-10 text-amber-500" /> {t('admin_requests')}
          </h3>
          <p className="text-zinc-500 text-sm font-medium mt-1">{t('global_oversight')}</p>
        </div>

        <div className="flex gap-4">
          <div className="px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center gap-6">
            <div className="text-center">
              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">{t('active')}</p>
              <p className="text-lg font-black text-amber-500">{stats.pending}</p>
            </div>
            <div className="w-px h-8 bg-zinc-800" />
            <div className="text-center">
              <p className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">{t('resolved')}</p>
              <p className="text-lg font-black text-emerald-500">{stats.approved}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-amber-500 transition-colors" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search request logs..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all"
          />
        </div>
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4">
          <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-zinc-400 uppercase tracking-widest w-full py-3 cursor-pointer"
          >
            <option value="All">{t('all_status')}</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-950/40">
                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('requester')}</th>
                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('action_type')}</th>
                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('logged_at')}</th>
                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">{t('all_status')}</th>
                <th className="p-6 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {filteredRequests.map(req => (
                <tr key={req.id} className="tactical-row group hover:bg-amber-500/[0.02] transition-all cursor-pointer" onClick={() => onViewDetails(req)}>
                  <td className="p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center font-black text-xs text-zinc-500 group-hover:border-amber-500/50 transition-all">
                        {req.requesterName.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white tracking-tight">{req.requesterName}</p>
                        <p className="text-[10px] text-zinc-600 font-mono">@{req.requesterId.substring(0, 8)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest border-b border-white/5 pb-0.5">{req.action.replace('_', ' ')}</span>
                      <p className="text-[10px] text-zinc-500 italic line-clamp-1">{req.reason || 'Operational shift request'}</p>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex flex-col">
                       <span className="text-xs text-zinc-300 font-medium">{new Date(req.createdAt).toLocaleDateString()}</span>
                       <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-tighter">{new Date(req.createdAt).toLocaleTimeString()}</span>
                    </div>
                  </td>
                  <td className="p-6">
                    <div className="flex justify-center">
                      <span className={`text-[9px] px-3 py-1 rounded-full border font-black uppercase tracking-widest flex items-center gap-2 ${
                        req.status === 'APPROVED' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                        req.status === 'REJECTED' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                        'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse'
                      }`}>
                        {req.status === 'APPROVED' ? <CheckCircle2 className="w-3 h-3" /> : 
                        req.status === 'REJECTED' ? <XCircle className="w-3 h-3" /> : 
                        <Zap className="w-3 h-3" />}
                        {req.status}
                      </span>
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button 
                      className="p-3 bg-zinc-800 hover:bg-amber-600 hover:text-white rounded-xl transition-all text-zinc-400 shadow-lg group-hover:scale-110 active:scale-95"
                      title={t('review_and_authorize')}
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredRequests.length === 0 && (
            <div className="py-24 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-zinc-950 rounded-full border border-zinc-800 flex items-center justify-center relative">
                 <Terminal className="w-6 h-6 text-zinc-800" />
              </div>
              <p className="text-[10px] font-black text-zinc-700 uppercase tracking-[0.3em]">{t('zero_signals')}</p>
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-3 text-zinc-600 px-2">
        <Activity className="w-4 h-4" />
        <span className="text-[9px] font-black uppercase tracking-widest">{t('system_online')} — Command Oversight Mode Active</span>
      </div>
    </div>
  );
};

export default AdminRequestsPage;
