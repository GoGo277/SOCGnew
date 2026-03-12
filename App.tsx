
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Asset, Note, Incident, User, AppSettings, Notification, ApprovalRequest, AssetType, Severity, IncidentStatus, Task, Announcement, Guideline, AuditLog } from './types';
import { assetService } from './services/assetService';
import { incidentService } from './services/incidentService';
import { settingsService } from './services/settingsService';
import { requestService } from './services/requestService';
import { taskService } from './services/taskService';
import { announcementService } from './services/announcementService';
import { guidelineService } from './services/guidelineService';
import { chatService } from './services/chatService';
import { auditService } from './services/auditService';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import AssetModal from './components/AssetModal';
import AssetForm from './components/AssetForm';
import NoteModal from './components/NoteModal';
import DeleteConfirmationModal from './components/DeleteConfirmationModal';
import IncidentForm from './components/IncidentForm';
import IncidentModal from './components/IncidentModal';
import SettingsPage from './components/SettingsPage';
import NotificationCenter from './components/NotificationCenter';
import MyRequestsPage from './components/MyRequestsPage';
import AdminRequestsPage from './components/AdminRequestsPage';
import RequestDetailModal from './components/RequestDetailModal';
import GuidelinesPage from './components/GuidelinesPage';
import ProfilePage from './components/ProfilePage';
import MessagingPage from './components/MessagingPage';
import AnnouncementsPage from './components/AnnouncementsPage';
import TasksPage from './components/TasksPage';
import Login from './components/Login';
import Toast from './components/Toast';
import { Plus, Tag as TagIcon, Search, SlidersHorizontal, Activity, ArrowRight, Download, Upload, Trash2, Edit3 } from 'lucide-react';
import { ASSET_TYPE_ICONS, ASSET_TYPES, ASSET_TYPE_COLORS } from './constants';
import { getTranslator } from './translations';

const LAST_SEEN_KEY = 'soc_last_seen_tabs';

