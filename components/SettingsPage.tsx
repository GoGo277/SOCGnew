
import React, { useState, useRef, useMemo } from 'react';
import { AppSettings, User, UserRole, RolePermissions, Language } from '../types';
import { settingsService } from '../services/settingsService';
import { 
  Settings, Users, Shield, Save, Plus, Trash2, Edit3, 
  Image as ImageIcon, Upload, CheckSquare, Square, Globe, ArrowUp, ArrowDown,
  Layers, Key, Mail, UserCircle, Eye, X, Database, Download, FileJson, AlertTriangle
} from 'lucide-react';
import { getTranslator } from '../translations';

interface SettingsPageProps {
  settings: AppSettings;
  users: User[];
  onSettingsUpdate: (settings: AppSettings) => void;
  onUsersUpdate: (users: User[]) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ settings, users, onSettingsUpdate, onUsersUpdate }) => {
  const t = useMemo(() => getTranslator(settings.language), [settings.language]);
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'users' | 'roles' | 'system'>('general');
  const [appName, setAppName] = useState(settings.appName);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
  const [currentLang, setCurrentLang] = useState<Language>(settings.language);
  const [navOrder, setNavOrder] = useState<string[]>(settings.navOrder);
  const [localRoles, setLocalRoles] = useState(settings.rolePermissions);
  
  const [isUserFormOpen, setIsUserFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormData, setUserFormData] = useState({ username: '', email: '', password: '', role: 'L1' as UserRole });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const masterInputRef = useRef<HTMLInputElement>(null);

  const handleSaveGeneral = () => {
    const updated = { ...settings, appName, logoUrl, language: currentLang, navOrder };
    settingsService.saveSettings(updated);
    onSettingsUpdate(updated);
  };

  const handleSaveRoles = () => {
    const updated = { ...settings, rolePermissions: localRoles };
    settingsService.saveSettings(updated);
    onSettingsUpdate(updated);
  };

  const handleExportMaster = () => {
    const archive = settingsService.exportFullSystem();
    const blob = new Blob([archive], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `guardian_master_archive_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMaster = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const archive = JSON.parse(ev.target?.result as string);
          if (confirm('CAUTION: This will overwrite all local data, users, and settings. Proceed?')) {
            settingsService.importFullSystem(archive);
            window.location.reload();
          }
        } catch (err) {
          alert('Invalid system archive payload.');
        }
      };
      reader.readAsText(file);
    }
  };

  const togglePermission = (role: UserRole, key: keyof RolePermissions) => {
    setLocalRoles(prev => {
      const rolePerms = { ...prev[role] };
      if (key === 'visiblePages') return prev;
      (rolePerms[key] as boolean) = !rolePerms[key];
      return { ...prev, [role]: rolePerms };
    });
  };

  const togglePageVisibility = (role: UserRole, page: keyof RolePermissions['visiblePages']) => {
    setLocalRoles(prev => {
      const rolePerms = { ...prev[role] };
      const newVisiblePages = { ...rolePerms.visiblePages, [page]: !rolePerms.visiblePages[page] };
      return { ...prev, [role]: { ...rolePerms, visiblePages: newVisiblePages } };
    });
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.username) return;
    await settingsService.saveUser(editingUserId ? { ...userFormData, id: editingUserId } : userFormData);
    onUsersUpdate(await settingsService.getUsers());
    setIsUserFormOpen(false);
    setEditingUserId(null);
    setUserFormData({ username: '', email: '', password: '', role: 'L1' });
  };

  const startEditUser = (user: User) => {
    setEditingUserId(user.id);
    setUserFormData({ username: user.username, email: user.email, password: '', role: user.role });
    setIsUserFormOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex gap-1 border-b border-zinc-800">
        {[
          { id: 'general', label: t('settings'), icon: Settings },
          { id: 'users', label: t('all_members'), icon: Users },
          { id: 'roles', label: t('role_mgmt'), icon: Shield },
          { id: 'system', label: 'System Master', icon: Database },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold transition-all border-b-2 ${
              activeSubTab === tab.id ? 'border-blue-500 text-blue-400 bg-blue-500/5' : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] p-8 shadow-xl">
        {activeSubTab === 'general' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div className="space-y-8">
                <div className="space-y-3">
                   <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('identity_logo')}</label>
                   <div className="flex items-center gap-6">
                      <div className="w-24 h-24 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-center overflow-hidden relative group shadow-2xl">
                         {logoUrl ? <img src={logoUrl} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-zinc-800" />}
                         <button onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"><Upload className="w-5 h-5"/></button>
                         <input type="file" ref={fileInputRef} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                               const reader = new FileReader();
                               reader.onloadend = () => setLogoUrl(reader.result as string);
                               reader.readAsDataURL(file);
                            }
                         }} className="hidden" accept="image/*" />
                      </div>
                   </div>
                </div>
                <div className="space-y-1">
                   <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Platform Name</label>
                   <input value={appName} onChange={e => setAppName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-blue-500/50 outline-none" />
                </div>
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{t('language_opt')}</label>
                   <div className="grid grid-cols-2 gap-3">
                      <button onClick={() => setCurrentLang('en')} className={`p-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-between ${currentLang === 'en' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}>English <Globe className="w-4 h-4 opacity-30"/></button>
                      <button onClick={() => setCurrentLang('zh')} className={`p-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-between ${currentLang === 'zh' ? 'bg-red-600/10 border-red-500 text-red-400' : 'bg-zinc-950 border-zinc-800 text-zinc-600'}`}>简体中文 <Globe className="w-4 h-4 opacity-30"/></button>
                   </div>
                </div>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('nav_reorder')}</label>
                <div className="bg-zinc-950 border border-zinc-800 rounded-2xl overflow-hidden divide-y divide-zinc-900 shadow-inner">
                   {navOrder.map((id, index) => (
                     <div key={id} className="flex items-center justify-between p-4 hover:bg-zinc-900 transition-colors group">
                        <div className="flex items-center gap-3">
                           <Layers className="w-4 h-4 text-zinc-700" />
                           <span className="text-xs font-bold text-zinc-300 uppercase tracking-tighter">{t(id)}</span>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                           <button onClick={() => {
                             const newOrder = [...navOrder];
                             if (index > 0) { [newOrder[index], newOrder[index-1]] = [newOrder[index-1], newOrder[index]]; setNavOrder(newOrder); }
                           }} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500"><ArrowUp className="w-3.5 h-3.5"/></button>
                           <button onClick={() => {
                             const newOrder = [...navOrder];
                             if (index < navOrder.length - 1) { [newOrder[index], newOrder[index+1]] = [newOrder[index+1], newOrder[index]]; setNavOrder(newOrder); }
                           }} className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500"><ArrowDown className="w-3.5 h-3.5"/></button>
                        </div>
                     </div>
                   ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-8 border-t border-zinc-800">
               <button onClick={handleSaveGeneral} className="flex items-center gap-3 px-10 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                 <Save className="w-5 h-5" /> {t('save_changes')}
               </button>
            </div>
          </div>
        )}

        {activeSubTab === 'users' && (
           <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-400">
              <div className="flex justify-between items-center">
                 <div><h4 className="text-xl font-black text-white">{t('all_members')}</h4><p className="text-xs text-zinc-500 mt-1">Manage analyst credentials and access roles.</p></div>
                 <button onClick={() => { setIsUserFormOpen(true); setEditingUserId(null); setUserFormData({ username: '', email: '', password: '', role: 'L1' }); }} className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"><Plus className="w-4 h-4" /> {t('provision_analyst')}</button>
              </div>
              <div className="overflow-hidden border border-zinc-800 rounded-[2rem] bg-zinc-950/30">
                 <table className="w-full text-left">
                    <thead><tr className="border-b border-zinc-800 bg-zinc-900/50"><th className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Analyst</th><th className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">Role</th><th className="p-5 text-right text-[10px] font-black text-zinc-500 uppercase tracking-widest">Actions</th></tr></thead>
                    <tbody className="divide-y divide-zinc-800/30">
                       {users.map(u => (
                         <tr key={u.id} className="hover:bg-zinc-800/20 transition-all group">
                            <td className="p-5"><div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border ${u.role === 'Admin' ? 'bg-red-600/10 border-red-500/20 text-red-500' : 'bg-blue-600/10 border-blue-500/20 text-blue-500'}`}>{u.username.substring(0, 2).toUpperCase()}</div><div><p className="font-bold text-white text-sm">{u.username}</p><p className="text-[10px] text-zinc-500 font-mono">{u.email}</p></div></div></td>
                            <td className="p-5 text-center"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest border ${u.role === 'Admin' ? 'bg-red-600/10 border-red-500/20 text-red-500' : 'bg-blue-600/10 border-blue-500/20 text-blue-500'}`}>{u.role}</span></td>
                            <td className="p-5 text-right"><div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all"><button onClick={() => startEditUser(u)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-all"><Edit3 className="w-4 h-4" /></button><button onClick={async () => { if(confirm('Delete user?')) { await settingsService.deleteUser(u.id); onUsersUpdate(await settingsService.getUsers()); } }} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 transition-all"><Trash2 className="w-4 h-4" /></button></div></td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
              {isUserFormOpen && (
                 <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsUserFormOpen(false)} />
                    <div className="relative bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-lg shadow-2xl modal-entrance overflow-hidden">
                       <form onSubmit={handleSaveUser}>
                          <div className="p-8 border-b border-zinc-800 bg-zinc-950/30 flex justify-between items-center"><h4 className="text-sm font-black text-white uppercase tracking-widest">{editingUserId ? 'Edit Analyst' : 'New Analyst'}</h4><button type="button" onClick={() => setIsUserFormOpen(false)} className="text-zinc-500 hover:text-white transition-all"><X className="w-6 h-6"/></button></div>
                          <div className="p-8 space-y-6">
                             <div className="space-y-4">
                                <div className="space-y-1"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Username</label><div className="relative"><UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700" /><input required value={userFormData.username} onChange={e => setUserFormData(p => ({...p, username: e.target.value}))} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm text-white focus:border-blue-500/50 outline-none" placeholder="analyst_name" /></div></div>
                                <div className="space-y-1"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Email</label><div className="relative"><Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700" /><input required type="email" value={userFormData.email} onChange={e => setUserFormData(p => ({...p, email: e.target.value}))} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm text-white focus:border-blue-500/50 outline-none" placeholder="email@company.com" /></div></div>
                                <div className="space-y-1"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Password</label><div className="relative"><Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-700" /><input type="password" value={userFormData.password} onChange={e => setUserFormData(p => ({...p, password: e.target.value}))} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-12 pr-4 text-sm text-white focus:border-blue-500/50 outline-none" placeholder={editingUserId ? "•••••••• (Leave blank to keep)" : "••••••••"} /></div></div>
                                <div className="space-y-1"><label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">Role</label><select value={userFormData.role} onChange={e => setUserFormData(p => ({...p, role: e.target.value as UserRole}))} className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-blue-500/50 outline-none appearance-none"><option value="L1">Level 1 Analyst</option><option value="L2">Level 2 Analyst</option><option value="Admin">Administrator</option></select></div>
                             </div>
                          </div>
                          <div className="p-8 border-t border-zinc-800 flex justify-end bg-zinc-950/30 gap-3"><button type="button" onClick={() => setIsUserFormOpen(false)} className="px-6 py-3 text-zinc-500 hover:text-white font-black uppercase text-[10px] tracking-widest">Cancel</button><button type="submit" className="flex items-center gap-3 px-10 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"><Save className="w-4 h-4" /> Save Analyst</button></div>
                       </form>
                    </div>
                 </div>
              )}
           </div>
        )}

        {activeSubTab === 'system' && (
           <div className="space-y-8 animate-in slide-in-from-bottom-2 duration-400">
              <div className="bg-amber-500/5 border border-amber-500/20 p-8 rounded-3xl space-y-4">
                 <div className="flex items-center gap-4 text-amber-500 mb-2">
                    <AlertTriangle className="w-8 h-8" />
                    <h4 className="text-xl font-black uppercase tracking-tight">System Master Archive Protocol</h4>
                 </div>
                 <p className="text-sm text-zinc-400 leading-relaxed max-w-2xl font-medium">To collaborate with teammates across different machines, use the <span className="text-white font-bold">Master Archive</span>. This bundles all platform data (Users, Assets, Incidents, and Settings) into a portable package. Provide this file to your friend to provision their instance with your exact state.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <button onClick={handleExportMaster} className="p-8 rounded-[2rem] bg-zinc-950 border border-zinc-800 hover:border-blue-500/30 transition-all text-left group flex flex-col gap-4 shadow-inner">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform"><Download className="w-6 h-6" /></div>
                    <div><h5 className="text-lg font-black text-white uppercase tracking-tight">Export Full Archive</h5><p className="text-xs text-zinc-500 mt-1">Package all SOC intel and credentials into a single JSON deployment file.</p></div>
                 </button>
                 <button onClick={() => masterInputRef.current?.click()} className="p-8 rounded-[2rem] bg-zinc-950 border border-zinc-800 hover:border-emerald-500/30 transition-all text-left group flex flex-col gap-4 shadow-inner">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-600/10 flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform"><FileJson className="w-6 h-6" /></div>
                    <div><h5 className="text-lg font-black text-white uppercase tracking-tight">Import Master State</h5><p className="text-xs text-zinc-500 mt-1">Wipe local data and restore the entire platform state from a master file.</p></div>
                    <input type="file" ref={masterInputRef} onChange={handleImportMaster} className="hidden" accept=".json" />
                 </button>
              </div>
           </div>
        )}

        {activeSubTab === 'roles' && (
           <div className="space-y-12 animate-in slide-in-from-bottom-2 duration-400">
              <div className="space-y-4">
                 <h5 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2"><Shield className="w-4 h-4 text-blue-500" /> Functional Permissions</h5>
                 <div className="overflow-x-auto rounded-[2rem] border border-zinc-800 bg-zinc-950/50 shadow-2xl">
                    <table className="w-full text-left">
                       <thead><tr className="border-b border-zinc-800 bg-zinc-900/80"><th className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Capability</th>{(['Admin', 'L2', 'L1'] as UserRole[]).map(role => (<th key={role} className="p-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-center">{role}</th>))}</tr></thead>
                       <tbody className="divide-y divide-zinc-800/30">{[
                            { id: 'canCreateAsset', label: t('perm_asset_c') }, { id: 'canEditAsset', label: t('perm_asset_u') }, { id: 'canDeleteAsset', label: t('perm_asset_d') },
                            { id: 'canCreateIncident', label: t('perm_inc_c') }, { id: 'canEditIncident', label: t('perm_inc_u') }, { id: 'canDeleteIncident', label: t('perm_inc_d') },
                            { id: 'canCreateGuideline', label: t('perm_sop_c') }, { id: 'canEditGuideline', label: t('perm_sop_u') }, { id: 'canDeleteGuideline', label: t('perm_sop_d') },
                            { id: 'canApproveRequests', label: t('perm_req_a') }, { id: 'canManageTasks', label: t('perm_tasks_m') }, { id: 'canManageUsers', label: t('perm_users_m') },
                            { id: 'canImportExport', label: t('perm_import_export') }, { id: 'canDeleteNotes', label: t('perm_delete_notes') },
                          ].map(perm => (
                            <tr key={perm.id} className="hover:bg-zinc-800/20 transition-colors"><td className="p-5 text-sm font-bold text-zinc-300 uppercase tracking-tighter">{perm.label}</td>{(['Admin', 'L2', 'L1'] as UserRole[]).map(role => (<td key={role} className="p-5 text-center"><button onClick={() => togglePermission(role, perm.id as any)} className={`p-2 rounded-lg transition-all ${localRoles[role][perm.id as keyof RolePermissions] ? 'text-blue-500 bg-blue-500/10' : 'text-zinc-800 hover:text-zinc-600'}`}>{localRoles[role][perm.id as keyof RolePermissions] ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5" />}</button></td>))}</tr>
                          ))}</tbody>
                    </table>
                 </div>
              </div>
              <div className="flex justify-end pt-4 border-t border-zinc-800"><button onClick={handleSaveRoles} className="flex items-center gap-2 px-10 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all"><Save className="w-5 h-5" /> {t('save_changes')}</button></div>
           </div>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
