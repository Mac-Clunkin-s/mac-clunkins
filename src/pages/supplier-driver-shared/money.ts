export function randsToCents(input: string): number | null {
  const n = parseFloat(input.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function centsToRands(cents: number | null | undefined): string {
  return cents == null ? '' : (cents / 100).toFixed(2);
}

export function maskTail(value: string | null | undefined, visible = 4): string {
  if (!value) return '';
  const tail = value.slice(-visible);
  return `${'•'.repeat(Math.max(value.length - visible, 4))}${tail}`;
}
