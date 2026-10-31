import type { Locale } from "@/constants";

export type Role = "LANDLORD" | "TENANT";

/** Mirrors server/src/modules/users/dto.ts (MeDto). */
export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  locale: Locale;
  roles: Role[];
  activeRole: Role | null;
}
