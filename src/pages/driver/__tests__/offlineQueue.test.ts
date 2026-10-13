import { describe, expect, it, vi } from 'vitest';
import { createMemoryStore, OfflineQueue, PermanentSyncError, type QueuedAction } from '../offlineQueue';

const make = () => new OfflineQueue(createMemoryStore(), () => 1_700_000_000_000);

describe('offline queue', () => {
  it('replays in the order actions were queued (pickup before delivery)', async () => {
    const q = make();
    await q.enqueue('pickup', 'trip-1', { count: 90 });
    await q.enqueue('delivery', 'trip-1', { code: '1234', count: 90 });
    await q.enqueue('pickup', 'trip-2', { count: 50 });
    const seen: string[] = [];
    const r = await q.flush(async (a) => void seen.push(`${a.kind}:${a.tripId}`));
    expect(seen).toEqual(['pickup:trip-1', 'delivery:trip-1', 'pickup:trip-2']);
    expect(r).toMatchObject({ sent: 3, remaining: 0, stoppedOffline: false });
  });

  it('stops at the first transient failure and keeps order for the next run', async () => {
    const q = make();
    await q.enqueue('pickup', 't1', { count: 1 });
    await q.enqueue('delivery', 't1', { code: '0000', count: 1 });
    const send = vi.fn<(a: QueuedAction) => Promise<void>>().mockRejectedValueOnce(new Error('Failed to fetch'));
    const first = await q.flush(send);
    expect(first).toMatchObject({ sent: 0, remaining: 2, stoppedOffline: true });
    expect(send).toHaveBeenCalledTimes(1); // delivery was NOT attempted ahead of the pickup
    send.mockResolvedValue(undefined);
    const second = await q.flush(send);
    expect(second.sent).toBe(2);
    expect(send.mock.calls.slice(1).map((c) => c[0].kind)).toEqual(['pickup', 'delivery']);
  });

  it('drops a permanently rejected action and continues', async () => {
    const q = make();
    await q.enqueue('delivery', 't1', { code: '9999', count: 5 });
    await q.enqueue('pickup', 't2', { count: 5 });
    const r = await q.flush(async (a) => {
      if (a.tripId === 't1') throw new PermanentSyncError('wrong code');
    });
    expect(r.sent).toBe(1);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].action.tripId).toBe('t1');
    expect(r.remaining).toBe(0);
  });

  it('shares one run between concurrent flushes and notifies subscribers', async () => {
    const q = make();
    const onChange = vi.fn();
    q.subscribe(onChange);
    await q.enqueue('pickup', 't1', { count: 1 });
    const send = vi.fn(async () => {});
    const [a, b] = await Promise.all([q.flush(send), q.flush(send)]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(onChange).toHaveBeenCalled();
  });
});
