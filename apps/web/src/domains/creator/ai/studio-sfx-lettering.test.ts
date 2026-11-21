import { describe, expect, it } from "vitest";

import { SFX_LEXICON_DATABASE } from "../assistant/webtoon-sfx-lexicon";
import { SFX_OUTLINE_DIRECTION_OFFSETS, studioSfxLetteringStyle } from "../studio-sfx-lettering";

describe("studioSfxLetteringStyle", () => {
  it("글리프 색과 상하좌우·대각 완전 8방향 외곽선을 한 쌍으로 돌려준다", () => {
    const style = studioSfxLetteringStyle({ recommendedColor: "#ffffff", strokeColor: "#dc2626" });
    expect(style.color).toBe("#ffffff");
    const shadows = String(style.textShadow).split(", ");
    expect(shadows).toHaveLength(SFX_OUTLINE_DIRECTION_OFFSETS.length);
    expect(shadows).toEqual([
      "-1px 0px 0 #dc2626",
      "1px 0px 0 #dc2626",
      "0px -1px 0 #dc2626",
      "0px 1px 0 #dc2626",
      "-1px -1px 0 #dc2626",
      "1px -1px 0 #dc2626",
      "-1px 1px 0 #dc2626",
      "1px 1px 0 #dc2626",
    ]);
  });

  it("사용자 지정 외곽선 두께(strokeWidthPx)를 8방향에 동일 반영한다", () => {
    const style = studioSfxLetteringStyle({ recommendedColor: "#ffffff", strokeColor: "#0284c7" }, 2);
    expect(style.textShadow).toContain("-2px 0px 0 #0284c7");
    expect(style.textShadow).toContain("0px -2px 0 #0284c7");
    expect(style.textShadow).toContain("-2px -2px 0 #0284c7");
    expect(style.textShadow).toContain("2px 2px 0 #0284c7");
  });

  it("카탈로그의 흰색 글리프도 반드시 상하좌우 8방향 외곽선을 얻는다", () => {
    const whiteGlyphs = SFX_LEXICON_DATABASE.filter(
      (item) => item.recommendedColor.toLowerCase() === "#ffffff",
    );
    expect(whiteGlyphs.length).toBeGreaterThan(0);

    for (const item of whiteGlyphs) {
      const style = studioSfxLetteringStyle(item);
      const segments = String(style.textShadow).split(", ");
      expect(segments).toHaveLength(8);
      for (const segment of segments) {
        expect(segment).toContain(item.strokeColor);
      }
      expect(item.strokeColor.toLowerCase()).not.toBe("#ffffff");
    }
  });
});
