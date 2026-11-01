import { useCallback } from "react";
import { api, apiBlob } from "@/lib/api";
import type { Attachment, AttachmentKind, Charge, ChargesSummary, CostType, PaymentData, PayTo } from "@/types/domain";
import type { Role } from "@/types/user";
import { invalidate, useQuery } from "./useQuery";

export interface ChargeInput {
  type?: "BILL" | "OTHER";
  costType: CostType | null;
  title: string;
  description?: string | null;
  amountCents: number;
  dueDate: string;
  payTo: PayTo;
  payeeName?: string | null;
  payeeIban?: string | null;
  payeeStreet?: string | null;
  payeeCity?: string | null;
  reference?: string | null;
  purposeCode?: string | null;
  purpose?: string | null;
  attachmentIds?: string[];
}

const refresh = (tenancyId: string) => invalidate(`/api/tenancies/${tenancyId}/charges`, "/api/charges/");

/** Charges of a tenancy + summary for the viewer. */
export function useCharges(tenancyId: string | undefined) {
  const q = useQuery<{ charges: Charge[]; summary: ChargesSummary; access: Role; memberId: string | null }>(
    tenancyId ? `/api/tenancies/${tenancyId}/charges` : null,
  );

  const create = useCallback(
    async (input: ChargeInput) => {
      const { charge } = await api<{ charge: Charge }>(`/api/tenancies/${tenancyId}/charges`, { method: "POST", body: input });
      await refresh(tenancyId!);
      return charge;
    },
    [tenancyId],
  );

  return {
    ...q,
    charges: q.data?.charges,
    summary: q.data?.summary,
    memberId: q.data?.memberId ?? null,
    isLandlord: q.data?.access === "LANDLORD",
    create,
  };
}

/** Landlord: confirm a reported payment straight from a list. */
export function useConfirmShare(tenancyId: string) {
  return useCallback(
    async (chargeId: string, shareId: string) => {
      await api(`/api/charges/${chargeId}/shares/${shareId}/confirm`, { method: "POST", body: {} });
      await refresh(tenancyId);
    },
    [tenancyId],
  );
}

/** One charge with share actions. */
export function useCharge(chargeId: string | undefined) {
  const q = useQuery<{ charge: Charge; access: Role; memberId: string | null }>(chargeId ? `/api/charges/${chargeId}` : null);
  const tenancyId = q.data?.charge.tenancyId;

  const act = useCallback(
    async (shareId: string, action: "report" | "confirm" | "reject" | "dispute" | "reopen", body?: object) => {
      await api(`/api/charges/${chargeId}/shares/${shareId}/${action}`, { method: "POST", body: body ?? {} });
      if (tenancyId) await refresh(tenancyId);
    },
    [chargeId, tenancyId],
  );

  const update = useCallback(
    async (input: Partial<ChargeInput>) => {
      await api(`/api/charges/${chargeId}`, { method: "PATCH", body: input });
      if (tenancyId) await refresh(tenancyId);
    },
    [chargeId, tenancyId],
  );

  const remove = useCallback(async () => {
    await api(`/api/charges/${chargeId}`, { method: "DELETE" });
    if (tenancyId) await refresh(tenancyId);
  }, [chargeId, tenancyId]);

  /** Upload a file (e.g. a položnica) and attach it to this charge. */
  const attachFile = useCallback(
    async (file: File) => {
      if (!tenancyId) return;
      const att = await uploadAttachment(tenancyId, file, "BILL");
      await api(`/api/charges/${chargeId}/attachments`, { method: "POST", body: { attachmentIds: [att.id] } });
      await refresh(tenancyId);
    },
    [chargeId, tenancyId],
  );

  const detachFile = useCallback(
    async (attachmentId: string) => {
      await api(`/api/charges/${chargeId}/attachments/${attachmentId}`, { method: "DELETE" });
      if (tenancyId) await refresh(tenancyId);
    },
    [chargeId, tenancyId],
  );

  const charge = q.data?.charge;
  const myShare = charge?.shares.find((s) => s.memberId === q.data?.memberId) ?? null;

  return {
    ...q,
    charge,
    myShare,
    isLandlord: q.data?.access === "LANDLORD",
    report: (shareId: string, input: { paidOn: string | null; note: string | null; attachmentIds?: string[] }) =>
      act(shareId, "report", input),
    confirm: (shareId: string) => act(shareId, "confirm"),
    reject: (shareId: string, reason: string | null) => act(shareId, "reject", { reason }),
    dispute: (shareId: string, reason: string | null) => act(shareId, "dispute", { reason }),
    reopen: (shareId: string) => act(shareId, "reopen"),
    update,
    remove,
    attachFile,
    detachFile,
  };
}

/** Payment data for one share: values to copy, UPN QR, save as image, send by e-mail. */
export function usePayment(chargeId: string | undefined, shareId: string | undefined) {
  const base = chargeId && shareId ? `/api/charges/${chargeId}/shares/${shareId}/payment` : null;
  const q = useQuery<{ payment: PaymentData }>(base);

  const saveQrImage = useCallback(async () => {
    const blob = await apiBlob(`${base}/qr.png`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "kvita-upn-qr.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [base]);

  const emailQr = useCallback(async () => {
    const res = await api<{ to: string }>(`${base}/email`, { method: "POST" });
    return res.to;
  }, [base]);

  return { ...q, payment: q.data?.payment, saveQrImage, emailQr };
}

/** Upload a file to a tenancy (bills, payment proofs, photos …). */
export async function uploadAttachment(tenancyId: string, file: File, kind: AttachmentKind): Promise<Attachment> {
  const params = new URLSearchParams({ kind, name: file.name });
  const { attachment } = await api<{ attachment: Attachment }>(`/api/tenancies/${tenancyId}/attachments?${params}`, {
    method: "POST",
    file,
  });
  return attachment;
}
