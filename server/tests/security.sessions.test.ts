/**
 * A valid signature is not enough for an access token: it stops working when the account is deleted
 * and when the password is changed ("sign out everywhere"), also for the realtime connection.
 */
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";

describe.skipIf(!hasDb)("access token revocation", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  const ids: string[] = [];

  beforeAll(async () => {
    ctx = await setupApp();
  });

  afterAll(async () => {
    await ctx.prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await ctx.prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await ctx.prisma.user.deleteMany({ where: { id: { in: ids } } });
    await ctx.prisma.$disconnect();
  });

  it("refuses a token of a deleted account and of an account that no longer exists", async () => {
    const { signAccessToken } = await import("../src/modules/auth/tokens.js");
    const a = await ctx.login(uniqueEmail("sec-del"));
    ids.push(a.user.id);
    expect((await a.get("/api/me")).status).toBe(200);

    await ctx.prisma.user.update({ where: { id: a.user.id }, data: { deletedAt: new Date() } });
    const res = await a.get("/api/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("TOKEN_INVALID");

    const ghost = await signAccessToken("no-such-user");
    expect((await request(ctx.app).get("/api/me").set("Authorization", `Bearer ${ghost}`)).status).toBe(401);
  });

  it("a password change ends older access tokens, the fresh one works", async () => {
    const { hashPassword } = await import("../src/lib/password.js");
    const { signAccessToken } = await import("../src/modules/auth/tokens.js");
    const { verifySession } = await import("../src/modules/auth/sessions.js");
    const a = await ctx.login(uniqueEmail("sec-pw"));
    ids.push(a.user.id);
    await ctx.prisma.user.update({ where: { id: a.user.id }, data: { passwordHash: await hashPassword("staro-geslo-2026") } });

    // A token from an earlier moment (e.g. on a second, possibly stolen device). `iat` has second precision.
    const older = await signAccessToken(a.user.id);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await verifySession(older)).not.toBeNull();

    const changed = await a.post("/api/auth/change-password", { currentPassword: "staro-geslo-2026", newPassword: "novo-geslo-2026-x" });
    expect(changed.status).toBe(200);

    expect(await verifySession(older)).toBeNull();
    expect((await request(ctx.app).get("/api/me").set("Authorization", `Bearer ${older}`)).status).toBe(401);
    const fresh = changed.body.accessToken as string;
    expect((await request(ctx.app).get("/api/me").set("Authorization", `Bearer ${fresh}`)).status).toBe(200);
  });

  it("sends the Permissions-Policy and CSP headers", async () => {
    const res = await request(ctx.app).get("/api/health");
    expect(res.headers["permissions-policy"]).toContain("geolocation=()");
    expect(res.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});
