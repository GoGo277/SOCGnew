
import React, { useState, useEffect, useMemo } from 'react';
import { Task, User, Severity, TaskStatus, RolePermissions, Language } from '../types';
import { taskService } from '../services/taskService';
import { settingsService } from '../services/settingsService';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import { 
  CheckCircle2, Clock, AlertCircle, Plus, Search, 
  Filter, MoreVertical, User as UserIcon, Calendar, 
  Hash, LayoutGrid, List, Trash2, Edit3, X, Save, Users
} from 'lucide-react';
import { getTranslator } from '../translations';

interface TasksPageProps {
  currentUser: User;
  permissions: RolePermissions;
  language: Language;
}

const TasksPage: React.FC<TasksPageProps> = ({ currentUser, permissions, language }) => {
  const t = useMemo(() => getTranslator(language), [language]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'All'>('All');
  const [filterMember, setFilterMember] = useState<string | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assignedTo: '',
    dueDate: '',
    severity: 'Medium' as Severity
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setTasks(taskService.getTasks());
    setUsers(settingsService.getUsers());
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.assignedTo) return;
    
    taskService.saveTask({
      ...formData,
      id: editingTask?.id,
      creatorId: currentUser.id,
      status: editingTask?.status || 'Todo'
    });
    resetForm();
    loadData();
  };

  const resetForm = () => {
    setFormData({ title: '', description: '', assignedTo: '', dueDate: '', severity: 'Medium' });
    setEditingTask(null);
    setIsFormOpen(false);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setFormData({
      title: task.title,
      description: task.description,
      assignedTo: task.assignedTo,
      dueDate: task.dueDate.split('T')[0],
      severity: task.severity
    });
    setIsFormOpen(true);
  };

  const openDeleteModal = (task: Task) => {
    setTaskToDelete(task);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = () => {
    if (taskToDelete) {
      taskService.deleteTask(taskToDelete.id);
      setIsDeleteModalOpen(false);
      setTaskToDelete(null);
      loadData();
    }
  };

  const handleStatusChange = (id: string, status: TaskStatus) => {
    taskService.updateTaskStatus(id, status);
    loadData();
  };

  const filteredTasks = tasks.filter(t_obj => {
    const matchesStatus = filterStatus === 'All' || t_obj.status === filterStatus;
    const matchesMember = filterMember === 'All' || t_obj.assignedTo === filterMember;
    const matchesSearch = t_obj.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          t_obj.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesMember && matchesSearch;
  });

  const getSeverityStyle = (s: Severity) => {
    switch(s) {
      case 'Critical': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'High': return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'Medium': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      default: return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getStatusStyle = (s: TaskStatus) => {
    switch(s) {
      case 'Done': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      case 'Review': return 'text-purple-400 bg-purple-500/10 border-purple-500/20';
      case 'In Progress': return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      default: return 'text-zinc-500 bg-zinc-800 border-zinc-700';
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-blue-500" /> {t('tasks')}
          </h3>
          <p className="text-zinc-500 text-sm font-medium mt-1">Deploy and track team objectives across the perimeter.</p>
        </div>
        {permissions.canManageTasks && (
          <button 
            onClick={() => { setEditingTask(null); setIsFormOpen(true); }}
            className="flex items-center gap-3 px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:shadow-blue-500/40 active:scale-95 transition-all shrink-0"
          >
            <Plus className="w-5 h-5" /> {t('deploy_task')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className="md:col-span-3 relative group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-blue-500 transition-colors" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('search_tactical')}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl py-3 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </div>
        <div className="md:col-span-1 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4">
          <Filter className="w-4 h-4 text-zinc-500 shrink-0" />
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="bg-transparent border-none outline-none text-xs font-black text-zinc-400 uppercase tracking-widest w-full py-3 cursor-pointer"
          >
            <option value="All">{t('all_status')}</option>
            <option value="Todo">Todo</option>
            <option value="In Progress">In Progress</option>
            <option value="Review">Review</option>
            <option value="Done">Done</option>
          </select>
        </div>
        <div className="md:col-span-2 flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-2xl px-4">
          <Users className="w-4 h-4 text-zinc-500 shrink-0" />
          <select 
            value={filterMember}
            onChange={(e) => setFilterMember(e.target.value)}
            className="bg-transparent border-none outline-none text-xs font-black text-zinc-400 uppercase tracking-widest w-full py-3 cursor-pointer"
          >
            <option value="All">{t('all_members')}</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredTasks.map(task => {
          const assignee = users.find(u => u.id === task.assignedTo);
          const canEditThis = permissions.canManageTasks;
          const canUpdateStatus = permissions.canManageTasks || task.assignedTo === currentUser.id;

          return (
            <div key={task.id} className="tactical-row group bg-zinc-900 border border-zinc-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all flex flex-col gap-4 relative overflow-hidden">
              <div className="flex justify-between items-start">
                <div className="space-y-1">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${getSeverityStyle(task.severity)}`}>
                    {t(task.severity.toLowerCase())}
                  </span>
                  <h4 className="text-lg font-bold text-white leading-tight group-hover:text-blue-400 transition-colors">{task.title}</h4>
                </div>
                <div className="flex gap-1">
                   {canEditThis && (
                     <>
                        <button onClick={() => handleEdit(task)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-blue-400 transition-all active:scale-90"><Edit3 className="w-4 h-4" /></button>
                        <button onClick={() => openDeleteModal(task)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-red-400 transition-all active:scale-90"><Trash2 className="w-4 h-4" /></button>
                     </>
                   )}
                </div>
              </div>

              <p className="text-zinc-400 text-sm line-clamp-2 leading-relaxed">
                {task.description}
              </p>

              <div className="grid grid-cols-2 gap-4 mt-2">
                 <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden shrink-0">
                       {assignee?.profilePic ? <img src={assignee.profilePic} className="w-full h-full object-cover" /> : <UserIcon className="w-4 h-4 text-zinc-500" />}
                    </div>
                    <div className="min-w-0">
                       <p className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter">{t('assigned_to')}</p>
                       <p className="text-xs font-bold text-zinc-300 truncate">{assignee?.username || 'Unassigned'}</p>
                    </div>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="p-2 bg-zinc-800 rounded-lg border border-zinc-700 text-zinc-500 shrink-0">
                       <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                       <p className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter">{t('due_date')}</p>
                       <p className="text-xs font-bold text-zinc-300">{new Date(task.dueDate).toLocaleDateString()}</p>
                    </div>
                 </div>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-between mt-auto">
                 <select 
                    value={task.status}
                    disabled={!canUpdateStatus}
                    onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                    className={`text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full border outline-none cursor-pointer transition-all ${getStatusStyle(task.status)} ${!canUpdateStatus ? 'opacity-50 cursor-not-allowed' : ''}`}
                 >
                    <option value="Todo">Todo</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Review">Review</option>
                    <option value="Done">Done</option>
                 </select>
                 <span className="text-[9px] font-mono text-zinc-600">ID: {task.id.substring(5, 13)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={resetForm} />
           <div className="relative bg-zinc-900 border border-zinc-800 rounded-[2.5rem] w-full max-w-lg shadow-2xl animate-in zoom-in duration-200 overflow-hidden">
              <form onSubmit={handleSave}>
                 <div className="p-8 border-b border-zinc-800 flex justify-between items-center bg-zinc-950/30">
                    <h4 className="text-lg font-black text-white uppercase tracking-widest">{editingTask ? t('edit') : t('deploy_task')}</h4>
                    <button type="button" onClick={resetForm} className="text-zinc-500 hover:text-white transition-all"><X className="w-6 h-6" /></button>
                 </div>
                 <div className="p-8 space-y-6">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('doc_title')}</label>
                       <input 
                         required
                         value={formData.title}
                         onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
                         placeholder="Objective Title..."
                         className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:border-blue-500/50 outline-none"
                       />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('assign_analyst')}</label>
                          <select 
                            required
                            value={formData.assignedTo}
                            onChange={e => setFormData(p => ({ ...p, assignedTo: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500/50"
                          >
                             <option value="">{t('all_members')}</option>
                             {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                          </select>
                       </div>
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('due_date')}</label>
                          <input 
                            required
                            type="date"
                            value={formData.dueDate}
                            onChange={e => setFormData(p => ({ ...p, dueDate: e.target.value }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white focus:border-blue-500/50 outline-none"
                          />
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                       <div className="space-y-1">
                          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('mission_severity')}</label>
                          <select 
                            value={formData.severity}
                            onChange={e => setFormData(p => ({ ...p, severity: e.target.value as Severity }))}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-sm text-white outline-none focus:border-blue-500/50"
                          >
                             <option value="Low">Low</option>
                             <option value="Medium">Medium</option>
                             <option value="High">High</option>
                             <option value="Critical">Critical</option>
                          </select>
                       </div>
                    </div>
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-zinc-600 uppercase tracking-widest ml-1">{t('detailed_description')}</label>
                       <textarea 
                         rows={4}
                         value={formData.description}
                         onChange={e => setFormData(p => ({ ...p, description: e.target.value }))}
                         className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-sm text-white focus:border-blue-500/50 outline-none resize-none"
                       />
                    </div>
                 </div>
                 <div className="p-8 border-t border-zinc-800 flex justify-end bg-zinc-950/30">
                    <button 
                      type="submit"
                      className="flex items-center gap-3 px-10 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-blue-600/20 hover:shadow-blue-500/40 active:scale-95 transition-all"
                    >
                      <Save className="w-4 h-4" /> {t('commit')}
                    </button>
                 </div>
              </form>
           </div>
        </div>
      )}

      <DeleteConfirmationModal 
        isOpen={isDeleteModalOpen} 
        onClose={() => setIsDeleteModalOpen(false)} 
        onConfirm={confirmDelete} 
        assetName={taskToDelete?.title || ''} 
        language={language}
      />
    </div>
  );
};

export default TasksPage;
