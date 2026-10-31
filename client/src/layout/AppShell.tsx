import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { KvitaLogo } from "@/components/KvitaLogo";
import { ROUTES } from "@/constants";
import { useRole } from "@/hooks/useRole";
import { AccountMenu } from "./AccountMenu";
import { RoleSwitch } from "./RoleSwitch";

/**
 * App frame: a centred column bounded by hairlines (the grid), a header with mono corner labels,
 * and the role switch for people with both roles.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { activeRole } = useRole();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto grid h-14 w-full max-w-3xl grid-cols-[auto_1fr_auto] items-center gap-4 border-x px-5">
          <Link to={ROUTES.home}>
            <KvitaLogo withWordmark size="sm" />
          </Link>
          <p className="label-mono hidden truncate sm:block">{activeRole ? t(`frame.role.${activeRole}`) : t("frame.line1")}</p>
          <div className="col-start-3 justify-self-end">
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col border-x px-5 pt-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
        <RoleSwitch className="mb-8" />
        <Outlet />
      </main>
    </div>
  );
}
