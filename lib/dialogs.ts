/**
 * In-app replacements for window.alert / confirm / prompt.
 * Native dialogs are blocked in sandboxed hosts (embedded viewers, iframes) and
 * cannot be styled or translated, so the platform renders its own (DialogHost).
 */
export type DialogKind = 'alert' | 'confirm' | 'prompt';

export interface DialogRequest {
  id: number;
  kind: DialogKind;
  message: string;
  title?: string;
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  defaultValue?: string;
  placeholder?: string;
  resolve: (value: any) => void;
}

type Listener = (queue: DialogRequest[]) => void;
let queue: DialogRequest[] = [];
let seq = 0;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(l => l([...queue]));

export const subscribeDialogs = (l: Listener) => { listeners.add(l); l([...queue]); return () => { listeners.delete(l); }; };

export const settleDialog = (id: number, value: unknown) => {
  const d = queue.find(x => x.id === id);
  queue = queue.filter(x => x.id !== id);
  emit();
  d?.resolve(value);
};

const open = <T,>(req: Omit<DialogRequest, 'id' | 'resolve'>) =>
  new Promise<T>(resolve => { queue = [...queue, { ...req, id: ++seq, resolve }]; emit(); });

export const uiAlert = (message: string, opts: { title?: string } = {}) => open<void>({ kind: 'alert', message, ...opts });

export const uiConfirm = (message: string, opts: { title?: string; confirmLabel?: string; tone?: 'default' | 'danger' } = {}) =>
  open<boolean>({ kind: 'confirm', message, ...opts });

/** Resolves to the entered text, or null when cancelled. */
export const uiPrompt = (message: string, opts: { title?: string; defaultValue?: string; placeholder?: string; confirmLabel?: string } = {}) =>
  open<string | null>({ kind: 'prompt', message, ...opts });
