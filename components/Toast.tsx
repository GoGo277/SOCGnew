
import React, { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  isOpen: boolean;
  onClose: () => void;
  type?: 'success' | 'info';
}

const Toast: React.FC<ToastProps> = ({ message, isOpen, onClose, type = 'success' }) => {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(onClose, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 pr-12 shadow-2xl flex items-center gap-4 min-w-[320px] ring-1 ring-white/5">
        <div className={`p-2 rounded-xl ${type === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
          <CheckCircle2 className="w-5 h-5" />
        </div>
        <div>
          <p className="text-sm font-bold text-white tracking-tight">{message}</p>
        </div>
        <button 
          onClick={onClose}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
        >
          <X className="w-4 h-4" />
        </button>
        <div className={`absolute bottom-0 left-0 h-1 rounded-b-2xl ${type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'} animate-toast-progress`} />
      </div>
    </div>
  );
};

export default Toast;
