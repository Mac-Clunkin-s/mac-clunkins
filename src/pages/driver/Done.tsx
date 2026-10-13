import { Link, useParams } from 'react-router-dom';
import { DashboardShell } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { formatCents } from '../../lib/format';
import { useSupabaseQuery } from '../../lib/useQuery';
import { Stat } from '../supplier-driver-shared/ui';
import { t } from '../supplier-driver-shared/t';
import { DriverNav } from './DriverNav';
import { listTrips } from './data';
import { currentTrip, earnedOn } from './earned';
import type { DriverTrip } from './types';

export default function DriverDone() {
  const { id = '' } = useParams();
  const { data, loading, error } = useSupabaseQuery<DriverTrip[]>(() => listTrips(), [id]);
  const trip = data?.find((x) => x.id === id);
  const next = data ? currentTrip(data.filter((x) => x.id !== id)) : null;

  return (
    <DashboardShell roleLabel={t('driver.role')}>
      <DriverNav />
      {loading && <PageSpinner label={t('common.loading')} />}
      {error && <FormError message={error.message} />}
      {trip && (
        <div className="mx-auto max-w-xl text-center">
          <h1 className="font-heading text-3xl font-bold">{t('driver.done.title')}</h1>
          <p className="mt-1 font-body text-ink/60">{t('driver.done.subtitle')}</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            {/* driver_share_cents is already 85% of the delivery fee, computed server-side. */}
            <Stat label={t('driver.done.fee_earned')} value={formatCents(trip.driver_share_cents)} tone="chilli" />
            <Stat label={t('driver.done.today_total')} value={formatCents(earnedOn(data ?? [], new Date()))} />
          </div>
          <div className="mt-6 flex flex-col gap-3">
            {next ? (
              <Link to="/driver/trips" className="inline-flex min-h-16 items-center justify-center rounded-full bg-chilli font-body text-lg font-semibold text-cream">
                {t('driver.done.next_trip')}
              </Link>
            ) : (
              <p className="font-body text-ink/60">{t('driver.done.no_next')}</p>
            )}
            <Link to="/driver/earnings" className="inline-flex min-h-14 items-center justify-center font-body font-semibold underline">
              {t('driver.done.see_earnings')}
            </Link>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
