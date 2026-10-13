import { Link } from 'react-router-dom';
import { loadDashboard } from './api';
import { useAdminData } from './hooks/useAdminData';
import { orderMoney } from './logic/orderMoney';
import { ORDER_STATUSES } from './types';
import { t } from './i18n';
import { AdminLayout, DataTable, LoadState, Money, Pill, SectionTitle, card, tStatus, formatDateTime } from './ui';

const PAID_STATES = ['paid', 'scheduled', 'ready', 'on_the_way', 'delivered', 'settled'];

export default function AdminDashboard() {
  const { data, loading, error } = useAdminData(loadDashboard, []);

  const paidToday = (data?.todayOrders ?? []).filter((o) => PAID_STATES.includes(o.status));
  const sales = paidToday.reduce((s, o) => s + o.total_cents, 0);
  let margin = 0;
  for (const o of paidToday) {
    const allocs = (data?.allocations ?? []).filter((a) => a.order_id === o.id);
    const m = orderMoney(
      o, allocs,
      (data?.trips ?? []).filter((tr) => allocs.some((a) => a.id === tr.allocation_id)),
      (data?.payments ?? []).filter((p) => p.order_id === o.id),
    );
    if (!m.incomplete) margin += m.breakdown.marginCents;
  }
  const action = (data?.needsAction ?? []).filter((n) => n.count > 0);

  return (
    <AdminLayout title={t('admin.dashboard.title')} subtitle={t('admin.dashboard.subtitle')}>
      <LoadState loading={loading} error={error} hasData={!!data} label={t('admin.dashboard.loading')}>
        {data && (
          <div className="flex flex-col gap-6">
            <section aria-label={t('admin.dashboard.needsAction')} className={card}>
              <SectionTitle>{t('admin.dashboard.needsAction')}</SectionTitle>
              {action.length === 0 ? (
                <p className="font-body text-sm text-ink/60">{t('admin.dashboard.allClear')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {action.map((n) => (
                    <li key={n.key}>
                      <Link to={n.to} className="flex items-center justify-between rounded-xl bg-cream px-4 py-3 font-body text-sm font-semibold hover:bg-mustard/20">
                        <span>{t(`admin.dashboard.action.${n.key}`)}</span>
                        <span className="rounded-full bg-chilli px-2.5 py-0.5 text-cream">{n.count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-4">
              {[
                { label: t('admin.dashboard.ordersToday'), value: String(data.todayOrders.length) },
                { label: t('admin.dashboard.salesToday'), value: <Money cents={sales} /> },
                { label: t('admin.dashboard.marginToday'), value: <Money cents={margin} /> },
                { label: t('admin.dashboard.transfersQueued'), value: <><span>{data.transfersQueued.count}</span> &middot; <Money cents={data.transfersQueued.cents} /></> },
              ].map((tile) => (
                <div key={tile.label} className={card}>
                  <p className="font-heading text-2xl font-extrabold text-chilli">{tile.value}</p>
                  <p className="mt-1 font-body text-sm text-ink/60">{tile.label}</p>
                </div>
              ))}
            </div>

            <section className="hidden md:block">
              <SectionTitle>{t('admin.dashboard.pipeline')}</SectionTitle>
              <div className="grid grid-cols-3 gap-3 lg:grid-cols-9">
                {ORDER_STATUSES.map((s) => (
                  <Link key={s} to={`/admin/orders?status=${s}`} className={`${card} !p-3 text-center hover:shadow-md`}>
                    <p className="font-heading text-xl font-bold">{data.pipeline[s] ?? 0}</p>
                    <p className="font-body text-xs text-ink/60">{tStatus('order', s)}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="hidden md:block">
              <SectionTitle>{t('admin.dashboard.todayOrders')}</SectionTitle>
              <DataTable
                rows={data.todayOrders}
                rowKey={(o) => o.id}
                columns={[
                  { key: 'n', header: t('admin.orders.col.number'), render: (o) => <Link className="font-semibold text-chilli hover:underline" to={`/admin/orders/${o.id}`}>{o.number}</Link> },
                  { key: 'b', header: t('admin.orders.col.buyer'), render: (o) => o.buyer?.business_name ?? o.buyer?.full_name ?? '-' },
                  { key: 'q', header: t('admin.orders.col.birds'), render: (o) => o.quantity },
                  { key: 't', header: t('admin.orders.col.total'), render: (o) => <Money cents={o.total_cents} /> },
                  { key: 's', header: t('admin.orders.col.status'), render: (o) => <Pill>{tStatus('order', o.status)}</Pill> },
                  { key: 'p', header: t('admin.orders.col.placed'), render: (o) => formatDateTime(o.placed_at) },
                ]}
              />
            </section>
          </div>
        )}
      </LoadState>
    </AdminLayout>
  );
}
