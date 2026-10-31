import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Eyebrow } from "@/components/brand";
import { IsoGlyph } from "@/components/iso";
import { ErrorState, List, ListRow, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useIssues } from "@/hooks/useIssues";
import { formatDate } from "@/lib/dates";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { IssueStatusBadge, UrgencyLabel } from "./issue-ui";

export function IssuesTab() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy } = useTenancyContext();
  const { issues, loading, error, reload } = useIssues(tenancy.id);

  if (loading) return <LoadingState />;
  if (error || !issues) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;

  const open = issues.filter((i) => i.status !== "RESOLVED");
  const resolved = issues.filter((i) => i.status === "RESOLVED");
  const row = (i: (typeof issues)[number]) => (
    <ListRow
      key={i.id}
      to={`/najemi/${tenancy.id}/okvare/${i.id}`}
      title={i.title}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{t(`issueCategory.${i.category}`)}</span>
          <span className="mono text-ink-faint">{formatDate(i.createdAt)}</span>
          <UrgencyLabel urgency={i.urgency} />
        </span>
      }
      trailing={<IssueStatusBadge status={i.status} />}
    />
  );

  return (
    <>
      <div className="mb-2 flex justify-end">
        <Button asChild>
          <Link to={`/najemi/${tenancy.id}/okvare/nova`}>
            <Plus />
            {t("issues.report")}
          </Link>
        </Button>
      </div>
      {issues.length === 0 && (
        <div className="kv-grid-bg mt-4 grid items-center gap-4 rounded-md border border-line p-5 sm:grid-cols-[1fr_12rem]">
          <div>
            <Eyebrow index="00">{t("tabs.issues")}</Eyebrow>
            <p className="mt-2 text-h3 font-semibold">{t("issues.emptyTitle")}</p>
            <p className="mt-1 text-ink-muted">{t("issues.emptyBody")}</p>
          </div>
          <IsoGlyph name="wrench" className="h-28 w-full" />
        </div>
      )}
      {open.length > 0 && (
        <Section title={t("issues.open")}>
          <List>{open.map(row)}</List>
        </Section>
      )}
      {resolved.length > 0 && (
        <Section title={t("issues.resolved")}>
          <List>{resolved.map(row)}</List>
        </Section>
      )}
    </>
  );
}
