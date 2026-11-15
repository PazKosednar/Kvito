import { useCallback } from "react";
import { api } from "@/lib/api";
import type { Closeout, CostAdvance, CostType, CostsView, CreditChoice, DepositState, RentChange, Settlement, SettlementSummary } from "@/types/domain";
import { uploadAttachment } from "./useCharges";
import { invalidate, useQuery } from "./useQuery";

/** Everything under a tenancy that the contract screens show; one refresh keeps them consistent. */
const refreshContract = (tenancyId: string) =>
  invalidate(`/api/tenancies/${tenancyId}/costs`, `/api/tenancies/${tenancyId}/deposit`, `/api/tenancies/${tenancyId}/advances`, `/api/tenancies/${tenancyId}/settlements`, `/api/tenancies/${tenancyId}/rent-changes`, `/api/tenancies/${tenancyId}/closeout`, `/api/tenancies/${tenancyId}/charges`, `/api/tenancies/${tenancyId}`, "/api/settlements/", "/api/charges/");

// ---------- Deposit ----------

export interface DeductionInput {
  reason: string;
  amountCents: number;
  handoverItemId?: string | null;
}

export function useDeposit(tenancyId: string) {
  const base = `/api/tenancies/${tenancyId}/deposit`;
  const q = useQuery<DepositState>(base);

  const post = useCallback(
    async (path: string, body: object = {}) => {
      await api(`${base}${path}`, { method: "POST", body });
      await refreshContract(tenancyId);
    },
    [base, tenancyId],
  );

  return {
    ...q,
    state: q.data,
    request: (dueDate: string) => post("/request", { dueDate }),
    markReceived: (receivedOn: string) => post("/received", { receivedOn }),
    withdraw: async () => {
      await api(base, { method: "DELETE" });
      await refreshContract(tenancyId);
    },
    propose: (deductions: DeductionInput[], note: string | null) => post("/proposal", { deductions, note }),
    accept: () => post("/accept"),
    dispute: (reason: string) => post("/dispute", { reason }),
    markReturned: (returnedOn: string) => post("/returned", { returnedOn }),
    confirmReceipt: () => post("/receipt"),
  };
}

// ---------- Monthly advances ----------

export function useAdvances(tenancyId: string) {
  const path = `/api/tenancies/${tenancyId}/advances`;
  const q = useQuery<{ advances: CostAdvance[]; totalCents: number }>(path);
  const save = useCallback(
    async (items: { costType: CostType; amountCents: number }[]) => {
      await api(path, { method: "PUT", body: { items } });
      await refreshContract(tenancyId);
    },
    [path, tenancyId],
  );
  return { ...q, advances: q.data?.advances ?? [], totalCents: q.data?.totalCents ?? 0, save };
}

// ---------- Settlements ----------

export function useSettlements(tenancyId: string) {
  const q = useQuery<{ settlements: SettlementSummary[] }>(`/api/tenancies/${tenancyId}/settlements`);
  const create = useCallback(
    async (periodFrom: string, periodTo: string) => {
      const { settlement } = await api<{ settlement: Settlement }>(`/api/tenancies/${tenancyId}/settlements`, { method: "POST", body: { periodFrom, periodTo } });
      await refreshContract(tenancyId);
      return settlement;
    },
    [tenancyId],
  );
  return { ...q, settlements: q.data?.settlements ?? [], create };
}

export interface SettlementPatch {
  periodFrom?: string;
  periodTo?: string;
  note?: string | null;
  dueDate?: string | null;
  recommendedChoice?: CreditChoice | null;
  /** Notes per cost type; the amounts come from the monthly costs. */
  lines?: { costType: CostType; note?: string | null }[];
}

