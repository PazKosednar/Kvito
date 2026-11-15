import { useTranslation } from "react-i18next";
import { useParams } from "react-router";
import { KvitaLockup } from "@/components/brand";
import { LoadingState } from "@/components/layout-parts";
import { HistoryView } from "@/features/account/HistoryView";
import { useSharedReference } from "@/hooks/useReferences";
import { formatDate } from "@/lib/dates";

/** Public page behind a shared link: a tenant's verified renting history. No account needed. */
export function ReferencePage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const q = useSharedReference(token);

  return (
    <div className="min-h-dvh bg-surface px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-16 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <a href="/" aria-label={t("app.name")}>
          <KvitaLockup className="h-5" />
        </a>
        <div className="mt-8">
          {q.loading && !q.reference ? (
            <LoadingState />
          ) : !q.reference ? (
            <div className="rounded-md border border-dashed border-line p-6">
              <h1 className="text-title font-semibold">{t("history.notFoundTitle")}</h1>
              <p className="mt-2 text-ink-muted">{t("history.notFoundBody")}</p>
            </div>
          ) : (
            <>
              <HistoryView name={q.reference.name} history={q.reference.history} landlords={q.reference.landlords} landlordInfo={q.reference.landlordInfo} />
              <p className="mt-6 text-xs text-ink-faint">{t("history.validUntil", { date: formatDate(q.reference.expiresAt) })}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
