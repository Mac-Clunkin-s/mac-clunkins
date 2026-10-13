// Local i18n shim. The shared src/i18n/index.ts is created by another agent.
// When it lands, replace the body of this file with:
//   export { t } from '../../i18n';
// and register src/i18n/en.supplier-driver.json in its English bundle.
import en from '../../i18n/en.supplier-driver.json';

type Vars = Record<string, string | number>;

function lookup(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function t(key: string, vars?: Vars): string {
  const raw = lookup(en, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''));
}
