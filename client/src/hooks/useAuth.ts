import { useCallback } from "react";
import { useAuthStore } from "@/auth/authStore";
import { api, refreshAccessToken } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { CurrentUser } from "@/types/user";
import { disablePush } from "@/lib/push";
import { closeSocket } from "@/lib/realtime";
import i18n from "@/i18n";
import { clearQueryCache } from "./useQuery";

/** The sign-in screen's language: a new account starts with it. */
const screenLocale = () => (i18n.language === "en" ? "en" : "sl");

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

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: CurrentUser }>("/api/auth/login", { method: "POST", body: { email, password }, auth: false });
    useAuthStore.getState().setSession(res.accessToken, res.user);
    return res.user;
  }, []);

  /** Creates the account; it works after the e-mailed code is entered (verifyEmail). */
  const register = useCallback(async (input: { name: string; email: string; password: string }) => {
    await api("/api/auth/register", { method: "POST", body: { ...input, acceptTerms: true, locale: screenLocale() }, auth: false });
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    const res = await api<{ accessToken: string; user: CurrentUser }>("/api/auth/verify-email", { method: "POST", body: { email, code }, auth: false });
    useAuthStore.getState().setSession(res.accessToken, res.user);
    return res.user;
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    await api("/api/auth/resend-verification", { method: "POST", body: { email }, auth: false });
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    await api("/api/auth/forgot-password", { method: "POST", body: { email }, auth: false });
  }, []);

  const resetPassword = useCallback(async (email: string, code: string, password: string) => {
    const res = await api<{ accessToken: string; user: CurrentUser }>("/api/auth/reset-password", { method: "POST", body: { email, code, password }, auth: false });
    useAuthStore.getState().setSession(res.accessToken, res.user);
    return res.user;
  }, []);

  /** Other devices are signed out; this one gets a fresh session. */
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api<{ accessToken: string }>("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });
    useAuthStore.getState().setAccessToken(res.accessToken);
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

  return {
    status,
    user,
    isAuthenticated: status === "authenticated",
    login,
    register,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    changePassword,
    logout,
    updateMe,
  };
}
