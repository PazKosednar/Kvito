import { ArrowUpRight, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { FrameCorners, ModuleTile } from "@/components/frame";
import { IsoGlyph } from "@/components/iso";
import { ErrorState, List, ListRow, LoadingState } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useProperties } from "@/hooks/useProperties";
import { TenancyStatusLabel, tenantNames } from "@/features/tenancies/tenancy-ui";
import type { Property } from "@/types/domain";

/** Landlord home: start steps when empty, otherwise every property as a framed block with its units. */
export function LandlordHome() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { properties, loading, error, reload } = useProperties();

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;
  if (!properties?.length) return <LandlordStart />;

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="label-mono">{t("properties.indexLabel", { count: properties.length })}</p>
        <Button asChild variant="outline">
          <Link to="/nepremicnine/nova">
            <Plus />
            {t("properties.add")}
          </Link>
        </Button>
      </div>
      <div className="flex flex-col gap-8">
        {properties.map((p, i) => (
          <PropertyBlock key={p.id} property={p} index={i} />
        ))}
      </div>
    </>
  );
}

function PropertyBlock({ property: p, index }: { property: Property; index: number }) {
  const { t } = useTranslation();
  const occupied = p.units.filter((u) => u.tenancies.some((x) => x.status === "ACTIVE")).length;
  return (
    <section className="relative border bg-card">
      <FrameCorners />
      <Link to={`/nepremicnine/${p.id}`} className="group grid grid-cols-[1fr_auto] items-end gap-4 border-b p-4 hover:bg-accent">
        <div className="min-w-0">
          <p className="label-mono">
            {String(index + 1).padStart(2, "0")} / {p.city}
          </p>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-medium tracking-[-0.02em]">
            <span className="truncate">{p.name}</span>
            <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {p.street}, {p.postalCode} {p.city}
          </p>
          <p className="label-mono mt-3">{t("properties.occupancy", { occupied, total: p.units.length })}</p>
        </div>
        <IsoGlyph name="building" lit={occupied > 0} className="hidden h-24 w-32 sm:block" />
      </Link>
      {p.units.length === 0 ? (
        <Link to={`/nepremicnine/${p.id}`} className="block p-4 text-muted-foreground hover:bg-accent">
          {t("units.emptyBody")}
        </Link>
      ) : (
        <List className="border-0">
          {p.units.map((u) => {
            const tenancy = u.tenancies[0];
            return (
              <ListRow
                key={u.id}
                to={tenancy ? `/najemi/${tenancy.id}` : `/nepremicnine/${p.id}`}
                title={u.name}
                subtitle={tenancy ? tenantNames(tenancy.members) || t("tenancies.waitingForTenant") : t("units.vacant")}
                trailing={tenancy ? <TenancyStatusLabel status={tenancy.status} /> : undefined}
              />
            );
          })}
        </List>
      )}
    </section>
  );
}

function LandlordStart() {
  const { t } = useTranslation();
  // A real sequence, so the tiles are numbered.
  const steps = [
    { key: "property", glyph: "building" as const },
    { key: "tenancy", glyph: "slabs" as const },
    { key: "invite", glyph: "key" as const },
  ];
  return (
    <section aria-labelledby="landlord-start">
      <p className="label-mono">{t("home.startLabel")}</p>
      <h2 id="landlord-start" className="mt-2 text-lg text-muted-foreground">
        {t("home.landlordIntro")}
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <ModuleTile
            key={s.key}
            glyph={s.glyph}
            label={`${String(i + 1).padStart(2, "0")} / ${t(`home.landlordSteps.${s.key}`)}`}
            body={t(`home.landlordSteps.${s.key}Hint`)}
            {...(i === 0 ? { to: "/nepremicnine/nova" } : {})}
            className={i === 0 ? "border-primary" : "opacity-70"}
          />
        ))}
      </div>
      <Button asChild size="xl" className="mt-8 w-full justify-between sm:w-auto">
        <Link to="/nepremicnine/nova">
          {t("properties.addFirst")}
          <Plus />
        </Link>
      </Button>
    </section>
  );
}
