import { useEffect, useState } from "react";
import { getSocket } from "@/lib/realtime";
import { invalidate } from "./useQuery";

const POLL_MS = 15_000;

/**
 * Keeps a tenancy's screens fresh: realtime events when the socket is connected,
 * polling every 15 s as a fallback (spec: Socket.IO with polling fallback).
 */
export function useRealtime(tenancyId: string | undefined) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!tenancyId) return;
    const s = getSocket();
    const refreshMessages = () => void invalidate(`/api/tenancies/${tenancyId}/messages`, "/api/messages/unread");
    const refreshOther = (p: { what?: string }) => {
      if (p.what === "charges") void invalidate(`/api/tenancies/${tenancyId}/charges`, "/api/charges/");
      else if (p.what === "issues") void invalidate(`/api/tenancies/${tenancyId}/issues`, "/api/issues/");
      // Deposit, advances, settlements and rent: everything under the tenancy plus settlement pages and linked charges.
      else if (p.what === "contract") void invalidate(`/api/tenancies/${tenancyId}`, "/api/settlements/", "/api/charges/");
      else void invalidate(`/api/tenancies/${tenancyId}`);
    };

    const join = () => s?.emit("join", tenancyId, (ok: boolean) => setConnected(ok));
    const down = () => setConnected(false);
    if (s) {
      s.on("connect", join);
      s.on("disconnect", down);
      s.on("message", refreshMessages);
      s.on("read", refreshMessages);
      s.on("changed", refreshOther);
      if (s.connected) join();
    }

    const poll = window.setInterval(() => {
      if (!s?.connected) {
        refreshMessages();
        void invalidate(`/api/tenancies/${tenancyId}/charges`, `/api/tenancies/${tenancyId}/issues`);
      }
    }, POLL_MS);

    return () => {
      window.clearInterval(poll);
      if (s) {
        s.emit("leave", tenancyId);
        s.off("connect", join);
        s.off("disconnect", down);
        s.off("message", refreshMessages);
        s.off("read", refreshMessages);
        s.off("changed", refreshOther);
      }
    };
  }, [tenancyId]);

  return { connected };
}
