import { CalendarClock, CalendarPlus, Copy, DoorClosed, Gauge, Link2Off, Loader2, ReceiptText, RefreshCw, TrendingUp, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { askConfirm } from "@/components/confirm-host";
import { ErrorState, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useCalendar, type CalendarEvent, type CalendarEventType } from "@/hooks/useCalendar";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { todayInput } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

const ICONS: Record<CalendarEventType, typeof ReceiptText> = {
  CHARGE_DUE: ReceiptText,
  LEASE_END: DoorClosed,
  RENT_REVIEW: CalendarClock,
  RENT_CHANGE: TrendingUp,
  ENERGY_CERT: Gauge,
};

const linkOf = (e: CalendarEvent) =>
  e.type === "CHARGE_DUE" && e.tenancyId
    ? `/najemi/${e.tenancyId}/obveznosti/${e.id.replace(/^charge-/, "")}`
    : e.type === "RENT_CHANGE" || e.type === "RENT_REVIEW"
      ? `/najemi/${e.tenancyId}/pogodba`
      : e.tenancyId
        ? `/najemi/${e.tenancyId}`
        : `/enote/${e.unitId}`;

/** Landlord: every date not to miss in one list, by month, plus a private link for Google/Apple/Outlook calendars. */
export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const toMessage = useErrorMessage();
  const q = useCalendar();
  const today = todayInput();

  const { overdue, months } = useMemo(() => {
    const overdue = q.events.filter((e) => e.overdue);
    const upcoming = q.events.filter((e) => !e.overdue && e.date >= today);
    const months = new Map<string, Map<string, CalendarEvent[]>>();
    for (const e of upcoming) {
      const month = e.date.slice(0, 7);
      const days = months.get(month) ?? new Map<string, CalendarEvent[]>();
      days.set(e.date, [...(days.get(e.date) ?? []), e]);
      months.set(month, days);
    }
    return { overdue, months };
  }, [q.events, today]);

  const monthLabel = (ym: string) =>
    new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${ym}-01T00:00:00Z`));

  return (
    <>
      <PageHeader eyebrow={t("calendar.eyebrow")} title={t("calendar.title")} subtitle={t("calendar.subtitle")} />

      <div className="grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {q.loading && !q.data ? (
            <LoadingState />
          ) : q.error ? (
            <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />
          ) : (
            <>
              {overdue.length > 0 && (
                <section aria-label={t("calendar.overdue")} className="mb-10">
                  <h2 className="mb-3 flex items-center gap-1.5 label-mono text-danger">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    {t("calendar.overdue")}
                  </h2>
                  <ul className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface-raised">
                    {overdue.map((e) => (
                      <EventRow key={e.id} e={e} showDate />
                    ))}
                  </ul>
                </section>
              )}
              {months.size === 0 && overdue.length === 0 && <p className="rounded-md border border-dashed border-line-strong p-5 text-ink-muted">{t("calendar.empty")}</p>}
              {[...months.entries()].map(([ym, days]) => (
                <section key={ym} aria-label={monthLabel(ym)} className="mb-10 last:mb-0">
                  <h2 className="mb-3 label-mono">{monthLabel(ym)}</h2>
                  <ol className="divide-y divide-line overflow-hidden rounded-md border border-line bg-surface-raised">
                    {[...days.entries()].map(([date, events]) => (
                      <li key={date} className="grid grid-cols-[3.5rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                        <DayCell date={date} today={date === today} />
                        <ul className="divide-y divide-line border-l border-line">
                          {events.map((e) => (
                            <EventRow key={e.id} e={e} />
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </>
          )}
        </div>

        <aside>
          <FeedCard />
        </aside>
      </div>
    </>
  );
}

function DayCell({ date, today }: { date: string; today: boolean }) {
  const { t, i18n } = useTranslation();
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { weekday: "short", timeZone: "UTC" }).format(d);
  return (
    <div className="flex flex-col items-center justify-center py-3 text-center">
      <span className={cn("font-mono text-xl leading-none tabular-nums", today && "font-semibold")}>{d.getUTCDate()}.</span>
      <span className="mt-1 font-mono text-[11px] tracking-[0.06em] text-ink-faint uppercase">{today ? t("calendar.today") : weekday}</span>
    </div>
  );
}

function EventRow({ e, showDate }: { e: CalendarEvent; showDate?: boolean }) {
  const { t } = useTranslation();
  const Icon = e.overdue ? TriangleAlert : ICONS[e.type];
  return (
    <li>
      <Link to={linkOf(e)} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-sunken">
        <Icon className={cn("size-4 shrink-0", e.overdue ? "text-danger" : "text-ink-faint")} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 block font-medium">{t(`calendar.types.${e.type}`, { title: e.title.replace(/^Rok: /, "") })}</span>
          <span className="block truncate text-sm text-ink-muted">
            {showDate && `${new Date(`${e.date}T00:00:00Z`).toLocaleDateString("sl-SI", { timeZone: "UTC" })} · `}
            {e.place}
          </span>
        </span>
        {e.amountCents !== null && <span className="shrink-0 font-mono text-sm tabular-nums">{formatCents(e.amountCents)}</span>}
        {e.overdue && <span className="shrink-0 text-sm text-danger">{t("calendar.late")}</span>}
      </Link>
    </li>
  );
}

/** Private .ics link: created on demand, shown once, can be replaced or switched off. */
function FeedCard() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const q = useCalendar();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (q.feed && !(await askConfirm(t("calendar.feed.replaceConfirm"), { danger: false, confirmLabel: t("calendar.feed.replace") }))) return;
    setBusy(true);
    try {
      setUrl(await q.createFeed());
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await askConfirm(t("calendar.feed.offConfirm"), { confirmLabel: t("calendar.feed.off") }))) return;
    try {
      await q.removeFeed();
      setUrl(null);
    } catch (err) {
      toast.error(toMessage(err));
    }
  };
  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url).then(
      () => toast.success(t("common.copied")),
      () => toast.error(t("errors.generic")),
    );
  };

  return (
    <section aria-label={t("calendar.feed.title")} className="rounded-md border border-line bg-surface-raised p-5 lg:sticky lg:top-6">
      <h2 className="flex items-center gap-2 font-semibold">
        <CalendarPlus className="size-5" aria-hidden="true" />
        {t("calendar.feed.title")}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">{t("calendar.feed.body")}</p>

      {url ? (
        <div className="mt-4">
          <p className="rounded-sm border border-line bg-surface px-3 py-2 font-mono text-xs break-all">{url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void copy()}>
              <Copy />
              {t("common.copy")}
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={url.replace(/^https?:/, "webcal:")}>{t("calendar.feed.open")}</a>
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-muted">{t("calendar.feed.once")}</p>
        </div>
      ) : q.feed ? (
        <p className="mt-4 text-sm">{t("calendar.feed.active", { date: new Date(q.feed.createdAt).toLocaleDateString("sl-SI") })}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {!url && (
          <Button size="sm" variant={q.feed ? "outline" : "default"} disabled={busy} onClick={() => void create()}>
            {busy ? <Loader2 className="animate-spin" /> : q.feed ? <RefreshCw /> : <CalendarPlus />}
            {q.feed ? t("calendar.feed.replace") : t("calendar.feed.create")}
          </Button>
        )}
        {(q.feed || url) && (
          <Button size="sm" variant="ghost" onClick={() => void remove()}>
            <Link2Off />
            {t("calendar.feed.off")}
          </Button>
        )}
      </div>
      <p className="mt-4 text-xs text-ink-faint">{t("calendar.feed.private")}</p>
    </section>
  );
}
