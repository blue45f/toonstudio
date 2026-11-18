import { describe, expect, it } from "vitest";

import { compareWorkspaceText } from "./workspace-diff";

describe("사업계획 원문 비교", () => {
  it("공통 문맥을 보존하고 추가·삭제를 구분한다", () => {
    expect(compareWorkspaceText("제목\n이전 내용\n끝", "제목\n바뀐 내용\n끝")).toEqual({
      lines: [{ kind: "same", text: "제목" }, { kind: "removed", text: "이전 내용" }, { kind: "added", text: "바뀐 내용" }, { kind: "same", text: "끝" }],
      added: 1, removed: 1, omitted: 0, coarse: false,
    });
  });

  it("긴 원문을 누락 수와 함께 제한해 표시하고 원본 문자열은 바꾸지 않는다", () => {
    const before = Array.from({ length: 10_000 }, (_, index) => "이전 " + index).join("\n");
    const after = Array.from({ length: 10_000 }, (_, index) => "이후 " + index).join("\n");
    const result = compareWorkspaceText(before, after);
    expect(result).toMatchObject({ added: 10_000, removed: 10_000, omitted: 19_600, coarse: true });
    expect(result.lines).toHaveLength(400);
    expect(compareWorkspaceText(before, before)).toMatchObject({ added: 0, removed: 0, omitted: 9_600 });
  });
});