export const getTagColor = (tag: string) => {
  const colors = [
    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    'bg-purple-500/10 text-purple-400 border-purple-500/20',
    'bg-pink-500/10 text-pink-400 border-pink-500/20',
    'bg-amber-500/10 text-amber-400 border-amber-500/20',
    'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  ];
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(settingsService.getActiveSession());
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<AppSettings>(settingsService.getSettings());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isNotifCenterOpen, setIsNotifCenterOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<Record<string, string>>(() => {
    const data = localStorage.getItem(LAST_SEEN_KEY);
    return data ? JSON.parse(data) : {};
  });

  const [toast, setToast] = useState<{ message: string, isOpen: boolean }>({ message: '', isOpen: false });

  const t = useMemo(() => getTranslator(settings.language), [settings.language]);
  const assetInputRef = useRef<HTMLInputElement>(null);
  const incidentInputRef = useRef<HTMLInputElement>(null);

  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [incidentSearchQuery, setIncidentSearchQuery] = useState('');
  const [tagFilterQuery, setTagFilterQuery] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<AssetType | 'All'>('All');
  const [severityFilter, setSeverityFilter] = useState<Severity | 'All'>('All');
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'All'>('All');

  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [isAssetFormOpen, setIsAssetFormOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [noteTarget, setNoteTarget] = useState<{ id: string, type: 'asset' | 'incident', data: any } | null>(null);
  const [isNoteFormOpen, setIsNoteFormOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [isIncidentFormOpen, setIsIncidentFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteContext, setDeleteContext] = useState<'asset' | 'incident' | 'note'>('asset');
  const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
  const [incidentToDelete, setIncidentToDelete] = useState<Incident | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<{ targetId: string, type: 'asset' | 'incident', noteId: string } | null>(null);

  const showToast = (message: string) => setToast({ message, isOpen: true });

  const loadData = useCallback(async () => {
    const session = await settingsService.getActiveSession();
    if (!session) {
      setCurrentUser(null);
      return;
    }
    try {
      setCurrentUser(session);
      const fetchedAssets = await assetService.getAssets();
      setAssets(fetchedAssets);
      const fetchedIncidents = await incidentService.getIncidents();
      setIncidents(fetchedIncidents);
      const fetchedTasks = await taskService.getTasks();
      setTasks(fetchedTasks);
      const fetchedAnnouncements = await announcementService.getAnnouncements();
      setAnnouncements(fetchedAnnouncements);
      const fetchedRequests = await requestService.getRequests();
      setRequests(fetchedRequests);
      const fetchedGuidelines = await guidelineService.getGuidelines();
      setGuidelines(fetchedGuidelines);
      const fetchedAuditLogs = await auditService.getLogs();
      setAuditLogs(fetchedAuditLogs);
      setUsers(await settingsService.getUsers());
      setSettings(await settingsService.getSettings());
      const fetchedNotifications = await requestService.getNotifications(session.id);
      setNotifications(fetchedNotifications);
    } catch (e) {
      console.error("Data loading failure", e);
    }
  }, []);

  // REAL-TIME SYNC: Listen for storage changes from other tabs
  useEffect(() => {
    const handleSync = (e: StorageEvent | Event) => {
      loadData();
    };
    window.addEventListener('storage', handleSync);
    return () => window.removeEventListener('storage', handleSync);
  }, [loadData]);

  useEffect(() => {
    if (selectedAsset && currentUser) {
      const fresh = assets.find(a => a.id === selectedAsset.id);
      if (fresh) setSelectedAsset(fresh);
      auditService.log(currentUser, 'VIEW_ASSET', { id: selectedAsset.id, name: selectedAsset.name });
    }
  }, [selectedAsset?.id]);

  useEffect(() => {
    if (selectedIncident && currentUser) {
      const fresh = incidents.find(i => i.id === selectedIncident.id);
      if (fresh) setSelectedIncident(fresh);
      auditService.log(currentUser, 'VIEW_INCIDENT', { id: selectedIncident.id, name: selectedIncident.eventName });
    }
  }, [selectedIncident?.id]);

  useEffect(() => {
    if (currentUser) {
      loadData();
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }
  }, [loadData, !!currentUser]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    const now = new Date().toISOString();
    const updated = { ...lastSeen, [tabId]: now };
    setLastSeen(updated);
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(updated));
  };

  const [navCounts, setNavCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const updateNavCounts = async () => {
      const counts: Record<string, number> = {};
      const pendingReqCount = requests.filter(r => r.status === 'PENDING').length;
      counts['requests'] = pendingReqCount;
      counts['admin-requests'] = pendingReqCount;

      const isNew = (timestamp: string, lastSeenTime?: string) => {
        if (!lastSeenTime) return true;
        return new Date(timestamp).getTime() > new Date(lastSeenTime).getTime();
      };

      counts['assets'] = assets.filter(a => isNew(a.createdAt, lastSeen['assets']) || isNew(a.updatedAt, lastSeen['assets'])).length;
      counts['incidents'] = incidents.filter(i => isNew(i.createdAt, lastSeen['incidents']) || isNew(i.updatedAt, lastSeen['incidents'])).length;
      counts['guidelines'] = guidelines.filter(g => isNew(g.updatedAt, lastSeen['guidelines'])).length;
      counts['announcements'] = announcements.filter(a => isNew(a.createdAt, lastSeen['announcements'])).length;
      
      const rooms = await chatService.getRooms();
      let unreadMessages = 0;
      for (const room of rooms) {
        const messages = await chatService.getMessages(room.id);
        if (messages.some(m => m.senderId !== currentUser?.id && isNew(m.timestamp, lastSeen['messaging']))) {
          unreadMessages++;
        }
      }
      counts['messaging'] = unreadMessages;
      if (counts[activeTab] !== undefined) counts[activeTab] = 0;
      setNavCounts(counts);
    };
    updateNavCounts();
  }, [requests, assets, incidents, announcements, guidelines, lastSeen, currentUser, activeTab]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    auditService.log(user, 'LOGIN');
  };

  const handleLogout = () => {
    if (currentUser) auditService.log(currentUser, 'LOGOUT');
    settingsService.logout();
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} settings={settings} />;
  }

  const permissions = settings.rolePermissions[currentUser.role];

  const handleSaveAsset = async (assetData: any) => {
    if (currentUser.role !== 'Admin' && (!permissions.canCreateAsset || !permissions.canEditAsset)) {
      await requestService.createRequest(currentUser, assetData.id ? 'EDIT_ASSET' : 'ADD_ASSET', assetData, 'Tactical Submission');
      auditService.log(currentUser, 'REQUEST_CREATED', { id: '', name: assetData.name }, { action: assetData.id ? 'EDIT_ASSET' : 'ADD_ASSET' });
      showToast("Protocol Request Logged");
    } else {
      const saved = await assetService.saveAsset(assetData);
      if (saved) {
        auditService.log(currentUser, assetData.id ? 'EDIT_ASSET' : 'CREATE_ASSET', { id: saved.id, name: saved.name });
        showToast("Asset Signal Updated");
      }
    }
    loadData();
    setIsAssetFormOpen(false);
  };

  const handleSaveIncident = async (incidentData: any) => {
    if (currentUser.role !== 'Admin' && (!permissions.canCreateIncident || !permissions.canEditIncident)) {
      await requestService.createRequest(currentUser, incidentData.id ? 'EDIT_INCIDENT' : 'ADD_INCIDENT', incidentData, 'Tactical Submission');
      auditService.log(currentUser, 'REQUEST_CREATED', { id: '', name: incidentData.eventName }, { action: incidentData.id ? 'EDIT_INCIDENT' : 'ADD_INCIDENT' });
      showToast("Protocol Request Logged");
    } else {
      const saved = await incidentService.saveIncident(incidentData);
      if (saved) {
        auditService.log(currentUser, incidentData.id ? 'EDIT_INCIDENT' : 'CREATE_INCIDENT', { id: saved.id, name: saved.eventName });
        showToast("Incident Record Committed");
      }
    }
    loadData();
    setIsIncidentFormOpen(false);
  };

  const handleSaveNote = async (note: Note) => {
    if (!noteTarget) return;

    if (noteTarget.type === 'asset') {
      const target = assets.find(a => a.id === noteTarget.id);
      if (target) {
        const existingNoteIdx = target.notes.findIndex(n => n.id === note.id);
        const updatedNotes = [...target.notes];
        if (existingNoteIdx !== -1) updatedNotes[existingNoteIdx] = note;
        else updatedNotes.push(note);
        await assetService.saveAsset({ ...target, notes: updatedNotes });
      }
    } else {
      const target = incidents.find(i => i.id === noteTarget.id);
      if (target) {
        const existingNoteIdx = target.notes.findIndex(n => n.id === note.id);
        const updatedNotes = [...target.notes];
        if (existingNoteIdx !== -1) updatedNotes[existingNoteIdx] = note;
        else updatedNotes.push(note);
        await incidentService.saveIncident({ ...target, notes: updatedNotes });
      }
    }
    
    showToast(editingNote ? "Note Revision Committed" : "Security Note Logged");
    loadData();
    setIsNoteFormOpen(false);
    setNoteTarget(null);
    setEditingNote(null);
  };

  const handleDeleteNote = (targetId: string, type: 'asset' | 'incident', noteId: string) => {
    setNoteToDelete({ targetId, type, noteId });
    setDeleteContext('note');
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (deleteContext === 'asset' && assetToDelete) {
      await assetService.deleteAsset(assetToDelete.id);
      auditService.log(currentUser, 'DELETE_ASSET', { id: assetToDelete.id, name: assetToDelete.name });
      showToast("Asset Record Purged");
    } else if (deleteContext === 'incident' && incidentToDelete) {
      await incidentService.deleteIncident(incidentToDelete.id);
      auditService.log(currentUser, 'DELETE_INCIDENT', { id: incidentToDelete.id, name: incidentToDelete.eventName });
      showToast("Incident Signal Removed");
    } else if (deleteContext === 'note' && noteToDelete) {
      const { targetId, type, noteId } = noteToDelete;
      if (type === 'asset') {
        const asset = assets.find(a => a.id === targetId);
        if (asset) {
          await assetService.saveAsset({ ...asset, notes: asset.notes.filter(n => n.id !== noteId) });
        }
      } else {
        const incident = incidents.find(i => i.id === targetId);
        if (incident) {
          await incidentService.saveIncident({ ...incident, notes: incident.notes.filter(n => n.id !== noteId) });
        }
      }
      showToast("Note Permanently Deleted");
    }
    loadData();
    setIsDeleteModalOpen(false);
    setNoteToDelete(null);
  };

  const handleExportAssets = async () => {
    const data = await assetService.exportAssets();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assets_export_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Infrastructure Data Exported");
  };

  const handleExportIncidents = async () => {
    const data = await incidentService.exportIncidents();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `incidents_export_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("Incident Logs Exported");
  };

  const filteredAssets = assets.filter(a => {
    const q = assetSearchQuery.toLowerCase();
    return ((a.name || '').toLowerCase().includes(q) || (a.ipv4 || '').includes(q)) && (assetTypeFilter === 'All' || a.type === assetTypeFilter);
  });

  const filteredIncidents = incidents.filter(i => {
    const q = incidentSearchQuery.toLowerCase();
    const tq = tagFilterQuery.toLowerCase();
    return (i.eventName || '').toLowerCase().includes(q) && 
           (tq === '' || (i.tags || []).some(tag => tag.toLowerCase().includes(tq))) && 
           (severityFilter === 'All' || i.severity === severityFilter) && 
           (statusFilter === 'All' || i.status === statusFilter);
  });

  const totalAlerts = notifications.filter(n => !n.read).length + (permissions.canApproveRequests ? requests.filter(r => r.status === 'PENDING').length : 0);

  const renderActiveTab = () => {
    switch(activeTab) {
      case 'dashboard': return <Dashboard assets={assets} incidents={incidents} tasks={tasks} requests={requests} announcements={announcements} guidelines={guidelines} auditLogs={auditLogs} language={settings.language} />;
      case 'assets': return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div><h3 className="text-3xl font-black text-white">{t('assets')}</h3><p className="text-zinc-500 text-sm">{t('global_perimeter_mgmt')}</p></div>
            <div className="flex gap-3">
              {permissions.canImportExport && (
                <>
                  <button onClick={handleExportAssets} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-700 active:scale-95 transition-all flex items-center gap-2">
                    <Download className="w-3.5 h-3.5" /> {t('export')}
                  </button>
                  <button onClick={() => assetInputRef.current?.click()} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-700 active:scale-95 transition-all flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" /> {t('import')}
                  </button>
                  <input type="file" ref={assetInputRef} className="hidden" accept=".json" onChange={async (e) => {
                    const reader = new FileReader();
                    reader.onload = async (ev) => { 
                      try {
                        await assetService.importAssets(JSON.parse(ev.target?.result as string)); 
                        loadData(); 
                        showToast("Asset Catalog Imported");
                      } catch(err) {
                        showToast("Failed to process payload");
                      }
                    };
                    if (e.target.files?.[0]) reader.readAsText(e.target.files[0]);
                  }} />
                </>
              )}
              {permissions.canCreateAsset && (
                <button onClick={() => { setEditingAsset(null); setIsAssetFormOpen(true); }} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-xl flex items-center gap-2 active:scale-95 transition-all">
                  <Plus className="w-4 h-4" /> {t('add_asset')}
                </button>
              )}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 bg-zinc-950/30 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-[300px] bg-zinc-900/50 px-3 py-2 rounded-xl border border-zinc-800 focus-within:border-blue-500/50 transition-all">
                <Search className="w-4 h-4 text-zinc-500" />
                <input type="text" placeholder={t('search_assets')} value={assetSearchQuery} onChange={e => setAssetSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm text-zinc-200 w-full" />
              </div>
              <select value={assetTypeFilter} onChange={e => setAssetTypeFilter(e.target.value as any)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-zinc-400 font-bold uppercase cursor-pointer outline-none"><option value="All">{t('all_types')}</option>{ASSET_TYPES.map(type => <option key={type} value={type}>{type}</option>)}</select>
            </div>
            <table className="w-full text-left">
              <thead><tr className="border-b border-zinc-800 bg-zinc-950/40"><th className="p-5 text-[10px] font-bold text-zinc-500 uppercase">{t('asset_details')}</th><th className="p-5 text-[10px] font-bold text-zinc-500 uppercase">{t('network_info')}</th><th className="p-5 text-right text-[10px] font-bold text-zinc-500 uppercase">{t('actions')}</th></tr></thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredAssets.map(asset => (
                  <tr key={asset.id} className="tactical-row hover:bg-blue-500/[0.04] transition-all cursor-pointer" onClick={() => setSelectedAsset(asset)}>
                    <td className="p-5"><div className="flex items-center gap-3"><div className={`p-2 bg-zinc-800 rounded-lg ${ASSET_TYPE_COLORS[asset.type]}`}>{ASSET_TYPE_ICONS[asset.type]}</div><div><p className="font-bold text-sm text-zinc-200">{asset.name}</p><p className="text-[10px] text-zinc-500 font-black uppercase tracking-tighter">{asset.type}</p></div></div></td>
                    <td className="p-5 font-mono text-sm text-blue-400/80">{asset.ipv4}</td>
                    <td className="p-5 text-right"><div className="flex justify-end gap-1">
                      {permissions.canEditAsset && <button onClick={(e) => { e.stopPropagation(); setEditingAsset(asset); setIsAssetFormOpen(true); }} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-all"><Edit3 className="w-4 h-4" /></button>}
                      {permissions.canDeleteAsset && <button onClick={(e) => { e.stopPropagation(); setAssetToDelete(asset); setDeleteContext('asset'); setIsDeleteModalOpen(true); }} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 transition-all"><Trash2 className="w-4 h-4" /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      case 'incidents': return (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div><h3 className="text-3xl font-black text-white">{t('incidents')}</h3><p className="text-zinc-500 text-sm">{t('threat_detection_subtitle')}</p></div>
            <div className="flex gap-3">
              {permissions.canImportExport && (
                <>
                  <button onClick={handleExportIncidents} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-700 active:scale-95 transition-all flex items-center gap-2">
                    <Download className="w-3.5 h-3.5" /> {t('export')}
                  </button>
                  <button onClick={() => incidentInputRef.current?.click()} className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-bold border border-zinc-700 active:scale-95 transition-all flex items-center gap-2">
                    <Upload className="w-3.5 h-3.5" /> {t('import')}
                  </button>
                  <input type="file" ref={incidentInputRef} className="hidden" accept=".json" onChange={async (e) => {
                    const reader = new FileReader();
                    reader.onload = async (ev) => { 
                      try {
                        await incidentService.importIncidents(JSON.parse(ev.target?.result as string)); 
                        loadData(); 
                        showToast("Incidents Repository Updated");
                      } catch(err) {
                        showToast("Failed to process payload");
                      }
                    };
                    if (e.target.files?.[0]) reader.readAsText(e.target.files[0]);
                  }} />
                </>
              )}
              {permissions.canCreateIncident && (
                <button onClick={() => { setEditingIncident(null); setIsIncidentFormOpen(true); }} className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-xs font-bold shadow-xl flex items-center gap-2 active:scale-95 transition-all">
                  <Plus className="w-4 h-4" /> {t('report_incident')}
                </button>
              )}
            </div>
          </div>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 bg-zinc-950/30 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 flex-1 min-w-[300px] bg-zinc-900/50 px-3 py-2 rounded-xl border border-zinc-800 focus-within:border-red-500/50 transition-all">
                <Search className="w-4 h-4 text-zinc-500" />
                <input type="text" placeholder={t('search_events')} value={incidentSearchQuery} onChange={e => setIncidentSearchQuery(e.target.value)} className="bg-transparent border-none outline-none text-sm text-zinc-200 w-full" />
              </div>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as any)} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-xs text-zinc-400 font-bold uppercase cursor-pointer outline-none"><option value="All">{t('severity')}</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option><option value="Critical">Critical</option></select>
            </div>
            <table className="w-full text-left">
              <thead><tr className="border-b border-zinc-800 bg-zinc-950/40"><th className="p-5 text-[10px] font-bold text-zinc-500 uppercase">{t('incident_event')}</th><th className="p-5 text-[10px] font-bold text-zinc-500 uppercase">{t('source_ip')}</th><th className="p-5 text-[10px] font-bold text-zinc-500 uppercase">{t('dest_ip')}</th><th className="p-5 text-right text-[10px] font-bold text-zinc-500 uppercase">{t('status')}</th></tr></thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredIncidents.map(incident => (
                  <tr key={incident.id} className="tactical-row hover:bg-red-500/[0.04] transition-all cursor-pointer" onClick={() => setSelectedIncident(incident)}>
                    <td className="p-5"><p className="font-bold text-sm text-zinc-200">{incident.eventName}</p><p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">{t((incident.severity || 'Medium').toLowerCase())}</p></td>
                    <td className="p-5 font-mono text-xs text-red-400/80">{incident.sourceIp}</td>
                    <td className="p-5 font-mono text-xs text-blue-400/80">{incident.destinationIp}</td>
                    <td className="p-5 text-right"><span className={`text-[9px] px-2 py-0.5 rounded font-black border uppercase tracking-widest ${(incident.status || 'New') === 'Resolved' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}>{t((incident.status || 'New').toLowerCase())}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      case 'tasks': return <TasksPage currentUser={currentUser} permissions={permissions} language={settings.language} />;
      case 'announcements': return <AnnouncementsPage currentUser={currentUser} language={settings.language} />;
      case 'messaging': return <MessagingPage currentUser={currentUser} language={settings.language} />;
      case 'guidelines': return <GuidelinesPage currentUser={currentUser} permissions={permissions} guidelines={guidelines} onRefresh={() => { loadData(); showToast("Guidelines Repository Updated"); }} language={settings.language} />;
      case 'admin-requests': return currentUser.role === 'Admin' && <AdminRequestsPage currentUser={currentUser} requests={requests} onViewDetails={setSelectedRequest} onRefresh={loadData} language={settings.language} />;
      case 'requests': return <MyRequestsPage currentUser={currentUser} requests={requests} onViewDetails={setSelectedRequest} onRefresh={loadData} language={settings.language} />;
      case 'profile': return <ProfilePage user={currentUser} onUpdate={() => { loadData(); showToast("Profile Metadata Updated"); }} language={settings.language} />;
      case 'settings': return currentUser.role === 'Admin' && <SettingsPage settings={settings} users={users} onSettingsUpdate={(s) => { setSettings(s); loadData(); showToast("Core Parameters Updated"); }} onUsersUpdate={(u) => { setUsers(u); loadData(); showToast("Analyst Registry Updated"); }} />;
      default: return null;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={handleTabChange} currentUser={currentUser} settings={settings} onLogout={handleLogout} totalAlerts={totalAlerts} onToggleNotifCenter={() => setIsNotifCenterOpen(!isNotifCenterOpen)} isNotifCenterOpen={isNotifCenterOpen} navCounts={navCounts}>
      <NotificationCenter isOpen={isNotifCenterOpen} onClose={() => setIsNotifCenterOpen(false)} currentUser={currentUser} notifications={notifications} requests={requests} onUpdate={loadData} onOpenRequest={setSelectedRequest} language={settings.language} />
      {renderActiveTab()}
      {selectedRequest && <RequestDetailModal request={selectedRequest} isOpen={true} onClose={() => setSelectedRequest(null)} canApprove={permissions.canApproveRequests} onResolve={async (st) => { await requestService.resolveRequest(selectedRequest.id, currentUser, st); auditService.log(currentUser, 'REQUEST_RESOLVED', { id: selectedRequest.id, name: selectedRequest.action }, { status: st }); loadData(); setSelectedRequest(null); showToast(`Request ${st}`); }} language={settings.language} />}
      {selectedAsset && <AssetModal asset={selectedAsset} isOpen={true} permissions={permissions} currentUser={currentUser} onClose={() => setSelectedAsset(null)} onEdit={a => { setEditingAsset(a); setIsAssetFormOpen(true); }} onDelete={() => { setAssetToDelete(selectedAsset); setDeleteContext('asset'); setIsDeleteModalOpen(true); }} onAddNote={() => { setNoteTarget({ id: selectedAsset.id, type: 'asset', data: selectedAsset }); setEditingNote(null); setIsNoteFormOpen(true); }} onEditNote={(note) => { setNoteTarget({ id: selectedAsset.id, type: 'asset', data: selectedAsset }); setEditingNote(note); setIsNoteFormOpen(true); }} onDeleteNote={(noteId) => handleDeleteNote(selectedAsset.id, 'asset', noteId)} language={settings.language} />}
      {isAssetFormOpen && <AssetForm asset={editingAsset} onSave={handleSaveAsset} onCancel={() => setIsAssetFormOpen(false)} language={settings.language} />}
      {selectedIncident && <IncidentModal incident={selectedIncident} isOpen={true} permissions={permissions} currentUser={currentUser} onClose={() => setSelectedIncident(null)} onEdit={i => { setEditingIncident(i); setIsIncidentFormOpen(true); }} onDelete={() => { setIncidentToDelete(selectedIncident); setDeleteContext('incident'); setIsDeleteModalOpen(true); }} onAddNote={() => { setNoteTarget({ id: selectedIncident.id, type: 'incident', data: selectedIncident }); setEditingNote(null); setIsNoteFormOpen(true); }} onEditNote={(note) => { setNoteTarget({ id: selectedIncident.id, type: 'incident', data: selectedIncident }); setEditingNote(note); setIsNoteFormOpen(true); }} onDeleteNote={(noteId) => handleDeleteNote(selectedIncident.id, 'incident', noteId)} language={settings.language} />}
      {isIncidentFormOpen && <IncidentForm incident={editingIncident} assets={assets} onSave={handleSaveIncident} onCancel={() => setIsIncidentFormOpen(false)} language={settings.language} />}
      <DeleteConfirmationModal isOpen={isDeleteModalOpen} onClose={() => setIsDeleteModalOpen(false)} onConfirm={confirmDelete} assetName={deleteContext === 'asset' ? assetToDelete?.name || '' : deleteContext === 'incident' ? incidentToDelete?.eventName || '' : "security note"} language={settings.language} />
      {isNoteFormOpen && noteTarget && (
        <NoteModal targetName={noteTarget.type === 'asset' ? noteTarget.data.name : noteTarget.data.eventName} targetTypeLabel={noteTarget.type === 'asset' ? t('assets') : t('incidents')} isOpen={isNoteFormOpen} currentUser={currentUser} onClose={() => { setIsNoteFormOpen(false); setNoteTarget(null); setEditingNote(null); }} onSave={handleSaveNote} language={settings.language} initialNote={editingNote} />
      )}
      <Toast message={toast.message} isOpen={toast.isOpen} onClose={() => setToast(p => ({ ...p, isOpen: false }))} />
    </Layout>
  );
};

export default App;
