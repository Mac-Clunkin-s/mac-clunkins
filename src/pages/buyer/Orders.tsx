import { DashboardShell, EmptyState } from '../../components/DashboardShell';
import { PageSpinner } from '../../components/PageSpinner';
import { FormError } from '../../components/FormField';
import { formatCents, formatStatus } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useSupabaseQuery } from '../../lib/useQuery';

interface OrderRow {
  id: string;
  number: string;
  bird_type: string;
  quantity: number;
  total_cents: number;
  status: string;
  delivery_date: string | null;
}

export default function BuyerOrders() {
  const { data: orders, loading, error } = useSupabaseQuery<OrderRow[]>(
    () =>
      supabase
        .from('orders')
        .select('id, number, bird_type, quantity, total_cents, status, delivery_date')
        .order('placed_at', { ascending: false }),
    [],
  );

  return (
    <DashboardShell roleLabel="Buyer">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold">My orders</h1>
        <button
          type="button"
          disabled
          title="Ordering opens in Phase 2"
          className="rounded-full bg-chilli/40 px-5 py-2.5 font-body font-semibold text-cream"
        >
          New order
        </button>
      </div>

      <div className="mt-6">
        {loading && <PageSpinner label="Loading your orders…" />}
        {error && <FormError message={`Couldn't load orders: ${error.message}`} />}
        {!loading && !error && orders && orders.length === 0 && (
          <EmptyState
            title="No orders yet"
            body="Once ordering opens in Phase 2, your live chicken orders will show up here."
          />
        )}
        {!loading && !error && orders && orders.length > 0 && (
          <ul className="flex flex-col gap-3">
            {orders.map((order) => (
              <li
                key={order.id}
                className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"
              >
                <div>
                  <p className="font-heading font-bold">{order.number}</p>
                  <p className="font-body text-sm text-ink/60">
                    {order.quantity} &times; {formatStatus(order.bird_type)}
                    {order.delivery_date ? ` · ${order.delivery_date}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold">{formatCents(order.total_cents)}</p>
                  <p className="font-body text-xs uppercase tracking-wide text-chilli">
                    {formatStatus(order.status)}
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
