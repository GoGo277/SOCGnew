import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase';

/**
 * Real-time document store.
 *
 * - Cloud mode: Google Cloud Firestore with onSnapshot listeners
 *   (bidirectional, multi-analyst, multi-device).
 * - Local mode: localStorage + BroadcastChannel so multiple tabs stay in sync.
 *
 * All documents are plain JSON objects carrying an `id` field.
 */
export type Doc = { id: string } & Record<string, any>;
type Listener = (docs: any[]) => void;

const LOCAL_PREFIX = 'geyes_col_';
const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('geyes-sync') : null;
const localListeners = new Map<string, Set<Listener>>();

const readLocal = (col: string): Doc[] => {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + col);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const notifyLocal = (col: string) => {
  const docs = readLocal(col);
  localListeners.get(col)?.forEach(l => l(docs));
};

const writeLocal = (col: string, docs: Doc[]) => {
  localStorage.setItem(LOCAL_PREFIX + col, JSON.stringify(docs));
  notifyLocal(col);
  channel?.postMessage({ col });
};

channel?.addEventListener('message', (e: MessageEvent) => {
  if (e.data?.col) notifyLocal(e.data.col);
});
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key?.startsWith(LOCAL_PREFIX)) notifyLocal(e.key.slice(LOCAL_PREFIX.length));
  });
}

/** Firestore rejects `undefined` values — strip them. */
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export const realtimeStore = {
  isCloud: (): boolean => !!db,

  subscribe<T extends Doc>(col: string, listener: (docs: T[]) => void, onError?: (e: Error) => void): () => void {
    if (db) {
      return onSnapshot(
        collection(db, col),
        snap => listener(snap.docs.map(d => ({ ...(d.data() as any), id: d.id }))),
        err => { console.error(`[store] ${col} listener error`, err); onError?.(err); }
      );
    }
    if (!localListeners.has(col)) localListeners.set(col, new Set());
    localListeners.get(col)!.add(listener as Listener);
    listener(readLocal(col) as T[]);
    return () => { localListeners.get(col)?.delete(listener as Listener); };
  },

  async getAll<T extends Doc>(col: string): Promise<T[]> {
    if (db) {
      const snap = await getDocs(collection(db, col));
      return snap.docs.map(d => ({ ...(d.data() as any), id: d.id }));
    }
    return readLocal(col) as T[];
  },

  async set<T extends Doc>(col: string, data: T): Promise<void> {
    if (db) {
      await setDoc(doc(db, col, data.id), clean(data));
      return;
    }
    const docs = readLocal(col);
    const idx = docs.findIndex(d => d.id === data.id);
    if (idx === -1) docs.push(clean(data)); else docs[idx] = clean(data);
    writeLocal(col, docs);
  },

  async update(col: string, id: string, patch: Record<string, any>): Promise<void> {
    if (db) {
      await updateDoc(doc(db, col, id), clean(patch));
      return;
    }
    const docs = readLocal(col);
    const idx = docs.findIndex(d => d.id === id);
    if (idx === -1) throw new Error(`Document ${col}/${id} not found`);
    docs[idx] = { ...docs[idx], ...clean(patch) };
    writeLocal(col, docs);
  },

  async remove(col: string, id: string): Promise<void> {
    if (db) {
      await deleteDoc(doc(db, col, id));
      return;
    }
    writeLocal(col, readLocal(col).filter(d => d.id !== id));
  },
};
