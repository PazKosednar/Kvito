import { useCallback } from "react";
import { api } from "@/lib/api";
import type { CostType, InvitationSummary, SplitMethod, TenancyDetail } from "@/types/domain";
import type { Role } from "@/types/user";
import { invalidate, useQuery } from "./useQuery";

export interface TenancyInput {
  startDate: string;
  endDate: string | null;
  rentCents: number;
  rentDueDay: number;
  depositCents: number | null;
  payeeName: string;
  payeeIban: string;
  payeeStreet: string | null;
  payeeCity: string | null;
  coveredCosts: CostType[];
  splitMethod: SplitMethod;
  noticePeriodDays: number | null;
  rentReviewMonth: number | null;
  paymentNote: string | null;
}

/** Tenancies of the signed-in user in a role. */
export function useTenancies(as: Role | null) {
  const q = useQuery<{ tenancies: TenancyDetail[] }>(as ? `/api/tenancies?as=${as}` : null);
  return { ...q, tenancies: q.data?.tenancies };
}

export function useTenancy(id: string | undefined) {
  const q = useQuery<{ tenancy: TenancyDetail; access: Role; memberId: string | null }>(
    id ? `/api/tenancies/${id}` : null,
  );

  const update = useCallback(
    async (input: Partial<TenancyInput> & { status?: "ACTIVE" | "ENDED" }) => {
      await api(`/api/tenancies/${id}`, { method: "PATCH", body: input });
      await invalidate(`/api/tenancies`, "/api/properties");
    },
    [id],
  );

  const updateMember = useCallback(
    async (memberId: string, input: { shareBasisPoints?: number | null; personCount?: number; isPrimary?: boolean }) => {
      await api(`/api/tenancies/${id}/members/${memberId}`, { method: "PATCH", body: input });
      await invalidate(`/api/tenancies/${id}`);
    },
    [id],
  );

  const removeMember = useCallback(
    async (memberId: string) => {
      await api(`/api/tenancies/${id}/members/${memberId}`, { method: "DELETE" });
      await invalidate(`/api/tenancies`, "/api/properties");
    },
    [id],
  );

  return {
    ...q,
    tenancy: q.data?.tenancy,
    access: q.data?.access,
    memberId: q.data?.memberId ?? null,
    isLandlord: q.data?.access === "LANDLORD",
    update,
    updateMember,
    removeMember,
  };
}

export async function createTenancy(unitId: string, input: TenancyInput) {
  const { tenancy } = await api<{ tenancy: TenancyDetail }>(`/api/units/${unitId}/tenancies`, {
    method: "POST",
    body: input,
  });
  await invalidate("/api/properties", "/api/tenancies");
  return tenancy;
}

/** Landlord: create, list and revoke invitations for a tenancy. */
export function useInvitations(tenancyId: string | undefined) {
  const q = useQuery<{ invitations: InvitationSummary[] }>(tenancyId ? `/api/tenancies/${tenancyId}/invitations` : null);

  const create = useCallback(
    async (email: string) => {
      const res = await api<{ url: string; invitation: InvitationSummary }>(`/api/tenancies/${tenancyId}/invitations`, {
        method: "POST",
        body: { email },
      });
      await invalidate(`/api/tenancies/${tenancyId}/invitations`);
      return res;
    },
    [tenancyId],
  );

  const revoke = useCallback(
    async (invitationId: string) => {
      await api(`/api/invitations/${invitationId}`, { method: "DELETE" });
      await invalidate(`/api/tenancies/${tenancyId}/invitations`);
    },
    [tenancyId],
  );

  return { ...q, invitations: q.data?.invitations, create, revoke };
}
