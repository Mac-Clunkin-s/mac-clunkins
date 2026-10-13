import { Link, Navigate, useParams } from 'react-router-dom';
import { PageSpinner } from '../../components/PageSpinner';
import { getOrder } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { useAsync } from './hooks/useAsync';
import { usePayState } from './hooks/usePayState';
import { t } from './i18n-shim';

/** Payment received. The page shows success ONLY when the server reports it (usePayState polls). */
export default function PaymentPaid() {
  const { id = '' } = useParams();
  const { verdict } = usePayState(id);
  const order = useAsync(() => getOrder(id), [id, verdict === 'paid']);

  if (verdict === 'failed') return <Navigate to={`/orders/${id}/payment-failed`} replace />;

  return (
    <BuyerLayout>
      {verdict === 'checking' && <PageSpinner label={t('buyer.paid.checking')} />}

      {verdict === 'unknown' && (
        <Card className="ring-1 ring-mustard">
          <h1 className="font-heading text-xl font-bold">{t('buyer.paid.unknownTitle')}</h1>
          <p className="mt-2 text-sm text-ink/70">{t('buyer.paid.unknownBody')}</p>
          <Link to={`/orders/${id}`} className="mt-3 inline-block font-semibold text-chilli">
            {t('buyer.paid.viewOrder')}
          </Link>
        </Card>
      )}

      {verdict === 'paid' && (
        <div className="flex flex-col gap-4">
          <Card className="text-center">
            <p aria-hidden="true" className="text-4xl">
              &#10003;
            </p>
            <h1 className="mt-2 font-heading text-2xl font-bold">{t('buyer.paid.title')}</h1>
            {order.data && (
              <p className="mt-1 text-ink/70">{t('buyer.paid.orderNumber', { number: order.data.number })}</p>
            )}
          </Card>
          <Card>
            <h2 className="font-heading font-bold">{t('buyer.paid.nextTitle')}</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-ink/80">
              <li>{t('buyer.paid.next1')}</li>
              <li>{t('buyer.paid.next2')}</li>
              <li>{t('buyer.paid.next3')}</li>
            </ol>
          </Card>
          <div className="flex flex-wrap gap-4">
            <Link to={`/orders/${id}`} className="rounded-full bg-chilli px-5 py-2.5 font-semibold text-cream">
              {t('buyer.paid.viewOrder')}
            </Link>
            <Link to={`/orders/${id}#invoice`} className="rounded-full px-5 py-2.5 font-semibold ring-1 ring-ink/20">
              {t('buyer.paid.receipt')}
            </Link>
          </div>
        </div>
      )}
    </BuyerLayout>
  );
}
