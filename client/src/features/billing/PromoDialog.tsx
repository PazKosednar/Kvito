import { Check, Copy, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Eyebrow, KvitaLockup } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/constants";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { usePromo } from "@/hooks/usePromo";
import type { PromoPrice } from "@/lib/promo";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * One-time promo popup for landlords: "−30 % na vse naročnine" with the code NEW30.
 * A floating layer (shadow allowed) on the panel grid, cut as a ticket: chamfered corners with a green edge
 * on two of them and notches where the code is torn off. Motion: opacity only.
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
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="kv-promo-shadow fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-[30rem] -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200"
        >
          {/* Frame: a 1px chamfered edge (green on two corners) around the chamfered panel. */}
          <div className="kv-chamfer kv-promo-edge p-px">
            <div className="kv-chamfer kv-grid-panel kv-promo-body relative max-h-[calc(100dvh-2rem)] overflow-y-auto px-5 pt-4 pb-5 sm:px-7 sm:pt-5 sm:pb-6">
              <CornerTicks />

              <div className="flex items-center gap-3">
                <KvitaLockup className="h-5 sm:h-6" />
                <span className="ml-auto rounded-xs bg-accent-soft px-2 py-1 font-mono text-[11px] leading-4 font-medium tracking-[0.12em] text-signal uppercase">
                  {t("promo.badge")}
                </span>
                <DialogPrimitive.Close
                  aria-label={t("common.close")}
                  className="-mr-2 flex size-10 items-center justify-center rounded-sm text-ink-on-panel-muted transition-colors duration-150 hover:bg-ink-on-panel/10 hover:text-ink-on-panel"
                >
                  <X className="size-5" aria-hidden="true" />
                </DialogPrimitive.Close>
              </div>

              <Eyebrow index="01" onPanel className="mt-4 sm:mt-5">
                {t("promo.eyebrow")}
              </Eyebrow>

              <DialogPrimitive.Title className="mt-2">
                <span className="block text-[4.25rem] leading-[0.9] font-semibold tracking-[-0.05em] text-signal tabular-nums sm:text-[5.75rem]">
                  −{promo.percent}&thinsp;%
                </span>
                <span className="mt-1.5 block text-[1.5rem] leading-tight font-semibold tracking-[-0.03em] text-ink-on-panel sm:text-[1.875rem]">
                  {t("promo.headline")}
                </span>
              </DialogPrimitive.Title>

              <Coupon code={promo.code} />

              <ul className="mt-4 grid grid-cols-3 gap-2">
                {promo.prices.map((p) => (
                  <PriceCard key={p.plan} price={p} />
                ))}
              </ul>

              <div className="mt-5 border-t border-[var(--panel-line)] pt-4">
                <p className="text-sm text-ink-on-panel">{t("promo.free")}</p>
                {plus && (
                  <p className="mt-1 text-xs leading-5 text-ink-on-panel-muted">
                    {t("promo.once", { discounted: formatCents(plus.discountedYearlyCents), full: formatCents(plus.yearlyCents) })}
                  </p>
                )}
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <DialogPrimitive.Close asChild>
                  <Button variant="ghost" size="lg" className="sm:h-10 text-ink-on-panel-muted hover:bg-ink-on-panel/10 hover:text-ink-on-panel">
                    {t("promo.later")}
                  </Button>
                </DialogPrimitive.Close>
                <Button size="lg" className="sm:h-10" onClick={choose}>
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

/** The code as a tear-off ticket: dashed green outline, notches on both sides, copy on tap. */
function Coupon({ code }: { code: string }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="relative mt-5 rounded-sm border border-dashed border-signal/80 bg-[var(--panel-raised)]/70 px-4 py-3 sm:px-5 sm:py-4">
      <span aria-hidden="true" className="kv-notch -left-[9px]" />
      <span aria-hidden="true" className="kv-notch -right-[9px]" />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="font-mono text-[11px] leading-4 font-medium tracking-[0.12em] text-ink-on-panel-muted uppercase">{t("promo.codeLabel")}</p>
          <p className="mt-1 font-mono text-[2rem] leading-none font-medium tracking-[0.12em] text-ink-on-panel select-all sm:text-[2.5rem]">{code}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-2 text-right">
          <p className="hidden text-sm leading-5 text-ink-on-panel-muted sm:block">
            {t("promo.appliesTo")}
            <br />
            {t("promo.appliesInterval")}
          </p>
          <button
            type="button"
            onClick={() => void copy(code)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-sm border px-3 text-sm font-medium transition-colors duration-150",
              copied ? "border-signal text-signal" : "border-[var(--panel-edge)] text-ink-on-panel hover:border-ink-on-panel",
            )}
          >
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            <span aria-live="polite">{copied ? t("promo.copied") : t("promo.copy")}</span>
          </button>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-on-panel-muted sm:hidden">
        {t("promo.appliesTo")} {t("promo.appliesInterval")}
      </p>
    </div>
  );
}

function PriceCard({ price }: { price: PromoPrice }) {
  const { t } = useTranslation();
  return (
    <li className="flex min-w-0 flex-col rounded-sm border border-[var(--panel-line)] bg-[var(--panel-raised)] px-2.5 py-3 sm:p-3.5">
      <p className="text-sm font-semibold break-words text-ink-on-panel sm:text-base">{t(`billing.plans.${price.plan}`)}</p>
      <p className="truncate text-xs text-ink-on-panel-muted sm:text-sm">{t("billing.unitsCount", { count: price.units })}</p>
      <p className="mt-3 font-mono text-xs text-ink-on-panel-muted tabular-nums line-through decoration-1 sm:mt-3 sm:text-xs">
        <span className="sr-only">{t("promo.was")} </span>
        {formatCents(price.monthlyCents)}
      </p>
      <p className="font-mono text-lg leading-tight font-medium tracking-[-0.02em] text-signal tabular-nums sm:text-[1.375rem]">
        <span className="sr-only">{t("promo.now")} </span>
        {formatCents(price.discountedMonthlyCents)}
      </p>
      <p className="mt-1 text-xs text-ink-on-panel-muted sm:text-sm">{t("promo.firstMonth")}</p>
    </li>
  );
}

/** Thin construction marks in the four inner corners (CGP: thin lines and grids). */
function CornerTicks() {
  const tick = "pointer-events-none absolute size-3 border-[var(--panel-edge)]";
  return (
    <>
      <span aria-hidden="true" className={cn(tick, "top-2.5 left-5 border-t border-l")} />
      <span aria-hidden="true" className={cn(tick, "top-2.5 right-5 border-t border-r")} />
      <span aria-hidden="true" className={cn(tick, "bottom-2.5 left-5 border-b border-l")} />
      <span aria-hidden="true" className={cn(tick, "right-5 bottom-2.5 border-r border-b")} />
    </>
  );
}

/** The code inline on the Naročnina page (eligible landlords), so it is not lost after the popup is closed. */
export function PromoStrip({ code, percent }: { code: string; percent: number }) {
  const { t } = useTranslation();
  const { copied, copy } = useCopyToClipboard();
  return (
    <div className="relative mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-dashed border-primary/70 bg-accent-soft/40 px-4 py-3">
      <span className="rounded-xs bg-accent-soft px-1.5 py-0.5 font-mono text-xs tracking-[0.06em] text-primary uppercase">{t("promo.badge")}</span>
      <p className="min-w-0 flex-1 text-sm">{t("promo.strip", { code, percent })}</p>
      <Button variant="outline" size="sm" onClick={() => void copy(code)}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span className="font-mono tracking-[0.08em]">{code}</span>
      </Button>
    </div>
  );
}
