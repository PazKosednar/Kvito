import { Sprout } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Eyebrow } from "@/components/brand";
import { TownCanvas } from "@/features/properties/PropertyTown";
import { gardenFor, type UnitState } from "@/hooks/usePropertyTown";
import type { ChargeStatus, TenancyDetail } from "@/types/domain";
import { useTenancyContext } from "./TenancyLayout";

/** The tenant's window state from their own shares, same rule as the landlord's town: late or disputed, open or waiting, else settled. */
export function tenantWindowState(statuses: ChargeStatus[]): UnitState {
  if (statuses.some((s) => s === "OVERDUE" || s === "DISPUTED")) return "attention";
  if (statuses.some((s) => s === "OPEN" || s === "REPORTED_PAID")) return "open";
  return "settled";
}

/**
 * "Your home": the tenant's own building (by property type) in the town style, with only their window lit
 * by the state of their payments, and the reward garden for months paid on time. Shows nothing about other units.
 */
export function TenantHomeScene({ state, className }: { state: UnitState; className?: string }) {
  const { t } = useTranslation();
  const { tenancy, onTimeMonths } = useTenancyContext();
  const building = toBuilding(tenancy, state, onTimeMonths);

  return (
    <section aria-labelledby="tenant-home-title" className={`on-panel overflow-hidden rounded-md bg-panel ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6">
        <Eyebrow onPanel>
          <span id="tenant-home-title">{t("town.home")}</span>
        </Eyebrow>
        <p className="font-mono text-[11px] leading-4 font-medium tracking-[0.08em] uppercase">
          {state === "settled" ? <span className="text-signal">Kvito ✓</span> : <span className="text-ink-on-panel-muted">{t(`town.state.${state}`)}</span>}
        </p>
      </div>
      <TownCanvas buildings={[building]} label={t("town.home")} showIndex={false} compact className="[&_svg]:max-h-64" />
      <p className="flex items-center gap-2 border-t border-ink-on-panel/15 px-5 py-3 text-xs text-ink-on-panel-muted sm:px-6">
        <Sprout className="size-3.5 shrink-0" aria-hidden="true" />
        {onTimeMonths > 0 ? t("town.gardenHint", { count: onTimeMonths }) : t("town.gardenHintEmpty")}
      </p>
    </section>
  );
}

function toBuilding(tenancy: TenancyDetail, state: UnitState, months: number) {
  const p = tenancy.unit.property;
  const to = `/najemi/${tenancy.id}`;
  return {
    id: p.id,
    type: p.type ?? "APARTMENT",
    name: p.name,
    address: `${p.street}, ${p.city}`,
    to,
    onTimeMonths: months,
    garden: gardenFor(months),
    units: [{ id: tenancy.unit.id, name: tenancy.unit.name, state, to }],
  };
}
