import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useParams } from "react-router";
import { IsoGlyph } from "@/components/iso";
import { ErrorState, LoadingState } from "@/components/layout-parts";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useTenancy } from "@/hooks/useTenancies";
import { cn } from "@/lib/utils";
import { TENANCY_TABS } from "./tabs";
import { TenancyStatusLabel } from "./tenancy-ui";

type TenancyCtx = ReturnType<typeof useTenancy> & { tenancy: NonNullable<ReturnType<typeof useTenancy>["tenancy"]> };
const Ctx = createContext<TenancyCtx | null>(null);

/** Access the tenancy loaded by the layout (inside /najemi/:id/*). */
export function useTenancyContext(): TenancyCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTenancyContext outside TenancyLayout");
  return ctx;
}

/** One tenancy = one place: header, then sections (tabs on phones, a side list on wide screens). */
export function TenancyLayout() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const q = useTenancy(id);

  if (q.loading) return <LoadingState />;
  if (q.error || !q.tenancy) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const { tenancy } = q;
  const tabs = TENANCY_TABS.filter((tab) => !tab.landlordOnly || q.isLandlord);
  const href = (path: string) => (path ? `/najemi/${tenancy.id}/${path}` : `/najemi/${tenancy.id}`);

  return (
    <Ctx.Provider value={{ ...q, tenancy }}>
      <div className="-mx-5 mb-6 grid grid-cols-[1fr_auto] items-end border-y px-5 py-5 sm:-mx-8 sm:px-8">
        <div className="min-w-0">
          <p className="label-mono truncate">
            {tenancy.unit.property.name} / {tenancy.unit.property.city}
          </p>
          <h1 className="mt-2 text-title font-medium">{tenancy.unit.name}</h1>
          <div className="mt-3 flex items-center gap-3">
            <TenancyStatusLabel status={tenancy.status} />
            <span className="text-sm text-muted-foreground">{tenancy.unit.property.street}</span>
          </div>
        </div>
        <IsoGlyph name="door" lit className="-my-3 hidden h-24 w-36 sm:block" />
      </div>

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
        {/* Phone: horizontal tabs. */}
        <nav aria-label={t("tenancies.sections")} className="-mx-5 mb-6 flex overflow-x-auto border-b px-5 [scrollbar-width:none] sm:-mx-8 sm:px-8 lg:hidden">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={href(tab.path)}
              end={!tab.path}
              className={({ isActive }) =>
                cn(
                  "-mb-px flex h-11 shrink-0 items-center border-b-2 px-3 font-mono text-xs tracking-[0.06em] whitespace-nowrap uppercase transition-colors",
                  isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )
              }
            >
              {t(tab.label)}
            </NavLink>
          ))}
        </nav>

        {/* Wide screens: a side list of sections, like a product index. */}
        <nav aria-label={t("tenancies.sections")} className="hidden self-start border-t lg:sticky lg:top-20 lg:block">
          {tabs.map((tab, i) => (
            <NavLink
              key={tab.path}
              to={href(tab.path)}
              end={!tab.path}
              className={({ isActive }) =>
                cn(
                  "flex h-12 items-center gap-3 border-b border-l-2 px-3 font-mono text-xs tracking-[0.06em] uppercase transition-colors",
                  isActive ? "border-l-primary bg-card text-foreground" : "border-l-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
                )
              }
            >
              <span className="tabular opacity-50">{String(i + 1).padStart(2, "0")}</span>
              {t(tab.label)}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </Ctx.Provider>
  );
}
