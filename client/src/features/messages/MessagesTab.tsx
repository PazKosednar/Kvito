import { ArrowDown, ArrowUp, CheckCheck, Info, Loader2, MessagesSquare, Paperclip, Receipt, Wrench } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { AttachmentList, PendingFiles } from "@/components/attachments";
import { ErrorState, FormError, LoadingState } from "@/components/layout-parts";
import { useAuth } from "@/hooks/useAuth";
import { useComposer } from "@/hooks/useComposer";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useMessages } from "@/hooks/useMessages";
import { formatDate, formatTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Message, PersonRef } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";

/** Messages of one person within this many minutes form one group (one name, one time). */
const GROUP_MINUTES = 5;

const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });

const displayName = (p: PersonRef | null | undefined) => p?.name?.trim() || p?.email || "";

const initials = (p: PersonRef | null | undefined) =>
  displayName(p)
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

function Avatar({ person, className }: { person: PersonRef | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold text-ink-muted", className)}
    >
      {initials(person)}
    </span>
  );
}

/**
 * The conversation of one tenancy: a messenger-like window (own scroll and composer on large screens),
 * messages grouped by person, mine in ink, system events as small labels.
 */
/**
 * On wide screens the conversation fills the window down to the page's bottom spacing, so the page itself
 * does not scroll (only the message list does). Measured, because the header above it varies in height.
 */
function useFitToViewport(loading: boolean) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia("(min-width: 1024px)");
    const fit = () => {
      if (!wide.matches) {
        el.style.height = "";
        return;
      }
      const main = el.closest("main");
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(420, Math.floor(window.innerHeight - top - bottom))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    wide.addEventListener("change", fit);
    return () => {
      window.removeEventListener("resize", fit);
      wide.removeEventListener("change", fit);
    };
  }, [loading]);
  return ref;
}

