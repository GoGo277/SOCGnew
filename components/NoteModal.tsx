
import React, { useState, useMemo, useEffect } from 'react';
import { Note, User as AppUser, Language } from '../types';
import { X, MessageSquare, Send, ShieldCheck, Edit3 } from 'lucide-react';
import { getTranslator } from '../translations';

interface NoteModalProps {
  targetName: string;
  targetTypeLabel: string;
  isOpen: boolean;
  currentUser: AppUser;
  onClose: () => void;
  onSave: (note: Note) => void;
  language: Language;
  initialNote?: Note | null;
}

const NoteModal: React.FC<NoteModalProps> = ({ targetName, targetTypeLabel, isOpen, currentUser, onClose, onSave, language, initialNote }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (initialNote) {
      setContent(initialNote.content);
    } else {
      setContent('');
    }
  }, [initialNote, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const newNote: Note = initialNote ? {
      ...initialNote,
      content: content.trim(),
      timestamp: new Date().toISOString()
    } : {
      id: crypto.randomUUID(),
      analyst: currentUser.username,
      content: content.trim(),
      timestamp: new Date().toISOString()
    };

    onSave(newNote);
    setContent('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl animate-in fade-in zoom-in duration-200">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center justify-between p-5 border-b border-zinc-800">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${initialNote ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}>
                {initialNote ? <Edit3 className="w-5 h-5 text-blue-500" /> : <MessageSquare className="w-5 h-5 text-amber-500" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{initialNote ? t('edit') : t('add_security_note')}</h3>
                <p className="text-xs text-zinc-500">{targetTypeLabel}: {targetName}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-500 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <span className="text-xs font-bold text-blue-400">
                    {(initialNote?.analyst || currentUser.username).substring(0, 2).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-300">{initialNote?.analyst || currentUser.username}</p>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-tighter">{initialNote ? t('analyst') : `${currentUser.role} ${t('analyst')}`}</p>
                </div>
              </div>
              <ShieldCheck className="w-4 h-4 text-emerald-500 opacity-50" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">{t('security_observation')}</label>
              <textarea
                required
                rows={5}
                autoFocus
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Enter details about status changes or observed behavior..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-sm text-white focus:ring-2 focus:ring-amber-500/50 outline-none resize-none transition-all placeholder:text-zinc-700"
              />
            </div>
          </div>

          <div className="p-5 bg-zinc-950/50 border-t border-zinc-800 flex justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-zinc-500 hover:text-white uppercase tracking-widest active:scale-95 transition-all"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={!content.trim()}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95 uppercase tracking-widest ${initialNote ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20 hover:shadow-blue-500/40' : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20 hover:shadow-amber-500/40'} text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {initialNote ? <Edit3 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
              {initialNote ? t('update') : t('post_note')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NoteModal;
