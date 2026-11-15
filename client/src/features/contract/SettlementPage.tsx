import { Check, FileText, Loader2, Paperclip, Send, Table2, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Field, Select, Textarea, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSettlement } from "@/hooks/useContract";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { apiUrl } from "@/lib/api";
import { formatDate, todayInput } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { CREDIT_CHOICES, type CreditChoice, type Settlement, type SettlementLine } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { BalanceText } from "./ContractTab";
import { CostMonthsTable, SettlementStatusLabel, useMonthLabel } from "./contract-ui";

type Q = ReturnType<typeof useSettlement>;

export function SettlementPage() {
  const { settlementId } = useParams();
  const toMessage = useErrorMessage();
  const q = useSettlement(settlementId);
  if (q.loading) return <LoadingState />;
  if (q.error || !q.settlement) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const editable = q.isLandlord && (q.settlement.status === "DRAFT" || q.settlement.status === "DISPUTED");
  // key: a fresh editor after every save, so inputs show what the server computed.
  const key = q.settlement.lines.map((l) => `${l.costType}${l.advanceCents}${l.actualCents}`).join("|") + q.settlement.periodFrom + q.settlement.periodTo + q.settlement.carriedInCents;
  return editable ? <SettlementEditor key={key} s={q.settlement} q={q} /> : <SettlementView s={q.settlement} q={q} />;
}

function Header({ s }: { s: Settlement }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  return (
    <PageHeader
      back={`/najemi/${tenancy.id}/pogodba`}
      eyebrow={t("contract.costs.settlement")}
      title={`${formatDate(s.periodFrom)} – ${formatDate(s.periodTo)}`}
      action={<SettlementStatusLabel status={s.status} />}
    />
  );
}

/** Label of a settlement line: the lump-sum advance reads as such, not as "other costs". */
function useLineLabel() {
  const { t } = useTranslation();
  return (l: SettlementLine) => (l.costType === "OTHER" && l.advanceCents > 0 && l.actualCents === 0 ? t("contract.costs.lumpSum") : t(`costs.${l.costType}`));
}

