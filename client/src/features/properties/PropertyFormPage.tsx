import { BriefcaseBusiness, Building2, House, HousePlus, Loader2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { Field, TextInput } from "@/components/form";
import { FormError, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useProperties, useProperty, type PropertyInput } from "@/hooks/useProperties";
import { cn } from "@/lib/utils";
import type { PropertyType } from "@/types/domain";

const TYPES: { value: PropertyType; icon: LucideIcon }[] = [
  { value: "HOUSE", icon: House },
  { value: "MULTI_UNIT_HOUSE", icon: HousePlus },
  { value: "APARTMENT", icon: Building2 },
  { value: "COMMERCIAL", icon: BriefcaseBusiness },
];

/** Create (/nepremicnine/nova) or edit (/nepremicnine/:id/uredi) a property. */
export function PropertyFormPage() {
  const { id } = useParams();
  const { property, loading } = useProperty(id);
  if (id && loading) return <LoadingState />;
  return <PropertyForm key={property?.id ?? "new"} id={id} initial={property} />;
}

function PropertyForm({ id, initial }: { id: string | undefined; initial: PropertyInput | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createProperty } = useProperties(false);
  const { update } = useProperty(id);
  const [v, setV] = useState<PropertyInput>({
    type: initial?.type ?? "APARTMENT",
    name: initial?.name ?? "",
    street: initial?.street ?? "",
    postalCode: initial?.postalCode ?? "",
    city: initial?.city ?? "",
  });
  const set = (k: keyof PropertyInput) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });

  const save = useAsyncAction(async () => {
    if (id) {
      await update(v);
      void navigate(`/nepremicnine/${id}`);
    } else {
      const created = await createProperty(v);
      // Next natural step: add the first unit.
      void navigate(`/nepremicnine/${created.id}`, { replace: true });
    }
  });

  return (
    <>
      <PageHeader
        back={id ? `/nepremicnine/${id}` : "/"}
        title={id ? t("properties.editTitle") : t("properties.newTitle")}
        subtitle={id ? undefined : t("properties.newSubtitle")}
      />
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("properties.type")}</legend>
          <div role="radiogroup" aria-label={t("properties.type")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map(({ value, icon: Icon }) => {
              const on = v.type === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setV({ ...v, type: value })}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-2 rounded-sm border px-2 py-3 text-center text-sm font-medium transition-colors duration-150",
                    on ? "border-primary bg-accent-soft text-foreground ring-1 ring-primary" : "border-line bg-card text-muted-foreground hover:border-line-strong hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-6", on && "text-primary")} strokeWidth={1.5} aria-hidden="true" />
                  {t(`properties.types.${value}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t(`properties.typeHints.${v.type}`)}</p>
        </fieldset>
        <Field label={t("properties.name")} hint={t(`properties.nameHints.${v.type}`)} error={save.fieldErrors["name"]}>
          {(p) => <TextInput {...p} value={v.name} onChange={set("name")} required maxLength={80} autoFocus={!id} />}
        </Field>
        <Field label={t("properties.street")} error={save.fieldErrors["street"]}>
          {(p) => <TextInput {...p} value={v.street} onChange={set("street")} required maxLength={80} autoComplete="street-address" />}
        </Field>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label={t("properties.postalCode")} error={save.fieldErrors["postalCode"]}>
            {(p) => (
              <TextInput {...p} value={v.postalCode} onChange={set("postalCode")} required inputMode="numeric" maxLength={4} pattern="\d{4}" autoComplete="postal-code" />
            )}
          </Field>
          <Field label={t("properties.city")} error={save.fieldErrors["city"]}>
            {(p) => <TextInput {...p} value={v.city} onChange={set("city")} required maxLength={60} autoComplete="address-level2" />}
          </Field>
        </div>
        <FormError message={save.error} />
        <Button type="submit" size="xl" disabled={save.pending}>
          {save.pending && <Loader2 className="animate-spin" />}
          {id ? t("common.save") : t("properties.create")}
        </Button>
      </form>
    </>
  );
}
