import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Field, Select, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useUnit } from "@/hooks/useUnit";
import { toDateInput } from "@/lib/dates";
import { fromTri, parseDecimal, toTri, TriField, type Tri } from "./details-ui";
import { ENERGY_CLASSES, UNIT_LAYOUTS, type EnergyClass, type Furnishing, type UnitLayout } from "@/types/domain";

const decimalToInput = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/** Name, basics and official details of one unit. All but the name are optional. */
export function UnitFormPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const navigate = useNavigate();
  const { unit, loading, error, reload, update } = useUnit(id);

  const [name, setName] = useState("");
  const [floor, setFloor] = useState("");
  const [area, setArea] = useState("");
  const [layout, setLayout] = useState<UnitLayout | "">("");
  const [furnishing, setFurnishing] = useState<Furnishing | "">("");
  const [parking, setParking] = useState<Tri>("");
  const [storage, setStorage] = useState<Tri>("");
  const [balcony, setBalcony] = useState<Tri>("");
  const [pets, setPets] = useState<Tri>("");
  const [buildingPartId, setBuildingPartId] = useState("");
  const [energyClass, setEnergyClass] = useState<EnergyClass | "">("");
  const [energyValidUntil, setEnergyValidUntil] = useState("");

  useEffect(() => {
    if (!unit) return;
    setName(unit.name);
    setFloor(unit.floor ?? "");
    setArea(decimalToInput(unit.areaM2));
    setLayout(unit.layout ?? "");
    setFurnishing(unit.furnishing ?? "");
    setParking(toTri(unit.hasParking));
    setStorage(toTri(unit.hasStorage));
    setBalcony(toTri(unit.hasBalcony));
    setPets(toTri(unit.petsAllowed));
    setBuildingPartId(unit.buildingPartId ?? "");
    setEnergyClass(unit.energyClass ?? "");
    setEnergyValidUntil(toDateInput(unit.energyCertValidUntil));
  }, [unit]);

  const back = `/enote/${id}`;
  const submit = useAsyncAction(async () => {
    await update({
      name: name.trim(),
      floor: floor.trim() || null,
      areaM2: parseDecimal(area),
      layout: layout || null,
      furnishing: furnishing || null,
      hasParking: fromTri(parking),
      hasStorage: fromTri(storage),
      hasBalcony: fromTri(balcony),
      petsAllowed: fromTri(pets),
      buildingPartId: buildingPartId.trim() || null,
      energyClass: energyClass || null,
      energyCertValidUntil: energyValidUntil || null,
    });
    toast.success(t("unitDetails.saved"));
    void navigate(back);
  });

  if (loading) return <LoadingState />;
  if (error || !unit) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;

  const tri = (label: string, value: Tri, set: (v: Tri) => void, yes?: string, no?: string) => (
    <TriField label={label} value={value} onChange={set} {...(yes ? { yes } : {})} {...(no ? { no } : {})} />
  );

  return (
    <>
      <PageHeader back={back} eyebrow={`${unit.property.name}, ${unit.name}`} title={t("unitDetails.formTitle")} subtitle={t("unitDetails.formSubtitle")} />
      <form
        className="flex max-w-2xl flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit.run();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <Field label={t("units.name")} error={submit.fieldErrors["name"]}>
            {(p) => <TextInput {...p} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Field label={t("units.floor")}>{(p) => <TextInput {...p} maxLength={40} value={floor} onChange={(e) => setFloor(e.target.value)} />}</Field>
        </div>

        <h2 className="mt-4 label-mono">{t("unitDetails.basics")}</h2>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label={`${t("unitDetails.area")} (${t("unitDetails.areaUnit")})`} error={submit.fieldErrors["areaM2"]}>
            {(p) => <TextInput {...p} inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} />}
          </Field>
          <Field label={t("unitDetails.layout")}>
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
          <Field label={t("unitDetails.furnishing")}>
            {(p) => (
              <Select {...p} value={furnishing} onChange={(e) => setFurnishing(e.target.value as Furnishing | "")}>
                <option value="">–</option>
                {(["UNFURNISHED", "PARTLY", "FURNISHED"] as const).map((f) => (
                  <option key={f} value={f}>
                    {t(`unitDetails.furnishings.${f}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {tri(t("unitDetails.parking"), parking, setParking)}
          {tri(t("unitDetails.storage"), storage, setStorage)}
          {tri(t("unitDetails.balcony"), balcony, setBalcony)}
          {tri(t("unitDetails.pets"), pets, setPets, t("unitDetails.petsYes"), t("unitDetails.petsNo"))}
        </div>

        {/* TODO(preveri): when an energy certificate is mandatory for renting (EZ-2 and its rules), and whether the class must appear in ads. We only store it. */}
        <h2 className="mt-4 label-mono">{t("unitDetails.official")}</h2>
        <Field label={t("unitDetails.buildingPartId")} hint={t("unitDetails.buildingPartIdHint")}>
          {(p) => <TextInput {...p} maxLength={40} value={buildingPartId} onChange={(e) => setBuildingPartId(e.target.value)} className="sm:max-w-72" />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("unitDetails.energyClass")}>
            {(p) => (
              <Select {...p} value={energyClass} onChange={(e) => setEnergyClass(e.target.value as EnergyClass | "")}>
                <option value="">–</option>
                {ENERGY_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("unitDetails.energyValidUntil")} error={submit.fieldErrors["energyCertValidUntil"]}>
            {(p) => <TextInput {...p} type="date" value={energyValidUntil} onChange={(e) => setEnergyValidUntil(e.target.value)} />}
          </Field>
        </div>

        <FormError message={submit.error} />
        <Button type="submit" size="xl" disabled={submit.pending || !name.trim()}>
          {submit.pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t("common.save")}
        </Button>
      </form>
    </>
  );
}
