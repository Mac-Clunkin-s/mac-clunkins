import { useContext, useMemo, useSyncExternalStore } from 'react';
import { LocaleContext, type LocaleContextValue } from './context';
import { getLocale, setLocale, subscribe, t } from './index';

/** { locale, setLocale, t } that re-renders the caller whenever the language changes. */
export function useLocale(): LocaleContextValue {
  const fromContext = useContext(LocaleContext);
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const standalone = useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t: (key, params) => t(key, params) }),
    [locale],
  );
  return fromContext ?? standalone;
}
