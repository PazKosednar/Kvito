import { useCallback } from "react";
import { useAuthStore } from "@/auth/authStore";
import { api, refreshAccessToken } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { CurrentUser } from "@/types/user";
import { disablePush } from "@/lib/push";
import { closeSocket } from "@/lib/realtime";
import { clearQueryCache } from "./useQuery";

/**
 * Restores the session from the refresh cookie on app start. A temporarily unreachable server is retried
 * (3×, growing delay) instead of signing the person out.
 */
export async function bootstrapSession(attempt = 0): Promise<void> {
  const store = useAuthStore.getState();
  try {
    const token = await refreshAccessToken();
    if (!token) return store.clear();
    const { user } = await api<{ user: CurrentUser }>("/api/me");
    store.setSession(token, user);
  } catch (err) {
    if (err instanceof ApiError && err.code === "NETWORK" && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      return bootstrapSession(attempt + 1);
    }
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
    // This device must stop receiving the previous person's notifications.
    await disablePush().catch(() => undefined);
    try {
      await api("/api/auth/logout", { method: "POST", auth: false });
    } finally {
      useAuthStore.getState().clear();
      clearQueryCache();
      closeSocket();
      // Offline copies of this person's data must not outlive the session.
      void globalThis.caches?.delete("kvito-api").catch(() => undefined);
    }
  }, []);

  const updateMe = useCallback(async (patch: Partial<Pick<CurrentUser, "name" | "phone" | "locale" | "activeRole">>) => {
    const { user } = await api<{ user: CurrentUser }>("/api/me", { method: "PATCH", body: patch });
    useAuthStore.getState().setUser(user);
    return user;
  }, []);

  return { status, user, isAuthenticated: status === "authenticated", requestCode, verifyCode, logout, updateMe };
}
