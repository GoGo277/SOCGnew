
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Guideline, User, UserRole, RolePermissions, Language } from '../types';
import { guidelineService } from '../services/guidelineService';
import { imageService } from '../services/imageService';
import { requestService } from '../services/requestService';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { 
  Book, Edit3, Trash2, Plus, Save, Eye, Shield, 
  Image as ImageIcon, Bold, Italic, Underline, List, ListOrdered,
  Palette, Search, X, Loader2, Heading
} from 'lucide-react';
import { getTranslator } from '../translations';

interface GuidelinesPageProps {
  currentUser: User;
  permissions: RolePermissions;
  guidelines: Guideline[];
  onRefresh: () => void;
  language: Language;
}

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  const [parsedHtml, setParsedHtml] = useState<{__html: string}>({__html: ''});

  useEffect(() => {
    const parseContent = async (text: string) => {
      let html = text
        .replace(/^# (.*$)/gm, '<h1 class="text-3xl font-black text-white border-b border-zinc-800 pb-4 mb-6">$1</h1>')
        .replace(/^## (.*$)/gm, '<h2 class="text-2xl font-bold text-zinc-100 mt-8 mb-4">$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/__(.*?)__/g, '<u>$1</u>')
        .replace(/\[color=(.*?)\](.*?)\[\/color\]/g, '<span style="color: $1">$2</span>')
        .replace(/^- (.*$)/gm, '<li class="ml-6 text-zinc-400 list-disc my-1">$1</li>')
        .replace(/^[0-9]\. (.*$)/gm, '<li class="ml-6 text-zinc-400 list-decimal my-1">$1</li>');

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
        
        const imgTag = `<div class="my-8 flex justify-center flex-col items-center"><img src="${actualSrc}" class="rounded-2xl border border-zinc-800 shadow-2xl max-h-[500px] w-auto" /><p class="text-[10px] text-zinc-600 mt-2 uppercase font-black tracking-widest">${alt}</p></div>`;
        finalHtml = finalHtml.replace(match[0], imgTag);
      }

      setParsedHtml({ __html: finalHtml.split('\n').join('<br />') });
    };

    parseContent(content);
  }, [content]);

  return <div className="prose prose-invert max-w-none text-zinc-300 guideline-render select-text" dangerouslySetInnerHTML={parsedHtml} />;
};

