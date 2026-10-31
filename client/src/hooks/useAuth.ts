import { useCallback } from "react";
import { useAuthStore } from "@/auth/authStore";
import { api, refreshAccessToken } from "@/lib/api";
import type { CurrentUser } from "@/types/user";
import { closeSocket } from "@/lib/realtime";
import { clearQueryCache } from "./useQuery";

/** Restores the session from the refresh cookie on app start. */
export async function bootstrapSession(): Promise<void> {
  const store = useAuthStore.getState();
  const token = await refreshAccessToken();
  if (!token) return store.clear();
  try {
    const { user } = await api<{ user: CurrentUser }>("/api/me");
    store.setSession(token, user);
  } catch {
    store.clear();
  }
}

export function useAuth() {
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  const requestCode = useCallback(async (email: string) => {
    await api("/api/auth/request-code", { method: "POST", body: { email }, auth: false });
  }, []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const res = await api<{ accessToken: string; user: CurrentUser }>("/api/auth/verify-code", {
      method: "POST",
      body: { email, code },
      auth: false,
    });
    useAuthStore.getState().setSession(res.accessToken, res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST", auth: false });
    } finally {
      useAuthStore.getState().clear();
      clearQueryCache();
      closeSocket();
    }
  }, []);

  const updateMe = useCallback(async (patch: Partial<Pick<CurrentUser, "name" | "phone" | "locale" | "activeRole">>) => {
    const { user } = await api<{ user: CurrentUser }>("/api/me", { method: "PATCH", body: patch });
    useAuthStore.getState().setUser(user);
    return user;
  }, []);

  return { status, user, isAuthenticated: status === "authenticated", requestCode, verifyCode, logout, updateMe };
}
