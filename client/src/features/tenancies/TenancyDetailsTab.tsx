import { Crown, Mail, Pencil, Phone, UserPlus, UserX } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Facts, List, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { useTenancyContext } from "./TenancyLayout";
import { TenancyStatusLabel } from "./tenancy-ui";

/** People, terms and payee details of a tenancy. Landlords can edit and invite. */
export function TenancyDetailsTab() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord, memberId, removeMember, update } = useTenancyContext();
  const owner = tenancy.unit.property.owner;

  const remove = async (id: string, name: string) => {
    if (!window.confirm(t("tenancies.confirmRemoveMember", { name }))) return;
    try {
      await removeMember(id);
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  const end = async () => {
    if (!window.confirm(t("tenancies.confirmEnd"))) return;
    try {
      await update({ status: "ENDED" });
      toast.success(t("tenancies.ended"));
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <>
      <Section
        title={t("tenancies.people")}
        action={
          isLandlord && tenancy.status === "ACTIVE" ? (
            <Button asChild variant="ghost">
              <Link to={`/najemi/${tenancy.id}/povabi`}>
                <UserPlus />
                {t("invite.cta")}
              </Link>
            </Button>
          ) : undefined
        }
      >
        {tenancy.members.length === 0 ? (
          <div className="rounded-xl border border-dashed p-5">
            <p className="font-semibold">{t("tenancies.noTenantsTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("tenancies.noTenantsBody")}</p>
            {isLandlord && (
              <Button asChild className="mt-4">
                <Link to={`/najemi/${tenancy.id}/povabi`}>
                  <UserPlus />
                  {t("invite.cta")}
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <List>
            {tenancy.members.map((m) => {
              const name = m.user.name ?? m.user.email;
              return (
                <li key={m.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span className="truncate">{name}</span>
                      {m.id === memberId && <span className="text-sm font-normal text-muted-foreground">({t("common.you")})</span>}
                      {m.isPrimary && tenancy.members.length > 1 && (
                        <Crown className="size-4 text-warning" aria-label={t("tenancies.primary")} />
                      )}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {m.user.email}
                      {tenancy.splitMethod === "PERCENTAGE" && m.shareBasisPoints != null && `, ${t("tenancies.sharePct", { pct: m.shareBasisPoints / 100 })}`}
                      {tenancy.splitMethod === "PER_PERSON" && `, ${t("tenancies.persons", { count: m.personCount })}`}
                    </span>
                  </span>
                  {isLandlord && (
                    <Button variant="ghost" size="icon" aria-label={t("tenancies.removeMember")} onClick={() => void remove(m.id, name)}>
                      <UserX />
                    </Button>
                  )}
                </li>
              );
            })}
          </List>
        )}
        {isLandlord && tenancy.members.length > 1 && tenancy.splitMethod !== "EQUAL" && <SharesEditor />}
      </Section>

      {!isLandlord && (
        <Section title={t("tenancies.landlord")}>
          <List>
            <li className="flex flex-col gap-1 px-4 py-3">
              <span className="font-semibold">{owner.name ?? owner.email}</span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <a className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline" href={`mailto:${owner.email}`}>
                  <Mail className="size-4" aria-hidden="true" />
                  {owner.email}
                </a>
                {owner.phone && (
                  <a className="inline-flex items-center gap-1.5 text-primary underline-offset-4 hover:underline" href={`tel:${owner.phone}`}>
                    <Phone className="size-4" aria-hidden="true" />
                    {owner.phone}
                  </a>
                )}
              </span>
            </li>
          </List>
        </Section>
      )}

      <Section
        title={t("tenancies.terms")}
        action={
          isLandlord ? (
            <Button asChild variant="ghost">
              <Link to={`/najemi/${tenancy.id}/uredi`}>
                <Pencil />
                {t("common.edit")}
              </Link>
            </Button>
          ) : undefined
        }
      >
        <Facts
          items={[
            { label: t("tenancies.status.label"), value: <TenancyStatusLabel status={tenancy.status} /> },
            { label: t("tenancies.rent"), value: formatCents(tenancy.rentCents) },
            { label: t("tenancies.dueDay"), value: t("tenancies.dueDayValue", { day: tenancy.rentDueDay }) },
            ...(tenancy.depositCents != null
              ? [{ label: t("tenancies.deposit"), value: formatCents(tenancy.depositCents) }]
              : []),
            {
              label: t("tenancies.period"),
              value: tenancy.endDate
                ? `${formatDate(tenancy.startDate)} – ${formatDate(tenancy.endDate)}`
                : t("tenancies.since", { date: formatDate(tenancy.startDate) }),
            },
            {
              label: t("tenancies.costsCovered"),
              value: tenancy.coveredCosts.length ? tenancy.coveredCosts.map((c) => t(`costs.${c}`)).join(", ") : "–",
            },
            { label: t("tenancies.split"), value: t(`split.${tenancy.splitMethod}`) },
          ]}
        />
      </Section>

      <Section title={t("tenancies.sectionPayee")}>
        <Facts
          items={[
            { label: t("tenancies.payeeName"), value: tenancy.payeeName },
            { label: t("tenancies.iban"), value: <span className="tabular">{tenancy.payeeIban.replace(/(.{4})/g, "$1 ").trim()}</span> },
            ...(tenancy.payeeStreet || tenancy.payeeCity
              ? [{ label: t("tenancies.address"), value: [tenancy.payeeStreet, tenancy.payeeCity].filter(Boolean).join(", ") }]
              : []),
          ]}
        />
      </Section>

      {isLandlord && tenancy.status === "ACTIVE" && (
        <Section>
          <Button variant="ghost" className="text-muted-foreground" onClick={() => void end()}>
            {t("tenancies.endTenancy")}
          </Button>
        </Section>
      )}
    </>
  );
}

/** Percentages / persons per flatmate. */
function SharesEditor() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, updateMember } = useTenancyContext();
  const isPct = tenancy.splitMethod === "PERCENTAGE";
  const total = tenancy.members.reduce((s, m) => s + (m.shareBasisPoints ?? 0), 0);

  const save = async (memberId: string, raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    try {
      await updateMember(memberId, isPct ? { shareBasisPoints: Math.round(n * 100) } : { personCount: Math.max(1, Math.round(n)) });
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <div className="mt-4 rounded-xl border bg-card p-4">
      <p className="font-semibold">{isPct ? t("tenancies.sharesPct") : t("tenancies.sharesPersons")}</p>
      <div className="mt-3 flex flex-col gap-3">
        {tenancy.members.map((m) => (
          <label key={m.id} className="flex items-center justify-between gap-3">
            <span className="truncate">{m.user.name ?? m.user.email}</span>
            <span className="flex items-center gap-2">
              <input
                className="tabular h-11 w-20 rounded-lg border border-input bg-background px-3 text-right"
                inputMode="decimal"
                defaultValue={isPct ? (m.shareBasisPoints != null ? String(m.shareBasisPoints / 100) : "") : String(m.personCount)}
                onBlur={(e) => void save(m.id, e.target.value)}
              />
              <span className="w-6 text-muted-foreground">{isPct ? "%" : ""}</span>
            </span>
          </label>
        ))}
      </div>
      {isPct && total !== 10_000 && (
        <p className="mt-3 text-sm text-destructive">{t("tenancies.sharesMustTotal", { total: total / 100 })}</p>
      )}
    </div>
  );
}
