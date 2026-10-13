import { formatCents } from '../../../lib/format';
import { birdsLineCents } from '../lib/quote';
import type { BuyerQuote } from '../types';
import { t } from '../i18n-shim';

export function QuoteLines({ q }: { q: BuyerQuote }) {
  const birds = birdsLineCents(q);
  return (
    <dl className="divide-y divide-ink/10 text-sm">
      <Line
        label={t('buyer.lines.birds', {
          n: q.quantity,
          type: t(`buyer.birdType.${q.bird_type}`),
        })}
        cents={birds}
      />
      <Line label={t('buyer.lines.delivery')} cents={q.delivery_fee_cents ?? 0} />
      <Line label={t('buyer.lines.service')} cents={q.service_fee_cents ?? 0} />
      <Line label={t('buyer.lines.total')} cents={q.total_cents ?? 0} strong />
    </dl>
  );
}

export function Line({ label, cents, strong = false }: { label: string; cents: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${strong ? 'font-heading text-lg font-bold' : ''}`}>
      <dt>{label}</dt>
      <dd>{formatCents(cents)}</dd>
    </div>
  );
}
