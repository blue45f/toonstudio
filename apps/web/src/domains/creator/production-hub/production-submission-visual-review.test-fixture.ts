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
    createdBy: "owner", deviceId: "device", createdAt: at, message: null, compatibilityReportId: null, provenanceManifestId: null,
    blobRefs: [{ sha256: rootGraphHash, role: "preview", ordinal: 0 }],
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

/** 실제 producer처럼 원본 artifact와 작품 범위의 검수 artifact를 분리한다. */
export function submissionCaptureVisualFixture() {
  const f = submissionVisualFixture();
  const sourceArtifact = f.project.artifacts[0];
  if (!sourceArtifact) throw new Error("원본 artifact fixture가 없습니다.");
  const captureArtifact = { ...sourceArtifact, id: "capture-artifact", kind: "review-snapshot" as const,
    scope: { projectId: f.project.id }, headRevisionId: "capture-checkpoint", approvedRevisionId: null };
  const originals = f.revisions.artifact.map((entry): StudioRevisionRecord => ({ ...entry, kind: entry.id === "submitted-revision" ? "submission" : "checkpoint", blobRefs: [] }));
  const captured = originals.filter((entry) => entry.id !== "newer-head").map((entry) => ({ ...entry, artifactId: captureArtifact.id,
    kind: "review-snapshot" as const, id: entry.id === "submitted-revision" ? "capture-submitted" : "capture-input",
    parentIds: [entry.id === "submitted-revision" ? "capture-source-submission" : "capture-input-submission"],
    blobRefs: [{ sha256: entry.rootGraphHash, role: "preview" as const, ordinal: 0 }] }));
  const capturedReviews = f.reviews.artifact.filter((entry) => entry.revisionId !== "newer-head").map((entry) => ({ ...entry,
    artifactId: captureArtifact.id, revisionId: entry.revisionId === "submitted-revision" ? "capture-submitted" : "capture-input",
    sourceRevision: { artifactId: sourceArtifact.id, revisionId: entry.revisionId,
      rootGraphHash: entry.revisionId === "submitted-revision" ? f.hash : "b".repeat(64), scope: sourceArtifact.scope } }));
  return { ...f, project: { ...f.project, artifacts: [sourceArtifact, captureArtifact] },
    revisions: { artifact: originals, "capture-artifact": captured }, reviews: { artifact: [], "capture-artifact": capturedReviews } };
}
