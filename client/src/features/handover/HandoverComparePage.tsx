import { ArrowDown, ArrowRight, ArrowUp, Equal, HelpCircle, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Card, Eyebrow } from "@/components/brand";
import { Segmented } from "@/components/form";
import { ErrorState, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useHandoverCompare } from "@/hooks/usePhase4";
import { apiUrl } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Attachment, HandoverCompareRow, HandoverItem, ItemChange } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { ConditionLabel } from "./handover-ui";

/** Change marker: always a word and an icon (CGP). Worse is the one that needs attention. */
const CHANGE: Record<ItemChange, { icon: typeof Equal; className: string }> = {
  SAME: { icon: Equal, className: "text-ink-muted" },
  BETTER: { icon: ArrowUp, className: "text-primary" },
  WORSE: { icon: ArrowDown, className: "bg-warn-soft text-warn" },
  NEW: { icon: Plus, className: "text-ink-muted" },
  NOT_CHECKED: { icon: HelpCircle, className: "text-ink-muted" },
};

export function ChangeLabel({ change }: { change: ItemChange }) {
  const { t } = useTranslation();
  const { icon: Icon, className } = CHANGE[change];
  return (
    <span className={cn("inline-flex h-6 shrink-0 items-center gap-1.5 rounded-xs px-2 font-mono text-[11px] font-medium tracking-[0.06em] uppercase", className)}>
      <Icon className="size-3" aria-hidden="true" />
      {t(`handover.compare.change.${change}`)}
    </span>
  );
}

const images = (files: Attachment[]) => files.filter((f) => f.mimeType.startsWith("image/") && f.mimeType !== "image/heic");

/** One side (move-in or move-out): condition, note and photos; a quiet placeholder when there is nothing. */
function Side({ item, label }: { item: HandoverItem | null; label: string }) {
  const { t } = useTranslation();
  const photos = item ? images(item.attachments) : [];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="font-mono text-[11px] tracking-[0.08em] text-ink-faint uppercase">{label}</span>
        {item && <ConditionLabel condition={item.condition} />}
      </div>
      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-1.5">
          {photos.slice(0, 4).map((f) => (
            <a key={f.id} href={apiUrl(f.url)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xs border border-line bg-surface-sunken">
              <img src={apiUrl(f.url)} alt={f.fileName} loading="lazy" className="aspect-[4/3] w-full object-cover" />
            </a>
          ))}
        </div>
      ) : (
        <div className="flex aspect-[8/3] items-center justify-center rounded-xs border border-dashed border-line text-center text-xs text-ink-faint">
          {item ? t("handover.compare.noPhoto") : t("handover.compare.notRecorded")}
        </div>
      )}
      {item?.note && <p className="text-sm text-ink-muted">{item.note}</p>}
    </div>
  );
}

function Row({ row }: { row: HandoverCompareRow }) {
  const { t } = useTranslation();
  return (
    <li className={cn("flex flex-col gap-3 px-4 py-4", row.change === "WORSE" && "bg-warn-soft/40")}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{row.name}</span>
        <ChangeLabel change={row.change} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <Side item={row.before} label={t("handoverKind.MOVE_IN")} />
        <ArrowRight className="mt-8 size-4 text-ink-faint" aria-hidden="true" />
        <Side item={row.after} label={t("handoverKind.MOVE_OUT")} />
      </div>
    </li>
  );
}

/** Before and after: the latest move-in next to the latest move-out, room by room. */
export function HandoverComparePage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord } = useTenancyContext();
  const q = useHandoverCompare(tenancy.id);
  const [filter, setFilter] = useState<"changes" | "all">("changes");

  if (q.loading) return <LoadingState />;
  if (q.error || !q.compare) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const { moveIn, moveOut, rows, summary } = q.compare;
  const back = `/najemi/${tenancy.id}/primopredaja`;

  if (!moveIn || !moveOut) {
    return (
      <>
        <PageHeader back={back} eyebrow={t("tabs.handover")} title={t("handover.compare.title")} />
        <p className="text-ink-muted">{t("handover.compare.needBoth")}</p>
      </>
    );
  }

  const changed = rows.filter((r) => r.change !== "SAME");
  const shown = filter === "changes" ? changed : rows;
  const rooms = [...new Set(shown.map((r) => r.room))];

  return (
    <>
      <PageHeader
        back={back}
        eyebrow={`${formatDate(moveIn.handoverOn)} → ${formatDate(moveOut.handoverOn)}`}
        title={t("handover.compare.title")}
      />

      {/* Summary */}
      <section className="on-panel kv-grid-panel rounded-md p-5 sm:p-6">
        <Eyebrow index="01">{t("handover.compare.summary")}</Eyebrow>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {(["WORSE", "SAME", "BETTER", "NEW", "NOT_CHECKED"] as const).map((c) => (
            <li key={c} className="flex items-center gap-2">
              <span className="font-mono text-2xl font-medium text-ink-on-panel tabular-nums">{summary[c]}</span>
              <ChangeLabel change={c} />
            </li>
          ))}
        </ul>
        {isLandlord && summary.WORSE > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-on-panel-muted">{t("handover.compare.depositHint")}</p>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/najemi/${tenancy.id}/pogodba/varscina`}>{t("handover.compare.toDeposit")}</Link>
            </Button>
          </div>
        )}
      </section>

      <div className="mt-6 mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented<"changes" | "all">
          label={t("handover.compare.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "changes", label: t("handover.compare.onlyChanges", { count: changed.length }) },
            { value: "all", label: t("handover.compare.all", { count: rows.length }) },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <p className="rounded-md border border-line bg-surface-raised p-5 text-ink-muted">{t("handover.compare.noChanges")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {rooms.map((room) => (
            <Card key={room} as="section">
              <h3 className="border-b border-line px-4 py-3 font-semibold">{room}</h3>
              <ul className="divide-y divide-line">
                {shown
                  .filter((r) => r.room === room)
                  .map((r, i) => (
                    <Row key={`${r.before?.id ?? "x"}-${r.after?.id ?? "y"}-${i}`} row={r} />
                  ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
