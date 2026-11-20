import { useCallback } from "react";
import { api } from "@/lib/api";
import type { Property, PropertyType, Unit } from "@/types/domain";
import { invalidate, useQuery } from "./useQuery";

export interface PropertyInput {
  type: PropertyType;
  name: string;
  street: string;
  postalCode: string;
  city: string;
  notes?: string | null;
}

export interface UnitInput {
  name: string;
  floor?: string | null;
}

/** Landlord's properties with units and current tenancies. */
export function useProperties(enabled = true) {
  const q = useQuery<{ properties: Property[] }>(enabled ? "/api/properties" : null);

  const createProperty = useCallback(async (input: PropertyInput) => {
    const { property } = await api<{ property: Property }>("/api/properties", { method: "POST", body: input });
    await invalidate("/api/properties", "/api/me");
    return property;
  }, []);

  return { ...q, properties: q.data?.properties, createProperty };
}

export function useProperty(id: string | undefined) {
  const path = id ? `/api/properties/${id}` : null;
  const q = useQuery<{ property: Property }>(path);

  const update = useCallback(
    async (input: Partial<PropertyInput>) => {
      await api(`/api/properties/${id}`, { method: "PATCH", body: input });
      await invalidate("/api/properties");
    },
    [id],
  );

  const remove = useCallback(async () => {
    await api(`/api/properties/${id}`, { method: "DELETE" });
    await invalidate("/api/properties");
  }, [id]);

  const addUnit = useCallback(
    async (input: UnitInput) => {
      const { unit } = await api<{ unit: Unit }>(`/api/properties/${id}/units`, { method: "POST", body: input });
      await invalidate("/api/properties");
      return unit;
    },
    [id],
  );

  const updateUnit = useCallback(async (unitId: string, input: Partial<UnitInput>) => {
    await api(`/api/units/${unitId}`, { method: "PATCH", body: input });
    await invalidate("/api/properties");
  }, []);

  const removeUnit = useCallback(async (unitId: string) => {
    await api(`/api/units/${unitId}`, { method: "DELETE" });
    await invalidate("/api/properties");
  }, []);

  return { ...q, property: q.data?.property, update, remove, addUnit, updateUnit, removeUnit };
}
