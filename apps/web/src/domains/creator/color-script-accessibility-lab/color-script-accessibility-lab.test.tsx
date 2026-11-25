// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CVD_TYPE_METADATA,
  DUAL_VIEWER_PANEL_PRESETS,
  EPISODE_EMOTION_ARC_PRESETS,
  HARMONY_RULES,
  MOBILE_DARK_VIEWER_BG_HEX,
  MOBILE_LIGHT_VIEWER_BG_HEX,
  StudioColorScriptLabPanel,
  WEBTOON_CVD_AUDIT_PAIRS,
  auditDualViewerReadability,
  buildEpisodeColorScriptArc,
  computeCiede2000,
  computeRelativeLuminance,
  evaluateColorPairAccessibility,
  linearSrgbToLms,
  lmsToLinearSrgb,
  oklchToSrgb,
  parseHexToSrgb,
  simulateColorVisionDeficiency,
  srgbToHex,
  srgbToLinear,
  srgbToOklch,
  suggestSafeAlternativeColor,
  type ColorVisionDeficiencyType,
  type RgbColor,
} from "./index";

afterEach(cleanup);

function maxChannelDelta(a: RgbColor, b: RgbColor): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

describe("1. 색공간 정밀 변환 · OKLCH 게멋 매핑 · CIEDE2000", () => {
  it("Linear sRGB ↔ LMS 가역 오차가 1e-6 미만이며 D65 백색이 LMS(1,1,1)에 정확히 매핑된다", () => {
    const samples: readonly RgbColor[] = [
      { r: 0, g: 0, b: 0 },
      { r: 1, g: 1, b: 1 },
      { r: 1, g: 0, b: 0 },
      { r: 0, g: 1, b: 0 },
      { r: 0, g: 0, b: 1 },
      { r: 0.72, g: 0.35, b: 0.19 },
    ];
    for (const c of samples) {
      const lin = srgbToLinear(c);
      const back = lmsToLinearSrgb(linearSrgbToLms(lin));
      expect(maxChannelDelta(lin, back)).toBeLessThan(1e-6);
      expect(maxChannelDelta(c, parseHexToSrgb(srgbToHex(c)))).toBeLessThan(0.004);
    }

    const whiteLms = linearSrgbToLms({ r: 1, g: 1, b: 1 });
    expect(Math.abs(whiteLms.l - 1)).toBeLessThan(1e-6);
    expect(Math.abs(whiteLms.m - 1)).toBeLessThan(1e-6);
    expect(Math.abs(whiteLms.s - 1)).toBeLessThan(1e-6);
  });

  it("sRGB ↔ OKLCH 왕복 오차가 1e-4 미만이며 초과 채도 OKLCH는 명도·색상각을 보존해 sRGB로 매핑된다", () => {
    const color: RgbColor = { r: 0.32, g: 0.58, b: 0.81 };
    const roundtrip = oklchToSrgb(srgbToOklch(color));
    expect(maxChannelDelta(color, roundtrip)).toBeLessThan(1e-4);

    const clipped = oklchToSrgb({ L: 0.65, C: 0.45, h: 145 });
    expect(clipped.r).toBeGreaterThanOrEqual(0);
    expect(clipped.r).toBeLessThanOrEqual(1);
    expect(clipped.g).toBeGreaterThanOrEqual(0);
    expect(clipped.g).toBeLessThanOrEqual(1);
    expect(clipped.b).toBeGreaterThanOrEqual(0);
    expect(clipped.b).toBeLessThanOrEqual(1);

    const mappedLch = srgbToOklch(clipped);
    expect(Math.abs(mappedLch.L - 0.65)).toBeLessThan(0.01);
    expect(Math.abs(mappedLch.h - 145)).toBeLessThan(1.5);
  });

  it("CIEDE2000(ΔE00)이 항등성·대칭성·흑백 극단(100)·지각 순서를 정확히 만족한다", () => {
    const red: RgbColor = { r: 0.85, g: 0.2, b: 0.2 };
    const nearRed: RgbColor = { r: 0.82, g: 0.24, b: 0.22 };
    const blue: RgbColor = { r: 0.15, g: 0.32, b: 0.86 };

    expect(computeCiede2000(red, red)).toBe(0);
    expect(computeCiede2000(red, blue)).toBeCloseTo(computeCiede2000(blue, red), 8);
    expect(computeCiede2000({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 })).toBeCloseTo(100, 1);
    expect(computeCiede2000(red, nearRed)).toBeLessThan(computeCiede2000(red, blue));
  });
});

