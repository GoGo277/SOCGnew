
import React, { useMemo } from 'react';
import { ApprovalRequest, Language } from '../types';
import { X, ShieldCheck, Clock, User as UserIcon, Check, XCircle, FileJson, ClipboardList, Info } from 'lucide-react';
import { getTranslator } from '../translations';

interface RequestDetailModalProps {
  request: ApprovalRequest;
  isOpen: boolean;
  onClose: () => void;
  canApprove: boolean;
  onResolve?: (status: 'APPROVED' | 'REJECTED') => void;
  language: Language;
}

const RequestDetailModal: React.FC<RequestDetailModalProps> = ({ request, isOpen, onClose, canApprove, onResolve, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  if (!isOpen) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'REJECTED': return 'text-red-400 bg-red-500/10 border-red-500/20';
      default: return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-2xl shadow-2xl modal-entrance overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 bg-zinc-950/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20`}>
              <ClipboardList className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight uppercase">{request.action.replace('_', ' ')}</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-black uppercase tracking-widest ${getStatusColor(request.status)}`}>
                  {request.status}
                </span>
                <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {new Date(request.createdAt).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl text-zinc-500 transition-all hover:rotate-90">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div className="bg-zinc-800/40 p-4 rounded-2xl border border-zinc-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-black text-[10px]">
                    {request.requesterName.substring(0, 2).toUpperCase()}
                </div>
                <div>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Requester</p>
                    <p className="text-sm font-bold text-white">{request.requesterName}</p>
                </div>
             </div>
             {request.resolvedBy && (
                <div className="bg-zinc-800/40 p-4 rounded-2xl border border-zinc-800 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center text-emerald-400">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Resolved By</p>
                        <p className="text-sm font-bold text-white">{request.resolvedBy}</p>
                    </div>
                </div>
             )}
          </div>

          <div className="space-y-3">
             <h4 className="flex items-center gap-2 text-xs font-black text-zinc-500 uppercase tracking-widest">
                <Info className="w-4 h-4 text-amber-500" /> {t('justification')}
             </h4>
             <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800 italic text-sm text-zinc-300 leading-relaxed">
                {request.reason || 'No justification provided for this tactical request.'}
             </div>
          </div>

          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-black text-zinc-500 uppercase tracking-widest">
                <FileJson className="w-4 h-4 text-blue-500" /> {t('signal_payload')}
            </h4>
            <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-6 font-mono text-xs overflow-hidden relative">
                <div className="grid grid-cols-1 gap-4">
                    {Object.entries(request.data).length > 0 ? Object.entries(request.data).map(([key, value]: [string, any]) => {
                        if (key === 'notes' || key === 'tags') return null;
                        return (
                            <div key={key} className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-zinc-900 pb-3">
                                <span className="text-zinc-600 font-bold uppercase tracking-tighter">{key.replace(/([A-Z])/g, ' $1')}</span>
                                <span className="text-zinc-200 truncate ml-4 max-w-[300px]">{String(value)}</span>
                            </div>
                        );
                    }) : <p className="text-zinc-700 italic">Static removal or direct reference request</p>}
                </div>
            </div>
          </div>

          {request.status === 'REJECTED' && (
             <div className="bg-red-500/5 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-400">
                <XCircle className="w-5 h-5 shrink-0" />
                <p className="text-xs font-bold">Protocol signal rejected. Operations halted.</p>
             </div>
          )}
        </div>

        {/* Footer Actions - Strictly limited to Admin/Approvers if Pending */}
        {request.status === 'PENDING' && canApprove ? (
          <div className="p-6 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-between">
            <p className="text-[9px] text-zinc-600 font-bold uppercase max-w-[200px]">Review tactical data integrity before confirmation.</p>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onResolve?.('REJECTED')}
                className="flex items-center gap-2 px-6 py-2.5 text-red-400 hover:bg-red-500/10 rounded-xl text-xs font-bold transition-all active:scale-95 uppercase"
              >
                <XCircle className="w-4 h-4" /> {t('deny')}
              </button>
              <button 
                onClick={() => onResolve?.('APPROVED')}
                className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 hover:shadow-blue-500/40 active:scale-95 transition-all uppercase"
              >
                <Check className="w-4 h-4" /> {t('authorize')}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 border-t border-zinc-800 bg-zinc-950/80 flex items-center justify-center">
            <button onClick={onClose} className="px-12 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all uppercase tracking-widest shadow-lg hover:shadow-xl active:scale-95">
                {t('close_signal')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default RequestDetailModal;