export function MessagesTab() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { user } = useAuth();
  const { tenancy } = useTenancyContext();
  const q = useMessages(tenancy.id);
  const composer = useComposer((body, files) => q.send(body, files));
  const listRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const panelRef = useFitToViewport(q.loading);
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  const count = q.messages.length;
  const { markRead } = q;

  // Reading the conversation marks it read; new messages keep the view at the bottom.
  useEffect(() => {
    if (count === 0) return;
    void markRead().catch(() => undefined);
    const list = listRef.current;
    if (list && list.scrollHeight > list.clientHeight) list.scrollTop = list.scrollHeight;
    else endRef.current?.scrollIntoView({ block: "end" });
  }, [count, markRead]);

  if (q.loading) return <LoadingState />;
  if (q.error) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;

  const people = [tenancy.unit.property.owner, ...tenancy.members.map((m) => m.user)].filter((p) => p.id !== user?.id);
  const hasUserMessages = q.messages.some((m) => m.kind === "USER");

  // "Prebrano" goes under my last message once someone else has read past it.
  const lastMine = [...q.messages].reverse().find((m) => m.author?.id === user?.id);
  const readByOther = lastMine && q.reads.some((r) => r.userId !== user?.id && r.lastReadAt >= lastMine.createdAt);

  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  const dayLabel = (iso: string) => {
    const k = dayKey(iso);
    return k === today ? t("messages.today") : k === yesterday ? t("messages.yesterday") : formatDate(k);
  };

  const sameGroup = (a: Message | undefined, b: Message | undefined) =>
    !!a &&
    !!b &&
    a.kind === "USER" &&
    b.kind === "USER" &&
    a.author?.id === b.author?.id &&
    dayKey(a.createdAt) === dayKey(b.createdAt) &&
    Math.abs(new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()) < GROUP_MINUTES * 60_000;

  return (
    <section ref={panelRef} aria-label={t("tabs.messages")} className="flex flex-col rounded-lg border border-line bg-surface-raised lg:overflow-hidden">
      {/* Who is in the conversation. */}
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="flex -space-x-1.5">
          {people.slice(0, 3).map((p) => (
            <Avatar key={p.id} person={p} className="border border-line-strong bg-surface-raised" />
          ))}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{people.map(displayName).join(", ")}</p>
          <p className="truncate text-xs text-ink-muted">{tenancy.unit.property.name}, {tenancy.unit.name}</p>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAwayFromEnd(el.scrollHeight - el.scrollTop - el.clientHeight > 160);
        }}
        className={cn(
          "flex-1 px-3 py-4 sm:px-5",
          // Own scroll on wide screens, without a visible scrollbar; the edges fade softly instead.
          "lg:overflow-y-auto lg:overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "lg:[mask-image:linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1rem),transparent)]",
        )}
      >
        {!hasUserMessages && (
          <div className="mx-auto mb-6 flex max-w-sm flex-col items-center py-6 text-center">
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-ink/[0.07]">
              <MessagesSquare className="size-5 text-ink-muted" aria-hidden="true" />
            </span>
            <p className="mt-3 font-semibold">{t("messages.emptyTitle")}</p>
            <p className="mt-1 text-sm text-ink-muted">{t("messages.emptyBody")}</p>
          </div>
        )}

        <ol className="flex flex-col" aria-live="polite">
          {q.messages.map((m, i) => {
            const prev = q.messages[i - 1];
            const next = q.messages[i + 1];
            const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
            const first = !sameGroup(prev, m);
            const last = !sameGroup(m, next);
            return (
              <Fragment key={m.id}>
                {newDay && (
                  <li className="my-5 flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-line" />
                    <span className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-faint uppercase">{dayLabel(m.createdAt)}</span>
                    <span className="h-px flex-1 bg-line" />
                  </li>
                )}
                {m.kind === "SYSTEM" ? (
                  <SystemLine message={m} tenancyId={tenancy.id} />
                ) : (
                  <Bubble
                    message={m}
                    mine={m.author?.id === user?.id}
                    first={first}
                    last={last}
                    tenancyId={tenancy.id}
                    read={m.id === lastMine?.id && !!readByOther}
                  />
                )}
              </Fragment>
            );
          })}
        </ol>
        <div ref={endRef} />
      </div>
      {awayFromEnd && (
        <button
          type="button"
          onClick={() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })}
          aria-label={t("messages.toLatest")}
          title={t("messages.toLatest")}
          className="absolute right-4 bottom-3 inline-flex size-9 items-center justify-center rounded-full border border-line-strong bg-surface-raised text-ink-muted transition-colors duration-150 hover:text-ink"
        >
          <ArrowDown className="size-4" aria-hidden="true" />
        </button>
      )}
      </div>

      {/* Composer: one rounded field with attach and send inside. */}
      <form
        className="sticky bottom-0 rounded-b-lg border-t border-line bg-surface-raised px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-4 lg:static lg:pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          void composer.submit();
        }}
      >
        <div className="flex flex-col gap-2 empty:hidden">
          <PendingFiles files={composer.files} onRemove={composer.removeFile} />
          <FormError message={composer.error} />
        </div>
        <div className="mt-0 flex items-end gap-1 rounded-3xl border border-line-strong bg-surface py-1 pr-1 pl-1 focus-within:border-ink">
          <label
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45"
            title={t("messages.attach")}
          >
            <Paperclip className="size-4" aria-hidden="true" />
            <span className="sr-only">{t("messages.attach")}</span>
            <input
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={composer.pending}
              onChange={(e) => {
                composer.addFiles([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="sr-only" htmlFor="message-body">
            {t("messages.placeholder")}
          </label>
          <textarea
            id="message-body"
            rows={1}
            value={composer.body}
            onChange={(e) => composer.setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void composer.submit();
              }
            }}
            placeholder={t("messages.placeholder")}
            maxLength={4000}
            className="field-sizing-content max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-ink-faint"
          />
          <button
            type="submit"
            disabled={!composer.canSend}
            aria-label={t("messages.send")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-surface transition-opacity duration-150 disabled:opacity-25"
          >
            {composer.pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </div>
      </form>
    </section>
  );
}

function Bubble({
  message: m,
  mine,
  first,
  last,
  tenancyId,
  read,
}: {
  message: Message;
  mine: boolean;
  first: boolean;
  last: boolean;
  tenancyId: string;
  read: boolean;
}) {
  const { t } = useTranslation();
  const onlyFiles = !m.body && !m.charge && !m.issue;
  return (
    <li className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start", first ? "mt-3" : "mt-0.5")}>
      {/* The other person's initials sit next to the last message of their group. */}
      {!mine && (last ? <Avatar person={m.author} className="mb-[1.375rem]" /> : <span className="w-8 shrink-0" aria-hidden="true" />)}
      <div className={cn("flex max-w-[80%] flex-col sm:max-w-[65%]", mine ? "items-end" : "items-start")}>
        {!mine && first && <span className="mb-1 px-3 text-xs text-ink-muted">{displayName(m.author)}</span>}
        <div
          className={cn(
            "rounded-2xl text-[15px] leading-snug",
            onlyFiles ? "p-1" : "px-3.5 py-2",
            mine ? "bg-ink text-surface" : "bg-ink/[0.07] text-ink",
            // The corners on the speaker's side are smaller where messages of a group meet (and at the bottom: a quiet "tail").
            mine ? "rounded-br-md" : "rounded-bl-md",
            mine && !first && "rounded-tr-md",
            !mine && !first && "rounded-tl-md",
          )}
        >
          {(m.charge || m.issue) && <LinkChip message={m} tenancyId={tenancyId} mine={mine} />}
          {m.body && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>}
          <AttachmentList files={m.attachments} className={cn(m.body && "mt-2", "[&_a]:bg-surface-raised")} />
        </div>
        {last && (
          <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-ink-faint tabular-nums">
            {formatTime(m.createdAt)}
            {read && (
              <>
                <CheckCheck className="ml-1 size-3.5" aria-hidden="true" />
                {t("messages.read")}
              </>
            )}
          </span>
        )}
      </div>
    </li>
  );
}

function LinkChip({ message: m, tenancyId, mine }: { message: Message; tenancyId: string; mine: boolean }) {
  const to = m.systemEvent?.startsWith("DEPOSIT_") || m.systemEvent?.startsWith("SETTLEMENT_") || m.systemEvent === "RENT_CHANGED" ? `/najemi/${tenancyId}/pogodba` : m.charge ? `/najemi/${tenancyId}/obveznosti/${m.charge.id}` : `/najemi/${tenancyId}/okvare/${m.issue!.id}`;
  const Icon = m.charge ? Receipt : Wrench;
  return (
    <Link
      to={to}
      className={cn(
        "mb-1.5 flex max-w-full items-center gap-1.5 border-b pb-1.5 text-xs font-medium hover:underline",
        mine ? "border-surface/20 text-surface/80" : "border-line text-ink-muted",
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{m.charge?.title ?? m.issue?.title}</span>
    </Link>
  );
}

/** System events (charge created, payment confirmed …) as a small centred label with an icon and a link. */
function SystemLine({ message: m, tenancyId }: { message: Message; tenancyId: string }) {
  const { t } = useTranslation();
  const d = m.systemData ?? {};
  // Any "…Cents" value becomes an amount (returnCents → {{return}}); from/to become dates (a month: its first day).
  const formatted: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k.endsWith("Cents") && typeof v === "number") formatted[k.slice(0, -5)] = formatCents(Math.abs(v));
    if ((k === "from" || k === "to") && typeof v === "string") formatted[k] = formatDate(v.length === 7 ? `${v}-01` : v);
  }
  const params = {
    ...d,
    ...formatted,
    amount: typeof d["amountCents"] === "number" ? formatCents(d["amountCents"]) : "",
    status: typeof d["status"] === "string" ? t(`issueStatus.${d["status"]}`) : "",
  };
  const text = t(`systemEvents.${m.systemEvent ?? "UNKNOWN"}`, { ...params, defaultValue: m.body });
  const to = m.charge ? `/najemi/${tenancyId}/obveznosti/${m.charge.id}` : m.issue ? `/najemi/${tenancyId}/okvare/${m.issue.id}` : null;
  const Icon = m.charge ? Receipt : m.issue ? Wrench : Info;
  const body = (
    <>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{text}</span>
      <span className="text-ink-faint tabular-nums">{formatTime(m.createdAt)}</span>
    </>
  );
  const cls = "inline-flex max-w-full items-center gap-2 rounded-full border border-line px-3 py-1.5 text-left text-xs text-ink-muted";
  return (
    <li className="my-3 flex justify-center px-2">
      {to ? (
        <Link to={to} className={cn(cls, "transition-colors duration-150 hover:border-line-strong hover:text-ink")}>
          {body}
        </Link>
      ) : (
        <span className={cls}>{body}</span>
      )}
    </li>
  );
}
