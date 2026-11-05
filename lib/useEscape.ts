import { useEffect, useRef } from 'react';

/** Close the top-most dialog with the Escape key (keyboard accessibility). */
const stack: symbol[] = [];

export const useEscape = (onClose: () => void, enabled = true) => {
  const cb = useRef(onClose);
  cb.current = onClose;
  useEffect(() => {
    if (!enabled) return;
    const id = Symbol('dialog');
    stack.push(id);
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === id) { e.stopPropagation(); cb.current(); }
    };
    window.addEventListener('keydown', handler);
    return () => { window.removeEventListener('keydown', handler); stack.splice(stack.indexOf(id), 1); };
  }, [enabled]);
};
