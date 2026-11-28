import { describe, expect, it } from "vitest";
import {
  ALL_VIEWER_THEME_IDS,
  VIEWER_THEME_PROFILES,
  auditEpisodeDualThemeReadability,
  buildDualThemePreviewWgsl,
  canonicalizeDualThemeJson,
  compositeSrgbOverBackground,
  computeApcaContrastLc,
  computeDualThemeManifestSha256Hex,
  computeOklabDeltaE,
  computeWcagContrastRatio,
  computeWcagRelativeLuminance,
  escapeDualThemeXml,
  evaluateColorPairContrast,
  formatOklchCss,
  getViewerThemeProfile,
  linearToSrgbChannel,
  oklchToSrgb,
  renderDualThemeAuditSvg,
  sha256DualThemeUtf8Hex,
  srgbChannelToLinear,
  srgbToOklch,
  summarizeDualThemeAuditKo,
  synthesizeThemeSafeRemediation,
  validateDualThemePreviewWgsl,
  type AuditedVisualElement,
  type DualThemePreviewMode,
  type EpisodeDualThemeInput,
  type SrgbColor,
} from "./index";

const PURE_BLACK = { r: 0, g: 0, b: 0 };
const PURE_WHITE = { r: 255, g: 255, b: 255 };

function singleCutEpisode(
  episodeId: string,
  elements: readonly AuditedVisualElement[],
  meanLuma = 0.5,
  cutBaseColor?: SrgbColor,
): EpisodeDualThemeInput {
  return {
    episodeId,
    episodeTitleKo: `검수 ${episodeId}`,
    cuts: [
      { cutId: "c1", cutIndex: 0, labelKo: "컷 1", meanLuma, cutBaseColor, gutterBeforePx: 0, elements },
    ],
  };
}

function createFiveDefectEpisode(): EpisodeDualThemeInput {
  return {
    episodeId: "ep-142-night-flash",
    episodeTitleKo: "제142화 심야 추격과 섬광",
    cuts: [
      {
        cutId: "cut-01",
        cutIndex: 0,
        labelKo: "심야 골목 잠복 컷",
        meanLuma: 0.03,
        cutBaseColor: { r: 6, g: 7, b: 10 },
        gutterBeforePx: 0,
        elements: [
          {
            id: "el-dark-sfx",
            labelKo: "검은 먹선 효과음 스윽",
            kind: "sfx-ink",
            backdropMode: "transparent-margin",
            foreground: { r: 12, g: 12, b: 16, a: 1 },
            strokeWidthPx: 2.8,
          },
          {
            id: "el-white-sfx",
            labelKo: "흰색 섬광 효과음 번쩍",
            kind: "sfx-ink",
            backdropMode: "transparent-margin",
            foreground: { r: 252, g: 251, b: 247, a: 1 },
            strokeWidthPx: 3.0,
          },
          {
            id: "el-night-contour",
            labelKo: "주인공 야간 망토 윤곽선",
            kind: "character-contour",
            backdropMode: "opaque-panel",
            foreground: { r: 8, g: 9, b: 12, a: 1 },
            localBackdrop: { r: 3, g: 3, b: 5 },
          },
        ],
      },
      {
        cutId: "cut-02",
        cutIndex: 1,
        labelKo: "순백 섬광탄 폭발 컷",
        meanLuma: 0.96,
        cutBaseColor: { r: 252, g: 252, b: 254 },
        gutterBeforePx: 60,
        elements: [
          {
            id: "el-balloon-low",
            labelKo: "속삭임 말풍선 대사",
            kind: "balloon-text",
            backdropMode: "balloon-fill",
            foreground: { r: 168, g: 170, b: 176, a: 1 },
            localBackdrop: { r: 244, g: 244, b: 246 },
            fontSizePx: 18,
          },
        ],
      },
    ],
  };
}

