import { Download, FileCheck2, Loader2, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { toast } from "sonner";
import { AttachmentList, FilePickerButton, PendingFiles } from "@/components/attachments";
import { Card, Eyebrow } from "@/components/brand";
import { Field, Segmented, Select, Textarea, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { askConfirm } from "@/components/confirm-host";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useHandover, useHandoverCompare } from "@/hooks/usePhase4";
import { formatDate, formatDateTime } from "@/lib/dates";
import { METER_UNITS, type HandoverCompareRow, type HandoverItem, type ItemCondition } from "@/types/domain";
import { ReadingForm } from "@/features/meters/ReadingForm";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { ConditionLabel, HandoverStatusBadge, useRoomSuggestions } from "./handover-ui";
import { ChangeLabel } from "./HandoverComparePage";

const CONDITIONS: ItemCondition[] = ["GOOD", "WORN", "DAMAGED", "MISSING"];

export function HandoverPage() {
  const { handoverId } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy } = useTenancyContext();
  const q = useHandover(handoverId);
  const [addingReading, setAddingReading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // At move-out, each item shows how it was at move-in (same room + name).
  const cmp = useHandoverCompare(q.handover?.kind === "MOVE_OUT" ? tenancy.id : undefined);

  if (q.loading) return <LoadingState />;
  if (q.error || !q.handover) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const h = q.handover;
  const editable = q.isLandlord && h.status === "DRAFT";

  const run = async (key: string, fn: () => Promise<void>, ok?: string) => {
    setBusy(key);
    try {
      await fn();
      if (ok) toast.success(ok);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const rooms = [...new Set(h.items.map((i) => i.room))];

  return (
    <>
      <PageHeader
        back={`/najemi/${tenancy.id}/primopredaja`}
        eyebrow={`${t("handover.record")} · ${formatDate(h.handoverOn)}`}
        title={t(`handoverKind.${h.kind}`)}
        action={<HandoverStatusBadge status={h.status} />}
      />

      {/* Status and next step */}
      <section className="on-panel kv-grid-panel rounded-md p-5 sm:p-6">
        <Eyebrow onPanel>{t("handover.confirmations")}</Eyebrow>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="border-t border-ink-on-panel/15 pt-3">
            <dt className="text-sm text-ink-on-panel-muted">{t("roles.LANDLORD")}</dt>
            <dd className={h.landlordConfirmedAt ? "mono text-signal" : "mono text-ink-on-panel-muted"}>
              {h.landlordConfirmedAt ? t("handover.confirmedAt", { at: formatDateTime(h.landlordConfirmedAt) }) : t("handover.pending")}
            </dd>
          </div>
          <div className="border-t border-ink-on-panel/15 pt-3">
            <dt className="text-sm text-ink-on-panel-muted">{t("roles.TENANT")}</dt>
            <dd className={h.tenantConfirmedAt ? "mono text-signal" : "mono text-ink-on-panel-muted"}>
              {h.tenantConfirmedAt
                ? t("handover.confirmedAt", { at: formatDateTime(h.tenantConfirmedAt) }) + (h.tenantConfirmedBy ? `, ${h.tenantConfirmedBy.name ?? h.tenantConfirmedBy.email}` : "")
                : t("handover.pending")}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-ink-on-panel-muted">{t(`handover.next.${q.isLandlord ? "LANDLORD" : "TENANT"}.${h.status}`)}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {q.isLandlord && h.status === "DRAFT" && (
            <Button disabled={busy !== null} onClick={() => void run("submit", () => q.transition("submit"), t("handover.submitted"))}>
              {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />}
              {t("handover.submit")}
            </Button>
          )}
          {!q.isLandlord && h.status === "AWAITING_CONFIRMATION" && (
            <Button disabled={busy !== null} onClick={() => void askConfirm(t("handover.confirmPrompt"), { danger: false, confirmLabel: t("handover.confirm") }).then((ok) => ok && void run("confirm", () => q.transition("confirm"), t("handover.confirmedToast")))}>
              {busy === "confirm" ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
              {t("handover.confirm")}
            </Button>
          )}
          {h.status === "AWAITING_CONFIRMATION" && (
            <Button variant="secondary" disabled={busy !== null} onClick={() => void run("reopen", () => q.transition("reopen"), t("handover.reopened"))}>
              <Undo2 />
              {q.isLandlord ? t("handover.edit") : t("handover.requestChanges")}
            </Button>
          )}
          <Button variant="secondary" disabled={busy !== null} onClick={() => void run("pdf", q.downloadPdf)}>
            {busy === "pdf" ? <Loader2 className="animate-spin" /> : <Download />}
            {t("handover.pdf")}
          </Button>
        </div>
      </section>

      {/* 01 Keys */}
      <Section title={<Eyebrow index="01">{t("handover.keys")}</Eyebrow>}>
        {editable ? (
          <KeysForm keysCount={h.keysCount} keysNote={h.keysNote} onSave={q.update} />
        ) : (
          <Card className="p-4">
            <p>{h.keysCount != null ? t("handover.keysCount", { count: h.keysCount }) : t("handover.keysMissing")}</p>
            {h.keysNote && <p className="mt-1 text-sm text-ink-muted">{h.keysNote}</p>}
          </Card>
        )}
      </Section>

      {/* 02 Meters */}
      <Section
        title={<Eyebrow index="02">{t("handover.meters")}</Eyebrow>}
        action={
          editable && !addingReading ? (
            <Button variant="ghost" size="sm" onClick={() => setAddingReading(true)}>
              <Plus />
              {t("meters.add")}
            </Button>
          ) : undefined
        }
      >
        {addingReading && (
          <div className="mb-4">
            <ReadingForm withPhoto={false} defaultDate={h.handoverOn.slice(0, 10)} onCancel={() => setAddingReading(false)} onSubmit={(input) => q.addReading(input)} />
          </div>
        )}
        {h.meterReadings.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("handover.noMeters")}</p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line bg-surface-raised">
            {h.meterReadings.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span>
                  {t(`meterType.${r.meterType}`)}
                  {r.meterLabel ? ` · ${r.meterLabel}` : ""}
                </span>
                <span className="flex items-center gap-2">
                  <span className="mono">
                    {r.value} {METER_UNITS[r.meterType]}
                  </span>
                  {editable && (
                    <Button variant="ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => void run("rm", () => q.removeReading(r.id))}>
                      <Trash2 />
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 03 Rooms and items */}
      <Section title={<Eyebrow index="03">{t("handover.items")}</Eyebrow>}>
        {rooms.length === 0 && <p className="mb-4 text-sm text-ink-muted">{t("handover.noItems")}</p>}
        <div className="flex flex-col gap-4">
          {rooms.map((room) => (
            <Card key={room} as="section">
              <h3 className="border-b border-line px-4 py-3 font-semibold">{room}</h3>
              <ul className="divide-y divide-line">
                {h.items
                  .filter((i) => i.room === room)
                  .map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      editable={editable}
                      q={q}
                      reference={h.kind === "MOVE_OUT" ? cmp.compare?.rows.find((r) => r.after?.id === item.id) : undefined}
                    />
                  ))}
              </ul>
            </Card>
          ))}
        </div>
        {editable && <ItemForm rooms={rooms} onAdd={q.addItem} />}
      </Section>

      {/* 04 Notes */}
      <Section title={<Eyebrow index="04">{t("handover.notes")}</Eyebrow>}>
        {editable ? (
          <Textarea defaultValue={h.notes ?? ""} onBlur={(e) => e.target.value !== (h.notes ?? "") && void run("notes", () => q.update({ notes: e.target.value }))} placeholder={t("handover.notesPlaceholder")} />
        ) : (
          <p className="whitespace-pre-wrap text-ink-muted">{h.notes || "–"}</p>
        )}
      </Section>
    </>
  );
}

function KeysForm({ keysCount, keysNote, onSave }: { keysCount: number | null; keysNote: string | null; onSave: (i: { keysCount: number | null; keysNote: string | null }) => Promise<void> }) {
  const { t } = useTranslation();
  const [count, setCount] = useState(keysCount != null ? String(keysCount) : "");
  const [note, setNote] = useState(keysNote ?? "");
  const save = useAsyncAction(async () => {
    await onSave({ keysCount: count === "" ? null : Number(count), keysNote: note.trim() || null });
    toast.success(t("common.saved"));
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <Field label={t("handover.keysCountLabel")}>{(p) => <TextInput {...p} inputMode="numeric" className="font-mono" value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ""))} />}</Field>
      <Field label={t("handover.keysNoteLabel")}>{(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}</Field>
      <Button type="submit" variant="secondary" size="lg" disabled={save.pending}>
        {t("common.save")}
      </Button>
      <FormError message={save.error} />
    </form>
  );
}

function ItemRow({
  item,
  editable,
  q,
  reference,
}: {
  item: HandoverItem;
  editable: boolean;
  q: ReturnType<typeof useHandover>;
  reference?: HandoverCompareRow;
}) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [photos, setPhotos] = useState<File[]>([]);
  const upload = useAsyncAction(async () => {
    await q.addPhotos(item.id, photos);
    setPhotos([]);
  });
  const change = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast.error(toMessage(err));
    }
  };
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{item.name}</span>
        {editable ? (
          <span className="flex items-center gap-1">
            <Select
              aria-label={t("handover.condition")}
              className="h-9 w-auto text-sm"
              value={item.condition}
              onChange={(e) => void change(() => q.updateItem(item.id, { condition: e.target.value as ItemCondition }))}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`condition.${c}`)}
                </option>
              ))}
            </Select>
            <Button variant="ghost" size="icon-sm" aria-label={t("common.remove")} onClick={() => void change(() => q.removeItem(item.id))}>
              <Trash2 />
            </Button>
          </span>
        ) : (
          <ConditionLabel condition={item.condition} />
        )}
      </div>
      {item.note && <p className="text-sm text-ink-muted">{item.note}</p>}
      <AttachmentList files={item.attachments} />
      {editable && (
        <div className="flex flex-col gap-2">
          <PendingFiles files={photos} onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))} />
          <div className="flex flex-wrap items-center gap-2">
            <FilePickerButton images label={t("issues.addPhotos")} onPick={(f) => setPhotos([...photos, ...f].slice(0, 6))} />
            {photos.length > 0 && (
              <Button size="sm" disabled={upload.pending} onClick={() => void upload.run()}>
                {upload.pending && <Loader2 className="animate-spin" />}
                {t("handover.savePhotos", { count: photos.length })}
              </Button>
            )}
          </div>
          <FormError message={upload.error} />
        </div>
      )}
      {reference?.before && (
        <div className="mt-1 flex flex-col gap-2 rounded-sm border border-dashed border-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] tracking-[0.08em] text-ink-faint uppercase">{t("handover.atMoveIn")}</span>
            <span className="flex items-center gap-2">
              <ConditionLabel condition={reference.before.condition} />
              {reference.change !== "SAME" && <ChangeLabel change={reference.change} />}
            </span>
          </div>
          {reference.before.note && <p className="text-sm text-ink-muted">{reference.before.note}</p>}
          <AttachmentList files={reference.before.attachments} />
        </div>
      )}
    </li>
  );
}

