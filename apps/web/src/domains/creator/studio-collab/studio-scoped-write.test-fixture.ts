import type { StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";
import { StudioScopedWriteAuthority } from "./studio-scoped-write-authority";

export function createStudioScopedWriteFixture() {
  let now = Date.parse("2026-10-29T01:00:00.000Z");
  const fence = { authScopeKey: "actor-1", workId: "work-1", accessGeneration: 0, documentGeneration: 0, scopedMutationReady: true };
  const policy: StudioScopedWritePolicy = { version: 1, workId: "work-1", policyVersion: 1, canManage: false, fullEdit: false, scopedWrite: true, requiresScopedSaveReconciliation: true,
    targets: [1, 2].map((n) => ({ definition: { id: `target-${n}`, productionProjectId: "production-1", taskId: "initial-task", scope: { kind: "project", id: "production-1", ancestors: [] },
      pageId: `page-${n}`, frameId: null, layerId: null, entities: [{ kind: "group", id: "same-group" }],
      source: { schemaVersion: 1, workId: "work-1", projectId: "graph-1", artifactId: "artifact-1", reviewId: "review-1", revisionId: "revision-1", rootGraphHash: "a".repeat(64) } },
      sourceServerRevision: 1, captureSequence: 1, createdBy: "manager-1", createdAt: "2026-10-28T00:00:00.000Z", revokedAt: null })),
    grants: [1, 2].map((n) => ({ id: `grant-${n}`, actorUserId: "actor-1", assignmentId: `assignment-${n}`, productionProjectId: "production-1", taskId: `current-task-${n}`, targetIds: [`target-${n}`],
      startsAt: "2026-10-28T00:00:00.000Z", endsAt: "2026-10-29T02:00:00.000Z", createdBy: "manager-1", createdAt: "2026-10-28T00:00:00.000Z", revokedAt: null })), ownedEntities: [] };
  const authority = new StudioScopedWriteAuthority("actor-1", "work-1", () => fence, () => now);
  authority.setPolicy(policy);
  return { authority, policy, fence, choose: () => authority.chooseTarget("target-1", "grant-1"), expire: () => { now = Date.parse("2026-10-29T02:00:00.001Z"); authority.expire(); } };
}
