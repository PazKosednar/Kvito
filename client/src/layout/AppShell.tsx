import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router";
import { Eyebrow, KvitaLockup } from "@/components/brand";
import { ROUTES } from "@/constants";
import { useOnline } from "@/hooks/useOnline";
import { useRole } from "@/hooks/useRole";
import { AccountMenu } from "./AccountMenu";
import { NotificationsBell } from "./NotificationsBell";
import { ThemeMenu } from "./ThemeMenu";

/** App frame on stone: a quiet header (lockup, role eyebrow, account) and a content column. */
export function AppShell() {
  const { t } = useTranslation();
  const { activeRole } = useRole();
  const location = useLocation();
  const online = useOnline();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-4 px-4 sm:px-6">
          <Link to={ROUTES.home} aria-label={t("app.name")}>
            <KvitaLockup className="h-5" />
          </Link>
          {activeRole && (
            <Eyebrow className="hidden truncate sm:inline-flex">{t(`frame.role.${activeRole}`)}</Eyebrow>
          )}
          <div className="ml-auto flex items-center gap-1">
            <ThemeMenu />
            <NotificationsBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      {!online && (
        <p role="status" className="border-b border-line bg-warn-soft px-4 py-2 text-center text-sm text-warn">
          {t("common.offline")}
        </p>
      )}

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-6 sm:pt-8">
        {/* CGP motion: opacity only, 180 ms. */}
        <div key={location.pathname} className="animate-enter flex flex-1 flex-col">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
