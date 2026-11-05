import { User } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { realtimeStore } from './realtimeStore';
import { sha256, canonicalJson } from '../lib/crypto';

export type AuditAction =
  | 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'ACCOUNT_LOCKED' | 'SESSION_EXPIRED'
  | 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'FORCED_PASSWORD_CHANGE'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED' | 'ROLE_CHANGED'
  | 'VIEW_ASSET' | 'VIEW_INCIDENT'
  | 'CREATE_ASSET' | 'EDIT_ASSET' | 'DELETE_ASSET'
  | 'CREATE_INCIDENT' | 'EDIT_INCIDENT' | 'DELETE_INCIDENT'
  | 'SOP_COMMIT' | 'REQUEST_CREATED' | 'REQUEST_RESOLVED'
  | 'TASK_DEPLOY' | 'TASK_STATUS_CHANGE'
  | 'ANNOUNCEMENT_POST'
  | 'DUTY_SCHEDULE_UPDATED'
  | 'SHIFT_REPORT_CREATED' | 'SHIFT_DRAFT_SYNCED' | 'SHIFT_REPORT_FINALIZED' | 'SHIFT_REPORT_DELETED'
  | 'SHIFT_EVENT_ADDED' | 'SHIFT_EVENT_UPDATED' | 'SHIFT_EVENT_REMOVED'
  | 'REPORT_EXPORTED' | 'REPORT_BATCH_EXPORTED' | 'INTEGRITY_VERIFIED'
  | 'AUDIT_LOG_EXPORTED' | 'SETTINGS_CHANGED';

export interface AuditLog {
  id: string;
  userId: string;
  username: string;
  role?: string;
  action: AuditAction;
  targetId?: string;
  targetName?: string;
  timestamp: string;
  metadata?: any;
  userAgent?: string;
  /** SHA-256 over the entry's canonical content — tamper evidence */
  hash?: string;
}

const STORAGE_KEY = 'soc_audit_logs';
export const AUDIT_COLLECTION = 'audit_logs';
const LOCAL_RETENTION = 5000;

const hashableContent = (log: AuditLog) => {
  const { hash, ...rest } = log;
  return canonicalJson(rest);
};

export const auditService = {
  getLogs: (): AuditLog[] => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  /** Real-time audit trail (Firestore when configured, else local). */
  subscribe(listener: (logs: AuditLog[]) => void): () => void {
    if (realtimeStore.isCloud()) {
      return realtimeStore.subscribe<AuditLog & { id: string }>(AUDIT_COLLECTION, docs =>
        listener([...docs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
      );
    }
    const emit = () => listener(auditService.getLogs());
    emit();
    const handler = (e: StorageEvent | Event) => {
      if (!(e instanceof StorageEvent) || e.key === STORAGE_KEY) emit();
    };
    window.addEventListener('storage', handler);
    window.addEventListener('geyes-audit', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('geyes-audit', handler);
    };
  },

  log: async (
    user: Pick<User, 'id' | 'username'> & { role?: string },
    action: AuditAction,
    target?: { id: string; name: string },
    metadata?: any
  ): Promise<void> => {
    const newLog: AuditLog = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      role: user.role,
      action,
      targetId: target?.id,
      targetName: target?.name,
      timestamp: new Date().toISOString(),
      metadata,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : undefined,
    };
    newLog.hash = await sha256(hashableContent(newLog));

    const updatedLogs = [newLog, ...auditService.getLogs()].slice(0, LOCAL_RETENTION);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedLogs));
    } catch (e) {
      console.warn('Audit log local cache full', e);
    }
    window.dispatchEvent(new Event('geyes-audit'));

    if (realtimeStore.isCloud()) {
      realtimeStore.set(AUDIT_COLLECTION, newLog).catch(err => console.error('Audit sync to Firestore failed', err));
    }

    if (isSupabaseConfigured) {
      Promise.resolve(
        supabase.from('audit_logs').insert({
          id: newLog.id,
          user_id: newLog.userId,
          username: newLog.username,
          action: newLog.action,
          target_id: newLog.targetId,
          target_name: newLog.targetName,
          metadata: newLog.metadata,
          created_at: newLog.timestamp,
        })
      )
        .then(({ error }) => { if (error) console.error('Error syncing audit log to Supabase:', error); })
        .catch(err => console.error('Network error syncing audit log to Supabase:', err));
    }
  },

  /** Recompute each entry's hash; returns ids of entries that fail verification. */
  verify: async (logs: AuditLog[]): Promise<{ verified: number; tampered: string[]; unsigned: number }> => {
    let verified = 0, unsigned = 0;
    const tampered: string[] = [];
    for (const log of logs) {
      if (!log.hash) { unsigned++; continue; }
      if ((await sha256(hashableContent(log))) === log.hash) verified++;
      else tampered.push(log.id);
    }
    return { verified, tampered, unsigned };
  },

  toCsv: (logs: AuditLog[]): string => {
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['timestamp', 'user_id', 'username', 'role', 'action', 'target_id', 'target_name', 'metadata', 'hash'];
    const rows = logs.map(l => [
      l.timestamp, l.userId, l.username, l.role, l.action, l.targetId, l.targetName,
      l.metadata ? JSON.stringify(l.metadata) : '', l.hash,
    ].map(esc).join(','));
    return [header.join(','), ...rows].join('\n');
  },

  getPopularityStats: (logs: AuditLog[]) => {
    const assetViews: Record<string, { name: string; count: number }> = {};
    const incidentViews: Record<string, { name: string; count: number }> = {};

    logs.forEach(log => {
      if (log.action === 'VIEW_ASSET' && log.targetId) {
        assetViews[log.targetId] = { name: log.targetName || 'Unknown', count: (assetViews[log.targetId]?.count || 0) + 1 };
      }
      if (log.action === 'VIEW_INCIDENT' && log.targetId) {
        incidentViews[log.targetId] = { name: log.targetName || 'Unknown', count: (incidentViews[log.targetId]?.count || 0) + 1 };
      }
    });

    return {
      topAssets: Object.values(assetViews).sort((a, b) => b.count - a.count).slice(0, 5),
      topIncidents: Object.values(incidentViews).sort((a, b) => b.count - a.count).slice(0, 5),
    };
  },
};
