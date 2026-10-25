import { describe, expect, it } from "vitest";

import {
  applyColorizePalettePrompt,
  findColorizePalette,
  STUDIO_AI_COLORIZE_PALETTES,
} from "./studio-ai-colorize-palettes";

describe("studio-ai-colorize-palettes", () => {
  it("팔레트를 찾고 색감 문장을 덧붙인다", () => {
    const palette = findColorizePalette("pastel");
    expect(palette?.swatches).toHaveLength(4);
    expect(applyColorizePalettePrompt("셀 채색", "pastel")).toBe(
      "셀 채색, 파스텔 팔레트, 부드러운 채도",
    );
  });

  it("이미 들어 있는 팔레트 문장은 중복 추가하지 않는다", () => {
    expect(
      applyColorizePalettePrompt("파스텔 팔레트, 부드러운 채도", "pastel"),
    ).toBe("파스텔 팔레트, 부드러운 채도");
  });

  it("모르는 팔레트와 상한 초과에서는 기본 프롬프트를 지킨다", () => {
    expect(applyColorizePalettePrompt("채색", "nope")).toBe("채색");
    const base = "x".repeat(299);
    expect(applyColorizePalettePrompt(base, "pastel")).toBe(base);
  });

  it("팔레트 목록이 비어 있지 않다", () => {
    expect(STUDIO_AI_COLORIZE_PALETTES.length).toBeGreaterThan(0);
  });
});
