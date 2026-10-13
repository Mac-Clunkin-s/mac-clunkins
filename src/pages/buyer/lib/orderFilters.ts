import type { OrderRow, OrderStatus } from '../types';

export type FilterKey = 'all' | 'in_progress' | 'delivered' | 'cancelled';

export const IN_PROGRESS: OrderStatus[] = ['placed', 'paid', 'scheduled', 'ready', 'on_the_way'];
const DELIVERED: OrderStatus[] = ['delivered', 'settled'];
const CANCELLED: OrderStatus[] = ['cancelled', 'refunded'];
/** Statuses that do not count towards money spent. */
const NOT_SPENT: OrderStatus[] = ['cancelled', 'refunded', 'placed'];

export const FILTER_KEYS: FilterKey[] = ['all', 'in_progress', 'delivered', 'cancelled'];

export function matchesFilter(o: OrderRow, f: FilterKey): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'in_progress':
      return IN_PROGRESS.includes(o.status);
    case 'delivered':
      return DELIVERED.includes(o.status);
    case 'cancelled':
      return CANCELLED.includes(o.status);
  }
}

export function filterCounts(orders: OrderRow[]): Record<FilterKey, number> {
  return {
    all: orders.length,
    in_progress: orders.filter((o) => matchesFilter(o, 'in_progress')).length,
    delivered: orders.filter((o) => matchesFilter(o, 'delivered')).length,
    cancelled: orders.filter((o) => matchesFilter(o, 'cancelled')).length,
  };
}

/** `labelOf` lets the caller search by the translated bird-type label as well. */
export function searchOrders(orders: OrderRow[], q: string, labelOf: (o: OrderRow) => string): OrderRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return orders;
  return orders.filter(
    (o) =>
      o.number.toLowerCase().includes(needle) ||
      labelOf(o).toLowerCase().includes(needle) ||
      String(o.quantity) === needle,
  );
}

export interface MonthGroup {
  key: string; // YYYY-MM
  date: Date; // first of the month
  orders: OrderRow[];
  totalCents: number;
}

const spent = (o: OrderRow) => (NOT_SPENT.includes(o.status) ? 0 : o.total_cents);

export function groupByMonth(orders: OrderRow[]): MonthGroup[] {
  const map = new Map<string, MonthGroup>();
  for (const o of orders) {
    const d = new Date(o.placed_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let g = map.get(key);
    if (!g) {
      g = { key, date: new Date(d.getFullYear(), d.getMonth(), 1), orders: [], totalCents: 0 };
      map.set(key, g);
    }
    g.orders.push(o);
    g.totalCents += spent(o);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

export function sortNewestFirst(orders: OrderRow[]): OrderRow[] {
  return [...orders].sort((a, b) => (a.placed_at < b.placed_at ? 1 : -1));
}

export function paginate<T>(items: T[], page: number, size: number): { items: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { items: items.slice((p - 1) * size, p * size), pages, page: p };
}

export function yearTotals(orders: OrderRow[], year: number) {
  const inYear = orders.filter((o) => new Date(o.placed_at).getFullYear() === year);
  return {
    orders: inYear.length,
    birds: inYear.filter((o) => spent(o) > 0).reduce((n, o) => n + o.quantity, 0),
    spentCents: inYear.reduce((n, o) => n + spent(o), 0),
  };
}
