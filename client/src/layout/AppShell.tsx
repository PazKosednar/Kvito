import { useTranslation } from "react-i18next";
import { Link, Outlet, useLocation } from "react-router";
import { Crosshair } from "@/components/frame";
import { Mosaic } from "@/components/iso";
import { KvitaLogo } from "@/components/KvitaLogo";
import { ROUTES } from "@/constants";
import { useRole } from "@/hooks/useRole";
import { AccountMenu } from "./AccountMenu";
import { RoleSwitch } from "./RoleSwitch";

/**
 * App frame: a centred column bounded by hairlines on engineering paper (wide screens), crosshair marks on the
 * grid intersections, mono corner labels, and a soft enter transition between pages.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { activeRole } = useRole();
  const location = useLocation();
  // Section label for the frame's bottom-left corner, like a drawing's title block.
  const section = location.pathname.split("/")[1] || "home";

  return (
    <div className="app-backdrop flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="relative mx-auto grid h-14 w-full max-w-4xl grid-cols-[auto_1fr_auto] items-center gap-4 border-x bg-background/60 px-5">
          <Link to={ROUTES.home}>
            <KvitaLogo withWordmark size="sm" />
          </Link>
          <div className="hidden min-w-0 items-center gap-3 sm:flex">
            <span className="size-1.5 shrink-0 bg-primary animate-blink" aria-hidden="true" />
            <p className="label-mono truncate">{activeRole ? t(`frame.role.${activeRole}`) : t("frame.line1")}</p>
          </div>
          <div className="col-start-3 justify-self-end">
            <AccountMenu />
          </div>
          <Crosshair className="-bottom-[6px] -left-[6px] hidden lg:block" />
          <Crosshair className="-right-[6px] -bottom-[6px] hidden lg:block" />
        </div>
      </header>

      <main className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col border-x bg-background px-5 pt-6 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:px-8">
        <RoleSwitch className="mb-8" />
        <div key={location.pathname} className="animate-enter flex flex-1 flex-col">
          <Outlet />
        </div>
        <p className="label-mono pointer-events-none absolute bottom-4 left-5 opacity-60 sm:left-8">
          {t(`frame.sections.${section}`, { defaultValue: "Kvita" })}
        </p>
        <p className="label-mono pointer-events-none absolute right-5 bottom-4 opacity-60 sm:right-8">SI</p>
      </main>

      <Mosaic className="pointer-events-none fixed bottom-0 left-0 hidden w-40 xl:grid" />
      <Mosaic className="pointer-events-none fixed top-24 right-0 hidden w-24 rotate-180 xl:grid" cols={4} />
    </div>
  );
}
