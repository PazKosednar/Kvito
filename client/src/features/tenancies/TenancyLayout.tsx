import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { Link, NavLink, Outlet, useParams } from "react-router";
import { Eyebrow } from "@/components/brand";
import { CountBadge } from "@/components/count-badge";
import { ErrorState, LoadingState } from "@/components/layout-parts";
import { useNewItems } from "@/hooks/useNotifications";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useUnread } from "@/hooks/useMessages";
import { useRealtime } from "@/hooks/useRealtime";
import { useTenancy } from "@/hooks/useTenancies";
import { cn } from "@/lib/utils";
import { TENANCY_TABS, type TabBadgeKind } from "./tabs";
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
  useRealtime(q.tenancy?.id);
  const unread = useUnread();
  const newItems = useNewItems();

  if (q.loading) return <LoadingState />;
  if (q.error || !q.tenancy) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const { tenancy } = q;
  const tabs = TENANCY_TABS.filter((tab) => !tab.landlordOnly || q.isLandlord);
  const badgeCount = (badge: TabBadgeKind | undefined) =>
    (badge === "unread" ? unread[tenancy.id] : badge === "charges" ? newItems.byTenancy[tenancy.id] : badge === "contract" ? newItems.contractByTenancy[tenancy.id] : 0) ?? 0;
  const href = (path: string) => (path ? `/najemi/${tenancy.id}/${path}` : `/najemi/${tenancy.id}`);

  return (
    <Ctx.Provider value={{ ...q, tenancy }}>
      <div className="mb-6">
        {q.isLandlord && (
          <Link
            to={`/nepremicnine/${tenancy.unit.property.id}`}
            className="-ml-2 mb-4 inline-flex h-9 items-center gap-1 rounded-sm px-2 font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            {t("common.back")}
          </Link>
        )}
        <div className="min-w-0">
          <Eyebrow>
            {tenancy.unit.property.name} · {tenancy.unit.property.city}
          </Eyebrow>
          <h1 className="mt-2 text-title font-semibold lg:text-h1">{tenancy.unit.name}</h1>
          <div className="mt-3 flex items-center gap-3">
            <TenancyStatusLabel status={tenancy.status} />
            <span className="text-sm text-muted-foreground">{tenancy.unit.property.street}</span>
          </div>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
        {/* Phone: horizontal tabs. */}
        <nav aria-label={t("tenancies.sections")} className="-mx-4 mb-6 flex overflow-x-auto border-b border-line px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:hidden">
          {tabs.map((tab) => (
            <NavLink
              key={tab.path}
              to={href(tab.path)}
              end={!tab.path}
              className={({ isActive }) =>
                cn(
                  "-mb-px flex h-11 shrink-0 items-center border-b-2 px-3 font-mono text-xs tracking-[0.06em] whitespace-nowrap uppercase transition-colors",
                  isActive ? "border-primary text-ink" : "border-transparent text-ink-faint hover:text-ink",
                )
              }
            >
              {t(tab.label)}
              <TabBadge tab={tab.badge} count={badgeCount(tab.badge)} className="ml-1.5" />
            </NavLink>
          ))}
        </nav>

        {/* Wide screens: a side list of sections, like a product index. */}
        <nav aria-label={t("tenancies.sections")} className="hidden self-start overflow-hidden rounded-md border border-line bg-surface-raised lg:sticky lg:top-24 lg:block">
          {tabs.map((tab, i) => (
            <NavLink
              key={tab.path}
              to={href(tab.path)}
              end={!tab.path}
              className={({ isActive }) =>
                cn(
                  "flex h-12 items-center gap-3 border-b border-l-2 border-b-line px-3 font-mono text-[11px] font-medium tracking-[0.08em] uppercase transition-colors last:border-b-0",
                  isActive ? "border-l-primary bg-surface-sunken text-ink" : "border-l-transparent text-ink-faint hover:bg-surface-sunken hover:text-ink",
                )
              }
            >
              <span className="tabular opacity-50">{String(i + 1).padStart(2, "0")}</span>
              {t(tab.label)}
              <TabBadge tab={tab.badge} count={badgeCount(tab.badge)} className="ml-auto" />
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

/** New-things count on a section: unread messages, or unread notifications about charges or the contract. */
function TabBadge({ tab, count, className }: { tab: TabBadgeKind | undefined; count: number; className?: string }) {
  const { t } = useTranslation();
  if (!tab || count <= 0) return null;
  const label = { unread: "messages.unread", charges: "charges.newCount", contract: "contract.newCount" }[tab];
  return <CountBadge count={count} className={className} label={t(label, { count })} />;
}