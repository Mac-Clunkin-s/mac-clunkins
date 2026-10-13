import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormError } from '../../components/FormField';
import { PageSpinner } from '../../components/PageSpinner';
import { getOrder, getTracking, submitRating } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { useAsync } from './hooks/useAsync';
import { useNow } from './hooks/useNow';
import { t } from './i18n-shim';

export const REPORT_WINDOW_MS = 2 * 60 * 60 * 1000;

export default function Delivered() {
  const { id = '' } = useParams();
  const order = useAsync(() => getOrder(id), [id]);
  const tracking = useAsync(() => getTracking(id), [id]);
  const now = useNow(30_000);
  const [thumbs, setThumbs] = useState<'up' | 'down' | null>(null);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const o = order.data;
  const deliveredAt = o?.events.find((e) => e.status === 'delivered')?.created_at;
  const withinWindow = deliveredAt ? now - new Date(deliveredAt).getTime() <= REPORT_WINDOW_MS : true;
  const existing = o?.rating ?? null;

  async function onRate() {
    if (!thumbs) return;
    setBusy(true);
    setError(null);
    try {
      await submitRating(id, thumbs, comment);
      setSaved(true);
    } catch {
      setError(t('buyer.delivered.rateError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <BuyerLayout>
      <h1 className="mb-5 font-heading text-2xl font-bold">{t('buyer.delivered.title')}</h1>
      {(order.loading || tracking.loading) && <PageSpinner label={t('buyer.delivered.loading')} />}
      <FormError message={order.error ? t('buyer.delivered.loadError') : null} />

      {o && (
        <div className="flex flex-col gap-4">
          <Card>
            <p className="text-sm text-ink/60">{t('buyer.delivered.countTitle')}</p>
            <p className="font-heading text-3xl font-bold" data-testid="delivered-count">
              {tracking.data?.delivered_count ?? o.quantity}
            </p>
            <p className="text-sm text-ink/70">{t('buyer.delivered.countHelp', { n: o.quantity })}</p>
          </Card>

          <Card>
            <h2 className="font-heading font-bold">{t('buyer.delivered.rateTitle')}</h2>
            {existing || saved ? (
              <p className="mt-2 text-sm font-semibold">{t('buyer.delivered.thanks')}</p>
            ) : (
              <>
                <div className="mt-2 flex gap-3" role="group" aria-label={t('buyer.delivered.rateTitle')}>
                  {(['up', 'down'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={thumbs === v}
                      onClick={() => setThumbs(v)}
                      className={`rounded-full px-5 py-2 font-semibold ring-1 ${
                        thumbs === v ? 'bg-ink text-cream ring-ink' : 'ring-ink/20'
                      }`}
                    >
                      {t(`buyer.delivered.thumbs.${v}`)}
                    </button>
                  ))}
                </div>
                <label className="mt-3 flex flex-col gap-1 text-sm">
                  <span className="font-medium text-ink/80">{t('buyer.delivered.comment')}</span>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-2"
                  />
                </label>
                <FormError message={error} />
                <Button className="mt-3" disabled={!thumbs || busy} onClick={() => void onRate()}>
                  {t('buyer.delivered.send')}
                </Button>
              </>
            )}
          </Card>

          <Card>
            <h2 className="font-heading font-bold">{t('buyer.delivered.problemTitle')}</h2>
            {withinWindow ? (
              <>
                <p className="mt-1 text-sm text-ink/70">{t('buyer.delivered.problemBody')}</p>
                <Link to={`/orders/${id}/problem`} className="mt-2 inline-block font-semibold text-chilli">
                  {t('buyer.delivered.report')}
                </Link>
              </>
            ) : (
              <p className="mt-1 text-sm text-ink/70" data-testid="window-closed">
                {t('buyer.delivered.windowClosed')}
              </p>
            )}
          </Card>

          <Link
            to={`/orders/new?reorder=${id}`}
            className="self-start rounded-full bg-chilli px-5 py-2.5 font-semibold text-cream"
          >
            {t('buyer.delivered.orderAgain')}
          </Link>
        </div>
      )}
    </BuyerLayout>
  );
}
