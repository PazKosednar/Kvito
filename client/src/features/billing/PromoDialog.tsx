import { Check, Copy, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { KvitaLockup, KvitaMark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { usePromo } from "@/hooks/usePromo";
import type { PromoPrice } from "@/lib/promo";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Promo popup for landlords: "Najem brez skrbi. Zdaj 30 % ceneje." with the code NEW30.
 * Built only from theme tokens, so it is dark in Grafit and light in Kamen. A floating layer (shadow allowed)
 * with rounded corners (a deliberate exception to the CGP radii for this promo). Motion: opacity only.
 */
export function PromoDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const promo = usePromo();
  if (!promo.open) return null;

  const plus = promo.prices.find((p) => p.plan === "PLUS");
  const choose = () => {
    promo.dismiss();
    void navigate(ROUTES.billing);
  };

  return (
    <DialogPrimitive.Root open onOpenChange={(open) => !open && promo.dismiss()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[32rem] -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-overlay)]">
            <div className="relative max-h-[calc(100dvh-2rem)] overflow-y-auto px-5 pt-4 pb-5 text-ink [scrollbar-width:thin] sm:px-7 sm:pt-5 sm:pb-6">
              <div className="flex items-center">
                <KvitaLockup className="h-5 sm:h-6" />
                <DialogPrimitive.Close
                  aria-label={t("common.close")}
                  className="-mr-2 ml-auto flex size-10 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink"
                >
                  <X className="size-5" aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>

              <div className="mt-5 flex items-center gap-4 sm:mt-6">
                <div className="min-w-0 flex-1">
                  <DialogPrimitive.Title className="text-[1.75rem] leading-[1.05] font-semibold tracking-[-0.035em] sm:text-[2.25rem]">
                    <span className="block">{t("promo.title")}</span>
                    <span className="block text-primary">{t("promo.titleAccent", { percent: promo.percent })}</span>
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description className="mt-3 text-sm leading-6 text-ink-muted sm:text-base">{t("promo.lead")}</DialogPrimitive.Description>
                </div>
                <KvitaMark className="hidden size-24 sm:block" />
              </div>

              <Code code={promo.code} />

              <ul className="mt-4 grid grid-cols-3 gap-2">
                {promo.prices.map((p) => (
                  <PriceCard key={p.plan} price={p} />
                ))}
              </ul>

              <div className="mt-5">
                <p className="text-sm">{t("promo.free")}</p>
                {plus && (
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    {t("promo.yearly", { percent: promo.percent, discounted: formatCents(plus.discountedYearlyCents), full: formatCents(plus.yearlyCents) })}
                  </p>
                )}
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="lg" className="rounded-lg text-ink-muted sm:h-10">
                    {t("promo.later")}
                  </Button>
                </DialogPrimitive.Close>
                <Button size="lg" className="rounded-lg sm:h-10" onClick={choose}>
                  {t("promo.choose")}
                </Button>
              </div>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** "Ob plačilu vpiši kodo" with the code in a green outlined box; tapping the box copies it. */
function Code({ code }: { code: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="mt-5 flex items-center gap-3 rounded-xl bg-accent-soft py-3 pr-3 pl-4 sm:mt-6 sm:py-3.5 sm:pl-5">
      <p className="min-w-0 flex-1 text-sm sm:text-base">{t("promo.enterCode")}</p>
      <button
        type="button"
        onClick={() => void copy(code)}
        aria-label={`${code} – ${copied ? t("promo.copied") : t("promo.copy")}`}
        className="group inline-flex h-12 items-center gap-2.5 rounded-lg border border-primary bg-surface-raised px-4 transition-colors duration-150 hover:bg-surface"
      >
        <span className="text-xl font-semibold tracking-[0.12em] text-primary sm:text-2xl">{code}</span>
        {copied ? (
          <Check className="size-4 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="size-4 text-ink-muted transition-colors duration-150 group-hover:text-ink" aria-hidden="true" />
        )}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? t("promo.copied") : ""}
      </span>
    </div>
  );
}

function PriceCard({ price }: { price: PromoPrice }) {
  const { t } = useTranslation();
  return (
    <li className="flex min-w-0 flex-col rounded-xl border border-line bg-surface-raised px-2.5 py-3 sm:p-3.5">
      <p className="text-sm font-semibold break-words sm:text-base">{t(`billing.plans.${price.plan}`)}</p>
      <p className="text-xs text-ink-muted sm:text-sm">{t("promo.units", { count: price.units })}</p>
      <p className="mt-3 text-xs text-ink-muted tabular-nums line-through decoration-1 sm:text-sm">
        <span className="sr-only">{t("promo.was")} </span>
        {formatCents(price.monthlyCents)}
      </p>
      <p className="text-lg leading-tight font-semibold tracking-[-0.03em] text-primary tabular-nums sm:text-[1.625rem]">
        <span className="sr-only">{t("promo.now")} </span>
        {formatCents(price.discountedMonthlyCents)}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted sm:text-sm">{t("promo.firstMonth")}</p>
    </li>
  );
}

/** The code inline on the Naročnina page (eligible landlords), so it is not lost after the popup is closed. */
export function PromoStrip({ code, percent }: { code: string; percent: number }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className={cn("relative mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm bg-accent-soft px-4 py-3")}>
      <p className="min-w-0 flex-1 text-sm">{t("promo.strip", { code, percent })}</p>
      <Button variant="outline" size="sm" className="border-primary" onClick={() => void copy(code)}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span className="font-semibold tracking-[0.1em] text-primary">{code}</span>
      </Button>
    </div>
  );
}
