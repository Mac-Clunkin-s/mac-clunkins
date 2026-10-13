import type { JsonValue, SettingsMap } from '../types';

export type SettingKind = 'percent' | 'cents' | 'int' | 'number' | 'text' | 'nullableText';
export interface SettingDef {
  key: string;
  kind: SettingKind;
  group: 'pricing' | 'limits' | 'timeline';
  min?: number;
  max?: number;
  /** Shown as a "applies to new quotes only" hint. */
  quoteScoped: boolean;
}

export const SETTING_DEFS: SettingDef[] = [
  { key: 'markup_pct', kind: 'percent', group: 'pricing', quoteScoped: true },
  { key: 'min_margin_cents', kind: 'cents', group: 'pricing', quoteScoped: true },
  { key: 'service_fee_pct', kind: 'percent', group: 'pricing', quoteScoped: true },
  { key: 'delivery_base_cents', kind: 'cents', group: 'pricing', quoteScoped: true },
  { key: 'delivery_per_km_cents', kind: 'cents', group: 'pricing', quoteScoped: true },
  { key: 'delivery_per_bird_cents', kind: 'cents', group: 'pricing', quoteScoped: true },
  { key: 'driver_share_pct', kind: 'percent', group: 'pricing', quoteScoped: true },
  { key: 'quote_hold_minutes', kind: 'int', group: 'limits', min: 1, max: 1440, quoteScoped: true },
  { key: 'rfq_min_birds', kind: 'int', group: 'limits', min: 1, quoteScoped: true },
  { key: 'rfq_max_km', kind: 'int', group: 'limits', min: 1, quoteScoped: true },
  { key: 'min_order', kind: 'int', group: 'limits', min: 1, quoteScoped: true },
  { key: 'unpaid_cancel_hours', kind: 'int', group: 'limits', min: 1, max: 720, quoteScoped: true },
  { key: 'issue_window_hours', kind: 'int', group: 'limits', min: 1, max: 720, quoteScoped: true },
  { key: 'heat_warn_c', kind: 'number', group: 'limits', min: 0, max: 60, quoteScoped: true },
  { key: 'journey_warn_hours', kind: 'number', group: 'limits', min: 0.5, max: 24, quoteScoped: true },
  { key: 'delivery_timeline', kind: 'nullableText', group: 'timeline', quoteScoped: true },
];

export type ValidationError =
  | 'required' | 'not_a_number' | 'percent_range' | 'not_integer' | 'negative' | 'out_of_range';
export type ValidationResult =
  | { ok: true; value: JsonValue }
  | { ok: false; error: ValidationError };

/** Validates the raw form string for one setting. Percent 0-100, cents whole numbers >= 0. */
export function validateSetting(def: Pick<SettingDef, 'kind' | 'min' | 'max'>, raw: string): ValidationResult {
  const text = raw.trim();
  if (def.kind === 'nullableText') return { ok: true, value: text === '' ? null : text };
  if (def.kind === 'text') return text === '' ? { ok: false, error: 'required' } : { ok: true, value: text };
  if (text === '') return { ok: false, error: 'required' };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, error: 'not_a_number' };
  if (def.kind === 'percent') {
    return n < 0 || n > 100 ? { ok: false, error: 'percent_range' } : { ok: true, value: n };
  }
  if (def.kind === 'cents' || def.kind === 'int') {
    if (!Number.isInteger(n)) return { ok: false, error: 'not_integer' };
    if (n < 0) return { ok: false, error: 'negative' };
  }
  if (def.min !== undefined && n < def.min) return { ok: false, error: 'out_of_range' };
  if (def.max !== undefined && n > def.max) return { ok: false, error: 'out_of_range' };
  return { ok: true, value: n };
}

export function defFor(key: string): SettingDef | undefined {
  return SETTING_DEFS.find((d) => d.key === key);
}

export function sameValue(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function changedKeys(current: SettingsMap, next: SettingsMap): string[] {
  return Object.keys(next).filter((k) => !sameValue(current[k], next[k]));
}
