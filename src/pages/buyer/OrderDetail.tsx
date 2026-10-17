import { Link, useParams } from 'react-router-dom';
import { FormError } from '../../components/FormField';
import { PageSpinner } from '../../components/PageSpinner';
import { formatCents } from '../../lib/format';
import { usePaymentsMode } from '../../lib/billing';
import { getOrder } from './api';
import { BillingPanel } from './components/BillingPanel';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { Line } from './components/LineItems';
import { StatusBadge } from './components/StatusBadge';
import { useAsync } from './hooks/useAsync';
import { t } from './i18n-shim';
import { formatDate, formatDateTime } from './lib/dates';
import type { OrderDetail as OrderDetailData } from './types';

/** Buyers never choose a delivery time. We only show the date/slot once McCluckin's has scheduled it. */
export function isScheduled(o: Pick<OrderDetailData, 'status' | 'delivery_date'>): boolean {
  return !!o.delivery_date && !['placed', 'paid', 'cancelled', 'refunded'].includes(o.status);
}

export default function OrderDetail() {
  const { id = '' } = useParams();
  const { data: o, loading, error } = useAsync(() => getOrder(id), [id]);

  return (
    <BuyerLayout>
      {loading && <PageSpinner label={t('buyer.detail.loading')} />}
      <FormError message={error ? t('buyer.detail.loadError') : null} />
      {o && <Body o={o} />}
    </BuyerLayout>
  );
}

function Body({ o }: { o: OrderDetailData }) {
  const live = ['scheduled', 'ready', 'on_the_way'].includes(o.status);
  const done = o.status === 'delivered' || o.status === 'settled';
  const paid = o.status !== 'placed' && o.status !== 'cancelled';
  const { mode } = usePaymentsMode();
  const manual = mode === 'manual';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{o.number}</h1>
          <p className="text-sm text-ink/60">
            {t('buyer.orders.birdsLine', { n: o.quantity, type: t(`buyer.birdType.${o.bird_type}`) })} ·{' '}
            {t(`buyer.weightBand.${o.weight_band}`)}
          </p>
        </div>
        <StatusBadge status={o.status} />
      </div>

      <Card>
        <h2 className="font-heading font-bold">{t('buyer.detail.deliveryTitle')}</h2>
        {isScheduled(o) ? (
          <p className="mt-1" data-testid="delivery-when">
            {o.delivery_date && formatDate(o.delivery_date)}
            {o.slot_label ? ` · ${o.slot_label}` : ''}
          </p>
        ) : (
          <>
            <p className="mt-1 font-semibold" data-testid="timeline-not-set">
              {t('buyer.detail.timelineNotSet')}
            </p>
            <p className="mt-1 text-sm text-ink/70">{t('buyer.detail.timelineNotSetBody')}</p>
          </>
        )}
        {o.address_text && <p className="mt-2 text-sm text-ink/70">{o.address_text}</p>}
        <div className="mt-3 flex flex-wrap gap-3">
          {live && (
            <Link to={`/orders/${o.id}/track`} className="rounded-full bg-chilli px-5 py-2 font-semibold text-cream">
              {t('buyer.detail.track')}
            </Link>
          )}
          {done && (
            <Link to={`/orders/${o.id}/delivered`} className="rounded-full bg-chilli px-5 py-2 font-semibold text-cream">
              {t('buyer.detail.rate')}
            </Link>
          )}
          {!manual && o.status === 'placed' && o.quote_id && (
            <Link
              to={`/orders/new/pay?quote=${o.quote_id}`}
              className="rounded-full bg-chilli px-5 py-2 font-semibold text-cream"
            >
              {t('buyer.detail.completePayment')}
            </Link>
          )}
          <Link to={`/orders/new?reorder=${o.id}`} className="rounded-full px-5 py-2 font-semibold ring-1 ring-ink/20">
            {t('buyer.orders.reorder')}
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="font-heading font-bold">{t('buyer.detail.timelineTitle')}</h2>
        {o.events.length === 0 ? (
          <p className="mt-1 text-sm text-ink/60">{t('buyer.detail.noEvents')}</p>
        ) : (
          <ol className="mt-3 border-l-2 border-mustard pl-4">
            {o.events.map((e) => (
              <li key={e.id} className="relative pb-3 last:pb-0">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-chilli" />
                <p className="font-semibold">{t(`buyer.status.${e.status}`)}</p>
                <p className="text-xs text-ink/60">{formatDateTime(e.created_at)}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {manual && <BillingPanel orderId={o.id} unpaid={o.status === 'placed'} />}

      <Card>
        <h2 className="font-heading font-bold">{t('buyer.detail.paymentTitle')}</h2>
        <p className="mt-1 text-sm" data-testid="payment-status">
          {o.payment_status ? t(`buyer.detail.payment.${o.payment_status}`) : t('buyer.detail.payment.none')}
          {o.payment_channel ? ` · ${t(`buyer.pay.method.${o.payment_channel}`)}` : ''}
        </p>
        {o.paid_at && <p className="text-xs text-ink/60">{formatDateTime(o.paid_at)}</p>}
      </Card>

      <Card>
        <div id="invoice" className="scroll-mt-4">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-bold">{t('buyer.detail.invoiceTitle')}</h2>
            {paid && (
              <button
                type="button"
                onClick={() => window.print()}
                className="text-sm font-semibold text-chilli print:hidden"
              >
                {t('buyer.detail.invoicePrint')}
              </button>
            )}
          </div>
          <p className="text-xs text-ink/60">
            {t('buyer.detail.invoiceMeta', { number: o.number, date: formatDate(o.placed_at) })}
          </p>
          <dl className="mt-2 divide-y divide-ink/10 text-sm">
            <Line
              label={t('buyer.lines.birds', { n: o.quantity, type: t(`buyer.birdType.${o.bird_type}`) })}
              cents={o.total_cents - o.delivery_fee_cents - o.service_fee_cents}
            />
            <Line label={t('buyer.lines.delivery')} cents={o.delivery_fee_cents} />
            <Line label={t('buyer.lines.service')} cents={o.service_fee_cents} />
            <Line label={t('buyer.lines.total')} cents={o.total_cents} strong />
          </dl>
          {!paid && <p className="mt-2 text-xs text-ink/60">{t('buyer.detail.invoiceUnpaid')}</p>}
          <p className="sr-only">{formatCents(o.total_cents)}</p>
        </div>
      </Card>

      <Card>
        <h2 className="font-heading font-bold">{t('buyer.detail.helpTitle')}</h2>
        <p className="mt-1 text-sm text-ink/70">{t('buyer.detail.helpBody')}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link to={`/orders/${o.id}/problem`} className="font-semibold text-chilli">
            {t('buyer.detail.reportProblem')}
          </Link>
          {o.case_id && (
            <Link to={`/cases/${o.case_id}`} className="font-semibold text-chilli">
              {t('buyer.detail.viewCase')}
            </Link>
          )}
        </div>
      </Card>
    </div>
  );
}
