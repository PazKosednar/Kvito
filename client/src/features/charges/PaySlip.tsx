import { Download, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card } from "@/components/brand";
import { LoadingState } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { usePayment } from "@/hooks/useCharges";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatReference } from "@/lib/upn";

/**
 * CGP PaymentPanel with the real UPN QR. A QR can't be scanned from the same phone, so every value has a
 * "Kopiraj" button; the QR can also be saved as an image or e-mailed. The QR keeps a pure white quiet zone
 * (the only exception to the tokens).
 */
export function PaySlip({ chargeId, shareId }: { chargeId: string; shareId: string }) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { payment, loading, saveQrImage, emailQr } = usePayment(chargeId, shareId);
  const [busy, setBusy] = useState<"save" | "mail" | null>(null);

  if (loading || !payment) return <LoadingState />;

  const run = async (kind: "save" | "mail") => {
    setBusy(kind);
    try {
      if (kind === "save") await saveQrImage();
      else toast.success(t("pay.emailed", { email: await emailQr() }));
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const rows: { label: string; display: string; copy: string }[] = [
    { label: t("pay.payee"), display: payment.payeeName, copy: payment.payeeName },
    { label: t("pay.iban"), display: payment.payeeIban, copy: payment.payeeIban.replace(/\s+/g, "") },
    { label: t("pay.amount"), display: formatCents(payment.amountCents), copy: (payment.amountCents / 100).toFixed(2).replace(".", ",") },
    ...(payment.reference ? [{ label: t("pay.reference"), display: formatReference(payment.reference), copy: payment.reference.replace(/\s+/g, "") }] : []),
    { label: t("pay.purpose"), display: payment.purpose, copy: payment.purpose },
  ];

  return (
    <div className="flex flex-col gap-3">
      <Card as="section" className="grid gap-6 p-5 sm:grid-cols-[168px_1fr] sm:p-6">
        <div className="flex flex-col items-center gap-4 sm:items-start">
          {payment.qrSvg ? (
            <div className="relative w-full max-w-[220px] rounded-sm border border-line-strong bg-white p-3 sm:max-w-[168px]">
              <div className="[&_svg]:block [&_svg]:h-auto [&_svg]:w-full" role="img" aria-label={t("pay.qrLabel")} dangerouslySetInnerHTML={{ __html: payment.qrSvg }} />
              <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 rounded-xs bg-panel px-1.5 py-0.5 font-mono text-[10px] leading-4 tracking-[0.08em] text-ink-on-panel uppercase">
                UPN QR
              </span>
            </div>
          ) : (
            <p className="rounded-sm bg-surface-sunken p-3 text-sm text-ink-muted">
              {t(`pay.qrUnavailable.${payment.qrUnavailable ?? "OTHER"}`, { defaultValue: t("pay.qrUnavailable.OTHER") })}
            </p>
          )}
          <p className="mono text-ink-muted sm:mt-2">{t("pay.dueShort", { date: formatDate(payment.dueDate) })}</p>
        </div>

        <div className="flex min-w-0 flex-col">
          {rows.map((r) => (
            <CopyRow key={r.label} label={r.label} display={r.display} value={r.copy} />
          ))}
        </div>

        <p className="text-sm text-ink-muted sm:col-span-2">{payment.qrSvg ? t("pay.qrHint") : t("pay.copyHint")}</p>
      </Card>

      {payment.qrSvg && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" disabled={busy !== null} onClick={() => void run("save")}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Download />}
            {t("pay.saveQr")}
          </Button>
          <Button variant="secondary" size="lg" disabled={busy !== null} onClick={() => void run("mail")}>
            {busy === "mail" ? <Loader2 className="animate-spin" /> : <Mail />}
            {t("pay.emailQr")}
          </Button>
        </div>
      )}
      <p className="text-sm text-ink-muted">{payment.payTo === "SUPPLIER" ? t("pay.supplierNote") : t("pay.noMoneyNote")}</p>
    </div>
  );
}

function CopyRow({ label, display, value }: { label: string; display: string; value: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard(1500);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-line py-2 last:border-b-0">
      <div className="min-w-0">
        <span className="block font-mono text-[11px] leading-4 font-medium tracking-[0.08em] text-ink-faint uppercase">{label}</span>
        <span className="block font-mono text-sm leading-5 [overflow-wrap:anywhere] text-ink">{display}</span>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void copy(value)} aria-label={t("pay.copyLabel", { label })}>
        {copied ? t("common.copied") : t("common.copy")}
      </Button>
    </div>
  );
}
