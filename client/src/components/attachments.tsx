import { FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Attachment } from "@/types/domain";

/** Uploaded files: images as thumbnails (open full size), PDFs as file chips. */
export function AttachmentList({ files, className }: { files: Attachment[]; className?: string }) {
  if (!files.length) return null;
  const images = files.filter((f) => f.mimeType.startsWith("image/") && f.mimeType !== "image/heic");
  const others = files.filter((f) => !images.includes(f));
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((f) => (
            <a key={f.id} href={apiUrl(f.url)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-sm border border-line bg-surface-sunken">
              <img src={apiUrl(f.url)} alt={f.fileName} loading="lazy" className="aspect-square w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {others.map((f) => (
        <a
          key={f.id}
          href={apiUrl(f.url)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 max-w-full items-center gap-2 self-start rounded-sm border border-line-strong bg-surface-raised px-3 text-sm font-medium transition-colors hover:border-ink"
        >
          <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{f.fileName}</span>
        </a>
      ))}
    </div>
  );
}

/** Chosen-but-not-yet-sent files with remove buttons and image previews. */
export function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (i: number) => void }) {
  const { t } = useTranslation();
  const urls = useMemo(() => files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null)), [files]);
  useEffect(() => () => urls.forEach((u) => u && URL.revokeObjectURL(u)), [urls]);
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="relative">
          {urls[i] ? (
            <img src={urls[i]!} alt={f.name} className="size-16 rounded-sm border border-line object-cover" />
          ) : (
            <span className="flex h-16 w-32 items-center gap-1.5 rounded-sm border border-line bg-surface-raised px-2 text-xs">
              <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{f.name}</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(i)}
            aria-label={t("common.remove")}
            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full border border-line-strong bg-surface-raised text-ink"
          >
            <X className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Secondary-style button that opens the file picker (images and PDF, several at once). */
export function FilePickerButton({
  onPick,
  label,
  images = false,
  disabled,
  className,
}: {
  onPick: (files: File[]) => void;
  label: string;
  images?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const Icon = images ? ImagePlus : Paperclip;
  return (
    <label
      className={cn(
        "inline-flex h-10 cursor-pointer items-center gap-2 rounded-sm border border-line-strong bg-surface-raised px-3 text-sm font-medium transition-colors hover:border-ink has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-45",
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
      <span>{label}</span>
      <input
        type="file"
        multiple
        accept={images ? "image/*" : "image/*,application/pdf"}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onPick([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </label>
  );
}
