import { User } from '../types';
import { IrisClient } from '../lib/iris/client';
import { runIrisSync, SyncResult, SyncStore } from '../lib/iris/sync';
import { realtimeStore } from './realtimeStore';
import { auditService } from './auditService';
import { callFn } from './cloudAuth';

/**
 * DFIR-IRIS integration front door.
 * - Local mode: the browser talks to IRIS directly with a URL + API key kept in
 *   this browser only (IRIS must allow this origin via CORS, or sit behind a proxy).
 * - Cloud mode: Cloud Functions hold the key as a secret and run the sync; the
 *   browser only triggers runs and reads status.
 */

export interface IrisOptions { pushCases: boolean; pushAlerts: boolean; importRemote: boolean; autoSyncMinutes: 0 | 5 | 15 | 60 }
export interface IrisLocalConfig extends IrisOptions { url: string; apiKey: string }
export interface IrisStatus {
  configured: boolean;
  mode: 'local' | 'cloud';
  url?: string;
  options: IrisOptions;
  lastResult?: SyncResult;
  lastError?: string;
  lastRunAt?: string;
}

const CFG_KEY = 'geyes_iris_config';
const STATUS_KEY = 'geyes_iris_status';
export const DEFAULT_IRIS_OPTIONS: IrisOptions = { pushCases: true, pushAlerts: true, importRemote: true, autoSyncMinutes: 15 };

const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } window.dispatchEvent(new Event('geyes-iris')); };

const browserStore: SyncStore = {
  list: <T,>(col: string) => realtimeStore.getAll<any>(col) as Promise<T[]>,
  set: (col, doc) => realtimeStore.set(col, doc),
  remove: (col, id) => realtimeStore.remove(col, id),
  nextSequence: name => realtimeStore.nextSequence(name),
};

let running: Promise<SyncResult> | null = null;

export const irisService = {
  isCloud: () => realtimeStore.isCloud(),

  getLocalConfig: (): IrisLocalConfig | null => read<IrisLocalConfig>(CFG_KEY),

  async status(): Promise<IrisStatus> {
    if (realtimeStore.isCloud()) {
      try { return await callFn<object, IrisStatus>('irisStatus', {}); }
      catch (e: any) { return { configured: false, mode: 'cloud', options: DEFAULT_IRIS_OPTIONS, lastError: e.message }; }
    }
    const cfg = read<IrisLocalConfig>(CFG_KEY);
    const st = read<Pick<IrisStatus, 'lastResult' | 'lastError' | 'lastRunAt'>>(STATUS_KEY) ?? {};
    return { configured: !!cfg?.url && !!cfg?.apiKey, mode: 'local', url: cfg?.url, options: cfg ?? DEFAULT_IRIS_OPTIONS, ...st };
  },

  onChange(cb: () => void): () => void {
    window.addEventListener('geyes-iris', cb);
    return () => window.removeEventListener('geyes-iris', cb);
  },

  async saveLocalConfig(actor: User, cfg: IrisLocalConfig) {
    if (!/^https?:\/\//i.test(cfg.url)) throw new Error('IRIS URL must start with http:// or https://');
    if (!cfg.apiKey.trim()) throw new Error('An API key is required');
    write(CFG_KEY, { ...cfg, url: cfg.url.trim().replace(/\/+$/, ''), apiKey: cfg.apiKey.trim() });
    auditService.log(actor, 'IRIS_CONFIG_CHANGED', { id: 'iris', name: 'DFIR-IRIS integration' }, { url: cfg.url, ...cfg, apiKey: undefined });
  },

  async saveCloudOptions(actor: User, options: IrisOptions) {
    await callFn('irisSaveOptions', options);
    window.dispatchEvent(new Event('geyes-iris'));
  },

  async disconnect(actor: User) {
    try { localStorage.removeItem(CFG_KEY); localStorage.removeItem(STATUS_KEY); } catch { /* ignore */ }
    window.dispatchEvent(new Event('geyes-iris'));
    auditService.log(actor, 'IRIS_CONFIG_CHANGED', { id: 'iris', name: 'DFIR-IRIS integration' }, { disconnected: true });
  },

  /** Returns the IRIS version string on success. */
  async testConnection(candidate?: { url: string; apiKey: string }): Promise<string> {
    if (realtimeStore.isCloud()) return (await callFn<object, { version: string }>('irisTestConnection', {})).version;
    const cfg = candidate ?? read<IrisLocalConfig>(CFG_KEY);
    if (!cfg) throw new Error('IRIS is not configured');
    const client = new IrisClient({ baseUrl: cfg.url, apiKey: cfg.apiKey });
    await client.ping();
    const v = await client.versions();
    return v.iris_current ? `IRIS ${v.iris_current}` : 'IRIS (version not reported)';
  },

  /** Run a sync (whole platform, or only the given cases). Concurrent calls share one run. */
  async syncNow(actor: User, caseIds?: string[]): Promise<SyncResult> {
    if (realtimeStore.isCloud()) {
      const r = await callFn<{ caseIds?: string[] }, SyncResult>('irisSyncNow', { caseIds });
      window.dispatchEvent(new Event('geyes-iris'));
      return r;
    }
    if (running) return running;
    const cfg = read<IrisLocalConfig>(CFG_KEY);
    if (!cfg) throw new Error('IRIS is not configured');
    running = (async () => {
      try {
        const client = new IrisClient({ baseUrl: cfg.url, apiKey: cfg.apiKey });
        const result = await runIrisSync(client, browserStore, { ...cfg, caseIds, actor: actor.username });
        write(STATUS_KEY, { lastResult: result, lastRunAt: result.finishedAt, lastError: result.errors[0] });
        auditService.log(actor, 'IRIS_SYNC', { id: 'iris', name: 'DFIR-IRIS sync' }, { pushed: result.pushed, pulled: result.pulled, errors: result.errors.length, scope: caseIds ? 'case' : 'all' });
        return result;
      } catch (e: any) {
        write(STATUS_KEY, { ...(read<object>(STATUS_KEY) ?? {}), lastError: e.message, lastRunAt: new Date().toISOString() });
        throw e;
      } finally { running = null; }
    })();
    return running;
  },

  summarize(r: SyncResult): string {
    const p = r.pushed, q = r.pulled;
    return `Pushed ${p.cases} case(s), ${p.alerts} alert(s), ${p.objects} object(s), ${p.deleted} deletion(s) · Pulled ${q.cases} case(s), ${q.alerts} alert(s), ${q.objects} new object(s), ${q.updated} update(s), ${q.removed} removal(s)${r.errors.length ? ` · ${r.errors.length} error(s)` : ''}`;
  },
};
