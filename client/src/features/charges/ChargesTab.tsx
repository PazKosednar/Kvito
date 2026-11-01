import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ChargeCard, Eyebrow, SettledBanner, UnitsIllustration } from "@/components/brand";
import { PanelSummary } from "@/components/frame";
import { ErrorState, List, ListRow, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useCharges, useConfirmShare } from "@/hooks/useCharges";
import { useChargeTitle } from "@/hooks/useChargeTitle";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { daysUntil, formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import type { Charge, ChargeShare, ChargeStatus } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { ChargeStatusPill, DueText } from "./charge-ui";

const UNPAID: ChargeStatus[] = ["OVERDUE", "OPEN", "DISPUTED"];
const byDueAsc = (a: { dueDate: string }, b: { dueDate: string }) => a.dueDate.localeCompare(b.dueDate);

/** "Najemnina · nov 2026" style eyebrow for a charge. */
function useKind() {
  const { t, i18n } = useTranslation();
  return (c: Charge) => {
    const month = new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "sl-SI", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${c.dueDate.slice(0, 10)}T00:00:00Z`))
      .replace(".", "");
    const what = c.type === "DEPOSIT" || c.type === "ADVANCE" || c.type === "SETTLEMENT" ? t(`chargeType.${c.type}`) : t(`costs.${c.costType ?? "OTHER"}`);
    return `${what} · ${month}`;
  };
}

export function ChargesTab() {
  const { tenancy } = useTenancyContext();
  const toMessage = useErrorMessage();
  const q = useCharges(tenancy.id);
  if (q.loading) return <LoadingState />;
  if (q.error || !q.charges || !q.summary) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  return q.isLandlord ? (
    <LandlordCharges charges={q.charges} summary={q.summary} />
  ) : (
    <TenantCharges charges={q.charges} memberId={q.memberId} kvita={q.summary.kvita} />
  );
}

// ---------- Tenant ----------

function TenantCharges({ charges, memberId, kvita }: { charges: Charge[]; memberId: string | null; kvita: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const kind = useKind();
  const titleOf = useChargeTitle();
  const { tenancy } = useTenancyContext();
  const mine = charges
    .map((c) => ({ charge: c, share: c.shares.find((s) => s.memberId === memberId) }))
    .filter((x): x is { charge: Charge; share: ChargeShare } => !!x.share);
  const toPay = mine.filter((x) => UNPAID.includes(x.share.status)).sort((a, b) => byDueAsc(a.charge, b.charge));
  const waiting = mine.filter((x) => x.share.status === "REPORTED_PAID");
  const settled = mine.filter((x) => x.share.status === "CONFIRMED");
  const open = (id: string) => void navigate(`/najemi/${tenancy.id}/obveznosti/${id}`);

  const row = ({ charge, share }: { charge: Charge; share: ChargeShare }) => (
    <ListRow
      key={charge.id}
      to={`/najemi/${tenancy.id}/obveznosti/${charge.id}`}
      title={titleOf(charge)}
      subtitle={<DueText dueDate={charge.dueDate} status={share.status} />}
      trailing={
        <span className="flex flex-col items-end gap-1">
          <span className="mono text-ink">{formatCents(share.amountCents)}</span>
          <ChargeStatusPill status={share.status} />
        </span>
      }
    />
  );

  return (
    <>
      {kvita && toPay.length === 0 && waiting.length === 0 && <SettledBanner className="mb-8" />}

      {mine.length === 0 && (
        <div className="kv-grid-bg grid items-center gap-4 rounded-md border border-line p-5 sm:grid-cols-[1fr_14rem]">
          <div>
            <Eyebrow index="00">{t("tabs.charges")}</Eyebrow>
            <p className="mt-2 text-h3 font-semibold">{t("charges.emptyTenantTitle")}</p>
            <p className="mt-1 text-ink-muted">{t("charges.emptyTenantBody")}</p>
          </div>
          <UnitsIllustration className="max-w-56" />
        </div>
      )}

      {toPay.length > 0 && (
        <Section title={t("charges.toPay")}>
          <div className="flex flex-col gap-4">
            {toPay.map(({ charge, share }, i) => (
              <ChargeCard
                key={charge.id}
                index={String(i + 1).padStart(2, "0")}
                kind={kind(charge)}
                title={titleOf(charge)}
                meta={charge.shares.length > 1 ? t("charges.yourShare", { total: formatCents(charge.amountCents) }) : <DueText dueDate={charge.dueDate} status={share.status} />}
                amountCents={share.amountCents}
                status={share.status}
                due={t("charges.dueShort", { date: formatDate(charge.dueDate) })}
                dueLate={daysUntil(charge.dueDate) < 0}
                action={
                  <Button onClick={() => open(charge.id)} variant={i === 0 ? "default" : "secondary"}>
                    {t("charges.payNow")}
                  </Button>
                }
              />
            ))}
          </div>
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title={t("charges.waiting")}>
          <p className="-mt-1 mb-3 text-sm text-ink-muted">{t("charges.waitingHint")}</p>
          <List>{waiting.map(row)}</List>
        </Section>
      )}
      {settled.length > 0 && <SettledSection items={settled} render={row} />}
    </>
  );
}

// ---------- Landlord ----------

function LandlordCharges({
  charges,
  summary,
}: {
  charges: Charge[];
  summary: { openCents: number; overdueCents: number; awaitingConfirmationCents: number };
}) {
  const { t } = useTranslation();
  const kind = useKind();
  const titleOf = useChargeTitle();
  const { tenancy } = useTenancyContext();
  const toConfirm = charges.flatMap((c) => c.shares.filter((s) => s.status === "REPORTED_PAID").map((s) => ({ charge: c, share: s })));
  const open = charges.filter((c) => c.status === "OPEN" || c.status === "OVERDUE" || c.status === "REPORTED_PAID").sort(byDueAsc);
  const disputed = charges.filter((c) => c.status === "DISPUTED");
  const settled = charges.filter((c) => c.status === "CONFIRMED").map((c) => ({ charge: c }));
  const allSettled = charges.length > 0 && summary.openCents === 0 && summary.awaitingConfirmationCents === 0;

  const row = ({ charge }: { charge: Charge }) => (
    <ListRow
      key={charge.id}
      to={`/najemi/${tenancy.id}/obveznosti/${charge.id}`}
      title={titleOf(charge)}
      subtitle={<DueText dueDate={charge.dueDate} status={charge.status} />}
      trailing={
        <span className="flex flex-col items-end gap-1">
          <span className="mono text-ink">{formatCents(charge.amountCents)}</span>
          <ChargeStatusPill status={charge.status} />
        </span>
      }
    />
  );

  return (
    <>
      {allSettled ? (
        <SettledBanner className="mb-8" />
      ) : (
        <div className="mb-8">
          <PanelSummary
            eyebrow={t("charges.overviewLabel")}
            items={[
              { label: t("charges.statOpen"), value: formatCents(summary.openCents) },
              { label: t("charges.statLate"), value: formatCents(summary.overdueCents), tone: summary.overdueCents > 0 ? "warn" : "default" },
              { label: t("charges.statWaiting"), value: formatCents(summary.awaitingConfirmationCents), tone: summary.awaitingConfirmationCents > 0 ? "signal" : "default" },
            ]}
          />
        </div>
      )}

      <div className="mb-2 flex justify-end">
        <Button asChild>
          <Link to={`/najemi/${tenancy.id}/obveznosti/nova`}>
            <Plus />
            {t("charges.new")}
          </Link>
        </Button>
      </div>

      {toConfirm.length > 0 && (
        <Section title={t("charges.toConfirm")}>
          <div className="flex flex-col gap-4">
            {toConfirm.map(({ charge, share }, i) => (
              <ConfirmCard key={share.id} charge={charge} share={share} index={i} kind={kind(charge)} />
            ))}
          </div>
        </Section>
      )}
      {disputed.length > 0 && (
        <Section title={t("charges.disputed")}>
          <List>{disputed.map((c) => row({ charge: c }))}</List>
        </Section>
      )}
      {open.length > 0 && (
        <Section title={t("charges.open")}>
          <List>{open.map((c) => row({ charge: c }))}</List>
        </Section>
      )}
      {charges.length === 0 && (
        <div className="kv-grid-bg grid items-center gap-4 rounded-md border border-line p-5 sm:grid-cols-[1fr_14rem]">
          <div>
            <Eyebrow index="00">{t("tabs.charges")}</Eyebrow>
            <p className="mt-2 text-h3 font-semibold">{t("charges.emptyLandlordTitle")}</p>
            <p className="mt-1 text-ink-muted">{t("charges.emptyLandlordBody")}</p>
          </div>
          <UnitsIllustration className="max-w-56" />
        </div>
      )}
      {settled.length > 0 && <SettledSection items={settled} render={row} />}
    </>
  );
}

/** Reported payment as a ChargeCard with one primary action: confirm. */
function ConfirmCard({ charge, share, index, kind }: { charge: Charge; share: ChargeShare; index: number; kind: string }) {
  const { t } = useTranslation();
  const titleOf = useChargeTitle();
  const toMessage = useErrorMessage();
  const { tenancy } = useTenancyContext();
  const confirmShare = useConfirmShare(tenancy.id);
  const [busy, setBusy] = useState(false);
  const report = share.paymentReports.find((r) => r.status === "PENDING");

  const confirm = async () => {
    setBusy(true);
    try {
      await confirmShare(charge.id, share.id);
      toast.success(t("charges.confirmed"));
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ChargeCard
      index={String(index + 1).padStart(2, "0")}
      kind={kind}
      title={<Link to={`/najemi/${tenancy.id}/obveznosti/${charge.id}`} className="hover:underline">{titleOf(charge)}</Link>}
      meta={`${t("charges.reportedBy", { name: share.member.user.name ?? share.member.user.email, amount: formatCents(share.amountCents) })}${report?.attachments.length ? `, ${t("charges.withProof")}` : ""}`}
      amountCents={share.amountCents}
      status={share.status}
      due={report?.paidOn ? t("charges.paidOnShort", { date: formatDate(report.paidOn) }) : t("charges.dueShort", { date: formatDate(charge.dueDate) })}
      action={
        <Button disabled={busy} onClick={() => void confirm()}>
          <Check />
          {t("charges.confirm")}
        </Button>
      }
    />
  );
}

function SettledSection<T extends { charge: Charge }>({ items, render }: { items: T[]; render: (x: T) => React.ReactNode }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 5);
  return (
    <Section title={t("charges.settled")}>
      <List>{shown.map(render)}</List>
      {items.length > 5 && !all && (
        <Button variant="ghost" className="mt-2" onClick={() => setAll(true)}>
          {t("charges.showAll", { count: items.length })}
        </Button>
      )}
    </Section>
  );
}
