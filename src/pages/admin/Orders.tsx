import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { cancelOrders, loadOrders } from './api';
import { useAdminData } from './hooks/useAdminData';
import { downloadCsv } from './logic/csv';
import { ORDER_STATUSES, type OrderRow, type OrderStatus } from './types';
import { t } from './i18n';
import { AdminLayout, DataTable, Empty, LoadState, Money, Pill, Tabs, errorText, formatDate, input, tStatus, useConfirm } from './ui';
import { FormError } from '../../components/FormField';

const PAGE = 25;
type Tab = OrderStatus | 'all';

function csvRows(rows: OrderRow[]) {
  return [
    ['number', 'buyer', 'status', 'bird_type', 'birds', 'total_zar', 'province', 'delivery_date', 'placed_at'],
    ...rows.map((o) => [
      o.number, o.buyer?.business_name ?? o.buyer?.full_name ?? '', o.status, o.bird_type, o.quantity,
      (o.total_cents / 100).toFixed(2), o.address?.province ?? '', o.delivery_date ?? '', o.placed_at,
    ]),
  ];
}

export default function AdminOrders() {
  const [params, setParams] = useSearchParams();
  const initial = params.get('status') as Tab | null;
  const [tab, setTab] = useState<Tab>(initial && (ORDER_STATUSES as string[]).includes(initial) ? initial : 'all');
  const [search, setSearch] = useState('');
  const [bird, setBird] = useState('');
  const [province, setProvince] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, loading, error, reload } = useAdminData(loadOrders, []);
  const { ask, dialog } = useConfirm();

  const all = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: all.length };
    for (const o of all) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [all]);
  const provinces = useMemo(() => [...new Set(all.map((o) => o.address?.province).filter((p): p is string => !!p))].sort(), [all]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((o) => {
      if (tab !== 'all' && o.status !== tab) return false;
      if (bird && o.bird_type !== bird) return false;
      if (province && o.address?.province !== province) return false;
      if (from && o.placed_at.slice(0, 10) < from) return false;
      if (to && o.placed_at.slice(0, 10) > to) return false;
      if (q && !`${o.number} ${o.buyer?.full_name ?? ''} ${o.buyer?.business_name ?? ''} ${o.address?.town ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [all, tab, bird, province, from, to, search]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE, current * PAGE);
  const chosen = all.filter((o) => selected.has(o.id));
  const cancellable = chosen.filter((o) => o.status === 'placed');

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((s) => (rows.every((r) => s.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))));
  }
  function changeTab(v: Tab) {
    setTab(v); setPage(1); setSelected(new Set());
    setParams(v === 'all' ? {} : { status: v });
  }

  return (
    <AdminLayout
      title={t('admin.orders.title')}
      subtitle={t('admin.orders.subtitle')}
      actions={<Button variant="secondary" onClick={() => downloadCsv('orders.csv', csvRows(filtered))}>{t('admin.common.exportCsv')}</Button>}
    >
      <Tabs<Tab>
        value={tab}
        onChange={changeTab}
        tabs={[{ value: 'all', label: t('admin.common.all'), count: counts.all }, ...ORDER_STATUSES.map((s) => ({ value: s as Tab, label: tStatus('order', s), count: counts[s] ?? 0 }))]}
      />
      <div className="my-4 flex flex-wrap items-end gap-3">
        <input className={`${input} w-64`} type="search" placeholder={t('admin.orders.search')} aria-label={t('admin.orders.search')} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        <select className={input} aria-label={t('admin.orders.filter.bird')} value={bird} onChange={(e) => { setBird(e.target.value); setPage(1); }}>
          <option value="">{t('admin.orders.filter.anyBird')}</option>
          {['broiler', 'hardbody', 'indigenous'].map((b) => <option key={b} value={b}>{t(`admin.bird.${b}`)}</option>)}
        </select>
        <select className={input} aria-label={t('admin.orders.filter.province')} value={province} onChange={(e) => { setProvince(e.target.value); setPage(1); }}>
          <option value="">{t('admin.orders.filter.anyProvince')}</option>
          {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-1 font-body text-sm">{t('admin.common.from')}<input className={input} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label>
        <label className="flex items-center gap-1 font-body text-sm">{t('admin.common.to')}<input className={input} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label>
      </div>

      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-mustard/25 px-4 py-2 font-body text-sm">
          <span className="font-semibold">{t('admin.orders.bulk.selected', { count: selected.size })}</span>
          <Button variant="secondary" onClick={() => downloadCsv('orders-selected.csv', csvRows(chosen))}>{t('admin.orders.bulk.export')}</Button>
          <Button
            variant="secondary"
            disabled={cancellable.length === 0}
            onClick={() => ask({
              title: t('admin.orders.bulk.cancelTitle'),
              body: t('admin.orders.bulk.cancelBody', { count: cancellable.length }),
              confirmLabel: t('admin.orders.bulk.cancelConfirm'),
              destructive: true,
              run: async () => {
                const r = await cancelOrders(cancellable.map((o) => o.id));
                setActionError(errorText(r.error));
                if (!r.error) { setSelected(new Set()); reload(); }
              },
            })}
          >
            {t('admin.orders.bulk.cancel')}
          </Button>
        </div>
      )}
      <FormError message={actionError} />

      <LoadState loading={loading} error={error} hasData={!!data}>
        <DataTable
          rows={rows}
          rowKey={(o) => o.id}
          selected={selected}
          onToggle={toggle}
          onToggleAll={toggleAll}
          empty={<Empty title={t('admin.orders.emptyTitle')} body={t('admin.orders.emptyBody')} />}
          columns={[
            { key: 'n', header: t('admin.orders.col.number'), render: (o) => <Link className="font-semibold text-chilli hover:underline" to={`/admin/orders/${o.id}`}>{o.number}</Link> },
            { key: 'b', header: t('admin.orders.col.buyer'), render: (o) => o.buyer?.business_name ?? o.buyer?.full_name ?? '-' },
            { key: 'bt', header: t('admin.orders.col.type'), render: (o) => t(`admin.bird.${o.bird_type}`) },
            { key: 'q', header: t('admin.orders.col.birds'), render: (o) => o.quantity },
            { key: 'pr', header: t('admin.orders.col.province'), render: (o) => o.address?.province ?? '-' },
            { key: 'd', header: t('admin.orders.col.delivery'), render: (o) => (o.delivery_date ? `${formatDate(o.delivery_date)} ${o.slot?.label ?? ''}` : t('admin.orders.notScheduled')) },
            { key: 't', header: t('admin.orders.col.total'), render: (o) => <Money cents={o.total_cents} /> },
            { key: 's', header: t('admin.orders.col.status'), render: (o) => <Pill tone={o.status === 'cancelled' || o.status === 'refunded' ? 'bad' : o.status === 'paid' ? 'warn' : 'neutral'}>{tStatus('order', o.status)}</Pill> },
          ]}
        />
        <div className="mt-3 flex items-center justify-between font-body text-sm text-ink/60">
          <span>{t('admin.common.pageOf', { page: current, pages })}</span>
          <span className="flex gap-2">
            <Button variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>{t('admin.common.prev')}</Button>
            <Button variant="secondary" disabled={current >= pages} onClick={() => setPage(current + 1)}>{t('admin.common.next')}</Button>
          </span>
        </div>
      </LoadState>
      {dialog}
    </AdminLayout>
  );
}
