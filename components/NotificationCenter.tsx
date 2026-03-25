
import React, { useMemo } from 'react';
import { Notification, ApprovalRequest, User, Language } from '../types';
import { Bell, Check, X, Info, AlertTriangle, ShieldCheck, Clock, Trash2, ExternalLink, XCircle, Zap, Terminal, Layers } from 'lucide-react';
import { requestService } from '../services/requestService';
import { getTranslator } from '../translations';

interface NotificationCenterProps {
  currentUser: User;
  notifications: Notification[];
  requests: ApprovalRequest[];
  onUpdate: () => void;
  isOpen: boolean;
  onClose: () => void;
  onOpenRequest: (request: ApprovalRequest) => void;
  language: Language;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
  currentUser, 
  notifications, 
  requests, 
  onUpdate, 
  isOpen, 
  onClose,
  onOpenRequest,
  language
}) => {
  const t = useMemo(() => getTranslator(language), [language]);
  if (!isOpen) return null;

  const handleOpenRequest = (requestId?: string) => {
    if (!requestId) return;
    const req = requests.find(r => r.id === requestId);
    if (req) {
      onOpenRequest(req);
      onClose();
    }
  };

  const handleRead = (id: string) => {
    requestService.markAsRead(id);
    onUpdate();
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const pendingRequests = requests.filter(r => r.status === 'PENDING');

  return (
    <div className="absolute top-16 right-8 w-[420px] max-h-[85vh] bg-[#0c0c0e]/95 backdrop-blur-xl border border-zinc-800 rounded-[2rem] shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] z-[100] flex flex-col overflow-hidden animate-in slide-in-from-top-6 duration-300 ring-1 ring-white/5">
      
      <div className="p-6 border-b border-zinc-800/50 bg-gradient-to-b from-zinc-900/50 to-transparent flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
             <Bell className="w-5 h-5 text-blue-400" />
             {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-ping" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-widest">{t('signal_center')}</h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">{t('monitoring_active')}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {unreadCount > 0 && (
            <button 
              onClick={() => { requestService.markAllAsRead(currentUser.id); onUpdate(); }}
              className="text-[9px] font-black text-zinc-500 hover:text-white uppercase tracking-widest px-2 py-1 hover:bg-white/5 rounded-md transition-all"
            >
              {t('clear_buffer')}
            </button>
          )}
          <button onClick={onClose} className="p-2 hover:bg-red-500/10 rounded-full group transition-all">
            <X className="w-4 h-4 text-zinc-500 group-hover:text-red-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 bg-[#09090b]/40">
        
        {currentUser.role === 'Admin' && pendingRequests.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
               <p className="text-[10px] font-black text-amber-500/80 uppercase tracking-[0.2em] flex items-center gap-2">
                 <ShieldCheck className="w-3.5 h-3.5" /> {t('command_queue')}
               </p>
               <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded font-black border border-amber-500/20">{pendingRequests.length}</span>
            </div>
            
            <div className="space-y-2">
              {pendingRequests.map(req => (
                <button 
                  key={req.id} 
                  onClick={() => handleOpenRequest(req.id)}
                  className="w-full text-left relative group overflow-hidden bg-zinc-900/40 hover:bg-amber-500/[0.03] border border-zinc-800 hover:border-amber-500/30 rounded-2xl p-4 transition-all"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                  
                  <div className="flex justify-between items-start mb-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight">{t('requests')}</span>
                      </div>
                      <p className="text-xs font-black text-white">{req.requesterName}</p>
                    </div>
                    <div className="p-2 bg-zinc-950 rounded-lg group-hover:scale-110 transition-transform">
                       <Zap className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] bg-amber-500/10 text-amber-500 font-black px-2 py-0.5 rounded uppercase border border-amber-500/10">
                      {req.action.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="bg-[#050505] p-3 rounded-xl border border-zinc-800/50 flex items-center justify-between group-hover:border-amber-500/20 transition-all">
                    <span className="text-[10px] font-mono text-zinc-500 truncate max-w-[200px]">
                      {req.data.name || req.data.eventName || 'SYSTEM_PAYLOAD_ID'}
                    </span>
                    <ExternalLink className="w-3 h-3 text-zinc-700 group-hover:text-amber-500" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
             <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] flex items-center gap-2">
               <Terminal className="w-3.5 h-3.5" /> {t('intelligence_log')}
             </p>
          </div>

          <div className="space-y-2">
            {notifications.length > 0 ? notifications.map(notif => (
              <div 
                key={notif.id} 
                onClick={() => {
                    handleRead(notif.id);
                    if (notif.requestId) handleOpenRequest(notif.requestId);
                }}
                className={`relative group cursor-pointer rounded-2xl border transition-all p-4 ${
                  notif.read 
                  ? 'bg-transparent border-zinc-800/40 opacity-60' 
                  : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-600 shadow-sm'
                }`}
              >
                <div className={`absolute left-0 top-3 bottom-3 w-0.5 rounded-full transition-all ${
                  notif.type === 'SUCCESS' ? 'bg-emerald-500 group-hover:shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                  notif.type === 'ERROR' ? 'bg-red-500 group-hover:shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                  notif.type === 'WARNING' ? 'bg-amber-500 group-hover:shadow-[0_0_8px_rgba(245,158,11,0.5)]' :
                  'bg-blue-500 group-hover:shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                }`} />

                <div className="flex gap-4">
                  <div className={`mt-0.5 p-2 rounded-xl transition-all ${
                    notif.type === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-500' :
                    notif.type === 'ERROR' ? 'bg-red-500/10 text-red-500' :
                    notif.type === 'WARNING' ? 'bg-amber-500/10 text-amber-500' :
                    'bg-blue-500/10 text-blue-500'
                  }`}>
                    {notif.type === 'SUCCESS' ? <Check className="w-3.5 h-3.5" /> : 
                     notif.type === 'ERROR' ? <XCircle className="w-3.5 h-3.5" /> :
                     notif.type === 'REQUEST' ? <Layers className="w-3.5 h-3.5" /> :
                     <Info className="w-3.5 h-3.5" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                       <h4 className={`text-xs font-black tracking-tight truncate ${notif.read ? 'text-zinc-500' : 'text-zinc-100'}`}>
                         {notif.title}
                       </h4>
                       <span className="text-[9px] font-mono text-zinc-600 tabular-nums shrink-0 ml-4">
                         {new Date(notif.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                       </span>
                    </div>
                    <p className={`text-[11px] leading-relaxed ${notif.read ? 'text-zinc-600' : 'text-zinc-400'}`}>
                      {notif.message}
                    </p>
                  </div>
                </div>
              </div>
            )) : (
              <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                <div className="w-16 h-16 bg-zinc-900/50 rounded-full border border-zinc-800 flex items-center justify-center relative">
                   <div className="absolute inset-0 border border-blue-500/20 rounded-full animate-ping" />
                   <Terminal className="w-6 h-6 text-zinc-700" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">{t('zero_signals')}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="p-4 bg-zinc-950/80 border-t border-zinc-800/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[9px] font-mono text-zinc-600 uppercase tracking-widest">{t('system_online')}</span>
        </div>
        <div className="text-[9px] font-mono text-zinc-700">
          {t('stability')}: {Math.floor(Date.now() / 100000000) % 100}%
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
