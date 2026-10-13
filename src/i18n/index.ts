/// <reference types="vite/client" />
// Dependency-free i18n for McCluckin's.
//
// - Flat string catalogues: { "login.title": "Log in" }. Placeholders use {name}.
// - Base catalogues live in ./locales/<locale>.json.
// - Feature agents add namespaced catalogues next to this file as ./<locale>.<namespace>.json
//   (for example ./en.buyer.json, ./zu.buyer.json). Every matching file is merged automatically
//   via import.meta.glob, so nobody edits this file or the base catalogues to ship strings.
// - English is the fallback: a key missing in the active locale renders the English text, and a
//   key missing everywhere renders the key itself (visible, never blank).
// See docs/i18n.md.

export const LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'st', label: 'Sesotho' },
  { code: 'tn', label: 'Setswana' },
] as const;

export type Locale = (typeof LOCALES)[number]['code'];
export type Catalogue = Record<string, string>;
export type Params = Record<string, string | number>;

export const DEFAULT_LOCALE: Locale = 'en';
export const STORAGE_KEY = 'mccluckins.locale';

const CODES: readonly string[] = LOCALES.map((l) => l.code);

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && CODES.includes(value);
}

const baseFiles = import.meta.glob<Catalogue>('./locales/*.json', {
  eager: true,
  import: 'default',
});
const namespacedFiles = import.meta.glob<Catalogue>('./*.*.json', {
  eager: true,
  import: 'default',
});

function buildCatalogues(): Record<Locale, Catalogue> {
  const out: Record<Locale, Catalogue> = { en: {}, zu: {}, st: {}, tn: {} };
  const add = (path: string, data: Catalogue) => {
    // ./locales/en.json -> en ; ./zu.buyer.json -> zu
    const file = path.split('/').pop() ?? '';
    const code = file.split('.')[0];
    if (isLocale(code)) Object.assign(out[code], data);
  };
  // Base first so namespaced files can never be shadowed by it.
  for (const [path, data] of Object.entries(baseFiles)) add(path, data);
  for (const [path, data] of Object.entries(namespacedFiles)) add(path, data);
  return out;
}

const catalogues = buildCatalogues();

/** Read-only view of the merged catalogues. Used by tests and scripts; do not mutate. */
export function getCatalogue(locale: Locale): Readonly<Catalogue> {
  return catalogues[locale];
}

/** Replace {name} placeholders. Unknown placeholders are left intact so they are noticed. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export interface DetectInput {
  /** Value previously saved by setLocale. Defaults to localStorage. */
  stored?: string | null;
  /** Browser language preferences, most preferred first. Defaults to navigator.languages. */
  languages?: readonly string[];
}

/** Saved choice, else the first supported browser language, else English. Never throws. */
export function detectLocale(input: DetectInput = {}): Locale {
  let stored = input.stored;
  if (stored === undefined) {
    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
  }
  if (isLocale(stored)) return stored;

  let languages = input.languages;
  if (!languages) {
    languages = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  }
  for (const tag of languages) {
    const primary = String(tag).toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (!isLocale(locale)) return;
  const changed = locale !== current;
  current = locale;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* private mode or no storage: the choice just won't persist */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  if (changed) listeners.forEach((fn) => fn());
}

/** Subscribe to locale changes. Returns an unsubscribe function. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Translate `key` in the current locale, falling back to English, then to the key itself. */
export function t(key: string, params?: Params): string {
  const text = catalogues[current][key] ?? catalogues[DEFAULT_LOCALE][key] ?? key;
  return interpolate(text, params);
}
