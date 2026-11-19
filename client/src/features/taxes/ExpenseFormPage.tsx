import { Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { AttachmentList, FilePickerButton, PendingFiles } from "@/components/attachments";
import { Field, MoneyInput, Select, Textarea, TextInput } from "@/components/form";
import { ErrorState, FormError, LoadingState, PageHeader } from "@/components/layout-parts";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { useErrorMessage } from "@/hooks/useErrorMessage";
import { useProperties } from "@/hooks/useProperties";
import { useExpense, useExpenseActions } from "@/hooks/useTaxes";
import { centsToInput, parseAmountToCents } from "@/lib/money";
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/types/domain";

const MAX_FILES = 5;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });

/** New or existing own cost of the landlord (for the tax overview), with receipts. */
export function ExpenseFormPage() {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const navigate = useNavigate();
  const { id } = useParams();
  const editing = Boolean(id);
  const { properties, loading: loadingProps } = useProperties();
  const existing = useExpense(id);
  const { save, remove } = useExpenseActions();

  const [propertyId, setPropertyId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("MAINTENANCE");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(today);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fill the form once: from the stored cost, or with the first property for a new one.
  const e = existing.expense;
  useEffect(() => {
    if (e) {
      setPropertyId(e.property.id);
      setUnitId(e.unit?.id ?? "");
      setCategory(e.category);
      setTitle(e.title);
      setAmount(centsToInput(e.amountCents));
      setSpentOn(e.spentOn);
      setNote(e.note ?? "");
    }
  }, [e]);
  useEffect(() => {
    if (!editing && !propertyId && properties?.[0]) setPropertyId(properties[0].id);
  }, [editing, propertyId, properties]);

  const units = properties?.find((p) => p.id === propertyId)?.units ?? [];
  const amountCents = parseAmountToCents(amount);
  const linked = e?.attachments.length ?? 0;

  const submit = useAsyncAction(async () => {
    if (!amountCents) return;
    await save(
      { propertyId, unitId: unitId || null, category, title: title.trim(), amountCents, spentOn, note: note.trim() || null },
      files,
      id,
    );
    toast.success(t("expense.saved"));
    void navigate(ROUTES.taxes);
  });

  const destroy = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await remove(id);
      toast.success(t("expense.deleted"));
      void navigate(ROUTES.taxes, { replace: true });
    } catch (err) {
      toast.error(toMessage(err));
      setDeleting(false);
    }
  };

  if (loadingProps || (editing && existing.loading)) return <LoadingState />;
  if (editing && (existing.error || !e)) return <ErrorState message={toMessage(existing.error)} onRetry={() => void existing.reload()} />;

  return (
    <>
      <PageHeader back={ROUTES.taxes} eyebrow={t("taxes.eyebrow")} title={t(editing ? "expense.editTitle" : "expense.newTitle")} />
      <form
        className="flex flex-col gap-5"
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit.run();
        }}
      >
        <Field label={t("expense.property")} error={submit.fieldErrors["propertyId"]}>
          {(p) => (
            <Select
              {...p}
              value={propertyId}
              onChange={(ev) => {
                setPropertyId(ev.target.value);
                setUnitId("");
              }}
            >
              {properties?.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {units.length > 1 && (
          <Field label={t("expense.unit")}>
            {(p) => (
              <Select {...p} value={unitId} onChange={(ev) => setUnitId(ev.target.value)}>
                <option value="">{t("expense.wholeProperty")}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <Field label={t("expense.category")}>
          {(p) => (
            <Select {...p} value={category} onChange={(ev) => setCategory(ev.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`expense.categories.${c}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("expense.titleLabel")} error={submit.fieldErrors["title"]}>
          {(p) => <TextInput {...p} value={title} maxLength={120} required placeholder={t("expense.titlePlaceholder")} onChange={(ev) => setTitle(ev.target.value)} />}
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t("expense.amount")} error={submit.fieldErrors["amountCents"]}>
            {(p) => <MoneyInput {...p} value={amount} required placeholder="0,00" onChange={(ev) => setAmount(ev.target.value)} />}
          </Field>
          <Field label={t("expense.spentOn")} error={submit.fieldErrors["spentOn"]}>
            {(p) => <TextInput {...p} type="date" value={spentOn} required onChange={(ev) => setSpentOn(ev.target.value)} />}
          </Field>
        </div>
        <Field label={t("expense.note")}>{(p) => <Textarea {...p} value={note} maxLength={500} onChange={(ev) => setNote(ev.target.value)} />}</Field>

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">{t("expense.receipts")}</p>
          {e && <AttachmentList files={e.attachments} />}
          <PendingFiles files={files} onRemove={(i) => setFiles((f) => f.filter((_, j) => j !== i))} />
          {linked + files.length < MAX_FILES && (
            <FilePickerButton label={t("expense.addReceipt")} onPick={(picked) => setFiles((f) => [...f, ...picked].slice(0, MAX_FILES - linked))} className="self-start" />
          )}
        </div>

        <FormError message={submit.error} />
        <Button type="submit" size="xl" disabled={submit.pending || !propertyId || !title.trim() || !amountCents}>
          {submit.pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {t("expense.save")}
        </Button>
        {editing && (
          <Button type="button" variant="danger-soft" onClick={() => setConfirmOpen(true)}>
            <Trash2 />
            {t("expense.delete")}
          </Button>
        )}
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-sm bg-danger-soft text-danger">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
            <div>
              <AlertDialogTitle>{t("expense.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("expense.deleteBody", { title: e?.title ?? "" })}</AlertDialogDescription>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={deleting}>
                {t("common.cancel")}
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                disabled={deleting}
                onClick={(ev) => {
                  ev.preventDefault();
                  void destroy();
                }}
              >
                {deleting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {t("expense.delete")}
              </Button>
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
