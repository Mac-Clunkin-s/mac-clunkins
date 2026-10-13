// Minimal local shim with the same t() signature the shared src/i18n/index.ts is expected to export:
//   t('buyer.orders.title', { n: 3 })
// TODO(app): once src/i18n/index.ts lands, replace this file's body with
//   export { t } from '../../i18n';
// and delete the English JSON import below (the keys live in src/i18n/en.buyer.json and must be
// merged into the shared English bundle).
import en from '../../i18n/en.buyer.json';

type Vars = Record<string, string | number>;

function lookup(tree: unknown, key: string): string | undefined {
  let node: unknown = tree;
  for (const part of key.split('.')) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(key: string, vars?: Vars): string {
  const raw = lookup(en, key);
  if (raw === undefined) return key; // visible, greppable fallback instead of a crash
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, name: string) => (name in vars ? String(vars[name]) : `{${name}}`));
}
