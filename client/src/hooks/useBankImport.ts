import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import type { BankMatch, BankPreview } from "@/types/domain";
import { invalidate } from "./useQuery";

/**
 * Bank statement import: the file goes to the server for matching only (nothing is stored), the landlord
 * picks which recognised payments to confirm. Payments with the exact amount are preselected.
 */
export function useBankImport() {
  const [preview, setPreview] = useState<BankPreview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const upload = useCallback(async (file: File) => {
    const result = await api<BankPreview>("/api/bank-import/preview", { method: "POST", file });
    setPreview(result);
    setSelected(new Set(result.matches.filter((m) => m.state === "READY").map((m) => m.share.id)));
    return result;
  }, []);

  const toggle = useCallback((shareId: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(shareId)) next.delete(shareId);
      else next.add(shareId);
      return next;
    });
  }, []);

  const confirm = useCallback(async () => {
    if (!preview) return { confirmed: 0, skipped: [] };
    const items = preview.matches
      .filter((m) => selected.has(m.share.id) && m.state !== "ALREADY_CONFIRMED" && m.state !== "DUPLICATE")
      .map((m) => ({ shareId: m.share.id, entryId: m.entryId, paidOn: m.bookedOn }));
    const result = await api<{ confirmed: number; skipped: { shareId: string; reason: string }[] }>("/api/bank-import/confirm", { method: "POST", body: { items } });
    await invalidate("/api/tenancies", "/api/charges/", "/api/overview");
    setPreview(null);
    setSelected(new Set());
    return result;
  }, [preview, selected]);

  const reset = useCallback(() => {
    setPreview(null);
    setSelected(new Set());
  }, []);

  /** Only payments that can still be confirmed are selectable. */
  const selectable = (m: BankMatch) => m.state === "READY" || m.state === "AMOUNT_DIFFERS" || m.state === "AMOUNT_UNKNOWN";

  return { preview, selected, upload, toggle, confirm, reset, selectable };
}
