import { createProductionProjectAggregate, type ProductionProjectAggregate, type ProductionTask } from "@toonstudio/core/production";
import type { StudioScopedWriteContext, StudioScopedWriteGrant, StudioScopedWriteTarget } from "@toonstudio/contracts/studio-scoped-write";
import type { StudioScopedAuthorization } from "./studio-scoped-write-store";

export const SCOPED_AT = "2026-10-29T06:00:00.000Z";
export const scopedFrame = { id: "frame", type: "frame", x: 0, y: 0, width: 300, height: 300, hidden: false };
export const scopedStroke = { id: "own", type: "draw", points: [20, 20, 50, 50], color: "#000000", width: 3, opacity: 1, noClip: false };
export const scopedOutside = { id: "outside", type: "image", x: 500, y: 0, width: 100, height: 100, noClip: true, src: "asset:outside" };
export const scopedDocument = (elements: readonly unknown[] = [scopedStroke, scopedOutside, scopedFrame], groups: readonly unknown[] = []) => ({
  width: 800, pagesList: [{ id: "page", canvasH: 1200, elements, groups }],
});
export function scopedFixture() {
  const scope = { kind: "cut" as const, id: "production-cut", ancestors: [{ kind: "project" as const, id: "production" },
    { kind: "episode" as const, id: "episode" }] };
  const target: StudioScopedWriteTarget = { definition: { id: "target", productionProjectId: "production", taskId: "task", scope,
    pageId: "page", frameId: "frame", layerId: null, entities: [{ kind: "stroke", id: "own" }], source: {
      schemaVersion: 1, workId: "work", projectId: "graph/project@one", artifactId: "artifact", reviewId: "review",
      revisionId: "revision", rootGraphHash: "a".repeat(64) } }, sourceServerRevision: 3, captureSequence: 7,
    createdBy: "owner", createdAt: SCOPED_AT, revokedAt: null };
  const context: StudioScopedWriteContext = { version: 1, policyVersion: 1, grantIds: ["grant"], creations: [], restorations: [] };
  const grant: StudioScopedWriteGrant = { id: "grant", actorUserId: "actor", assignmentId: "role", taskId: "task", productionProjectId: "production",
    targetIds: ["target"], startsAt: "2026-10-29T00:00:00.000Z", endsAt: "2026-10-30T00:00:00.000Z",
    createdBy: "owner", createdAt: SCOPED_AT, revokedAt: null };
  const base = createProductionProjectAggregate({ projectId: "production", workId: "work", title: "담당 원고",
    collaborationModel: "studio-production", ownerPartyId: "owner-party", ownerUserId: "owner", ownerDisplayName: "제작자", at: "2026-10-28T00:00:00.000Z" });
  const role = base.assignments[0], party = base.parties[0];
  if (!role || !party) throw new Error("제작 역할 fixture가 필요합니다.");
  const task: ProductionTask = { id: "task", projectId: "production", scope, title: "선화", processKey: "lineart", status: "in-progress",
    assignmentIds: ["role"], reviewerAssignmentIds: [], inputRevisionRefs: [], outputDeliverableIds: [], dependencyTaskIds: [],
    dueAt: null, estimateHours: null, completionCriteria: ["선화 확인"], sourceAgreementMilestoneId: null };
  const aggregate: ProductionProjectAggregate = { ...base, parties: [...base.parties, { ...party, id: "actor-party", accountUserId: "actor" }],
    assignments: [...base.assignments, { ...role, id: "role", partyId: "actor-party", scope }], tasks: [task] };
  const ownership = new Map([["stroke:own", "target"]]);
  const authorization: StudioScopedAuthorization = { work: { workId: "work", actorUserId: "actor", revision: 3,
    document: scopedDocument(), work: {}, now: SCOPED_AT,
    access: { view: true, comment: false, edit: false, manageMembers: false, respondInvite: false } },
    policy: { policyVersion: 1, targets: [target], grants: [grant], ownership: Object.fromEntries(ownership) }, targets: [target], grants: [grant], context };
  return { target, context, grant, aggregate, ownership, authorization };
}
