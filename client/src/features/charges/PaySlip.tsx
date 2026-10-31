import { Check, Copy, Download, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { usePayment } from "@/hooks/useCharges";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { formatReference } from "@/lib/upn";
import { LoadingState } from "@/components/layout-parts";

/**
 * Payment data as a UPN-style slip. A QR code can't be scanned from the same phone, so every value has a
 * copy button, and the QR can be saved as an image or sent by e-mail to scan from another screen.
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

  const amount = (payment.amountCents / 100).toFixed(2).replace(".", ",");
  const rows: { label: string; display: string; copy: string }[] = [
    { label: t("pay.iban"), display: payment.payeeIban, copy: payment.payeeIban.replace(/\s+/g, "") },
    { label: t("pay.amount"), display: formatCents(payment.amountCents), copy: amount },
    ...(payment.reference
      ? [{ label: t("pay.reference"), display: formatReference(payment.reference), copy: payment.reference.replace(/\s+/g, "") }]
      : []),
    { label: t("pay.purpose"), display: payment.purpose, copy: payment.purpose },
  ];

  return (
    <div>
      <div className="slip-perforation h-2 bg-slip" />
      <div className="rounded-b-xl bg-slip px-4 pt-4 pb-5 text-slip-foreground">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm opacity-80">{t("pay.payee")}</p>
            <p className="truncate font-semibold">{payment.payeeName}</p>
            {payment.payeeAddress && <p className="truncate text-sm opacity-80">{payment.payeeAddress}</p>}
          </div>
          <p className="shrink-0 text-2xl font-bold tracking-tight">{formatCents(payment.amountCents)}</p>
        </div>
        <p className="mt-1 text-sm opacity-80">{t("pay.dueBy", { date: formatDate(payment.dueDate) })}</p>

        <ul className="mt-4 flex flex-col gap-2">
          {rows.map((r) => (
            <CopyRow key={r.label} label={r.label} display={r.display} value={r.copy} />
          ))}
        </ul>

        {payment.qrSvg ? (
          <div className="mt-5 flex flex-col items-center gap-3">
            {/* Black on white, generous quiet zone – bank apps read it reliably. */}
            <div
              className="w-full max-w-60 rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              role="img"
              aria-label={t("pay.qrLabel")}
              dangerouslySetInnerHTML={{ __html: payment.qrSvg }}
            />
            <p className="text-center text-sm opacity-80">{t("pay.qrHint")}</p>
          </div>
        ) : (
          <p className="mt-4 rounded-md bg-slip-field px-3 py-2 text-sm">{t(`pay.qrUnavailable.${payment.qrUnavailable ?? "OTHER"}`, { defaultValue: t("pay.qrUnavailable.OTHER") })}</p>
        )}
      </div>

      {payment.qrSvg && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button variant="secondary" className="h-12" disabled={busy !== null} onClick={() => void run("save")}>
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Download />}
            {t("pay.saveQr")}
          </Button>
          <Button variant="secondary" className="h-12" disabled={busy !== null} onClick={() => void run("mail")}>
            {busy === "mail" ? <Loader2 className="animate-spin" /> : <Mail />}
            {t("pay.emailQr")}
          </Button>
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        {payment.payTo === "SUPPLIER" ? t("pay.supplierNote") : t("pay.noMoneyNote")}
      </p>
    </div>
  );
}

function CopyRow({ label, display, value }: { label: string; display: string; value: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard(1500);
  return (
    <li className="flex items-center gap-2 rounded-md bg-slip-field pl-3">
      <span className="min-w-0 flex-1 py-2">
        <span className="block text-xs opacity-75">{label}</span>
        <span className="block truncate font-semibold">{display}</span>
      </span>
      <button
        type="button"
        onClick={() => void copy(value)}
        aria-label={t("pay.copyLabel", { label })}
        className="flex h-12 shrink-0 items-center gap-1.5 rounded-r-md px-3 text-sm font-semibold hover:bg-black/5"
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        {copied ? t("common.copied") : t("common.copy")}
      </button>
    </li>
  );
}
