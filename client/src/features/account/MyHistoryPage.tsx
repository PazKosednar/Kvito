import { Copy, Link2, Loader2, X } from "lucide-react";
import { askConfirm } from "@/components/confirm-host";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ErrorState, FormError, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useMyReferences } from "@/hooks/useReferences";
import { formatDate } from "@/lib/dates";
import { HistoryView } from "./HistoryView";

const DAYS = [7, 30, 90] as const;

/** Tenant: preview of the renting history and the links shared with future landlords. */
export function MyHistoryPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const q = useMyReferences();
  const [days, setDays] = useState<(typeof DAYS)[number]>(30);
  const [url, setUrl] = useState<string | null>(null);
  const create = useAsyncAction(async () => setUrl(await q.create(days)));

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("history.copied"));
    } catch {
      toast.error(t("history.copyFailed"));
    }
  };
  const revoke = async (id: string) => {
    if (!(await askConfirm(t("history.confirmRevoke")))) return;
    try {
      await q.revoke(id);
      toast.success(t("history.revoked"));
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <>
      <PageHeader back={ROUTES.home} title={t("history.title")} subtitle={t("history.subtitle")} />

      <Section title={t("history.share")}>
        <p className="-mt-1 mb-3 text-sm text-ink-muted">{t("history.shareHint")}</p>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={t("history.validFor")}>
          {DAYS.map((d) => (
            <Button key={d} type="button" role="radio" aria-checked={days === d} variant={days === d ? "default" : "secondary"} onClick={() => setDays(d)}>
              {t("history.days", { count: d })}
            </Button>
          ))}
          <Button className="ml-auto" disabled={create.pending} onClick={() => void create.run()}>
            {create.pending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {t("history.create")}
          </Button>
        </div>
        {url && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-primary bg-accent-soft p-3">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{url}</code>
            <Button variant="secondary" onClick={() => void copy(url)}>
              <Copy />
              {t("history.copy")}
            </Button>
            <p className="w-full text-xs text-ink-muted">{t("history.onlyOnce")}</p>
          </div>
        )}
        <FormError message={create.error} />

        {q.links.length > 0 && (
          <ul className="mt-4 divide-y divide-line rounded-md border border-line bg-surface-raised">
            {q.links.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-medium">{t("history.linkCreated", { date: formatDate(l.createdAt) })}</span>
                  <span className="block text-ink-muted">{t("history.linkMeta", { date: formatDate(l.expiresAt), count: l.views })}</span>
                </span>
                <Button variant="ghost" size="icon" aria-label={t("history.revoke")} onClick={() => void revoke(l.id)}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={t("history.preview")}>
        {q.history.loading && !q.history.data ? (
          <LoadingState />
        ) : q.history.error || !q.history.data ? (
          <ErrorState message={toMessage(q.history.error)} onRetry={() => void q.history.reload()} />
        ) : (
          <HistoryView {...q.history.data} />
        )}
      </Section>
    </>
  );
}
