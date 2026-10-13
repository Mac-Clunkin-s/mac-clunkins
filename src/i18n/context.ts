import { createContext } from 'react';
import type { Locale, Params } from './index';

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Params) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);
