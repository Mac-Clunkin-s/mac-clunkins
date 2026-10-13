import { useEffect, useState } from 'react';
import { DashboardShell } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError, TextField } from '../../components/FormField';
import { Button } from '../../components/Button';
import { useAuth } from '../../auth/AuthContext';
import { useSupabaseQuery } from '../../lib/useQuery';
import { Card, Check, NumberField } from '../supplier-driver-shared/ui';
import { t } from '../supplier-driver-shared/t';
import { SupplierNav } from './SupplierNav';
import { getRequirements, saveRequirements } from './data';
import type { Requirements } from './types';

const EMPTY: Requirements = {
  crate_spec: '',
  max_per_crate: null,
  max_per_crate_hot: null,
  covered_vehicle: true,
  loading_window: '',
  collection_point: '',
  disinfection_photo: true,
  no_other_farm_same_day: false,
  max_journey_hours: null,
};

const num = (s: string) => (s === '' ? null : Number(s));

export default function SupplierRequirements() {
  const { profile } = useAuth();
  const { data, loading, error } = useSupabaseQuery<Requirements>(() => getRequirements(), []);
  const [r, setR] = useState<Requirements>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setR({ ...EMPTY, ...data });
  }, [data]);

  const set = <K extends keyof Requirements>(k: K, v: Requirements[K]) => setR((x) => ({ ...x, [k]: v }));

  async function save() {
    if (!profile) return;
    setMsg(null);
    setSaved(false);
    if (r.max_per_crate && r.max_per_crate_hot && r.max_per_crate_hot > r.max_per_crate) {
      setMsg(t('supplier.req.hot_exceeds'));
      return;
    }
    const { error: e } = await saveRequirements(profile.id, r);
    if (e) setMsg(e.message);
    else setSaved(true);
  }

  return (
    <DashboardShell roleLabel={t('supplier.role')}>
      <SupplierNav />
      <h1 className="font-heading text-2xl font-bold">{t('supplier.req.title')}</h1>
      <p className="mt-1 font-body text-sm text-ink/60">{t('supplier.req.subtitle')}</p>
      {loading && <PageSpinner label={t('common.loading')} />}
      {error && <FormError message={error.message} />}
      <FormError message={msg} />
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title={t('supplier.req.crates_title')}>
          <div className="flex flex-col gap-3">
            <TextField id="crate_spec" label={t('supplier.req.crate_spec')} value={r.crate_spec ?? ''} onChange={(e) => set('crate_spec', e.target.value)} />
            <NumberField id="mpc" min={1} label={t('supplier.req.max_per_crate')} value={r.max_per_crate?.toString() ?? ''} onChange={(v) => set('max_per_crate', num(v))} />
            <NumberField id="mpch" min={1} label={t('supplier.req.max_per_crate_hot')} value={r.max_per_crate_hot?.toString() ?? ''} onChange={(v) => set('max_per_crate_hot', num(v))} />
          </div>
        </Card>
        <Card title={t('supplier.req.collection_title')}>
          <div className="flex flex-col gap-3">
            <TextField id="window" label={t('supplier.req.loading_window')} placeholder="05:00 - 08:00" value={r.loading_window ?? ''} onChange={(e) => set('loading_window', e.target.value)} />
            <TextField id="point" label={t('supplier.req.collection_point')} value={r.collection_point ?? ''} onChange={(e) => set('collection_point', e.target.value)} />
            <NumberField id="journey" min={0} step={0.5} label={t('supplier.req.max_journey_hours')} value={r.max_journey_hours?.toString() ?? ''} onChange={(v) => set('max_journey_hours', num(v))} />
          </div>
        </Card>
        <Card title={t('supplier.req.rules_title')}>
          <Check id="covered" label={t('supplier.req.covered_vehicle')} checked={r.covered_vehicle} onChange={(v) => set('covered_vehicle', v)} />
          <Check id="disinfect" label={t('supplier.req.disinfection_photo')} checked={r.disinfection_photo} onChange={(v) => set('disinfection_photo', v)} />
          <Check id="nofarm" label={t('supplier.req.no_other_farm')} checked={r.no_other_farm_same_day} onChange={(v) => set('no_other_farm_same_day', v)} />
        </Card>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button className="min-h-12" onClick={() => void save()}>{t('common.save')}</Button>
        {saved && <span role="status" className="font-body text-sm text-green-700">{t('common.saved')}</span>}
      </div>
    </DashboardShell>
  );
}
