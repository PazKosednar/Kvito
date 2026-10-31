import { DoorOpen, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Field, TextInput } from "@/components/form";
import { ErrorState, FormError, List, ListRow, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
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
          <div className="rounded-xl border border-dashed p-5">
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
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void removeProperty()}>
          <Trash2 />
          {t("properties.delete")}
        </Button>
      </Section>
    </>
  );
}

function UnitRow({ unit, onRemove }: { unit: Unit; onRemove: () => Promise<void> }) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const tenancy = unit.tenancies.find((x) => x.status === "ACTIVE") ?? unit.tenancies[0];

  if (tenancy) {
    const names = tenantNames(tenancy.members);
    return (
      <ListRow
        to={`/najemi/${tenancy.id}`}
        leading={<DoorOpen className="size-5 shrink-0 text-primary" aria-hidden="true" />}
        title={unit.name}
        subtitle={names || t("tenancies.waitingForTenant")}
        trailing={<TenancyStatusLabel status={tenancy.status} />}
      />
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
    </li>
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
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
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
