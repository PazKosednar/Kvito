import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AttachmentList } from "@/components/attachments";
import { Card, Eyebrow } from "@/components/brand";
import { IsoGlyph } from "@/components/iso";
import { ErrorState, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useMeters } from "@/hooks/usePhase4";
import { formatDate } from "@/lib/dates";
import { METER_TYPES, METER_UNITS, type MeterReading } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { ReadingForm } from "./ReadingForm";

// Readings are shown as on the meter itself (no thousands separator), same as the handover and its PDF.
const fmt = (milli: number) => (milli / 1000).toLocaleString("sl-SI", { maximumFractionDigits: 3, useGrouping: false });

export function MetersTab() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy } = useTenancyContext();
  const q = useMeters(tenancy.id);
  const [adding, setAdding] = useState(false);

  if (q.loading) return <LoadingState />;
  if (q.error || !q.readings) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;

  // One series per meter (type + label), newest first.
  const series = new Map<string, MeterReading[]>();
  for (const r of q.readings) {
    const key = `${r.meterType}|${r.meterLabel ?? ""}`;
    series.set(key, [...(series.get(key) ?? []), r]);
  }
  const ordered = [...series.entries()].sort(([a], [b]) => METER_TYPES.indexOf(a.split("|")[0] as never) - METER_TYPES.indexOf(b.split("|")[0] as never));

  return (
    <>
      <div className="mb-4 flex justify-end">
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus />
            {t("meters.add")}
          </Button>
        )}
      </div>
      {adding && (
        <div className="mb-8">
          <ReadingForm
            onCancel={() => setAdding(false)}
            onSubmit={async (input, photos) => {
              const res = await q.add(input, photos);
              if (res.lowerThanPrevious) toast.warning(t("meters.lowerWarning"));
              else toast.success(t("meters.saved"));
            }}
          />
        </div>
      )}

      {ordered.length === 0 && !adding && (
        <div className="kv-grid-bg grid items-center gap-4 rounded-md border border-line p-5 sm:grid-cols-[1fr_12rem]">
          <div>
            <Eyebrow index="00">{t("tabs.meters")}</Eyebrow>
            <p className="mt-2 text-h3 font-semibold">{t("meters.emptyTitle")}</p>
            <p className="mt-1 text-ink-muted">{t("meters.emptyBody")}</p>
          </div>
          <IsoGlyph name="gauge" className="h-28 w-full" />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {ordered.map(([key, readings], i) => {
          const [latest, prev] = readings;
          const type = latest!.meterType;
          const delta = prev ? latest!.valueMilli - prev.valueMilli : null;
          return (
            <Card key={key} as="section" className="p-5">
              <Eyebrow index={String(i + 1).padStart(2, "0")}>
                {t(`meterType.${type}`)}
                {latest!.meterLabel ? ` · ${latest!.meterLabel}` : ""}
              </Eyebrow>
              <p className="amount mt-3">
                {fmt(latest!.valueMilli)} <span className="text-sm text-ink-muted">{METER_UNITS[type]}</span>
              </p>
              <p className="mono mt-1 text-ink-muted">{formatDate(latest!.readOn)}</p>
              {delta !== null && (
                <p className={delta < 0 ? "mt-2 text-sm text-warn" : "mt-2 text-sm text-ink-muted"}>
                  {delta < 0 ? t("meters.lowerThanBefore") : t("meters.usedSince", { amount: `${fmt(delta)} ${METER_UNITS[type]}`, date: formatDate(prev!.readOn) })}
                </p>
              )}
              <AttachmentList files={latest!.attachments} className="mt-3" />
              {readings.length > 1 && (
                <details className="mt-3 border-t border-line pt-2 text-sm">
                  <summary className="cursor-pointer py-1 text-ink-muted">{t("meters.history", { count: readings.length })}</summary>
                  <ul className="mt-1 divide-y divide-line">
                    {readings.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="mono text-ink-muted">{formatDate(r.readOn)}</span>
                        <span className="mono">{fmt(r.valueMilli)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          );
        })}
      </div>
      {ordered.length > 0 && (
        <Section>
          <p className="text-sm text-ink-muted">{t("meters.footnote")}</p>
        </Section>
      )}
    </>
  );
}
