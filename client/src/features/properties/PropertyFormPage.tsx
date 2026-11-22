import { BriefcaseBusiness, Building2, House, HousePlus, Loader2, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { Field, Select, TextInput } from "@/components/form";
import { FormError, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useProperties, useProperty, type PropertyInput } from "@/hooks/useProperties";
import { cn } from "@/lib/utils";
import { isSingleUnit, UNIT_LAYOUTS, type PropertyType, type UnitLayout } from "@/types/domain";
import { fromTri, parseDecimal, TriField, type Tri } from "./details-ui";

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
  const [yearBuilt, setYearBuilt] = useState(initial?.yearBuilt ? String(initial.yearBuilt) : "");
  // Details of the whole property (house, apartment, commercial space), asked only when it is added.
  const [layout, setLayout] = useState<UnitLayout | "">("");
  const [area, setArea] = useState("");
  const [parking, setParking] = useState<Tri>("");
  const [storage, setStorage] = useState<Tri>("");
  const [balcony, setBalcony] = useState<Tri>("");
  const single = isSingleUnit(v.type);
  const hasRooms = v.type === "HOUSE" || v.type === "APARTMENT";

  const save = useAsyncAction(async () => {
    const year = yearBuilt.trim() ? Number(yearBuilt) : null;
    if (id) {
      await update({ ...v, yearBuilt: year });
      void navigate(`/nepremicnine/${id}`);
    } else {
      const created = await createProperty({
        ...v,
        yearBuilt: year,
        ...(single
          ? {
              unit: {
                name: t(`properties.wholeUnit.${v.type}`),
                layout: hasRooms && layout ? layout : null,
                areaM2: parseDecimal(area),
                hasParking: fromTri(parking),
                hasStorage: fromTri(storage),
                hasBalcony: fromTri(balcony),
              },
            }
          : {}),
      });
      // Next: a whole property gets its tenancy right away, a multi-unit house its first unit.
      void navigate(`/nepremicnine/${created.id}`, { replace: true });
    }
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        back={id ? `/nepremicnine/${id}` : "/"}
        title={id ? t("properties.editTitle") : t("properties.newTitle")}
        subtitle={id ? undefined : t(single ? "properties.newSubtitleWhole" : "properties.newSubtitle")}
      />
      <form
        className="flex max-w-2xl flex-col gap-5"
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

        <h2 className="mt-4 label-mono">{t("properties.aboutTitle")}</h2>
        {single && !id && (
          <>
            <div className={cn("grid gap-5", hasRooms ? "sm:grid-cols-2" : "sm:max-w-xs")}>
              {hasRooms && (
                <Field label={t("properties.rooms")}>
                  {(p) => (
                    <Select {...p} value={layout} onChange={(e) => setLayout(e.target.value as UnitLayout | "")}>
                      <option value="">–</option>
                      {UNIT_LAYOUTS.map((l) => (
                        <option key={l} value={l}>
                          {t(`unitDetails.layouts.${l}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label={`${t("unitDetails.area")} (${t("unitDetails.areaUnit")})`} error={save.fieldErrors["unit.areaM2"]}>
                {(p) => <TextInput {...p} inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />}
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <TriField label={t("unitDetails.parking")} value={parking} onChange={setParking} />
              <TriField label={t("unitDetails.storage")} value={storage} onChange={setStorage} />
              <TriField label={t("unitDetails.balcony")} value={balcony} onChange={setBalcony} />
            </div>
          </>
        )}
        <Field label={t("properties.yearBuilt")} hint={t("properties.aboutHint")} error={save.fieldErrors["yearBuilt"]} className="sm:max-w-xs">
          {(p) => <TextInput {...p} value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={4} pattern="\d{4}" />}
        </Field>

        <FormError message={save.error} />
        <Button type="submit" size="xl" disabled={save.pending}>
          {save.pending && <Loader2 className="animate-spin" />}
          {id ? t("common.save") : t("properties.create")}
        </Button>
      </form>
    </div>
  );
}
