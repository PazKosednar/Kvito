import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { FilePickerButton, PendingFiles } from "@/components/attachments";
import { Field, Segmented, Textarea, TextInput } from "@/components/form";
import { FormError, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useIssues, type IssueInput } from "@/hooks/useIssues";
import { cn } from "@/lib/utils";
import { ISSUE_CATEGORIES, type IssueUrgency } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";

/** Report a repair: what, where, how urgent, photos. Short and in plain words. */
export function IssueFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenancy } = useTenancyContext();
  const { create } = useIssues(tenancy.id);
  const [v, setV] = useState<IssueInput>({ category: "PLUMBING", title: "", description: "", urgency: "NORMAL" });
  const [photos, setPhotos] = useState<File[]>([]);

  const save = useAsyncAction(async () => {
    const issue = await create({ ...v, title: v.title.trim(), description: v.description.trim() }, photos);
    toast.success(t("issues.reported"));
    void navigate(`/najemi/${tenancy.id}/okvare/${issue.id}`, { replace: true });
  });

  return (
    <>
      <PageHeader back={`/najemi/${tenancy.id}/okvare`} title={t("issues.newTitle")} subtitle={t("issues.newSubtitle")} />
      <form
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save.run();
        }}
      >
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t("issues.category")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ISSUE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={v.category === c}
                onClick={() => setV({ ...v, category: c })}
                className={cn(
                  "h-12 rounded-sm border px-3 text-left text-sm font-medium transition-colors",
                  v.category === c ? "border-primary bg-accent-soft text-ink" : "border-line-strong bg-surface-raised hover:border-ink",
                )}
              >
                {t(`issueCategory.${c}`)}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label={t("issues.title")} hint={t("issues.titleHint")} error={save.fieldErrors["title"]}>
          {(p) => <TextInput {...p} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} maxLength={100} required />}
        </Field>
        <Field label={t("issues.description")} hint={t("issues.descriptionHint")} error={save.fieldErrors["description"]}>
          {(p) => <Textarea {...p} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={4000} required />}
        </Field>
        <Field label={t("issues.urgency")} hint={t(`issues.urgencyHint.${v.urgency}`)}>
          {() => (
            <Segmented<IssueUrgency>
              label={t("issues.urgency")}
              value={v.urgency}
              onChange={(u) => setV({ ...v, urgency: u })}
              options={(["LOW", "NORMAL", "URGENT"] as const).map((u) => ({ value: u, label: t(`urgency.${u}`) }))}
            />
          )}
        </Field>
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium">{t("issues.photos")}</span>
          <PendingFiles files={photos} onRemove={(i) => setPhotos(photos.filter((_, j) => j !== i))} />
          <FilePickerButton images label={t("issues.addPhotos")} onPick={(f) => setPhotos([...photos, ...f].slice(0, 8))} className="self-start" />
        </div>
        <FormError message={save.error} />
        <Button type="submit" size="xl" disabled={save.pending || !v.title.trim() || !v.description.trim()}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("issues.submit")}
        </Button>
      </form>
    </>
  );
}
