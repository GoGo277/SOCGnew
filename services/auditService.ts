
import { User } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export type AuditAction = 
  | 'LOGIN' | 'LOGOUT' 
  | 'VIEW_ASSET' | 'VIEW_INCIDENT' 
  | 'CREATE_ASSET' | 'EDIT_ASSET' | 'DELETE_ASSET'
  | 'CREATE_INCIDENT' | 'EDIT_INCIDENT' | 'DELETE_INCIDENT'
  | 'SOP_COMMIT' | 'REQUEST_CREATED' | 'REQUEST_RESOLVED'
  | 'TASK_DEPLOY' | 'TASK_STATUS_CHANGE'
  | 'ANNOUNCEMENT_POST';

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  action: AuditAction;
  targetId?: string;
  targetName?: string;
  timestamp: string;
  metadata?: any;
}

const STORAGE_KEY = 'soc_audit_logs';

export const auditService = {
  getLogs: (): AuditLog[] => {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  log: async (user: User, action: AuditAction, target?: { id: string, name: string }, metadata?: any): Promise<void> => {
    const logs = auditService.getLogs();
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      action,
      targetId: target?.id,
      targetName: target?.name,
      timestamp: new Date().toISOString(),
      metadata
    };
    // Keep only last 500 logs to prevent storage bloat
    const updatedLogs = [newLog, ...logs].slice(0, 500);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));

    // Fire and forget to Supabase
    if (isSupabaseConfigured) {
      supabase.from('audit_logs').insert({
        id: newLog.id,
        user_id: newLog.userId,
        username: newLog.username,
        action: newLog.action,
        target_id: newLog.targetId,
        target_name: newLog.targetName,
        metadata: newLog.metadata,
        created_at: newLog.timestamp
      }).then(({ error }) => {
        if (error) console.error('Error syncing audit log to Supabase:', error);
      }).catch(err => {
        console.error('Network error syncing audit log to Supabase:', err);
      });
    }
  },

  getPopularityStats: (logs: AuditLog[]) => {
    const assetViews: Record<string, { name: string, count: number }> = {};
    const incidentViews: Record<string, { name: string, count: number }> = {};

    logs.forEach(log => {
      if (log.action === 'VIEW_ASSET' && log.targetId) {
        assetViews[log.targetId] = { 
          name: log.targetName || 'Unknown', 
          count: (assetViews[log.targetId]?.count || 0) + 1 
        };
      }
      if (log.action === 'VIEW_INCIDENT' && log.targetId) {
        incidentViews[log.targetId] = { 
          name: log.targetName || 'Unknown', 
          count: (incidentViews[log.targetId]?.count || 0) + 1 
        };
      }
    });

    return {
      topAssets: Object.values(assetViews).sort((a, b) => b.count - a.count).slice(0, 5),
      topIncidents: Object.values(incidentViews).sort((a, b) => b.count - a.count).slice(0, 5)
    };
  }
};
