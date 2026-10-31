import { Loader2, MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { toast } from "sonner";
import { AttachmentList, FilePickerButton, PendingFiles } from "@/components/attachments";
import { Card } from "@/components/brand";
import { Segmented, Textarea } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useComposer } from "@/hooks/useComposer";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useIssue } from "@/hooks/useIssues";
import { formatDate, formatDateTime } from "@/lib/dates";
import type { IssueStatus } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { IssueStatusBadge, UrgencyLabel } from "./issue-ui";

export function IssuePage() {
  const { issueId } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { user } = useAuth();
  const { tenancy } = useTenancyContext();
  const q = useIssue(issueId);
  const composer = useComposer((body, files) => q.comment(body, files));

  if (q.loading) return <LoadingState />;
  if (q.error || !q.issue) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const { issue, isLandlord } = q;
  const isReporter = issue.reporterId === user?.id;

  const change = async (status: IssueStatus) => {
    try {
      await q.setStatus(status);
      toast.success(t("issues.statusChanged", { status: t(`issueStatus.${status}`) }));
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        back={`/najemi/${tenancy.id}/okvare`}
        eyebrow={`${t(`issueCategory.${issue.category}`)} · ${formatDate(issue.createdAt)}`}
        title={issue.title}
      />
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3 border-b border-line pb-4">
          <IssueStatusBadge status={issue.status} />
          <UrgencyLabel urgency={issue.urgency} />
          <span className="ml-auto text-sm text-ink-muted">{t("issues.reportedBy", { name: issue.reporter.name ?? issue.reporter.email })}</span>
        </div>
        <p className="mt-4 whitespace-pre-wrap">{issue.description}</p>
        <AttachmentList files={issue.attachments} className="mt-4" />
      </Card>

      {isLandlord ? (
        <Section title={t("issues.status")}>
          <Segmented<IssueStatus>
            label={t("issues.status")}
            value={issue.status}
            onChange={(s) => void change(s)}
            options={(["NEW", "IN_PROGRESS", "RESOLVED"] as const).map((s) => ({ value: s, label: t(`issueStatus.${s}`) }))}
          />
        </Section>
      ) : (
        isReporter && (
          <Section>
            {issue.status === "RESOLVED" ? (
              <Button variant="secondary" onClick={() => void change("NEW")}>
                {t("issues.reopen")}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void change("RESOLVED")}>
                {t("issues.markResolved")}
              </Button>
            )}
          </Section>
        )
      )}

      <Section title={t("issues.comments")}>
        {issue.comments.length === 0 && <p className="mb-4 text-sm text-ink-muted">{t("issues.noComments")}</p>}
        <ol className="flex flex-col gap-3">
          {issue.comments.map((c) => (
            <li key={c.id}>
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{c.author.name ?? c.author.email}</span>
                  <span className="mono text-[11px] text-ink-faint">{formatDateTime(c.createdAt)}</span>
                </div>
                {c.body && <p className="mt-2 text-sm whitespace-pre-wrap">{c.body}</p>}
                <AttachmentList files={c.attachments} className="mt-2" />
              </Card>
            </li>
          ))}
        </ol>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void composer.submit();
          }}
        >
          <label htmlFor="comment" className="sr-only">
            {t("issues.commentPlaceholder")}
          </label>
          <Textarea id="comment" value={composer.body} onChange={(e) => composer.setBody(e.target.value)} placeholder={t("issues.commentPlaceholder")} className="min-h-20" maxLength={4000} />
          <PendingFiles files={composer.files} onRemove={composer.removeFile} />
          <FormError message={composer.error} />
          <div className="flex items-center gap-2">
            <FilePickerButton images label={t("issues.addPhotos")} onPick={composer.addFiles} disabled={composer.pending} />
            <Button type="submit" className="ml-auto" disabled={!composer.canSend}>
              {composer.pending ? <Loader2 className="animate-spin" /> : <MessageSquare />}
              {t("issues.addComment")}
            </Button>
          </div>
        </form>
      </Section>
    </>
  );
}
