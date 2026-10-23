import { describe, expect, it } from "vitest";

import { ALL_RENDER_PASS_IDS, RENDER_PASS_IDS, RENDER_PASS_LABELS_KO, STYLE_RENDER_PASS_IDS, isRenderPassId, resolveSupportedPasses, unsupportedPasses } from "./passes";

describe("contracts/passes(레시피 v3 화풍 패스)", () => {
  it("기본 6종은 그대로이고 화풍 3종은 전체 어휘 끝에 붙는다", () => {
    expect([...RENDER_PASS_IDS]).toEqual(["flat", "lit", "normal", "depth", "part-id", "material-id"]);
    expect([...STYLE_RENDER_PASS_IDS]).toEqual(["lit-clean", "tone", "line"]);
    expect([...ALL_RENDER_PASS_IDS]).toEqual([...RENDER_PASS_IDS, ...STYLE_RENDER_PASS_IDS]);
    for (const pass of ALL_RENDER_PASS_IDS) {
      expect(isRenderPassId(pass)).toBe(true);
      expect(RENDER_PASS_LABELS_KO[pass]).toMatch(/[가-힣]/u);
    }
    expect(isRenderPassId("halftone")).toBe(false);
  });

  it("supportedPasses가 없는 엔진은 기본 6종만이고, 지원하지 않는 요청 패스를 대체 없이 알려 준다", () => {
    expect(resolveSupportedPasses(undefined)).toBe(RENDER_PASS_IDS);
    expect(unsupportedPasses(["lit", "tone", "line"], undefined)).toEqual(["tone", "line"]);
    expect(unsupportedPasses(["lit", "tone"], ALL_RENDER_PASS_IDS)).toEqual([]);
    expect(unsupportedPasses(["lit-clean"], ["lit", "lit-clean"])).toEqual([]);
  });
});
