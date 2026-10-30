import { createProductionProjectAggregate, episodeScope, type ProductionProjectAggregate, type ProductionTask, type ReviewPolicy,
  type RevisionRef, type Submission } from "@toonstudio/core/production";

export const REVIEW_FLOW_AT = "2026-10-29T00:00:00.000Z";
/** 실제 공개 aggregate 계약을 사용하는 단위 fixture이며 브라우저·DB 증거가 아니다. */
export function productionReviewFlowFixture() {
  const base = createProductionProjectAggregate({ projectId: "review-flow-project", workId: "review-flow-work", title: "검수 흐름",
    collaborationModel: "studio-production", ownerPartyId: "review-flow-owner-party", ownerUserId: "review-flow-owner", ownerDisplayName: "제작 담당", at: REVIEW_FLOW_AT });
  const owner = base.parties[0], producer = base.assignments[0];
  if (!owner || !producer) throw new Error("프로젝트 소유자 fixture가 없습니다.");
  const editorParty = { ...owner, id: "review-flow-editor-party", accountUserId: "review-flow-editor", publicDisplayName: "독립 검수자", internalDisplayName: "독립 검수자" };
  const artistParty = { ...owner, id: "review-flow-artist-party", accountUserId: "review-flow-artist", publicDisplayName: "선화 담당", internalDisplayName: "선화 담당" };
  const editor = { ...producer, id: "review-flow-editor-assignment", partyId: editorParty.id, roleType: "editor" as const };
  const artist = { ...producer, id: "review-flow-artist-assignment", partyId: artistParty.id, roleType: "line-artist" as const };
  const scope = episodeScope(base.projectId, "review-flow-episode");
  const input: RevisionRef = { id: "review-flow-input", lineage: "integrated", revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: REVIEW_FLOW_AT };
  const task: ProductionTask = { id: "review-flow-task", projectId: base.projectId, scope, processKey: "line-art", title: "첫 선화",
    status: "in-progress", assignmentIds: [artist.id], reviewerAssignmentIds: [], inputRevisionRefs: [input], outputDeliverableIds: ["review-flow-output"],
    dependencyTaskIds: [], dueAt: null, estimateHours: null, completionCriteria: ["기존 선화 완료 조건"], sourceAgreementMilestoneId: null,
    briefBlocks: [{ id: "existing-note", kind: "paragraph", text: "기존 제작 메모" }] };
  const submission: Submission = { id: "review-flow-submission", projectId: base.projectId, deliverableId: "review-flow-output",
    revisionRef: { id: "review-flow-snapshot", lineage: "visual", revision: 7, digest: `sha256:${"b".repeat(64)}`, createdAt: REVIEW_FLOW_AT },
    submittedByAssignmentId: artist.id, submittedAt: REVIEW_FLOW_AT, status: "submitted", inputRevisionRefs: [input], evidenceRefs: [] };
  const deliverable = { id: "review-flow-output", projectId: base.projectId, scope, type: "선화", expectedFormat: "PNG", completionCriteria: ["선화 완성"],
    currentSubmissionId: submission.id, approvedSubmissionId: null };
  const policy: ReviewPolicy = { id: "review-flow-policy", projectId: base.projectId, scope, quorumBasis: "accounts", responseDueHours: 24, expiredReviewAction: "escalate",
    lanes: [{ lane: "visual-direction", eligibleAssignmentIds: [editor.id], requiredAssignmentIds: [editor.id], quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] };
  const aggregate: ProductionProjectAggregate = { ...base, parties: [...base.parties, editorParty, artistParty], assignments: [...base.assignments, editor, artist],
    episodes: [{ id: "review-flow-episode-record", projectId: base.projectId, episodeId: scope.id, revision: 0, state: "final-art-production", narrativeRevisionRef: null,
      visualRevisionRef: null, integratedRevisionRef: null, activeHandoffId: null, openBlockerCount: 0, storyLockApproved: false, thumbnailLockApproved: false,
      jointProofApproved: false, creditPreflightPassed: false, publicationPreflightPassed: false, updatedAt: REVIEW_FLOW_AT }],
    tasks: [task], deliverables: [deliverable], submissions: [submission], reviewPolicies: [policy] };
  return { base, aggregate, task, submission, deliverable, policy, editor, editorParty, artist, artistParty, scope, input };
}