describe("2. Viénot(1999)/Brettel(1997) 정밀 선형 LMS 4종 색각이상 시뮬레이터", () => {
  const allCvdTypes: readonly ColorVisionDeficiencyType[] = [
    "protanopia",
    "deuteranopia",
    "tritanopia",
    "achromatopsia",
  ];

  it("4종 색각이상 모두 무채색 축(흑·중회·백)을 색조 왜곡 없이 보존한다", () => {
    const grays: readonly RgbColor[] = [
      { r: 0, g: 0, b: 0 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 1, g: 1, b: 1 },
    ];
    for (const type of allCvdTypes) {
      for (const gray of grays) {
        const res = simulateColorVisionDeficiency(gray, type, 1);
        expect(maxChannelDelta(gray, res.simulatedRgb)).toBeLessThan(1e-4);
        expect(res.deltaE00FromOriginal).toBeLessThan(0.05);
      }
    }
  });

  it("severity=0은 원색을 무손실 유지하고, severity=0.5는 0과 1.0 사이로 단조 보간한다", () => {
    const crimson: RgbColor = { r: 0.85, g: 0.18, b: 0.22 };
    for (const type of allCvdTypes) {
      const s0 = simulateColorVisionDeficiency(crimson, type, 0);
      const s5 = simulateColorVisionDeficiency(crimson, type, 0.5);
      const s1 = simulateColorVisionDeficiency(crimson, type, 1);
      expect(s0.deltaE00FromOriginal).toBeLessThan(1e-4);
      expect(s5.deltaE00FromOriginal).toBeGreaterThan(0.5);
      expect(s5.deltaE00FromOriginal).toBeLessThan(s1.deltaE00FromOriginal);
    }
  });

  it("Viénot 적색맹은 L-원추세포 결손으로 순적색 휘도가 녹색맹보다 크게 어두워지며 순청색은 보존된다", () => {
    const pureRed: RgbColor = { r: 1, g: 0, b: 0 };
    const pureBlue: RgbColor = { r: 0, g: 0, b: 1 };

    const protanRed = simulateColorVisionDeficiency(pureRed, "protanopia");
    const deutanRed = simulateColorVisionDeficiency(pureRed, "deuteranopia");
    expect(computeRelativeLuminance(protanRed.simulatedRgb)).toBeLessThan(
      computeRelativeLuminance(deutanRed.simulatedRgb),
    );

    const protanBlue = simulateColorVisionDeficiency(pureBlue, "protanopia");
    const deutanBlue = simulateColorVisionDeficiency(pureBlue, "deuteranopia");
    expect(maxChannelDelta(pureBlue, protanBlue.simulatedRgb)).toBeLessThan(1e-3);
    expect(maxChannelDelta(pureBlue, deutanBlue.simulatedRgb)).toBeLessThan(1e-3);
  });

  it("Brettel(1997) 이중 반평면 청황색맹은 적색·청록 앵커를 보존하고 황색을 분홍·백색 쪽으로, 청색을 청록 암부로 이동시킨다", () => {
    const red: RgbColor = { r: 1, g: 0, b: 0 };
    const cyan: RgbColor = { r: 0, g: 1, b: 1 };
    const yellow: RgbColor = { r: 1, g: 1, b: 0 };
    const blue: RgbColor = { r: 0, g: 0, b: 1 };

    expect(maxChannelDelta(red, simulateColorVisionDeficiency(red, "tritanopia").simulatedRgb)).toBeLessThan(1e-3);
    expect(maxChannelDelta(cyan, simulateColorVisionDeficiency(cyan, "tritanopia").simulatedRgb)).toBeLessThan(1e-3);

    const tritanYellow = simulateColorVisionDeficiency(yellow, "tritanopia");
    expect(tritanYellow.simulatedRgb.b).toBeGreaterThan(0.75);

    const tritanBlue = simulateColorVisionDeficiency(blue, "tritanopia");
    expect(tritanBlue.simulatedRgb.g).toBeGreaterThan(0.2);
    expect(tritanBlue.simulatedRgb.b).toBeLessThan(0.6);

    // 경계 L = M 근방 연속성 확인
    const leftSide = simulateColorVisionDeficiency({ r: 0.499, g: 0.501, b: 0.2 }, "tritanopia");
    const rightSide = simulateColorVisionDeficiency({ r: 0.501, g: 0.499, b: 0.2 }, "tritanopia");
    expect(maxChannelDelta(leftSide.simulatedRgb, rightSide.simulatedRgb)).toBeLessThan(0.02);
  });

  it("전색맹(achromatopsia)은 모든 유채색을 동일 채널 회색조로 변환하며 CIE 상대 휘도(Y)를 보존한다", () => {
    const vividOrange: RgbColor = { r: 0.94, g: 0.42, b: 0.12 };
    const res = simulateColorVisionDeficiency(vividOrange, "achromatopsia");
    expect(res.simulatedRgb.r).toBeCloseTo(res.simulatedRgb.g, 6);
    expect(res.simulatedRgb.g).toBeCloseTo(res.simulatedRgb.b, 6);
    expect(
      Math.abs(computeRelativeLuminance(vividOrange) - computeRelativeLuminance(res.simulatedRgb)),
    ).toBeLessThan(1e-3);
  });
});

