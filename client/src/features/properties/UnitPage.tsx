import { DoorOpen, KeyRound, Loader2, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, Select, TextInput } from "@/components/form";
import { ErrorState, Facts, FormError, List, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { TenancyStatusLabel, tenantNames } from "@/features/tenancies/tenancy-ui";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { type KeysInput, type UtilityInput, useUnit } from "@/hooks/useUnit";
import { formatCents } from "@/lib/money";
import { UTILITY_KINDS, type KeySet, type UnitDetail, type UtilityKind, type UtilityPoint } from "@/types/domain";
import { ExpiryLabel, PhotoGallery, useBasicsItems } from "./details-ui";

/** One unit for the landlord: basics, official data, metering points, keys and photos. */
export function UnitPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const q = useUnit(id);
  const { unit } = q;

  if (q.loading) return <LoadingState />;
  if (q.error || !unit) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;

  const editLink = (
    <Button asChild variant="ghost">
      <Link to={`/enote/${unit.id}/uredi`}>
        <Pencil />
        {t("unitDetails.edit")}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        back={`/nepremicnine/${unit.property.id}`}
        eyebrow={unit.property.name}
        title={unit.name}
        subtitle={[unit.floor, `${unit.property.street}, ${unit.property.city}`].filter(Boolean).join(" · ")}
      />

      <TenancyStrip unit={unit} />

      <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2">
        <Section title={t("unitDetails.basics")} action={editLink} className="mt-0">
          <BasicsFacts unit={unit} />
        </Section>
        <Section title={t("unitDetails.official")} action={editLink} className="mt-0">
          <OfficialFacts unit={unit} />
        </Section>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-10 lg:grid-cols-2">
        <UtilitiesSection points={unit.utilityPoints} onSave={q.saveUtility} onRemove={q.removeUtility} />
        <KeysSection keys={unit.keySets} onSave={q.saveKeys} onRemove={q.removeKeys} />
      </div>

      <Section title={t("photos.title")}>
        <PhotoGallery photos={unit.photos} onAdd={q.addPhotos} onRemove={q.deletePhoto} />
      </Section>
    </>
  );
}

/** Current tenancy (link) or "vacant" with the action to create one. */
function TenancyStrip({ unit }: { unit: UnitDetail }) {
  const { t } = useTranslation();
  const tenancy = unit.tenancies[0];
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-raised px-4 py-3">
      <DoorOpen className="size-5 shrink-0 text-ink-faint" aria-hidden="true" />
      {tenancy ? (
        <>
          <span className="min-w-40 flex-1">
            <span className="block truncate font-semibold">{tenantNames(tenancy.members) || t("tenancies.waitingForTenant")}</span>
            <span className="block font-mono text-sm whitespace-nowrap text-ink-muted tabular-nums">{t("units.perMonth", { amount: formatCents(tenancy.rentCents) })}</span>
          </span>
          <TenancyStatusLabel status={tenancy.status} />
          <Button asChild size="sm" variant="outline">
            <Link to={`/najemi/${tenancy.id}`}>{t("unitDetails.tenancy")}</Link>
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 text-ink-muted">{t("unitDetails.vacant")}</span>
          <Button asChild size="sm">
            <Link to={`/enote/${unit.id}/najem`}>{t("tenancies.create")}</Link>
          </Button>
        </>
      )}
    </div>
  );
}

function BasicsFacts({ unit }: { unit: UnitDetail }) {
  const { t } = useTranslation();
  const items = useBasicsItems(unit);
  if (!items.length) return <EmptyLine to={`/enote/${unit.id}/uredi`} text={t("unitDetails.emptyBasics")} />;
  return <Facts items={items} />;
}

function OfficialFacts({ unit }: { unit: UnitDetail }) {
  const { t } = useTranslation();
  const items: { label: string; value: React.ReactNode }[] = [];
  if (unit.buildingPartId) items.push({ label: t("unitDetails.buildingPartId"), value: <span className="font-mono">{unit.buildingPartId}</span> });
  if (unit.energyClass) items.push({ label: t("unitDetails.energyClass"), value: unit.energyClass });
  if (unit.energyCertValidUntil) items.push({ label: t("unitDetails.energyValidUntil"), value: <ExpiryLabel date={unit.energyCertValidUntil} /> });
  if (!items.length) return <EmptyLine to={`/enote/${unit.id}/uredi`} text={t("unitDetails.emptyOfficial")} />;
  return <Facts items={items} />;
}

