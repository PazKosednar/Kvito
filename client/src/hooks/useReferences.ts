import { useCallback } from "react";
import { api } from "@/lib/api";
import { invalidate, useQuery } from "./useQuery";

export type HistoryState = "ON_TIME" | "LATE" | "OPEN" | "OVERDUE" | "DISPUTED" | "NONE";

export interface TenantHistory {
  monthsRented: number;
  tenancies: number;
  payments: { due: number; confirmed: number; onTime: number; late: number; waiting: number; overdue: number; disputed: number };
  onTimePercent: number | null;
  deposits: { returnedInFull: number; returnedPartly: number; held: number };
  settlementsAccepted: number;
  months: { period: string; state: HistoryState }[];
}

export interface SharedReference {
  name: string;
  history: TenantHistory;
  landlords: number;
  createdAt: string;
  expiresAt: string;
}

export interface ReferenceLink {
  id: string;
  createdAt: string;
  expiresAt: string;
  views: number;
  lastViewedAt: string | null;
}

/** The tenant's own history (what a shared link shows) and the links they shared. */
export function useMyReferences() {
  const history = useQuery<{ name: string; history: TenantHistory; landlords: number }>("/api/my-history");
  const links = useQuery<{ references: ReferenceLink[] }>("/api/references");

  /** The link is returned only now; the server keeps just a hash of it. */
  const create = useCallback(async (days: 7 | 30 | 90) => {
    const res = await api<{ url: string; reference: ReferenceLink }>("/api/references", { method: "POST", body: { days } });
    await invalidate("/api/references");
    return res.url;
  }, []);

  const revoke = useCallback(async (id: string) => {
    await api(`/api/references/${id}`, { method: "DELETE" });
    await invalidate("/api/references");
  }, []);

  return { history, links: links.data?.references ?? [], linksLoading: links.loading, create, revoke };
}

/** Public: a shared link opened by a future landlord (no account needed). */
export function useSharedReference(token: string | undefined) {
  const q = useQuery<{ reference: SharedReference }>(token ? `/api/references/${token}` : null);
  return { ...q, reference: q.data?.reference };
}
