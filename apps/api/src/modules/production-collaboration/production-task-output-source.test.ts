import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { ProductionTaskOutputSubject } from "@toonstudio/core/production";
import { PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION } from "../../platform/adapters/private-object-storage/private-object-storage.contract";
import { studioReviewResolutionCaptureQuery } from "../studio-project-graph/studio-review-capture-attestation";
import { studioReviewPreviewDigest, studioReviewPreviewIntentKey } from "../studio-project-graph/studio-review-preview-producer.contract";
import type { StudioReviewPreviewBlobRow } from "../studio-project-graph/studio-review-preview";
import { verifiedProductionTaskOutputCaptureFromRows } from "./production-task-output-source";

function fixture(projectId = "graph-project") {
  const doc = { width: 800, pagesList: [
    { id: "page-one", canvasH: 1200, elements: [{ id: "frame-one", type: "frame", x: 20, y: 30, width: 200, height: 100 }] },
    { id: "page-two", canvasH: 1200, elements: [] },
  ] };
  const digest = studioReviewPreviewDigest(doc), actor = "capture-author", sequence = 13;
  const intent = { intentId: "intent", workId: "work", projectId, artifactId: "capture-artifact",
    sourceServerRevision: 7, sourceContentDigest: digest, pageCount: 2, title: "저장된 원고", deviceId: "device",
    createdAt: "2026-10-29T00:00:00.000Z", expectedHeadRevisionId: "old-head", expectedHeadRootGraphHash: "c".repeat(64) };
  const key = studioReviewPreviewIntentKey(actor, intent);
  const subject: ProductionTaskOutputSubject = { schemaVersion: 1, workId: intent.workId, projectId: intent.projectId,
    artifactId: intent.artifactId, reviewId: `review-${key}`, revisionId: `review-snapshot-${key}`, rootGraphHash: digest };
  const previews = ["a", "b"].map((value, ordinal) => ({ ordinal, sha256: value.repeat(64) }));
  const payload = { intent, sourceSnapshot: doc, previews, sourceMapVersion: 1,
    pageRasters: previews.map((page) => ({ ...page, width: 1600, height: 2400 })) };
  const operation = { commandId: `review-capture-${key}`, type: "review.snapshot-create", payload };
  const revision = (id: string, kind: string) => ({ id, kind, artifactId: subject.artifactId, rootGraphHash: digest,
    operationFirst: sequence, operationLast: sequence, createdBy: actor, deviceId: intent.deviceId, createdAt: intent.createdAt });
  const rows = { pin: subject,
    capture: { artifactId: subject.artifactId, sequence, commandId: operation.commandId, baseRevisionId: intent.expectedHeadRevisionId,
      resultRevisionId: subject.revisionId, actorUserId: actor, deviceId: intent.deviceId, commandType: operation.type,
      payloadHash: studioReviewPreviewDigest(payload), operation },
    receipt: { actorUserId: actor, artifactId: subject.artifactId, resultRevisionId: subject.revisionId,
      idempotencyKeyHash: key, requestHash: studioReviewPreviewDigest({ intent, pages: previews }),
      response: { status: "completed", subject, fingerprint: studioReviewPreviewDigest(intent) } },
    snapshot: revision(subject.revisionId, "review-snapshot"), submission: revision(`review-submission-${key}`, "submission"),
    checkpoint: revision(`review-checkpoint-${key}`, "checkpoint"),
    base: { id: intent.expectedHeadRevisionId, artifactId: subject.artifactId, rootGraphHash: intent.expectedHeadRootGraphHash },
    snapshotParents: [{ ordinal: 0, parentRevisionId: `review-submission-${key}` }],
    submissionParents: [{ ordinal: 0, parentRevisionId: `review-checkpoint-${key}` }],
    checkpointParents: [{ ordinal: 0, parentRevisionId: intent.expectedHeadRevisionId }],
  };
  const blobs: StudioReviewPreviewBlobRow[] = previews.map(({ sha256, ordinal }) => {
    const object = { contractVersion: PRIVATE_OBJECT_STORAGE_CONTRACT_VERSION, providerId: "cloudflare-r2", purpose: "derived",
      digest: `sha256:${sha256}`, objectPath: `sha256/${sha256.slice(0, 2)}/${sha256}`, byteLength: 128, contentType: "image/png" };
    return { hash: sha256, ordinal, size: 128, mediaType: "image/png", objectKey: JSON.stringify(object),
      encryptionMetadata: null, malwareStatus: "clean", formatStatus: "valid", workStorageObject: object };
  });
  return { subject, rows, blobs };
}

