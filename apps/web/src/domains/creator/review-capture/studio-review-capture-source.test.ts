import { describe, expect, it } from "vitest";
import { studioReviewCaptureSourceFromSearch, studioReviewCaptureSourceHref, studioReviewCaptureSourceReturnHref } from "./studio-review-capture-source";

const source = { artifactId: "original-artifact", revisionId: "submitted-revision", rootGraphHash: "a".repeat(64) };
describe("제출 정본에서 고정 검수 이미지 생성으로 이동", () => {
  it("원본 tuple을 보존하고 생성 후 같은 작업 검수로 돌아간다", () => {
    const href = studioReviewCaptureSourceHref("work", source, { projectId: "production", taskId: "task" });
    const url = new URL(href, "https://toon.test");
    const request = studioReviewCaptureSourceFromSearch(url.search);
    expect(request).toEqual({ sourceRevision: source, returnContext: { projectId: "production", taskId: "task" } });
    if (!request) throw new Error("캡처 정본 요청이 없습니다.");
    expect(studioReviewCaptureSourceReturnHref(request)).toBe("/production/projects/production/review?task=task");
    expect(url.searchParams.get("artifact")).toBe("original-artifact");
  });
  it("중복·불완전한 tuple은 거부하고 복귀 식별자는 항상 내부 경로로 인코딩한다", () => {
    const url = new URL(studioReviewCaptureSourceHref("work", source), "https://toon.test");
    expect(studioReviewCaptureSourceFromSearch(`${url.search}&captureRevision=other`)).toBeNull();
    expect(studioReviewCaptureSourceFromSearch(url.search.replace("captureDigest=", "otherDigest="))).toBeNull();
    const request = studioReviewCaptureSourceFromSearch(`${url.search}&captureProductionProject=https%3A%2F%2Foutside.test&captureProductionTask=task`);
    expect(request && studioReviewCaptureSourceReturnHref(request)).toBe("/production/projects/https%3A%2F%2Foutside.test/review?task=task");
  });
});
