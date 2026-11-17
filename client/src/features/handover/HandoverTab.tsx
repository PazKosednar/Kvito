import { ArrowRight, Columns2, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Eyebrow } from "@/components/brand";
import { Field, Segmented, TextInput } from "@/components/form";
import { ErrorState, FormError, List, ListRow, LoadingState } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { UnitsIllustration } from "@/components/brand";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useHandovers } from "@/hooks/usePhase4";
import { formatDate, todayInput } from "@/lib/dates";
import type { HandoverKind } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { HandoverStatusBadge } from "./handover-ui";

export function HandoverTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord } = useTenancyContext();
  const q = useHandovers(tenancy.id);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<HandoverKind>("MOVE_IN");
  const [date, setDate] = useState(todayInput());
  const create = useAsyncAction(async () => {
    const h = await q.create(kind, date);
    if (h.copiedItems > 0) toast.success(t("handover.copiedFromMoveIn", { count: h.copiedItems }));
    void navigate(`/najemi/${tenancy.id}/primopredaja/${h.id}`);
  });

  if (q.loading) return <LoadingState />;
  if (q.error || !q.handovers) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const hasMoveIn = q.handovers.some((h) => h.kind === "MOVE_IN");
  const canCompare = hasMoveIn && q.handovers.some((h) => h.kind === "MOVE_OUT");

  return (
    <>
      {isLandlord && !creating && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus />
            {t("handover.new")}
          </Button>
        </div>
      )}
      {creating && (
        <form
          className="mb-8 flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void create.run();
          }}
        >
          <Field label={t("handover.kind")}>
            {() => (
              <Segmented<HandoverKind>
                label={t("handover.kind")}
                value={kind}
                onChange={setKind}
                options={(["MOVE_IN", "MOVE_OUT"] as const).map((k) => ({ value: k, label: t(`handoverKind.${k}`) }))}
              />
            )}
          </Field>
          {kind === "MOVE_OUT" && hasMoveIn && <p className="-mt-2 text-sm text-ink-muted">{t("handover.moveOutCopyHint")}</p>}
          <Field label={t("handover.date")}>{(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <FormError message={create.error} />
          <div className="flex gap-2">
            <Button type="submit" disabled={create.pending}>
              {create.pending && <Loader2 className="animate-spin" />}
              {t("handover.start")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </form>
      )}

      {canCompare && (
        <Link
          to={`/najemi/${tenancy.id}/primopredaja/primerjava`}
          className="on-panel kv-grid-panel mb-6 flex items-center gap-4 rounded-md p-5 transition-colors duration-150 hover:outline-[var(--line-strong)]"
        >
          <Columns2 className="size-6 shrink-0 text-signal" strokeWidth={1.5} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink-on-panel">{t("handover.compare.title")}</span>
            <span className="block text-sm text-ink-on-panel-muted">{t("handover.compare.teaser")}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-ink-on-panel-muted" aria-hidden="true" />
        </Link>
      )}

      {q.handovers.length === 0 && !creating ? (
        <div className="kv-grid-bg grid items-center gap-4 rounded-md border border-line p-5 sm:grid-cols-[1fr_14rem]">
          <div>
            <Eyebrow index="00">{t("tabs.handover")}</Eyebrow>
            <p className="mt-2 text-h3 font-semibold">{t("handover.emptyTitle")}</p>
            <p className="mt-1 text-ink-muted">{isLandlord ? t("handover.emptyLandlord") : t("handover.emptyTenant")}</p>
          </div>
          <UnitsIllustration className="max-w-56" />
        </div>
      ) : (
        <List>
          {q.handovers.map((h) => (
            <ListRow
              key={h.id}
              to={`/najemi/${tenancy.id}/primopredaja/${h.id}`}
              title={t(`handoverKind.${h.kind}`)}
              subtitle={<span className="mono">{formatDate(h.handoverOn)} · {t("handover.itemsCount", { count: h._count.items })}</span>}
              trailing={<HandoverStatusBadge status={h.status} />}
            />
          ))}
        </List>
      )}
    </>
  );
}
