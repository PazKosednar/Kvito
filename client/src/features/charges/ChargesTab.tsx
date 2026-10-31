import { ArrowRight, Check, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { toast } from "sonner";
import { FrameCorners, StatGrid } from "@/components/frame";
import { IsoGlyph, IsoScene } from "@/components/iso";
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
  const next = toPay[0];

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
        // The special moment: every obligation settled – all cubes turn blue.
        <div className="relative mb-10 grid items-center gap-2 border bg-card p-5 sm:grid-cols-[1fr_14rem]">
          <FrameCorners />
          <div>
            <KvitaStamp animate />
            <p className="mt-4 text-2xl leading-tight font-medium tracking-[-0.03em]">{t("charges.kvitaTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("charges.kvitaBody")}</p>
          </div>
          <IsoScene allSettled className="w-full" labels={[t("frame.cube1"), t("frame.cube2"), t("frame.cube3")]} />
        </div>
      )}
      {mine.length === 0 && (
        <div className="grid items-center gap-4 border border-dashed p-5 sm:grid-cols-[1fr_12rem]">
          <div>
            <p className="label-mono">{t("charges.emptyLabel")}</p>
            <p className="mt-2 font-medium">{t("charges.emptyTenantTitle")}</p>
            <p className="mt-1 text-muted-foreground">{t("charges.emptyTenantBody")}</p>
          </div>
          <IsoGlyph name="cubes" className="h-24 w-full" />
        </div>
      )}
      {next && <NextPayment charge={next.charge} share={next.share} tenancyId={tenancy.id} />}
      {toPay.length > 1 && (
        <Section title={t("charges.toPay")}>
          <List>{toPay.slice(1).map(row)}</List>
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="label-mono">{t("charges.overviewLabel")}</p>
        <Button asChild>
          <Link to={`/najemi/${tenancy.id}/obveznosti/nova`}>
            <Plus />
            {t("charges.new")}
          </Link>
        </Button>
      </div>
      <div className="mb-10">
        <StatGrid
          items={[
            { label: t("charges.statOpen"), value: formatCents(summary.openCents) },
            { label: t("charges.statLate"), value: formatCents(summary.overdueCents), tone: summary.overdueCents > 0 ? "danger" : "default" },
            { label: t("charges.statWaiting"), value: formatCents(summary.awaitingConfirmationCents), tone: summary.awaitingConfirmationCents > 0 ? "accent" : "default" },
          ]}
        />
        {summary.openCents === 0 && summary.awaitingConfirmationCents === 0 && charges.length > 0 && (
          <div className="mt-4">
            <KvitaStamp animate />
          </div>
        )}
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

/** The one thing a tenant came for: what to pay next, one tap away from the payment details. */
function NextPayment({ charge, share, tenancyId }: { charge: Charge; share: ChargeShare; tenancyId: string }) {
  const { t } = useTranslation();
  return (
    <Link
      to={`/najemi/${tenancyId}/obveznosti/${charge.id}`}
      className="group relative mb-10 grid border bg-card transition-colors hover:border-foreground/25 sm:grid-cols-[1fr_auto]"
    >
      <FrameCorners />
      <div className="p-5">
        <p className="label-mono flex items-center gap-2">
          <span className={share.status === "OVERDUE" ? "size-1.5 bg-destructive animate-blink" : "size-1.5 bg-primary animate-blink"} aria-hidden="true" />
          {t("charges.nextPayment")}
        </p>
        <p className="tabular mt-4 text-[2.75rem] leading-none font-medium tracking-[-0.05em]">{formatCents(share.amountCents)}</p>
        <p className="mt-3 font-medium">{charge.title}</p>
        <p className="text-sm text-muted-foreground">
          <DueText dueDate={charge.dueDate} status={share.status} />
        </p>
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-primary px-5 py-4 text-primary-foreground sm:flex-col sm:items-start sm:justify-end sm:border-t-0 sm:border-l">
        <span className="font-mono text-xs tracking-[0.06em] uppercase">{t("charges.payNow")}</span>
        <ArrowRight className="size-5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
      </div>
    </Link>
  );
}