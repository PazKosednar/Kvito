import { DoorOpen, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { ErrorState, List, ListRow, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useProperties } from "@/hooks/useProperties";
import { TenancyStatusLabel, tenantNames } from "@/features/tenancies/tenancy-ui";

/** Landlord home: start steps when empty, otherwise every property with its units. */
export function LandlordHome() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { properties, loading, error, reload } = useProperties();

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={toMessage(error)} onRetry={() => void reload()} />;
  if (!properties?.length) return <LandlordStart />;

  return (
    <>
      {properties.map((p) => (
        <Section
          key={p.id}
          title={
            <Link to={`/nepremicnine/${p.id}`} className="underline-offset-4 hover:underline">
              {p.name}
            </Link>
          }
        >
          {p.units.length === 0 ? (
            <Link to={`/nepremicnine/${p.id}`} className="block rounded-xl border border-dashed p-4 text-muted-foreground hover:border-primary/50">
              {t("units.emptyBody")}
            </Link>
          ) : (
            <List>
              {p.units.map((u) => {
                const tenancy = u.tenancies[0];
                return (
                  <ListRow
                    key={u.id}
                    to={tenancy ? `/najemi/${tenancy.id}` : `/nepremicnine/${p.id}`}
                    leading={<DoorOpen className="size-5 shrink-0 text-primary" aria-hidden="true" />}
                    title={u.name}
                    subtitle={
                      tenancy
                        ? tenantNames(tenancy.members) || t("tenancies.waitingForTenant")
                        : t("units.vacant")
                    }
                    trailing={tenancy ? <TenancyStatusLabel status={tenancy.status} /> : undefined}
                  />
                );
              })}
            </List>
          )}
        </Section>
      ))}
      <Section>
        <Button asChild variant="outline" className="h-12 w-full">
          <Link to="/nepremicnine/nova">
            <Plus />
            {t("properties.add")}
          </Link>
        </Button>
      </Section>
    </>
  );
}

function LandlordStart() {
  const { t } = useTranslation();
  // A real sequence, so it is numbered.
  const steps = (["property", "tenancy", "invite"] as const).map((key) => ({
    title: t(`home.landlordSteps.${key}`),
    hint: t(`home.landlordSteps.${key}Hint`),
  }));

  return (
    <section aria-labelledby="landlord-start">
      <h2 id="landlord-start" className="text-lg text-muted-foreground">
        {t("home.landlordIntro")}
      </h2>
      <ol className="mt-5">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-4 pb-7 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden="true" className="absolute top-10 bottom-1 left-[1.1875rem] w-px bg-border" />}
            <span
              className={
                i === 0
                  ? "tabular flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  : "tabular flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-primary/25 text-sm font-bold text-primary"
              }
            >
              {i + 1}
            </span>
            <div className="pt-1.5">
              <p className="font-semibold">{step.title}</p>
              <p className="mt-1 max-w-[46ch] text-muted-foreground">{step.hint}</p>
            </div>
          </li>
        ))}
      </ol>
      <Button asChild size="xl" className="mt-8 w-full">
        <Link to="/nepremicnine/nova">
          <Plus />
          {t("properties.addFirst")}
        </Link>
      </Button>
    </section>
  );
}
