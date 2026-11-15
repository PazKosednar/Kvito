import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Select } from "@/components/form";
import { ErrorState, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useAnnualSummary, usePaymentExport, type MoneyParts } from "@/hooks/useReports";
import { formatCents } from "@/lib/money";

const KINDS: (keyof MoneyParts)[] = ["rent", "costs", "deposit", "other"];

/**
 * Landlord: what arrived in a year, rent apart from reimbursed costs and the deposit – the numbers an accountant
 * asks for. A help for the records, not a tax calculation.
 */
export function AnnualSummaryPage() {
  const { t, i18n } = useTranslation();
  const toMessage = useErrorMessage();
  const { years } = usePaymentExport();
  const [year, setYear] = useState<number | null>(null);
  const selected = year ?? years[0] ?? new Date().getFullYear();
  const q = useAnnualSummary(selected);
  const [busy, setBusy] = useState<"csv" | "pdf" | null>(null);
  const monthName = (m: number) => new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, m - 1, 1)));

  const download = async (format: "csv" | "pdf") => {
    setBusy(format);
    try {
      await q.download(format);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const s = q.summary;
  return (
    <>
      <PageHeader back={ROUTES.payments} eyebrow={t("annual.eyebrow")} title={t("annual.title", { year: selected })} subtitle={t("annual.subtitle")} />
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <Select aria-label={t("exports.year")} className="w-28" value={selected} onChange={(e) => setYear(Number(e.target.value))}>
          {(years.length ? years : [selected]).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        {(["pdf", "csv"] as const).map((f) => (
          <Button key={f} variant="outline" disabled={busy !== null || !s} onClick={() => void download(f)}>
            {busy === f ? <Loader2 className="animate-spin" /> : <Download />}
            {f.toUpperCase()}
          </Button>
        ))}
      </div>

      {q.loading && !s ? (
        <LoadingState />
      ) : q.error || !s ? (
        <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />
      ) : s.units.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-4 text-ink-muted">{t("annual.empty")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4">
            {KINDS.map((k) => (
              <div key={k} className="bg-surface-raised p-4">
                <dt className="label-mono">{t(`annual.kind.${k}`)}</dt>
                <dd className="amount mt-1">{formatCents(s.totals[k])}</dd>
              </div>
            ))}
          </dl>
          {(s.returned.depositCents > 0 || s.returned.costsCents > 0) && (
            <p className="mt-3 text-sm text-ink-muted">{t("annual.returned", { deposit: formatCents(s.returned.depositCents), costs: formatCents(s.returned.costsCents) })}</p>
          )}

          {s.units.map((u) => (
            <Section key={u.tenancyId} title={`${u.property} · ${u.unit}`}>
              {u.tenants.length > 0 && <p className="-mt-1 mb-3 text-sm text-ink-muted">{u.tenants.join(", ")}</p>}
              <div className="overflow-x-auto rounded-md border border-line bg-surface-raised">
                <table className="w-full text-sm">
                  <caption className="sr-only">{t("annual.tableCaption", { unit: u.unit, year: s.year })}</caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="label-mono px-3 py-2 text-left">{t("contract.monthly.month")}</th>
                      {KINDS.map((k) => (
                        <th key={k} scope="col" className="label-mono px-3 py-2 text-right">{t(`annual.kind.${k}`)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {u.months
                      .filter((m) => KINDS.some((k) => m[k] !== 0))
                      .map((m) => (
                        <tr key={m.month}>
                          <th scope="row" className="px-3 py-2 text-left font-medium">{monthName(m.month)}</th>
                          {KINDS.map((k) => (
                            <td key={k} className="mono px-3 py-2 text-right whitespace-nowrap">{m[k] ? formatCents(m[k]) : "–"}</td>
                          ))}
                        </tr>
                      ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-line-strong">
                      <th scope="row" className="px-3 py-2 text-left font-semibold">{t("contract.monthly.total")}</th>
                      {KINDS.map((k) => (
                        <td key={k} className="mono px-3 py-2 text-right font-semibold whitespace-nowrap">{formatCents(u.totals[k])}</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Section>
          ))}
        </>
      )}

      {/* TODO(preveri): what counts as income from renting for the tax return, and which date decides the year. */}
      <p className="mt-10 text-sm text-ink-muted">{t("annual.disclaimer")}</p>
    </>
  );
}