const GuidelinesPage: React.FC<GuidelinesPageProps> = ({ currentUser, permissions, guidelines, onRefresh, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [activeGuideline, setActiveGuideline] = useState<Guideline | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit');
  const [editForm, setEditForm] = useState<Omit<Guideline, 'id' | 'updatedAt'>>({
    title: '', content: '', visibleTo: ['Admin', 'L2', 'L1'], author: currentUser.username
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-select first guideline if none selected
  useEffect(() => {
    if (guidelines.length > 0 && !activeGuideline && !isEditing) {
      setActiveGuideline(guidelines[0]);
    }
  }, [guidelines, activeGuideline, isEditing]);

  const insertText = (before: string, after: string = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const selected = text.substring(start, end);
    const newText = text.substring(0, start) + before + selected + after + text.substring(end);
    setEditForm(prev => ({ ...prev, content: newText }));
    
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    }, 10);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const imageId = await imageService.saveImage(reader.result as string);
          insertText(`\n![Tactical Observation](${imageId})\n`, '');
        } catch (err) {
          alert(String(err));
        } finally {
          setIsUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!editForm.title || !editForm.content) return;
    
    if (currentUser.role !== 'Admin') {
      requestService.createRequest(currentUser, activeGuideline ? 'EDIT_GUIDELINE' : 'ADD_GUIDELINE', activeGuideline ? { ...editForm, id: activeGuideline.id } : editForm, 'Requested via SOP Editor');
      setIsEditing(false);
    } else {
      const saved = await guidelineService.saveGuideline(activeGuideline ? { ...editForm, id: activeGuideline.id } : editForm);
      setIsEditing(false);
      if (saved) {
        setActiveGuideline(saved);
        onRefresh(); // Refresh parent state
      }
    }
  };

  const handleDelete = async () => {
    if (activeGuideline) {
      await guidelineService.deleteGuideline(activeGuideline.id);
      setIsDeleteModalOpen(false);
      setActiveGuideline(null);
      onRefresh(); // Refresh parent state
    }
  };

  const filteredGuidelines = guidelines.filter(g => g.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col md:flex-row gap-8 h-[calc(100vh-160px)] animate-in fade-in duration-500">
      <aside className="w-full md:w-80 flex flex-col gap-4 border-r border-zinc-800 pr-8 overflow-y-auto custom-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-bold text-white tracking-tight">{t('sop_library')}</h3>
          </div>
          {permissions.canCreateGuideline && (
            <button 
              onClick={() => { setEditForm({ title: '', content: '', visibleTo: ['Admin', 'L2', 'L1'], author: currentUser.username }); setIsEditing(true); setActiveGuideline(null); }} 
              className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg transition-all active:scale-90"
              title={t('add')}
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 group-focus-within:text-blue-500" />
          <input 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            placeholder={t('search_guidelines')} 
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2 pl-9 pr-4 text-xs text-white outline-none focus:border-blue-500/50 transition-all" 
          />
        </div>
        <div className="space-y-1.5">
          {filteredGuidelines.map(g => (
            <button key={g.id} onClick={() => { setActiveGuideline(g); setIsEditing(false); }} className={`w-full text-left p-4 rounded-2xl border transition-all relative overflow-hidden ${activeGuideline?.id === g.id ? 'bg-blue-600/10 border-blue-500/50 text-blue-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800'}`}>
               <p className="text-xs font-bold truncate">{g.title}</p>
               <p className="text-[9px] font-black uppercase opacity-40 mt-1">{new Date(g.updatedAt).toLocaleDateString()}</p>
            </button>
          ))}
          {filteredGuidelines.length === 0 && (
            <p className="text-center text-[10px] text-zinc-600 py-8 uppercase font-black">Zero Documents Found</p>
          )}
        </div>
      </aside>

      <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl relative">
        {isEditing ? (
          <div className="flex flex-col h-full">
            <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex flex-wrap items-center gap-1 shrink-0">
               <div className="flex items-center gap-1 border-r border-zinc-800 pr-2 mr-2">
                 <button onClick={() => insertText('**', '**')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400" title={t('bold')}><Bold className="w-4 h-4" /></button>
                 <button onClick={() => insertText('*', '*')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400" title={t('italic')}><Italic className="w-4 h-4" /></button>
                 <button onClick={() => insertText('__', '__')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400" title={t('underline')}><Underline className="w-4 h-4" /></button>
                 <button onClick={() => insertText('# ')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400" title={t('heading')}><Heading className="w-4 h-4" /></button>
               </div>
               <div className="flex items-center gap-1 border-r border-zinc-800 pr-2 mr-2">
                 <button onClick={() => insertText('- ')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400" title={t('bullets')}><List className="w-4 h-4" /></button>
                 <button onClick={() => insertText('1. ')} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400" title={t('numbers')}><ListOrdered className="w-4 h-4" /></button>
               </div>
               <div className="flex items-center gap-1 border-r border-zinc-800 pr-2 mr-2">
                 <button onClick={() => insertText('[color=#ef4444]', '[/color]')} className="p-2 hover:bg-zinc-800 rounded-lg text-red-500" title={t('text_color')}><Palette className="w-4 h-4" /></button>
                 <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 flex items-center gap-2" title={t('add_image')}>
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                 </button>
                 <input type="file" ref={fileInputRef} onChange={handleImageUpload} className="hidden" accept="image/*" />
               </div>
               <div className="ml-auto flex items-center gap-2 bg-zinc-900 rounded-xl p-1 border border-zinc-800">
                  <button onClick={() => setViewMode('edit')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'edit' ? 'bg-blue-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}>{t('edit_mode')}</button>
                  <button onClick={() => setViewMode('preview')} className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${viewMode === 'preview' ? 'bg-emerald-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}>{t('preview_mode')}</button>
               </div>
            </div>
            <div className="p-6 bg-zinc-950/30 border-b border-zinc-800">
                <input value={editForm.title} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} className="w-full bg-transparent text-2xl font-black text-white outline-none" placeholder={t('doc_title')} />
            </div>
            <div className="flex-1 overflow-hidden relative">
               {viewMode === 'edit' ? (
                 <textarea ref={textareaRef} value={editForm.content} onChange={e => setEditForm(p => ({ ...p, content: e.target.value }))} className="w-full h-full bg-transparent p-10 font-mono text-sm text-zinc-400 outline-none resize-none custom-scrollbar" placeholder="Draft tactical security documentation..." />
               ) : (
                 <div className="w-full h-full p-10 overflow-y-auto custom-scrollbar bg-zinc-950/50"><MarkdownRenderer content={editForm.content} /></div>
               )}
            </div>
            <div className="p-6 border-t border-zinc-800 bg-zinc-950/80 flex justify-end gap-3">
               <button onClick={() => setIsEditing(false)} className="px-6 py-2.5 text-zinc-500 hover:text-white text-xs font-black uppercase tracking-widest">{t('discard')}</button>
               <button onClick={handleSave} className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-xl uppercase tracking-widest active:scale-95 transition-all"><Save className="w-4 h-4" /> {t('commit')}</button>
            </div>
          </div>
        ) : activeGuideline ? (
          <div className="flex flex-col h-full">
            <div className="p-10 flex-1 overflow-y-auto custom-scrollbar relative">
              <div className="absolute top-10 right-10 flex gap-2">
                 {permissions.canEditGuideline && (
                   <button onClick={() => { setEditForm({ title: activeGuideline.title, content: activeGuideline.content, visibleTo: activeGuideline.visibleTo, author: activeGuideline.author }); setIsEditing(true); }} className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-2xl transition-all shadow-xl"><Edit3 className="w-4 h-4" /></button>
                 )}
                 {permissions.canDeleteGuideline && (
                   <button onClick={() => setIsDeleteModalOpen(true)} className="p-3 bg-zinc-800 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-2xl transition-all shadow-xl"><Trash2 className="w-4 h-4" /></button>
                 )}
              </div>
              <div className="mb-12 space-y-4">
                 <h1 className="text-5xl font-black text-white tracking-tighter leading-none">{activeGuideline.title}</h1>
                 <div className="flex items-center gap-6 text-[10px] font-black text-zinc-600 uppercase tracking-widest border-l-2 border-blue-500/50 pl-6">
                   <span>{t('authored_by')} {activeGuideline.author}</span>
                   <span>{t('revision_date')}: {new Date(activeGuideline.updatedAt).toLocaleDateString()}</span>
                 </div>
              </div>
              <MarkdownRenderer content={activeGuideline.content} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-12 space-y-6">
            <div className="w-24 h-24 bg-zinc-800/50 rounded-[2rem] flex items-center justify-center border border-zinc-700"><Book className="w-10 h-10 text-zinc-700" /></div>
            <h3 className="text-2xl font-black text-zinc-400 tracking-tight">{t('sop_intel_center')}</h3>
          </div>
        )}
      </div>
      <DeleteConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={handleDelete} assetName={activeGuideline?.title || ''} language={language} />
    </div>
  );
};

export default GuidelinesPage;
