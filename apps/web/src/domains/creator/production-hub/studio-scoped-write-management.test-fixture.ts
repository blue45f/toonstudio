import { createProductionProjectAggregate, episodeScope, type ProductionTask } from "@toonstudio/core/production";
import { deriveStudioReviewPageMapping } from "@toonstudio/studio-project-model";
import type { StudioScopedWritePolicy, StudioScopedWriteTarget } from "@toonstudio/contracts/studio-scoped-write";
import type { TaskOutputCaptureChoice, TaskOutputCapturePages } from "./production-task-output-source";

export function scopedManagementUiFixture() {
  const at = "2026-10-29T00:00:00.000Z", scope = episodeScope("production", "episode");
  const base = createProductionProjectAggregate({ projectId: "production", workId: "work", title: "실제 배정 원고", collaborationModel: "studio-production",
    ownerPartyId: "owner-party", ownerUserId: "owner", ownerDisplayName: "제작자", at });
  const role = base.assignments[0], party = base.parties[0];
  if (!role || !party) throw new Error("실제 역할 fixture가 없습니다.");
  const task: ProductionTask = { id: "line-task", projectId: "production", scope, title: "선화 작업", processKey: "line-art", status: "in-progress",
    assignmentIds: ["artist-role"], reviewerAssignmentIds: [], inputRevisionRefs: [], outputDeliverableIds: [], dependencyTaskIds: [],
    dueAt: null, estimateHours: null, completionCriteria: ["선화 확인"], sourceAgreementMilestoneId: null };
  const aggregate = { ...base, parties: [...base.parties, { ...party, id: "artist-party", accountUserId: "artist", publicDisplayName: "선화 담당" }],
    assignments: [...base.assignments, { ...role, id: "artist-role", partyId: "artist-party", scope }], tasks: [task] };
  const doc = { width: 800, pagesList: [{ id: "page/one", canvasH: 1200, groups: [{ id: "layer", name: "실제 선화 레이어" }], elements: [
    { id: "frame@one", type: "frame", x: 0, y: 0, width: 300, height: 300 },
    { id: "stroke/one", type: "draw", name: "실제 담당 획", points: [20, 20, 40, 40], groupId: "layer", noClip: false },
  ] }] };
  const subject = { schemaVersion: 1 as const, workId: "work", projectId: "graph/project@one", artifactId: "artifact", reviewId: "review",
    revisionId: "snapshot", rootGraphHash: "a".repeat(64) };
  const choice: TaskOutputCaptureChoice = { key: JSON.stringify(subject), label: "검증된 저장 원고", subject,
    revision: { id: "snapshot", artifactId: "artifact", kind: "review-snapshot", parentIds: [], rootGraphHash: subject.rootGraphHash,
      operationFirst: 7, operationLast: 7, createdBy: "owner", deviceId: "device", createdAt: at, message: null,
      compatibilityReportId: null, provenanceManifestId: null, blobRefs: [{ sha256: "b".repeat(64), ordinal: 0, role: "preview" }] } };
  const mapping = deriveStudioReviewPageMapping(doc, { ordinal: 0, sourceServerRevision: 3, sourceContentDigest: subject.rootGraphHash, renderWidth: 800, renderHeight: 1200 });
  if (mapping.status !== "mapped") throw new Error("페이지 mapping fixture가 없습니다.");
  const capture: TaskOutputCapturePages = { choice, sourceServerRevision: 3, pages: [{ pageId: "page/one", ordinal: 0, frameIds: ["frame@one"],
    sha256: "b".repeat(64), url: "https://images.unit.test/scoped.png", expiresAt: Date.now() + 120_000, mapping }] };
  const target: StudioScopedWriteTarget = { definition: { id: "target", productionProjectId: "production", taskId: task.id,
    scope, pageId: "page/one", frameId: "frame@one", layerId: "layer", entities: [{ kind: "group", id: "layer" }, { kind: "stroke", id: "stroke/one" }], source: subject },
    sourceServerRevision: 3, captureSequence: 7, createdBy: "owner", createdAt: at, revokedAt: null };
  const policy: StudioScopedWritePolicy = { version: 1, workId: "work", policyVersion: 1, canManage: true, fullEdit: true, scopedWrite: false,
    targets: [target], grants: [], ownedEntities: [{ kind: "group", id: "layer", targetId: "target" }, { kind: "stroke", id: "stroke/one", targetId: "target" }] };
  return { aggregate, task, doc, choice, capture, target, policy, at };
}
