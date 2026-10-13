import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardShell } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { Button } from '../../components/Button';
import { useAuth } from '../../auth/AuthContext';
import { useSupabaseQuery } from '../../lib/useQuery';
import { Card, NumberField } from '../supplier-driver-shared/ui';
import { t } from '../supplier-driver-shared/t';
import { SupplierNav } from './SupplierNav';
import { weekStartISO } from './logic';
import { listStock, upsertStock } from './data';
import { BIRD_TYPES, type StockRow } from './types';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export default function SupplierStock() {
  const { profile } = useAuth();
  const now = new Date();
  const weeks = [weekStartISO(now), weekStartISO(now, 1)];
  const { data, loading, error } = useSupabaseQuery<StockRow[]>(() => listStock(weeks), []);
  const [form, setForm] = useState<Record<string, { birds: string; days: string[] }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!data) return;
    const next: typeof form = {};
    for (const w of weeks) {
      for (const b of BIRD_TYPES) {
        const row = data.find((r) => r.week_start === w && r.bird_type === b);
        next[`${w}|${b}`] = { birds: row ? String(row.birds_available) : '', days: row?.load_days ?? [] };
      }
    }
    setForm(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function save() {
    if (!profile) return;
    setMsg(null);
    setSaved(false);
    const rows: StockRow[] = Object.entries(form)
      .filter(([, v]) => v.birds !== '')
      .map(([k, v]) => {
        const [week_start, bird_type] = k.split('|');
        return {
          week_start,
          bird_type: bird_type as StockRow['bird_type'],
          birds_available: Math.max(0, Number(v.birds) || 0),
          avg_weight_kg: null,
          load_days: v.days,
        };
      });
    const { error: e } = await upsertStock(profile.id, rows);
    if (e) setMsg(e.message);
    else setSaved(true);
  }

  return (
    <DashboardShell roleLabel={t('supplier.role')}>
      <SupplierNav />
      <h1 className="font-heading text-2xl font-bold">{t('supplier.stock.title')}</h1>
      <p className="mt-1 font-body text-sm text-ink/60">{t('supplier.stock.subtitle')}</p>
      {loading && <PageSpinner label={t('common.loading')} />}
      {error && <FormError message={error.message} />}
      <FormError message={msg} />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {weeks.map((w, i) => (
          <Card key={w} title={t(i === 0 ? 'supplier.stock.this_week' : 'supplier.stock.next_week', { date: w })}>
            {BIRD_TYPES.map((b) => {
              const key = `${w}|${b}`;
              const v = form[key] ?? { birds: '', days: [] };
              return (
                <div key={b} className="mb-4 border-b border-ink/10 pb-4 last:mb-0 last:border-0 last:pb-0">
                  <NumberField
                    id={`stock-${key}`}
                    label={t('supplier.stock.birds_available', { type: t(`bird.${b}`) })}
                    value={v.birds}
                    onChange={(birds) => setForm((f) => ({ ...f, [key]: { ...v, birds } }))}
                  />
                  <p className="mt-2 font-body text-xs uppercase tracking-wide text-ink/60">{t('supplier.stock.loading_days')}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {DAYS.map((d) => {
                      const on = v.days.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setForm((f) => ({ ...f, [key]: { ...v, days: on ? v.days.filter((x) => x !== d) : [...v.days, d] } }))
                          }
                          className={`min-h-12 min-w-12 rounded-full px-3 font-body text-sm font-semibold ${on ? 'bg-chilli text-cream' : 'bg-cream'}`}
                        >
                          {t(`day.${d}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </Card>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button className="min-h-12" onClick={() => void save()}>
          {t('common.save')}
        </Button>
        {saved && <span role="status" className="font-body text-sm text-green-700">{t('common.saved')}</span>}
        <Link to="/supplier/prices" className="font-body text-sm font-semibold text-chilli underline">{t('supplier.stock.link_prices')}</Link>
        <Link to="/supplier/requirements" className="font-body text-sm font-semibold text-chilli underline">{t('supplier.stock.link_requirements')}</Link>
      </div>
    </DashboardShell>
  );
}
