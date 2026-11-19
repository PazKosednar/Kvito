import { ArrowUp, Loader2, MessageCircle, RotateCcw, X } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAssistant } from "@/hooks/useAssistant";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { cn } from "@/lib/utils";

/** **bold** inside a line. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

/** The assistant answers in short text with occasional lists; render just that, no HTML. */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ml-4 list-disc space-y-1">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const item = /^([-•*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[2]!);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

/**
 * Kvito assistant for landlords: a round button bottom right that opens a small chat about their own properties,
 * payments, repairs and taxes. A floating layer, so it may cast a shadow (CGP).
 */
export function AssistantWidget() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { available, messages, pending, error, ask, reset } = useAssistant(open);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const suggestions = t("assistant.suggestions", { returnObjects: true }) as string[];

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const send = (text: string) => {
    if (!text.trim() || pending) return;
    setDraft("");
    void ask(text).catch(() => setDraft(text));
  };

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-label={t("assistant.title")}
          className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom))] z-40 flex h-[min(34rem,calc(100dvh-6rem))] flex-col overflow-hidden rounded-md border border-line-strong bg-surface-raised shadow-xl sm:inset-x-auto sm:right-4 sm:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] sm:w-[24rem]"
        >
          <header className="on-panel flex items-start gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-on-panel">{t("assistant.title")}</p>
              <p className="text-sm text-ink-on-panel-muted">{t("assistant.subtitle")}</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                aria-label={t("assistant.clear")}
                title={t("assistant.clear")}
                className="inline-flex size-9 items-center justify-center rounded-sm text-ink-on-panel-muted transition-colors hover:text-ink-on-panel"
              >
                <RotateCcw className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("assistant.close")}
              className="inline-flex size-9 items-center justify-center rounded-sm text-ink-on-panel-muted transition-colors hover:text-ink-on-panel"
            >
              <X className="size-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4 text-[15px] leading-relaxed" aria-live="polite">
            {available === false ? (
              <p className="rounded-md border border-dashed border-line p-3 text-sm text-ink-muted">{t("assistant.disabled")}</p>
            ) : messages.length === 0 ? (
              <div className="flex flex-col gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    disabled={!available}
                    className="rounded-sm border border-line px-3 py-2 text-left text-sm transition-colors hover:border-line-strong hover:bg-surface-sunken disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
                <p className="mt-2 text-xs text-ink-faint">{t("assistant.privacy")}</p>
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {messages.map((m, i) => (
                  <li
                    key={i}
                    className={cn(
                      "max-w-[88%] rounded-md px-3 py-2",
                      m.role === "user" ? "self-end bg-surface-sunken whitespace-pre-wrap" : "self-start border border-line",
                    )}
                  >
                    {m.role === "assistant" ? <Answer text={m.content} /> : m.content}
                  </li>
                ))}
                {pending && (
                  <li className="flex items-center gap-2 self-start text-sm text-ink-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    {t("assistant.thinking")}
                  </li>
                )}
              </ol>
            )}
            {error != null && <p className="mt-3 text-sm text-danger">{toMessage(error)}</p>}
            <div ref={endRef} />
          </div>

          <form
            className="flex items-end gap-2 border-t border-line p-3"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={2000}
              disabled={available === false}
              placeholder={t("assistant.placeholder")}
              aria-label={t("assistant.placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(draft);
                }
              }}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-sm border border-input bg-card px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <button
              type="submit"
              disabled={!draft.trim() || pending || available === false}
              aria-label={t("assistant.send")}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="size-5" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? t("assistant.close") : t("assistant.open")}
        className={cn(
          "on-panel fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 inline-flex size-14 items-center justify-center rounded-full border border-line-strong shadow-lg transition-colors hover:border-ink-on-panel",
          open && "max-sm:hidden",
        )}
      >
        {open ? <X className="size-6 text-ink-on-panel" /> : <MessageCircle className="size-6 text-ink-on-panel" />}
      </button>
    </>
  );
}
