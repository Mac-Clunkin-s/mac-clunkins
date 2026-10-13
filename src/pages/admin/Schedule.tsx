import { useState } from 'react';
import { Link } from 'react-router-dom';
import { loadSchedule } from './api';
import { useAdminData } from './hooks/useAdminData';
import { t } from './i18n';
import { AdminLayout, DataTable, Empty, LoadState, Money, Pill, SectionTitle, card, displayName, formatDate, input } from './ui';

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function AdminSchedule() {
  const [date, setDate] = useState(tomorrow);
  const { data, loading, error } = useAdminData(() => loadSchedule(date), [date]);

  const driverCell = (driverId: string, slotId: string) => {
    if (!data) return [];
    const orderIds = new Set(data.scheduled.filter((o) => o.slot_id === slotId).map((o) => o.id));
    const allocIds = new Set(data.allocations.filter((a) => orderIds.has(a.order_id)).map((a) => a.id));
    return data.trips.filter((tr) => tr.driver_id === driverId && allocIds.has(tr.allocation_id)).map((tr) => {
      const a = data.allocations.find((x) => x.id === tr.allocation_id);
      return data.scheduled.find((o) => o.id === a?.order_id);
    });
  };

  return (
    <AdminLayout
      title={t('admin.schedule.title')}
      subtitle={t('admin.schedule.subtitle')}
      actions={<label className="flex items-center gap-2 font-body text-sm">{t('admin.schedule.date')}<input className={input} type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
    >
      <LoadState loading={loading} error={error} hasData={!!data}>
        {data && (
          <div className="flex flex-col gap-8">
            <section>
              <SectionTitle>{t('admin.schedule.awaiting')}</SectionTitle>
              <DataTable
                rows={data.toSchedule}
                rowKey={(o) => o.id}
                empty={<Empty title={t('admin.schedule.awaitingNone')} />}
                columns={[
                  { key: 'n', header: t('admin.orders.col.number'), render: (o) => <Link className="font-semibold text-chilli hover:underline" to={`/admin/orders/${o.id}`}>{o.number}</Link> },
                  { key: 'b', header: t('admin.orders.col.buyer'), render: (o) => displayName(o.buyer) },
                  { key: 'q', header: t('admin.orders.col.birds'), render: (o) => o.quantity },
                  { key: 'p', header: t('admin.orders.col.province'), render: (o) => o.address?.province ?? '-' },
                  { key: 'd', header: t('admin.schedule.distance'), render: (o) => (o.allocations.length ? o.allocations.map((a) => (a.distance_km !== null ? `${a.distance_km} km` : '-')).join(', ') : t('admin.schedule.noSupplier')) },
                  { key: 'w', header: t('admin.schedule.warnings'), render: (o) => (
                    <span className="flex flex-wrap gap-1">
                      {o.allocations.some((a) => a.crosses_province) && (
                        <Pill tone={o.allocations.some((a) => a.crosses_province && !a.movement_permit_path) ? 'bad' : 'warn'}>
                          {o.allocations.some((a) => a.crosses_province && !a.movement_permit_path) ? t('admin.warn.movementPermit') : t('admin.warn.crossesProvince')}
                        </Pill>
                      )}
                      {o.allocations.some((a) => (data.supplierDetails[a.supplier_id]?.avian_flu_zone ?? 'none') !== 'none') && <Pill tone="bad">{t('admin.warn.birdFlu')}</Pill>}
                    </span>
                  ) },
                  { key: 't', header: t('admin.orders.col.total'), render: (o) => <Money cents={o.total_cents} /> },
                ]}
              />
            </section>

            <section>
              <SectionTitle>{t('admin.schedule.grid', { date: formatDate(date) })}</SectionTitle>
              {data.drivers.length === 0 || data.slots.length === 0 ? <Empty title={t('admin.schedule.gridEmpty')} /> : (
                <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-ink/10 font-body text-sm">
                    <thead><tr><th className="px-3 py-2 text-left">{t('admin.schedule.driver')}</th>{data.slots.map((s) => <th key={s.id} className="px-3 py-2 text-left">{s.label}</th>)}</tr></thead>
                    <tbody className="divide-y divide-ink/5">
                      {data.drivers.map((d) => (
                        <tr key={d.id}>
                          <td className="px-3 py-2 font-semibold">{d.name}</td>
                          {data.slots.map((s) => {
                            const orders = driverCell(d.id, s.id);
                            return (
                              <td key={s.id} className={`px-3 py-2 ${orders.length ? 'bg-mustard/20' : ''}`}>
                                {orders.length ? orders.map((o) => o && <Link key={o.id} to={`/admin/orders/${o.id}`} className="mr-1 font-semibold text-chilli hover:underline">{o.number}</Link>) : <span className="text-ink/30">{t('admin.schedule.free')}</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={card}>
              <SectionTitle>{t('admin.schedule.stock')}</SectionTitle>
              {data.stock.length === 0 ? <p className="font-body text-sm text-ink/60">{t('admin.schedule.stockNone')}</p> : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.stock.map((s) => (
                    <li key={`${s.supplier_id}-${s.bird_type}`} className="flex items-center justify-between rounded-lg bg-cream px-3 py-2 font-body text-sm">
                      <span>{s.supplier} - {t(`admin.bird.${s.bird_type}`)}</span>
                      <span className="flex items-center gap-1 font-semibold">
                        {s.birds_available}
                        {(data.supplierDetails[s.supplier_id]?.avian_flu_zone ?? 'none') !== 'none' && <Pill tone="bad">{t('admin.warn.birdFlu')}</Pill>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </LoadState>
    </AdminLayout>
  );
}
