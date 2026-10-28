import type { StudioProjectRecord, StudioReviewSummary, StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { productionSubmissionReviewFixture } from "./production-review-submission.test-fixture";

export function submissionVisualFixture() {
  const original = productionSubmissionReviewFixture();
  const hash = "a".repeat(64);
  const inputHash = "b".repeat(64);
  const submission = { ...original.submission, projectId: "production-project",
    revisionRef: { ...original.submission.revisionRef, id: "submitted-revision", lineage: "visual" as const, digest: `sha256:${hash}` },
    inputRevisionRefs: [{ ...original.submission.revisionRef, id: "input-revision", lineage: "visual" as const, digest: `sha256:${inputHash}` }] };
  const aggregate = { ...original.aggregate, projectId: "production-project", studioRevisionLinks: [], submissions: [submission],
    deliverables: [{ ...original.deliverable, projectId: "production-project" }] };
  const at = "2026-10-28T00:00:00.000Z";
  const revision = (id: string, rootGraphHash: string): StudioRevisionRecord => ({
    id, artifactId: "artifact", rootGraphHash, kind: "review-snapshot", parentIds: [], operationFirst: null, operationLast: null,
    createdBy: "owner", deviceId: "device", createdAt: at, message: null, compatibilityReportId: null, provenanceManifestId: null, blobRefs: [],
  });
  const review = (id: string, revisionId: string): StudioReviewSummary => ({
    id, artifactId: "artifact", revisionId, requestedBy: "owner", title: "원고 검수", status: "open", decidedAt: null,
    decidedBy: null, createdAt: at, updatedAt: at, reviewerIds: [], openRequiredCommentCount: 0,
  });
  const project: StudioProjectRecord = {
    id: "graph-project", workId: aggregate.workId, schemaVersion: 3, authorityVersion: "project-graph-v3", ownerUserId: "owner", createdAt: at, updatedAt: at,
    access: { view: true, edit: false, comment: true, manageMembers: false, respondInvite: false, owner: false, role: "commenter" },
    artifacts: [{ id: "artifact", projectId: "graph-project", title: "검수 원고", kind: "canvas-2d",
      scope: { projectId: "graph-project", episodeId: "episode-12" }, headRevisionId: "newer-head", approvedRevisionId: null,
      ownerWorkspaceId: "workspace", createdAt: at, updatedAt: at }],
  };
  const revisions = { artifact: [revision("newer-head", "c".repeat(64)), revision("submitted-revision", hash), revision("input-revision", inputHash)] };
  const reviews = { artifact: [review("head-review", "newer-head"), review("submission-review", "submitted-revision"), review("input-review", "input-revision")] };
  return { aggregate, submission, project, revisions, reviews, hash };
}
