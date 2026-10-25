import { describe, expect, it } from "vitest";

import {
  convertReviewCommentToChecklist,
  groupReviewChecklistByCut,
} from "./studio-ai-review-checklist";

describe("studio-ai-review-checklist", () => {
  it("컷 번호와 동작을 규칙으로 뽑는다", () => {
    const items = convertReviewCommentToChecklist(
      "3컷 배경 채도를 낮춰줘\n대사 오타 확인",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      cutNumber: 3,
      action: "채도 조정",
    });
    expect(items[1]).toMatchObject({
      cutNumber: null,
      action: "대사 수정",
    });
  });

  it("규칙에 걸리지 않는 문장은 확인 필요로 남긴다", () => {
    const items = convertReviewCommentToChecklist("전체적으로 다시 봐줘");
    expect(items[0]?.action).toBe("확인 필요");
    expect(items[0]?.verbatim).toBe("전체적으로 다시 봐줘");
  });

  it("컷 번호별로 묶고 번호 없는 항목을 마지막에 둔다", () => {
    const items = convertReviewCommentToChecklist(
      "5컷 색 수정;2컷 선 수정;전체 확인",
    );
    const groups = groupReviewChecklistByCut(items);
    expect(groups.map((group) => group.cutNumber)).toEqual([2, 5, null]);
  });
});
