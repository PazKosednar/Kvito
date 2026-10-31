import { Check, Plus, Receipt } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { KvitaStamp } from "@/components/KvitaStamp";
import { ErrorState, List, ListRow, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useCharges, useConfirmShare } from "@/hooks/useCharges";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { formatCents } from "@/lib/money";
import type { Charge, ChargeShare, ChargeStatus } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { ChargeStatusPill, DueText } from "./charge-ui";

const UNPAID: ChargeStatus[] = ["OVERDUE", "OPEN", "DISPUTED"];
const byDueAsc = (a: { dueDate: string }, b: { dueDate: string }) => a.dueDate.localeCompare(b.dueDate);

export function ChargesTab() {
  const { tenancy } = useTenancyContext();
  const toMessage = useErrorMessage();
  const q = useCharges(tenancy.id);
  if (q.loading) return <LoadingState />;
  if (q.error || !q.charges || !q.summary) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  return q.isLandlord ? <LandlordCharges charges={q.charges} summary={q.summary} /> : <TenantCharges charges={q.charges} memberId={q.memberId} kvita={q.summary.kvita} />;
}

// ---------- Tenant ----------

function TenantCharges({ charges, memberId, kvita }: { charges: Charge[]; memberId: string | null; kvita: boolean }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  const mine = charges
    .map((c) => ({ charge: c, share: c.shares.find((s) => s.memberId === memberId) }))
    .filter((x): x is { charge: Charge; share: ChargeShare } => !!x.share);
  const toPay = mine.filter((x) => UNPAID.includes(x.share.status)).sort((a, b) => byDueAsc(a.charge, b.charge));
  const waiting = mine.filter((x) => x.share.status === "REPORTED_PAID");
  const settled = mine.filter((x) => x.share.status === "CONFIRMED");

  const row = ({ charge, share }: { charge: Charge; share: ChargeShare }) => (
    <ListRow
      key={charge.id}
      to={`/najemi/${tenancy.id}/obveznosti/${charge.id}`}
      title={charge.title}
      subtitle={<DueText dueDate={charge.dueDate} status={share.status} />}
      trailing={
        <span className="flex flex-col items-end gap-1">
          <span className="font-semibold">{formatCents(share.amountCents)}</span>
          {share.status !== "OPEN" && <ChargeStatusPill status={share.status} />}
        </span>
      }
    />
  );

  return (
    <>
      {kvita && toPay.length === 0 && waiting.length === 0 && (
        <div className="mb-8 flex items-center gap-4 rounded-xl border bg-card p-5">
          <KvitaStamp className="shrink-0" />
          <div>
            <p className="font-semibold">{t("charges.kvitaTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("charges.kvitaBody")}</p>
          </div>
        </div>
      )}
      {mine.length === 0 && (
        <div className="rounded-xl border border-dashed p-5">
          <Receipt className="size-6 text-primary" aria-hidden="true" />
          <p className="mt-2 font-semibold">{t("charges.emptyTenantTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("charges.emptyTenantBody")}</p>
        </div>
      )}
      {toPay.length > 0 && (
        <Section title={t("charges.toPay")}>
          <List>{toPay.map(row)}</List>
        </Section>
      )}
      {waiting.length > 0 && (
        <Section title={t("charges.waiting")}>
          <p className="-mt-1 mb-3 text-sm text-muted-foreground">{t("charges.waitingHint")}</p>
          <List>{waiting.map(row)}</List>
        </Section>
      )}
      {settled.length > 0 && <SettledSection items={settled} render={row} />}
    </>
  );
}

// ---------- Landlord ----------

function LandlordCharges({ charges, summary }: { charges: Charge[]; summary: { openCents: number; overdueCents: number; awaitingConfirmationCents: number } }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  const toConfirm = charges.flatMap((c) => c.shares.filter((s) => s.status === "REPORTED_PAID").map((s) => ({ charge: c, share: s })));
  const open = charges.filter((c) => c.status === "OPEN" || c.status === "OVERDUE" || c.status === "REPORTED_PAID").sort(byDueAsc);
  const disputed = charges.filter((c) => c.status === "DISPUTED");
  const settled = charges.filter((c) => c.status === "CONFIRMED").map((c) => ({ charge: c }));

  const row = ({ charge }: { charge: Charge }) => (
    <ListRow
      key={charge.id}
      to={`/najemi/${tenancy.id}/obveznosti/${charge.id}`}
      title={charge.title}
      subtitle={<DueText dueDate={charge.dueDate} status={charge.status} />}
      trailing={
        <span className="flex flex-col items-end gap-1">
          <span className="font-semibold">{formatCents(charge.amountCents)}</span>
          {charge.status !== "OPEN" && <ChargeStatusPill status={charge.status} />}
        </span>
      }
    />
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">
          {summary.openCents === 0 && summary.awaitingConfirmationCents === 0
            ? t("charges.landlordAllSettled")
            : summary.overdueCents > 0
              ? t("charges.landlordSummaryLate", { open: formatCents(summary.openCents), late: formatCents(summary.overdueCents) })
              : t("charges.landlordSummary", { open: formatCents(summary.openCents) })}
        </p>
        <Button asChild>
          <Link to={`/najemi/${tenancy.id}/obveznosti/nova`}>
            <Plus />
            {t("charges.new")}
          </Link>
        </Button>
      </div>

      {toConfirm.length > 0 && (
        <Section title={t("charges.toConfirm")}>
          <List>
            {toConfirm.map(({ charge, share }) => (
              <ConfirmRow key={share.id} charge={charge} share={share} />
            ))}
          </List>
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
        <div className="rounded-xl border border-dashed p-5">
          <p className="font-semibold">{t("charges.emptyLandlordTitle")}</p>
          <p className="mt-1 text-muted-foreground">{t("charges.emptyLandlordBody")}</p>
        </div>
      )}
      {settled.length > 0 && <SettledSection items={settled} render={row} />}
    </>
  );
}

/** One tap to confirm a reported payment, straight from the list. */
function ConfirmRow({ charge, share }: { charge: Charge; share: ChargeShare }) {
  const { t } = useTranslation();
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
    <li className="flex min-h-16 items-center gap-3 px-4 py-3">
      <Link to={`/najemi/${tenancy.id}/obveznosti/${charge.id}`} className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{charge.title}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {t("charges.reportedBy", { name: share.member.user.name ?? share.member.user.email, amount: formatCents(share.amountCents) })}
          {report?.attachments.length ? `, ${t("charges.withProof")}` : ""}
        </span>
      </Link>
      <Button className="h-11" disabled={busy} onClick={() => void confirm()}>
        <Check />
        {t("charges.confirm")}
      </Button>
    </li>
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
