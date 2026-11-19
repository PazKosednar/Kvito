import { useCallback, useState } from "react";
import { api } from "@/lib/api";
import { useQuery } from "./useQuery";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Older turns are dropped so a long conversation stays within the server's limit (20 messages). */
const KEEP = 15;

/** Kvito assistant: is it switched on, the conversation (kept in memory for this session) and sending. */
export function useAssistant(enabled: boolean) {
  const status = useQuery<{ enabled: boolean }>(enabled ? "/api/assistant" : null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || pending) return;
      const next: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      setPending(true);
      setError(null);
      try {
        // The conversation sent to the server must start with a question.
        let history = next.slice(-KEEP);
        while (history[0]?.role === "assistant") history = history.slice(1);
        const { reply } = await api<{ reply: string }>("/api/assistant/chat", { method: "POST", body: { messages: history } });
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      } catch (err) {
        setError(err);
        // Take the unanswered question back out, so it can be asked again.
        setMessages((m) => m.slice(0, -1));
        throw err;
      } finally {
        setPending(false);
      }
    },
    [messages, pending],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { available: status.data?.enabled ?? null, messages, pending, error, ask, reset };
}
