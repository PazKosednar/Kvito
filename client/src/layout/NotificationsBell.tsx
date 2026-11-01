import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { CountBadge } from "@/components/count-badge";
import { ROUTES } from "@/constants";
import { useNotifications } from "@/hooks/useNotifications";

/** Bell in the header; the number says how many notifications are new. */
export function NotificationsBell() {
  const { t } = useTranslation();
  const { unread } = useNotifications();
  return (
    <Link
      to={ROUTES.notifications}
      aria-label={unread > 0 ? t("notifications.bellUnread", { count: unread }) : t("notifications.title")}
      className="relative inline-flex size-10 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:text-foreground"
    >
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 && <CountBadge count={unread} label="" className="absolute top-0.5 right-0 h-4 min-w-4 px-1 text-[9px]" />}
    </Link>
  );
}
