import { useQuery } from "./useQuery";

export type Plan = "FREE" | "PLUS" | "PRO" | "MANAGER";

export interface PlanInfo {
  id: Plan;
  units: number;
  storageBytes: number;
  monthlyCents: number;
  yearlyCents: number;
}

export interface Billing {
  limitsEnabled: boolean;
  plan: Plan;
  founder: boolean;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  limits: Omit<PlanInfo, "id">;
  usage: { units: number; storageBytes: number };
  plans: PlanInfo[];
}

/** The landlord's plan, usage and the packages. */
export function useBilling() {
  const q = useQuery<Billing>("/api/billing");
  return { ...q, billing: q.data };
}
