import type { MatchCandidate } from '../types';

export function isEligible(c: MatchCandidate): boolean {
  return !c.paused && c.avian_flu_zone === 'none' && c.requirement_fit !== 'fail';
}

/** Nearest eligible first, same province preferred, then landed price per bird, then rating. */
export function rankCandidates(list: MatchCandidate[]): MatchCandidate[] {
  return [...list].sort((a, b) =>
    Number(isEligible(b)) - Number(isEligible(a)) ||
    Number(b.same_province) - Number(a.same_province) ||
    a.distance_km - b.distance_km ||
    a.landed_cents_per_bird - b.landed_cents_per_bird ||
    (b.rating_avg ?? 0) - (a.rating_avg ?? 0),
  );
}

export function formatJourney(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}