/** Months of the period (like the landlord's spreadsheet); settlements made before monthly costs show their lines. */
function Breakdown({ s }: { s: Settlement }) {
  const { t } = useTranslation();
  const lineLabel = useLineLabel();
  if (s.monthCostTypes.length > 0) return <CostMonthsTable months={s.months} costTypes={s.monthCostTypes} />;
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-surface-raised">
      {s.lines.map((l) => (
        <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-3">
          <span className="font-medium">{lineLabel(l)}</span>
          <span className="mono text-right">{formatCents(l.actualCents)}</span>
          <span className="text-sm text-ink-muted">{t("contract.costs.advancesWere", { amount: formatCents(l.advanceCents) })}</span>
          <span className="text-right text-sm">
            <BalanceText cents={l.actualCents - l.advanceCents} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Notes the landlord wrote per cost type (e.g. "po obračunu upravnika"). */
function LineNotes({ s }: { s: Settlement }) {
  const lineLabel = useLineLabel();
  const withNotes = s.lines.filter((l) => l.note);
  if (!withNotes.length) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-muted">
      {withNotes.map((l) => (
        <li key={l.id}>
          <span className="font-medium text-ink">{lineLabel(l)}:</span> {l.note}
        </li>
      ))}
    </ul>
  );
}

function Totals({ s }: { s: Settlement }) {
  const { t } = useTranslation();
  const row = "flex items-baseline justify-between gap-4 px-4 py-2.5";
  return (
    <dl className="mt-4 divide-y divide-line rounded-md border border-line bg-surface-raised">
      <div className={row}>
        <dt className="text-ink-muted">{t("contract.costs.actualTotal")}</dt>
        <dd className="mono">{formatCents(s.totals.actualCents)}</dd>
      </div>
      <div className={row}>
        <dt className="text-ink-muted">{t("contract.costs.advancesTotal")}</dt>
        <dd className="mono">− {formatCents(s.totals.advanceCents)}</dd>
      </div>
      {s.totals.carriedInCents > 0 && (
        <div className={row}>
          <dt className="text-ink-muted">{t("contract.costs.carriedIn")}</dt>
          <dd className="mono">− {formatCents(s.totals.carriedInCents)}</dd>
        </div>
      )}
      <div className={cn(row, "py-3")}>
        <dt className="font-semibold">{t("contract.costs.result")}</dt>
        <dd className="font-semibold">
          <BalanceText cents={s.totals.balanceCents} />
        </dd>
      </div>
    </dl>
  );
}

function Bills({ s, q, canEdit }: { s: Settlement; q: Q; canEdit: boolean }) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [uploading, setUploading] = useState(false);
  if (!canEdit && s.attachments.length === 0) return null;

  const add = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await q.attachFile(file);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title={t("contract.costs.bills")}>
      {s.attachments.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-md border border-line bg-surface-raised">
          {s.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <FileText className="size-4 shrink-0 text-ink-faint" aria-hidden="true" />
              <a href={apiUrl(a.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-primary underline-offset-4 hover:underline">
                {a.fileName}
              </a>
              {canEdit && (
                <Button variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => void q.detachFile(a.id).catch((err: unknown) => toast.error(toMessage(err)))}>
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <label className={cn("inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-line bg-card px-4 text-sm font-medium hover:border-primary/50", uploading && "pointer-events-none opacity-60")}>
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" aria-hidden="true" />}
          {t("contract.costs.addBill")}
          <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => void add(e.target.files?.[0])} />
        </label>
      )}
    </Section>
  );
}

// ---------- Landlord: draft / disputed ----------

function SettlementEditor({ s, q }: { s: Settlement; q: Q }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenancy } = useTenancyContext();
  const lineLabel = useLineLabel();
  const [from, setFrom] = useState(s.periodFrom.slice(0, 10));
  const [to, setTo] = useState(s.periodTo.slice(0, 10));
  const [notes, setNotes] = useState(() => Object.fromEntries(s.lines.map((l) => [l.costType, l.note ?? ""])));
  const [note, setNote] = useState(s.note ?? "");
  const [dueDate, setDueDate] = useState(s.dueDate?.slice(0, 10) ?? "");
  const [recommended, setRecommended] = useState<CreditChoice | "">(s.recommendedChoice ?? "");
  const balance = s.totals.balanceCents;
  const periodChanged = from !== s.periodFrom.slice(0, 10) || to !== s.periodTo.slice(0, 10);

  const body = () => ({
    periodFrom: from,
    periodTo: to,
    note: note.trim() || null,
    dueDate: dueDate || null,
    recommendedChoice: recommended || null,
    lines: s.lines.map((l) => ({ costType: l.costType, note: notes[l.costType]?.trim() || null })),
  });

  const save = useAsyncAction(async (andSend: boolean) => {
    await q.update(body());
    if (andSend) {
      await q.send();
      toast.success(t("contract.costs.sent"));
      void navigate(`/najemi/${tenancy.id}/pogodba`);
    } else toast.success(t("contract.costs.saved"));
  });

  const remove = async () => {
    if (!window.confirm(t("contract.costs.confirmDelete"))) return;
    await q.remove();
    void navigate(`/najemi/${tenancy.id}/pogodba`);
  };

  const monthsLink = `/najemi/${tenancy.id}/pogodba/stroski?od=${s.periodFrom.slice(0, 7)}&do=${s.periodTo.slice(0, 7)}`;

  return (
    <>
      <Header s={s} />
      {s.status === "DISPUTED" && s.disputeReason && <p className="mb-6 rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">{t("contract.costs.disputedNote", { reason: s.disputeReason })}</p>}

      <Section title={t("contract.costs.period")}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("contract.costs.from")}>{(p) => <TextInput {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label={t("contract.costs.to")}>{(p) => <TextInput {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        {periodChanged && (
          <Button variant="secondary" className="mt-3" disabled={save.pending} onClick={() => void save.run(false)}>
            {t("contract.costs.recalculate")}
          </Button>
        )}
      </Section>

      <Section
        title={t("contract.monthly.title")}
        action={
          <Button asChild variant="ghost">
            <Link to={monthsLink}>
              <Table2 />
              {t("contract.costs.editMonths")}
            </Link>
          </Button>
        }
      >
        <p className="-mt-1 mb-3 text-sm text-ink-muted">{t("contract.costs.fromMonthsHint")}</p>
        {s.monthCostTypes.length > 0 ? (
          <CostMonthsTable months={s.months} costTypes={s.monthCostTypes} />
        ) : (
          <p className="rounded-md border border-dashed border-line p-4 text-ink-muted">
            {t("contract.costs.noMonthsYet")}{" "}
            <Link to={monthsLink} className="text-primary underline-offset-4 hover:underline">
              {t("contract.costs.editMonths")}
            </Link>
          </p>
        )}
        <Totals s={s} />
      </Section>

      {s.lines.length > 0 && (
        <Section title={t("contract.costs.lineNotes")}>
          <div className="flex flex-col gap-3">
            {s.lines.map((l) => (
              <Field key={l.costType} label={lineLabel(l)}>
                {(p) => <TextInput {...p} value={notes[l.costType] ?? ""} onChange={(e) => setNotes({ ...notes, [l.costType]: e.target.value })} maxLength={200} placeholder={t("contract.costs.lineNotePlaceholder")} />}
              </Field>
            ))}
          </div>
        </Section>
      )}

      <Section>
        {balance > 0 && (
          <Field label={t("contract.costs.dueDate")} hint={t("contract.costs.dueDateHint")}>
            {(p) => <TextInput {...p} type="date" min={todayInput()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
          </Field>
        )}
        {balance < 0 && (
          <Field label={t("contract.credit.recommendLabel")} hint={t("contract.credit.recommendHint")}>
            {(p) => (
              <Select {...p} value={recommended} onChange={(e) => setRecommended(e.target.value as CreditChoice | "")}>
                <option value="">{t("contract.credit.noRecommendation")}</option>
                {CREDIT_CHOICES.map((c) => (
                  <option key={c} value={c}>
                    {t(`contract.credit.choice.${c}.title`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t("contract.costs.note")} className="mt-4">
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t("contract.costs.notePlaceholder")} />}
        </Field>
      </Section>

      <Bills s={s} q={q} canEdit />

      <div className="mt-8 flex flex-col gap-3">
        <FormError message={save.error} />
        <Button size="xl" disabled={save.pending || periodChanged || s.lines.length === 0 || (balance > 0 && !dueDate)} onClick={() => void save.run(true)}>
          {save.pending ? <Loader2 className="animate-spin" /> : <Send />}
          {t("contract.costs.send")}
        </Button>
        <Button variant="secondary" size="lg" disabled={save.pending} onClick={() => void save.run(false)}>
          {t("contract.costs.saveDraft")}
        </Button>
        {s.status === "DRAFT" && (
          <Button variant="ghost" className="text-danger hover:text-destructive" onClick={() => void remove()}>
            <Trash2 />
            {t("contract.costs.delete")}
          </Button>
        )}
      </div>
    </>
  );
}

// ---------- Everyone: sent, accepted, closed ----------

function CreditChoicePicker({ s, value, onChange }: { s: Settlement; value: CreditChoice | null; onChange: (c: CreditChoice) => void }) {
  const { t } = useTranslation();
  const monthLabel = useMonthLabel();
  const amount = formatCents(-s.totals.balanceCents);
  const detail = (c: CreditChoice) =>
    c === "OFFSET_NEXT" && s.nextPayment
      ? t("contract.credit.choice.OFFSET_NEXT.preview", { month: monthLabel(s.nextPayment.period), after: formatCents(s.nextPayment.afterCents), before: formatCents(s.nextPayment.beforeCents) })
      : t(`contract.credit.choice.${c}.text`, { amount });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-semibold">{t("contract.credit.question", { amount })}</legend>
      {CREDIT_CHOICES.map((c) => (
        <label
          key={c}
          className={cn(
            "flex min-h-16 cursor-pointer items-start gap-3 rounded-md border bg-surface-raised p-4 transition-colors duration-150",
            value === c ? "border-primary" : "border-line hover:border-line-strong",
          )}
        >
          <input type="radio" name="credit-choice" className="mt-1 size-4 accent-primary" checked={value === c} onChange={() => onChange(c)} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {t(`contract.credit.choice.${c}.title`)}
              {s.recommendedChoice === c && <span className="rounded-xs bg-accent-soft px-1.5 font-mono text-[11px] tracking-[0.06em] text-primary uppercase">{t("contract.credit.recommended")}</span>}
            </span>
            <span className="mt-0.5 block text-sm text-ink-muted">{detail(c)}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function SettlementView({ s, q }: { s: Settlement; q: Q }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [choice, setChoice] = useState<CreditChoice | null>(s.recommendedChoice);
  const [refundedOn, setRefundedOn] = useState(todayInput());
  const act = useAsyncAction(async (fn: () => Promise<void>, done: string) => {
    await fn();
    toast.success(t(done));
  });
  const balance = s.totals.balanceCents;
  const keptCredit = s.creditChoice === "CARRY_OVER" || s.creditChoice === "OFFSET_NEXT";

  return (
    <>
      <Header s={s} />
      <Breakdown s={s} />
      <LineNotes s={s} />
      <Totals s={s} />
      {s.note && <p className="mt-4 whitespace-pre-line">{s.note}</p>}
      {s.refundByMember.length > 1 && (
        <p className="mt-3 text-sm text-ink-muted">
          {t("contract.deposit.perPerson")} {s.refundByMember.map((m) => `${m.name}: ${formatCents(m.amountCents)}`).join(", ")}
        </p>
      )}

      <Bills s={s} q={q} canEdit={false} />

      <Section>
        {/* Tenant answers */}
        {s.status === "SENT" && !q.isLandlord && (
          disputing ? (
            <div className="flex flex-col gap-3">
              <Field label={t("contract.costs.disputeLabel")}>{(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />}</Field>
              <div className="flex gap-2">
                <Button disabled={act.pending || !reason.trim()} onClick={() => void act.run(() => q.dispute(reason.trim()), "contract.costs.disputeSent")}>
                  {t("contract.costs.disputeSubmit")}
                </Button>
                <Button variant="ghost" onClick={() => setDisputing(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {balance < 0 && <CreditChoicePicker s={s} value={choice} onChange={setChoice} />}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  size="xl"
                  className="sm:flex-1"
                  disabled={act.pending || (balance < 0 && !choice)}
                  onClick={() => void act.run(() => q.accept(balance < 0 ? choice! : undefined), balance < 0 ? `contract.credit.toast.${choice}` : "contract.costs.acceptedToast")}
                >
                  <Check />
                  {t(balance < 0 ? "contract.credit.accept" : "contract.costs.accept")}
                </Button>
                <Button size="xl" variant="secondary" className="sm:flex-1" onClick={() => setDisputing(true)}>
                  {t("contract.costs.dispute")}
                </Button>
              </div>
            </div>
          )
        )}
        {s.status === "SENT" && q.isLandlord && <p className="text-ink-muted">{t("contract.costs.waitingTenant")}</p>}

        {/* The difference */}
        {s.status !== "SENT" && s.charge && (
          <Button asChild size="lg" variant={q.isLandlord || s.charge.status === "CONFIRMED" ? "secondary" : "default"}>
            <Link to={`/najemi/${tenancy.id}/obveznosti/${s.charge.id}`}>{t(s.charge.status === "CONFIRMED" ? "contract.costs.paidCharge" : q.isLandlord ? "contract.costs.openCharge" : "contract.costs.payCharge")}</Link>
          </Button>
        )}

        {/* Credit kept with the landlord */}
        {s.status === "CLOSED" && keptCredit && (
          <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-4">
            <p>
              {s.creditRemainingCents > 0
                ? t(`contract.credit.state.${s.creditChoice}`, { amount: formatCents(s.creditRemainingCents) })
                : s.refundedOn
                  ? t("contract.credit.refundedText", { date: formatDate(s.refundedOn) })
                  : t(`contract.credit.done.${s.creditChoice}`, { amount: formatCents(-balance) })}
              {s.refundConfirmedAt && ` ${t("contract.deposit.receiptConfirmed")}`}
            </p>
            {q.isLandlord && s.creditRemainingCents > 0 && (
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t("contract.costs.refundedOn")} hint={t("contract.credit.refundHint")} className="min-w-44 flex-1">
                  {(p) => <TextInput {...p} type="date" value={refundedOn} onChange={(e) => setRefundedOn(e.target.value)} />}
                </Field>
                <Button size="lg" variant="secondary" disabled={act.pending || !refundedOn} onClick={() => window.confirm(t("contract.credit.confirmRefund", { amount: formatCents(s.creditRemainingCents) })) && void act.run(() => q.markRefunded(refundedOn), "contract.costs.refundedToast")}>
                  {t("contract.costs.markRefunded", { amount: formatCents(s.creditRemainingCents) })}
                </Button>
              </div>
            )}
            {!q.isLandlord && s.refundedOn && !s.refundConfirmedAt && (
              <Button className="self-start" disabled={act.pending} onClick={() => void act.run(q.confirmRefund, "contract.deposit.receiptToast")}>
                <Check />
                {t("contract.deposit.confirmReceipt")}
              </Button>
            )}
          </div>
        )}

        {/* Overpayment the tenant asked back */}
        {s.status === "ACCEPTED" && balance < 0 &&
          (q.isLandlord ? (
            <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-raised p-4">
              <Field label={t("contract.costs.refundedOn")} className="min-w-44 flex-1">
                {(p) => <TextInput {...p} type="date" value={refundedOn} onChange={(e) => setRefundedOn(e.target.value)} />}
              </Field>
              <Button size="lg" disabled={act.pending || !refundedOn} onClick={() => void act.run(() => q.markRefunded(refundedOn), "contract.costs.refundedToast")}>
                {t("contract.costs.markRefunded", { amount: formatCents(-balance) })}
              </Button>
            </div>
          ) : (
            <p className="text-ink-muted">{t("contract.costs.refundPending", { amount: formatCents(-balance) })}</p>
          ))}
        {s.status === "CLOSED" && !keptCredit && s.refundedOn && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-raised p-4">
            <p className="flex-1 text-ink-muted">
              {t("contract.costs.refundedText", { date: formatDate(s.refundedOn), amount: formatCents(-balance) })}
              {s.refundConfirmedAt && ` ${t("contract.deposit.receiptConfirmed")}`}
            </p>
            {!q.isLandlord && !s.refundConfirmedAt && (
              <Button disabled={act.pending} onClick={() => void act.run(q.confirmRefund, "contract.deposit.receiptToast")}>
                <Check />
                {t("contract.deposit.confirmReceipt")}
              </Button>
            )}
          </div>
        )}
        <FormError message={act.error} />
      </Section>
    </>
  );
}
