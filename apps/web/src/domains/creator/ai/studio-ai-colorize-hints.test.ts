import { describe, expect, it } from "vitest";

import {
  compileColorizeHintPrompt,
  selectedColorizeHintFragments,
} from "./studio-ai-colorize-hints";

describe("studio-ai-colorize-hints", () => {
  it("선택한 힌트를 프롬프트 문장으로 컴파일한다", () => {
    expect(
      compileColorizeHintPrompt("파스텔톤 채색", {
        hair: "brown",
        eyes: "blue",
      }),
    ).toBe("파스텔톤 채색, 머리색 갈색, 눈색 파랑");
  });

  it("이미 들어 있는 힌트는 중복 추가하지 않는다", () => {
    expect(
      compileColorizeHintPrompt("머리색 갈색 채색", { hair: "brown" }),
    ).toBe("머리색 갈색 채색");
  });

  it("모르는 그룹·옵션은 무시한다", () => {
    expect(
      selectedColorizeHintFragments({ hair: "nope", unknown: "brown" }),
    ).toEqual([]);
  });

  it("상한을 넘기면 뒤쪽 힌트를 빼서 기본 프롬프트를 지킨다", () => {
    const base = "x".repeat(299);
    const compiled = compileColorizeHintPrompt(base, { hair: "brown" });
    expect(compiled).toBe(base);
    expect(compiled.length).toBeLessThanOrEqual(300);
  });
});
