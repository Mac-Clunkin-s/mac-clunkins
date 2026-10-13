import { Link, Navigate, useParams } from 'react-router-dom';
import { PageSpinner } from '../../components/PageSpinner';
import { getOrder } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { useAsync } from './hooks/useAsync';
import { t } from './i18n-shim';

export default function PaymentFailed() {
  const { id = '' } = useParams();
  const { data: order, loading } = useAsync(() => getOrder(id), [id]);

  // If the server actually says it was paid (e.g. the webhook landed late), do not tell the buyer it failed.
  if (order && order.payment_status === 'succeeded') return <Navigate to={`/orders/${id}/paid`} replace />;

  const retry = order?.quote_id ? `/orders/new/pay?quote=${order.quote_id}` : '/orders/new';

  return (
    <BuyerLayout>
      {loading && <PageSpinner label={t('buyer.failed.loading')} />}
      {!loading && (
        <div className="flex flex-col gap-4">
          <Card className="text-center">
            <h1 className="font-heading text-2xl font-bold">{t('buyer.failed.title')}</h1>
            <p className="mt-2 font-semibold">{t('buyer.failed.notCharged')}</p>
            <p className="mt-1 text-sm text-ink/70">{t('buyer.failed.kept')}</p>
          </Card>
          <div className="flex flex-wrap gap-4">
            <Link to={retry} className="rounded-full bg-chilli px-5 py-2.5 font-semibold text-cream">
              {t('buyer.failed.tryAgain')}
            </Link>
            <Link to="/orders" className="rounded-full px-5 py-2.5 font-semibold ring-1 ring-ink/20">
              {t('buyer.failed.backToOrders')}
            </Link>
          </div>
        </div>
      )}
    </BuyerLayout>
  );
}
