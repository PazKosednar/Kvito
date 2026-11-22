import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { PROMO, ROUTES, STORAGE_KEYS } from "@/constants";
import { isPromoEligible, parsePromoSeen, promoClosed, promoDue, promoPrices } from "@/lib/promo";
import { storage } from "@/lib/storage";
import type { Billing } from "./useBilling";
import { useQuery } from "./useQuery";
import { useRole } from "./useRole";

/**
 * The "−30 % with NEW30" popup for an eligible landlord (not on the Naročnina page itself, which shows the code inline).
 * After it is closed it comes back after PROMO.repeatAfterDays, at most PROMO.maxShows times on this device.
 */
export function usePromo() {
  const { activeRole } = useRole();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => !promoDue(parsePromoSeen(storage.get(STORAGE_KEYS.promoDismissed)), Date.now()));
  const landlord = activeRole === "LANDLORD";
  // Only ask for billing when the popup could still be shown.
  const q = useQuery<Billing>(landlord && !dismissed ? "/api/billing" : null);
  const billing = q.data;

  const prices = useMemo(() => (isPromoEligible(billing) ? promoPrices(billing) : []), [billing]);
  const open = landlord && !dismissed && pathname !== ROUTES.billing && prices.length > 0;

  const dismiss = useCallback(() => {
    const seen = parsePromoSeen(storage.get(STORAGE_KEYS.promoDismissed));
    storage.set(STORAGE_KEYS.promoDismissed, JSON.stringify(promoClosed(seen, Date.now())));
    setDismissed(true);
  }, []);

  return { open, dismiss, prices, code: PROMO.code, percent: PROMO.percent };
}
