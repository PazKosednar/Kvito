import { Check, Circle, Loader2, Minus, Pencil, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Field, MoneyInput, Select, Textarea, TextInput } from "@/components/form";
import { ErrorState, Facts, FormError, List, ListRow, LoadingState, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useAdvances, useCloseout, useCosts, useDeposit, useRentChanges, useSettlements } from "@/hooks/useContract";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useNewItems, useNotifications } from "@/hooks/useNotifications";
import { daysUntil, formatDate, todayInput } from "@/lib/dates";
import { centsToInput, formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { COST_TYPES, type BillingMode, type CostType, type Deposit } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { DepositStatusLabel, SettlementStatusLabel } from "./contract-ui";

const addDaysInput = (days: number) => {
  const d = new Date(`${todayInput()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Everything the contract says about money and time: rent, deposit, cost advances and settlements, the end. */
export function ContractTab() {
  const { tenancy } = useTenancyContext();
  const { unreadContract } = useNewItems();
  const { markRead } = useNotifications();

  // Opening the contract is reading what is new in it.
  const pending = unreadContract[tenancy.id];
  useEffect(() => {
    if (pending?.length) void markRead(pending);
  }, [pending, markRead]);

  return (
    <>
      <RentSection />
      <DepositSection />
      <CostsSection />
      <CloseoutSection />
    </>
  );
}

// ---------- Rent & terms ----------

function RentSection() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord } = useTenancyContext();
  const rent = useRentChanges(tenancy.id);
  const [editing, setEditing] = useState(false);
  const scheduled = rent.changes.filter((c) => !c.appliedAt);
  const applied = rent.changes.filter((c) => c.appliedAt);

  const cancel = async (id: string) => {
    if (!window.confirm(t("contract.rent.confirmCancel"))) return;
    try {
      await rent.cancel(id);
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <Section
      title={t("contract.rent.title")}
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
          { label: t("tenancies.rent"), value: formatCents(tenancy.rentCents) },
          { label: t("tenancies.dueDay"), value: t("tenancies.dueDayValue", { day: tenancy.rentDueDay }) },
          {
            label: t("tenancies.period"),
            value: tenancy.endDate ? `${formatDate(tenancy.startDate)} – ${formatDate(tenancy.endDate)}` : t("tenancies.since", { date: formatDate(tenancy.startDate) }),
          },
          ...(tenancy.noticePeriodDays ? [{ label: t("tenancies.noticePeriod"), value: t("tenancies.noticePeriodValue", { count: tenancy.noticePeriodDays }) }] : []),
          ...(tenancy.rentReviewMonth ? [{ label: t("tenancies.rentReview"), value: t(`months.${tenancy.rentReviewMonth}`) }] : []),
          { label: t("tenancies.costsCovered"), value: tenancy.coveredCosts.length ? tenancy.coveredCosts.map((c) => t(`costs.${c}`)).join(", ") : "–" },
          { label: t("tenancies.split"), value: t(`split.${tenancy.splitMethod}`) },
        ]}
      />

      {scheduled.length > 0 && (
        <List className="mt-4">
          {scheduled.map((c) => (
            <li key={c.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t("contract.rent.scheduled", { date: formatDate(c.effectiveFrom), amount: formatCents(c.rentCents) })}</span>
                <span className="block text-sm text-muted-foreground">
                  {t("contract.rent.before", { amount: formatCents(c.previousCents) })}
                  {c.note && ` ${c.note}`}
                </span>
              </span>
              {isLandlord && (
                <Button variant="ghost" size="icon" aria-label={t("contract.rent.cancel")} onClick={() => void cancel(c.id)}>
                  <X />
                </Button>
              )}
            </li>
          ))}
        </List>
      )}

      {isLandlord && tenancy.status === "ACTIVE" && (editing ? <RentChangeForm onDone={() => setEditing(false)} /> : (
        <Button variant="secondary" className="mt-4" onClick={() => setEditing(true)}>
          {t("contract.rent.change")}
        </Button>
      ))}

      {applied.length > 0 && (
        <p className="mt-4 text-sm text-ink-muted">
          {t("contract.rent.history")}{" "}
          {applied.map((c) => `${formatDate(c.effectiveFrom)}: ${formatCents(c.previousCents)} → ${formatCents(c.rentCents)}`).join("; ")}
        </p>
      )}
    </Section>
  );
}

function RentChangeForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  const rent = useRentChanges(tenancy.id);
  const nextMonth = addDaysInput(32).slice(0, 7);
  const [month, setMonth] = useState(nextMonth);
  const [amount, setAmount] = useState(centsToInput(tenancy.rentCents));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();

  const save = useAsyncAction(async () => {
    const cents = parseAmountToCents(amount);
    if (cents === null) return setError("amount");
    await rent.schedule(month, cents, note.trim() || null);
    toast.success(t("contract.rent.saved"));
    onDone();
  });

  return (
    <form
      className="mt-4 flex flex-col gap-4 rounded-md border border-line bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <p className="text-sm text-ink-muted">{t("contract.rent.hint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("contract.rent.from")}>{(p) => <TextInput {...p} type="month" min={todayInput().slice(0, 7)} value={month} onChange={(e) => setMonth(e.target.value)} />}</Field>
        <Field label={t("contract.rent.newAmount")} error={error}>
          {(p) => <MoneyInput {...p} value={amount} onChange={(e) => (setAmount(e.target.value), setError(undefined))} />}
        </Field>
      </div>
      <Field label={t("contract.rent.note")}>{(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder={t("contract.rent.notePlaceholder")} />}</Field>
      <FormError message={save.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.pending}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("contract.rent.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

// ---------- Deposit ----------

function DepositSection() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord } = useTenancyContext();
  const q = useDeposit(tenancy.id);

  if (q.loading) return <LoadingState />;
  if (q.error || !q.state) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const { deposit, agreedCents } = q.state;
  if (!deposit && !agreedCents && !isLandlord) return null;

  return (
    <Section title={t("contract.deposit.title")} action={deposit ? <DepositStatusLabel status={deposit.status} /> : undefined}>
      {!deposit ? (
        agreedCents ? (
          isLandlord ? (
            <DepositStart amountCents={agreedCents} q={q} />
          ) : (
            <p className="rounded-md border border-line bg-surface-raised p-4 text-ink-muted">{t("contract.deposit.tenantWaiting", { amount: formatCents(agreedCents) })}</p>
          )
        ) : (
          <p className="rounded-md border border-dashed border-line p-4 text-ink-muted">
            {t("contract.deposit.none")}{" "}
            <Link to={`/najemi/${tenancy.id}/uredi`} className="text-primary underline-offset-4 hover:underline">
              {t("contract.deposit.setAmount")}
            </Link>
          </p>
        )
      ) : (
        <DepositState deposit={deposit} q={q} />
      )}
    </Section>
  );
}

type DepositQ = ReturnType<typeof useDeposit>;

function DepositStart({ amountCents, q }: { amountCents: number; q: DepositQ }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"request" | "received">("request");
  const [date, setDate] = useState(addDaysInput(7));
  const run = useAsyncAction(async () => {
    if (mode === "request") await q.request(date);
    else await q.markReceived(date);
    toast.success(t(mode === "request" ? "contract.deposit.requested" : "contract.deposit.recorded"));
  });

  return (
    <div className="rounded-md border border-line bg-surface-raised p-4">
      <p className="amount">{formatCents(amountCents)}</p>
      <p className="mt-1 text-sm text-ink-muted">{t("contract.deposit.startHint")}</p>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label={t("contract.deposit.title")}>
        {(["request", "received"] as const).map((m) => (
          <Button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            variant={mode === m ? "default" : "secondary"}
            onClick={() => {
              setMode(m);
              setDate(m === "request" ? addDaysInput(7) : todayInput());
            }}
          >
            {t(`contract.deposit.mode.${m}`)}
          </Button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label={t(mode === "request" ? "contract.deposit.dueDate" : "contract.deposit.receivedOn")} className="min-w-44 flex-1">
          {(p) => <TextInput {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Button size="lg" disabled={run.pending || !date} onClick={() => void run.run()}>
          {run.pending && <Loader2 className="animate-spin" />}
          {t(mode === "request" ? "contract.deposit.requestCta" : "contract.deposit.receivedCta")}
        </Button>
      </div>
      <FormError message={run.error} />
    </div>
  );
}

function DepositState({ deposit, q }: { deposit: Deposit; q: DepositQ }) {
  const { t } = useTranslation();
  const { tenancy, isLandlord } = useTenancyContext();
  const navigate = useNavigate();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [returnedOn, setReturnedOn] = useState(todayInput());
  const act = useAsyncAction(async (fn: () => Promise<void>, done: string) => {
    await fn();
    toast.success(t(done));
  });

  const proposal = deposit.returnCents != null && deposit.status !== "HELD" && deposit.status !== "AWAITING_PAYMENT";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-line bg-surface-raised p-4">
        <p className="amount">{formatCents(deposit.amountCents)}</p>
        <p className="mt-1 text-sm text-ink-muted">
          {deposit.status === "AWAITING_PAYMENT"
            ? t("contract.deposit.awaiting")
            : deposit.receivedOn
              ? t("contract.deposit.heldSince", { date: formatDate(deposit.receivedOn) })
              : t("contract.deposit.held")}
        </p>
        {deposit.status === "AWAITING_PAYMENT" && deposit.charge && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant={isLandlord ? "secondary" : "default"} size="lg">
              <Link to={`/najemi/${tenancy.id}/obveznosti/${deposit.charge.id}`}>{t(isLandlord ? "contract.deposit.openCharge" : "contract.deposit.pay")}</Link>
            </Button>
            {isLandlord && (
              <Button
                variant="ghost"
                className="text-muted-foreground"
                disabled={act.pending}
                onClick={() => window.confirm(t("contract.deposit.confirmWithdraw")) && void act.run(q.withdraw, "contract.deposit.withdrawn")}
              >
                {t("contract.deposit.withdraw")}
              </Button>
            )}
          </div>
        )}
        {deposit.status === "HELD" && isLandlord && (
          <Button className="mt-4" size="lg" onClick={() => void navigate(`/najemi/${tenancy.id}/pogodba/varscina`)}>
            {t("contract.deposit.proposeCta")}
          </Button>
        )}
        {deposit.status === "HELD" && !isLandlord && <p className="mt-3 text-sm text-ink-muted">{t("contract.deposit.heldTenant")}</p>}
      </div>

      {proposal && (
        <div className="rounded-md border border-line bg-surface-raised">
          <div className="grid grid-cols-2 divide-x divide-line border-b border-line">
            <div className="p-4">
              <p className="label-mono">{t("contract.deposit.returned")}</p>
              <p className="amount mt-1 text-primary">{formatCents(deposit.returnCents!)}</p>
            </div>
            <div className="p-4">
              <p className="label-mono">{t("contract.deposit.kept")}</p>
              <p className="amount mt-1">{formatCents(deposit.keptCents ?? 0)}</p>
            </div>
          </div>
          {deposit.deductions.length > 0 && (
            <ul className="divide-y divide-line">
              {deposit.deductions.map((d) => (
                <li key={d.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                  <span>
                    {d.reason}
                    {d.handoverItem && <span className="block text-sm text-ink-muted">{t("contract.deposit.fromHandover", { item: `${d.handoverItem.room}: ${d.handoverItem.name}` })}</span>}
                  </span>
                  <span className="mono shrink-0">{formatCents(d.amountCents)}</span>
                </li>
              ))}
            </ul>
          )}
          {deposit.proposalNote && <p className="border-t border-line px-4 py-3 text-sm whitespace-pre-line">{deposit.proposalNote}</p>}
          {deposit.returnByMember.length > 1 && (
            <p className="border-t border-line px-4 py-3 text-sm text-ink-muted">
              {t("contract.deposit.perPerson")} {deposit.returnByMember.map((m) => `${m.name}: ${formatCents(m.amountCents)}`).join(", ")}
            </p>
          )}
        </div>
      )}

      {deposit.status === "RETURN_DISPUTED" && deposit.disputeReason && (
        <p className="rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">{t("contract.deposit.disputedNote", { reason: deposit.disputeReason })}</p>
      )}

      {/* Tenant answers a proposal */}
      {deposit.status === "RETURN_PROPOSED" && !isLandlord && (
        disputing ? (
          <div className="flex flex-col gap-3">
            <Field label={t("contract.deposit.disputeLabel")}>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />}</Field>
            <div className="flex gap-2">
              <Button disabled={act.pending || !reason.trim()} onClick={() => void act.run(() => q.dispute(reason.trim()), "contract.deposit.disputeSent")}>
                {t("contract.deposit.disputeSubmit")}
              </Button>
              <Button variant="ghost" onClick={() => setDisputing(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="xl" className="sm:flex-1" disabled={act.pending} onClick={() => void act.run(q.accept, "contract.deposit.acceptedToast")}>
              <Check />
              {t("contract.deposit.accept")}
            </Button>
            <Button size="xl" variant="secondary" className="sm:flex-1" onClick={() => setDisputing(true)}>
              {t("contract.deposit.dispute")}
            </Button>
          </div>
        )
      )}

      {(deposit.status === "RETURN_PROPOSED" || deposit.status === "RETURN_DISPUTED") && isLandlord && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={deposit.status === "RETURN_DISPUTED" ? "default" : "secondary"} onClick={() => void navigate(`/najemi/${tenancy.id}/pogodba/varscina`)}>
            <Pencil />
            {t("contract.deposit.editProposal")}
          </Button>
          {deposit.status === "RETURN_PROPOSED" && <span className="text-sm text-ink-muted">{t("contract.deposit.waitingTenant")}</span>}
        </div>
      )}
      {deposit.status === "RETURN_DISPUTED" && !isLandlord && <p className="text-sm text-ink-muted">{t("contract.deposit.waitingLandlord")}</p>}

      {deposit.status === "RETURN_AGREED" &&
        (isLandlord ? (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-raised p-4">
            <Field label={t("contract.deposit.returnedOn")} className="min-w-44 flex-1">
              {(p) => <TextInput {...p} type="date" value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} />}
            </Field>
            <Button size="lg" disabled={act.pending || !returnedOn} onClick={() => void act.run(() => q.markReturned(returnedOn), "contract.deposit.returnedToast")}>
              {t("contract.deposit.markReturned", { amount: formatCents(deposit.returnCents ?? 0) })}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t("contract.deposit.agreedTenant", { amount: formatCents(deposit.returnCents ?? 0) })}</p>
        ))}

      {deposit.status === "RETURNED" && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-raised p-4">
          <p className="flex-1 text-ink-muted">
            {deposit.returnedOn ? t("contract.deposit.returnedOnText", { date: formatDate(deposit.returnedOn), amount: formatCents(deposit.returnCents ?? 0) }) : t("contract.deposit.allKept")}
            {deposit.receiptConfirmedAt && ` ${t("contract.deposit.receiptConfirmed")}`}
          </p>
          {!isLandlord && !deposit.receiptConfirmedAt && !!deposit.returnCents && (
            <Button disabled={act.pending} onClick={() => void act.run(q.confirmReceipt, "contract.deposit.receiptToast")}>
              <Check />
              {t("contract.deposit.confirmReceipt")}
            </Button>
          )}
        </div>
      )}
      <FormError message={act.error} />
    </div>
  );
}

// ---------- Cost advances & settlements ----------

function CostsSection() {
  const { t } = useTranslation();
  const { tenancy, isLandlord } = useTenancyContext();
  const advances = useAdvances(tenancy.id);
  const settlements = useSettlements(tenancy.id);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);

  if (advances.loading || settlements.loading) return <LoadingState />;
  if (!isLandlord && advances.advances.length === 0 && settlements.settlements.length === 0) return null;
  const combined = tenancy.billingMode === "COMBINED" && tenancy.rentCents > 0 && advances.totalCents > 0;
  const lumpSum = advances.advances.length === 1 && advances.advances[0]!.costType === "OTHER";

  return (
    <Section
      title={t("contract.costs.title")}
      action={
        isLandlord && !editing ? (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            <Pencil />
            {t("contract.costs.editAdvances")}
          </Button>
        ) : undefined
      }
    >
      {editing ? (
        <AdvancesEditor onDone={() => setEditing(false)} />
      ) : advances.advances.length > 0 ? (
        <>
          <dl className="divide-y divide-line rounded-md border border-line bg-surface-raised">
            {combined && (
              <div className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-muted">{t("tenancies.rent")}</dt>
                <dd className="mono">{formatCents(tenancy.rentCents)}</dd>
              </div>
            )}
            {advances.advances.map((a) => (
              <div key={a.id} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
                <dt className="text-ink-muted">{lumpSum ? t("contract.costs.lumpSum") : t(`costs.${a.costType}`)}</dt>
                <dd className="mono">{formatCents(a.amountCents)}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 px-4 py-3">
              <dt className="font-semibold">{t(combined ? "contract.costs.perMonthCombined" : "contract.costs.perMonth")}</dt>
              <dd className="mono font-semibold">{formatCents(advances.totalCents + (combined ? tenancy.rentCents : 0))}</dd>
            </div>
          </dl>
          <p className="mt-2 text-sm text-ink-muted">{t(combined ? "contract.costs.advancesHintCombined" : "contract.costs.advancesHint")}</p>
        </>
      ) : (
        <p className="rounded-md border border-dashed border-line p-4 text-ink-muted">{t(isLandlord ? "contract.costs.noAdvancesLandlord" : "contract.costs.noAdvances")}</p>
      )}

      {isLandlord && !editing && <BillingModeSwitch />}

      {advances.advances.length > 0 && <MonthlyCostsLink />}

      <div className="mt-6 mb-3 flex min-h-9 items-center justify-between gap-3">
        <h3 className="label-mono">{t("contract.costs.settlements")}</h3>
        {isLandlord && !creating && (
          <Button variant="ghost" onClick={() => setCreating(true)}>
            <Plus />
            {t("contract.costs.newSettlement")}
          </Button>
        )}
      </div>
      {creating && <NewSettlementForm onDone={() => setCreating(false)} />}
      {settlements.settlements.length > 0 ? (
        <List>
          {settlements.settlements.map((s) => (
            <ListRow
              key={s.id}
              to={`/najemi/${tenancy.id}/pogodba/obracun/${s.id}`}
              title={`${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`}
              subtitle={
                s.creditChoice && s.creditChoice !== "REFUND" && s.creditRemainingCents > 0 ? (
                  <span className="text-primary">{t(`contract.credit.remaining.${s.creditChoice}`, { amount: formatCents(s.creditRemainingCents) })}</span>
                ) : (
                  <BalanceText cents={s.totals.balanceCents} />
                )
              }
              trailing={<SettlementStatusLabel status={s.status} />}
            />
          ))}
        </List>
      ) : (
        !creating && <p className="text-sm text-ink-muted">{t("contract.costs.noSettlements")}</p>
      )}
    </Section>
  );
}

/** Landlord: rent and costs as one payment a month (pavšal) or as two. Applies from the next monthly charge. */
function BillingModeSwitch() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, update } = useTenancyContext();
  const [busy, setBusy] = useState(false);
  const change = async (billingMode: BillingMode) => {
    if (billingMode === tenancy.billingMode) return;
    setBusy(true);
    try {
      await update({ billingMode });
      toast.success(t("contract.costs.billingSaved"));
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-4">
      <p className="label-mono mb-2">{t("tenancies.billingMode")}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("tenancies.billingMode")}>
        {(["COMBINED", "SEPARATE"] as const).map((m) => (
          <Button key={m} type="button" role="radio" aria-checked={tenancy.billingMode === m} disabled={busy} variant={tenancy.billingMode === m ? "default" : "secondary"} onClick={() => void change(m)}>
            {t(`billingMode.${m}`)}
          </Button>
        ))}
      </div>
      <p className="mt-2 text-sm text-ink-muted">{t(`tenancies.billingModeHint.${tenancy.billingMode}`)}</p>
    </div>
  );
}

/** Entry to the monthly costs, with the running balance so the tenant sees where they stand. */
function MonthlyCostsLink() {
  const { t } = useTranslation();
  const { tenancy, isLandlord } = useTenancyContext();
  const q = useCosts(tenancy.id);
  const r = q.costs?.running;
  const key = !r ? null : r.balanceCents < 0 ? "credit" : r.balanceCents > 0 ? "owes" : "even";
  return (
    <List className="mt-4">
      <ListRow
        to={`/najemi/${tenancy.id}/pogodba/stroski`}
        title={t("contract.monthly.title")}
        subtitle={
          r && key ? (
            <span className={cn(r.balanceCents < 0 && "text-primary")}>{t(`contract.monthly.running.${isLandlord ? "landlord" : "tenant"}.${key}`, { amount: formatCents(Math.abs(r.balanceCents)) })}</span>
          ) : (
            t("contract.monthly.linkHint")
          )
        }
      />
    </List>
  );
}

export function BalanceText({ cents }: { cents: number }) {
  const { t } = useTranslation();
  if (cents > 0) return <>{t("contract.costs.owes", { amount: formatCents(cents) })}</>;
  if (cents < 0) return <span className="text-primary">{t("contract.costs.credit", { amount: formatCents(-cents) })}</span>;
  return <>{t("contract.costs.even")}</>;
}

function AdvancesEditor({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  const advances = useAdvances(tenancy.id);
  const [rows, setRows] = useState<{ costType: CostType; amount: string }[]>(() =>
    advances.advances.length ? advances.advances.map((a) => ({ costType: a.costType, amount: centsToInput(a.amountCents) })) : [{ costType: tenancy.coveredCosts.find((c) => c !== "RENT") ?? "HEATING", amount: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  // One amount for all costs (pavšal), or one per cost type.
  const [lump, setLump] = useState(advances.advances.length === 0 || (advances.advances.length === 1 && advances.advances[0]!.costType === "OTHER"));
  const [lumpAmount, setLumpAmount] = useState(advances.advances.length ? centsToInput(advances.totalCents) : "");
  const free = COST_TYPES.filter((c) => c !== "RENT" && !rows.some((r) => r.costType === c));

  const save = useAsyncAction(async () => {
    const items = lump
      ? lumpAmount.trim()
        ? [{ costType: "OTHER" as CostType, amountCents: parseAmountToCents(lumpAmount) }]
        : []
      : rows.map((r) => ({ costType: r.costType, amountCents: parseAmountToCents(r.amount) }));
    if (items.some((i) => !i.amountCents)) return setError(t("validation.amount"));
    await advances.save(items as { costType: CostType; amountCents: number }[]);
    toast.success(t("contract.costs.advancesSaved"));
    onDone();
  });

  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("contract.costs.advanceKind")}>
        {([true, false] as const).map((v) => (
          <Button key={String(v)} type="button" role="radio" aria-checked={lump === v} variant={lump === v ? "default" : "secondary"} onClick={() => setLump(v)}>
            {t(v ? "contract.costs.lumpSumMode" : "contract.costs.perTypeMode")}
          </Button>
        ))}
      </div>
      <p className="text-sm text-ink-muted">{t(lump ? "contract.costs.lumpSumHint" : "contract.costs.advancesEditHint")}</p>
      {lump && (
        <Field label={t("contract.costs.lumpSum")}>
          {(p) => <MoneyInput {...p} value={lumpAmount} onChange={(e) => (setLumpAmount(e.target.value), setError(null))} placeholder="110,00" />}
        </Field>
      )}
      {!lump && rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
          <Select aria-label={t("contract.costs.costType")} value={r.costType} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, costType: e.target.value as CostType } : x)))}>
            {[r.costType, ...free].map((c) => (
              <option key={c} value={c}>
                {t(`costs.${c}`)}
              </option>
            ))}
          </Select>
          <MoneyInput aria-label={t("contract.costs.amount")} value={r.amount} onChange={(e) => (setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x))), setError(null))} />
          <Button variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            <X />
          </Button>
        </div>
      ))}
      {!lump && free.length > 0 && (
        <Button variant="ghost" className="self-start" onClick={() => setRows([...rows, { costType: free[0]!, amount: "" }])}>
          <Plus />
          {t("contract.costs.addAdvance")}
        </Button>
      )}
      <FormError message={error ?? save.error} />
      <div className="flex gap-2">
        <Button disabled={save.pending} onClick={() => void save.run()}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("common.save")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

function NewSettlementForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenancy } = useTenancyContext();
  const settlements = useSettlements(tenancy.id);
  // Usually last calendar year, never before the tenancy started.
  const lastYear = Number(todayInput().slice(0, 4)) - 1;
  const start = tenancy.startDate.slice(0, 10);
  const [from, setFrom] = useState(`${lastYear}-01-01` < start ? start : `${lastYear}-01-01`);
  const [to, setTo] = useState(`${lastYear}-12-31` < start ? todayInput() : `${lastYear}-12-31`);
  const create = useAsyncAction(async () => {
    const s = await settlements.create(from, to);
    onDone();
    void navigate(`/najemi/${tenancy.id}/pogodba/obracun/${s.id}`);
  });

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-4">
      <p className="text-sm text-ink-muted">{t("contract.costs.newSettlementHint")}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("contract.costs.from")}>{(p) => <TextInput {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Field label={t("contract.costs.to")}>{(p) => <TextInput {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      </div>
      <FormError message={create.error} />
      <div className="flex gap-2">
        <Button disabled={create.pending || !from || !to} onClick={() => void create.run()}>
          {create.pending && <Loader2 className="animate-spin" />}
          {t("contract.costs.createSettlement")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}

// ---------- Closing the tenancy ----------

const CLOSEOUT_LINK: Partial<Record<string, string>> = { charges: "", moveOut: "primopredaja", meters: "stevci", keys: "primopredaja" };

function CloseoutSection() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord, update } = useTenancyContext();
  const q = useCloseout(tenancy.id);
  const nearEnd = tenancy.status === "ENDED" || (tenancy.endDate != null && daysUntil(tenancy.endDate) <= 90);
  if (!isLandlord && !nearEnd) return null;
  if (q.loading || !q.closeout) return null;
  const { items, ready } = q.closeout;

  const end = async () => {
    if (!window.confirm(t(ready ? "tenancies.confirmEnd" : "contract.closeout.confirmEndNotReady"))) return;
    try {
      await update({ status: "ENDED" });
      toast.success(t("tenancies.ended"));
    } catch (err) {
      toast.error(toMessage(err));
    }
  };

  return (
    <Section title={t("contract.closeout.title")}>
      <p className="-mt-1 mb-3 text-sm text-ink-muted">{t(tenancy.status === "ENDED" ? "contract.closeout.endedHint" : "contract.closeout.hint")}</p>
      <ul className="divide-y divide-line rounded-md border border-line bg-surface-raised">
        {items.map((i) => {
          const Icon = i.state === "done" ? Check : i.state === "na" ? Minus : Circle;
          const link = i.key === "credit" && i.detail?.["settlementId"] ? `pogodba/obracun/${i.detail["settlementId"]}` : CLOSEOUT_LINK[i.key];
          // A tenancy with advances set up but not charged yet has nothing to settle so far.
          const variant = i.state === "na" && i.detail?.["configured"] ? "naConfigured" : i.state;
          const text = t(`contract.closeout.items.${i.key}.${variant}`, {
            count: Number(i.detail?.["count"] ?? 0),
            amount: formatCents(Number(i.detail?.["cents"] ?? 0)),
          });
          return (
            <li key={i.key} className="flex min-h-14 items-center gap-3 px-4 py-3">
              <Icon className={cn("size-4 shrink-0", i.state === "done" ? "text-primary" : "text-ink-faint")} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className={cn("block font-medium", i.state === "na" && "text-ink-muted")}>{t(`contract.closeout.items.${i.key}.label`)}</span>
                <span className="block text-sm text-ink-muted">{text}</span>
              </span>
              <span className="sr-only">{t(`contract.closeout.state.${i.state}`)}</span>
              {i.state === "pending" && link !== undefined && (
                <Button asChild variant="ghost" size="sm">
                  <Link to={link ? `/najemi/${tenancy.id}/${link}` : `/najemi/${tenancy.id}`}>{t("contract.closeout.open")}</Link>
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {isLandlord && tenancy.status === "ACTIVE" && (
        <Button variant={ready ? "default" : "ghost"} className={cn("mt-4", !ready && "text-muted-foreground")} onClick={() => void end()}>
          {t("tenancies.endTenancy")}
        </Button>
      )}
    </Section>
  );
}
