import { ArrowUp, CalendarClock, Calculator, Check, Clock, Copy, RotateCcw, Wallet, Wrench, X, type LucideIcon } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { KvitaMark } from "@/components/brand";
import { useAssistant } from "@/hooks/useAssistant";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { cn } from "@/lib/utils";

/** Starting questions, each with what it is about. */
const STARTERS: { key: string; icon: LucideIcon }[] = [
  { key: "late", icon: Clock },
  { key: "received", icon: Wallet },
  { key: "issues", icon: Wrench },
  { key: "ending", icon: CalendarClock },
  { key: "tax", icon: Calculator },
];

const AMOUNT = /(\d{1,3}(?:\.\d{3})*,\d{2}\s?€)/g;

/** Amounts in mono (as everywhere in Kvito), **bold** for names. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    const body = (bold ? part.slice(2, -2) : part).split(AMOUNT).map((p, j) =>
      j % 2 ? (
        <span key={j} className="font-mono text-[0.94em] whitespace-nowrap tabular-nums">
          {p}
        </span>
      ) : (
        <Fragment key={j}>{p}</Fragment>
      ),
    );
    return bold ? (
      <strong key={i} className="font-semibold">
        {body}
      </strong>
    ) : (
      <Fragment key={i}>{body}</Fragment>
    );
  });
}

/** The assistant writes short paragraphs and "- " lists; render just that (no HTML from the model). */
function Answer({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="flex flex-col gap-1.5">
        {list.map((li, i) => (
          <li key={i} className="flex gap-2.5">
            <span aria-hidden="true" className="text-ink-faint">
              –
            </span>
            <span className="min-w-0">{inline(li)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const item = /^(?:[-•*]|\d+\.)\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]!);
      continue;
    }
    flush();
    if (line) blocks.push(<p key={`p${blocks.length}`}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="flex flex-col gap-2.5">{blocks}</div>;
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text.replace(/\*\*/g, "")).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2 text-xs text-ink-faint transition-colors duration-150 hover:text-ink"
    >
      {done ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {done ? t("assistant.copied") : t("assistant.copy")}
    </button>
  );
}

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * "Vprašaj Kvito": the landlord's assistant. A trigger bottom right (Ctrl/⌘ K), a panel with the conversation
 * as questions and answers (no chat bubbles). Floating layer, so it may cast a shadow (CGP).
 */
export function AssistantWidget() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { available, messages, pending, error, failed, ask, reset } = useAssistant(open);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Ctrl/⌘ K opens and closes from anywhere; Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the newest text in view while the answer is being written.
  const last = messages[messages.length - 1]?.content;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, last, pending]);

  // The input grows with the text, up to about six lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [draft]);

  const send = (text: string) => {
    if (!text.trim() || pending || available === false) return;
    setDraft("");
    void ask(text);
  };

  // Pair the messages into question → answer turns.
  const turns: { q: string; a: string | null }[] = [];
  messages.forEach((m) => {
    if (m.role === "user") turns.push({ q: m.content, a: null });
    else if (turns.length) turns[turns.length - 1]!.a = m.content;
  });

  return (
    <>
      {open && (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="kv-assistant-title"
          className="animate-enter fixed inset-0 z-50 flex flex-col bg-surface-raised pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:inset-auto sm:right-5 sm:bottom-[5.5rem] sm:h-[min(40rem,calc(100dvh-8rem))] sm:w-[27rem] sm:overflow-hidden sm:rounded-lg sm:border sm:border-line-strong sm:pt-0 sm:pb-0 sm:shadow-2xl"
        >
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            <KvitaMark className="mt-0.5 size-6" />
            <div className="min-w-0 flex-1">
              <h2 id="kv-assistant-title" className="font-semibold">
                {t("assistant.title")}
              </h2>
              <p className="text-sm text-ink-muted">{t("assistant.subtitle")}</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={reset}
                aria-label={t("assistant.clear")}
                title={t("assistant.clear")}
                className="-mt-1 inline-flex size-9 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:text-ink"
              >
                <RotateCcw className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={close}
              aria-label={t("assistant.close")}
              className="-mt-1 -mr-2 inline-flex size-9 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-5 text-[15px] leading-relaxed" aria-live="polite">
            {available === false ? (
              <p className="text-ink-muted">{t("assistant.disabled")}</p>
            ) : turns.length === 0 && !failed ? (
              <>
                <p className="text-ink-muted">{t("assistant.intro")}</p>
                <ul className="mt-4 divide-y divide-line border-y border-line">
                  {STARTERS.map(({ key, icon: Icon }) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => send(t(`assistant.starters.${key}`))}
                        disabled={!available}
                        className="flex w-full items-center gap-3 py-3 text-left transition-colors duration-150 hover:text-ink disabled:opacity-50 [&:hover_svg]:text-ink"
                      >
                        <Icon className="size-4 shrink-0 text-ink-faint transition-colors duration-150" aria-hidden="true" />
                        <span>{t(`assistant.starters.${key}`)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ol className="flex flex-col gap-7">
                {turns.map((turn, i) => {
                  const writing = pending && i === turns.length - 1;
                  return (
                    <li key={i}>
                      <p className="font-semibold text-ink">{turn.q}</p>
                      <div className="mt-2 border-l-2 border-line-strong pl-4 text-ink">
                        {turn.a ? (
                          <>
                            <Answer text={turn.a} />
                            {!writing && (
                              <div className="-ml-2 mt-1">
                                <CopyButton text={turn.a} />
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-ink-muted">
                            <span className="animate-pulse">{t("assistant.thinking")}</span>
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {error != null && failed && (
              <div className="mt-6 border-l-2 border-warn pl-4">
                <p className="font-semibold">{failed}</p>
                <p className="mt-1 text-sm text-ink-muted">{toMessage(error)}</p>
                <button type="button" onClick={() => send(failed)} className="mt-2 text-sm font-medium text-ink underline underline-offset-4">
                  {t("assistant.retry")}
                </button>
              </div>
            )}
          </div>

          <form
            className="border-t border-line px-4 pt-3 pb-4"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <div className="flex items-end gap-2 rounded-md border border-input bg-card py-1.5 pr-1.5 pl-3 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
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
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                className="min-h-9 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!draft.trim() || pending || available === false}
                aria-label={t("assistant.send")}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground transition-opacity duration-150 disabled:opacity-30"
              >
                <ArrowUp className="size-4" />
              </button>
            </div>
            <p className="mt-2 hidden text-xs text-ink-faint sm:block">{t("assistant.hint")}</p>
          </form>
        </section>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-label={open ? t("assistant.close") : t("assistant.open")}
        className={cn(
          "on-panel fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 inline-flex size-14 items-center justify-center gap-2.5 rounded-full border border-line-strong shadow-lg transition-colors duration-150 hover:border-ink-on-panel-muted sm:right-5 sm:bottom-5 sm:h-12 sm:w-auto sm:pr-3 sm:pl-4",
          open && "max-sm:hidden",
        )}
      >
        {open ? <X className="size-5 text-ink-on-panel" /> : <KvitaMark className="size-6" />}
        <span className="hidden font-medium text-ink-on-panel sm:inline">{open ? t("assistant.closeShort") : t("assistant.trigger")}</span>
        <kbd className="hidden rounded-xs border border-ink-on-panel/20 px-1.5 py-0.5 font-mono text-[11px] text-ink-on-panel-muted sm:inline">
          {isMac() ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </>
  );
}
