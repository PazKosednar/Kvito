import { useCallback } from "react";
import type { Role } from "@/types/user";
import { useAuth } from "./useAuth";

/** Active role of the signed-in user and switching between landlord and tenant views. */
export function useRole() {
  const { user, updateMe } = useAuth();
  const activeRole: Role | null = user?.activeRole ?? null;
  const otherRole: Role | null = activeRole === "LANDLORD" ? "TENANT" : activeRole === "TENANT" ? "LANDLORD" : null;

  const switchRole = useCallback((role: Role) => updateMe({ activeRole: role }), [updateMe]);

  return {
    activeRole,
    otherRole,
    roles: user?.roles ?? [],
    needsOnboarding: !!user && activeRole === null,
    switchRole,
  };
}
