import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "@/lib/api";
import { ApiError } from "@/types/api";
import { useAsyncAction } from "./useAsyncAction";
import { useQuery } from "./useQuery";

export type Plan = "FREE" | "PLUS" | "PRO" | "MANAGER";
export type PaidPlan = Exclude<Plan, "FREE">;
export type BillingInterval = "month" | "year";

export interface PlanInfo {
  id: Plan;
  units: number;
  storageBytes: number;
  monthlyCents: number;
  yearlyCents: number;
}

export interface Billing {
  plan: Plan;
  founder: boolean;
  status: string;
  /** Kvito's own free trial of `plan` runs until this date (set for landlords from the test period). */
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  limits: Omit<PlanInfo, "id">;
  usage: { units: number; storageBytes: number };
  plans: PlanInfo[];
  /** Payments through Polar are configured on the server. */
  checkoutEnabled: boolean;
  /** A paid subscription that still applies: plan changes and cancelling go through the portal. */
  hasPaidSubscription: boolean;
}

/** Polar applies the plan through a webhook a moment after the payment; reload after this delay. */
const AFTER_PAYMENT_RELOAD_MS = 3000;

/** The landlord's plan, usage and the packages; starting a payment and opening the customer portal. */
export function useBilling() {
  const q = useQuery<Billing>("/api/billing");
  // Yearly is the default: two months free and a smaller share of the provider's fee (docs/NAROCNINA.md).
  const [interval, setBillingInterval] = useState<BillingInterval>("year");
  const [choosing, setChoosing] = useState<PaidPlan | null>(null);
  const [params, setParams] = useSearchParams();
  const [paid, setPaid] = useState(() => params.get("placilo") === "ok");
  const { reload } = q;

  useEffect(() => {
    if (!paid) return;
    const timer = window.setTimeout(() => {
      void reload();
      setParams(
        (p) => {
          p.delete("placilo");
          return p;
        },
        { replace: true },
      );
    }, AFTER_PAYMENT_RELOAD_MS);
    return () => window.clearTimeout(timer);
  }, [paid, reload, setParams]);

  const goToPortal = useCallback(async () => {
    const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
    window.location.href = url;
  }, []);

  const portal = useAsyncAction(goToPortal);

  const checkout = useAsyncAction(
    useCallback(
      async (plan: PaidPlan) => {
        setChoosing(plan);
        try {
          const { url } = await api<{ url: string }>("/api/billing/checkout", { method: "POST", body: { plan, interval } });
          window.location.href = url;
        } catch (err) {
          // Already subscribed: a change of plan goes through the portal, never a second subscription.
          if (err instanceof ApiError && err.status === 409) return goToPortal();
          setChoosing(null);
          throw err;
        }
      },
      [interval, goToPortal],
    ),
  );

  return {
    ...q,
    billing: q.data,
    interval,
    setInterval: setBillingInterval,
    /** Plan whose payment page is being opened (its button shows a spinner). */
    choosing,
    choose: checkout.run,
    openPortal: portal.run,
    portalPending: portal.pending,
    actionError: checkout.error ?? portal.error,
    /** Back from a successful payment (?placilo=ok). */
    paid,
    dismissPaid: () => setPaid(false),
  };
}
