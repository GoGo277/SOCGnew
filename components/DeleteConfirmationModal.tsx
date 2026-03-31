
import React, { useMemo } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Language } from '../types';
import { getTranslator } from '../translations';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  assetName: string;
  language: Language;
}

const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({ isOpen, onClose, onConfirm, assetName, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
        onClick={onClose}
      />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in slide-in-from-bottom-4 duration-300 overflow-hidden">
        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center animate-bounce">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">{t('confirm_deletion')}</h3>
            <p className="text-sm text-zinc-400">
              {t('irreversible_action')} <span className="text-white font-semibold underline decoration-red-500/50">{assetName}</span>?
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="p-4 text-sm font-bold text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800 transition-colors border-r border-zinc-800 active:bg-zinc-700 active:scale-95"
          >
            {t('cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="p-4 text-sm font-bold text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors active:bg-red-500/20 active:scale-95"
          >
            {t('confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
