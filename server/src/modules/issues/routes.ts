import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { audit } from "../../lib/audit.js";
import { badRequest, notFound } from "../../lib/errors.js";
import { bus } from "../../lib/events.js";
import { prisma } from "../../lib/prisma.js";
import { idParam, text } from "../../lib/validation.js";
import { authUserId } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { assertTenancyAccess } from "../access/access.js";
import { attachmentDto, attachmentSelect, claimAttachments } from "../attachments/service.js";
import { postSystemMessage } from "../messages/system.js";

const CATEGORIES = ["PLUMBING", "ELECTRICAL", "HEATING", "APPLIANCE", "WINDOWS_DOORS", "STRUCTURE", "PESTS", "OTHER"] as const;

const CreateIssueBody = z.object({
  category: z.enum(CATEGORIES),
  title: text(100),
  description: z.string().trim().min(1).max(4000),
  urgency: z.enum(["LOW", "NORMAL", "URGENT"]).default("NORMAL"),
  attachmentIds: z.array(idParam).max(8).optional(),
});
const StatusBody = z.object({ status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED"]) });
const CommentBody = z
  .object({ body: z.string().trim().max(4000).default(""), attachmentIds: z.array(idParam).max(6).optional() })
  .refine((b) => b.body.length > 0 || (b.attachmentIds?.length ?? 0) > 0, { message: "EMPTY_MESSAGE", path: ["body"] });

const issueInclude = {
  reporter: { select: { id: true, name: true, email: true } },
  attachments: attachmentSelect,
  comments: {
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, name: true, email: true } }, attachments: attachmentSelect },
  },
} satisfies Prisma.IssueInclude;

type IssueRow = Prisma.IssueGetPayload<{ include: typeof issueInclude }>;

const issueDto = (i: IssueRow) => ({
  ...i,
  attachments: i.attachments.map(attachmentDto),
  comments: i.comments.map((c) => ({ ...c, attachments: c.attachments.map(attachmentDto) })),
});

/**
 * Status rules: the landlord moves an issue through NEW → IN_PROGRESS → RESOLVED (and can reopen);
 * the person who reported it can mark it resolved or reopen it.
 */
export function canSetIssueStatus(role: "LANDLORD" | "TENANT", isReporter: boolean, from: string, to: string): boolean {
  if (from === to) return false;
  if (role === "LANDLORD") return true;
  return isReporter && (to === "RESOLVED" || (from === "RESOLVED" && to === "NEW"));
}

export function issuesRouter(): Router {
  const router = Router();

  router.get("/tenancies/:id/issues", async (req, res) => {
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(authUserId(req), tenancyId);
    const issues = await prisma.issue.findMany({
      where: { tenancyId, deletedAt: null },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        reporter: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: { where: { deletedAt: null } }, attachments: { where: { deletedAt: null } } } },
      },
    });
    res.json({ issues });
  });

  router.post("/tenancies/:id/issues", validateBody(CreateIssueBody), async (req, res) => {
    const userId = authUserId(req);
    const tenancyId = idParam.parse(req.params.id);
    await assertTenancyAccess(userId, tenancyId);
    const body = req.body as z.infer<typeof CreateIssueBody>;
    const issue = await prisma.$transaction(async (tx) => {
      const created = await tx.issue.create({
        data: { tenancyId, reporterId: userId, category: body.category, title: body.title, description: body.description, urgency: body.urgency },
      });
      await claimAttachments(tx, body.attachmentIds, { tenancyId, uploadedById: userId, kinds: ["ISSUE"], link: { issueId: created.id } });
      await audit({ actorId: userId, entityType: "Issue", entityId: created.id, action: "create", after: { status: "NEW", urgency: body.urgency }, ip: req.ip }, tx);
      const reporter = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      await postSystemMessage(tx, tenancyId, "ISSUE_CREATED", { title: created.title, name: reporter.name ?? reporter.email, urgency: created.urgency }, { issueId: created.id });
      return tx.issue.findUniqueOrThrow({ where: { id: created.id }, include: issueInclude });
    });
    bus.emit("tenancy.changed", { tenancyId, what: "issues" });
    res.status(201).json({ issue: issueDto(issue) });
  });

  router.get("/issues/:id", async (req, res) => {
    const userId = authUserId(req);
    const issue = await prisma.issue.findFirst({ where: { id: idParam.parse(req.params.id), deletedAt: null }, include: issueInclude });
    if (!issue) throw notFound();
    const access = await assertTenancyAccess(userId, issue.tenancyId);
    res.json({ issue: issueDto(issue), access: access.role });
  });

  router.patch("/issues/:id/status", validateBody(StatusBody), async (req, res) => {
    const userId = authUserId(req);
    const { status } = req.body as z.infer<typeof StatusBody>;
    const issue = await prisma.issue.findFirst({ where: { id: idParam.parse(req.params.id), deletedAt: null } });
    if (!issue) throw notFound();
    const access = await assertTenancyAccess(userId, issue.tenancyId);
    if (!canSetIssueStatus(access.role, issue.reporterId === userId, issue.status, status)) throw badRequest("TRANSITION_NOT_ALLOWED");
    await prisma.$transaction(async (tx) => {
      await tx.issue.update({ where: { id: issue.id }, data: { status, resolvedAt: status === "RESOLVED" ? new Date() : null } });
      await audit({ actorId: userId, entityType: "Issue", entityId: issue.id, action: "status", before: { status: issue.status }, after: { status }, ip: req.ip }, tx);
      await postSystemMessage(tx, issue.tenancyId, "ISSUE_STATUS", { title: issue.title, status }, { issueId: issue.id });
    });
    bus.emit("tenancy.changed", { tenancyId: issue.tenancyId, what: "issues" });
    res.json({ status });
  });

  router.post("/issues/:id/comments", validateBody(CommentBody), async (req, res) => {
    const userId = authUserId(req);
    const body = req.body as z.infer<typeof CommentBody>;
    const issue = await prisma.issue.findFirst({ where: { id: idParam.parse(req.params.id), deletedAt: null } });
    if (!issue) throw notFound();
    await assertTenancyAccess(userId, issue.tenancyId);
    const comment = await prisma.$transaction(async (tx) => {
      const created = await tx.issueComment.create({ data: { issueId: issue.id, authorId: userId, body: body.body } });
      await claimAttachments(tx, body.attachmentIds, { tenancyId: issue.tenancyId, uploadedById: userId, kinds: ["ISSUE"], link: { issueCommentId: created.id } });
      return created;
    });
    bus.emit("tenancy.changed", { tenancyId: issue.tenancyId, what: "issues" });
    res.status(201).json({ comment });
  });

  return router;
}
