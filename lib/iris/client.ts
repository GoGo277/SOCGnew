/**
 * Minimal DFIR-IRIS REST client (API v2.x, IRIS 2.4+).
 * All endpoint paths live in IRIS_ENDPOINTS so they can be adapted to a
 * specific server version in one place. Responses use IRIS's envelope:
 *   { status: 'success' | 'error', message: string, data: any }
 */

export const IRIS_ENDPOINTS = {
  ping: '/api/ping',
  versions: '/api/versions',
  lookups: {
    severities: '/manage/severities/list',
    caseStates: '/manage/case-states/list',
    iocTypes: '/manage/ioc-types/list',
    assetTypes: '/manage/asset-type/list',
    tlp: '/manage/tlp/list',
    classifications: '/manage/case-classifications/list',
    alertStatus: '/manage/alert-status/list',
    alertResolutions: '/manage/alert-resolutions/list',
    eventCategories: '/manage/event-categories/list',
    taskStatus: '/manage/task-status/list',
    analysisStatus: '/manage/analysis-status/list',
    evidenceTypes: '/manage/evidence-types/list',
  },
  customers: { list: '/manage/customers/list', add: '/manage/customers/add' },
  alerts: { add: '/alerts/add', get: (id: number) => `/alerts/${id}`, update: (id: number) => `/alerts/update/${id}`, filter: '/alerts/filter' },
  cases: {
    add: '/manage/cases/add', list: '/manage/cases/list', get: (cid: number) => `/manage/cases/${cid}`,
    update: (cid: number) => `/manage/cases/update/${cid}`, close: (cid: number) => `/manage/cases/close/${cid}`, reopen: (cid: number) => `/manage/cases/reopen/${cid}`,
  },
  objects: {
    iocs: { list: '/case/ioc/list', add: '/case/ioc/add', update: (id: number) => `/case/ioc/update/${id}`, del: (id: number) => `/case/ioc/delete/${id}`, listKey: 'ioc' },
    assets: { list: '/case/assets/list', add: '/case/assets/add', update: (id: number) => `/case/assets/update/${id}`, del: (id: number) => `/case/assets/delete/${id}`, listKey: 'assets' },
    timeline: { list: '/case/timeline/events/list', add: '/case/timeline/events/add', update: (id: number) => `/case/timeline/events/update/${id}`, del: (id: number) => `/case/timeline/events/delete/${id}`, listKey: 'timeline' },
    tasks: { list: '/case/tasks/list', add: '/case/tasks/add', update: (id: number) => `/case/tasks/update/${id}`, del: (id: number) => `/case/tasks/delete/${id}`, listKey: 'tasks' },
    evidence: { list: '/case/evidences/list', add: '/case/evidences/add', update: (id: number) => `/case/evidences/update/${id}`, del: (id: number) => `/case/evidences/delete/${id}`, listKey: 'evidences' },
    notes: { list: '/case/notes/directories/filter', add: '/case/notes/add', update: (id: number) => `/case/notes/update/${id}`, del: (id: number) => `/case/notes/delete/${id}`, get: (id: number) => `/case/notes/${id}`, listKey: '' },
  },
  noteDirectories: { add: '/case/notes/directories/add' },
} as const;

export class IrisError extends Error {
  constructor(message: string, public status?: number, public path?: string) { super(message); }
}

export interface IrisClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class IrisClient {
  private base: string;
  private f: typeof fetch;
  constructor(private opts: IrisClientOptions) {
    if (!/^https?:\/\//i.test(opts.baseUrl)) throw new IrisError('IRIS URL must start with http:// or https://');
    if (!opts.apiKey) throw new IrisError('IRIS API key is missing');
    this.base = opts.baseUrl.replace(/\/+$/, '');
    this.f = opts.fetchImpl ?? fetch.bind(globalThis);
  }

  async request<T = any>(method: 'GET' | 'POST', path: string, body?: unknown, query: Record<string, string | number | undefined> = {}): Promise<T> {
    const qs = Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    const url = `${this.base}${path}${qs ? `?${qs}` : ''}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 20_000);
    let res: Response;
    try {
      res = await this.f(url, {
        method,
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e: any) {
      throw new IrisError(e?.name === 'AbortError' ? `IRIS did not respond in time (${path})` : `Cannot reach IRIS (${e?.message ?? 'network error'}). Check the URL, TLS and CORS settings.`, undefined, path);
    } finally { clearTimeout(timer); }
    let json: any = null;
    try { json = await res.json(); } catch { /* non-JSON */ }
    if (res.status === 401 || res.status === 403) throw new IrisError('IRIS rejected the API key (unauthorised)', res.status, path);
    if (!res.ok || json?.status === 'error') throw new IrisError(json?.message || `IRIS returned HTTP ${res.status} for ${path}`, res.status, path);
    return (json && 'data' in json ? json.data : json) as T;
  }

  get = <T = any>(path: string, query?: Record<string, string | number | undefined>) => this.request<T>('GET', path, undefined, query);
  post = <T = any>(path: string, body: unknown, query?: Record<string, string | number | undefined>) => this.request<T>('POST', path, body, query);

  async ping() { return this.get(IRIS_ENDPOINTS.ping); }
  async versions(): Promise<{ iris_current?: string; api_current?: string }> {
    try { return await this.get(IRIS_ENDPOINTS.versions); } catch { return {}; }
  }
}
