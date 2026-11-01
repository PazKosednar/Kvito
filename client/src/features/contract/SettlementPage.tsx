import { Check, FileText, Loader2, Paperclip, Send, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Field, MoneyInput, Select, Textarea, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useSettlement } from "@/hooks/useContract";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { apiUrl } from "@/lib/api";
import { formatDate, todayInput } from "@/lib/dates";
import { centsToInput, formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { COST_TYPES, type CostType, type Settlement } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { BalanceText } from "./ContractTab";
import { SettlementStatusLabel } from "./contract-ui";

type Q = ReturnType<typeof useSettlement>;

export function SettlementPage() {
  const { settlementId } = useParams();
  const toMessage = useErrorMessage();
  const q = useSettlement(settlementId);
  if (q.loading) return <LoadingState />;
  if (q.error || !q.settlement) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  const editable = q.isLandlord && (q.settlement.status === "DRAFT" || q.settlement.status === "DISPUTED");
  // key: a fresh editor after every save, so inputs show what the server computed.
  return editable ? <SettlementEditor key={q.settlement.lines.map((l) => `${l.costType}${l.advanceCents}${l.actualCents}`).join("|") + q.settlement.periodFrom + q.settlement.periodTo} s={q.settlement} q={q} /> : <SettlementView s={q.settlement} q={q} />;
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

function Totals({ s }: { s: Settlement }) {
  const { t } = useTranslation();
  return (
    <dl className="mt-4 grid grid-cols-3 divide-x divide-line rounded-md border border-line bg-surface-raised">
      <div className="p-4">
        <dt className="label-mono">{t("contract.costs.advances")}</dt>
        <dd className="mono mt-1">{formatCents(s.totals.advanceCents)}</dd>
      </div>
      <div className="p-4">
        <dt className="label-mono">{t("contract.costs.actual")}</dt>
        <dd className="mono mt-1">{formatCents(s.totals.actualCents)}</dd>
      </div>
      <div className="p-4">
        <dt className="label-mono">{t("contract.costs.difference")}</dt>
        <dd className="mt-1 font-semibold">
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
  const [from, setFrom] = useState(s.periodFrom.slice(0, 10));
  const [to, setTo] = useState(s.periodTo.slice(0, 10));
  const [lines, setLines] = useState(() => s.lines.map((l) => ({ costType: l.costType, advanceCents: l.advanceCents, actual: l.actualCents ? centsToInput(l.actualCents) : "", note: l.note ?? "" })));
  const [note, setNote] = useState(s.note ?? "");
  const [dueDate, setDueDate] = useState(s.dueDate?.slice(0, 10) ?? "");
  const [error, setError] = useState<string | null>(null);
  const free = COST_TYPES.filter((c) => c !== "RENT" && !lines.some((l) => l.costType === c));

  const parsed = lines.map((l) => (l.actual.trim() ? parseAmountToCents(l.actual) : 0));
  const balance = parsed.reduce<number>((sum, c, i) => sum + (c ?? 0) - lines[i]!.advanceCents, 0);
  const set = (i: number, patch: Partial<(typeof lines)[number]>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const patch = () => {
    if (parsed.some((c) => c === null)) {
      setError(t("validation.amount"));
      return null;
    }
    setError(null);
    return { periodFrom: from, periodTo: to, note: note.trim() || null, dueDate: dueDate || null, lines: lines.map((l, i) => ({ costType: l.costType, actualCents: parsed[i]!, note: l.note.trim() || null })) };
  };

  const save = useAsyncAction(async (andSend: boolean) => {
    const body = patch();
    if (!body) return;
    await q.update(body);
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

  return (
    <>
      <Header s={s} />
      {s.status === "DISPUTED" && s.disputeReason && <p className="mb-6 rounded-sm bg-danger-soft px-4 py-3 text-sm text-danger">{t("contract.costs.disputedNote", { reason: s.disputeReason })}</p>}

      <Section title={t("contract.costs.period")}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("contract.costs.from")}>{(p) => <TextInput {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label={t("contract.costs.to")}>{(p) => <TextInput {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <p className="mt-2 text-sm text-ink-muted">{t("contract.costs.advancesFromPeriod")}</p>
      </Section>

      <Section title={t("contract.costs.lines")}>
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => {
            const diff = (parsed[i] ?? 0) - l.advanceCents;
            return (
              <div key={l.costType} className="rounded-md border border-line bg-surface-raised p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{t(`costs.${l.costType}`)}</p>
                  <Button variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                    <X />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <p className="label-mono">{t("contract.costs.advances")}</p>
                    <p className="mono mt-2">{formatCents(l.advanceCents)}</p>
                  </div>
                  <Field label={t("contract.costs.actual")}>{(p) => <MoneyInput {...p} value={l.actual} onChange={(e) => set(i, { actual: e.target.value })} />}</Field>
                </div>
                <p className="mt-2 text-sm text-ink-muted">
                  {t("contract.costs.difference")}: <BalanceText cents={diff} />
                </p>
              </div>
            );
          })}
        </div>
        {free.length > 0 && (
          <div className="mt-3">
            <Select aria-label={t("contract.costs.addLine")} value="" onChange={(e) => e.target.value && setLines([...lines, { costType: e.target.value as CostType, advanceCents: 0, actual: "", note: "" }])} className="max-w-72">
              <option value="">{t("contract.costs.addLine")}</option>
              {free.map((c) => (
                <option key={c} value={c}>
                  {t(`costs.${c}`)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Section>

      <Section>
        <div className="flex items-baseline justify-between gap-4 rounded-md border border-line bg-surface-raised px-4 py-3">
          <span className="font-semibold">{t("contract.costs.result")}</span>
          <span className="font-semibold">
            <BalanceText cents={balance} />
          </span>
        </div>
        {balance > 0 && (
          <Field label={t("contract.costs.dueDate")} hint={t("contract.costs.dueDateHint")} className="mt-4">
            {(p) => <TextInput {...p} type="date" min={todayInput()} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
          </Field>
        )}
        <Field label={t("contract.costs.note")} className="mt-4">
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder={t("contract.costs.notePlaceholder")} />}
        </Field>
      </Section>

      <Bills s={s} q={q} canEdit />

      <div className="mt-8 flex flex-col gap-3">
        <FormError message={error ?? save.error} />
        <Button size="xl" disabled={save.pending || lines.length === 0 || (balance > 0 && !dueDate)} onClick={() => void save.run(true)}>
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

function SettlementView({ s, q }: { s: Settlement; q: Q }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [refundedOn, setRefundedOn] = useState(todayInput());
  const act = useAsyncAction(async (fn: () => Promise<void>, done: string) => {
    await fn();
    toast.success(t(done));
  });
  const balance = s.totals.balanceCents;

  return (
    <>
      <Header s={s} />
      <ul className="divide-y divide-line rounded-md border border-line bg-surface-raised">
        {s.lines.map((l) => (
          <li key={l.id} className="grid grid-cols-[1fr_auto] gap-x-4 px-4 py-3">
            <span className="font-medium">{t(`costs.${l.costType}`)}</span>
            <span className="mono text-right">{formatCents(l.actualCents)}</span>
            <span className="text-sm text-ink-muted">{t("contract.costs.advancesWere", { amount: formatCents(l.advanceCents) })}</span>
            <span className="text-right text-sm">
              <BalanceText cents={l.actualCents - l.advanceCents} />
            </span>
          </li>
        ))}
      </ul>
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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="xl" className="sm:flex-1" disabled={act.pending} onClick={() => void act.run(q.accept, "contract.costs.acceptedToast")}>
                <Check />
                {t("contract.costs.accept")}
              </Button>
              <Button size="xl" variant="secondary" className="sm:flex-1" onClick={() => setDisputing(true)}>
                {t("contract.costs.dispute")}
              </Button>
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
        {s.status === "CLOSED" && s.refundedOn && (
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
