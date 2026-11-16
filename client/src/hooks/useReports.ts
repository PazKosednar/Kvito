import { useCallback } from "react";
import { apiBlob } from "@/lib/api";
import { useQuery } from "./useQuery";

export interface OverviewRow {
  openCount: number;
  openCents: number;
  overdueCount: number;
  overdueCents: number;
  waitingCount: number;
  waitingCents: number;
  disputedCount: number;
}

/** Landlord overview: totals and one row per tenancy. */
export function useOverview(enabled = true) {
  const q = useQuery<{ totals: OverviewRow; byTenancy: Record<string, OverviewRow>; onTimeMonths?: Record<string, number> }>(enabled ? "/api/overview" : null);
  return { ...q, totals: q.data?.totals, byTenancy: q.data?.byTenancy ?? {}, onTimeMonths: q.data?.onTimeMonths ?? {} };
}

/** Saves a blob through a temporary link (works the same in browsers and in a Capacitor webview). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export interface MoneyParts {
  rent: number;
  costs: number;
  deposit: number;
  other: number;
}

export interface AnnualSummary {
  year: number;
  units: { tenancyId: string; property: string; unit: string; tenants: string[]; months: (MoneyParts & { month: number })[]; totals: MoneyParts; returned: { depositCents: number; costsCents: number } }[];
  totals: MoneyParts;
  returned: { depositCents: number; costsCents: number };
}

/** Landlord: money received in a year by unit and month (rent apart from costs and deposit), with CSV/PDF. */
export function useAnnualSummary(year: number | null) {
  const q = useQuery<{ summary: AnnualSummary }>(year ? `/api/annual?year=${year}` : null);
  const download = useCallback(async (format: "csv" | "pdf") => {
    if (!year) return;
    const blob = await apiBlob(`/api/annual?year=${year}&format=${format}`);
    saveBlob(blob, `kvito-letni-povzetek-${year}.${format}`);
  }, [year]);
  return { ...q, summary: q.data?.summary, download };
}

/** Yearly export of received payments (CSV for spreadsheets, PDF for printing). */
export function usePaymentExport() {
  const years = useQuery<{ years: number[] }>("/api/exports/years");
  const download = useCallback(async (year: number, format: "csv" | "pdf") => {
    const blob = await apiBlob(`/api/exports/payments?year=${year}&format=${format}`);
    saveBlob(blob, `kvito-prejeta-placila-${year}.${format}`);
  }, []);
  return { years: years.data?.years ?? [], download };
}
