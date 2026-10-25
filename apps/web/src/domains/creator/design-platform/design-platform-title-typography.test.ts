import { describe, expect, it } from "vitest";

import {
  buildTitleLogoSvgMarkup,
  buildWarpBaselinePathD,
  computeWarpedGlyphTransforms,
  DESIGN_PLATFORM_TITLE_PRESETS,
  getWebtoonTitlePreset,
} from "./design-platform-title-typography";

describe("design-platform-title-typography", () => {
  it("8종 장르별 웹툰 타이틀·효과음 프리셋을 보유하고 정확히 조회한다", () => {
    expect(DESIGN_PLATFORM_TITLE_PRESETS).toHaveLength(8);
    const preset = getWebtoonTitlePreset("rofan-royal-gold");
    expect(preset.defaultWarpType).toBe("arc");
    expect(preset.effectKind).toBe("gold-emboss");
    expect(preset.extrusionDepthPx).toBeGreaterThan(0);
  });

  it("아치(arc), 물결(wave), 상승(rise) 등 워프 모드별 베이스라인 경로와 글자 좌표를 계산한다", () => {
    const arcPath = buildWarpBaselinePathD({
      warpType: "arc",
      intensity: 40,
      widthPx: 840,
      heightPx: 320,
    });
    expect(arcPath.pathD).toContain(" Q ");
    expect(arcPath.peakOffsetPx).toBeLessThan(0);

    const riseGlyphs = computeWarpedGlyphTransforms({
      text: "쿠구구궁",
      warpType: "rise",
      intensity: 60,
      widthPx: 840,
      heightPx: 320,
    });
    expect(riseGlyphs).toHaveLength(4);
    expect(riseGlyphs[0]?.char).toBe("쿠");
    expect(riseGlyphs[0]!.y).toBeGreaterThan(riseGlyphs[3]!.y);
  });

  it("3D 돌출·다중 외곽선·그라데이션이 포함된 완전한 독립형 SVG 타이틀 로고를 생성한다", () => {
    const output = buildTitleLogoSvgMarkup({
      mainTitle: "회귀자의 시계탑",
      subtitle: "SEASON 1",
      presetId: "action-hunter-slash",
      warpType: "slant",
      warpIntensity: 45,
    });

    expect(output.svgMarkup).toContain("<svg");
    expect(output.svgMarkup).toContain("linearGradient");
    expect(output.svgMarkup).toContain("회귀자의 시계탑");
    expect(output.contrastSummary.mobileThumbnailSafe).toBe(true);
  });
});
