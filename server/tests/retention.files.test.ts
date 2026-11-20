/**
 * Deleted files leave storage after the retention period; abandoned uploads count as deleted;
 * files that are still in use are never touched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasDb, setupApp, uniqueEmail } from "./helpers.js";
import type { Storage } from "../src/services/storage/Storage.js";

describe.skipIf(!hasDb)("deleted files", () => {
  let ctx: Awaited<ReturnType<typeof setupApp>>;
  let userId = "";

  beforeAll(async () => {
    ctx = await setupApp();
    userId = (await ctx.login(uniqueEmail("files"))).user.id;
  });

  afterAll(async () => {
    await ctx.prisma.attachment.deleteMany({ where: { uploadedById: userId } });
    await ctx.prisma.user.deleteMany({ where: { id: userId } });
    await ctx.prisma.$disconnect();
  });

  it("removes old deleted files from storage, marks abandoned uploads and keeps the rest", async () => {
    const { purgeDeletedFiles } = await import("../src/services/jobs/retention.js");
    const removed: string[] = [];
    const storage: Storage = {
      put: async () => undefined,
      get: async () => {
        throw new Error("not used");
      },
      remove: async (key) => {
        removed.push(key);
      },
    };
    const day = 86_400_000;
    const now = new Date();
    const file = (key: string, extra: object) =>
      ctx.prisma.attachment.create({ data: { kind: "MESSAGE", uploadedById: userId, storageKey: `${key}-${userId}`, fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10, ...extra } });

    const oldDeleted = await file("old-deleted", { deletedAt: new Date(now.getTime() - 40 * day) });
    const recentDeleted = await file("recent-deleted", { deletedAt: new Date(now.getTime() - 3 * day) });
    const abandoned = await file("abandoned", { createdAt: new Date(now.getTime() - 10 * day) });
    const property = await ctx.prisma.property.create({ data: { ownerId: userId, type: "APARTMENT", name: "Test", street: "Ulica 1", postalCode: "1000", city: "Ljubljana" } });
    const inUse = await file("in-use", { createdAt: new Date(now.getTime() - 400 * day), propertyId: property.id });

    const result = await purgeDeletedFiles(storage, now);
    expect(result.files).toBeGreaterThanOrEqual(1);
    expect(removed).toContain(oldDeleted.storageKey);
    expect(removed).not.toContain(recentDeleted.storageKey);
    expect(removed).not.toContain(inUse.storageKey);

    const after = async (id: string) => ctx.prisma.attachment.findUniqueOrThrow({ where: { id } });
    expect((await after(oldDeleted.id)).purgedAt).not.toBeNull();
    expect((await after(recentDeleted.id)).purgedAt).toBeNull();
    expect((await after(abandoned.id)).deletedAt).not.toBeNull();
    expect((await after(inUse.id)).deletedAt).toBeNull();

    // A second run does not touch already purged files.
    removed.length = 0;
    await purgeDeletedFiles(storage, now);
    expect(removed).not.toContain(oldDeleted.storageKey);

    await ctx.prisma.attachment.deleteMany({ where: { propertyId: property.id } });
    await ctx.prisma.property.delete({ where: { id: property.id } });
  });
});
