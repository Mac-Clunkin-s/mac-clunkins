import type { OrderStatus } from '../types';
import { t } from '../i18n-shim';

const tone: Record<OrderStatus, string> = {
  placed: 'bg-ink/10 text-ink',
  paid: 'bg-mustard/30 text-ink',
  scheduled: 'bg-mustard/30 text-ink',
  ready: 'bg-mustard/30 text-ink',
  on_the_way: 'bg-chilli text-cream',
  delivered: 'bg-emerald-100 text-emerald-900',
  settled: 'bg-emerald-100 text-emerald-900',
  cancelled: 'bg-ink/10 text-ink/60',
  refunded: 'bg-ink/10 text-ink/60',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${tone[status]}`}>
      {t(`buyer.status.${status}`)}
    </span>
  );
}
