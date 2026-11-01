import { Router } from "express";
import { z } from "zod";
import { audit } from "../../lib/audit.js";
import { notFound } from "../../lib/errors.js";
import { prisma } from "../../lib/prisma.js";
import { authUserId, requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { toMeDto } from "./dto.js";

const UpdateMeBody = z
  .object({
    name: z.string().trim().min(1).max(100).nullable(),
    phone: z.string().trim().max(30).nullable(),
    locale: z.enum(["sl", "en"]),
    /** Switching to a role the user does not have yet enables it (e.g. a tenant who also starts renting out). */
    activeRole: z.enum(["LANDLORD", "TENANT"]),
  })
  .partial()
  .strict();

export function usersRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const user = await prisma.user.findFirst({ where: { id: authUserId(req), deletedAt: null } });
    if (!user) throw notFound();
    res.json({ user: toMeDto(user) });
  });

  router.patch("/", validateBody(UpdateMeBody), async (req, res) => {
    const body = req.body as z.infer<typeof UpdateMeBody>;
    const current = await prisma.user.findFirst({ where: { id: authUserId(req), deletedAt: null } });
    if (!current) throw notFound();

    const roles =
      body.activeRole && !current.roles.includes(body.activeRole) ? [...current.roles, body.activeRole] : undefined;

    const user = await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.phone !== undefined ? { phone: body.phone } : {}),
        ...(body.locale ? { locale: body.locale } : {}),
        ...(body.activeRole ? { lastActiveRole: body.activeRole } : {}),
        ...(roles ? { roles } : {}),
      },
    });
    const changed = ["name", "phone", "locale", "activeRole"].filter((k) => (body as Record<string, unknown>)[k] !== undefined);
    if (changed.length) await audit({ actorId: user.id, entityType: "User", entityId: user.id, action: "update.profile", after: { fields: changed }, ip: req.ip });
    res.json({ user: toMeDto(user) });
  });

  return router;
}