function EmptyLine({ to, text }: { to: string; text: string }) {
  return (
    <Link to={to} className="block rounded-md border border-dashed border-line-strong px-4 py-4 text-ink-muted transition-colors duration-150 hover:border-ink hover:text-ink">
      {text}
    </Link>
  );
}

// ---------- Metering points ----------

function UtilitiesSection({ points, onSave, onRemove }: { points: UtilityPoint[]; onSave: (i: UtilityInput, id?: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<UtilityPoint | null>(null);

  return (
    <Section
      title={t("utilities.title")}
      className="mt-0"
      action={
        editing === null ? (
          <Button variant="ghost" onClick={() => setEditing("new")}>
            <Plus />
            {t("utilities.add")}
          </Button>
        ) : undefined
      }
    >
      {points.length === 0 && editing !== "new" && <p className="rounded-md border border-dashed border-line-strong px-4 py-4 text-ink-muted">{t("utilities.empty")}</p>}
      {editing === "new" && <UtilityForm onCancel={() => setEditing(null)} onSubmit={(i) => onSave(i).then(() => setEditing(null))} />}
      {points.length > 0 && (
        <List className={editing === "new" ? "mt-3" : undefined}>
          {points.map((p) =>
            editing === p.id ? (
              <li key={p.id} className="p-3">
                <UtilityForm initial={p} onCancel={() => setEditing(null)} onSubmit={(i) => onSave(i, p.id).then(() => setEditing(null))} />
              </li>
            ) : (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Zap className="size-5 shrink-0 text-ink-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{t(`utilities.kinds.${p.kind}`)}</span>
                  <span className="block truncate text-sm text-ink-muted">
                    {[p.pointNumber && <span key="n" className="font-mono">{p.pointNumber}</span>, p.supplier, p.note]
                      .filter(Boolean)
                      .flatMap((x, i) => (i ? [" · ", x] : [x]))}
                  </span>
                </span>
                <RowActions onEdit={() => setEditing(p.id)} onDelete={() => setDeleting(p)} deleteLabel={t("utilities.delete")} />
              </li>
            ),
          )}
        </List>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`${t("utilities.delete")}?`}
        body={deleting ? [t(`utilities.kinds.${deleting.kind}`), deleting.pointNumber].filter(Boolean).join(", ") : ""}
        confirmLabel={t("utilities.delete")}
        onConfirm={async () => {
          if (deleting) await onRemove(deleting.id);
        }}
      />
    </Section>
  );
}

function UtilityForm({ initial, onSubmit, onCancel }: { initial?: UtilityPoint; onSubmit: (i: UtilityInput) => Promise<void>; onCancel: () => void }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<UtilityKind>(initial?.kind ?? "ELECTRICITY");
  const [pointNumber, setPointNumber] = useState(initial?.pointNumber ?? "");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const save = useAsyncAction(() => onSubmit({ kind, pointNumber: pointNumber.trim() || null, supplier: supplier.trim() || null, note: note.trim() || null }));
  return (
    <InlineForm onSubmit={() => void save.run()} onCancel={onCancel} pending={save.pending} error={save.error} saveLabel={t("utilities.save")} cancelLabel={t("utilities.cancel")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("utilities.kind")}>
          {(p) => (
            <Select {...p} value={kind} onChange={(e) => setKind(e.target.value as UtilityKind)}>
              {UTILITY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`utilities.kinds.${k}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("utilities.pointNumber")}>
          {(p) => <TextInput {...p} maxLength={60} value={pointNumber} onChange={(e) => setPointNumber(e.target.value)} autoFocus />}
        </Field>
        <Field label={t("utilities.supplier")}>{(p) => <TextInput {...p} maxLength={80} value={supplier} onChange={(e) => setSupplier(e.target.value)} />}</Field>
        <Field label={t("utilities.note")}>{(p) => <TextInput {...p} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      </div>
    </InlineForm>
  );
}

// ---------- Keys ----------

function KeysSection({ keys, onSave, onRemove }: { keys: KeySet[]; onSave: (i: KeysInput, id?: string) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [deleting, setDeleting] = useState<KeySet | null>(null);

  return (
    <Section
      title={t("keys.title")}
      className="mt-0"
      action={
        editing === null ? (
          <Button variant="ghost" onClick={() => setEditing("new")}>
            <Plus />
            {t("keys.add")}
          </Button>
        ) : undefined
      }
    >
      {keys.length === 0 && editing !== "new" && <p className="rounded-md border border-dashed border-line-strong px-4 py-4 text-ink-muted">{t("keys.empty")}</p>}
      {editing === "new" && <KeysForm onCancel={() => setEditing(null)} onSubmit={(i) => onSave(i).then(() => setEditing(null))} />}
      {keys.length > 0 && (
        <List className={editing === "new" ? "mt-3" : undefined}>
          {keys.map((k) =>
            editing === k.id ? (
              <li key={k.id} className="p-3">
                <KeysForm initial={k} onCancel={() => setEditing(null)} onSubmit={(i) => onSave(i, k.id).then(() => setEditing(null))} />
              </li>
            ) : (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                <KeyRound className="size-5 shrink-0 text-ink-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{k.label}</span>
                  {k.holder && <span className="block truncate text-sm text-ink-muted">{k.holder}</span>}
                </span>
                <span className="font-mono text-sm whitespace-nowrap tabular-nums">{t("keys.pieces", { count: k.count })}</span>
                <RowActions onEdit={() => setEditing(k.id)} onDelete={() => setDeleting(k)} deleteLabel={t("keys.delete")} />
              </li>
            ),
          )}
        </List>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`${t("keys.delete")}?`}
        body={deleting?.label ?? ""}
        confirmLabel={t("keys.delete")}
        onConfirm={async () => {
          if (deleting) await onRemove(deleting.id);
        }}
      />
    </Section>
  );
}

function KeysForm({ initial, onSubmit, onCancel }: { initial?: KeySet; onSubmit: (i: KeysInput) => Promise<void>; onCancel: () => void }) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [count, setCount] = useState(String(initial?.count ?? 1));
  const [holder, setHolder] = useState(initial?.holder ?? "");
  const n = Number(count);
  const valid = label.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 99;
  const save = useAsyncAction(() => onSubmit({ label: label.trim(), count: n, holder: holder.trim() || null }));
  return (
    <InlineForm onSubmit={() => valid && void save.run()} onCancel={onCancel} pending={save.pending} error={save.error} disabled={!valid} saveLabel={t("keys.save")} cancelLabel={t("keys.cancel")}>
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <Field label={t("keys.label")}>
          {(p) => <TextInput {...p} required maxLength={60} placeholder={t("keys.labelPlaceholder")} value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />}
        </Field>
        <Field label={t("keys.count")}>{(p) => <TextInput {...p} inputMode="numeric" maxLength={2} value={count} onChange={(e) => setCount(e.target.value)} />}</Field>
      </div>
      <Field label={t("keys.holder")}>
        {(p) => <TextInput {...p} maxLength={80} placeholder={t("keys.holderPlaceholder")} value={holder} onChange={(e) => setHolder(e.target.value)} />}
      </Field>
    </InlineForm>
  );
}

// ---------- Shared bits ----------

function RowActions({ onEdit, onDelete, deleteLabel }: { onEdit: () => void; onDelete: () => void; deleteLabel: string }) {
  const { t } = useTranslation();
  return (
    <span className="flex shrink-0">
      <Button variant="ghost" size="icon" aria-label={t("common.edit")} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon" aria-label={deleteLabel} onClick={onDelete}>
        <Trash2 />
      </Button>
    </span>
  );
}

function InlineForm({
  children,
  onSubmit,
  onCancel,
  pending,
  error,
  disabled,
  saveLabel,
  cancelLabel,
}: {
  children: React.ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
  disabled?: boolean;
  saveLabel: string;
  cancelLabel: string;
}) {
  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
      <FormError message={error} />
      <div className="flex gap-2">
        <Button type="submit" className="h-11 flex-1" disabled={pending || disabled}>
          {pending && <Loader2 className="animate-spin" />}
          {saveLabel}
        </Button>
        <Button type="button" variant="ghost" className="h-11" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  );
}
