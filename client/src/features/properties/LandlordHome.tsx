import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ModuleTile } from "@/components/frame";
import { ErrorState, LoadingState } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useProperties } from "@/hooks/useProperties";
import { PropertyTown } from "./PropertyTown";
import { OverviewPanel } from "./OverviewPanel";

/** Landlord home: start steps when empty, otherwise the property town (overview of every unit) on top. */
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
      <div className="mb-4 empty:hidden">
        <OverviewPanel />
      </div>
      <PropertyTown properties={properties} />
    </>
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
            index={String(i + 1).padStart(2, "0")}
            label={t(`home.landlordSteps.${s.key}`)}
            body={t(`home.landlordSteps.${s.key}Hint`)}
            {...(i === 0 ? { to: "/nepremicnine/nova" } : {})}
            className={i === 0 ? "border-line-strong" : undefined}
          />
        ))}
      </div>
      <Button asChild size="xl" className="mt-8 w-full sm:w-auto">
        <Link to="/nepremicnine/nova">
          {t("properties.addFirst")}
          <Plus />
        </Link>
      </Button>
    </section>
  );
}
