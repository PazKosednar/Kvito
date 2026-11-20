import { FileText, Loader2, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { askConfirm } from "@/components/confirm-host";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { Field, MoneyInput, Select, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader } from "@/components/layout-parts";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useCosts } from "@/hooks/useContract";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { apiUrl } from "@/lib/api";
import { centsToInput, formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { COST_TYPES, type CostEntry, type CostType, type CostsView } from "@/types/domain";
import { useTenancyContext } from "@/features/tenancies/TenancyLayout";
import { MonthlyCostsChart } from "./charts";
import { ForecastCard } from "./ForecastCard";
import { CostMonthsTable, LockedLabel, formatSigned, useMonthLabel } from "./contract-ui";

type Q = ReturnType<typeof useCosts>;
type Month = CostsView["months"][number];

/**
 * Actual running costs month by month (stroški po mesecih). The landlord enters each bill as it comes in;
 * the tenant follows the same table and the running balance until the next settlement.
 */
export function CostsPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const { tenancy, isLandlord } = useTenancyContext();
  // A settlement links here with its months (?od=2026-02&do=2026-10).
  const [params] = useSearchParams();
  const [range, setRange] = useState<{ from: string; to: string } | undefined>(() => {
    const from = params.get("od");
    const to = params.get("do");
    return from && to && /^\d{4}-\d{2}$/.test(from) && /^\d{4}-\d{2}$/.test(to) ? { from, to } : undefined;
  });
  const q = useCosts(tenancy.id, range);

  return (
    <>
      <PageHeader back={`/najemi/${tenancy.id}/pogodba`} eyebrow={t("contract.costs.title")} title={t("contract.monthly.title")} subtitle={t(isLandlord ? "contract.monthly.subtitleLandlord" : "contract.monthly.subtitleTenant")} />
      {q.loading && !q.costs ? (
        <LoadingState />
      ) : q.error || !q.costs ? (
        <ErrorState message={toMessage(q.error)} onRetry={() => void q.reload()} />
      ) : (
        <>
          {!range && <RunningBalance costs={q.costs} />}
          {!range && <ForecastCard costs={q.costs} />}
          <RangePicker costs={q.costs} custom={!!range} onChange={setRange} />
          {/* Without a chosen range the forecast card shows the chart (actual months + estimate). */}
          {range && q.costs.months.some((m) => m.costCents > 0 || m.advanceCents > 0) && <MonthlyCostsChart months={q.costs.months} className="mb-6" />}
          {q.costs.costTypes.length > 0 && <CostMonthsTable months={q.costs.months} costTypes={q.costs.costTypes} className="mb-8 hidden md:block" />}
          <div className={cn("flex flex-col gap-3", !isLandlord && q.costs.costTypes.length > 0 && "md:hidden")}>
            {[...q.costs.months].reverse().map((m) => (
              <MonthCard key={m.period} month={m} entries={q.costs!.entries.filter((e) => e.period === m.period)} q={q} />
            ))}
          </div>
          {!isLandlord && q.costs.entries.length === 0 && <p className="rounded-md border border-dashed border-line p-4 text-ink-muted">{t("contract.monthly.emptyTenant")}</p>}
        </>
      )}
    </>
  );
}

function RunningBalance({ costs }: { costs: CostsView }) {
  const { t } = useTranslation();
  const { isLandlord } = useTenancyContext();
  const monthLabel = useMonthLabel();
  const r = costs.running;
  const who = isLandlord ? "landlord" : "tenant";
  const key = r.balanceCents < 0 ? "credit" : r.balanceCents > 0 ? "owes" : "even";
  return (
    <div className="mb-6 rounded-md border border-line bg-surface-raised p-4">
      <p className="label-mono">{r.from === r.to ? monthLabel(r.from) : t("contract.monthly.runningTitle", { from: monthLabel(r.from), to: monthLabel(r.to) })}</p>
      <p className={cn("mt-2 text-lg font-semibold", r.balanceCents < 0 && "text-primary")}>
        {t(`contract.monthly.running.${who}.${key}`, { amount: formatCents(Math.abs(r.balanceCents)) })}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {t("contract.monthly.runningDetail", { costs: formatCents(r.costCents), advances: formatCents(r.advanceCents) })}
        {r.creditCents > 0 && ` ${t("contract.monthly.runningCredit", { amount: formatCents(r.creditCents) })}`}
      </p>
      <p className="mt-2 text-sm text-ink-muted">{t("contract.monthly.informative")}</p>
    </div>
  );
}

