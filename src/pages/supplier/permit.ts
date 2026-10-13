import { useEffect, useState } from 'react';

/** A vet-signed removal permit is valid for 36 hours from signing. */
export const PERMIT_WINDOW_HOURS = 36;
export const PERMIT_WARN_HOURS = 6;

export function permitValidUntil(signedAt: Date): Date {
  return new Date(signedAt.getTime() + PERMIT_WINDOW_HOURS * 3_600_000);
}

export interface PermitRemaining {
  expired: boolean;
  totalMs: number;
  hours: number;
  minutes: number;
  seconds: number;
  urgency: 'ok' | 'warn' | 'expired';
}

export function permitRemaining(validUntil: Date | string | null | undefined, now: Date = new Date()): PermitRemaining | null {
  if (!validUntil) return null;
  const end = typeof validUntil === 'string' ? new Date(validUntil) : validUntil;
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return { expired: true, totalMs: 0, hours: 0, minutes: 0, seconds: 0, urgency: 'expired' };
  const total = Math.floor(ms / 1000);
  return {
    expired: false,
    totalMs: ms,
    hours: Math.floor(total / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    urgency: ms <= PERMIT_WARN_HOURS * 3_600_000 ? 'warn' : 'ok',
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatCountdown(r: PermitRemaining): string {
  return `${pad(r.hours)}:${pad(r.minutes)}:${pad(r.seconds)}`;
}

export function usePermitCountdown(validUntil: string | Date | null | undefined): PermitRemaining | null {
  const key = validUntil instanceof Date ? validUntil.toISOString() : validUntil;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!key) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [key]);
  return permitRemaining(key ?? null, now);
}
