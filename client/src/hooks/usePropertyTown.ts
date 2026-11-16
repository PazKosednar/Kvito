import { useMemo } from "react";
import { useOverview } from "@/hooks/useReports";
import type { Property, PropertyType } from "@/types/domain";

/**
 * State of one unit in the town illustration:
 * settled = active tenancy, nothing open; open = charges not yet due or a reported payment waiting for confirmation;
 * attention = overdue or disputed; vacant = no active tenancy.
 */
export type UnitState = "settled" | "open" | "attention" | "vacant";

export interface TownUnit {
  id: string;
  name: string;
  state: UnitState;
  to: string;
}

export interface TownBuilding {
  id: string;
  /** Drawn as a house, an apartment block or a commercial building. */
  type: PropertyType;
  /** Months paid on time over the building's active tenancies, and the reward bushes they grow. */
  onTimeMonths?: number;
  garden?: number;
  name: string;
  address: string;
  to: string;
  units: TownUnit[];
}

/** Reward garden: one bush per three months paid on time (the facade limits how many fit). */
export const gardenFor = (months: number) => Math.floor(months / 3);

/** Turns the landlord's properties + the overview into buildings with lit windows (one window per unit). */
export function usePropertyTown(properties: Property[]) {
  const { byTenancy, onTimeMonths } = useOverview();

  return useMemo(() => {
    const counts: Record<UnitState, number> = { settled: 0, open: 0, attention: 0, vacant: 0 };
    const buildings: TownBuilding[] = properties.map((p) => {
      const months = p.units.reduce((sum, u) => {
        const active = u.tenancies.find((x) => x.status === "ACTIVE");
        return sum + (active ? (onTimeMonths[active.id] ?? 0) : 0);
      }, 0);
      return {
        id: p.id,
        onTimeMonths: months,
        garden: gardenFor(months),
        type: p.type ?? "APARTMENT",
        name: p.name,
        address: `${p.street}, ${p.city}`,
        to: `/nepremicnine/${p.id}`,
        units: p.units.map((u) => {
          const active = u.tenancies.find((x) => x.status === "ACTIVE");
          let state: UnitState = "vacant";
          if (active) {
            const row = byTenancy[active.id];
            if (row && (row.overdueCount > 0 || row.disputedCount > 0)) state = "attention";
            else if (row && (row.openCount > 0 || row.waitingCount > 0)) state = "open";
            else state = "settled";
          }
          counts[state] += 1;
          const tenancy = active ?? u.tenancies[0];
          return { id: u.id, name: u.name, state, to: tenancy ? `/najemi/${tenancy.id}` : `/nepremicnine/${p.id}` };
        }),
      };
    });
    const rented = counts.settled + counts.open + counts.attention;
    return { buildings, counts, rented, total: rented + counts.vacant, allSettled: rented > 0 && rented === counts.settled };
  }, [properties, byTenancy, onTimeMonths]);
}
