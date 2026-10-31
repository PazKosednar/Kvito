import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ROUTES, type Locale } from "@/constants";
import type { Role } from "@/types/user";
import { useAuth } from "./useAuth";
import { useErrorMessage } from "./useErrorMessage";
import { useRole } from "./useRole";

/** Actions from the account menu: role switch, language, sign out. */
export function useAccountActions() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { logout, updateMe, isAuthenticated } = useAuth();
  const { switchRole } = useRole();
  const toMessage = useErrorMessage();

  const changeRole = useCallback(
    async (role: Role) => {
      try {
        await switchRole(role);
        toast.success(t("roles.switched", { role: t(`roles.${role}`) }));
        void navigate(ROUTES.home);
      } catch (err) {
        toast.error(toMessage(err));
      }
    },
    [switchRole, t, navigate, toMessage],
  );

  const changeLanguage = useCallback(
    async (locale: Locale) => {
      await i18n.changeLanguage(locale);
      if (isAuthenticated) await updateMe({ locale }).catch(() => undefined);
    },
    [i18n, isAuthenticated, updateMe],
  );

  const signOut = useCallback(async () => {
    await logout();
    toast(t("auth.loggedOut"));
    void navigate(ROUTES.login, { replace: true });
  }, [logout, navigate, t]);

  return { changeRole, changeLanguage, signOut };
}
