export function daysUntil(isoDate: string, now: Date = new Date()): number {
  const target = new Date(isoDate.length <= 10 ? `${isoDate}T00:00:00` : isoDate);
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - base.getTime()) / 864e5);
}

export type ExpiryState = 'none' | 'ok' | 'soon' | 'expired';
/** Documents expiring within 30 days are flagged. */
export function expiryState(expiresOn: string | null, now: Date = new Date()): ExpiryState {
  if (!expiresOn) return 'none';
  const d = daysUntil(expiresOn, now);
  return d < 0 ? 'expired' : d <= 30 ? 'soon' : 'ok';
}

/** PDMA monthly reconciliation for month M is due by the 15th of the following month. */
export function pdmaDueDate(month: string): Date {
  const d = new Date(`${month.slice(0, 7)}-01T00:00:00`);
  return new Date(d.getFullYear(), d.getMonth() + 1, 15);
}
