import { describe, expect, it } from "vitest";

import { buildAuthorHandoverPackage } from "./studio-author-handover";

describe("studio-author-handover", () => {
  it("인계 패키지와 체크리스트를 만든다", () => {
    const result = buildAuthorHandoverPackage(
      {
        workId: "w1",
        workTitle: "우체통",
        outgoingAuthor: "김작가",
        incomingAuthor: "이작가",
        bibleSummary: "민지 설정",
        styleDnaProfileId: "style-1",
        referencePackId: "ref-1",
        inProgressCutIds: ["c1", "c2"],
        pendingReviewItems: ["채도 확인"],
      },
      9,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.handover.checklist).toContain(
      "진행 중 컷 2장의 상태를 인계한다",
    );
    expect(result.handover.checklist).toContain(
      "신규 작가 첫 작업 시 일관성 감사를 실행한다",
    );
    expect(result.handover.createdAt).toBe(9);
  });

  it("작가 정보가 없으면 거부한다", () => {
    expect(
      buildAuthorHandoverPackage({
        workId: "w1",
        workTitle: "우체통",
        outgoingAuthor: " ",
        incomingAuthor: "이작가",
        bibleSummary: null,
        styleDnaProfileId: null,
        referencePackId: null,
        inProgressCutIds: [],
        pendingReviewItems: [],
      }),
    ).toEqual({ ok: false, reason: "empty_authors" });
  });
});