function ItemForm({ rooms, onAdd }: { rooms: string[]; onAdd: ReturnType<typeof useHandover>["addItem"] }) {
  const { t } = useTranslation();
  const suggestions = useRoomSuggestions();
  const [room, setRoom] = useState(rooms.at(-1) ?? suggestions[0] ?? "");
  const [name, setName] = useState("");
  const [condition, setCondition] = useState<ItemCondition>("GOOD");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const save = useAsyncAction(async () => {
    await onAdd({ room: room.trim(), name: name.trim(), condition, note: note.trim() || null }, photos);
    setName("");
    setNote("");
    setPhotos([]);
    setCondition("GOOD");
  });
  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-md border border-dashed border-line-strong p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <Eyebrow>{t("handover.addItem")}</Eyebrow>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("handover.room")}>
          {(p) => (
            <>
              <TextInput {...p} list="kvita-rooms" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={60} required />
              <datalist id="kvita-rooms">
                {[...new Set([...rooms, ...suggestions])].map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field label={t("handover.itemName")}>{(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={t("handover.itemPlaceholder")} required />}</Field>
      </div>
      <Field label={t("handover.condition")}>
        {() => <Segmented<ItemCondition> label={t("handover.condition")} value={condition} onChange={setCondition} options={CONDITIONS.map((c) => ({ value: c, label: t(`condition.${c}`) }))} />}
      </Field>
      <Field label={t("handover.itemNote")}>{(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}</Field>
      <div className="flex flex-col gap-2">
        <PendingFiles files={photos} onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))} />
        <FilePickerButton images label={t("issues.addPhotos")} onPick={(f) => setPhotos([...photos, ...f].slice(0, 6))} className="self-start" />
      </div>
      <FormError message={save.error} />
      <Button type="submit" variant="secondary" className="self-start" disabled={save.pending || !name.trim() || !room.trim()}>
        {save.pending ? <Loader2 className="animate-spin" /> : <Plus />}
        {t("handover.addItemButton")}
      </Button>
    </form>
  );
}
