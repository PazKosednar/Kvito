import { useCallback, useRef, useState } from "react";
import { apiStream } from "@/lib/api";
import { useQuery } from "./useQuery";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Older turns are dropped so a long conversation stays within the server's limit (20 messages). */
const KEEP = 15;

/**
 * Kvito assistant: is it switched on, the conversation (in memory for this session only), and asking.
 * The answer is written into the conversation while it arrives.
 */
export function useAssistant(enabled: boolean) {
  const status = useQuery<{ enabled: boolean; included: boolean }>(enabled ? "/api/assistant" : null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** The question that failed, so "Poskusi znova" can ask it again. */
  const [failed, setFailed] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string) => {
      const text = question.trim();
      if (!text || pending) return;
      const asked: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages([...asked, { role: "assistant", content: "" }]);
      setPending(true);
      setError(null);
      setFailed(null);
      const ctrl = new AbortController();
      abort.current = ctrl;
      // The conversation sent to the server must start with a question.
      let history = asked.slice(-KEEP);
      while (history[0]?.role === "assistant") history = history.slice(1);
      try {
        await apiStream("/api/assistant/chat", { method: "POST", body: { messages: history }, signal: ctrl.signal }, (soFar) =>
          setMessages([...asked, { role: "assistant", content: soFar }]),
        );
      } catch (err) {
        if (ctrl.signal.aborted) return;
        setError(err);
        setFailed(text);
        // Take the unanswered question back out; it stays in the retry button.
        setMessages(messages);
      } finally {
        if (abort.current === ctrl) abort.current = null;
        setPending(false);
      }
    },
    [messages, pending],
  );

  const reset = useCallback(() => {
    abort.current?.abort();
    setMessages([]);
    setError(null);
    setFailed(null);
    setPending(false);
  }, []);

  return {
    available: status.data ? status.data.enabled && status.data.included : null,
    /** False when the plan has no assistant (free plan): show the upgrade instead. */
    included: status.data?.included ?? null,
    messages, pending, error, failed, ask, reset };
}
