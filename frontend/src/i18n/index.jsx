import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/ja';
import ja from './ja';

/**
 * Minimal i18n: English text is the key, `ja` maps it to Japanese. Missing entries fall back to English,
 * so an untranslated string shows in English instead of breaking the page.
 *
 *   t('Save')                          -> "保存"
 *   t('Reports for {date}', { date })  -> "{date} の日報"
 *   <T>Name</T>                        -> for labels built outside render (e.g. table column titles)
 */
export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
];

const STORAGE_KEY = 'sist_lang';
const DICTIONARIES = { ja };
let current = 'en';

export function t(key, vars) {
  if (key === undefined || key === null) return key;
  let text = DICTIONARIES[current]?.[key] ?? String(key);
  if (vars) text = text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? vars[name] : m));
  return text;
}

export function T({ children, vars }) {
  useLanguage(); // re-render with the active language
  return t(children, vars);
}

export const currentLanguage = () => current;

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

/** Whether this browser already has an explicit language choice. */
export function hasSavedLanguage() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

const LanguageContext = createContext({ lang: 'en', setLang: () => {} });

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(initialLanguage);
  // Applied during render so every child rendered below uses the new language immediately.
  current = lang;
  dayjs.locale(lang);

  const setLang = useCallback((next) => {
    if (next !== 'en' && next !== 'ja') return;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* not remembered on this device */
    }
    setLangState(next);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
