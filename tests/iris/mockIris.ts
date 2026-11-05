/**
 * In-memory mock of the DFIR-IRIS v2.x REST API subset used by G-Eyes SR.
 * Mirrors IRIS's response envelope, Bearer API-key auth, lookup tables and
 * per-case object endpoints (?cid=). Also serves CORS for browser tests.
 */
import http from 'node:http';

type Row = Record<string, any>;

export interface MockIris {
  url: string;
  apiKey: string;
  state: {
    cases: Row[]; alerts: Row[]; customers: Row[];
    objects: Record<'ioc' | 'assets' | 'timeline' | 'tasks' | 'evidences' | 'notes', Row[]>;
    directories: Row[];
    calls: string[];
  };
  close(): Promise<void>;
}

const LOOKUPS: Record<string, Row[]> = {
  '/manage/severities/list': ['Medium', 'Unspecified', 'Informational', 'Low', 'High', 'Critical'].map((n, i) => ({ severity_id: i + 1, severity_name: n })),
  '/manage/case-states/list': ['Open', 'In progress', 'Containment', 'Eradication', 'Recovery', 'Post-Incident', 'Reporting', 'Closed'].map((n, i) => ({ state_id: i + 1, state_name: n })),
  '/manage/ioc-types/list': ['ip-src', 'ip-dst', 'domain', 'hostname', 'url', 'md5', 'sha1', 'sha256', 'filename', 'email-src', 'other'].map((n, i) => ({ type_id: i + 1, type_name: n })),
  '/manage/asset-type/list': ['Account', 'Firewall', 'Linux - Server', 'Windows - Computer', 'Windows - Server', 'Router', 'Other'].map((n, i) => ({ asset_id: i + 1, asset_name: n })),
  '/manage/tlp/list': ['red', 'amber', 'green', 'clear', 'amber+strict'].map((n, i) => ({ tlp_id: i + 1, tlp_name: n })),
  '/manage/case-classifications/list': ['other:other', 'malicious-code:ransomware', 'intrusion-attempts:brute-force', 'fraud:phishing'].map((n, i) => ({ id: i + 1, name: n })),
  '/manage/alert-status/list': ['Unspecified', 'New', 'Assigned', 'In progress', 'Pending', 'Closed', 'Merged', 'Escalated'].map((n, i) => ({ status_id: i + 1, status_name: n })),
  '/manage/alert-resolutions/list': ['False positive', 'True positive with impact', 'True positive without impact', 'Not applicable', 'Legitimate', 'Unknown'].map((n, i) => ({ resolution_status_id: i + 1, resolution_status_name: n })),
  '/manage/event-categories/list': ['Unspecified', 'Legitimate', 'Remediation', 'Initial Access', 'Execution', 'Lateral Movement', 'Command and Control', 'Impact'].map((n, i) => ({ id: i + 1, name: n })),
  '/manage/task-status/list': ['To do', 'In progress', 'On hold', 'Done', 'Canceled'].map((n, i) => ({ id: i + 1, status_name: n })),
  '/manage/analysis-status/list': ['Unspecified', 'To be done', 'Started', 'Pending', 'Canceled', 'Done'].map((n, i) => ({ id: i + 1, name: n })),
  '/manage/evidence-types/list': ['Log export', 'Memory dump', 'Disk image', 'Other'].map((n, i) => ({ id: i + 1, name: n })),
};

const OBJ: Record<string, { kind: keyof MockIris['state']['objects']; idKey: string }> = {
  ioc: { kind: 'ioc', idKey: 'ioc_id' },
  assets: { kind: 'assets', idKey: 'asset_id' },
  'timeline/events': { kind: 'timeline', idKey: 'event_id' },
  tasks: { kind: 'tasks', idKey: 'task_id' },
  evidences: { kind: 'evidences', idKey: 'id' },
  notes: { kind: 'notes', idKey: 'note_id' },
};

