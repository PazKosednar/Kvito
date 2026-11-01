import { Loader2, Receipt, Send, Wrench } from "lucide-react";
import { Fragment, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Eyebrow, UnitsIllustration } from "@/components/brand";
import { AttachmentList, FilePickerButton, PendingFiles } from "@/components/attachments";
import { ErrorState, FormError, LoadingState } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useComposer } from "@/hooks/useComposer";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useMessages } from "@/hooks/useMessages";
import { formatDate, formatTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";

export function MessagesTab() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { user } = useAuth();
  const { tenancy } = useTenancyContext();
  const q = useMessages(tenancy.id);
  const composer = useComposer((body, files) => q.send(body, files));
  const endRef = useRef<HTMLDivElement>(null);
  const count = q.messages.length;
  const { markRead } = q;

  // Reading the conversation marks it read; new messages keep the view at the bottom.
  useEffect(() => {
    if (count === 0) return;
    void markRead().catch(() => undefined);
    endRef.current?.scrollIntoView({ block: "end" });
  }, [count, markRead]);

  if (q.loading) return <LoadingState />;
  if (q.error) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;

  // "Prebrano" goes under my last message once someone else has read past it.
  const lastMine = [...q.messages].reverse().find((m) => m.author?.id === user?.id);
  const readByOther = lastMine && q.reads.some((r) => r.userId !== user?.id && r.lastReadAt >= lastMine.createdAt);

  return (
    <div className="flex flex-col">
      {q.messages.filter((m) => m.kind === "USER").length === 0 && (
        <div className="kv-grid-bg mb-6 grid items-center gap-4 rounded-md border border-line p-5 sm:grid-cols-[1fr_12rem]">
          <div>
            <Eyebrow index="00">{t("tabs.messages")}</Eyebrow>
            <p className="mt-2 text-h3 font-semibold">{t("messages.emptyTitle")}</p>
            <p className="mt-1 text-ink-muted">{t("messages.emptyBody")}</p>
          </div>
          <UnitsIllustration className="max-w-48" />
        </div>
      )}

      <ol className="flex flex-col gap-3" aria-live="polite">
        {q.messages.map((m, i) => {
          const prev = q.messages[i - 1];
          const newDay = !prev || prev.createdAt.slice(0, 10) !== m.createdAt.slice(0, 10);
          return (
            <Fragment key={m.id}>
              {newDay && (
                <li className="my-2 flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-line" />
                  <Eyebrow>{formatDate(m.createdAt)}</Eyebrow>
                  <span className="h-px flex-1 bg-line" />
                </li>
              )}
              {m.kind === "SYSTEM" ? (
                <SystemLine message={m} tenancyId={tenancy.id} />
              ) : (
                <Bubble message={m} mine={m.author?.id === user?.id} tenancyId={tenancy.id} read={m.id === lastMine?.id && !!readByOther} />
              )}
            </Fragment>
          );
        })}
      </ol>
      <div ref={endRef} />

      {/* Composer */}
      <form
        className="sticky bottom-0 mt-6 -mx-4 flex flex-col gap-3 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6"
        onSubmit={(e) => {
          e.preventDefault();
          void composer.submit();
        }}
      >
        <PendingFiles files={composer.files} onRemove={composer.removeFile} />
        <FormError message={composer.error} />
        <div className="flex items-end gap-2">
          <FilePickerButton onPick={composer.addFiles} label={t("messages.attach")} className="shrink-0 px-2.5 [&>span]:sr-only" disabled={composer.pending} />
          <label className="sr-only" htmlFor="message-body">
            {t("messages.placeholder")}
          </label>
          <textarea
            id="message-body"
            rows={1}
            value={composer.body}
            onChange={(e) => composer.setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void composer.submit();
              }
            }}
            placeholder={t("messages.placeholder")}
            maxLength={4000}
            className="field-sizing-content max-h-40 min-h-10 flex-1 resize-none rounded-sm border border-line-strong bg-surface-raised px-3 py-2 text-base outline-none placeholder:text-ink-faint focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
          />
          <Button type="submit" size="icon" disabled={!composer.canSend} aria-label={t("messages.send")}>
            {composer.pending ? <Loader2 className="animate-spin" /> : <Send />}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Bubble({ message: m, mine, tenancyId, read }: { message: Message; mine: boolean; tenancyId: string; read: boolean }) {
  const { t } = useTranslation();
  return (
    <li className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      {!mine && <span className="px-1 text-xs text-ink-faint">{m.author?.name ?? m.author?.email}</span>}
      <div
        className={cn(
          "max-w-[85%] rounded-md border px-3 py-2 sm:max-w-[70%]",
          mine ? "border-transparent bg-accent-soft text-ink" : "border-line bg-surface-raised",
        )}
      >
        {(m.charge || m.issue) && <LinkChip message={m} tenancyId={tenancyId} />}
        {m.body && <p className="text-sm leading-5 whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>}
        <AttachmentList files={m.attachments} className={m.body ? "mt-2" : undefined} />
      </div>
      <span className="mono px-1 text-[11px] text-ink-faint">
        {formatTime(m.createdAt)}
        {read && ` · ${t("messages.read")}`}
      </span>
    </li>
  );
}

function LinkChip({ message: m, tenancyId }: { message: Message; tenancyId: string }) {
  const to = m.systemEvent?.startsWith("DEPOSIT_") || m.systemEvent?.startsWith("SETTLEMENT_") || m.systemEvent === "RENT_CHANGED" ? `/najemi/${tenancyId}/pogodba` : m.charge ? `/najemi/${tenancyId}/obveznosti/${m.charge.id}` : `/najemi/${tenancyId}/okvare/${m.issue!.id}`;
  const Icon = m.charge ? Receipt : Wrench;
  return (
    <Link to={to} className="mb-1.5 inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-primary hover:underline">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{m.charge?.title ?? m.issue?.title}</span>
    </Link>
  );
}

/** System events (charge created, payment confirmed …) as a quiet centred line with a link. */
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
  return (
    <li className="flex justify-center px-4 text-center">
      <span className="text-xs text-ink-muted">
        {to ? (
          <Link to={to} className="hover:text-ink hover:underline">
            {text}
          </Link>
        ) : (
          text
        )}
        <span className="mono ml-2 text-[11px] text-ink-faint">{formatTime(m.createdAt)}</span>
      </span>
    </li>
  );
}
