import type { AllocationStatus, ComplianceDoc } from './types';

export type JobTab = 'new' | 'active' | 'done';

export function tabForStatus(s: AllocationStatus): JobTab | null {
  if (s === 'offered') return 'new';
  if (s === 'accepted' || s === 'ready') return 'active';
  if (s === 'collected') return 'done';
  return null; // declined jobs are hidden
}

/** Monday of the week containing `d`, as YYYY-MM-DD (local calendar date). */
export function weekStartISO(d: Date, offsetWeeks = 0): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow + offsetWeeks * 7);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

export const REQUIRED_SUPPLIER_DOCS = [
  'id',
  'pdma',
  'cipc',
  'tax_pin',
  'bank_letter',
  'ncd_ai_evidence',
  'hpai_permit',
  'supplier_agreement',
] as const;

export function isExpired(doc: Pick<ComplianceDoc, 'expires_on'>, today: Date = new Date()): boolean {
  if (!doc.expires_on) return false;
  return doc.expires_on < today.toISOString().slice(0, 10);
}

export type Approval = 'incomplete' | 'in_review' | 'approved' | 'expired';

/** Suppliers get no jobs unless `approved`. Any expired required document pauses them. */
export function approvalState(docs: ComplianceDoc[], today: Date = new Date()): Approval {
  const byKind = new Map(docs.map((d) => [d.kind, d]));
  let allUploaded = true;
  let allApproved = true;
  for (const kind of REQUIRED_SUPPLIER_DOCS) {
    const d = byKind.get(kind);
    if (!d || d.status === 'missing' || d.status === 'rejected') {
      allUploaded = false;
      allApproved = false;
      continue;
    }
    if (d.status === 'approved' && isExpired(d, today)) return 'expired';
    if (d.status !== 'approved') allApproved = false;
  }
  if (!allUploaded) return 'incomplete';
  return allApproved ? 'approved' : 'in_review';
}

export interface ReadyCheckInput {
  birds_counted: number | null;
  crates: number | null;
  welfare_ok: boolean | null;
  load_photo_path: string | null;
  removal_permit_path: string | null;
  permit_valid_until: string | null;
}

/** Returns i18n keys of everything still blocking "Mark ready". */
export function readyBlockers(a: ReadyCheckInput, now: Date = new Date()): string[] {
  const out: string[] = [];
  if (!a.birds_counted || a.birds_counted <= 0) out.push('supplier.job.need_count');
  if (!a.crates || a.crates <= 0) out.push('supplier.job.need_crates');
  if (!a.welfare_ok) out.push('supplier.job.need_welfare');
  if (!a.load_photo_path) out.push('supplier.job.need_photo');
  if (!a.removal_permit_path) out.push('supplier.job.need_permit');
  else if (!a.permit_valid_until || new Date(a.permit_valid_until).getTime() <= now.getTime()) {
    out.push('supplier.job.permit_expired');
  }
  return out;
}
