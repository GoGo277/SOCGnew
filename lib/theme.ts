/** Per-browser theme preference (system / light / dark). */
export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'geyes_theme';

export const getThemePref = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch { return 'system'; }
};

export const applyTheme = (pref: ThemePref = getThemePref()) => {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
};

export const setThemePref = (pref: ThemePref) => {
  try { localStorage.setItem(KEY, pref); } catch { /* storage unavailable: still apply for this session */ }
  applyTheme(pref);
};
