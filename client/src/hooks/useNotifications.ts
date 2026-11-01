import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { currentPushSubscription, disablePush, enablePush, pushSupported } from "@/lib/push";
import { invalidate, useQuery } from "./useQuery";

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

const PATH = "/api/notifications";
const REFRESH_MS = 60_000;

/** Inbox + unread count. Refreshes every minute and whenever the app comes back to the foreground. */
export function useNotifications() {
  const q = useQuery<{ notifications: AppNotification[]; unread: number }>(PATH);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") void invalidate(PATH);
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const markRead = useCallback(async (ids?: string[]) => {
    await api(`${PATH}/read`, { method: "POST", body: ids ? { ids } : {} });
    await invalidate(PATH);
  }, []);

  return { ...q, notifications: q.data?.notifications ?? [], unread: q.data?.unread ?? 0, markRead };
}

const CHARGE_URL = /^\/najemi\/([^/]+)\/obveznosti\/([^/]+)/;

/** What is new per tenancy: unread notifications about charges, grouped by tenancy and by charge. */
export function useNewCharges() {
  const { notifications } = useNotifications();
  return useMemo(() => {
    const byTenancy: Record<string, number> = {};
    const unreadByCharge: Record<string, string[]> = {};
    for (const n of notifications) {
      const m = n.readAt || !n.url ? null : CHARGE_URL.exec(n.url);
      if (!m) continue;
      byTenancy[m[1]!] = (byTenancy[m[1]!] ?? 0) + 1;
      (unreadByCharge[m[2]!] ??= []).push(n.id);
    }
    return { byTenancy, unreadByCharge };
  }, [notifications]);
}

export type PushState = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

/** Push opt-in for this device. */
export function usePushSetup() {
  const config = useQuery<{ publicKey: string | null }>("/api/push/config");
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  const publicKey = config.data?.publicKey;
  useEffect(() => {
    if (!config.data) return;
    void (async () => {
      if (!pushSupported()) return setState("unsupported");
      if (!publicKey) return setState("unconfigured");
      if (Notification.permission === "denied") return setState("denied");
      setState((await currentPushSubscription()) ? "on" : "off");
    })();
  }, [config.data, publicKey]);

  const enable = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    try {
      setState(await enablePush(publicKey));
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      await disablePush();
      setState("off");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, enable, disable };
}
