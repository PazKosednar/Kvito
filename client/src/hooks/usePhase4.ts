import { useCallback } from "react";
import { api, apiBlob } from "@/lib/api";
import type {
  DocumentCategory,
  DocumentVisibility,
  Handover,
  HandoverKind,
  HandoverSummary,
  ItemCondition,
  KvitaDocument,
  MeterReading,
  MeterType,
} from "@/types/domain";
import type { Role } from "@/types/user";
import { uploadAttachment } from "./useCharges";
import { invalidate, useQuery } from "./useQuery";

export interface ReadingInput {
  meterType: MeterType;
  meterLabel?: string | null;
  value: string;
  readOn: string;
  note?: string | null;
}

// ---------- Meters ----------

export function useMeters(tenancyId: string | undefined) {
  const path = tenancyId ? `/api/tenancies/${tenancyId}/meters` : null;
  const q = useQuery<{ readings: MeterReading[] }>(path);

  const add = useCallback(
    async (input: ReadingInput, photos: File[]) => {
      const att = await Promise.all(photos.map((f) => uploadAttachment(tenancyId!, f, "METER")));
      const res = await api<{ reading: MeterReading; lowerThanPrevious: boolean }>(path!, {
        method: "POST",
        body: { ...input, attachmentIds: att.map((a) => a.id) },
      });
      await invalidate(path!);
      return res;
    },
    [tenancyId, path],
  );

  const remove = useCallback(
    async (id: string) => {
      await api(`/api/meters/${id}`, { method: "DELETE" });
      await invalidate(path!);
    },
    [path],
  );

  return { ...q, readings: q.data?.readings, add, remove };
}

// ---------- Documents ----------

export function useDocuments(tenancyId: string | undefined) {
  const path = tenancyId ? `/api/tenancies/${tenancyId}/documents` : null;
  const q = useQuery<{ documents: KvitaDocument[] }>(path);

  const add = useCallback(
    async (input: { category: DocumentCategory; title: string; visibility: DocumentVisibility; scope: "TENANCY" | "UNIT" }, files: File[]) => {
      const att = await Promise.all(files.map((f) => uploadAttachment(tenancyId!, f, "DOCUMENT")));
      await api(path!, { method: "POST", body: { ...input, attachmentIds: att.map((a) => a.id) } });
      await invalidate(path!, `/api/tenancies/${tenancyId}/messages`);
    },
    [tenancyId, path],
  );

  const setVisibility = useCallback(
    async (id: string, visibility: DocumentVisibility) => {
      await api(`/api/tenancies/${tenancyId}/documents/${id}`, { method: "PATCH", body: { visibility } });
      await invalidate(path!);
    },
    [tenancyId, path],
  );

  const remove = useCallback(
    async (id: string) => {
      await api(`/api/tenancies/${tenancyId}/documents/${id}`, { method: "DELETE" });
      await invalidate(path!);
    },
    [tenancyId, path],
  );

  return { ...q, documents: q.data?.documents, add, setVisibility, remove };
}

// ---------- Handover ----------

export function useHandovers(tenancyId: string | undefined) {
  const path = tenancyId ? `/api/tenancies/${tenancyId}/handovers` : null;
  const q = useQuery<{ handovers: HandoverSummary[] }>(path);
  const create = useCallback(
    async (kind: HandoverKind, handoverOn: string) => {
      const { handover } = await api<{ handover: { id: string } }>(path!, { method: "POST", body: { kind, handoverOn } });
      await invalidate(path!);
      return handover;
    },
    [path],
  );
  return { ...q, handovers: q.data?.handovers, create };
}

export function useHandover(id: string | undefined) {
  const path = id ? `/api/handovers/${id}` : null;
  const q = useQuery<{ handover: Handover; access: Role }>(path);
  const tenancyId = q.data?.handover.tenancyId;
  const refresh = useCallback(() => invalidate(path!, `/api/tenancies/${tenancyId}/handovers`, `/api/tenancies/${tenancyId}/meters`), [path, tenancyId]);

  const update = useCallback(
    async (input: { keysCount?: number | null; keysNote?: string | null; notes?: string | null; handoverOn?: string }) => {
      await api(path!, { method: "PATCH", body: input });
      await refresh();
    },
    [path, refresh],
  );
  const addItem = useCallback(
    async (input: { room: string; name: string; condition: ItemCondition; note?: string | null }, photos: File[]) => {
      const att = await Promise.all(photos.map((f) => uploadAttachment(tenancyId!, f, "HANDOVER")));
      await api(`${path}/items`, { method: "POST", body: { ...input, attachmentIds: att.map((a) => a.id) } });
      await refresh();
    },
    [path, tenancyId, refresh],
  );
  const updateItem = useCallback(
    async (itemId: string, input: { condition?: ItemCondition; note?: string | null }) => {
      await api(`${path}/items/${itemId}`, { method: "PATCH", body: input });
      await refresh();
    },
    [path, refresh],
  );
  const removeItem = useCallback(
    async (itemId: string) => {
      await api(`${path}/items/${itemId}`, { method: "DELETE" });
      await refresh();
    },
    [path, refresh],
  );
  const addReading = useCallback(
    async (input: ReadingInput) => {
      await api(`${path}/meters`, { method: "POST", body: input });
      await refresh();
    },
    [path, refresh],
  );
  const removeReading = useCallback(
    async (readingId: string) => {
      await api(`${path}/meters/${readingId}`, { method: "DELETE" });
      await refresh();
    },
    [path, refresh],
  );
  const transition = useCallback(
    async (action: "submit" | "confirm" | "reopen") => {
      await api(`${path}/${action}`, { method: "POST" });
      await refresh();
    },
    [path, refresh],
  );
  const downloadPdf = useCallback(async () => {
    const blob = await apiBlob(`${path}/pdf`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kvita-zapisnik-${q.data?.handover.kind === "MOVE_OUT" ? "izselitev" : "vselitev"}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [path, q.data?.handover.kind]);

  return {
    ...q,
    handover: q.data?.handover,
    isLandlord: q.data?.access === "LANDLORD",
    update,
    addItem,
    updateItem,
    removeItem,
    addReading,
    removeReading,
    transition,
    downloadPdf,
  };
}
