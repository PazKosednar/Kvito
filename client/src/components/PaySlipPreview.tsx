import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { KvitaStamp } from "./KvitaStamp";

/**
 * Decorative example of a settled rent slip (UPN-style fields + the Kvita stamp).
 * Shows what the product does before the user has signed in. Purely illustrative, hidden from screen readers.
 */
export function PaySlipPreview({ className }: { className?: string }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    [t("slip.payee"), "Mojca Novak"],
    [t("slip.purpose"), t("slip.purposeValue")],
    [t("slip.due"), "5. 11. 2026"],
  ];

  return (
    <div aria-hidden="true" className={cn("relative select-none", className)}>
      <div className="slip-perforation h-2 bg-slip" />
      <div className="bg-slip px-5 pt-4 pb-6 text-slip-foreground shadow-[0_24px_48px_-28px_var(--slip-line)]">
        <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-slip-line pb-3">
          <span className="text-sm font-semibold">{t("slip.title")}</span>
          <span className="text-2xl font-bold tracking-tight">650,00 €</span>
        </div>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="py-0.5 opacity-80">{label}</dt>
              <dd className="rounded-sm bg-slip-field px-2 py-0.5 font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <KvitaStamp animate className="absolute right-1 bottom-8 w-32 mix-blend-multiply lg:-bottom-3 lg:w-36" />
    </div>
  );
}
