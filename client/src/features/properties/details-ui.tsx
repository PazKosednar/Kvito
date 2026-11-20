import { CircleCheck, Clock, ImagePlus, Loader2, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { apiUrl } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Attachment, UnitDetails } from "@/types/domain";

/** Days within which an expiry (insurance, energy certificate) is shown as a warning. */
const SOON_DAYS = 60;

const daysUntil = (isoDate: string) => {
  const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" }));
  return Math.round((new Date(isoDate).getTime() - today.getTime()) / 86_400_000);
};

/** Expiry date with its state, always as word + icon: valid, expires soon, expired. */
export function ExpiryLabel({ date }: { date: string }) {
  const { t } = useTranslation();
  const days = daysUntil(date);
  const state = days < 0 ? "expired" : days <= SOON_DAYS ? "soon" : "ok";
  const Icon = state === "ok" ? CircleCheck : state === "soon" ? Clock : TriangleAlert;
  return (
    <span className={cn("inline-flex items-center gap-1.5", state === "soon" && "text-warn", state === "expired" && "text-danger")}>
      <Icon className={cn("size-4 shrink-0", state === "ok" && "text-ink-faint")} aria-hidden="true" />
      {state === "expired"
        ? t("unitDetails.expired", { date: formatDate(date) })
        : state === "soon"
          ? `${formatDate(date)}, ${t("unitDetails.expiresSoon", { count: days })}`
          : formatDate(date)}
    </span>
  );
}

const isShownImage = (a: Attachment) => a.mimeType.startsWith("image/") && a.mimeType !== "image/heic";

/** Photo grid with "add" as the last tile; each photo opens full size, the small × deletes it (after asking). */
export function PhotoGallery({ photos, onAdd, onRemove }: { photos: Attachment[]; onAdd: (files: File[]) => Promise<void>; onRemove: (id: string) => Promise<void> }) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const add = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      await onAdd(files);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {photos.length === 0 && <p className="mb-3 text-sm text-ink-muted">{t("photos.empty")}</p>}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {photos.map((p) => (
          <li key={p.id} className="group relative overflow-hidden rounded-md border border-line bg-surface-sunken">
            <a href={apiUrl(p.url)} target="_blank" rel="noreferrer" aria-label={`${t("photos.open")}: ${p.fileName}`}>
              {isShownImage(p) ? (
                <img src={apiUrl(p.url)} alt={p.fileName} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              ) : (
                <span className="flex aspect-[4/3] items-center justify-center p-2 text-center text-xs text-ink-muted">{p.fileName}</span>
              )}
            </a>
            <button
              type="button"
              onClick={() => setDeleting(p.id)}
              aria-label={t("photos.delete")}
              className="absolute top-1.5 right-1.5 inline-flex size-8 items-center justify-center rounded-full bg-surface/85 text-ink transition-opacity duration-150 hover:bg-surface sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
        <li>
          <label
            className={cn(
              "flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-line-strong text-sm text-ink-muted transition-colors duration-150 hover:border-ink hover:text-ink",
              uploading && "pointer-events-none opacity-60",
            )}
          >
            {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <ImagePlus className="size-5" aria-hidden="true" />}
            {uploading ? t("photos.uploading") : t("photos.add")}
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                void add([...(e.target.files ?? [])]);
                e.target.value = "";
              }}
            />
          </label>
        </li>
      </ul>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("photos.deleteTitle")}
        body={t("photos.deleteBody")}
        confirmLabel={t("photos.delete")}
        onConfirm={async () => {
          if (deleting) await onRemove(deleting);
        }}
      />
    </>
  );
}

/** Yes / no / not entered for optional booleans. */
export function useYesNo() {
  const { t } = useTranslation();
  return (v: boolean | null, yes = t("unitDetails.yes"), no = t("unitDetails.no")) => (v === null ? null : v ? yes : no);
}

const decimal = (n: number) => String(n).replace(".", ",");

/** Filled-in basics only; an empty unit gets one friendly line instead of a column of dashes. */
export function useBasicsItems(unit: Pick<UnitDetails, "areaM2" | "layout" | "furnishing" | "hasParking" | "hasStorage" | "hasBalcony" | "petsAllowed">) {
  const { t } = useTranslation();
  const yesNo = useYesNo();
  const items: { label: string; value: string }[] = [];
  if (unit.areaM2 !== null) items.push({ label: t("unitDetails.area"), value: `${decimal(unit.areaM2)} ${t("unitDetails.areaUnit")}` });
  if (unit.layout) items.push({ label: t("unitDetails.layout"), value: t(`unitDetails.layouts.${unit.layout}`) });
  if (unit.furnishing) items.push({ label: t("unitDetails.furnishing"), value: t(`unitDetails.furnishings.${unit.furnishing}`) });
  const flags = [
    [t("unitDetails.parking"), yesNo(unit.hasParking)],
    [t("unitDetails.storage"), yesNo(unit.hasStorage)],
    [t("unitDetails.balcony"), yesNo(unit.hasBalcony)],
    [t("unitDetails.pets"), yesNo(unit.petsAllowed, t("unitDetails.petsYes"), t("unitDetails.petsNo"))],
  ] as const;
  for (const [label, value] of flags) if (value !== null) items.push({ label, value });
  return items;
}

