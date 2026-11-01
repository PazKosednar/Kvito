import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Field, MoneyInput, Textarea, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader, Section } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useDeposit } from "@/hooks/useContract";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { centsToInput, formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { DepositState } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";

interface Row {
  reason: string;
  amount: string;
  handoverItemId: string | null;
}

/** Landlord proposes how much of the deposit goes back; damaged items from the move-out record are suggested. */
export function DepositReturnPage() {
  const { tenancy } = useTenancyContext();
  const toMessage = useErrorMessage();
  const q = useDeposit(tenancy.id);
  if (q.loading) return <LoadingState />;
  if (q.error || !q.state?.deposit) return <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />;
  return <ProposalForm state={q.state} q={q} />;
}

function ProposalForm({ state, q }: { state: DepositState; q: ReturnType<typeof useDeposit> }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tenancy } = useTenancyContext();
  const deposit = state.deposit!;
  const [rows, setRows] = useState<Row[]>(() => deposit.deductions.map((d) => ({ reason: d.reason, amount: centsToInput(d.amountCents), handoverItemId: d.handoverItem?.id ?? null })));
  const [note, setNote] = useState(deposit.proposalNote ?? "");
  const [rowError, setRowError] = useState<string | null>(null);
  const back = `/najemi/${tenancy.id}/pogodba`;

  const parsed = rows.map((r) => parseAmountToCents(r.amount));
  const kept = parsed.reduce<number>((s, c) => s + (c ?? 0), 0);
  const over = kept > deposit.amountCents;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const unusedItems = state.damagedItems.filter((it) => !rows.some((r) => r.handoverItemId === it.id));

  const save = useAsyncAction(async () => {
    if (rows.some((r, i) => !r.reason.trim() || !parsed[i])) return setRowError(t("contract.deposit.rowsIncomplete"));
    setRowError(null);
    await q.propose(
      rows.map((r, i) => ({ reason: r.reason.trim(), amountCents: parsed[i]!, handoverItemId: r.handoverItemId })),
      note.trim() || null,
    );
    toast.success(t("contract.deposit.proposalSent"));
    void navigate(back);
  });

  return (
    <>
      <PageHeader back={back} title={t("contract.deposit.proposalTitle")} subtitle={t("contract.deposit.proposalSubtitle", { amount: formatCents(deposit.amountCents) })} />

      {unusedItems.length > 0 && (
        <Section title={t("contract.deposit.fromMoveOut")}>
          <div className="flex flex-wrap gap-2">
            {unusedItems.map((it) => (
              <Button key={it.id} variant="secondary" onClick={() => setRows([...rows, { reason: `${it.room}: ${it.name}${it.note ? ` (${it.note})` : ""}`.slice(0, 200), amount: "", handoverItemId: it.id }])}>
                <Plus />
                {it.room}: {it.name}
                <span className="font-mono text-[11px] text-ink-muted uppercase">{t(`condition.${it.condition}`)}</span>
              </Button>
            ))}
          </div>
        </Section>
      )}

      <Section title={t("contract.deposit.deductions")}>
        {rows.length === 0 && <p className="mb-3 rounded-md border border-dashed border-line p-4 text-ink-muted">{t("contract.deposit.noDeductions")}</p>}
        <div className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto] gap-2 rounded-md border border-line bg-surface-raised p-3 sm:grid-cols-[1fr_9rem_auto]">
              <TextInput aria-label={t("contract.deposit.reason")} placeholder={t("contract.deposit.reasonPlaceholder")} value={r.reason} maxLength={200} onChange={(e) => set(i, { reason: e.target.value })} className="col-span-2 sm:col-span-1" />
              <MoneyInput aria-label={t("contract.costs.amount")} value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-invalid={r.amount !== "" && parsed[i] === null} />
              <Button variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <X />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="mt-2" onClick={() => setRows([...rows, { reason: "", amount: "", handoverItemId: null }])}>
          <Plus />
          {t("contract.deposit.addDeduction")}
        </Button>
      </Section>

      <Section>
        <Field label={t("contract.deposit.noteLabel")} hint={t("contract.deposit.noteHint")}>
          {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}
        </Field>
      </Section>

      <div className={cn("mt-8 grid grid-cols-2 divide-x divide-line rounded-md border bg-surface-raised", over ? "border-destructive" : "border-line")}>
        <div className="p-4">
          <p className="label-mono">{t("contract.deposit.kept")}</p>
          <p className="amount mt-1">{formatCents(kept)}</p>
        </div>
        <div className="p-4">
          <p className="label-mono">{t("contract.deposit.returned")}</p>
          <p className={cn("amount mt-1", over ? "text-danger" : "text-primary")}>{formatCents(Math.max(0, deposit.amountCents - kept))}</p>
        </div>
      </div>
      {over && <p className="mt-2 text-sm text-danger">{t("errors.DEDUCTIONS_EXCEED_DEPOSIT")}</p>}
      <p className="mt-3 text-sm text-ink-muted">{t("contract.deposit.proposalFooter")}</p>

      <div className="mt-6 flex flex-col gap-4">
        <FormError message={rowError ?? save.error} />
        <Button size="xl" disabled={save.pending || over} onClick={() => void save.run()}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("contract.deposit.sendProposal")}
        </Button>
      </div>
    </>
  );
}
