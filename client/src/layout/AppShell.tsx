import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";
import { KvitaLogo } from "@/components/KvitaLogo";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/constants";
import { useRole } from "@/hooks/useRole";
import { AccountMenu } from "./AccountMenu";

/** Mobile-first app frame: sticky header with logo, active role and account menu. */
export function AppShell() {
  const { t } = useTranslation();
  const { activeRole } = useRole();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between gap-3 px-4">
          <Link to={ROUTES.home} className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring">
            <KvitaLogo withWordmark />
          </Link>
          <div className="flex items-center gap-2">
            {activeRole && <Badge variant="secondary">{t(`roles.${activeRole}`)}</Badge>}
            <AccountMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <Outlet />
      </main>
    </div>
  );
}
