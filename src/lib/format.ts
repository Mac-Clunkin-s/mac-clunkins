const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

export function formatCents(cents: number): string {
  return zar.format(cents / 100);
}

export function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}
