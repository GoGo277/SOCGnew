
import React, { useMemo } from 'react';
import { Asset, RolePermissions, User, Language, Note } from '../types';
import { X, MapPin, Hash, Info, FileText, Trash2, Edit3, MessageSquare, User as UserIcon, PlusCircle, LayoutGrid, Box } from 'lucide-react';
import { getTranslator } from '../translations';

interface AssetModalProps {
  asset: Asset;
  isOpen: boolean;
  permissions: RolePermissions;
  currentUser: User;
  onClose: () => void;
  onEdit: (asset: Asset) => void;
  onDelete: (id: string) => void;
  onAddNote: (asset: Asset) => void;
  onEditNote?: (note: Note) => void;
  onDeleteNote?: (noteId: string) => void;
  language: Language;
}

const AssetModal: React.FC<AssetModalProps> = ({ asset, isOpen, permissions, currentUser, onClose, onEdit, onDelete, onAddNote, onEditNote, onDeleteNote, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  if (!isOpen) return null;

  const criticalityColors = {
    Low: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    Medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    High: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    Critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end overflow-hidden">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-500"
        onClick={onClose}
      />
      
      <div className="relative bg-[#0c0c0e] border-l border-zinc-800 w-full max-w-xl shadow-2xl panel-slide-in flex flex-col h-full ring-1 ring-white/5">
        <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-[#09090b]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              <Info className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">{asset.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[9px] px-2 py-0.5 rounded-full border font-black uppercase tracking-wider ${criticalityColors[asset.criticality || 'Medium']}`}>
                  {t((asset.criticality || 'Medium').toLowerCase())}
                </span>
                <p className="text-[10px] text-zinc-500 font-mono tracking-tighter uppercase">Signal ID: {asset.identity}</p>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-3 hover:bg-zinc-800 rounded-2xl text-zinc-500 transition-all hover:rotate-90 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8 space-y-10 overflow-y-auto flex-1 custom-scrollbar">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
             <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 group transition-all hover:border-blue-500/30">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('network_ipv4')}</p>
                <div className="flex items-center gap-2 text-blue-400 font-mono text-sm">
                   <MapPin className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                   {asset.ipv4}
                </div>
             </div>
             <div className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 group transition-all hover:border-emerald-500/30">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('asset_category')}</p>
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-tighter">
                   <LayoutGrid className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                   {asset.type}
                </div>
             </div>
          </div>

          {/* Hardware Specifications Section */}
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">
               <Box className="w-4 h-4 text-purple-500" /> {t('hardware_specs')}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               <div className="space-y-1 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 hover:border-purple-500/20 transition-all">
                  <label className="text-[9px] uppercase font-black text-zinc-600 tracking-wider">{t('rack_number')}</label>
                  <p className="text-sm font-mono text-zinc-300">{asset.rackNumber || 'N/A'}</p>
               </div>
               <div className="space-y-1 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 hover:border-purple-500/20 transition-all">
                  <label className="text-[9px] uppercase font-black text-zinc-600 tracking-wider">{t('location')}</label>
                  <p className="text-sm font-bold text-zinc-300">{asset.location || 'Unknown'}</p>
               </div>
               <div className="space-y-1 bg-zinc-950 p-4 rounded-2xl border border-zinc-800 hover:border-purple-500/20 transition-all col-span-1 md:col-span-2">
                  <label className="text-[9px] uppercase font-black text-zinc-600 tracking-wider">{t('network_ipv6')}</label>
                  <p className="text-sm font-mono text-zinc-500 truncate">{asset.ipv6 || '::0'}</p>
               </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">
              <FileText className="w-4 h-4 text-blue-500" />
              {t('detailed_description')}
            </h4>
            <div className="text-zinc-400 text-sm leading-relaxed bg-zinc-950 p-6 rounded-2xl border border-zinc-800 shadow-inner">
              {asset.description || 'No operational baseline documentation provided.'}
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="flex items-center gap-2 text-xs font-black text-zinc-400 uppercase tracking-[0.2em]">
                <MessageSquare className="w-4 h-4 text-amber-500" />
                {t('analyst_documentation')}
              </h4>
              <button
                onClick={() => onAddNote(asset)}
                className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[9px] font-black text-amber-500 hover:bg-amber-500/20 transition-all uppercase tracking-widest active:scale-95"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                {t('add_note')}
              </button>
            </div>
            <div className="space-y-4">
              {asset.notes && asset.notes.length > 0 ? asset.notes.map((note) => (
                <div key={note.id} className="bg-zinc-900/30 border border-zinc-800 rounded-[1.5rem] p-5 space-y-3 hover:border-zinc-700 transition-all cursor-default relative overflow-hidden group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                        <UserIcon className="w-4 h-4 text-zinc-500" />
                      </div>
                      <div>
                         <span className="text-xs font-black text-zinc-300 uppercase tracking-tighter">{note.analyst}</span>
                         <p className="text-[8px] text-zinc-600 font-mono">{new Date(note.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      {note.analyst === currentUser.username && (
                        <button
                          onClick={() => onEditNote?.(note)}
                          className="p-2 hover:bg-blue-500/10 text-blue-400 rounded-lg transition-all"
                          title={t('edit')}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {permissions.canDeleteNotes && (
                        <button
                          onClick={() => onDeleteNote?.(note.id)}
                          className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-all"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-zinc-400 pl-4 border-l-2 border-amber-500/30 leading-relaxed italic">
                    "{note.content}"
                  </p>
                </div>
              )) : (
                <div className="text-center py-12 border-2 border-dashed border-zinc-800 rounded-[2rem] text-zinc-600 text-xs font-bold uppercase tracking-widest">
                  Zero Intelligence Logged
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 border-t border-zinc-800 flex items-center justify-between bg-[#09090b] sticky bottom-0 z-10">
          <div className="flex flex-col gap-1 text-[9px] text-zinc-600 font-mono font-black uppercase tracking-tighter">
            <span>Establish: {new Date(asset.createdAt).toLocaleDateString()}</span>
            <span>Modified: {new Date(asset.updatedAt).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-4">
            {permissions.canDeleteAsset && (
              <button 
                onClick={() => onDelete(asset.id)}
                className="flex items-center gap-2 px-6 py-3 text-red-500 hover:bg-red-500/10 rounded-2xl transition-all text-xs font-black uppercase tracking-widest active:scale-95"
              >
                <Trash2 className="w-4 h-4" />
                {t('remove')}
              </button>
            )}
            {permissions.canEditAsset && (
              <button 
                onClick={() => onEdit(asset)}
                className="flex items-center gap-3 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl transition-all text-xs font-black uppercase tracking-widest shadow-[0_10px_20px_-10px_rgba(59,130,246,0.5)] active:scale-95"
              >
                <Edit3 className="w-4 h-4" />
                {t('edit_asset')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssetModal;
