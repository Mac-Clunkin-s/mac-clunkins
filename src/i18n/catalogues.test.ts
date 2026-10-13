import { describe, expect, it } from 'vitest';
import { LOCALES, getCatalogue, isLocale, type Catalogue } from './index';

// Every catalogue file on disk, base and namespaced, keyed by its path.
const files = {
  ...import.meta.glob<Catalogue>('./locales/*.json', { eager: true, import: 'default' }),
  ...import.meta.glob<Catalogue>('./*.*.json', { eager: true, import: 'default' }),
};

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('catalogue files', () => {
  it('discovers the four base catalogues', () => {
    const names = Object.keys(files).filter((p) => p.startsWith('./locales/'));
    expect(names.sort()).toEqual(LOCALES.map((l) => `./locales/${l.code}.json`).sort());
  });

  it.each(Object.entries(files))('%s is a flat map of strings', (path, data) => {
    expect(data && typeof data === 'object' && !Array.isArray(data)).toBe(true);
    for (const [key, value] of Object.entries(data)) {
      expect(typeof value, `${path} -> ${key}`).toBe('string');
    }
  });

  it.each(Object.keys(files))('%s is named <locale>.json or <locale>.<namespace>.json', (path) => {
    const code = (path.split('/').pop() ?? '').split('.')[0];
    expect(isLocale(code), `${path}: unknown locale "${code}"`).toBe(true);
  });
});

describe('English is the source of truth', () => {
  const en = getCatalogue('en');

  it('has no empty strings', () => {
    const empty = Object.entries(en).filter(([, v]) => v.trim() === '');
    expect(empty).toEqual([]);
  });

  it('has no key defined in two English files', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const [path, data] of Object.entries(files)) {
      if ((path.split('/').pop() ?? '').split('.')[0] !== 'en') continue;
      for (const key of Object.keys(data)) {
        if (seen.has(key)) dupes.push(`${key} (${seen.get(key)} and ${path})`);
        seen.set(key, path);
      }
    }
    expect(dupes).toEqual([]);
  });

  for (const { code } of LOCALES.filter((l) => l.code !== 'en')) {
    describe(code, () => {
      const catalogue = getCatalogue(code);

      it('has no key that is absent from en', () => {
        const orphans = Object.keys(catalogue).filter((key) => !(key in en));
        expect(orphans, `keys in ${code} but not in en`).toEqual([]);
      });

      it('keeps the same {placeholders} as en', () => {
        const mismatched = Object.entries(catalogue)
          .filter(([key]) => key in en)
          .filter(([key, text]) => placeholders(text).join() !== placeholders(en[key]).join())
          .map(([key]) => key);
        expect(mismatched).toEqual([]);
      });
    });
  }
});