describe("작업 산출물의 실제 캡처 원고 증명", () => {
  it("Graph의 유효한 slash·at 식별자도 같은 저장 원고 증명으로 읽는다", () => {
    const { subject, rows, blobs } = fixture("graph/project@one");
    expect(verifiedProductionTaskOutputCaptureFromRows("work", { subject }, [rows], blobs).subject.projectId).toBe("graph/project@one");
  });
  it("Graph 프로젝트 ID를 작품 연결로 검증하고 저장된 페이지·프레임만 반환한다", () => {
    const { subject, rows, blobs } = fixture();
    const before = structuredClone({ rows, blobs });
    expect(verifiedProductionTaskOutputCaptureFromRows("work", { subject }, [rows], blobs)).toEqual({
      subject, sourceServerRevision: 7, captureSequence: 13, createdAt: "2026-10-29T00:00:00.000Z",
      pages: [{ pageId: "page-one", ordinal: 0, sha256: "a".repeat(64), frameIds: ["frame-one"] },
        { pageId: "page-two", ordinal: 1, sha256: "b".repeat(64), frameIds: [] }],
    });
    expect({ rows, blobs }).toEqual(before);
  });
  it.each(["workId", "projectId", "artifactId", "reviewId", "revisionId", "rootGraphHash"] as const)("요청의 %s가 다른 원고이면 거절한다", (field) => {
    const { subject, rows, blobs } = fixture();
    expect(() => verifiedProductionTaskOutputCaptureFromRows("work", { subject: { ...subject, [field]: "other" } }, [rows], blobs)).toThrow(BadRequestException);
  });
  it("누락·복수 연결·미완료 영수증·잘못된 chain을 임의 첫행으로 대체하지 않는다", () => {
    const { subject, rows, blobs } = fixture();
    for (const alternatives of [[], [rows, rows], [{ ...rows, receipt: null }],
      [{ ...rows, submissionParents: [] }], [{ ...rows, capture: { ...rows.capture, sequence: Number.MAX_SAFE_INTEGER + 1 } }]]) {
      expect(() => verifiedProductionTaskOutputCaptureFromRows("work", { subject }, alternatives, blobs)).toThrow(BadRequestException);
    }
  });
  it("원고 이미지 누락·순서·해시·현재 객체 소유·검사 상태를 대조한다", () => {
    const { subject, rows, blobs } = fixture();
    const first = blobs[0], second = blobs[1];
    if (!first || !second) throw new Error("검증용 원고 두 페이지가 없습니다.");
    for (const alternatives of [[], [first], [second, first], [{ ...first, hash: "d".repeat(64) }, second],
      [{ ...first, workStorageObject: null }, second], [{ ...first, malwareStatus: "pending" }, second]]) {
      expect(() => verifiedProductionTaskOutputCaptureFromRows("work", { subject }, [rows], alternatives)).toThrow(BadRequestException);
    }
  });
  it("shared 증명 쿼리는 값과 배열을 SQL 문자열에 삽입하지 않고 parameter로 유지한다", () => {
    const artifact = "artifact' OR true--", review = "review' OR true--";
    const query = new PgDialect().sqlToQuery(studioReviewResolutionCaptureQuery(artifact, [review], false));
    expect(query.params).toEqual([artifact, [review], false]);
    expect(query.sql).not.toContain(artifact); expect(query.sql).not.toContain(review);
    expect(query.sql).toContain("ANY($2::text[])");
  });
});