export function useSettlement(id: string | undefined) {
  const base = id ? `/api/settlements/${id}` : null;
  const q = useQuery<{ settlement: Settlement; access: "LANDLORD" | "TENANT" }>(base);
  const tenancyId = q.data?.settlement.tenancyId;

  const call = useCallback(
    async (method: "POST" | "PATCH" | "DELETE", path: string, body?: object) => {
      await api(`${base}${path}`, { method, ...(body ? { body } : method === "POST" ? { body: {} } : {}) });
      if (tenancyId) await refreshContract(tenancyId);
    },
    [base, tenancyId],
  );

  const attachFile = useCallback(
    async (file: File) => {
      if (!tenancyId) return;
      const att = await uploadAttachment(tenancyId, file, "BILL");
      await call("POST", "/attachments", { attachmentIds: [att.id] });
    },
    [tenancyId, call],
  );

  return {
    ...q,
    settlement: q.data?.settlement,
    isLandlord: q.data?.access === "LANDLORD",
    update: (patch: SettlementPatch) => call("PATCH", "", patch),
    remove: () => call("DELETE", ""),
    send: () => call("POST", "/send"),
    accept: (creditChoice?: CreditChoice) => call("POST", "/accept", creditChoice ? { creditChoice } : {}),
    dispute: (reason: string) => call("POST", "/dispute", { reason }),
    markRefunded: (refundedOn: string) => call("POST", "/refunded", { refundedOn }),
    confirmRefund: () => call("POST", "/refund-receipt"),
    attachFile,
    detachFile: (attachmentId: string) => call("DELETE", `/attachments/${attachmentId}`),
  };
}

// ---------- Monthly costs ----------

/**
 * Actual running costs by month. Without a range: the months since the last settlement and the running balance.
 * Landlords enter and correct amounts; tenants only read.
 */
export function useCosts(tenancyId: string, range?: { from: string; to: string }) {
  const base = `/api/tenancies/${tenancyId}/costs`;
  const q = useQuery<CostsView>(range ? `${base}?from=${range.from}&to=${range.to}` : base);

  const setEntry = useCallback(
    async (period: string, costType: CostType, amountCents: number | null, note?: string | null) => {
      if (amountCents === null) await api(`${base}/${period}/${costType}`, { method: "DELETE" });
      else await api(`${base}/${period}/${costType}`, { method: "PUT", body: { amountCents, note: note ?? null } });
      await refreshContract(tenancyId);
    },
    [base, tenancyId],
  );

  const attachFile = useCallback(
    async (entryId: string, file: File) => {
      const att = await uploadAttachment(tenancyId, file, "BILL");
      await api(`/api/cost-entries/${entryId}/attachments`, { method: "POST", body: { attachmentIds: [att.id] } });
      await refreshContract(tenancyId);
    },
    [tenancyId],
  );

  const detachFile = useCallback(
    async (entryId: string, attachmentId: string) => {
      await api(`/api/cost-entries/${entryId}/attachments/${attachmentId}`, { method: "DELETE" });
      await refreshContract(tenancyId);
    },
    [tenancyId],
  );

  return { ...q, costs: q.data, setEntry, attachFile, detachFile };
}

// ---------- Rent changes & closing ----------

export function useRentChanges(tenancyId: string) {
  const q = useQuery<{ changes: RentChange[] }>(`/api/tenancies/${tenancyId}/rent-changes`);
  const schedule = useCallback(
    async (effectiveFrom: string, rentCents: number, note: string | null) => {
      await api(`/api/tenancies/${tenancyId}/rent-changes`, { method: "POST", body: { effectiveFrom, rentCents, note } });
      await refreshContract(tenancyId);
    },
    [tenancyId],
  );
  const cancel = useCallback(
    async (id: string) => {
      await api(`/api/rent-changes/${id}`, { method: "DELETE" });
      await refreshContract(tenancyId);
    },
    [tenancyId],
  );
  return { ...q, changes: q.data?.changes ?? [], schedule, cancel };
}

export function useCloseout(tenancyId: string) {
  const q = useQuery<Closeout>(`/api/tenancies/${tenancyId}/closeout`);
  return { ...q, closeout: q.data };
}
