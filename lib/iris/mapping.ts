import { IrisClient, IRIS_ENDPOINTS } from './client';
import { CaseOutcome, Tlp } from '../../types';

/**
 * IRIS lookup tables are fetched from the server and matched by name, so ids
 * are never hard-coded. Names are normalised (case and punctuation-insensitive).
 */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export interface LookupTable { byName: Map<string, number>; byId: Map<number, string> }
export type LookupKey = keyof typeof IRIS_ENDPOINTS.lookups;
export type Lookups = Record<LookupKey, LookupTable>;

const emptyTable = (): LookupTable => ({ byName: new Map(), byId: new Map() });

/** Pick the id / name fields of an IRIS lookup row regardless of its exact field names. */
const rowIdName = (row: Record<string, any>): [number, string] | null => {
  const keys = Object.keys(row);
  const idKey = keys.find(k => k === 'id') ?? keys.find(k => /_id$/.test(k));
  const nameKey = keys.find(k => k === 'name') ?? keys.find(k => /_name$/.test(k)) ?? keys.find(k => /name/.test(k));
  if (!idKey || !nameKey) return null;
  const id = Number(row[idKey]);
  return Number.isFinite(id) ? [id, String(row[nameKey])] : null;
};

export const buildTable = (rows: unknown): LookupTable => {
  const table = emptyTable();
  const list = Array.isArray(rows) ? rows : Array.isArray((rows as any)?.data) ? (rows as any).data : [];
  for (const r of list) {
    const pair = r && typeof r === 'object' ? rowIdName(r) : null;
    if (pair) { table.byName.set(norm(pair[1]), pair[0]); table.byId.set(pair[0], pair[1]); }
  }
  return table;
};

export const fetchLookups = async (client: IrisClient): Promise<Lookups> => {
  const out = {} as Lookups;
  for (const [key, path] of Object.entries(IRIS_ENDPOINTS.lookups) as [LookupKey, string][]) {
    try { out[key] = buildTable(await client.get(path)); } catch { out[key] = emptyTable(); }
  }
  return out;
};

export const idOf = (t: LookupTable, name: string | undefined, ...fallbacks: string[]): number | undefined => {
  for (const n of [name, ...fallbacks]) { if (n !== undefined) { const id = t.byName.get(norm(n)); if (id !== undefined) return id; } }
  return undefined;
};
export const nameOf = (t: LookupTable, id: unknown): string | undefined => (id === undefined || id === null ? undefined : t.byId.get(Number(id)));

/** IRIS TLP names are lower-case ("amber", "amber+strict"). */
export const tlpToIris = (t: Tlp) => t.replace('TLP:', '').toLowerCase();
export const tlpFromIris = (name?: string): Tlp => {
  const n = (name ?? '').toLowerCase();
  return n.startsWith('red') ? 'TLP:RED' : n.startsWith('green') ? 'TLP:GREEN' : n.startsWith('clear') || n.startsWith('white') ? 'TLP:CLEAR' : 'TLP:AMBER';
};

/** IRIS case "status" (outcome) is a fixed enumeration. */
export const OUTCOME_TO_IRIS: Record<CaseOutcome, number> = {
  Unknown: 0, 'False positive': 1, 'True positive with impact': 2, 'Not applicable': 3, 'True positive without impact': 4, Legitimate: 5,
};
export const outcomeFromIris = (id: unknown): CaseOutcome =>
  (Object.entries(OUTCOME_TO_IRIS).find(([, v]) => v === Number(id))?.[0] as CaseOutcome) ?? 'Unknown';

/** IRIS asset compromise status enumeration. */
export const COMPROMISE_TO_IRIS: Record<string, number> = { 'To be determined': 0, Compromised: 1, 'Not compromised': 2, Unknown: 3 };
export const compromiseFromIris = (id: unknown) =>
  (Object.entries(COMPROMISE_TO_IRIS).find(([, v]) => v === Number(id))?.[0] ?? 'To be determined') as 'To be determined' | 'Compromised' | 'Not compromised' | 'Unknown';

/** IRIS event_date has no zone; event_tz carries the offset. We always send UTC. */
export const toIrisDate = (iso: string) => new Date(iso).toISOString().replace('Z', '');
export const fromIrisDate = (d?: string, tz?: string): string => {
  if (!d) return new Date().toISOString();
  const base = d.replace(' ', 'T');
  const zoned = /[zZ]|[+-]\d{2}:?\d{2}$/.test(base) ? base : `${base}${tz && /^[+-]\d{2}:\d{2}$/.test(tz) ? tz : 'Z'}`;
  const t = new Date(zoned);
  return isNaN(t.getTime()) ? new Date().toISOString() : t.toISOString();
};
