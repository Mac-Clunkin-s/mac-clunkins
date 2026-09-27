import { DashboardShell, EmptyState } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { formatCents, formatStatus } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useSupabaseQuery } from '../../lib/useQuery';

interface AllocationRow {
  id: string;
  quantity: number;
  supplier_price_cents: number;
  status: string;
  pickup_at: string | null;
}

export default function SupplierJobs() {
  const { data: jobs, loading, error } = useSupabaseQuery<AllocationRow[]>(
    () =>
      supabase
        .from('allocations')
        .select('id, quantity, supplier_price_cents, status, pickup_at')
        .order('created_at', { ascending: false }),
    [],
  );

  return (
    <DashboardShell roleLabel="Supplier">
      <h1 className="font-heading text-2xl font-bold">Jobs</h1>
      <p className="mt-1 font-body text-sm text-ink/60">
        Quantity and your agreed price only &mdash; buyer details never appear here.
      </p>

      <div className="mt-6">
        {loading && <PageSpinner label="Loading your jobs…" />}
        {error && <FormError message={`Couldn't load jobs: ${error.message}`} />}
        {!loading && !error && jobs && jobs.length === 0 && (
          <EmptyState
            title="No jobs yet"
            body="Jobs appear here once an admin allocates you an order to fulfil."
          />
        )}
        {!loading && !error && jobs && jobs.length > 0 && (
          <ul className="flex flex-col gap-3">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-heading font-bold">{job.quantity} birds</p>
                  <p className="font-body text-sm text-ink/60">
                    {job.pickup_at ? `Pickup ${new Date(job.pickup_at).toLocaleString('en-ZA')}` : 'Pickup time not set'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold">{formatCents(job.supplier_price_cents * job.quantity)}</p>
                  <p className="font-body text-xs uppercase tracking-wide text-chilli">
                    {formatStatus(job.status)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
