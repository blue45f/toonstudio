import { describe, expect, it } from "vitest";

import { selectStudioQuickBrushIdentity } from "./studio-quick-brush-interactions";

const option = (id: string | null, selected: string | null = "false", visible = true, disabled = false) =>
  ({ id, selected, visible, disabled });

describe("빠른 브러시의 실제 선택 전환 대상", () => {
  it("활성·숨은·비활성화 옵션을 제외하고 보이는 비활성 식별자를 고른다", () => {
    expect(selectStudioQuickBrushIdentity([
      option("pen", "true"), option("pencil", "false", false), option("unavailable", "false", true, true),
      option("pencil"), option("marker"),
    ])).toBe("pencil");
  });

  it.each([
    [option("pen"), option("pen")], [option(null)], [option("pen", null)],
    [], [option("pen", "true")], [option("pen", "false", false)], [option("pen", "false", true, true)],
  ])("유일하고 실행 가능한 선택 대상이 없으면 실패한다: %j", (...options) => {
    expect(() => selectStudioQuickBrushIdentity(options)).toThrow();
  });
});
