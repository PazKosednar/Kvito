import { Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ROUTES } from "@/constants";
import { useNotifications } from "@/hooks/useNotifications";

/** Bell in the header; the dot says there is something new (the count is in the accessible name). */
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
      {unread > 0 && <span aria-hidden="true" className="absolute top-2 right-2 size-2 rounded-full bg-primary" />}
    </Link>
  );
}
