import type { VerifiedProductionTaskOutputCapture } from "@toonstudio/core/production";
import { studioReviewPreviewDigest, studioReviewPreviewIntentKey } from "../studio-project-graph/studio-review-preview-producer.contract";
import { SCOPED_AT, scopedDocument } from "./studio-scoped-write.test-fixture";

/** 실제 영수증·revision chain 규칙을 만족하는 불변 캡처이며 테스트 DB 삽입에는 사용하지 않는다. */
export function scopedCaptureFixture(sourceSnapshot: unknown = scopedDocument()) {
  const digest = studioReviewPreviewDigest(sourceSnapshot), actor = "actor", sequence = 7;
  const intent = { intentId: "scoped-capture", workId: "work", projectId: "graph/project@one", artifactId: "artifact",
    sourceServerRevision: 3, sourceContentDigest: digest, pageCount: 1, title: "담당 원고", deviceId: "device",
    createdAt: SCOPED_AT, expectedHeadRevisionId: "old-head", expectedHeadRootGraphHash: "c".repeat(64) };
  const key = studioReviewPreviewIntentKey(actor, intent), subject = { schemaVersion: 1 as const, workId: intent.workId,
    projectId: intent.projectId, artifactId: intent.artifactId, reviewId: `review-${key}`,
    revisionId: `review-snapshot-${key}`, rootGraphHash: digest };
  const previews = [{ ordinal: 0, sha256: "b".repeat(64) }], payload = { intent, sourceSnapshot, previews };
  const operation = { commandId: `review-capture-${key}`, type: "review.snapshot-create", payload };
  const revision = (id: string, kind: string) => ({ id, kind, artifactId: subject.artifactId, rootGraphHash: digest,
    operationFirst: sequence, operationLast: sequence, createdBy: actor, deviceId: intent.deviceId, createdAt: SCOPED_AT });
  const row = { pin: subject, capture: { artifactId: subject.artifactId, sequence, commandId: operation.commandId,
    baseRevisionId: intent.expectedHeadRevisionId, resultRevisionId: subject.revisionId, actorUserId: actor,
    deviceId: intent.deviceId, commandType: operation.type, payloadHash: studioReviewPreviewDigest(payload), operation },
  receipt: { actorUserId: actor, artifactId: subject.artifactId, resultRevisionId: subject.revisionId,
    idempotencyKeyHash: key, requestHash: studioReviewPreviewDigest({ intent, pages: previews }),
    response: { status: "completed", subject, fingerprint: studioReviewPreviewDigest(intent) } },
  snapshot: revision(subject.revisionId, "review-snapshot"), submission: revision(`review-submission-${key}`, "submission"),
  checkpoint: revision(`review-checkpoint-${key}`, "checkpoint"),
  base: { id: intent.expectedHeadRevisionId, artifactId: subject.artifactId, rootGraphHash: intent.expectedHeadRootGraphHash },
  snapshotParents: [{ ordinal: 0, parentRevisionId: `review-submission-${key}` }],
  submissionParents: [{ ordinal: 0, parentRevisionId: `review-checkpoint-${key}` }],
  checkpointParents: [{ ordinal: 0, parentRevisionId: intent.expectedHeadRevisionId }] };
  const capture: VerifiedProductionTaskOutputCapture = { subject, sourceServerRevision: 3, captureSequence: sequence,
    createdAt: SCOPED_AT, pages: [{ pageId: "page", ordinal: 0, sha256: previews[0]?.sha256 ?? "", frameIds: ["frame"] }] };
  return { row, capture, sourceSnapshot };
}