export const startMockIris = (apiKey = 'test-api-key'): Promise<MockIris> => new Promise(resolve => {
  const state: MockIris['state'] = { cases: [], alerts: [], customers: [{ customer_id: 1, customer_name: 'IrisInitialClient', customer_description: '' }], objects: { ioc: [], assets: [], timeline: [], tasks: [], evidences: [], notes: [] }, directories: [], calls: [] };
  let seq = 100;
  const ok = (res: http.ServerResponse, data: unknown, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ status: 'success', message: '', data })); };
  const fail = (res: http.ServerResponse, code: number, message: string) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify({ status: 'error', message, data: [] })); };

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST' });
      return res.end();
    }
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const u = new URL(req.url ?? '/', 'http://x');
      const path = u.pathname;
      const cid = Number(u.searchParams.get('cid'));
      state.calls.push(`${req.method} ${path}${cid ? `?cid=${cid}` : ''}`);
      if (req.headers.authorization !== `Bearer ${apiKey}`) return fail(res, 401, 'Authentication required');
      const body = raw ? JSON.parse(raw) : {};
      if (path === '/api/ping') return ok(res, []);
      if (path === '/api/versions') return ok(res, { iris_current: 'v2.4.20', api_current: '2.0.4' });
      if (LOOKUPS[path]) return ok(res, LOOKUPS[path]);

      if (path === '/manage/customers/list') return ok(res, state.customers);
      if (path === '/manage/customers/add') { const c = { customer_id: ++seq, customer_name: body.customer_name, customer_description: body.customer_description }; state.customers.push(c); return ok(res, c); }

      if (path === '/manage/cases/list') return ok(res, state.cases.map(c => ({ case_id: c.case_id, name: c.case_name, client_id: c.case_customer, case_soc_id: c.case_soc_id, open_date: c.open_date })));
      if (path === '/manage/cases/add') {
        const c = { case_id: ++seq, case_name: `#${seq} - ${body.case_name}`, case_description: body.case_description, case_soc_id: body.case_soc_id, case_customer: body.case_customer, classification_id: body.classification_id, state_id: 1, severity_id: 1, status_id: 0, open_date: '2026-11-05', close_date: null, case_tags: '' };
        state.cases.push(c); return ok(res, c);
      }
      let m = path.match(/^\/manage\/cases\/(\d+)$/);
      if (m) { const c = state.cases.find(x => x.case_id === Number(m![1])); return c ? ok(res, c) : fail(res, 404, 'Case not found'); }
      m = path.match(/^\/manage\/cases\/(update|close|reopen)\/(\d+)$/);
      if (m) {
        const c = state.cases.find(x => x.case_id === Number(m![2]));
        if (!c) return fail(res, 404, 'Case not found');
        if (m[1] === 'update') Object.assign(c, Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'case_name')), body.case_name ? { case_name: `#${c.case_id} - ${body.case_name}` } : {});
        if (m[1] === 'close') Object.assign(c, { state_id: 8, close_date: '2026-11-05' });
        if (m[1] === 'reopen') Object.assign(c, { close_date: null });
        return ok(res, c);
      }

      if (path === '/alerts/add') { const a = { ...body, alert_id: ++seq, alert_creation_time: '2026-11-05T10:00:00', cases: [] }; state.alerts.push(a); return ok(res, a); }
      if (path === '/alerts/filter') return ok(res, { alerts: [...state.alerts].reverse(), total: state.alerts.length });
      m = path.match(/^\/alerts\/(?:update\/)?(\d+)$/);
      if (m) {
        const a = state.alerts.find(x => x.alert_id === Number(m![1]));
        if (!a) return fail(res, 404, 'Alert not found');
        if (path.includes('/update/')) Object.assign(a, body);
        return ok(res, a);
      }

      if (path === '/case/notes/directories/filter') return ok(res, state.directories.filter(d => d.case_id === cid).map(d => ({ id: d.id, name: d.name, notes: state.objects.notes.filter(n => n.directory_id === d.id).map(n => ({ id: n.note_id, title: n.note_title })) })));
      if (path === '/case/notes/directories/add') { const d = { id: ++seq, name: body.name, case_id: cid }; state.directories.push(d); return ok(res, d); }

      for (const [seg, def] of Object.entries(OBJ)) {
        const store = state.objects[def.kind];
        if (path === `/case/${seg}/list`) return ok(res, def.kind === 'ioc' ? { ioc: store.filter(o => o.case_id === cid) } : { [def.kind]: store.filter(o => o.case_id === cid) });
        if (path === `/case/${seg}/add`) { if (!cid || !state.cases.some(c => c.case_id === cid)) return fail(res, 400, 'Invalid case'); const o = { ...body, [def.idKey]: ++seq, case_id: cid }; store.push(o); return ok(res, o); }
        const mm = path.match(new RegExp(`^/case/${seg.replace('/', '\\/')}/(update|delete)/(\\d+)$`));
        if (mm) {
          const i = store.findIndex(o => o[def.idKey] === Number(mm[2]) && o.case_id === cid);
          if (i < 0) return fail(res, 404, 'Object not found');
          if (mm[1] === 'delete') store.splice(i, 1); else Object.assign(store[i], body);
          return ok(res, mm[1] === 'delete' ? [] : store[i]);
        }
        const gm = path.match(new RegExp(`^/case/${seg}/(\\d+)$`));
        if (gm) { const o = store.find(x => x[def.idKey] === Number(gm[1])); return o ? ok(res, o) : fail(res, 404, 'Not found'); }
      }
      fail(res, 404, `No mock route for ${path}`);
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as any).port;
    resolve({ url: `http://127.0.0.1:${port}`, apiKey, state, close: () => new Promise(r => server.close(() => r())) });
  });
});
