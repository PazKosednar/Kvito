import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FilePickerButton, PendingFiles } from "@/components/attachments";
import { Field, Segmented, TextInput } from "@/components/form";
import { FormError } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import type { ReadingInput } from "@/hooks/usePhase4";
import { todayInput } from "@/lib/dates";
import { METER_TYPES, METER_UNITS, type MeterType } from "@/types/domain";

/** One meter reading: type, value (mono, decimal keypad), date, optional photo of the meter. */
export function ReadingForm({
  onSubmit,
  onCancel,
  withPhoto = true,
  defaultDate,
}: {
  onSubmit: (input: ReadingInput, photos: File[]) => Promise<void>;
  onCancel?: () => void;
  withPhoto?: boolean;
  defaultDate?: string;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState<MeterType>("ELECTRICITY");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [readOn, setReadOn] = useState(defaultDate ?? todayInput());
  const [photos, setPhotos] = useState<File[]>([]);

  const save = useAsyncAction(async () => {
    await onSubmit({ meterType: type, meterLabel: label.trim() || null, value: value.trim(), readOn }, photos);
    setValue("");
    setPhotos([]);
    onCancel?.();
  });

  return (
    <form
      className="flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <Field label={t("meters.type")}>
        {() => (
          <Segmented<MeterType> label={t("meters.type")} value={type} onChange={setType} options={METER_TYPES.map((m) => ({ value: m, label: t(`meterType.${m}`) }))} />
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("meters.value", { unit: METER_UNITS[type] })} error={save.fieldErrors["value"]}>
          {(p) => <TextInput {...p} className="font-mono" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="12345,6" required />}
        </Field>
        <Field label={t("meters.date")}>{(p) => <TextInput {...p} type="date" value={readOn} max={todayInput()} onChange={(e) => setReadOn(e.target.value)} />}</Field>
      </div>
      <Field label={t("meters.label")} hint={t("meters.labelHint")}>
        {(p) => <TextInput {...p} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />}
      </Field>
      {withPhoto && (
        <div className="flex flex-col gap-2">
          <PendingFiles files={photos} onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))} />
          <FilePickerButton images label={t("meters.photo")} onPick={(f) => setPhotos([...photos, ...f].slice(0, 3))} className="self-start" />
        </div>
      )}
      <FormError message={save.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.pending || !value.trim()}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("meters.save")}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
      </div>
    </form>
  );
}
