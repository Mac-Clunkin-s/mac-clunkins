import { describe, expect, it } from 'vitest';
import { LOCALES, flatten, getCatalogue, isLocale, type Catalogue } from './index';

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

  it.each(Object.entries(files))('%s contains only strings (flat or nested)', (path, data) => {
    expect(data && typeof data === 'object' && !Array.isArray(data)).toBe(true);
    const check = (node: unknown, trail: string) => {
      if (typeof node === 'string') return;
      expect(node && typeof node === 'object' && !Array.isArray(node), `${path} -> ${trail}`).toBe(true);
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) check(v, `${trail}.${k}`);
    };
    check(data, '');
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
      // Namespaced files may restate shared base keys (common.*); only clashes between namespaces matter.
      if ((path.split('/').pop() ?? '').split('.')[0] !== 'en' || path.startsWith('./locales/')) continue;
      for (const key of Object.keys(flatten(data))) {
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
