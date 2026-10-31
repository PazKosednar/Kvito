import { useCallback } from "react";
import { api } from "@/lib/api";
import type { Issue, IssueCategory, IssueStatus, IssueSummary, IssueUrgency } from "@/types/domain";
import type { Role } from "@/types/user";
import { uploadAttachment } from "./useCharges";
import { invalidate, useQuery } from "./useQuery";

export interface IssueInput {
  category: IssueCategory;
  title: string;
  description: string;
  urgency: IssueUrgency;
}

export function useIssues(tenancyId: string | undefined) {
  const q = useQuery<{ issues: IssueSummary[] }>(tenancyId ? `/api/tenancies/${tenancyId}/issues` : null);

  const create = useCallback(
    async (input: IssueInput, photos: File[]) => {
      const attachments = await Promise.all(photos.map((f) => uploadAttachment(tenancyId!, f, "ISSUE")));
      const { issue } = await api<{ issue: Issue }>(`/api/tenancies/${tenancyId}/issues`, {
        method: "POST",
        body: { ...input, attachmentIds: attachments.map((a) => a.id) },
      });
      await invalidate(`/api/tenancies/${tenancyId}/issues`, `/api/tenancies/${tenancyId}/messages`);
      return issue;
    },
    [tenancyId],
  );

  return { ...q, issues: q.data?.issues, create };
}

export function useIssue(issueId: string | undefined) {
  const q = useQuery<{ issue: Issue; access: Role }>(issueId ? `/api/issues/${issueId}` : null);
  const tenancyId = q.data?.issue.tenancyId;

  const refresh = useCallback(
    () => invalidate(`/api/issues/${issueId}`, `/api/tenancies/${tenancyId}/issues`, `/api/tenancies/${tenancyId}/messages`),
    [issueId, tenancyId],
  );

  const setStatus = useCallback(
    async (status: IssueStatus) => {
      await api(`/api/issues/${issueId}/status`, { method: "PATCH", body: { status } });
      await refresh();
    },
    [issueId, refresh],
  );

  const comment = useCallback(
    async (body: string, files: File[]) => {
      const attachments = await Promise.all(files.map((f) => uploadAttachment(tenancyId!, f, "ISSUE")));
      await api(`/api/issues/${issueId}/comments`, { method: "POST", body: { body, attachmentIds: attachments.map((a) => a.id) } });
      await refresh();
    },
    [issueId, tenancyId, refresh],
  );

  return { ...q, issue: q.data?.issue, isLandlord: q.data?.access === "LANDLORD", setStatus, comment };
}
