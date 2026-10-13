import type { CaseType } from '../types';

export const CASE_TYPES: CaseType[] = [
  'short_count',
  'sick_injured',
  'died',
  'late',
  'failed_delivery',
  'payment',
  'other',
];

/** Types where "how many birds" is part of the claim. */
export const NEEDS_BIRD_COUNT: CaseType[] = ['short_count', 'sick_injured', 'died'];

export const MAX_PHOTOS = 5;

export interface ProblemInput {
  type: CaseType | '';
  birdsAffected: string;
  description: string;
  quantityOrdered: number;
}

export type ProblemErrors = Partial<Record<'type' | 'birdsAffected' | 'description', string>>;

export function validateProblem(i: ProblemInput): ProblemErrors {
  const e: ProblemErrors = {};
  if (!i.type) e.type = 'buyer.problem.errors.type';
  if (i.type && NEEDS_BIRD_COUNT.includes(i.type)) {
    const n = Number(i.birdsAffected);
    if (i.birdsAffected.trim() === '' || !Number.isInteger(n) || n < 1) e.birdsAffected = 'buyer.problem.errors.birds';
    else if (n > i.quantityOrdered) e.birdsAffected = 'buyer.problem.errors.birdsTooMany';
  }
  if (i.description.trim().length < 5) e.description = 'buyer.problem.errors.description';
  return e;
}
