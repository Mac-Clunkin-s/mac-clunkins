import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { Button } from '../../components/Button';
import { useAuth } from '../../auth/AuthContext';
import { useSupabaseQuery } from '../../lib/useQuery';
import { Card, NumberField } from '../supplier-driver-shared/ui';
import { centsToRands, randsToCents } from '../supplier-driver-shared/money';
import { t } from '../supplier-driver-shared/t';
import { SupplierNav } from './SupplierNav';
import { listPrices, upsertPrices } from './data';
import { BIRD_TYPES, WEIGHT_BANDS, type PriceRow } from './types';

export default function SupplierPrices() {
  const { profile } = useAuth();
  const { data, loading, error } = useSupabaseQuery<PriceRow[]>(() => listPrices(), []);
  const [price, setPrice] = useState<Record<string, string>>({});
  const [minOrder, setMinOrder] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const p: Record<string, string> = {};
    const m: Record<string, string> = {};
    for (const r of data) {
      p[`${r.bird_type}|${r.weight_band}`] = centsToRands(r.price_cents);
      m[r.bird_type] = String(r.min_order);
    }
    setPrice(p);
    setMinOrder(m);
  }, [data]);

  async function save() {
    if (!profile) return;
    setMsg(null);
    setSaved(false);
    const rows: PriceRow[] = [];
    for (const [k, v] of Object.entries(price)) {
      if (v === '') continue;
      const cents = randsToCents(v);
      const [bird_type, weight_band] = k.split('|') as [PriceRow['bird_type'], PriceRow['weight_band']];
      const min = Number(minOrder[bird_type] ?? 10);
      if (cents == null || !(min > 0)) {
        setMsg(t('supplier.prices.invalid'));
        return;
      }
      rows.push({ bird_type, weight_band, price_cents: cents, min_order: min, active: true });
    }
    const { error: e } = await upsertPrices(profile.id, rows);
    if (e) setMsg(e.message);
    else setSaved(true);
  }

  return (
    <DashboardShell roleLabel={t('supplier.role')}>
      <SupplierNav />
      <h1 className="font-heading text-2xl font-bold">{t('supplier.prices.title')}</h1>
      <p className="mt-1 font-body text-sm text-ink/60">{t('supplier.prices.subtitle')}</p>
      {loading && <PageSpinner label={t('common.loading')} />}
      {error && <FormError message={error.message} />}
      <FormError message={msg} />
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {BIRD_TYPES.map((b) => (
          <Card key={b} title={t(`bird.${b}`)}>
            <div className="flex flex-col gap-3">
              {WEIGHT_BANDS.map((w) => (
                <NumberField
                  key={w}
                  id={`price-${b}-${w}`}
                  step={0.01}
                  label={t('supplier.prices.per_bird', { band: t(`band.${w}`) })}
                  value={price[`${b}|${w}`] ?? ''}
                  onChange={(v) => setPrice((p) => ({ ...p, [`${b}|${w}`]: v }))}
                />
              ))}
              <NumberField
                id={`min-${b}`}
                min={1}
                label={t('supplier.prices.min_order')}
                value={minOrder[b] ?? ''}
                onChange={(v) => setMinOrder((m) => ({ ...m, [b]: v }))}
              />
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button className="min-h-12" onClick={() => void save()}>
          {t('common.save')}
        </Button>
        {saved && <span role="status" className="font-body text-sm text-green-700">{t('common.saved')}</span>}
      </div>
    </DashboardShell>
  );
}
