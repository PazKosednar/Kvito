import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AttachmentList, FilePickerButton, PendingFiles } from "@/components/attachments";
import { Eyebrow } from "@/components/brand";
import { Field, Segmented, Select, TextInput } from "@/components/form";
import { IsoGlyph } from "@/components/iso";
import { ErrorState, FormError, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useDocuments } from "@/hooks/usePhase4";
import { formatDate } from "@/lib/dates";
import { DOCUMENT_CATEGORIES, type DocumentCategory, type DocumentVisibility } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";

export function DocumentsTab() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord } = useTenancyContext();
  const q = useDocuments(tenancy.id);
  const [adding, setAdding] = useState(false);

  if (q.loading) return <LoadingState />;
  if (q.error || !q.documents) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;

  const act = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <>
      {isLandlord && (
        <div className="mb-4 flex justify-end">
          {!adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus />
              {t("documents.add")}
            </Button>
          )}
        </div>
      )}
      {adding && <DocumentForm onDone={() => setAdding(false)} add={q.add} />}

      {q.documents.length === 0 && !adding && (
        <div className="kv-grid-bg grid items-center gap-4 rounded-md border border-line p-5 sm:grid-cols-[1fr_12rem]">
          <div>
            <Eyebrow index="00">{t("tabs.documents")}</Eyebrow>
            <p className="mt-2 text-h3 font-semibold">{t("documents.emptyTitle")}</p>
            <p className="mt-1 text-ink-muted">{isLandlord ? t("documents.emptyLandlord") : t("documents.emptyTenant")}</p>
          </div>
          <IsoGlyph name="slabs" className="h-28 w-full" />
        </div>
      )}

      {DOCUMENT_CATEGORIES.map((cat) => {
        const docs = q.documents!.filter((d) => d.category === cat);
        if (!docs.length) return null;
        return (
          <Section key={cat} title={t(`documentCategory.${cat}`)}>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface-raised">
              {docs.map((d) => (
                <li key={d.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{d.title}</p>
                      <p className="mono text-ink-faint">
                        {formatDate(d.createdAt)}
                        {d.unitId ? ` · ${t("documents.forUnit")}` : ""}
                      </p>
                    </div>
                    {isLandlord && (
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void act(() => q.setVisibility(d.id, d.visibility === "TENANTS" ? "LANDLORD_ONLY" : "TENANTS"))}
                          aria-label={t("documents.toggleVisibility")}
                        >
                          {d.visibility === "TENANTS" ? <Eye /> : <EyeOff />}
                          {t(`documentVisibility.${d.visibility}`)}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("documents.delete")}
                          onClick={() => window.confirm(t("documents.confirmDelete", { title: d.title })) && void act(() => q.remove(d.id))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                  <AttachmentList files={d.attachments} />
                </li>
              ))}
            </ul>
          </Section>
        );
      })}
    </>
  );
}

function DocumentForm({ add, onDone }: { add: ReturnType<typeof useDocuments>["add"]; onDone: () => void }) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<DocumentCategory>("CONTRACT");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<DocumentVisibility>("TENANTS");
  const [scope, setScope] = useState<"TENANCY" | "UNIT">("TENANCY");
  const [files, setFiles] = useState<File[]>([]);
  const save = useAsyncAction(async () => {
    await add({ category, title: title.trim(), visibility, scope }, files);
    toast.success(t("documents.added"));
    onDone();
  });
  return (
    <form
      className="mb-8 flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <Field label={t("documents.category")}>
        {(p) => (
          <Select {...p} value={category} onChange={(e) => setCategory(e.target.value as DocumentCategory)}>
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`documentCategory.${c}`)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label={t("documents.title")}>{(p) => <TextInput {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />}</Field>
      <Field label={t("documents.visibility")} hint={t(`documents.visibilityHint.${visibility}`)}>
        {() => (
          <Segmented<DocumentVisibility>
            label={t("documents.visibility")}
            value={visibility}
            onChange={setVisibility}
            options={(["TENANTS", "LANDLORD_ONLY"] as const).map((v) => ({ value: v, label: t(`documentVisibility.${v}`) }))}
          />
        )}
      </Field>
      <Field label={t("documents.scope")} hint={t(`documents.scopeHint.${scope}`)}>
        {() => (
          <Segmented<"TENANCY" | "UNIT">
            label={t("documents.scope")}
            value={scope}
            onChange={setScope}
            options={(["TENANCY", "UNIT"] as const).map((v) => ({ value: v, label: t(`documents.scopeOption.${v}`) }))}
          />
        )}
      </Field>
      <div className="flex flex-col gap-2">
        <PendingFiles files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
        <FilePickerButton label={t("documents.chooseFile")} onPick={(f) => setFiles([...files, ...f].slice(0, 5))} className="self-start" />
      </div>
      <FormError message={save.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.pending || !title.trim() || files.length === 0}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("documents.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