function RangePicker({ costs, custom, onChange }: { costs: CostsView; custom: boolean; onChange: (r: { from: string; to: string } | undefined) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(costs.from);
  const [to, setTo] = useState(costs.to);
  if (!open)
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {t("contract.monthly.otherMonths")}
        </Button>
        {custom && (
          <Button variant="ghost" onClick={() => onChange(undefined)}>
            {t("contract.monthly.sinceSettlement")}
          </Button>
        )}
      </div>
    );
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-raised p-4">
      <Field label={t("contract.costs.from")} className="min-w-36 flex-1">{(p) => <TextInput {...p} type="month" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
      <Field label={t("contract.costs.to")} className="min-w-36 flex-1">{(p) => <TextInput {...p} type="month" value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
      <Button
        size="lg"
        disabled={!from || !to || to < from}
        onClick={() => {
          onChange({ from, to });
          setOpen(false);
        }}
      >
        {t("contract.monthly.show")}
      </Button>
    </div>
  );
}

function MonthCard({ month, entries, q }: { month: Month; entries: CostEntry[]; q: Q }) {
  const { t } = useTranslation();
  const { tenancy, isLandlord } = useTenancyContext();
  const monthLabel = useMonthLabel();
  const [adding, setAdding] = useState(false);
  const editable = isLandlord && !month.lockedBy && month.period >= tenancy.startDate.slice(0, 7);
  const free = COST_TYPES.filter((c) => c !== "RENT" && !entries.some((e) => e.costType === c));

  return (
    <section className="rounded-md border border-line bg-surface-raised" aria-label={monthLabel(month.period)}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="font-semibold">{monthLabel(month.period)}</h2>
        {month.lockedBy && <LockedLabel />}
      </header>
      {entries.length > 0 ? (
        <ul className="divide-y divide-line">
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} editable={editable} q={q} />
          ))}
        </ul>
      ) : (
        <p className="px-4 py-3 text-sm text-ink-muted">{t(isLandlord ? "contract.monthly.emptyMonthLandlord" : "contract.monthly.emptyMonth")}</p>
      )}
      {editable &&
        (adding ? (
          <NewEntryForm period={month.period} free={free} q={q} onDone={() => setAdding(false)} />
        ) : (
          free.length > 0 && (
            <div className="border-t border-line px-2 py-1">
              <Button variant="ghost" onClick={() => setAdding(true)}>
                <Plus />
                {t("contract.monthly.addCost")}
              </Button>
            </div>
          )
        ))}
      <dl className="grid grid-cols-3 divide-x divide-line border-t border-line text-sm">
        <div className="px-4 py-2.5">
          <dt className="label-mono">{t("contract.monthly.costsTotal")}</dt>
          <dd className="mono mt-0.5 font-semibold">{formatCents(month.costCents)}</dd>
        </div>
        <div className="px-4 py-2.5">
          <dt className="label-mono">{t("contract.costs.advances")}</dt>
          <dd className="mono mt-0.5">{formatCents(month.advanceCents)}</dd>
        </div>
        <div className="px-4 py-2.5">
          <dt className="label-mono">{t("contract.costs.difference")}</dt>
          <dd className={cn("mono mt-0.5", month.balanceCents < 0 && "text-primary")}>{formatSigned(month.balanceCents)}</dd>
        </div>
      </dl>
    </section>
  );
}