describe("3. 캐릭터·효과음 색각이상 구분 가능성 감사 및 안전 대체 색 제안", () => {
  it("적록 충돌 웹툰 쌍(주인공 붉은 망토 vs 라이벌 녹색 기운)에서 충돌을 탐지하고 대체 색을 제안한다", () => {
    const rgPair = WEBTOON_CVD_AUDIT_PAIRS[0]!;
    const report = evaluateColorPairAccessibility(rgPair);

    const protanCheck = report.checks.find((c) => c.type === "protanopia")!;
    const deutanCheck = report.checks.find((c) => c.type === "deuteranopia")!;
    expect(report.normalDeltaE00).toBeGreaterThan(35);
    expect(report.overallStatus).toBe("collision");
    expect(protanCheck.status).toBe("collision");
    expect(deutanCheck.status).toBe("collision");
    expect(protanCheck.deltaE00).toBeLessThan(15);
    expect(deutanCheck.deltaE00).toBeLessThan(15);
    expect(["protanopia", "deuteranopia", "achromatopsia"]).toContain(report.worstDeficiency);
    expect(report.minDeltaE00).toBeLessThan(15);
    expect(report.suggestion).not.toBeNull();
    expect(report.suggestion!.afterMinDeltaE00).toBeGreaterThan(report.minDeltaE00);
  });

  it("suggestSafeAlternativeColor가 제안한 대체 색을 적용하면 4종 색각이상 모두 안전(safe) 등급으로 회복된다", () => {
    for (const pair of WEBTOON_CVD_AUDIT_PAIRS.slice(0, 3)) {
      const before = evaluateColorPairAccessibility(pair);
      expect(before.overallStatus).not.toBe("safe");

      const suggestion = suggestSafeAlternativeColor(pair.colorA, pair.colorB);
      const after = evaluateColorPairAccessibility({
        ...pair,
        colorB: suggestion.suggestedColorB,
      });

      expect(after.overallStatus).toBe("safe");
      expect(after.checks.every((c) => c.status === "safe")).toBe(true);
      expect(after.minDeltaE00).toBeGreaterThanOrEqual(18);
      expect(after.minLuminanceDiff).toBeGreaterThanOrEqual(0.16);
    }
  });

  it("고대비 안전 프리셋(심해 감청 vs 황금 효과음)은 4종 모두 추가 보정 없이 통과한다", () => {
    const safePair = WEBTOON_CVD_AUDIT_PAIRS[3]!;
    const report = evaluateColorPairAccessibility(safePair);
    expect(report.overallStatus).toBe("safe");
    expect(report.checks).toHaveLength(CVD_TYPE_METADATA.length);
    expect(report.suggestion).toBeNull();
  });
});

