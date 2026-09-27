import { DashboardShell, EmptyState } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { formatCents, formatStatus } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useSupabaseQuery } from '../../lib/useQuery';

interface TripRow {
  id: string;
  delivery_fee_cents: number;
  driver_share_cents: number;
  status: string;
}

export default function DriverTrips() {
  const { data: trips, loading, error } = useSupabaseQuery<TripRow[]>(
    () =>
      supabase
        .from('trips')
        .select('id, delivery_fee_cents, driver_share_cents, status')
        .order('created_at', { ascending: false }),
    [],
  );

  return (
    <DashboardShell roleLabel="Driver">
      <h1 className="font-heading text-2xl font-bold">Today&rsquo;s trips</h1>
      <p className="mt-1 font-body text-sm text-ink/60">
        Pickup and drop-off addresses only &mdash; no prices except your own fee.
      </p>

      <div className="mt-6">
        {loading && <PageSpinner label="Loading your trips…" />}
        {error && <FormError message={`Couldn't load trips: ${error.message}`} />}
        {!loading && !error && trips && trips.length === 0 && (
          <EmptyState
            title="No trips yet"
            body="Your assigned trips will show up here with pickup and drop-off addresses."
          />
        )}
        {!loading && !error && trips && trips.length > 0 && (
          <ul className="flex flex-col gap-3">
            {trips.map((trip) => (
              <li
                key={trip.id}
                className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"
              >
                <p className="font-heading font-bold">{formatStatus(trip.status)}</p>
                <p className="font-heading font-bold text-chilli">
                  {formatCents(trip.driver_share_cents)} fee
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
