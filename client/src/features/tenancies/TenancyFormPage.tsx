import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate, useParams } from "react-router";
import { ChipGroup, Field, MoneyInput, Segmented, Select, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useAuth } from "@/hooks/useAuth";
import { createTenancy, useTenancy } from "@/hooks/useTenancies";
import { useTenancyForm } from "@/hooks/useTenancyForm";
import { COST_TYPES, type BillingMode, type SplitMethod, type TenancyDetail } from "@/types/domain";

/** Create (/enote/:unitId/najem) or edit (/najemi/:id/uredi) a tenancy. */
export function TenancyFormPage() {
  const { id } = useParams();
  const { tenancy, loading, error, reload, isLandlord } = useTenancy(id);
  const toMessage = useErrorMessage();
  if (id && loading) return <LoadingState />;
  // Editing: the tenancy must load and belong to this landlord (a tenant opening the address goes back to it).
  if (id && (error || !tenancy)) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;
  if (id && !isLandlord) return <Navigate to={`/najemi/${id}`} replace />;
  return <TenancyForm key={tenancy?.id ?? "new"} existing={tenancy} />;
}

function TenancyForm({ existing }: { existing: TenancyDetail | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { unitId } = useParams();
  const { user } = useAuth();
  const { update } = useTenancy(existing?.id);
  const form = useTenancyForm(existing, { payeeName: user?.name });
  const { values: v, set, errors } = form;

  const save = useAsyncAction(async () => {
    const input = form.toInput();
    if (!input) return;
    if (existing) {
      await update(input);
      void navigate(`/najemi/${existing.id}`);
    } else {
      const created = await createTenancy(unitId!, input);
      // Next natural step: invite the tenant.
      void navigate(`/najemi/${created.id}/povabi`, { replace: true });
    }
  });

  const fieldError = (k: keyof typeof v) => errors[k] ?? save.fieldErrors[k];

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back={existing ? `/najemi/${existing.id}` : undefined}
        title={existing ? t("tenancies.editTitle") : t("tenancies.newTitle")}
        subtitle={existing ? undefined : t("tenancies.newSubtitle")}
      />
      <form
        noValidate
        className="flex max-w-2xl flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <Section title={t("tenancies.sectionRent")}>
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("tenancies.rent")} error={fieldError("rent")}>
                {(p) => <MoneyInput {...p} value={v.rent} onChange={(e) => set("rent", e.target.value)} placeholder="650,00" />}
              </Field>
              <Field label={t("tenancies.dueDay")} hint={t("tenancies.dueDayHint")} error={fieldError("rentDueDay")}>
                {(p) => (
                  <TextInput {...p} value={v.rentDueDay} onChange={(e) => set("rentDueDay", e.target.value)} inputMode="numeric" maxLength={2} />
                )}
              </Field>
            </div>
            <Field label={t("tenancies.deposit")} hint={form.depositAboveThreeRents ? <span className="text-warn">{t("tenancies.depositHigh")}</span> : t("tenancies.depositHint")} error={fieldError("deposit")}>
              {(p) => <MoneyInput {...p} value={v.deposit} onChange={(e) => set("deposit", e.target.value)} />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("tenancies.start")} error={fieldError("startDate")}>
                {(p) => <TextInput {...p} type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} />}
              </Field>
              <Field label={t("tenancies.end")} hint={t("tenancies.endHint")} error={fieldError("endDate")}>
                {(p) => <TextInput {...p} type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} />}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("tenancies.noticePeriod")} hint={t("tenancies.noticePeriodHint")} error={fieldError("noticePeriodDays")}>
                {(p) => <TextInput {...p} value={v.noticePeriodDays} onChange={(e) => set("noticePeriodDays", e.target.value)} inputMode="numeric" maxLength={3} placeholder="30" />}
              </Field>
              <Field label={t("tenancies.rentReview")} hint={t("tenancies.rentReviewHint")}>
                {(p) => (
                  <Select {...p} value={v.rentReviewMonth} onChange={(e) => set("rentReviewMonth", e.target.value)}>
                    <option value="">{t("tenancies.rentReviewNone")}</option>
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={String(i + 1)}>
                        {t(`months.${i + 1}`)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </div>
        </Section>

        <Section title={t("tenancies.sectionPayee")}>
          <p className="-mt-1 mb-4 text-sm text-muted-foreground">{t("tenancies.payeeHint")}</p>
          <div className="flex flex-col gap-5">
            <Field label={t("tenancies.payeeName")} error={fieldError("payeeName")}>
              {(p) => <TextInput {...p} value={v.payeeName} onChange={(e) => set("payeeName", e.target.value)} maxLength={33} autoComplete="name" />}
            </Field>
            <Field label={t("tenancies.iban")} error={fieldError("payeeIban")}>
              {(p) => (
                <TextInput
                  {...p}
                  value={v.payeeIban}
                  onChange={(e) => set("payeeIban", e.target.value.toUpperCase())}
                  placeholder="SI56 0000 0000 0000 000"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="tabular"
                />
              )}
            </Field>
            <Field label={t("tenancies.payeeStreet")}>
              {(p) => <TextInput {...p} value={v.payeeStreet} onChange={(e) => set("payeeStreet", e.target.value)} maxLength={33} />}
            </Field>
            <Field label={t("tenancies.payeeCity")} hint={t("tenancies.payeeCityHint")}>
              {(p) => <TextInput {...p} value={v.payeeCity} onChange={(e) => set("payeeCity", e.target.value)} maxLength={33} placeholder="1000 Ljubljana" />}
            </Field>
            <Field label={t("tenancies.paymentNote")} hint={t("tenancies.paymentNoteHint")}>
              {(p) => <TextInput {...p} value={v.paymentNote} onChange={(e) => set("paymentNote", e.target.value)} maxLength={120} placeholder={t("tenancies.paymentNotePlaceholder")} />}
            </Field>
          </div>
        </Section>

        <Section title={t("tenancies.sectionCosts")}>
          <p className="-mt-1 mb-4 text-sm text-muted-foreground">{t("tenancies.costsHint")}</p>
          <ChipGroup
            label={t("tenancies.sectionCosts")}
            value={v.coveredCosts}
            onChange={(c) => set("coveredCosts", c)}
            options={COST_TYPES.map((c) => ({ value: c, label: t(`costs.${c}`) }))}
          />
          <div className="mt-6">
            <Field label={t("tenancies.billingMode")} hint={t(`tenancies.billingModeHint.${v.billingMode}`)}>
              {() => (
                <Segmented<BillingMode>
                  label={t("tenancies.billingMode")}
                  value={v.billingMode}
                  onChange={(m) => set("billingMode", m)}
                  options={(["COMBINED", "SEPARATE"] as const).map((m) => ({ value: m, label: t(`billingMode.${m}`) }))}
                />
              )}
            </Field>
          </div>
          <div className="mt-6">
            <Field label={t("tenancies.split")} hint={t(`tenancies.splitHint.${v.splitMethod}`)}>
              {() => (
                <Segmented<SplitMethod>
                  label={t("tenancies.split")}
                  value={v.splitMethod}
                  onChange={(m) => set("splitMethod", m)}
                  options={(["EQUAL", "PERCENTAGE", "PER_PERSON"] as const).map((m) => ({ value: m, label: t(`split.${m}`) }))}
                />
              )}
            </Field>
          </div>
        </Section>

        <div className="mt-8 flex flex-col gap-4">
          <FormError message={save.error} />
          <Button type="submit" size="xl" disabled={save.pending}>
            {save.pending && <Loader2 className="animate-spin" />}
            {existing ? t("common.save") : t("tenancies.createAndInvite")}
          </Button>
        </div>
      </form>
    </div>
  );
}
