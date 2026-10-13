import type { CaseCostOwner, CaseResolution, CaseStatus } from '../types';

export const CASE_FLOW: CaseStatus[] = ['open', 'in_review', 'awaiting_info', 'resolved', 'closed'];

/** Forward-only: a case never moves back (or sideways) in the flow. */
export function isForwardTransition(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_FLOW.indexOf(to) > CASE_FLOW.indexOf(from);
}

export function allowedNext(from: CaseStatus): CaseStatus[] {
  return CASE_FLOW.filter((s) => isForwardTransition(from, s));
}

export interface ResolutionInput {
  resolution: CaseResolution | '';
  amountCents: number | null;
  costOwner: CaseCostOwner | '';
}
export type ResolutionError = 'resolution_required' | 'amount_required' | 'amount_invalid' | 'cost_owner_required';

/** Resolving needs a resolution; refund/credit need a positive whole-cent amount; paid resolutions need a cost owner. */
export function validateResolution(i: ResolutionInput): ResolutionError | null {
  if (!i.resolution) return 'resolution_required';
  if (i.resolution === 'refund' || i.resolution === 'credit') {
    if (i.amountCents === null) return 'amount_required';
    if (!Number.isInteger(i.amountCents) || i.amountCents <= 0) return 'amount_invalid';
  }
  if (i.resolution !== 'none' && !i.costOwner) return 'cost_owner_required';
  return null;
}

/** Milliseconds until the first reply is due (negative = overdue). */
export function replyDueIn(replyDueAt: string | null, now: Date = new Date()): number | null {
  return replyDueAt ? new Date(replyDueAt).getTime() - now.getTime() : null;
}
