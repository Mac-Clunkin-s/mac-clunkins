import { useEffect, useRef, useState } from 'react';
import { getPayState } from '../api';
import type { OrderStatus, PaymentStatus } from '../types';

export type PayVerdict = 'checking' | 'paid' | 'failed' | 'unknown';

export function verdictOf(orderStatus: OrderStatus | null, payment: PaymentStatus | null): PayVerdict {
  if (payment === 'succeeded') return 'paid';
  if (orderStatus && orderStatus !== 'placed' && orderStatus !== 'cancelled') return 'paid';
  if (payment === 'failed' || orderStatus === 'cancelled') return 'failed';
  return 'checking';
}

/**
 * Polls the SERVER for payment state. The client never decides an order is paid: the verdict is a
 * pure function of what the database (written by the Paystack webhook) reports. After `maxPolls`
 * with no answer we report 'unknown' rather than guessing.
 */
export function usePayState(orderId: string, intervalMs = 3000, maxPolls = 40) {
  const [verdict, setVerdict] = useState<PayVerdict>('checking');
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const polls = useRef(0);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      polls.current += 1;
      try {
        const s = await getPayState(orderId);
        if (stop) return;
        setOrderStatus(s.orderStatus);
        const v = verdictOf(s.orderStatus, s.paymentStatus);
        setVerdict(v);
        if (v !== 'checking') return;
      } catch {
        /* transient: keep polling */
      }
      if (stop) return;
      if (polls.current >= maxPolls) {
        setVerdict('unknown');
        return;
      }
      timer = setTimeout(() => void tick(), intervalMs);
    }
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, intervalMs, maxPolls]);

  return { verdict, orderStatus };
}
