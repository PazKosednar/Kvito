import { useQuery } from "./useQuery";

export interface ProfitUnit {
  unitId: string;
  unit: string;
  propertyId: string;
  property: string;
  rentCents: number;
  otherCents: number;
  unitCostsCents: number;
  sharedCostsCents: number;
  netCents: number;
  occupiedMonths: number;
}

export interface Profitability {
  year: number;
  monthsElapsed: number;
  units: ProfitUnit[];
  totals: { rentCents: number; otherCents: number; costsCents: number; netCents: number };
  unassignedCostsCents: number;
  years: number[];
}

/** Earnings per unit in a year: rent received minus the landlord's own costs. */
export function useProfitability(year: number) {
  const q = useQuery<{ profitability: Profitability }>(`/api/profitability?year=${year}`);
  return { ...q, data: q.data?.profitability };
}
