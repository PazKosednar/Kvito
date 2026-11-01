import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Select } from "@/components/form";
import { PanelSummary } from "@/components/frame";
import { Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useOverview, usePaymentExport } from "@/hooks/useReports";
import { formatCents } from "@/lib/money";

/** The landlord's money at a glance, on the dark panel. Shown above the properties. */
export function OverviewPanel() {
  const { t } = useTranslation();
  const { totals } = useOverview();
  if (!totals || totals.overdueCount + totals.waitingCount + totals.openCount + totals.disputedCount === 0) return null;

  return (
    <PanelSummary
      eyebrow={t("overview.eyebrow")}
      items={[
        {
          label: t("overview.overdue"),
          value: totals.overdueCount ? `${formatCents(totals.overdueCents)}` : "–",
          tone: totals.overdueCount ? "warn" : "default",
        },
        { label: totals.waitingCount ? `${t("overview.waiting")} · ${totals.waitingCount}` : t("overview.waiting"), value: totals.waitingCount ? formatCents(totals.waitingCents) : "–" },
        { label: t("overview.open"), value: totals.openCents ? formatCents(totals.openCents) : "–" },
      ]}
    />
  );
}

/** One short line per unit: what needs the landlord's attention there. */
export function useUnitAttention() {
  const { t } = useTranslation();
  const { byTenancy } = useOverview();
  return (tenancyId: string | undefined): { text: string; warn: boolean } | null => {
    const row = tenancyId ? byTenancy[tenancyId] : undefined;
    if (!row) return null;
    if (row.overdueCount) return { text: t("overview.unitOverdue", { amount: formatCents(row.overdueCents) }), warn: true };
    if (row.disputedCount) return { text: t("overview.unitDisputed", { count: row.disputedCount }), warn: true };
    if (row.waitingCount) return { text: t("overview.unitWaiting", { count: row.waitingCount }), warn: false };
    return null;
  };
}

/** Yearly list of received payments for the accountant. */
export function ExportsSection() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { years, download } = usePaymentExport();
  const [year, setYear] = useState<number | null>(null);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const selected = year ?? years[0];
  if (!selected) return null;

  const run = async (format: "csv" | "pdf") => {
    setBusy(format);
    try {
      await download(selected, format);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title={t("exports.title")} className="mt-10">
      <p className="mb-4 max-w-[56ch] text-sm text-muted-foreground">{t("exports.body")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Select aria-label={t("exports.year")} className="w-28" value={selected} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        {(["csv", "pdf"] as const).map((f) => (
          <Button key={f} variant="outline" disabled={busy !== null} onClick={() => void run(f)}>
            {busy === f ? <Loader2 className="animate-spin" /> : <Download />}
            {f.toUpperCase()}
          </Button>
        ))}
      </div>
    </Section>
  );
}
