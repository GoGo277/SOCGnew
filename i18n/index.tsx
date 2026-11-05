import React, { createContext, useContext, useMemo } from 'react';
import { Language } from '../types';
import { translations } from '../translations';
import { ZH } from './zh';
import { EN } from './en';

/**
 * Lightweight i18n for G-Eyes SR modules.
 * Keys are the English source strings; `{name}` placeholders are interpolated.
 * Legacy snake_case keys from translations.ts are resolved as a fallback.
 */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

const interpolate = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`)) : s;

export const makeTranslator = (lang: Language): Translate => (key, vars) => {
  const table: Record<string, string> = lang === 'zh' ? ZH : EN;
  const hit = table[key] ?? translations[lang]?.[key];
  return interpolate(hit ?? key, vars);
};

const I18nContext = createContext<{ lang: Language; t: Translate }>({ lang: 'en', t: makeTranslator('en') });

export const I18nProvider: React.FC<{ lang: Language; children: React.ReactNode }> = ({ lang, children }) => {
  const value = useMemo(() => ({ lang, t: makeTranslator(lang) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;

/** Locale for date formatting. */
export const localeOf = (lang: Language) => (lang === 'zh' ? 'zh-CN' : undefined);