function createCleanEpisode(): EpisodeDualThemeInput {
  return {
    episodeId: "ep-142-clean",
    episodeTitleKo: "제142화 안전 검수 완료본",
    cuts: [
      {
        cutId: "cut-clean-1",
        cutIndex: 0,
        labelKo: "주간 실내 대화 컷",
        meanLuma: 0.48,
        cutBaseColor: { r: 182, g: 184, b: 190 },
        gutterBeforePx: 0,
        elements: [
          {
            id: "el-sfx-haloed",
            labelKo: "림 적용 먹선 효과음",
            kind: "sfx-ink",
            backdropMode: "transparent-margin",
            foreground: { r: 14, g: 14, b: 18, a: 1 },
            existingHalo: { widthPx: 3.0, color: { r: 250, g: 248, b: 244, a: 0.98 } },
          },
          {
            id: "el-balloon-ok",
            labelKo: "선명한 표준 대사",
            kind: "balloon-text",
            backdropMode: "balloon-fill",
            foreground: { r: 16, g: 16, b: 20, a: 1 },
            localBackdrop: { r: 254, g: 254, b: 252 },
          },
        ],
      },
      {
        cutId: "cut-clean-2",
        cutIndex: 1,
        labelKo: "주간 복도 이동 컷",
        meanLuma: 0.62,
        cutBaseColor: { r: 205, g: 206, b: 210 },
        gutterBeforePx: 160,
        elements: [],
      },
    ],
  };
}

