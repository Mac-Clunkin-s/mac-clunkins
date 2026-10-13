import type { DriverVehicle, SupplierRequirementSummary } from './types';

/** Heat warning triggers when the forecast is strictly above this. */
export const HEAT_THRESHOLD_C = 30;

export function isHeatWarning(forecastC: number | null | undefined): boolean {
  return typeof forecastC === 'number' && forecastC > HEAT_THRESHOLD_C;
}

export interface CrateRule {
  max_per_crate: number | null;
  max_per_crate_hot: number | null;
}

/** Normal vs hot limit. A hot day with no hot-specific limit falls back to the normal limit. */
export function birdsPerCrateLimit(rule: CrateRule, forecastC: number | null | undefined): { limit: number | null; hot: boolean } {
  const hot = isHeatWarning(forecastC);
  const limit = hot ? rule.max_per_crate_hot ?? rule.max_per_crate : rule.max_per_crate;
  return { limit: limit ?? null, hot };
}

export function maxBirdsOnLoad(limitPerCrate: number | null, crates: number | null): number | null {
  if (limitPerCrate == null || crates == null) return null;
  return limitPerCrate * crates;
}

export interface PickupCheck {
  count: number;
  maxBirds: number | null;
  photoRequired: boolean;
  hasPhoto: boolean;
  crossesProvince: boolean;
  hasMovementPermit: boolean;
  hasRemovalPermit: boolean;
  permitExpired: boolean;
}

/** i18n keys of anything still blocking "Confirm pickup". Empty = good to go. */
export function pickupBlockers(c: PickupCheck): string[] {
  const out: string[] = [];
  if (!c.hasRemovalPermit) out.push('driver.pickup.block_no_permit');
  else if (c.permitExpired) out.push('driver.pickup.block_permit_expired');
  if (c.crossesProvince && !c.hasMovementPermit) out.push('driver.pickup.block_movement_permit');
  if (c.photoRequired && !c.hasPhoto) out.push('driver.pickup.block_photo');
  if (!(c.count > 0)) out.push('driver.pickup.block_count');
  else if (c.maxBirds != null && c.count > c.maxBirds) out.push('driver.pickup.block_over_limit');
  return out;
}

export function meetsRequirement(v: DriverVehicle, r: SupplierRequirementSummary): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (r.covered_vehicle && !v.covered) reasons.push('driver.onb.fit_needs_covered');
  if (r.needs_crates && !(v.crates_owned && v.crates_owned > 0)) reasons.push('driver.onb.fit_needs_crates');
  if (!v.ventilated) reasons.push('driver.onb.fit_needs_ventilated');
  return { ok: reasons.length === 0, reasons };
}

export function navigateUrl(lat: number | null, lng: number | null, address: string | null): string | null {
  if (lat != null && lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
  if (address) return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
  return null;
}

export const isValidDeliveryCode = (s: string) => /^\d{4}$/.test(s);
