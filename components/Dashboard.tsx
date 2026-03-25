
import React, { useMemo } from 'react';
import { Asset, Incident, Task, ApprovalRequest, Announcement, Language, Guideline } from '../types';
import { auditService, AuditLog } from '../services/auditService';
import { 
  Database, ShieldCheck, AlertTriangle, Activity, 
  CheckCircle2, ClipboardList, Megaphone, Zap, 
  Terminal, ArrowUpRight, TrendingUp, ShieldAlert,
  Users, Clock, BookOpen, HardDrive, FileText,
  UserCheck, Power, Eye, MousePointer2
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, AreaChart, Area 
} from 'recharts';
import { getTranslator } from '../translations';

interface DashboardProps {
  assets: Asset[];
  incidents: Incident[];
  tasks: Task[];
  requests: ApprovalRequest[];
  announcements: Announcement[];
  guidelines: Guideline[];
  auditLogs: AuditLog[];
  language: Language;
}

const Dashboard: React.FC<DashboardProps> = ({ 
  assets, 
  incidents, 
  tasks, 
  requests, 
  announcements,
  guidelines,
  auditLogs,
  language
}) => {
  const t = useMemo(() => getTranslator(language), [language]);

  // Computed Tactical Metrics
  const metrics = useMemo(() => {
    const criticalIncidents = incidents.filter(i => i.severity === 'Critical' && i.status !== 'Resolved').length;
    const pendingTasks = tasks.filter(task => task.status !== 'Done').length;
    const completionRate = tasks.length > 0 ? Math.round((tasks.filter(task => task.status === 'Done').length / tasks.length) * 100) : 0;
    const pendingApprovals = requests.filter(r => r.status === 'PENDING').length;
    
    let score = 100;
    score -= criticalIncidents * 15;
    score -= incidents.filter(i => i.severity === 'High' && i.status === 'Active').length * 8;
    score -= Math.min(pendingTasks * 2, 20);
    const healthScore = Math.max(0, score);

    return { criticalIncidents, pendingTasks, completionRate, pendingApprovals, healthScore };
  }, [incidents, tasks, requests]);

  // Analyst Session Insights
  const sessionStats = useMemo(() => {
    const sessions = auditLogs.filter(log => log.action === 'LOGIN' || log.action === 'LOGOUT');
    const activeAnalystIds = new Set();
    
    // Simple heuristic for "online" analysts: those who logged in and haven't logged out since
    const analystStatus: Record<string, { status: 'ONLINE' | 'OFFLINE', lastAction: string, time: string }> = {};
    
    [...auditLogs].reverse().forEach(log => {
      if (!analystStatus[log.userId]) {
        analystStatus[log.userId] = { 
          status: log.action === 'LOGIN' ? 'ONLINE' : 'OFFLINE',
          lastAction: log.action.replace('_', ' '),
          time: log.timestamp 
        };
      }
    });

    return Object.entries(analystStatus).map(([id, data]) => ({ id, ...data }));
  }, [auditLogs]);

  // Popularity Matrix
  const popularity = useMemo(() => auditService.getPopularityStats(), [auditLogs]);

  // Comprehensive Activity Stream
  const activityStream = useMemo(() => {
    const combined = auditLogs.map(log => {
      let icon = <ClipboardList className="w-4 h-4" />;
      let category = 'system';
      let color = 'bg-zinc-800 border-zinc-700 text-zinc-500';

      switch(log.action) {
        case 'LOGIN': 
          icon = <UserCheck className="w-4 h-4" />; category = 'session'; color = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'; 
          break;
        case 'LOGOUT': 
          icon = <Power className="w-4 h-4" />; category = 'session'; color = 'bg-red-500/10 border-red-500/20 text-red-500'; 
          break;
        case 'VIEW_ASSET': 
        case 'VIEW_INCIDENT':
          icon = <Eye className="w-4 h-4" />; category = 'view'; color = 'bg-blue-500/10 border-blue-500/20 text-blue-400'; 
          break;
        case 'CREATE_ASSET':
        case 'EDIT_ASSET':
          icon = <HardDrive className="w-4 h-4" />; category = 'asset'; color = 'bg-blue-500/10 border-blue-500/20 text-blue-500';
          break;
        case 'CREATE_INCIDENT':
        case 'EDIT_INCIDENT':
          icon = <ShieldAlert className="w-4 h-4" />; category = 'incident'; color = 'bg-red-500/10 border-red-500/20 text-red-500';
          break;
      }

      return {
        ...log,
        icon,
        category,
        color,
        type: log.action.replace('_', ' ').toUpperCase(),
        title: log.targetName ? `${log.username} interacted with [${log.targetName}]` : `${log.username} performed ${log.action.toLowerCase().replace('_', ' ')}`
      };
    });
    return combined.slice(0, 15);
  }, [auditLogs, t]);

  const assetDistribution = useMemo(() => {
    const stats = assets.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(stats).map(([name, value]) => ({ name, value }));
  }, [assets]);

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Top Insights Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2rem] relative overflow-hidden group hover:border-blue-500/50 transition-all shadow-2xl">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-16 h-16 text-blue-500" />
          </div>
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">{t('perimeter_health')}</p>
          <div className="flex items-end gap-3">
             <h3 className="text-4xl font-black text-white">{metrics.healthScore}%</h3>
             <span className="text-[10px] font-bold text-emerald-500 mb-1.5 flex items-center gap-1">
               <ArrowUpRight className="w-3 h-3" /> {t('nominal')}
             </span>
          </div>
          <div className="mt-4 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
             <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${metrics.healthScore}%` }} />
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2rem] relative overflow-hidden group hover:border-red-500/50 transition-all shadow-2xl">
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">{t('critical_threats')}</p>
          <div className="flex items-end gap-3">
             <h3 className="text-4xl font-black text-red-500">{metrics.criticalIncidents}</h3>
             <p className="text-[10px] font-bold text-zinc-500 mb-1.5">{t('unmitigated')}</p>
          </div>
          <div className="mt-4 flex gap-1">
             {Array.from({length: 8}).map((_, i) => (
               <div key={i} className={`h-1 flex-1 rounded-full ${i < metrics.criticalIncidents ? 'bg-red-500 animate-pulse' : 'bg-zinc-800'}`} />
             ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2rem] relative overflow-hidden group hover:border-emerald-500/50 transition-all shadow-2xl">
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">Analyst Sessions</p>
          <div className="flex items-end gap-3">
             <h3 className="text-4xl font-black text-white">{sessionStats.filter(s => s.status === 'ONLINE').length}</h3>
             <p className="text-[10px] font-bold text-emerald-500 mb-1.5">ACTIVE NOW</p>
          </div>
          <div className="mt-4 flex -space-x-2">
             {sessionStats.filter(s => s.status === 'ONLINE').slice(0, 5).map((s, i) => (
               <div key={i} className="w-6 h-6 rounded-full border-2 border-zinc-900 bg-blue-600 flex items-center justify-center text-[8px] font-black text-white">
                  {s.id.substring(0, 2).toUpperCase()}
               </div>
             ))}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-[2rem] relative overflow-hidden group hover:border-amber-500/50 transition-all shadow-2xl">
          <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">{t('pending_protocols')}</p>
          <div className="flex items-end gap-3">
             <h3 className="text-4xl font-black text-amber-500">{metrics.pendingApprovals}</h3>
             <p className="text-[10px] font-bold text-zinc-500 mb-1.5">{t('admin_review')}</p>
          </div>
          <div className="mt-4 flex items-center justify-between">
             <span className="text-[10px] font-black text-amber-500 uppercase tracking-tighter">{t('action_required')}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Analyst Session & Audit Feed */}
        <div className="lg:col-span-1 flex flex-col gap-8">
           <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl flex flex-col gap-6">
              <div className="flex items-center justify-between">
                 <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                   <Terminal className="w-5 h-5 text-blue-500" /> Audit Protocol
                 </h4>
                 <div className="px-2 py-0.5 bg-zinc-800 rounded-full text-[9px] font-mono text-zinc-500 animate-pulse">MONITORING</div>
              </div>
              
              <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar pr-2 max-h-[500px]">
                 {activityStream.map((item, i) => (
                   <div key={i} className="flex gap-4 group cursor-default animate-in fade-in slide-in-from-right-2 duration-300">
                      <div className="flex flex-col items-center gap-1">
                         <div className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${item.color}`}>
                            {item.icon}
                         </div>
                         {i !== activityStream.length - 1 && <div className="w-px flex-1 bg-zinc-800" />}
                      </div>
                      <div className="flex-1 pb-4">
                         <div className="flex justify-between items-start mb-0.5">
                            <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">{item.type}</span>
                            <span className="text-[9px] font-mono text-zinc-700">{new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                         </div>
                         <p className="text-xs font-bold text-zinc-300 group-hover:text-white transition-colors line-clamp-2">{item.title}</p>
                      </div>
                   </div>
                 ))}
              </div>
           </div>

           <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl">
              <h4 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2 mb-6">
                 <Users className="w-5 h-5 text-purple-500" /> Team Pulse
              </h4>
              <div className="space-y-4">
                 {sessionStats.slice(0, 6).map((analyst, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-zinc-950/50 border border-zinc-800/50">
                       <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${analyst.status === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-800'}`} />
                          <div>
                             <p className="text-xs font-bold text-zinc-200">Analyst_{analyst.id.substring(0,4)}</p>
                             <p className="text-[9px] font-black text-zinc-600 uppercase tracking-tighter">Last: {analyst.lastAction}</p>
                          </div>
                       </div>
                       <span className="text-[9px] font-mono text-zinc-700">{new Date(analyst.time).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Intelligence Matrix */}
        <div className="lg:col-span-2 space-y-8">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-xl">
                 <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <Database className="w-4 h-4 text-blue-500" /> {t('infrastructure_matrix')}
                 </h5>
                 <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                       <BarChart data={assetDistribution}>
                          <XAxis dataKey="name" hide />
                          <Tooltip 
                             contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px', fontSize: '10px' }}
                          />
                          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                             {assetDistribution.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                          </Bar>
                       </BarChart>
                    </ResponsiveContainer>
                 </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] shadow-xl">
                 <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-orange-500" /> Hot Signals (Views)
                 </h5>
                 <div className="space-y-3">
                    {popularity.topAssets.map((asset, i) => (
                       <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <div className="w-6 h-6 rounded-lg bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-500">{i+1}</div>
                             <span className="text-xs font-bold text-zinc-300">{asset.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                             <div className="h-1.5 w-24 bg-zinc-800 rounded-full overflow-hidden">
                                <div className="h-full bg-orange-500" style={{ width: `${(asset.count / (popularity.topAssets[0]?.count || 1)) * 100}%` }} />
                             </div>
                             <span className="text-[10px] font-mono text-zinc-600">{asset.count}</span>
                          </div>
                       </div>
                    ))}
                    {popularity.topAssets.length === 0 && <p className="text-center py-10 text-[10px] font-black text-zinc-700 uppercase">Insufficient Data</p>}
                 </div>
              </div>
           </div>

           {/* Popularity Matrix - Incidents */}
           <div className="bg-zinc-900/50 border border-zinc-800 rounded-[2.5rem] p-8 shadow-xl">
              <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                 <MousePointer2 className="w-4 h-4 text-red-500" /> Investigated Threats (Most Viewed)
              </h5>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {popularity.topIncidents.map((inc, i) => (
                    <div key={i} className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 flex flex-col gap-2 group hover:border-red-500/30 transition-all">
                       <div className="flex justify-between items-start">
                          <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">SIGNAL #{i+1}</span>
                          <Eye className="w-3 h-3 text-red-500 opacity-20 group-hover:opacity-100 transition-opacity" />
                       </div>
                       <p className="text-sm font-bold text-zinc-200 truncate">{inc.name}</p>
                       <p className="text-[10px] font-mono text-zinc-500">{inc.count} Forensic Lookups</p>
                    </div>
                 ))}
                 {popularity.topIncidents.length === 0 && <div className="col-span-full py-10 text-center text-[10px] font-black text-zinc-700 uppercase">No active threat investigations logged</div>}
              </div>
           </div>

           {/* Core Telemetry Board */}
           <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-xl">
              <div className="p-6 border-b border-zinc-800 bg-zinc-950/30 flex items-center justify-between">
                 <h5 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                    <Activity className="w-4 h-4 text-red-500" /> {t('priority_alerts')}
                 </h5>
                 <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Targeting High/Critical</span>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <tbody className="divide-y divide-zinc-800/50">
                       {incidents.filter(i => i.severity === 'Critical' || i.severity === 'High').slice(0, 5).map(incident => (
                          <tr key={incident.id} className="hover:bg-red-500/[0.02] transition-colors group">
                             <td className="p-4">
                                <div className="flex items-center gap-3">
                                   <div className={`w-1.5 h-1.5 rounded-full ${incident.severity === 'Critical' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-orange-500'}`} />
                                   <span className="text-xs font-bold text-zinc-200 group-hover:text-white">{incident.eventName}</span>
                                </div>
                             </td>
                             <td className="p-4">
                                <span className={`text-[9px] px-2 py-0.5 rounded-full border font-black uppercase tracking-widest ${incident.severity === 'Critical' ? 'bg-red-500/10 border-red-500/20 text-red-500' : 'bg-orange-500/10 border-orange-500/20 text-orange-500'}`}>
                                  {t(incident.severity.toLowerCase())}
                                </span>
                             </td>
                             <td className="p-4 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-mono text-zinc-600">{new Date(incident.createdAt).toLocaleDateString()}</span>
                                  <span className="text-[8px] font-black text-zinc-700 uppercase tracking-tighter">{incident.status}</span>
                                </div>
                             </td>
                          </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
