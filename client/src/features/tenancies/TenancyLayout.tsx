import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useParams } from "react-router";
import { ErrorState, LoadingState } from "@/components/layout-parts";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useTenancy } from "@/hooks/useTenancies";
import { cn } from "@/lib/utils";
import { TENANCY_TABS } from "./tabs";

type TenancyCtx = ReturnType<typeof useTenancy> & { tenancy: NonNullable<ReturnType<typeof useTenancy>["tenancy"]> };
const Ctx = createContext<TenancyCtx | null>(null);

/** Access the tenancy loaded by the layout (inside /najemi/:id/*). */
export function useTenancyContext(): TenancyCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTenancyContext outside TenancyLayout");
  return ctx;
}

/** One tenancy = one place: header + tabs (charges, messages, issues, …). */
export function TenancyLayout() {
  const { id } = useParams();
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const q = useTenancy(id);

  if (q.loading) return <LoadingState />;
  if (q.error || !q.tenancy) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const { tenancy } = q;
  const tabs = TENANCY_TABS.filter((tab) => !tab.landlordOnly || q.isLandlord);

  return (
    <Ctx.Provider value={{ ...q, tenancy }}>
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">
          {tenancy.unit.property.name}, {tenancy.unit.property.street}, {tenancy.unit.property.city}
        </p>
        <h1 className="mt-1 text-title font-bold">{tenancy.unit.name}</h1>
      </div>
      <nav
        aria-label={t("tenancies.sections")}
        className="-mx-5 mb-6 flex gap-1 overflow-x-auto border-b px-5 [scrollbar-width:none]"
      >
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path ? `/najemi/${tenancy.id}/${tab.path}` : `/najemi/${tenancy.id}`}
            end={!tab.path}
            className={({ isActive }) =>
              cn(
                "-mb-px flex h-11 shrink-0 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                isActive ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {t(tab.label)}
          </NavLink>
        ))}
      </nav>
      <div>
        <Outlet />
      </div>
    </Ctx.Provider>
  );
}
