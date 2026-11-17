import { ArrowRight, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { CountBadge } from "@/components/count-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/constants";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { formatDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** How many of the latest notifications the dropdown shows; the rest are on the notifications page. */
const LATEST = 5;

/**
 * Bell in the header; the number says how many notifications are new.
 * Click opens a dropdown with the latest notifications and a button to all of them.
 */
export function NotificationsBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { notifications, unread, markRead } = useNotifications();
  const latest = notifications.slice(0, LATEST);

  const open = (n: AppNotification) => {
    if (!n.readAt) void markRead([n.id]);
    if (n.url) void navigate(n.url);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={unread > 0 ? t("notifications.bellUnread", { count: unread }) : t("notifications.title")}
        className="relative inline-flex size-10 items-center justify-center rounded-sm text-ink-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-2"
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 && <CountBadge count={unread} label="" className="absolute top-0.5 right-0 h-4 min-w-4 px-1 text-[9px]" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-md p-1.5">
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t("notifications.latest")}</DropdownMenuLabel>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => void markRead()}
              className="rounded-xs px-2 py-1 text-xs font-medium text-primary transition-colors duration-150 hover:bg-muted"
            >
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>

        {latest.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t("notifications.empty")}</p>
        ) : (
          latest.map((n) => (
            <DropdownMenuItem key={n.id} onSelect={() => open(n)} className="items-start gap-3 py-2.5">
              <span
                aria-hidden="true"
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")}
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                <span className="line-clamp-2 block text-sm text-muted-foreground">{n.body}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-ink-faint">{formatDateTime(n.createdAt)}</span>
              </span>
            </DropdownMenuItem>
          ))
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate(ROUTES.notifications)} className="min-h-10 justify-center font-medium">
          {t("notifications.seeAll")}
          <ArrowRight aria-hidden="true" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
