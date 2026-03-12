import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Announcement, User, Severity, Language } from '../types';
import { announcementService } from '../services/announcementService';
import { imageService } from '../services/imageService';
import { settingsService } from '../services/settingsService';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { 
  Megaphone, Plus, Calendar, User as UserIcon, 
  ShieldAlert, Trash2, Save, X, Info, AlertTriangle, 
  Activity, BellRing, Edit3, Image as ImageIcon, Upload, Loader2, Bold, Italic, List, Search, ListOrdered, Heading, Underline
} from 'lucide-react';
import { getTranslator } from '../translations';

interface AnnouncementsPageProps {
  currentUser: User;
  language: Language;
}

const AnnouncementRenderer: React.FC<{ content: string }> = ({ content }) => {
  const [parsedHtml, setParsedHtml] = useState<{__html: string}>({__html: ''});

  useEffect(() => {
    const parseContent = async (text: string) => {
      let html = text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/__(.*?)__/g, '<u>$1</u>')
        .replace(/^- (.*$)/gm, '<li class="ml-4 text-zinc-400 list-disc">$1</li>')
        .replace(/^[0-9]\. (.*$)/gm, '<li class="ml-4 text-zinc-400 list-decimal">$1</li>');

      // Async replace for images
      const imgRegex = /!\[(.*?)\]\((.*?)\)/g;
      let match;
      let finalHtml = html;
      
      while ((match = imgRegex.exec(html)) !== null) {
        const alt = match[1];
        const src = match[2];
        let actualSrc = src;
        
        if (src.startsWith('img-')) {
          actualSrc = await imageService.getImage(src) || src;
        }
        
        const imgTag = `<div class="my-4"><img src="${actualSrc}" alt="${alt}" class="rounded-xl border border-zinc-800 shadow-lg max-h-[400px] w-auto mx-auto" /></div>`;
        finalHtml = finalHtml.replace(match[0], imgTag);
      }

      setParsedHtml({ __html: finalHtml.split('\n').join('<br />') });
    };

    parseContent(content);
  }, [content]);

  return <div className="text-sm leading-relaxed text-zinc-300 font-medium" dangerouslySetInnerHTML={parsedHtml} />;
};

