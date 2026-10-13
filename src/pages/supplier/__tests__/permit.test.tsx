import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, permitRemaining, permitValidUntil, PERMIT_WINDOW_HOURS, usePermitCountdown } from '../permit';

function Countdown({ until }: { until: string }) {
  const r = usePermitCountdown(until);
  return <p data-testid="c">{r ? (r.expired ? `expired:${r.urgency}` : `${formatCountdown(r)}:${r.urgency}`) : 'none'}</p>;
}

describe('36-hour removal permit countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T06:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('window is 36 hours from signing', () => {
    expect(PERMIT_WINDOW_HOURS).toBe(36);
    expect(permitValidUntil(new Date('2026-10-13T06:00:00Z')).toISOString()).toBe('2026-10-14T18:00:00.000Z');
  });

  it('starts at 36:00:00 and ticks every second', () => {
    const until = permitValidUntil(new Date()).toISOString();
    render(<Countdown until={until} />);
    expect(screen.getByTestId('c').textContent).toBe('36:00:00:ok');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('c').textContent).toBe('35:59:59:ok');
    act(() => void vi.advanceTimersByTime(60 * 60 * 1000));
    expect(screen.getByTestId('c').textContent).toBe('34:59:59:ok');
  });

  it('warns in the last 6 hours and expires at 36h', () => {
    const until = permitValidUntil(new Date()).toISOString();
    render(<Countdown until={until} />);
    act(() => void vi.advanceTimersByTime(30 * 3600 * 1000));
    expect(screen.getByTestId('c').textContent).toBe('06:00:00:warn');
    act(() => void vi.advanceTimersByTime(6 * 3600 * 1000 - 1000));
    expect(screen.getByTestId('c').textContent).toBe('00:00:01:warn');
    act(() => void vi.advanceTimersByTime(1000));
    expect(screen.getByTestId('c').textContent).toBe('expired:expired');
  });

  it('returns null with no permit and treats a past time as expired', () => {
    expect(permitRemaining(null)).toBeNull();
    expect(permitRemaining('2026-10-13T05:59:59Z', new Date())?.expired).toBe(true);
  });
});
