import { useCallback } from "react";
import { useAuthStore } from "@/auth/authStore";
import { api, apiBlob } from "@/lib/api";
import { closeSocket } from "@/lib/realtime";
import { saveBlob } from "./useReports";
import { clearQueryCache } from "./useQuery";

/** Data export and account deletion. */
export function usePrivacy() {
  const exportData = useCallback(async () => {
    saveBlob(await apiBlob("/api/privacy/export"), "kvito-moji-podatki.json");
  }, []);

  const deleteAccount = useCallback(async (email: string) => {
    await api("/api/privacy/account", { method: "DELETE", body: { email: email.trim().toLowerCase() } });
    // The server already removed sessions and devices; drop everything held locally too.
    useAuthStore.getState().clear();
    clearQueryCache();
    closeSocket();
    void globalThis.caches?.delete("kvito-api").catch(() => undefined);
  }, []);

  return { exportData, deleteAccount };
}
