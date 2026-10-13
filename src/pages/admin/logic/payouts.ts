import type { TransferRow, TransferStatus } from '../types';

/** Only failed transfers can be retried. Queued/sent are in flight; success/reversed are final. */
export function canRetry(status: TransferStatus): boolean {
  return status === 'failed';
}

export function centsToRands(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Bank-file fallback (CSV) for transfers Paystack could not make. Bank details stay server-side. */
export function bankFileRows(rows: TransferRow[]): string[][] {
  const header = ['transfer_id', 'party_type', 'party_name', 'amount_zar', 'status', 'reference'];
  return [
    header,
    ...rows.map((r) => [
      r.id, r.party_type, r.party?.business_name ?? r.party?.full_name ?? r.party_id,
      centsToRands(r.amount_cents), r.status, r.paystack_transfer_code ?? '',
    ]),
  ];
}