describe("Wave 142 — 독자 뷰어 광도·WCAG 2.1·APCA·OKLab 색채 수학", () => {
  it("1. 4종 독자 뷰어 배경 프로파일의 sRGB 규격과 OKLCH 표현을 정확히 제공한다", () => {
    expect(ALL_VIEWER_THEME_IDS).toEqual(["light-paper", "sepia-night", "dark-slate", "oled-true-black"]);
    expect(getViewerThemeProfile("light-paper").backgroundSrgb).toEqual({ r: 255, g: 255, b: 255 });
    expect(getViewerThemeProfile("sepia-night").backgroundSrgb).toEqual({ r: 244, g: 236, b: 216 });
    expect(getViewerThemeProfile("dark-slate").backgroundSrgb).toEqual({ r: 18, g: 18, b: 22 });
    expect(getViewerThemeProfile("oled-true-black").backgroundSrgb).toEqual({ r: 0, g: 0, b: 0 });
    expect(VIEWER_THEME_PROFILES["oled-true-black"].isDark).toBe(true);
    expect(VIEWER_THEME_PROFILES["oled-true-black"].isOledTrueBlack).toBe(true);
    expect(VIEWER_THEME_PROFILES["light-paper"].oklchCss).toMatch(/^oklch\(/);
  });

  it("2. IEC 61966-2-1 sRGB와 선형광도 왕복 변환 및 비정상 채널 클램프가 정확하다", () => {
    for (const ch of [0, 10, 42, 128, 210, 255]) {
      expect(linearToSrgbChannel(srgbChannelToLinear(ch))).toBeCloseTo(ch, 5);
    }
    expect(srgbChannelToLinear(Number.NaN)).toBe(0);
    expect(srgbChannelToLinear(-40)).toBe(0);
    expect(srgbChannelToLinear(400)).toBe(1);
    expect(computeWcagRelativeLuminance(PURE_BLACK)).toBe(0);
    expect(computeWcagRelativeLuminance(PURE_WHITE)).toBeCloseTo(1, 6);
  });

  it("3. WCAG 2.1 대비비는 흑/백 21:1, 대칭성, 동일색 1:1을 정확히 만족한다", () => {
    expect(computeWcagContrastRatio(PURE_BLACK, PURE_WHITE)).toBeCloseTo(21.0, 6);
    expect(computeWcagContrastRatio(PURE_WHITE, PURE_BLACK)).toBeCloseTo(21.0, 6);
    expect(computeWcagContrastRatio(PURE_BLACK, PURE_BLACK)).toBeCloseTo(1.0, 6);
    expect(computeWcagContrastRatio({ r: 120, g: 90, b: 200 }, { r: 120, g: 90, b: 200 })).toBeCloseTo(1.0, 6);
  });

  it("4. APCA-W3 Lc는 BoW 양수 극성과 WoB 음수 극성 및 동일색 0을 정확히 구분한다", () => {
    const bow = computeApcaContrastLc(PURE_BLACK, PURE_WHITE);
    const wob = computeApcaContrastLc(PURE_WHITE, PURE_BLACK);
    expect(bow).toBeGreaterThan(105);
    expect(bow).toBeLessThan(107);
    expect(wob).toBeLessThan(-106);
    expect(wob).toBeGreaterThan(-109);
    expect(computeApcaContrastLc({ r: 88, g: 88, b: 88 }, { r: 88, g: 88, b: 88 })).toBe(0);
  });

  it("5. APCA-W3는 중간 회색 쌍에서 BoW와 WoB 지각 극성 비대칭을 반영한다", () => {
    const mid = { r: 128, g: 128, b: 128 };
    const darkOnMid = computeApcaContrastLc(PURE_BLACK, mid);
    const midOnDark = computeApcaContrastLc(mid, PURE_BLACK);
    expect(darkOnMid).toBeGreaterThan(0);
    expect(midOnDark).toBeLessThan(0);
    expect(Math.abs(darkOnMid)).not.toBeCloseTo(Math.abs(midOnDark), 1);
  });

  it("6. Björn Ottosson OKLab/OKLCH 왕복 변환과 ΔE 지각 거리 공리를 만족한다", () => {
    const sample = { r: 58, g: 124, b: 196 };
    const roundTrip = oklchToSrgb(srgbToOklch(sample));
    expect(roundTrip.r).toBeCloseTo(sample.r, 1);
    expect(roundTrip.g).toBeCloseTo(sample.g, 1);
    expect(roundTrip.b).toBeCloseTo(sample.b, 1);
    expect(computeOklabDeltaE(PURE_BLACK, PURE_WHITE)).toBeCloseTo(1.0, 4);
    expect(computeOklabDeltaE(sample, sample)).toBe(0);
    expect(computeOklabDeltaE(PURE_BLACK, sample) + computeOklabDeltaE(sample, PURE_WHITE))
      .toBeGreaterThanOrEqual(computeOklabDeltaE(PURE_BLACK, PURE_WHITE) - 1e-6);
  });

  it("7. formatOklchCss는 원시 hex/rgb/hsl 없이 순수 oklch(...) 문자열만 출력한다", () => {
    const css = formatOklchCss({ l: 0.72, c: 0.08, h: -30 }, 0.92);
    expect(css).toMatch(/^oklch\(0\.7200 0\.0800 330\.0 \/ 0\.920\)$/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\brgba?\s*\(/i);
    expect(css).not.toMatch(/\bhsla?\s*\(/i);
  });

  it("8. 알파 합성기는 alpha=0, 1, 0.5에서 라이트 vs OLED 배경 합성 결과를 정확히 계산한다", () => {
    const fg = { r: 20, g: 20, b: 24, a: 0.5 };
    expect(compositeSrgbOverBackground({ ...fg, a: 0 }, PURE_WHITE)).toEqual(PURE_WHITE);
    expect(compositeSrgbOverBackground({ ...fg, a: 1 }, PURE_WHITE)).toEqual({ r: 20, g: 20, b: 24 });
    expect(compositeSrgbOverBackground(fg, PURE_WHITE).r).toBeCloseTo(137.5, 4);
    expect(compositeSrgbOverBackground(fg, PURE_BLACK).r).toBeCloseTo(10, 4);
  });

  it("9. 알파 합성기의 linear 블렌딩 모드는 sRGB 감마 합성보다 물리 중간 휘도를 정확히 반영한다", () => {
    const halfWhite = { r: 255, g: 255, b: 255, a: 0.5 };
    const srgbBlend = compositeSrgbOverBackground(halfWhite, PURE_BLACK, "srgb");
    const linearBlend = compositeSrgbOverBackground(halfWhite, PURE_BLACK, "linear");
    expect(srgbBlend.r).toBeCloseTo(127.5, 4);
    expect(linearBlend.r).toBeGreaterThan(180);
    expect(computeWcagRelativeLuminance(linearBlend)).toBeCloseTo(0.5, 2);
  });

  it("10. evaluateColorPairContrast가 극성·WCAG·APCA·OKLab ΔE를 일관되게 반환한다", () => {
    const bow = evaluateColorPairContrast({ r: 15, g: 15, b: 20 }, PURE_WHITE);
    const wob = evaluateColorPairContrast({ r: 245, g: 245, b: 245 }, PURE_BLACK);
    const same = evaluateColorPairContrast({ r: 90, g: 90, b: 90 }, { r: 90, g: 90, b: 90 });
    expect(bow.polarity).toBe("dark-on-light");
    expect(wob.polarity).toBe("light-on-dark");
    expect(same.polarity).toBe("neutral");
    expect(bow.wcagRatio).toBeGreaterThan(17);
    expect(wob.apcaAbsLc).toBeGreaterThan(100);
  });
});

describe("Wave 142 — 5종 양면 뷰어 치명 결함 감사 (auditEpisodeDualThemeReadability)", () => {
  it("11. OLED/다크 뷰어 위 투명 여백 검은 먹선 SFX 사라짐(dark-mode-ink-vanish)을 탐지한다", () => {
    const report = auditEpisodeDualThemeReadability(
      singleCutEpisode("ep-dark-sfx", [
        { id: "sfx-black", labelKo: "먹선 쾅!", kind: "sfx-ink", backdropMode: "transparent-margin", foreground: { r: 10, g: 10, b: 14, a: 1 } },
      ]),
    );
    expect(report.countsByCode["dark-mode-ink-vanish"]).toBe(1);
    expect(report.countsByCode["light-mode-highlight-vanish"]).toBe(0);
    expect(report.defects[0]?.affectedThemes).toEqual(["dark-slate", "oled-true-black"]);
    expect(report.elementAudits[0]?.perTheme["light-paper"].passed).toBe(true);
    expect(report.elementAudits[0]?.perTheme["oled-true-black"].passed).toBe(false);
  });

  it("12. 투명 여백 위 어두운 말풍선 꼬리와 컷 테두리의 다크모드 매몰도 탐지한다", () => {
    const report = auditEpisodeDualThemeReadability(
      singleCutEpisode("ep-tail-border", [
        { id: "tail-1", labelKo: "검정 말풍선 꼬리", kind: "balloon-tail", backdropMode: "transparent-margin", foreground: { r: 15, g: 15, b: 18, a: 1 } },
        { id: "border-1", labelKo: "짙은 컷 테두리", kind: "panel-border", backdropMode: "transparent-margin", foreground: { r: 22, g: 22, b: 26, a: 1 } },
      ]),
    );
    expect(report.countsByCode["dark-mode-ink-vanish"]).toBe(2);
  });

  it("13. 라이트/세피아 뷰어 위 투명 여백 흰색 SFX 사라짐(light-mode-highlight-vanish)을 탐지한다", () => {
    const report = auditEpisodeDualThemeReadability(
      singleCutEpisode("ep-light-sfx", [
        { id: "sfx-white", labelKo: "흰색 슉!", kind: "sfx-ink", backdropMode: "transparent-margin", foreground: { r: 250, g: 248, b: 244, a: 1 } },
      ]),
    );
    expect(report.countsByCode["light-mode-highlight-vanish"]).toBe(1);
    expect(report.countsByCode["dark-mode-ink-vanish"]).toBe(0);
    expect(report.defects[0]?.affectedThemes).toEqual(["light-paper", "sepia-night"]);
    expect(report.elementAudits[0]?.perTheme["oled-true-black"].passed).toBe(true);
  });

  it("14. 야간 컷 내 초암부 인물 윤곽선(Y < 0.015) OLED 블랙 크러시(oled-black-crush-shadow)를 탐지한다", () => {
    const report = auditEpisodeDualThemeReadability(
      singleCutEpisode(
        "ep-crush",
        [{ id: "hero-contour", labelKo: "검정 코트 윤곽선", kind: "character-contour", backdropMode: "opaque-panel", foreground: { r: 10, g: 10, b: 14, a: 1 }, localBackdrop: { r: 2, g: 2, b: 4 } }],
        0.03,
        { r: 4, g: 4, b: 6 },
      ),
    );
    expect(report.countsByCode["oled-black-crush-shadow"]).toBe(1);
    expect(report.defects[0]?.code).toBe("oled-black-crush-shadow");
  });

  it("15. 충분한 밝기와 대비를 갖춘 야간 인물 윤곽선은 블랙 크러시 오탐 없이 통과한다", () => {
    const report = auditEpisodeDualThemeReadability(
      singleCutEpisode(
        "ep-no-crush",
        [{ id: "hero-lit", labelKo: "달빛 반사 윤곽선", kind: "character-contour", backdropMode: "opaque-panel", foreground: { r: 165, g: 180, b: 205, a: 1 }, localBackdrop: { r: 6, g: 6, b: 10 } }],
        0.05,
        { r: 6, g: 6, b: 10 },
      ),
    );
    expect(report.countsByCode["oled-black-crush-shadow"]).toBe(0);
    expect(report.allFourThemesPassed).toBe(true);
  });

  it("16. 어두운 야간 컷 직후 순백 플래시 컷 급전환(ΔLuma > 0.72) 눈부심을 탐지한다", () => {
    const report = auditEpisodeDualThemeReadability({
      episodeId: "ep-shock",
      episodeTitleKo: "눈부심 급전환 테스트",
      cuts: [
        { cutId: "n1", cutIndex: 0, labelKo: "칠흑 동굴", meanLuma: 0.03, gutterBeforePx: 0, elements: [] },
        { cutId: "f2", cutIndex: 1, labelKo: "순백 플래시", meanLuma: 0.95, gutterBeforePx: 40, elements: [] },
      ],
    });
    expect(report.countsByCode["luminance-shock-transition"]).toBe(1);
    expect(report.cutTransitions[0]?.isLuminanceShock).toBe(true);
    expect(report.cutTransitions[0]?.deltaLuma).toBeCloseTo(0.92, 4);
  });

  it("17. 완만한 명암 변화나 밝음->어두움 역전환은 눈부심으로 오탐하지 않는다", () => {
    const report = auditEpisodeDualThemeReadability({
      episodeId: "ep-no-shock",
      episodeTitleKo: "정상 명암 전환",
      cuts: [
        { cutId: "c1", cutIndex: 0, labelKo: "야간 도입", meanLuma: 0.04, gutterBeforePx: 0, elements: [] },
        { cutId: "c2", cutIndex: 1, labelKo: "중간톤 전환", meanLuma: 0.52, gutterBeforePx: 80, elements: [] },
        { cutId: "c3", cutIndex: 2, labelKo: "순백 회상", meanLuma: 0.94, gutterBeforePx: 80, elements: [] },
        { cutId: "c4", cutIndex: 3, labelKo: "암전 엔딩", meanLuma: 0.02, gutterBeforePx: 80, elements: [] },
      ],
    });
    expect(report.countsByCode["luminance-shock-transition"]).toBe(0);
    expect(report.allFourThemesPassed).toBe(true);
  });

  it("18. 말풍선 대사 대비 미달(WCAG < 4.5 또는 |APCA Lc| < 60)을 탐지한다", () => {
    const report = auditEpisodeDualThemeReadability(
      singleCutEpisode("ep-balloon-fail", [
        { id: "b1", labelKo: "옅은 회색 대사", kind: "balloon-text", backdropMode: "balloon-fill", foreground: { r: 150, g: 150, b: 155, a: 1 }, localBackdrop: { r: 245, g: 245, b: 248 } },
      ]),
    );
    expect(report.countsByCode["balloon-text-contrast-fail"]).toBe(1);
  });

  it("19. 선명한 말풍선 대사는 4종 뷰어 전체에서 통과한다", () => {
    const report = auditEpisodeDualThemeReadability(
      singleCutEpisode("ep-balloon-pass", [
        { id: "b1", labelKo: "진한 먹색 대사", kind: "balloon-text", backdropMode: "balloon-fill", foreground: { r: 18, g: 18, b: 22, a: 1 }, localBackdrop: { r: 254, g: 254, b: 252 } },
      ]),
    );
    expect(report.countsByCode["balloon-text-contrast-fail"]).toBe(0);
    expect(report.allFourThemesPassed).toBe(true);
  });

  it("20. 5종 치명 결함이 모두 포함된 실전 에피소드에서 5개 코드 전부를 정확히 집계한다", () => {
    const report = auditEpisodeDualThemeReadability(createFiveDefectEpisode());
    expect(report.countsByCode["dark-mode-ink-vanish"]).toBe(1);
    expect(report.countsByCode["light-mode-highlight-vanish"]).toBe(1);
    expect(report.countsByCode["oled-black-crush-shadow"]).toBe(1);
    expect(report.countsByCode["luminance-shock-transition"]).toBe(1);
    expect(report.countsByCode["balloon-text-contrast-fail"]).toBe(1);
    expect(report.defects).toHaveLength(5);
    expect(report.allFourThemesPassed).toBe(false);
  });
});

describe("Wave 142 — 비파괴 자동 교정 솔버 (synthesizeThemeSafeRemediation)", () => {
  it("21. 검은 먹선 SFX에 밝은 OKLCH 외곽선 림을 비파괴 부여하고 원본 입력을 변경하지 않는다", () => {
    const input = singleCutEpisode("ep-fix-dark", [
      { id: "sfx-1", labelKo: "검정 쿵!", kind: "sfx-ink", backdropMode: "transparent-margin", foreground: { r: 12, g: 12, b: 16, a: 1 } },
    ]);
    const snapshot = JSON.stringify(input);
    const res = synthesizeThemeSafeRemediation(input);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(res.elementPatches[0]?.strategy).toBe("stroke-halo");
    expect(res.elementPatches[0]?.haloColorOklch).toMatch(/^oklch\(/);
    expect(res.verification.vanishCountAfter).toBe(0);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
  });

  it("22. 흰색 밝은 SFX에 짙은 먹색 OKLCH 외곽선 림을 부여해 4종 뷰어 모두 통과시킨다", () => {
    const res = synthesizeThemeSafeRemediation(
      singleCutEpisode("ep-fix-light", [
        { id: "sfx-white", labelKo: "흰색 반짝", kind: "sfx-ink", backdropMode: "transparent-margin", foreground: { r: 253, g: 252, b: 248, a: 1 } },
      ]),
    );
    expect(res.elementPatches[0]?.strategy).toBe("stroke-halo");
    expect(res.verification.vanishCountBefore).toBe(1);
    expect(res.verification.vanishCountAfter).toBe(0);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
  });

  it("23. OLED 블랙 크러시에 달빛 림 라이트를 적용해 암부 뭉개짐을 0건으로 해소한다", () => {
    const res = synthesizeThemeSafeRemediation(
      singleCutEpisode(
        "ep-fix-crush",
        [{ id: "contour-1", labelKo: "암부 망토선", kind: "character-contour", backdropMode: "opaque-panel", foreground: { r: 8, g: 8, b: 12, a: 1 }, localBackdrop: { r: 3, g: 3, b: 5 } }],
        0.02,
        { r: 4, g: 4, b: 6 },
      ),
    );
    expect(res.elementPatches[0]?.strategy).toBe("rim-light-halo");
    expect(res.verification.blackCrushCountBefore).toBe(1);
    expect(res.verification.blackCrushCountAfter).toBe(0);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
  });

  it("24. 눈부심 급전환 거터에 6단계 OKLCH 완충 그라데이션을 삽입해 눈부심을 0건으로 해소한다", () => {
    const res = synthesizeThemeSafeRemediation({
      episodeId: "ep-fix-shock",
      episodeTitleKo: "눈부심 완충",
      cuts: [
        { cutId: "n1", cutIndex: 0, labelKo: "야간 컷", meanLuma: 0.02, gutterBeforePx: 0, elements: [] },
        { cutId: "f2", cutIndex: 1, labelKo: "섬광 컷", meanLuma: 0.96, gutterBeforePx: 40, elements: [] },
      ],
    });
    expect(res.gutterRamps).toHaveLength(1);
    expect(res.gutterRamps[0]?.recommendedGutterHeightPx).toBeGreaterThanOrEqual(360);
    expect(res.gutterRamps[0]?.maxStepDeltaLuma).toBeLessThanOrEqual(0.24);
    expect(res.gutterRamps[0]?.gradientStopsOklch.every((s) => s.startsWith("oklch("))).toBe(true);
    expect(res.verification.luminanceShockCountBefore).toBe(1);
    expect(res.verification.luminanceShockCountAfter).toBe(0);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
  });

  it("25. 까다로운 중간 회색 말풍선 대사도 보정 후 4종 뷰어 모두 WCAG 4.5+ 및 APCA 60+를 통과한다", () => {
    const res = synthesizeThemeSafeRemediation(
      singleCutEpisode("ep-midgray-balloon", [
        { id: "b-mid", labelKo: "중간 회색 회상 대사", kind: "balloon-text", backdropMode: "balloon-fill", foreground: { r: 128, g: 128, b: 130, a: 1 }, localBackdrop: { r: 225, g: 225, b: 228 } },
      ]),
    );
    expect(res.verification.balloonFailCountBefore).toBe(1);
    expect(res.verification.balloonFailCountAfter).toBe(0);
    expect(res.verification.minWcagAcrossAllThemesAfter).toBeGreaterThanOrEqual(4.5);
    expect(res.verification.minApcaAbsLcAcrossAllThemesAfter).toBeGreaterThanOrEqual(60);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
  });

  it("26. 5종 복합 결함 에피소드 일괄 교정 시 4종 뷰어 사라짐 0건·전체 결함 0건을 수학적으로 입증한다", () => {
    const res = synthesizeThemeSafeRemediation(createFiveDefectEpisode());
    expect(res.verification.beforeDefectCount).toBe(5);
    expect(res.verification.afterDefectCount).toBe(0);
    expect(res.verification.vanishCountAfter).toBe(0);
    expect(res.verification.blackCrushCountAfter).toBe(0);
    expect(res.verification.luminanceShockCountAfter).toBe(0);
    expect(res.verification.balloonFailCountAfter).toBe(0);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
    expect(res.afterAudit.overallReadinessScore).toBe(100);
    for (const summary of res.afterAudit.themeSummaries) {
      expect(summary.failedElementCount).toBe(0);
      expect(summary.shockCount).toBe(0);
      expect(summary.readinessScore).toBe(100);
    }
  });

  it("27. 반투명 고스트 효과음(alpha=0.35)과 중간톤 투명 여백 자막도 보정 후 4종 전수 통과한다", () => {
    const res = synthesizeThemeSafeRemediation(
      singleCutEpisode("ep-ghost-sfx", [
        { id: "ghost-sfx", labelKo: "반투명 속삭임 효과음", kind: "sfx-ink", backdropMode: "transparent-margin", foreground: { r: 120, g: 122, b: 128, a: 0.35 } },
      ]),
    );
    expect(res.beforeAudit.defects.length).toBeGreaterThanOrEqual(1);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
    expect(res.verification.afterDefectCount).toBe(0);
  });

  it("28. 이미 깨끗한 에피소드에는 불필요한 보정 패치를 생성하지 않는다", () => {
    const res = synthesizeThemeSafeRemediation(createCleanEpisode());
    expect(res.verification.beforeDefectCount).toBe(0);
    expect(res.verification.afterDefectCount).toBe(0);
    expect(res.elementPatches).toHaveLength(0);
    expect(res.gutterRamps).toHaveLength(0);
    expect(res.verification.allFourThemesVerifiedPass).toBe(true);
  });

  it("29. 빈 컷 배열과 단일 컷 에피소드에서도 크래시·NaN 없이 안전하게 동작한다", () => {
    const emptyRes = synthesizeThemeSafeRemediation({ episodeId: "ep-empty", episodeTitleKo: "빈 에피소드", cuts: [] });
    expect(emptyRes.verification.allFourThemesVerifiedPass).toBe(true);
    expect(emptyRes.afterAudit.overallReadinessScore).toBe(100);
    expect(emptyRes.afterAudit.dualThemeAuditSha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("Wave 142 — FIPS 180-4 SHA-256 · WebGPU WGSL · 순수 OKLCH SVG · 한국어 QA", () => {
  it("30. 순수 ES2017 FIPS 180-4 SHA-256이 NIST 공식 테스트 벡터 및 한글 UTF-8을 정확히 계산한다", () => {
    expect(sha256DualThemeUtf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256DualThemeUtf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const ko1 = sha256DualThemeUtf8Hex("웹툰 OLED 다크모드 시인성 감사");
    expect(ko1).toBe(sha256DualThemeUtf8Hex("웹툰 OLED 다크모드 시인성 감사"));
    expect(ko1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("31. 정규 JSON 지문은 키 순서와 무관하고 에피소드 수치 1건 변경에도 결정론적으로 변화한다", () => {
    expect(canonicalizeDualThemeJson({ b: 2, a: 1 })).toBe(canonicalizeDualThemeJson({ a: 1, b: 2 }));
    expect(computeDualThemeManifestSha256Hex({ x: 1, y: 2 })).toBe(computeDualThemeManifestSha256Hex({ y: 2, x: 1 }));
    const epA = createFiveDefectEpisode();
    const epB: EpisodeDualThemeInput = {
      ...epA,
      cuts: epA.cuts.map((c, idx) => (idx === 1 ? { ...c, meanLuma: 0.91 } : c)),
    };
    const rA1 = auditEpisodeDualThemeReadability(epA);
    expect(rA1.dualThemeAuditSha256Hex).toBe(auditEpisodeDualThemeReadability(epA).dualThemeAuditSha256Hex);
    expect(rA1.dualThemeAuditSha256Hex).not.toBe(auditEpisodeDualThemeReadability(epB).dualThemeAuditSha256Hex);
  });

  it("32. buildDualThemePreviewWgsl의 4종 프리뷰 모드 모두 64B(16B 정렬) 유효 WGSL을 생성한다", () => {
    const modes: readonly DualThemePreviewMode[] = [
      "split-light-oled",
      "quad-theme-matrix",
      "luminance-shock-heatmap",
      "auto-halo-remediation",
    ];
    for (const mode of modes) {
      const artifact = buildDualThemePreviewWgsl(mode);
      expect(artifact.uniformBufferByteLength).toBe(64);
      expect(artifact.uniformBufferByteLength % 16).toBe(0);
      expect(artifact.bindings).toHaveLength(5);
      const validation = validateDualThemePreviewWgsl(artifact);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
    }
  });

  it("33. validateDualThemePreviewWgsl이 정렬 위반·바인딩 누락·괄호 파손·NaN·GLSL 금지어를 모두 차단한다", () => {
    const base = buildDualThemePreviewWgsl("split-light-oled");
    expect(validateDualThemePreviewWgsl({ ...base, uniformBufferByteLength: 52 }).valid).toBe(false);

    const brokenGlsl = validateDualThemePreviewWgsl({
      ...base,
      wgsl: `${base.wgsl}\n// gl_FragCoord sampler2D vec4(1.0)\nuniform float bad;`,
    });
    expect(brokenGlsl.valid).toBe(false);
    expect(brokenGlsl.errors.length).toBeGreaterThanOrEqual(3);

    const brokenBrace = validateDualThemePreviewWgsl({
      ...base,
      wgsl: `${base.wgsl}\nfn broken( { let x = NaN;`,
    });
    expect(brokenBrace.valid).toBe(false);
    expect(brokenBrace.errors.some((e) => e.includes("NaN"))).toBe(true);
    expect(brokenBrace.errors.some((e) => e.includes("괄호"))).toBe(true);
  });

  it("34. renderDualThemeAuditSvg가 좌측 라이트·우측 OLED 분할 프리뷰와 휘도 곡선·대비 배지를 포함한다", () => {
    const svg = renderDualThemeAuditSvg(synthesizeThemeSafeRemediation(createFiveDefectEpisode()));
    expect(svg).toContain("<svg");
    expect(svg).toContain('data-layer="light-paper-preview"');
    expect(svg).toContain('data-layer="oled-true-black-preview"');
    expect(svg).toContain('data-layer="luminance-shock-curve"');
    expect(svg).toContain('data-layer="contrast-remediation-badges"');
    expect(svg).toContain('data-remediation="halo"');
    expect(svg).toContain('data-ramp-gutter="cut-02"');
  });

  it("35. renderDualThemeAuditSvg 출력은 100% 순수 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl·NaN이 0건이다", () => {
    const svg = renderDualThemeAuditSvg(synthesizeThemeSafeRemediation(createFiveDefectEpisode()));
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("36. showRemediationPreview=false 옵션은 보정 전 원본 컷을 렌더링해 전/후 비교를 지원한다", () => {
    const res = synthesizeThemeSafeRemediation(createFiveDefectEpisode());
    expect(renderDualThemeAuditSvg(res, { showRemediationPreview: false })).not.toContain('data-ramp-gutter="cut-02"');
    expect(renderDualThemeAuditSvg(res, { showRemediationPreview: true })).toContain('data-ramp-gutter="cut-02"');
  });

  it("37. renderDualThemeAuditSvg와 escapeDualThemeXml이 악성 XSS/XML 마크업을 완전히 이스케이프한다", () => {
    const xssTitle = `<script>alert("xss")</script> & 'quote'`;
    expect(escapeDualThemeXml(xssTitle)).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;quote&apos;");
    const ep = createFiveDefectEpisode();
    const res = synthesizeThemeSafeRemediation({ ...ep, episodeTitleKo: xssTitle });
    const svg = renderDualThemeAuditSvg(res, { title: xssTitle });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("38. summarizeDualThemeAuditKo가 4종 뷰어·결함 전후 집계·실무 한국어 QA 브리프를 생성한다", () => {
    const qa = summarizeDualThemeAuditKo(synthesizeThemeSafeRemediation(createFiveDefectEpisode()));
    expect(qa.releaseStatus).toBe("remediated-ready");
    expect(qa.defectBreakdownKo).toHaveLength(5);
    expect(qa.themeReadinessKo).toHaveLength(4);
    expect(qa.checklistKo).toHaveLength(5);
    expect(qa.appliedFixesKo.length).toBeGreaterThanOrEqual(4);
    expect(qa.summaryParagraphKo).not.toMatch(/가능하게 합니다|제공합니다|보장합니다/);

    const cleanQa = summarizeDualThemeAuditKo(synthesizeThemeSafeRemediation(createCleanEpisode()));
    expect(cleanQa.releaseStatus).toBe("ready-for-export");
  });
});
