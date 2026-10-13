import { describe, expect, it } from 'vitest';
import { birdsPerCrateLimit, HEAT_THRESHOLD_C, isHeatWarning, maxBirdsOnLoad, meetsRequirement, navigateUrl, pickupBlockers, type PickupCheck } from '../rules';
import { currentTrip, earnedOn } from '../earned';

describe('heat threshold', () => {
  it('warns only strictly above 30C', () => {
    expect(HEAT_THRESHOLD_C).toBe(30);
    expect(isHeatWarning(29.9)).toBe(false);
    expect(isHeatWarning(30)).toBe(false);
    expect(isHeatWarning(30.1)).toBe(true);
    expect(isHeatWarning(null)).toBe(false);
  });
});

describe('crate limit selection', () => {
  const rule = { max_per_crate: 10, max_per_crate_hot: 8 };
  it('uses normal limit on a mild day and hot limit above 30C', () => {
    expect(birdsPerCrateLimit(rule, 24)).toEqual({ limit: 10, hot: false });
    expect(birdsPerCrateLimit(rule, 30)).toEqual({ limit: 10, hot: false });
    expect(birdsPerCrateLimit(rule, 33)).toEqual({ limit: 8, hot: true });
  });
  it('falls back to the normal limit when no hot limit is set, and to null when nothing is set', () => {
    expect(birdsPerCrateLimit({ max_per_crate: 10, max_per_crate_hot: null }, 35).limit).toBe(10);
    expect(birdsPerCrateLimit({ max_per_crate: null, max_per_crate_hot: null }, 35).limit).toBeNull();
  });
  it('computes load ceiling', () => {
    expect(maxBirdsOnLoad(8, 12)).toBe(96);
    expect(maxBirdsOnLoad(null, 12)).toBeNull();
  });
});

describe('pickup blockers', () => {
  const ok: PickupCheck = { count: 80, maxBirds: 96, photoRequired: true, hasPhoto: true, crossesProvince: false, hasMovementPermit: false, hasRemovalPermit: true, permitExpired: false };
  it('passes when everything is in order', () => expect(pickupBlockers(ok)).toEqual([]));
  it('requires a state-vet movement permit when crossing a province', () => {
    expect(pickupBlockers({ ...ok, crossesProvince: true })).toEqual(['driver.pickup.block_movement_permit']);
    expect(pickupBlockers({ ...ok, crossesProvince: true, hasMovementPermit: true })).toEqual([]);
  });
  it('blocks expired permit, missing photo, zero count and over-limit count', () => {
    expect(pickupBlockers({ ...ok, permitExpired: true })).toEqual(['driver.pickup.block_permit_expired']);
    expect(pickupBlockers({ ...ok, hasPhoto: false })).toEqual(['driver.pickup.block_photo']);
    expect(pickupBlockers({ ...ok, count: 0 })).toEqual(['driver.pickup.block_count']);
    expect(pickupBlockers({ ...ok, count: 97 })).toEqual(['driver.pickup.block_over_limit']);
  });
});

describe('misc driver helpers', () => {
  it('builds navigation deep links', () => {
    expect(navigateUrl(-26.2, 28.04, null)).toContain('destination=-26.2,28.04');
    expect(navigateUrl(null, null, '1 Main St, Soweto')).toContain('1%20Main%20St');
    expect(navigateUrl(null, null, null)).toBeNull();
  });
  it('checks vehicle against supplier requirements', () => {
    const v = { vehicle_type: 'bakkie' as const, gvm_kg: 3000, vehicle_reg: 'X', covered: false, ventilated: true, crates_owned: 0, capacity_birds: 200 };
    const r = { label: 'Farm A', province: 'GP', covered_vehicle: true, max_journey_hours: 4, needs_crates: true };
    expect(meetsRequirement(v, r).reasons).toEqual(['driver.onb.fit_needs_covered', 'driver.onb.fit_needs_crates']);
    expect(meetsRequirement({ ...v, covered: true, crates_owned: 20 }, r).ok).toBe(true);
  });
  it('sums earned today from delivered trips only and picks the current trip', () => {
    const day = new Date(2026, 9, 13, 12);
    const trips = [
      { status: 'delivered' as const, delivered_at: new Date(2026, 9, 13, 9).toISOString(), driver_share_cents: 8500, created_at: 'a' },
      { status: 'delivered' as const, delivered_at: new Date(2026, 9, 12, 9).toISOString(), driver_share_cents: 9999, created_at: 'b' },
      { status: 'assigned' as const, delivered_at: null, driver_share_cents: 7000, created_at: 'c' },
    ];
    expect(earnedOn(trips, day)).toBe(8500);
    expect(currentTrip(trips)?.created_at).toBe('c');
  });
});
