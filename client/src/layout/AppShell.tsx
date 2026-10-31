import { Link, Outlet } from "react-router";
import { KvitaLogo } from "@/components/KvitaLogo";
import { ROUTES } from "@/constants";
import { AccountMenu } from "./AccountMenu";
import { RoleSwitch } from "./RoleSwitch";

/** Mobile-first app frame: quiet header (logo + account), role switch for people with both roles. */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-5">
          <Link to={ROUTES.home} className="rounded-md">
            <KvitaLogo withWordmark size="sm" />
          </Link>
          <AccountMenu />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 pt-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
        <RoleSwitch className="mb-8" />
        <Outlet />
      </main>
    </div>
  );
}
