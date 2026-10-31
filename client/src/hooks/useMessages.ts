import { useCallback } from "react";
import { api } from "@/lib/api";
import type { ConversationRead, Message } from "@/types/domain";
import { uploadAttachment } from "./useCharges";
import { invalidate, useQuery } from "./useQuery";

/** The conversation of a tenancy: messages, read markers, sending with attachments. */
export function useMessages(tenancyId: string | undefined) {
  const path = tenancyId ? `/api/tenancies/${tenancyId}/messages` : null;
  const q = useQuery<{ messages: Message[]; hasMore: boolean; reads: ConversationRead[] }>(path);

  const send = useCallback(
    async (body: string, files: File[], links: { chargeId?: string; issueId?: string } = {}) => {
      const attachments = await Promise.all(files.map((f) => uploadAttachment(tenancyId!, f, "MESSAGE")));
      await api(`/api/tenancies/${tenancyId}/messages`, {
        method: "POST",
        body: { body, attachmentIds: attachments.map((a) => a.id), ...links },
      });
      await invalidate(path!, "/api/messages/unread");
    },
    [tenancyId, path],
  );

  const markRead = useCallback(async () => {
    if (!tenancyId) return;
    await api(`/api/tenancies/${tenancyId}/messages/read`, { method: "POST" });
    await invalidate("/api/messages/unread");
  }, [tenancyId]);

  return { ...q, messages: q.data?.messages ?? [], reads: q.data?.reads ?? [], send, markRead };
}

/** Unread message counts per tenancy (tab badge). */
export function useUnread() {
  const q = useQuery<{ unread: Record<string, number> }>("/api/messages/unread");
  return q.data?.unread ?? {};
}
