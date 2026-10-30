import { studioEntityIdSchema, studioReviewTaskReferenceSchema } from "@toonstudio/studio-project-model";
import { describe, expect, it } from "vitest";

import { studioReviewCaptureSubjectSchema } from "./studio-review-capture-subject";
import { studioReviewPreviewSubjectSchema } from "./studio-review-preview";

const subject = { schemaVersion: 1, projectId: "graph/project@one", workId: "work-1",
  artifactId: "capture-1", reviewId: "review-1", revisionId: "snapshot-1", rootGraphHash: "a".repeat(64) };

describe("Graph 캡처 주체의 공용 식별 계약", () => {
  it("실제 Graph 식별자를 preview와 같은 계약으로 보존한다", () => {
    expect(studioEntityIdSchema.parse(subject.projectId)).toBe(subject.projectId);
    expect(studioReviewCaptureSubjectSchema.parse(subject)).toEqual(subject);
    expect(studioReviewPreviewSubjectSchema).toBe(studioReviewCaptureSubjectSchema);
  });

  it("기존 댓글·인계 task reference의 식별 계약은 확장하지 않는다", () => {
    expect(studioReviewTaskReferenceSchema.safeParse({ subject, commentId: "comment-1", handoffId: null }).success).toBe(false);
    expect(studioReviewTaskReferenceSchema.safeParse({ subject: { ...subject, projectId: "graph-project" },
      commentId: "comment-1", handoffId: null }).success).toBe(true);
  });

  it("주체의 필수 식별과 hash를 유지하고 임의 URL 필드를 받지 않는다", () => {
    for (const input of [{ ...subject, projectId: "invalid project" }, { ...subject, schemaVersion: 2 },
      { ...subject, rootGraphHash: "invalid" }, { ...subject, signedUrl: "https://example.test/private" }]) {
      expect(studioReviewCaptureSubjectSchema.safeParse(input).success).toBe(false);
    }
  });
});
