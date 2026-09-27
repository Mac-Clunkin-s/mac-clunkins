import { DashboardShell } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { supabase } from '../../lib/supabase';
import { useSupabaseQuery } from '../../lib/useQuery';

interface Counts {
  orders: number;
  pendingAccounts: number;
  allocations: number;
  trips: number;
}

async function loadCounts() {
  const [orders, pending, allocations, trips] = await Promise.all([
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase.from('allocations').select('id', { count: 'exact', head: true }),
    supabase.from('trips').select('id', { count: 'exact', head: true }),
  ]);
  const firstError = orders.error ?? pending.error ?? allocations.error ?? trips.error;
  if (firstError) return { data: null, error: firstError };
  return {
    data: {
      orders: orders.count ?? 0,
      pendingAccounts: pending.count ?? 0,
      allocations: allocations.count ?? 0,
      trips: trips.count ?? 0,
    },
    error: null,
  };
}

export default function AdminDashboard() {
  const { data: counts, loading, error } = useSupabaseQuery<Counts>(loadCounts, []);

  const tiles: { label: string; value: number | undefined }[] = [
    { label: 'Orders', value: counts?.orders },
    { label: 'Accounts pending approval', value: counts?.pendingAccounts },
    { label: 'Allocations', value: counts?.allocations },
    { label: 'Trips', value: counts?.trips },
  ];

  return (
    <DashboardShell roleLabel="Admin">
      <h1 className="font-heading text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 font-body text-sm text-ink/60">
        The only role that reads every order, party and money figure.
      </p>

      <div className="mt-6">
        {loading && <PageSpinner label="Loading dashboard…" />}
        {error && <FormError message={`Couldn't load dashboard data: ${error.message}`} />}
        {!loading && !error && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {tiles.map((tile) => (
              <div key={tile.label} className="rounded-2xl bg-white p-5 shadow-sm">
                <p className="font-heading text-3xl font-extrabold text-chilli">{tile.value}</p>
                <p className="mt-1 font-body text-sm text-ink/60">{tile.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