describe("4. OKLCH 4막(기·승·전·결) 감정 컬러 스크립트 아크 생성기", () => {
  it("4막(기·승·전·결) 각각 5개 시맨틱 스와치와 유효한 hex·OKLCH CSS를 생성한다", () => {
    const arc = buildEpisodeColorScriptArc({
      baseHueDeg: 220,
      harmonyRule: "complementary",
    });

    expect(arc.acts).toHaveLength(4);
    expect(arc.acts.map((a) => a.actId)).toEqual(["intro", "development", "climax", "resolution"]);
    for (const act of arc.acts) {
      expect(act.swatches).toHaveLength(5);
      for (const sw of act.swatches) {
        expect(sw.hex).toMatch(/^#[0-9A-F]{6}$/u);
        expect(sw.oklchCss).toContain("oklch(");
      }
    }
  });

  it("보색·분할보색·유사색·삼원색 4종 하모니 규칙이 정확한 색상각 오프셋을 적용한다", () => {
    const baseHue = 40;
    const expectedOffsets: Record<string, readonly number[]> = {
      complementary: [0, 180],
      "split-complementary": [0, 150, 210],
      analogous: [0, -30, 30],
      triadic: [0, 120, 240],
    };

    const accentHues = new Set<number>();
    for (const rule of HARMONY_RULES) {
      const arc = buildEpisodeColorScriptArc({ baseHueDeg: baseHue, harmonyRule: rule.id });
      expect(arc.harmonyOffsetsDeg).toEqual(expectedOffsets[rule.id]);
      const climaxAccent = arc.acts[2]!.swatches.find((s) => s.role === "accent")!;
      accentHues.add(Math.round(climaxAccent.oklch.h));
    }
    expect(accentHues.size).toBe(4);
  });

  it("감정 긴장도가 높은 3막(절정)은 1막·4막보다 배경 명도가 어둡고 강조 채도가 높게 변조된다", () => {
    const arc = buildEpisodeColorScriptArc({
      baseHueDeg: 240,
      harmonyRule: "triadic",
      tensionCurve: [0.2, 0.55, 0.96, 0.25],
    });

    const intro = arc.acts[0]!;
    const climax = arc.acts[2]!;
    const resolution = arc.acts[3]!;

    expect(arc.climaxActId).toBe("climax");
    expect(climax.swatches[0]!.oklch.L).toBeLessThan(intro.swatches[0]!.oklch.L);
    expect(climax.swatches[0]!.oklch.L).toBeLessThan(resolution.swatches[0]!.oklch.L);
    expect(climax.peakChroma).toBeGreaterThan(intro.peakChroma);
    expect(arc.chromaDynamicRange).toBeGreaterThan(0.03);
    expect(arc.lightnessDynamicRange).toBeGreaterThan(0.05);
  });

  it("4종 웹툰 장르 프리셋 모두 유효한 아크와 3막 색각이상 연동 검사를 반환한다", () => {
    expect(EPISODE_EMOTION_ARC_PRESETS).toHaveLength(4);
    for (const preset of EPISODE_EMOTION_ARC_PRESETS) {
      const arc = buildEpisodeColorScriptArc({
        baseHueDeg: preset.baseHueDeg,
        harmonyRule: preset.harmonyRule,
        baseLightness: preset.baseLightness,
        baseChroma: preset.baseChroma,
        tensionCurve: preset.tensionCurve,
        presetId: preset.id,
      });
      expect(arc.acts).toHaveLength(4);
      expect(arc.climaxContrastAudit.checks).toHaveLength(4);
    }
  });
});

describe("5. 모바일 다크(#0B0D12) vs 라이트(#FFFFFF) 양면 뷰어 경계·할로 감사기", () => {
  it("기준 배경 상수가 #0B0D12 / #FFFFFF이며 야간 흑색 테두리 컷에서 다크모드 테두리 소실을 탐지한다", () => {
    expect(MOBILE_DARK_VIEWER_BG_HEX).toBe("#0B0D12");
    expect(MOBILE_LIGHT_VIEWER_BG_HEX).toBe("#FFFFFF");

    const nightNoir = DUAL_VIEWER_PANEL_PRESETS[0]!;
    const report = auditDualViewerReadability(nightNoir);
    expect(report.darkViewer.borderVanishRisk).toBe("critical");
    expect(report.grade).toBe("fail");
    expect(report.darkViewer.issuesKo.length).toBeGreaterThan(0);
  });

  it("흰 매트 미제거 컷에서 다크모드 흰 여백 할로(halo bleed) 위험을 정확히 탐지한다", () => {
    const whiteHalo = DUAL_VIEWER_PANEL_PRESETS[1]!;
    const report = auditDualViewerReadability(whiteHalo);
    expect(report.darkViewer.haloBleedRisk).toBe("critical");
    expect(report.darkViewer.haloBleedScore).toBeGreaterThanOrEqual(60);
    expect(report.darkViewer.issuesKo.some((msg) => msg.includes("할로"))).toBe(true);
    expect(report.grade).toBe("fail");
  });

  it("밝은 회상 컷의 연회색 테두리는 라이트모드 테두리 소실을 탐지하고, 무테두리 암부 컷도 소실 위험을 보고한다", () => {
    const pastelDay = DUAL_VIEWER_PANEL_PRESETS[2]!;
    const lightReport = auditDualViewerReadability(pastelDay);
    expect(lightReport.lightViewer.borderVanishRisk).toBe("critical");

    const borderlessDark = auditDualViewerReadability({
      ...DUAL_VIEWER_PANEL_PRESETS[0]!,
      id: "borderless-dark",
      borderWidthPx: 0,
    });
    expect(borderlessDark.darkViewer.borderVanishRisk).toBe("critical");
  });

  it("양면 안전 프리셋은 pass 등급을 받고, 실패 프리셋에 자동 보정 처방을 적용하면 pass로 회복된다", () => {
    const safePreset = DUAL_VIEWER_PANEL_PRESETS[3]!;
    const safeReport = auditDualViewerReadability(safePreset);
    expect(safeReport.grade).toBe("pass");
    expect(safeReport.overallScore).toBeGreaterThanOrEqual(88);

    for (const failingPreset of DUAL_VIEWER_PANEL_PRESETS.slice(0, 3)) {
      const before = auditDualViewerReadability(failingPreset);
      const fix = before.repairSuggestion;
      const after = auditDualViewerReadability({
        ...failingPreset,
        borderColor: fix.recommendedBorderColor,
        borderWidthPx: fix.recommendedBorderWidthPx,
        gutterEdgeColor: fix.recommendedGutterEdgeColor,
        outerHaloWidthPx: fix.recommendedOuterHaloWidthPx,
        hasTransparentOutside: true,
      });
      expect(after.grade).toBe("pass");
      expect(after.overallScore).toBeGreaterThanOrEqual(88);
    }
  });
});

describe("6. StudioColorScriptLabPanel 3탭 인터랙티브 UI 및 엄격 규칙 검증", () => {
  it("<StudioColorScriptLabPanel />가 zero-prop으로 단독 렌더링되고 Tab 1 하모니·색상각 조작이 즉시 반영된다", () => {
    const onHarmonyRuleChange = vi.fn();
    render(<StudioColorScriptLabPanel onHarmonyRuleChange={onHarmonyRuleChange} />);

    expect(screen.getByTestId("color-script-a11y-panel")).toBeTruthy();
    expect(screen.getByTestId("csa-tab-arc").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("episode-arc-svg")).toBeTruthy();
    expect(screen.getByTestId("arc-card-climax")).toBeTruthy();

    fireEvent.click(screen.getByTestId("harmony-rule-triadic"));
    expect(onHarmonyRuleChange).toHaveBeenCalledWith("triadic");

    fireEvent.change(screen.getByTestId("arc-hue-slider"), { target: { value: "120" } });
    expect(screen.getByTestId("arc-hue-readout").textContent).toBe("120°");
  });

  it("Tab 2(색각이상 시뮬레이터)에서 4종 전환·강도 조절·안전 대체 색 적용 시 충돌이 안전 상태로 해소된다", () => {
    const onCvdTypeChange = vi.fn();
    const onApplySafeColor = vi.fn();
    render(
      <StudioColorScriptLabPanel
        initialTab="cvd"
        onCvdTypeChange={onCvdTypeChange}
        onApplySafeColor={onApplySafeColor}
      />,
    );

    expect(screen.getByTestId("cvd-overall-badge").textContent).toContain("구분 충돌");
    expect(screen.getByTestId("cvd-suggestion-card")).toBeTruthy();

    fireEvent.click(screen.getByTestId("cvd-type-tritanopia"));
    expect(onCvdTypeChange).toHaveBeenCalledWith("tritanopia");

    fireEvent.change(screen.getByTestId("cvd-severity-slider"), { target: { value: "0.8" } });
    expect(screen.getByTestId("cvd-severity-readout").textContent).toBe("80%");

    fireEvent.change(screen.getByTestId("cvd-severity-slider"), { target: { value: "1" } });
    fireEvent.click(screen.getByTestId("cvd-apply-safe-btn"));

    expect(onApplySafeColor).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("cvd-overall-badge").textContent).toContain("구분 안전");
    expect(screen.getByTestId("cvd-safe-banner")).toBeTruthy();
  });

  it("Tab 3(다크·라이트 양면 검수)에서 프리셋 전환과 1클릭 자동 보정 시 점수가 양면 통과로 상승한다", () => {
    const onApplyDualViewerRepair = vi.fn();
    render(
      <StudioColorScriptLabPanel
        initialTab="dualViewer"
        onApplyDualViewerRepair={onApplyDualViewerRepair}
      />,
    );

    expect(screen.getByTestId("dual-viewer-preview-svg")).toBeTruthy();
    expect(screen.getByTestId("dual-viewer-score-badge").textContent).toContain("예제 기준 미달");

    fireEvent.click(screen.getByTestId("dual-preset-white-matte-halo"));
    expect(screen.getByTestId("dual-dark-audit").textContent).toContain("위험");

    fireEvent.click(screen.getByTestId("dual-viewer-apply-repair-btn"));
    expect(onApplyDualViewerRepair).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("dual-viewer-score-badge").textContent).toContain("예제 기준 통과");
  });

  it("엄격 규칙(800줄 이하 · Storage/BigInt/private Map store/원시 색상/inline style/props={} 0건 · 시맨틱 토큰)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "colorblind-harmony-engine.ts",
      "StudioColorScriptLabPanel.tsx",
      "index.ts",
      "color-script-accessibility-lab.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "color-script-accessibility-lab.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      }
      if (file.endsWith(".tsx") && file !== "color-script-accessibility-lab.test.tsx") {
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toMatch(/\bstyle\s*=/u);
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
