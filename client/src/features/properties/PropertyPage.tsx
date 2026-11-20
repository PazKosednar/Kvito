import { ArrowRight, DoorOpen, Loader2, Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Field, TextInput } from "@/components/form";
import { ErrorState, FormError, List, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useProperty } from "@/hooks/useProperties";
import { TenancyStatusLabel, tenantNames } from "@/features/tenancies/tenancy-ui";
import type { Unit } from "@/types/domain";

export function PropertyPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toMessage = useErrorMessage();
  const { property, loading, error, reload, addUnit, remove, removeUnit } = useProperty(id);
  const [adding, setAdding] = useState(false);

  if (loading) return <LoadingState />;
  if (error || !property) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;

  const removeProperty = async () => {
    if (!window.confirm(t("properties.confirmDelete", { name: property.name }))) return;
    try {
      await remove();
      toast.success(t("properties.deleted"));
      void navigate("/");
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        back="/"
        eyebrow={t(`properties.types.${property.type}`)}
        title={property.name}
        subtitle={`${property.street}, ${property.postalCode} ${property.city}`}
        action={
          <Button asChild variant="ghost" size="icon-lg" aria-label={t("common.edit")}>
            <Link to={`/nepremicnine/${property.id}/uredi`}>
              <Pencil />
            </Link>
          </Button>
        }
      />

      <PropertySummary units={property.units} />

      <Section
        title={t("units.title")}
        action={
          !adding && property.units.length > 0 ? (
            <Button variant="ghost" onClick={() => setAdding(true)}>
              <Plus />
              {t("units.add")}
            </Button>
          ) : undefined
        }
      >
        {property.units.length === 0 && !adding && (
          <div className="rounded-md border border-dashed p-5">
            <p className="font-semibold">{t("units.emptyTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("units.emptyBody")}</p>
            <Button className="mt-4" onClick={() => setAdding(true)}>
              <Plus />
              {t("units.addFirst")}
            </Button>
          </div>
        )}
        {adding && <AddUnitForm onAdd={addUnit} onDone={() => setAdding(false)} />}
        {property.units.length > 0 && (
          <List className={adding ? "mt-4" : undefined}>
            {property.units.map((unit) => (
              <UnitRow key={unit.id} unit={unit} onRemove={() => removeUnit(unit.id)} />
            ))}
          </List>
        )}
      </Section>

      <Section>
        <Button variant="ghost" className="text-danger hover:text-destructive" onClick={() => void removeProperty()}>
          <Trash2 />
          {t("properties.delete")}
        </Button>
      </Section>
    </>
  );
}

const currentTenancy = (unit: Unit) => unit.tenancies.find((x) => x.status === "ACTIVE") ?? unit.tenancies[0];

/** Units, how many are let and the monthly rent of the active tenancies, in one quiet strip. */
function PropertySummary({ units }: { units: Unit[] }) {
  const { t } = useTranslation();
  if (units.length === 0) return null;
  const active = units.map(currentTenancy).filter((x) => x?.status === "ACTIVE");
  const rent = active.reduce((sum, x) => sum + (x?.rentCents ?? 0), 0);
  const items = [
    { label: t("units.count"), value: String(units.length) },
    { label: t("units.let"), value: `${active.length} / ${units.length}` },
    { label: t("units.rent"), value: formatCents(rent) },
  ];
  return (
    <dl aria-label={t("units.summary")} className="grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
      {items.map((it) => (
        <div key={it.label} className="min-w-0 bg-surface-raised px-3 py-3 sm:px-4">
          <dt className="label-mono">{it.label}</dt>
          <dd className="amount mt-1 text-base whitespace-nowrap sm:text-lg">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function UnitRow({ unit, onRemove }: { unit: Unit; onRemove: () => Promise<void> }) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const tenancy = currentTenancy(unit);

  if (tenancy) {
    const names = tenantNames(tenancy.members);
    return (
      <li className="flex items-stretch">
        <Link to={`/najemi/${tenancy.id}`} className="group flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-sunken">
          <DoorOpen className="size-5 shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{unit.name}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{names || t("tenancies.waitingForTenant")}</span>
          </span>
          <span className="flex items-center gap-5">
            <span className="hidden text-right sm:block">
              <span className="block font-mono text-sm tabular-nums">{t("units.perMonth", { amount: formatCents(tenancy.rentCents) })}</span>
              <span className="block text-xs text-ink-faint">{t("units.since", { date: formatDate(tenancy.startDate) })}</span>
            </span>
            <TenancyStatusLabel status={tenancy.status} />
          </span>
          <ArrowRight className="size-4 shrink-0 text-ink-faint transition-colors duration-150 group-hover:text-primary" aria-hidden="true" />
        </Link>
        <UnitDetailsLink unit={unit} />
      </li>
    );
  }

  const remove = async () => {
    if (!window.confirm(t("units.confirmDelete", { name: unit.name }))) return;
    try {
      await onRemove();
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <li className="flex min-h-16 items-center gap-3 px-4 py-3">
      <DoorOpen className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{unit.name}</span>
        <span className="block text-sm text-muted-foreground">{t("units.vacant")}</span>
      </span>
      <Button asChild size="sm">
        <Link to={`/enote/${unit.id}/najem`}>{t("tenancies.create")}</Link>
      </Button>
      <Button variant="ghost" size="icon" aria-label={t("units.delete")} onClick={() => void remove()}>
        <Trash2 />
      </Button>
      <UnitDetailsLink unit={unit} className="-my-3 -mr-4" />
    </li>
  );
}

/** Separate door to the unit's own page (details, metering points, keys, photos), next to the tenancy link. */
function UnitDetailsLink({ unit, className }: { unit: Unit; className?: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/enote/${unit.id}`}
      aria-label={`${t("unitDetails.open")}: ${unit.name}`}
      title={t("unitDetails.open")}
      className={cn(
        "flex shrink-0 items-center gap-2 self-stretch border-l border-line px-4 text-sm text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink",
        className,
      )}
    >
      <Ruler className="size-4" aria-hidden="true" />
      <span className="hidden md:inline">{t("unitDetails.open")}</span>
    </Link>
  );
}

function AddUnitForm({ onAdd, onDone }: { onAdd: (i: { name: string; floor: string | null }) => Promise<unknown>; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [floor, setFloor] = useState("");
  const save = useAsyncAction(async () => {
    await onAdd({ name: name.trim(), floor: floor.trim() || null });
    onDone();
  });
  return (
    <form
      className="flex flex-col gap-4 rounded-md border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <Field label={t("units.name")} hint={t("units.nameHint")}>
        {(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus />}
      </Field>
      <Field label={t("units.floor")}>
        {(p) => <TextInput {...p} value={floor} onChange={(e) => setFloor(e.target.value)} maxLength={40} />}
      </Field>
      <FormError message={save.error} />
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={save.pending || !name.trim()}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("units.save")}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
