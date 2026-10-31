import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/auth/authStore";
import { api } from "@/lib/api";
import type { InvitationPreview } from "@/types/domain";
import type { CurrentUser } from "@/types/user";
import { invalidate } from "./useQuery";

/** Public invitation preview + accept (requires sign-in). */
export function useAcceptInvitation(token: string | undefined) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<{ invitation: InvitationPreview }>(`/api/invitations/${token}`, { auth: false })
      .then((r) => setPreview(r.invitation))
      .catch(setLoadError);
  }, [token]);

  const accept = useCallback(async () => {
    setAccepting(true);
    try {
      const { tenancyId } = await api<{ tenancyId: string }>(`/api/invitations/${token}/accept`, { method: "POST" });
      const { user } = await api<{ user: CurrentUser }>("/api/me");
      useAuthStore.getState().setUser(user);
      await invalidate("/api/tenancies");
      return tenancyId;
    } finally {
      setAccepting(false);
    }
  }, [token]);

  return { preview, loadError, accepting, accept };
}
