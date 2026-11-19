import { FileText, Loader2, ScanLine, Upload, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Field, MoneyInput, Segmented, Select, Textarea, TextInput } from "@/components/form";
import { FormError, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useBillScanner } from "@/hooks/useBillScanner";
import { uploadAttachment, useCharges } from "@/hooks/useCharges";
import { useChargeForm } from "@/hooks/useChargeForm";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { COST_TYPES, type Attachment, type PayTo } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";

/** Landlord adds a bill. Uploading the bill first fills everything in from its UPN QR code. */
export function ChargeFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const { tenancy } = useTenancyContext();
  const { create } = useCharges(tenancy.id);
  const form = useChargeForm(tenancy);
  const scanner = useBillScanner();
  const [file, setFile] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const { values: v, set, errors } = form;

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setUploading(true);
    try {
      const [att, bill] = await Promise.all([uploadAttachment(tenancy.id, f, "BILL"), scanner.scan(f)]);
      setFile(att);
      if (bill) form.applyScan(bill);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const save = useAsyncAction(async () => {
    const input = form.toInput(file ? [file.id] : []);
    if (!input) return;
    const charge = await create(input);
    toast.success(t("charges.created"));
    void navigate(`/najemi/${tenancy.id}/obveznosti/${charge.id}`, { replace: true });
  });

  const err = (k: keyof typeof v) => errors[k] ?? save.fieldErrors[k];
  const costOptions = [...tenancy.coveredCosts, ...COST_TYPES.filter((c) => !tenancy.coveredCosts.includes(c))];

  return (
    <>
      <PageHeader back={`/najemi/${tenancy.id}`} title={t("charges.newTitle")} subtitle={t("charges.newSubtitle")} />

      {/* Step 1: the bill itself – optional, but it saves typing. */}
      <div className="rounded-md border border-dashed p-4">
        {file ? (
          <div className="flex items-center gap-3">
            <FileText className="size-5 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate font-medium">{file.fileName}</span>
            <Button variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => { setFile(null); scanner.reset(); }}>
              <X />
            </Button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            </span>
            <span>
              <span className="block font-semibold">{t("charges.uploadBill")}</span>
              <span className="block text-sm text-muted-foreground">{t("charges.uploadBillHint")}</span>
            </span>
            <input type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
        )}
        {scanner.state === "found" && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-success">
            <ScanLine className="size-4" aria-hidden="true" />
            {t("charges.scanFound")}
          </p>
        )}
        {scanner.state === "notFound" && <p className="mt-3 text-sm text-muted-foreground">{t("charges.scanNotFound")}</p>}
      </div>

      <form
        noValidate
        className="mt-6 flex max-w-2xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <Field label={t("charges.costType")}>
          {(p) => (
            <Select {...p} value={v.costType} onChange={(e) => set("costType", e.target.value as typeof v.costType)}>
              {costOptions.map((c) => (
                <option key={c} value={c}>
                  {t(`costs.${c}`)}
                  {!tenancy.coveredCosts.includes(c) ? ` (${t("charges.notCovered")})` : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("charges.title")} hint={t("charges.titleHint")} error={err("title")}>
          {(p) => <TextInput {...p} value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("charges.amount")} error={err("amount")}>
            {(p) => <MoneyInput {...p} value={v.amount} onChange={(e) => set("amount", e.target.value)} />}
          </Field>
          <Field label={t("charges.dueDate")} error={err("dueDate")}>
            {(p) => <TextInput {...p} type="date" value={v.dueDate} onChange={(e) => set("dueDate", e.target.value)} />}
          </Field>
        </div>
        {tenancy.members.length > 1 && (
          <p className="text-sm text-muted-foreground">{t("charges.splitNote", { method: t(`split.${tenancy.splitMethod}`).toLowerCase() })}</p>
        )}

        <Section title={t("charges.whoGetsPaid")} className="mt-3">
          <Segmented<PayTo>
            label={t("charges.whoGetsPaid")}
            value={v.payTo}
            onChange={(x) => set("payTo", x)}
            options={[
              { value: "LANDLORD", label: t("charges.payTo.LANDLORD") },
              { value: "SUPPLIER", label: t("charges.payTo.SUPPLIER") },
            ]}
          />
          <p className="mt-2 text-sm text-muted-foreground">{t(`charges.payToHint.${v.payTo}`)}</p>
          {v.payTo === "SUPPLIER" && (
            <div className="mt-4 flex flex-col gap-5">
              <Field label={t("pay.payee")} error={err("payeeName")}>
                {(p) => <TextInput {...p} value={v.payeeName} onChange={(e) => set("payeeName", e.target.value)} maxLength={33} />}
              </Field>
              <Field label={t("pay.iban")} error={err("payeeIban")}>
                {(p) => <TextInput {...p} className="tabular" value={v.payeeIban} onChange={(e) => set("payeeIban", e.target.value.toUpperCase())} />}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("tenancies.payeeStreet")}>
                  {(p) => <TextInput {...p} value={v.payeeStreet} onChange={(e) => set("payeeStreet", e.target.value)} maxLength={33} />}
                </Field>
                <Field label={t("tenancies.payeeCity")}>
                  {(p) => <TextInput {...p} value={v.payeeCity} onChange={(e) => set("payeeCity", e.target.value)} maxLength={33} />}
                </Field>
              </div>
              <Field label={t("pay.reference")} hint={t("charges.referenceHint")} error={err("reference")}>
                {(p) => <TextInput {...p} className="tabular" value={v.reference} onChange={(e) => set("reference", e.target.value.toUpperCase())} placeholder="SI12 …" />}
              </Field>
            </div>
          )}
        </Section>

        <Field label={t("pay.purpose")} hint={t("charges.purposeHint")}>
          {(p) => <TextInput {...p} value={v.purpose} onChange={(e) => set("purpose", e.target.value)} maxLength={42} />}
        </Field>
        <Field label={t("charges.description")}>
          {(p) => <Textarea {...p} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} className="min-h-20" />}
        </Field>

        <FormError message={save.error} />
        <Button type="submit" size="xl" disabled={save.pending || uploading}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("charges.publish")}
        </Button>
      </form>
    </>
  );
}
