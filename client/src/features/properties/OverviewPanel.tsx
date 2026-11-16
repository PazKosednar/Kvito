import { ArrowRight, Download, FileBarChart, Loader2, Upload } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Select } from "@/components/form";
import { PanelSummary } from "@/components/frame";
import { Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useOverview, usePaymentExport } from "@/hooks/useReports";
import { formatCents } from "@/lib/money";

/** The landlord's money at a glance, on the panel. Shown above the properties. */
export function OverviewPanel() {
  const { t } = useTranslation();
  const { totals } = useOverview();
  if (!totals || totals.overdueCount + totals.waitingCount + totals.openCount + totals.disputedCount === 0) return null;

  return (
    <PanelSummary
      eyebrow={t("overview.eyebrow")}
      action={
        <Link to={ROUTES.payments} className="inline-flex min-h-11 items-center gap-1 font-mono text-[11px] font-medium tracking-[0.08em] text-ink-on-panel-muted uppercase transition-colors duration-150 hover:text-ink-on-panel">
          {t("payments.title")}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      }
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
/** Entry to matching incoming payments from a bank statement. */
export function BankImportSection({ className = "mt-10" }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Section title={t("bank.title")} className={className}>
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface-raised p-4">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">{t("bank.entryHint")}</p>
        <Button asChild variant="secondary">
          <Link to={ROUTES.bankImport}>
            <Upload />
            {t("bank.cta")}
          </Link>
        </Button>
      </div>
    </Section>
  );
}

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
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-md border border-line bg-surface-raised p-4">
        <p className="min-w-0 flex-1 text-sm text-ink-muted">{t("annual.entryHint")}</p>
        <Button asChild variant="secondary">
          <Link to={ROUTES.annual}>
            <FileBarChart />
            {t("annual.cta")}
          </Link>
        </Button>
      </div>
    </Section>
  );
}
