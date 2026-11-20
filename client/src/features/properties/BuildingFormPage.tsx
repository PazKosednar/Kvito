import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Field, MoneyInput, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useProperty } from "@/hooks/useProperties";
import { toDateInput } from "@/lib/dates";
import { centsToInput, parseAmountToCents } from "@/lib/money";

const year = (v: string) => {
  const n = Number(v.trim());
  return v.trim() && Number.isInteger(n) ? n : null;
};
const textOrNull = (v: string) => v.trim() || null;

/** Building details of a property: years, building manager, reserve fund, insurance. All optional. */
export function BuildingFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const navigate = useNavigate();
  const { property, loading, error, reload, update } = useProperty(id);

  const [yearBuilt, setYearBuilt] = useState("");
  const [yearRenovated, setYearRenovated] = useState("");
  const [managerName, setManagerName] = useState("");
  const [managerContact, setManagerContact] = useState("");
  const [reserveFund, setReserveFund] = useState("");
  const [insurer, setInsurer] = useState("");
  const [insurancePolicy, setInsurancePolicy] = useState("");
  const [insuranceValidUntil, setInsuranceValidUntil] = useState("");

  useEffect(() => {
    if (!property) return;
    setYearBuilt(property.yearBuilt?.toString() ?? "");
    setYearRenovated(property.yearRenovated?.toString() ?? "");
    setManagerName(property.managerName ?? "");
    setManagerContact(property.managerContact ?? "");
    setReserveFund(property.reserveFundCents == null ? "" : centsToInput(property.reserveFundCents));
    setInsurer(property.insurer ?? "");
    setInsurancePolicy(property.insurancePolicy ?? "");
    setInsuranceValidUntil(toDateInput(property.insuranceValidUntil));
  }, [property]);

  const back = `/nepremicnine/${id}`;
  const submit = useAsyncAction(async () => {
    await update({
      yearBuilt: year(yearBuilt),
      yearRenovated: year(yearRenovated),
      managerName: textOrNull(managerName),
      managerContact: textOrNull(managerContact),
      reserveFundCents: reserveFund.trim() ? parseAmountToCents(reserveFund) : null,
      insurer: textOrNull(insurer),
      insurancePolicy: textOrNull(insurancePolicy),
      insuranceValidUntil: insuranceValidUntil || null,
    });
    toast.success(t("building.saved"));
    void navigate(back);
  });

  if (loading) return <LoadingState />;
  if (error || !property) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;

  return (
    <>
      <PageHeader back={back} eyebrow={property.name} title={t("building.formTitle")} subtitle={t("building.formSubtitle")} />
      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit.run();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("building.yearBuilt")} error={submit.fieldErrors["yearBuilt"]}>
            {(p) => <TextInput {...p} inputMode="numeric" maxLength={4} value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} />}
          </Field>
          <Field label={t("building.yearRenovated")} error={submit.fieldErrors["yearRenovated"]}>
            {(p) => <TextInput {...p} inputMode="numeric" maxLength={4} value={yearRenovated} onChange={(e) => setYearRenovated(e.target.value)} />}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("building.managerName")}>
            {(p) => <TextInput {...p} maxLength={80} value={managerName} onChange={(e) => setManagerName(e.target.value)} />}
          </Field>
          <Field label={t("building.managerContact")} hint={t("building.managerContactHint")}>
            {(p) => <TextInput {...p} maxLength={120} value={managerContact} onChange={(e) => setManagerContact(e.target.value)} />}
          </Field>
        </div>
        <Field label={t("building.reserveFund")} error={submit.fieldErrors["reserveFundCents"]}>
          {(p) => <MoneyInput {...p} placeholder="0,00" value={reserveFund} onChange={(e) => setReserveFund(e.target.value)} className="sm:max-w-56" />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("building.insurer")}>
            {(p) => <TextInput {...p} maxLength={80} value={insurer} onChange={(e) => setInsurer(e.target.value)} />}
          </Field>
          <Field label={t("building.insurancePolicy")}>
            {(p) => <TextInput {...p} maxLength={60} value={insurancePolicy} onChange={(e) => setInsurancePolicy(e.target.value)} />}
          </Field>
        </div>
        <Field label={t("building.insuranceValidUntil")} error={submit.fieldErrors["insuranceValidUntil"]}>
          {(p) => <TextInput {...p} type="date" value={insuranceValidUntil} onChange={(e) => setInsuranceValidUntil(e.target.value)} className="sm:max-w-56" />}
        </Field>
        <FormError message={submit.error} />
        <Button type="submit" size="xl" disabled={submit.pending}>
          {submit.pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t("common.save")}
        </Button>
      </form>
    </>
  );
}
