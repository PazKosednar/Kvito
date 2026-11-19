import { useCallback } from "react";
import { api, apiBlob } from "@/lib/api";
import type { Attachment, Expense, ExpenseCategory, TaxOverview } from "@/types/domain";
import { invalidate, useQuery } from "./useQuery";
import { saveBlob } from "./useReports";

export interface ExpenseInput {
  propertyId: string;
  unitId: string | null;
  category: ExpenseCategory;
  title: string;
  amountCents: number;
  spentOn: string;
  note: string | null;
}

/** Upload a receipt for a landlord's own cost (not tied to a tenancy). */
async function uploadReceipt(file: File): Promise<Attachment> {
  const params = new URLSearchParams({ name: file.name });
  const { attachment } = await api<{ attachment: Attachment }>(`/api/expenses/attachments?${params}`, { method: "POST", file });
  return attachment;
}

/** Yearly tax overview (rent received, own costs, informative tax) for the landlord. */
export function useTaxOverview(year: number, ratePercent: number | null) {
  const path = `/api/taxes?year=${year}${ratePercent ? `&rate=${ratePercent}` : ""}`;
  const q = useQuery<{ overview: TaxOverview }>(path);
  const downloadCsv = useCallback(async () => {
    const blob = await apiBlob(`${path}&format=csv`);
    saveBlob(blob, `kvito-davcni-pregled-${year}.csv`);
  }, [path, year]);
  return { ...q, overview: q.data?.overview, downloadCsv };
}

export function useExpense(id: string | undefined) {
  const q = useQuery<{ expense: Expense }>(id ? `/api/expenses/${id}` : null);
  return { ...q, expense: q.data?.expense };
}

/** Create, change and remove own costs; every change refreshes the tax overview. */
export function useExpenseActions() {
  const refresh = () => invalidate("/api/taxes", "/api/expenses");
  const save = useCallback(async (input: ExpenseInput, files: File[], id?: string) => {
    const attachments = await Promise.all(files.map(uploadReceipt));
    const body = { ...input, attachmentIds: attachments.map((a) => a.id) };
    const res = id
      ? await api<{ expense: Expense }>(`/api/expenses/${id}`, { method: "PATCH", body })
      : await api<{ expense: Expense }>("/api/expenses", { method: "POST", body });
    await refresh();
    return res.expense;
  }, []);
  const remove = useCallback(async (id: string) => {
    await api(`/api/expenses/${id}`, { method: "DELETE" });
    await refresh();
  }, []);
  return { save, remove };
}
