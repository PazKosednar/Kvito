import type { User } from "../../generated/prisma/client.js";

/** Public shape of the signed-in user (GET /api/me). Keep in sync with client/src/types/user.ts. */
export function toMeDto(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    locale: user.locale,
    roles: user.roles,
    activeRole: user.lastActiveRole ?? user.roles[0] ?? null,
  };
}

export type MeDto = ReturnType<typeof toMeDto>;
