import { useCallback, useMemo, useState } from "react";
import { useLocation } from "react-router";
import { PROMO, ROUTES, STORAGE_KEYS } from "@/constants";
import { isPromoEligible, promoPrices } from "@/lib/promo";
import { storage } from "@/lib/storage";
import type { Billing } from "./useBilling";
import { useQuery } from "./useQuery";
import { useRole } from "./useRole";

/**
 * The one-time "−30 % with NEW30" popup: shown once to an eligible landlord (not on the Naročnina page itself,
 * which shows the code inline). Closing it in any way remembers it on this device.
 */
export function usePromo() {
  const { activeRole } = useRole();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(() => storage.get(STORAGE_KEYS.promoDismissed) === PROMO.code);
  const landlord = activeRole === "LANDLORD";
  // Only ask for billing when the popup could still be shown.
  const q = useQuery<Billing>(landlord && !dismissed ? "/api/billing" : null);
  const billing = q.data;

  const prices = useMemo(() => (isPromoEligible(billing) ? promoPrices(billing) : []), [billing]);
  const open = landlord && !dismissed && pathname !== ROUTES.billing && prices.length > 0;

  const dismiss = useCallback(() => {
    storage.set(STORAGE_KEYS.promoDismissed, PROMO.code);
    setDismissed(true);
  }, []);

  return { open, dismiss, prices, code: PROMO.code, percent: PROMO.percent };
}
