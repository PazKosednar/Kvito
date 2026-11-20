import { useCallback } from "react";
import { api } from "@/lib/api";
import type { Attachment, KeySet, UnitDetail, UnitDetails, UtilityKind, UtilityPoint } from "@/types/domain";
import { invalidate, useQuery } from "./useQuery";

export interface UtilityInput {
  kind: UtilityKind;
  pointNumber: string | null;
  supplier: string | null;
  note: string | null;
}

export interface KeysInput {
  label: string;
  count: number;
  holder: string | null;
}

/** Upload one photo to a property's gallery, or to one of its units. */
export async function uploadPhoto(propertyId: string, file: File, unitId?: string): Promise<Attachment> {
  const params = new URLSearchParams({ name: file.name, ...(unitId ? { unitId } : {}) });
  const { photo } = await api<{ photo: Attachment }>(`/api/properties/${propertyId}/photos?${params}`, { method: "POST", file });
  return photo;
}

export async function removePhoto(photoId: string): Promise<void> {
  await api(`/api/photos/${photoId}`, { method: "DELETE" });
}

/** The property's own photo gallery. */
export function usePropertyPhotos(propertyId: string | undefined) {
  const path = propertyId ? `/api/properties/${propertyId}/photos` : null;
  const q = useQuery<{ photos: Attachment[] }>(path);
  const add = useCallback(
    async (files: File[]) => {
      for (const f of files) await uploadPhoto(propertyId!, f);
      await invalidate(`/api/properties/${propertyId}/photos`);
    },
    [propertyId],
  );
  const remove = useCallback(
    async (photoId: string) => {
      await removePhoto(photoId);
      await invalidate(`/api/properties/${propertyId}/photos`);
    },
    [propertyId],
  );
  return { ...q, photos: q.data?.photos ?? [], add, remove };
}

/** The unit page: details, metering points, keys and photos, with every change refreshing it. */
export function useUnit(id: string | undefined) {
  const path = id ? `/api/units/${id}` : null;
  const q = useQuery<{ unit: UnitDetail }>(path);
  const refresh = useCallback(() => invalidate(`/api/units/${id}`, "/api/properties", "/api/tenancies"), [id]);

  const update = useCallback(
    async (input: Partial<UnitDetails> & { name?: string; floor?: string | null }) => {
      await api(`/api/units/${id}`, { method: "PATCH", body: input });
      await refresh();
    },
    [id, refresh],
  );
  const saveUtility = useCallback(
    async (input: UtilityInput, pointId?: string) => {
      if (pointId) await api<{ point: UtilityPoint }>(`/api/utilities/${pointId}`, { method: "PATCH", body: input });
      else await api<{ point: UtilityPoint }>(`/api/units/${id}/utilities`, { method: "POST", body: input });
      await refresh();
    },
    [id, refresh],
  );
  const removeUtility = useCallback(
    async (pointId: string) => {
      await api(`/api/utilities/${pointId}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );
  const saveKeys = useCallback(
    async (input: KeysInput, keysId?: string) => {
      if (keysId) await api<{ keys: KeySet }>(`/api/keys/${keysId}`, { method: "PATCH", body: input });
      else await api<{ keys: KeySet }>(`/api/units/${id}/keys`, { method: "POST", body: input });
      await refresh();
    },
    [id, refresh],
  );
  const removeKeys = useCallback(
    async (keysId: string) => {
      await api(`/api/keys/${keysId}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );
  const addPhotos = useCallback(
    async (files: File[]) => {
      const unit = q.data?.unit;
      if (!unit) return;
      for (const f of files) await uploadPhoto(unit.property.id, f, unit.id);
      await refresh();
    },
    [q.data, refresh],
  );
  const deletePhoto = useCallback(
    async (photoId: string) => {
      await removePhoto(photoId);
      await refresh();
    },
    [refresh],
  );

  return { ...q, unit: q.data?.unit, update, saveUtility, removeUtility, saveKeys, removeKeys, addPhotos, deletePhoto };
}