function EntryRow({ entry, editable, q }: { entry: CostEntry; editable: boolean; q: Q }) {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const attach = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await q.attachFile(entry.id, file);
    } catch (err) {
      toast.error(toMessage(err));
    } finally {
      setUploading(false);
    }
  };

  if (editing) return <EntryForm entry={entry} q={q} onDone={() => setEditing(false)} />;
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{t(`costs.${entry.costType}`)}</span>
          {entry.note && <span className="block text-sm text-ink-muted">{entry.note}</span>}
        </span>
        <span className="mono">{formatCents(entry.amountCents)}</span>
        {editable && (
          <Button variant="ghost" size="icon" aria-label={t("contract.monthly.editCost", { cost: t(`costs.${entry.costType}`) })} onClick={() => setEditing(true)}>
            <Pencil />
          </Button>
        )}
      </div>
      {(entry.attachments.length > 0 || editable) && (
        <ul className="mt-2 flex flex-wrap items-center gap-2">
          {entry.attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-1">
              <a href={apiUrl(a.url)} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-line px-2.5 text-sm text-primary hover:border-primary/50">
                <FileText className="size-4" aria-hidden="true" />
                <span className="max-w-40 truncate">{a.fileName}</span>
              </a>
              {editable && (
                <Button variant="ghost" size="icon" aria-label={t("common.remove")} onClick={() => void q.detachFile(entry.id, a.id).catch((err: unknown) => toast.error(toMessage(err)))}>
                  <X />
                </Button>
              )}
            </li>
          ))}
          {editable && (
            <li>
              <label className={cn("inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-sm border border-dashed border-line px-2.5 text-sm hover:border-primary/50", uploading && "pointer-events-none opacity-60")}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" aria-hidden="true" />}
                {t("contract.costs.addBill")}
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => void attach(e.target.files?.[0])} />
              </label>
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function EntryForm({ entry, q, onDone }: { entry: CostEntry; q: Q; onDone: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(centsToInput(entry.amountCents));
  const [note, setNote] = useState(entry.note ?? "");
  const [error, setError] = useState<string | undefined>();
  const save = useAsyncAction(async (remove: boolean) => {
    if (remove) {
      if (!(await askConfirm(t("contract.monthly.confirmDelete")))) return;
      await q.setEntry(entry.period, entry.costType, null);
    } else {
      const cents = parseAmountToCents(amount);
      if (cents === null) return setError("amount");
      await q.setEntry(entry.period, entry.costType, cents, note.trim() || null);
    }
    onDone();
  });
  return (
    <li className="flex flex-col gap-3 bg-surface px-4 py-3">
      <p className="font-medium">{t(`costs.${entry.costType}`)}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("contract.costs.amount")} error={error}>{(p) => <MoneyInput {...p} value={amount} onChange={(e) => (setAmount(e.target.value), setError(undefined))} autoFocus />}</Field>
        <Field label={t("contract.monthly.note")}>{(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />}</Field>
      </div>
      <FormError message={save.error} />
      <div className="flex flex-wrap gap-2">
        <Button disabled={save.pending} onClick={() => void save.run(false)}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("common.save")}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button variant="ghost" className="ml-auto text-danger hover:text-destructive" disabled={save.pending} onClick={() => void save.run(true)}>
          <Trash2 />
          {t("common.remove")}
        </Button>
      </div>
    </li>
  );
}

function NewEntryForm({ period, free, q, onDone }: { period: string; free: CostType[]; q: Q; onDone: () => void }) {
  const { t } = useTranslation();
  const { tenancy } = useTenancyContext();
  // Start with a cost the tenant covers, if any is still missing this month.
  const [costType, setCostType] = useState<CostType>(free.find((c) => tenancy.coveredCosts.includes(c)) ?? free[0]!);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | undefined>();
  const save = useAsyncAction(async () => {
    const cents = parseAmountToCents(amount);
    if (cents === null) return setError("amount");
    await q.setEntry(period, costType, cents, note.trim() || null);
    toast.success(t("contract.monthly.saved"));
    onDone();
  });
  return (
    <form
      className="flex flex-col gap-3 border-t border-line bg-surface px-4 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save.run();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("contract.costs.costType")}>
          {(p) => (
            <Select {...p} value={costType} onChange={(e) => setCostType(e.target.value as CostType)}>
              {free.map((c) => (
                <option key={c} value={c}>
                  {t(`costs.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("contract.costs.amount")} error={error}>{(p) => <MoneyInput {...p} value={amount} onChange={(e) => (setAmount(e.target.value), setError(undefined))} autoFocus />}</Field>
      </div>
      <Field label={t("contract.monthly.note")}>{(p) => <TextInput {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t("contract.monthly.notePlaceholder")} />}</Field>
      <FormError message={save.error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.pending}>
          {save.pending && <Loader2 className="animate-spin" />}
          {t("common.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
