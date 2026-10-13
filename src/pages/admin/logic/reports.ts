import type { AllocationRow, OrderRow, PaymentRow, TripRow } from '../types';
import { orderMoney } from './orderMoney';

export interface ReportInput {
  orders: OrderRow[];
  allocations: AllocationRow[];
  trips: TripRow[];
  payments: PaymentRow[];
  supplierRatings?: Record<string, number | null>;
  driverRatings?: Record<string, number | null>;
}
export interface Report {
  kpis: { orders: number; salesCents: number; marginCents: number; marginPct: number; birds: number; aov: number };
  daily: { day: string; salesCents: number; marginCents: number }[];
  byProvince: { province: string; birds: number }[];
  topBuyers: { name: string; orders: number; spendCents: number }[];
  suppliers: { id: string; name: string; jobs: number; collected: number; rating: number | null }[];
  drivers: { id: string; name: string; trips: number; delivered: number; rating: number | null }[];
}

export function buildReport(i: ReportInput): Report {
  const daily = new Map<string, { salesCents: number; marginCents: number }>();
  const prov = new Map<string, number>();
  const buyers = new Map<string, { name: string; orders: number; spendCents: number }>();
  let sales = 0;
  let margin = 0;
  let birds = 0;
  for (const o of i.orders) {
    const aIds = i.allocations.filter((a) => a.order_id === o.id);
    const tIds = i.trips.filter((t) => aIds.some((a) => a.id === t.allocation_id));
    const m = orderMoney(o, aIds, tIds, i.payments.filter((p) => p.order_id === o.id));
    const day = (o.paid_at ?? o.placed_at).slice(0, 10);
    const d = daily.get(day) ?? { salesCents: 0, marginCents: 0 };
    d.salesCents += o.total_cents;
    if (!m.incomplete) d.marginCents += m.breakdown.marginCents;
    daily.set(day, d);
    sales += o.total_cents;
    if (!m.incomplete) margin += m.breakdown.marginCents;
    birds += o.quantity;
    const p = o.address?.province ?? '-';
    prov.set(p, (prov.get(p) ?? 0) + o.quantity);
    const b = buyers.get(o.buyer_id) ?? { name: o.buyer?.business_name ?? o.buyer?.full_name ?? o.buyer_id, orders: 0, spendCents: 0 };
    b.orders += 1;
    b.spendCents += o.total_cents;
    buyers.set(o.buyer_id, b);
  }
  const sup = new Map<string, { id: string; name: string; jobs: number; collected: number; rating: number | null }>();
  for (const a of i.allocations) {
    const s = sup.get(a.supplier_id) ?? { id: a.supplier_id, name: a.supplier?.business_name ?? a.supplier?.full_name ?? a.supplier_id, jobs: 0, collected: 0, rating: i.supplierRatings?.[a.supplier_id] ?? null };
    s.jobs += 1;
    if (a.status === 'collected') s.collected += 1;
    sup.set(a.supplier_id, s);
  }
  const drv = new Map<string, { id: string; name: string; trips: number; delivered: number; rating: number | null }>();
  for (const t of i.trips) {
    if (!t.driver_id) continue;
    const d = drv.get(t.driver_id) ?? { id: t.driver_id, name: t.driver?.business_name ?? t.driver?.full_name ?? t.driver_id, trips: 0, delivered: 0, rating: i.driverRatings?.[t.driver_id] ?? null };
    d.trips += 1;
    if (t.status === 'delivered') d.delivered += 1;
    drv.set(t.driver_id, d);
  }
  return {
    kpis: {
      orders: i.orders.length, salesCents: sales, marginCents: margin,
      marginPct: sales > 0 ? Math.round((margin / sales) * 1000) / 10 : 0, birds,
      aov: i.orders.length ? Math.round(sales / i.orders.length) : 0,
    },
    daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v })),
    byProvince: [...prov.entries()].map(([province, b]) => ({ province, birds: b })).sort((a, b) => b.birds - a.birds),
    topBuyers: [...buyers.values()].sort((a, b) => b.spendCents - a.spendCents).slice(0, 10),
    suppliers: [...sup.values()].sort((a, b) => b.jobs - a.jobs),
    drivers: [...drv.values()].sort((a, b) => b.trips - a.trips),
  };
}
