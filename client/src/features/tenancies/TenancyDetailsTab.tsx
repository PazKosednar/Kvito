import { Crown, Mail, Phone, Ruler, UserPlus, UserX, Zap } from "lucide-react";
import { askConfirm } from "@/components/confirm-host";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { Facts, List, Section } from "@/components/layout-parts";
import { splitPreview } from "@/lib/split";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { formatCents } from "@/lib/money";
import { useBasicsItems } from "@/features/properties/details-ui";
import type { TenancyDetail } from "@/types/domain";
import { useTenancyContext } from "./TenancyLayout";

/** People, terms and payee details of a tenancy. Landlords can edit and invite. */
export function TenancyDetailsTab() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord, memberId, removeMember } = useTenancyContext();
  const owner = tenancy.unit.property.owner;

  const remove = async (id: string, name: string) => {
    if (!(await askConfirm(t("tenancies.confirmRemoveMember", { name }), { confirmLabel: t("tenancies.removeMember") }))) return;
    try {
      await removeMember(id);
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
          <div className="rounded-md border border-dashed p-5">
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

      <UnitInfo unit={tenancy.unit} isLandlord={isLandlord} />

      <p className="mt-10 text-sm text-ink-muted">
        {t("tenancies.termsMoved")}{" "}
        <Link to={`/najemi/${tenancy.id}/pogodba`} className="text-primary underline-offset-4 hover:underline">
          {t("tabs.contract")}
        </Link>
      </p>

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

    </>
  );
}

/** What the tenant rents: basics and metering points (both roles see this; keys and photos stay with the landlord). */
function UnitInfo({ unit, isLandlord }: { unit: TenancyDetail["unit"]; isLandlord: boolean }) {
  const { t } = useTranslation();
  const items = useBasicsItems(unit);
  if (unit.energyClass) items.push({ label: t("unitDetails.energyClass"), value: unit.energyClass });
  const points = unit.utilityPoints;
  if (!items.length && !points.length && !isLandlord) return null;
  return (
    <Section
      title={t("unitInfo.title")}
      action={
        isLandlord ? (
          <Button asChild variant="ghost">
            <Link to={`/enote/${unit.id}`}>
              <Ruler />
              {t("unitDetails.open")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
        {items.length > 0 ? (
          <Facts items={items} />
        ) : (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-4 text-ink-muted">{t("unitDetails.emptyBasics")}</p>
        )}
        {points.length > 0 && (
          <div>
            <h3 className="mb-2 label-mono">{t("unitInfo.utilities")}</h3>
            <List>
              {points.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <Zap className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t(`utilities.kinds.${p.kind}`)}</span>
                    {(p.supplier || p.note) && <span className="block truncate text-sm text-ink-muted">{[p.supplier, p.note].filter(Boolean).join(" · ")}</span>}
                  </span>
                  {p.pointNumber && <span className="font-mono text-sm break-all tabular-nums">{p.pointNumber}</span>}
                </li>
              ))}
            </List>
          </div>
        )}
      </div>
    </Section>
  );
}

/** Percentages / persons per flatmate. */
function SharesEditor() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, updateMember } = useTenancyContext();
  const isPct = tenancy.splitMethod === "PERCENTAGE";
  const total = tenancy.members.reduce((s, m) => s + (m.shareBasisPoints ?? 0), 0);
  // What each person pays of the rent with the current shares (the server splits every charge the same way).
  const preview = splitPreview(tenancy.rentCents, tenancy.members, tenancy.splitMethod);

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
    <div className="mt-4 rounded-md border bg-card p-4">
      <p className="font-semibold">{isPct ? t("tenancies.sharesPct") : t("tenancies.sharesPersons")}</p>
      <div className="mt-3 flex flex-col gap-3">
        {tenancy.members.map((m) => (
          <label key={m.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate">{m.user.name ?? m.user.email}</span>
              {preview && <span className="block text-sm text-ink-muted">{t("tenancies.rentShare", { amount: formatCents(preview.get(m.id) ?? 0) })}</span>}
            </span>
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
        <p className="mt-3 text-sm text-danger">{t("tenancies.sharesMustTotal", { total: total / 100 })}</p>
      )}
    </div>
  );
}
