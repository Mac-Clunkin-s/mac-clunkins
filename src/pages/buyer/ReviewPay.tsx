import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormError } from '../../components/FormField';
import { PageSpinner } from '../../components/PageSpinner';
import { issueQuoteDocument, openBillingPdf, usePaymentsMode } from '../../lib/billing';
import { supabase } from '../../lib/supabase';
import { getQuote } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { CountdownBadge } from './components/CountdownBadge';
import { QuoteLines } from './components/LineItems';
import { useAsync } from './hooks/useAsync';
import { useNow } from './hooks/useNow';
import { t } from './i18n-shim';
import { PAYMENT_METHODS, redirectToCheckout, startCheckout } from './lib/payments';
import { remainingMs } from './lib/quote';

export default function ReviewPay() {
  const [params] = useSearchParams();
  const quoteId = params.get('quote') ?? '';
  const { data: quote, loading, error } = useAsync(() => getQuote(quoteId), [quoteId]);
  const now = useNow();
  const navigate = useNavigate();
  const { mode, ready } = usePaymentsMode();
  const manual = mode === 'manual';
  const [terms, setTerms] = useState(false);
  const [refunds, setRefunds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const expired = !!quote && quote.expires_at !== null && remainingMs(quote.expires_at, now) === 0;
  const payable = !!quote && quote.status === 'open' && !expired;

  async function onPlaceOrder() {
    if (!quote) return;
    setPayError(null);
    setBusy(true);
    const { data, error: rpcError } = await supabase.rpc('accept_quote_create_order', { p_quote_id: quote.id });
    const orderId = (data as { order_id?: string } | null)?.order_id;
    if (rpcError || !orderId) {
      setPayError(t('buyer.billing.placeError'));
      setBusy(false);
      return;
    }
    navigate(`/orders/${orderId}`);
  }

  async function onQuotePdf() {
    if (!quote) return;
    try { await openBillingPdf(await issueQuoteDocument(quote.id)); } catch { setPayError(t('buyer.billing.error')); }
  }

  async function onPay() {
    if (!quote) return;
    if (manual) { await onPlaceOrder(); return; }
    setPayError(null);
    setBusy(true);
    try {
      const { authorizationUrl } = await startCheckout(quote.id);
      // We only hand the buyer to Paystack. Whether they paid is decided server-side (webhook)
      // and read back on /orders/:id/paid. Nothing here marks anything paid.
      setRedirecting(true);
      redirectToCheckout(authorizationUrl);
    } catch {
      setPayError(t('buyer.pay.initError'));
      setBusy(false);
    }
  }

  return (
    <BuyerLayout>
      <h1 className="mb-5 font-heading text-2xl font-bold">{t('buyer.pay.title')}</h1>
      {!quoteId && <FormError message={t('buyer.pay.noQuote')} />}
      {quoteId && loading && <PageSpinner label={t('buyer.pay.loading')} />}
      <FormError message={error ? t('buyer.pay.loadError') : null} />

      {quote && (
        <div className="flex flex-col gap-4">
          <Card>
            <QuoteLines q={quote} />
            <div className="mt-3">
              <CountdownBadge expiresAt={quote.expires_at} />
            </div>
          </Card>

          {!payable && (
            <Card className="ring-1 ring-mustard">
              <p className="font-semibold">{t(expired ? 'buyer.pay.expired' : 'buyer.pay.notOpen')}</p>
              <Link to="/orders/new" className="mt-2 inline-block font-semibold text-chilli">
                {t('buyer.pay.newQuote')}
              </Link>
            </Card>
          )}

          {!ready ? (
            <PageSpinner label={t('buyer.pay.loading')} />
          ) : manual ? (
            <Card>
              <p className="text-sm text-ink/70">{t('buyer.billing.manualNote')}</p>
              <button type="button" onClick={() => void onQuotePdf()} className="mt-2 text-sm font-semibold text-chilli">
                {t('buyer.billing.downloadQuote')}
              </button>
            </Card>
          ) : (
          <Card>
            <h2 className="font-heading font-bold">{t('buyer.pay.methodsTitle')}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <li key={m} className="rounded-full bg-ink/5 px-3 py-1 text-sm font-semibold">
                  {t(`buyer.pay.method.${m}`)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink/60">{t('buyer.pay.testMode')}</p>
          </Card>
          )}

          <Card className="flex flex-col gap-3">
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
              <span>
                {t('buyer.pay.acceptTerms')}{' '}
                <Link to="/legal/terms" target="_blank" className="font-semibold text-chilli underline">
                  {t('buyer.pay.termsLink')}
                </Link>
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" checked={refunds} onChange={(e) => setRefunds(e.target.checked)} className="mt-1" />
              <span>
                {t('buyer.pay.acceptRefunds')}{' '}
                <Link to="/legal/refunds" target="_blank" className="font-semibold text-chilli underline">
                  {t('buyer.pay.refundsLink')}
                </Link>
              </span>
            </label>
            <FormError message={payError} />
            <Button disabled={!ready || !payable || !terms || !refunds || busy} onClick={() => void onPay()}>
              {!ready ? t('buyer.pay.loading') : manual ? t(busy ? 'buyer.billing.placing' : 'buyer.billing.placeOrder') : redirecting ? t('buyer.pay.redirecting') : t('buyer.pay.cta')}
            </Button>
            {redirecting && (
              <p role="status" className="text-sm text-ink/70">
                {t('buyer.pay.redirectingBody')}
              </p>
            )}
          </Card>
        </div>
      )}
    </BuyerLayout>
  );
}
