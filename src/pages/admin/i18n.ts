// LOCAL SHIM. The shared src/i18n/index.ts (another agent) was not on main when this was written.
// Same signature: t(key, params?). Once that module lands, replace this file's body with
// `export { t } from '../../i18n';` (and have it load en.admin.json) - no page needs to change.
import en from '../../i18n/en.admin.json';

type Tree = { [k: string]: string | Tree };

export function t(key: string, params?: Record<string, string | number>): string {
  let node: string | Tree | undefined = en as Tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return key;
    node = node[part];
  }
  if (typeof node !== 'string') return key;
  return params ? node.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? `{${k}}`)) : node;
}
