import { BellRing, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { ErrorState, List, ListRow, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useIosInstallHint } from "@/hooks/useIosInstallHint";
import { useNotifications, usePushSetup, type AppNotification } from "@/hooks/useNotifications";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

export function NotificationsPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const navigate = useNavigate();
  const q = useNotifications();

  const open = (n: AppNotification) => {
    if (!n.readAt) void q.markRead([n.id]);
    if (n.url) void navigate(n.url);
  };

  return (
    <>
      <PageHeader
        eyebrow={t("notifications.eyebrow")}
        title={t("notifications.title")}
        action={
          q.unread > 0 ? (
            <Button variant="ghost" onClick={() => void q.markRead()}>
              {t("notifications.markAllRead")}
            </Button>
          ) : undefined
        }
      />

      <PushCard />

      {q.loading ? (
        <LoadingState />
      ) : q.error && !q.data ? (
        <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />
      ) : q.notifications.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("notifications.empty")}</p>
      ) : (
        <List>
          {q.notifications.map((n) => (
            <li key={n.id}>
              <ListRow
                onClick={() => open(n)}
                title={<span className={cn(!n.readAt && "font-semibold")}>{n.title}</span>}
                subtitle={
                  <>
                    {n.body}
                    <span className="mt-1 block font-mono text-xs text-ink-faint">{formatDateTime(n.createdAt)}</span>
                  </>
                }
                leading={<span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />}
              />
            </li>
          ))}
        </List>
      )}
    </>
  );
}

/** Switches push on for this device, or explains why that is not possible. */
function PushCard() {
  const { t } = useTranslation();
  const push = usePushSetup();
  const ios = useIosInstallHint();

  if (push.state === "loading" || push.state === "unconfigured") return null;

  return (
    <div className="mb-8 rounded-md border border-line bg-surface-raised p-4">
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t(`notifications.push.${push.state}.title`)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t(`notifications.push.${push.state}.body`)}</p>
          {ios.visible && push.state === "unsupported" && <p className="mt-2 text-sm text-muted-foreground">{t("install.iosBody")}</p>}
        </div>
        {(push.state === "off" || push.state === "on") && (
          <Button variant={push.state === "off" ? "default" : "outline"} disabled={push.busy} onClick={() => void (push.state === "off" ? push.enable() : push.disable())}>
            {push.busy && <Loader2 className="animate-spin" />}
            {t(push.state === "off" ? "notifications.push.enable" : "notifications.push.disable")}
          </Button>
        )}
      </div>
    </div>
  );
}