const AnnouncementsPage: React.FC<AnnouncementsPageProps> = ({ currentUser, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    severity: 'Low' as Severity
  });
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [deleteItemName, setDeleteItemName] = useState('');
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    const fetchedAnnouncements = await announcementService.getAnnouncements();
    setAnnouncements(fetchedAnnouncements);
    setUsers(settingsService.getUsers());
  };

  useEffect(() => {
    loadData();
  }, []);

  const insertText = (before: string, after: string = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + before + selected + after + text.substring(end);
    setFormData(prev => ({ ...prev, content: newText }));
    
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    }, 0);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessingImage(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64 = reader.result as string;
          const imageId = await imageService.saveImage(base64);
          insertText(`\n![Attachment](${imageId})\n`, '');
        } finally {
          setIsProcessingImage(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content) return;
    if (editingId) {
      await announcementService.deleteAnnouncement(editingId);
    }
    await announcementService.saveAnnouncement({
      ...formData,
      authorId: currentUser.id,
      authorName: currentUser.username
    });
    resetForm();
    loadData();
  };

  const resetForm = () => {
    setFormData({ title: '', content: '', severity: 'Low' });
    setIsFormOpen(false);
    setEditingId(null);
  };

  const handleEdit = (ann: Announcement) => {
    setFormData({
      title: ann.title,
      content: ann.content,
      severity: ann.severity
    });
    setEditingId(ann.id);
    setIsFormOpen(true);
  };

  const openDeleteModal = (ann: Announcement) => {
    setItemToDelete(ann.id);
    setDeleteItemName(ann.title);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (itemToDelete) {
      await announcementService.deleteAnnouncement(itemToDelete);
      loadData();
      setIsDeleteModalOpen(false);
      setItemToDelete(null);
    }
  };

  const getSeverityStyle = (s: Severity) => {
    switch(s) {
      case 'Critical': return 'border-red-500/50 bg-red-500/5 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.1)]';
      case 'High': return 'border-orange-500/50 bg-orange-500/5 text-orange-500';
      case 'Medium': return 'border-amber-500/50 bg-amber-500/5 text-amber-400';
      default: return 'border-blue-500/50 bg-blue-500/5 text-blue-400';
    }
  };

  const filteredAnnouncements = announcements.filter(ann => 
    ann.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    ann.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h3 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
            <BellRing className="w-10 h-10 text-orange-500" /> {t('intel_feed')}
          </h3>
          <p className="text-zinc-500 text-sm font-medium">Broadcast critical system directives and team intelligence.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-orange-500 transition-colors" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_feed')}
              className="bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500/50 w-64 transition-all"
            />
          </div>
          {(currentUser.role === 'Admin' || currentUser.role === 'L2') && !isFormOpen && (
            <button 
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-3 px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-orange-600/20 active:scale-95 transition-all shrink-0"
            >
              <Plus className="w-5 h-5" /> {t('broadcast_alert')}
            </button>
          )}
        </div>
      </div>

      {isFormOpen && (
        <div className="bg-zinc-900 border-2 border-orange-500/30 rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
          <div className="p-8 border-b border-zinc-800 bg-zinc-950/30 flex justify-between items-center">
             <h4 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-3">
               <ShieldAlert className="w-6 h-6 text-orange-500" /> {editingId ? t('update') : t('drafting_alert')}
             </h4>
             <button onClick={resetForm} className="p-2 hover:bg-zinc-800 rounded-xl transition-all text-zinc-500 hover:text-white"><X className="w-6 h-6" /></button>
          </div>
          <div className="p-8 space-y-6">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('alert_title')}</label>
                   <input 
                    value={formData.title}
                    onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                    placeholder="E.g. Network Maintenance Window"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-sm text-white focus:border-orange-500/50 outline-none transition-all"
                   />
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('threat_severity')}</label>
                   <select 
                    value={formData.severity}
                    onChange={e => setFormData(p => ({ ...p, severity: e.target.value as Severity }))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-4 text-sm text-white focus:border-orange-500/50 outline-none appearance-none"
                   >
                      <option value="Low">{t('low')}</option>
                      <option value="Medium">{t('medium')}</option>
                      <option value="High">{t('high')}</option>
                      <option value="Critical">{t('critical')}</option>
                   </select>
                </div>
             </div>
             
             {/* Extended Toolbar for Announcements */}
             <div className="p-2 bg-zinc-950/50 border border-zinc-800 rounded-xl flex items-center gap-1">
                <button type="button" onClick={() => insertText('**', '**')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400" title={t('bold')}><Bold className="w-4 h-4"/></button>
                <button type="button" onClick={() => insertText('*', '*')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400" title={t('italic')}><Italic className="w-4 h-4"/></button>
                <button type="button" onClick={() => insertText('__', '__')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400" title={t('underline')}><Underline className="w-4 h-4"/></button>
                <button type="button" onClick={() => insertText('# ')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400" title={t('heading')}><Heading className="w-4 h-4"/></button>
                <div className="w-px h-4 bg-zinc-800 mx-1" />
                <button type="button" onClick={() => insertText('- ')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400" title={t('bullets')}><List className="w-4 h-4"/></button>
                <button type="button" onClick={() => insertText('1. ')} className="p-2 hover:bg-zinc-800 rounded text-zinc-400" title={t('numbers')}><ListOrdered className="w-4 h-4"/></button>
                <div className="w-px h-4 bg-zinc-800 mx-1" />
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-zinc-800 rounded text-zinc-400 flex items-center gap-2" title={t('add_image')}>
                   {isProcessingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                   <span className="text-[10px] font-bold uppercase tracking-tight hidden sm:block">{t('add_image')}</span>
                </button>
                <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
             </div>

             <div className="space-y-1">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('directives_context')}</label>
                <textarea 
                  ref={textareaRef}
                  value={formData.content}
                  onChange={e => setFormData(p => ({ ...p, content: e.target.value }))}
                  rows={6}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 text-sm text-zinc-300 outline-none focus:border-orange-500/50 transition-all resize-none leading-relaxed"
                />
             </div>
             <div className="flex justify-end pt-4">
                <button 
                  onClick={handleSave}
                  className="flex items-center gap-3 px-10 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
                >
                  <Save className="w-5 h-5" /> {t('commit')}
                </button>
             </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {filteredAnnouncements.map(ann => {
          const author = users.find(u => u.id === ann.authorId);
          return (
            <div 
              key={ann.id} 
              className={`group p-8 rounded-[2.5rem] border transition-all hover:translate-x-2 relative overflow-hidden ${getSeverityStyle(ann.severity)}`}
            >
              <div className="flex flex-col md:flex-row gap-8">
                <div className="shrink-0">
                  <div className="w-16 h-16 rounded-[1.5rem] bg-black/20 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform text-white">
                    {ann.severity === 'Critical' ? <ShieldAlert className="w-8 h-8 animate-pulse" /> : 
                     ann.severity === 'High' ? <AlertTriangle className="w-8 h-8" /> : 
                     ann.severity === 'Medium' ? <Info className="w-8 h-8" /> : 
                     <Megaphone className="w-8 h-8" />}
                  </div>
                </div>

                <div className="flex-1 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                     <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">{t('severity')}: {t(ann.severity.toLowerCase())}</span>
                        </div>
                        <h4 className="text-2xl font-black tracking-tight text-white">{ann.title}</h4>
                     </div>
                     <div className="flex gap-2">
                        {(currentUser.role === 'Admin' || ann.authorId === currentUser.id) && (
                          <>
                             <button onClick={() => handleEdit(ann)} className="p-3 bg-black/10 hover:bg-white/10 rounded-2xl transition-all" title={t('edit')}><Edit3 className="w-4 h-4" /></button>
                             <button onClick={() => openDeleteModal(ann)} className="p-3 bg-black/10 hover:bg-red-500/10 rounded-2xl transition-all text-red-400" title={t('delete')}><Trash2 className="w-4 h-4" /></button>
                          </>
                        )}
                     </div>
                  </div>

                  <div className="bg-black/5 rounded-2xl p-6 border border-white/5">
                    <AnnouncementRenderer content={ann.content} />
                  </div>

                  <div className="flex items-center gap-6 pt-2">
                     <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                           <span className="text-[8px] font-black text-zinc-600 uppercase tracking-[0.2em]">{t('transmitter')}</span>
                           <span className="text-[11px] font-black text-zinc-300 uppercase tracking-widest">{ann.authorName}</span>
                        </div>
                     </div>
                     <div className="flex items-center gap-3 pl-6 border-l border-white/5">
                        <div className="flex flex-col">
                           <span className="text-[8px] font-black text-zinc-600 uppercase tracking-[0.2em]">{t('signal_logged')}</span>
                           <span className="text-[11px] font-black text-zinc-500 uppercase tracking-widest">{new Date(ann.createdAt).toLocaleString()}</span>
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filteredAnnouncements.length === 0 && (
           <div className="py-20 text-center text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">{t('no_results')}</div>
        )}
      </div>

      <DeleteConfirmationModal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        onConfirm={handleConfirmDelete} 
        assetName={deleteItemName} 
        language={language}
      />
    </div>
  );
};

export default AnnouncementsPage;
