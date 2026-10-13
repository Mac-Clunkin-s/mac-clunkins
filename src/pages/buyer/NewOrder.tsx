import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { FormError, SelectField, TextField } from '../../components/FormField';
import { formatCents } from '../../lib/format';
import { createInstantQuote, listAddresses, listOrders, listProvinces, requestCustomQuote, saveAddress } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { CountdownBadge } from './components/CountdownBadge';
import { QuoteLines } from './components/LineItems';
import { StatusBadge } from './components/StatusBadge';
import { useAsync } from './hooks/useAsync';
import { useNow } from './hooks/useNow';
import { t } from './i18n-shim';
import { formatDate } from './lib/dates';
import { IN_PROGRESS } from './lib/orderFilters';
import {
  BIRD_TYPES,
  MAX_INSTANT_KM,
  MAX_INSTANT_QUANTITY,
  MIN_QUANTITY,
  WEIGHT_BANDS,
  exceedsInstantLimit,
  remainingMs,
  validateQuoteForm,
  type QuoteFormErrors,
} from './lib/quote';
import type { BirdType, BuyerQuote, NewAddressInput, WeightBand } from './types';

const NEW = 'new';
type RequestReason = 'no_match' | 'too_far' | 'too_many';

export default function NewOrder() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const provinces = useAsync(listProvinces, []);
  const addresses = useAsync(listAddresses, []);
  const orders = useAsync(listOrders, []);

  const [birdType, setBirdType] = useState<BirdType | ''>('');
  const [weightBand, setWeightBand] = useState<WeightBand | ''>('');
  const [quantity, setQuantity] = useState('');
  const [addressChoice, setAddressChoice] = useState<string>(NEW);
  const [newAddress, setNewAddress] = useState<NewAddressInput>({ province: '', town: '', street: '' });
  const [errors, setErrors] = useState<QuoteFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<BuyerQuote | null>(null);
  const [requestReason, setRequestReason] = useState<RequestReason | null>(null);
  const [requested, setRequested] = useState(false);
  const lastRequest = useRef<{ addressId: string; qty: number } | null>(null);
  const now = useNow();

  // Default to the buyer's default saved address once loaded.
  const defaulted = useRef(false);
  useEffect(() => {
    if (defaulted.current || !addresses.data) return;
    defaulted.current = true;
    const d = addresses.data.find((a) => a.is_default) ?? addresses.data[0];
    if (d) setAddressChoice(d.id);
  }, [addresses.data]);

  // Reorder: /orders/new?reorder=<order id> pre-fills the form from a past order.
  const reorderId = params.get('reorder');
  const prefilled = useRef(false);
  useEffect(() => {
    if (!reorderId || prefilled.current || !orders.data || !addresses.data) return;
    const o = orders.data.find((x) => x.id === reorderId);
    if (!o) return;
    prefilled.current = true;
    setBirdType(o.bird_type);
    setWeightBand(o.weight_band);
    setQuantity(String(o.quantity));
    if (o.address_id && addresses.data.some((a) => a.id === o.address_id)) setAddressChoice(o.address_id);
  }, [reorderId, orders.data, addresses.data]);

  const quoteExpired = quote ? remainingMs(quote.expires_at, now) === 0 : false;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setServerError(null);
    setRequestReason(null);
    const errs = validateQuoteForm({
      birdType,
      weightBand,
      quantity,
      addressId: addressChoice === NEW ? '' : addressChoice,
      newAddress: addressChoice === NEW ? newAddress : null,
    });
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !profile || !birdType || !weightBand) return;

    const qty = Number(quantity);
    setBusy(true);
    try {
      let addressId = addressChoice;
      if (addressChoice === NEW) {
        addressId = await saveAddress(profile.id, newAddress, provinces.data ?? []);
        addresses.reload();
        setAddressChoice(addressId); // never save the same address twice on retry
      }
      lastRequest.current = { addressId, qty };
      if (exceedsInstantLimit(qty)) {
        setRequestReason('too_many');
        return;
      }
      const out = await createInstantQuote({ birdType, weightBand, quantity: qty, addressId });
      if (out.kind === 'quote') setQuote(out.quote);
      else setRequestReason(out.reason);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRequestQuote() {
    if (!birdType || !weightBand || !lastRequest.current) return;
    setBusy(true);
    setServerError(null);
    try {
      await requestCustomQuote({
        birdType,
        weightBand,
        quantity: lastRequest.current.qty,
        addressId: lastRequest.current.addressId,
      });
      setRequested(true);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const recent = (orders.data ?? []).slice(0, 3);
  const lastDelivered = (orders.data ?? []).find((o) => o.status === 'delivered' || o.status === 'settled');
  const today = new Date().toISOString().slice(0, 10);
  const todays = (orders.data ?? []).filter(
    (o) => o.delivery_date === today && IN_PROGRESS.includes(o.status),
  );

  const err = (k: keyof QuoteFormErrors) =>
    errors[k] ? (
      <p role="alert" className="mt-1 text-sm text-chilli">
        {t(errors[k] as string, { min: MIN_QUANTITY })}
      </p>
    ) : null;

  return (
    <BuyerLayout wide>
      <h1 className="mb-5 font-heading text-2xl font-bold">{t('buyer.newOrder.title')}</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          {/* Desktop-only extras sit above the form on wide screens */}
          {lastDelivered && (
            <Card className="hidden items-center justify-between gap-3 lg:flex">
              <div>
                <p className="font-heading font-bold">{t('buyer.newOrder.reorderTitle')}</p>
                <p className="text-sm text-ink/60">
                  {t('buyer.orders.birdsLine', {
                    n: lastDelivered.quantity,
                    type: t(`buyer.birdType.${lastDelivered.bird_type}`),
                  })}
                </p>
              </div>
              <Link
                to={`/orders/new?reorder=${lastDelivered.id}`}
                className="rounded-full bg-mustard px-4 py-2 font-semibold text-ink"
              >
                {t('buyer.orders.reorder')}
              </Link>
            </Card>
          )}

          <Card>
            <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-4">
              <div>
                <SelectField
                  id="birdType"
                  label={t('buyer.newOrder.birdType')}
                  value={birdType}
                  onChange={(e) => setBirdType(e.target.value as BirdType | '')}
                >
                  <option value="">{t('buyer.newOrder.choose')}</option>
                  {BIRD_TYPES.map((b) => (
                    <option key={b} value={b}>
                      {t(`buyer.birdType.${b}`)}
                    </option>
                  ))}
                </SelectField>
                {err('birdType')}
              </div>
              <div>
                <SelectField
                  id="weightBand"
                  label={t('buyer.newOrder.weightBand')}
                  value={weightBand}
                  onChange={(e) => setWeightBand(e.target.value as WeightBand | '')}
                >
                  <option value="">{t('buyer.newOrder.choose')}</option>
                  {WEIGHT_BANDS.map((w) => (
                    <option key={w} value={w}>
                      {t(`buyer.weightBand.${w}`)}
                    </option>
                  ))}
                </SelectField>
                {err('weightBand')}
              </div>
              <div>
                <TextField
                  id="quantity"
                  label={t('buyer.newOrder.quantity', { min: MIN_QUANTITY })}
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
                {err('quantity')}
              </div>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 text-sm font-medium text-ink/80">{t('buyer.newOrder.address')}</legend>
                <SelectField
                  id="addressChoice"
                  label={t('buyer.newOrder.savedAddress')}
                  value={addressChoice}
                  onChange={(e) => setAddressChoice(e.target.value)}
                >
                  {(addresses.data ?? []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.label ? `${a.label}: ` : '') + `${a.street}, ${a.town}`}
                    </option>
                  ))}
                  <option value={NEW}>{t('buyer.newOrder.newAddress')}</option>
                </SelectField>
                {addressChoice === NEW && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      id="province"
                      label={t('buyer.newOrder.province')}
                      value={newAddress.province}
                      onChange={(e) => setNewAddress({ ...newAddress, province: e.target.value })}
                    >
                      <option value="">{t('buyer.newOrder.choose')}</option>
                      {(provinces.data ?? []).map((p) => (
                        <option key={p.code} value={p.code}>
                          {p.name}
                        </option>
                      ))}
                    </SelectField>
                    <TextField
                      id="town"
                      label={t('buyer.newOrder.town')}
                      value={newAddress.town}
                      onChange={(e) => setNewAddress({ ...newAddress, town: e.target.value })}
                    />
                    <div className="sm:col-span-2">
                      <TextField
                        id="street"
                        label={t('buyer.newOrder.street')}
                        value={newAddress.street}
                        onChange={(e) => setNewAddress({ ...newAddress, street: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                {err('address')}
              </fieldset>

              <FormError message={serverError} />
              <Button type="submit" disabled={busy}>
                {busy ? t('buyer.newOrder.working') : t('buyer.newOrder.getQuote')}
              </Button>
            </form>
          </Card>

          {requestReason && !requested && (
            <Card className="ring-1 ring-mustard">
              <h2 className="font-heading text-lg font-bold">{t('buyer.newOrder.requestTitle')}</h2>
              <p className="mt-1 text-sm text-ink/70">
                {t(`buyer.newOrder.requestReason.${requestReason}`, {
                  maxBirds: MAX_INSTANT_QUANTITY,
                  maxKm: MAX_INSTANT_KM,
                })}
              </p>
              <Button className="mt-3" disabled={busy} onClick={() => void onRequestQuote()}>
                {t('buyer.newOrder.requestCta')}
              </Button>
            </Card>
          )}
          {requested && (
            <Card className="ring-1 ring-emerald-300">
              <p className="font-semibold">{t('buyer.newOrder.requestedTitle')}</p>
              <p className="mt-1 text-sm text-ink/70">{t('buyer.newOrder.requestedBody')}</p>
              <Link to="/orders" className="mt-3 inline-block font-semibold text-chilli">
                {t('buyer.newOrder.backToOrders')}
              </Link>
            </Card>
          )}

          {quote && (
            <Card className="ring-2 ring-mustard" >
              <h2 className="font-heading text-lg font-bold">{t('buyer.quote.instantTitle')}</h2>
              <div className="mt-2">
                <QuoteLines q={quote} />
              </div>
              <div className="mt-3">
                <CountdownBadge expiresAt={quote.expires_at} />
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  disabled={quoteExpired}
                  onClick={() => navigate(`/orders/new/pay?quote=${quote.id}`)}
                >
                  {t('buyer.quote.continue')}
                </Button>
                {quoteExpired && (
                  <Button variant="secondary" onClick={() => setQuote(null)}>
                    {t('buyer.quote.refresh')}
                  </Button>
                )}
              </div>
              <p className="mt-3 text-xs text-ink/60">{t('buyer.quote.nothingCharged')}</p>
            </Card>
          )}
        </div>

        {/* Desktop side column */}
        <aside className="hidden flex-col gap-4 lg:flex" aria-label={t('buyer.newOrder.sideLabel')}>
          <Card>
            <h2 className="font-heading font-bold">{t('buyer.newOrder.todayTitle')}</h2>
            {todays.length === 0 ? (
              <p className="mt-1 text-sm text-ink/60">{t('buyer.newOrder.todayNone')}</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {todays.map((o) => (
                  <li key={o.id}>
                    <Link to={`/orders/${o.id}/track`} className="flex items-center justify-between text-sm font-semibold hover:text-chilli">
                      <span>{o.number}</span>
                      <StatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="font-heading font-bold">{t('buyer.newOrder.pastTitle')}</h2>
            {recent.length === 0 ? (
              <p className="mt-1 text-sm text-ink/60">{t('buyer.newOrder.pastNone')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-ink/10">
                {recent.map((o) => (
                  <li key={o.id} className="flex items-center justify-between py-2 text-sm">
                    <Link to={`/orders/${o.id}`} className="font-semibold hover:text-chilli">
                      {o.number}
                      <span className="block text-xs font-normal text-ink/60">{formatDate(o.placed_at)}</span>
                    </Link>
                    <span>{formatCents(o.total_cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </BuyerLayout>
  );
}
