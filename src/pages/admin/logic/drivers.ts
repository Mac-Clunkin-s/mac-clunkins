import type { DriverDetails, SupplierRequirements } from '../types';

export interface FitInput {
  driver: DriverDetails;
  requirements: SupplierRequirements | null;
  birds: number;
  hotDay: boolean;
}
export type FitProblem = 'paused' | 'not_covered' | 'capacity' | 'crates';

/** Empty array = driver meets the supplier's requirements and the vehicle holds the load. */
export function driverFitProblems({ driver, requirements, birds, hotDay }: FitInput): FitProblem[] {
  const problems: FitProblem[] = [];
  if (driver.paused) problems.push('paused');
  if (requirements?.covered_vehicle && !driver.covered) problems.push('not_covered');
  if (driver.capacity_birds !== null && birds > driver.capacity_birds) problems.push('capacity');
  const perCrate = hotDay ? requirements?.max_per_crate_hot ?? requirements?.max_per_crate : requirements?.max_per_crate;
  if (perCrate && driver.crates_owned !== null && driver.crates_owned * perCrate < birds) problems.push('crates');
  return problems;
}
