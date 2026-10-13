import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { LocaleContext, type LocaleContextValue } from './context';
import { getLocale, setLocale, subscribe, t } from './index';

/**
 * Optional. Wrap the app once (inside main.tsx) so every component re-renders on a language
 * change and <html lang> stays in sync. Components that only call useLocale() also work without
 * it because the hook falls back to the same store.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // `t` reads module state, so its identity must change with the locale for memoised children.
  const value = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key, params) => t(key, params) }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
