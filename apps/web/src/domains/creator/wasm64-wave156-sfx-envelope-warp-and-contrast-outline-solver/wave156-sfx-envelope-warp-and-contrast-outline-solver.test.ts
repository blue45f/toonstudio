import { describe, expect, it } from "vitest";
import {
  auditCoonsPatchFoldOver,
  buildSfxSdfOutlineWgsl,
  canonicalizeSfxJson,
  clampSafeCoonsEnvelope,
  computeOklabDeltaE,
  computeRelativeLuminance,
  computeSfxManifestFingerprint,
  computeWcagContrastRatio,
  createSfxEnvelopePreset,
  escapeSvgXml,
  evaluateCoonsPatchPartials,
  evaluateCoonsPatchPoint,
  evaluateCubicBezier,
  formatSrgbAsOklchCss,
  oklabToSrgb,
  renderSfxEnvelopeAuditSvg,
  SFX_ENVELOPE_PRESET_IDS,
  SFX_ENVELOPE_PRESET_META,
  sha256SfxHex,
  solveAdaptiveSfxOutline,
  srgbToOklab,
  summarizeSfxEnvelopeAuditKo,
  validateSfxSdfOutlineWgsl,
  warpSfxTextToEnvelope,
  type CoonsPatchEnvelope,
  type SrgbColor,
} from "./index";

function dist(a: { readonly x: number; readonly y: number }, b: { readonly x: number; readonly y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("Wave 156 — Coons 패치 SFX 엔벨로프 워프 및 접힘 솔버", () => {
  it("1. Coons 패치 4모서리 보간 오차가 5종 프리셋 모두에서 1e-9 미만이다", () => {
    for (let i = 0; i < SFX_ENVELOPE_PRESET_IDS.length; i += 1) {
      const presetId = SFX_ENVELOPE_PRESET_IDS[i];
      const patch = createSfxEnvelopePreset(presetId, { x: 40, y: 20, width: 640, height: 180 }, 1.0);
      expect(dist(evaluateCoonsPatchPoint(patch, 0, 0), patch.top.p0)).toBeLessThan(1e-9);
      expect(dist(evaluateCoonsPatchPoint(patch, 1, 0), patch.top.p3)).toBeLessThan(1e-9);
      expect(dist(evaluateCoonsPatchPoint(patch, 0, 1), patch.bottom.p0)).toBeLessThan(1e-9);
      expect(dist(evaluateCoonsPatchPoint(patch, 1, 1), patch.bottom.p3)).toBeLessThan(1e-9);
    }
  });

  it("2. Coons 패치 4경계 곡선 일치 오차가 모든 매개변수 샘플에서 1e-9 미만이다", () => {
    const patch = createSfxEnvelopePreset("sword-slash-arc", { x: 10, y: 30, width: 720, height: 200 }, 1.1);
    const steps = 20;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      expect(dist(evaluateCoonsPatchPoint(patch, t, 0), evaluateCubicBezier(patch.top, t))).toBeLessThan(1e-9);
      expect(dist(evaluateCoonsPatchPoint(patch, t, 1), evaluateCubicBezier(patch.bottom, t))).toBeLessThan(1e-9);
      expect(dist(evaluateCoonsPatchPoint(patch, 0, t), evaluateCubicBezier(patch.left, t))).toBeLessThan(1e-9);
      expect(dist(evaluateCoonsPatchPoint(patch, 1, t), evaluateCubicBezier(patch.right, t))).toBeLessThan(1e-9);
    }
  });

  it("3. 해석적 편미분(∂S/∂u, ∂S/∂v)이 중앙 유한차분 근사와 고정밀로 일치한다", () => {
    const patch = createSfxEnvelopePreset("impact-bulge-burst", { x: 0, y: 0, width: 600, height: 180 }, 1.0);
    const eps = 1e-6;
    const u = 0.37;
    const v = 0.62;
    const partials = evaluateCoonsPatchPartials(patch, u, v);
    const duApproxX = (evaluateCoonsPatchPoint(patch, u + eps, v).x - evaluateCoonsPatchPoint(patch, u - eps, v).x) / (2 * eps);
    const duApproxY = (evaluateCoonsPatchPoint(patch, u + eps, v).y - evaluateCoonsPatchPoint(patch, u - eps, v).y) / (2 * eps);
    const dvApproxX = (evaluateCoonsPatchPoint(patch, u, v + eps).x - evaluateCoonsPatchPoint(patch, u, v - eps).x) / (2 * eps);
    const dvApproxY = (evaluateCoonsPatchPoint(patch, u, v + eps).y - evaluateCoonsPatchPoint(patch, u, v - eps).y) / (2 * eps);

    expect(Math.abs(partials.dSdu.x - duApproxX)).toBeLessThan(1e-4);
    expect(Math.abs(partials.dSdu.y - duApproxY)).toBeLessThan(1e-4);
    expect(Math.abs(partials.dSdv.x - dvApproxX)).toBeLessThan(1e-4);
    expect(Math.abs(partials.dSdv.y - dvApproxY)).toBeLessThan(1e-4);
  });

  it("4. 5종 만화 SFX 엔벨로프 프리셋 모두 기본 강도에서 야코비안 det(J) > 0, 접힘 0건이다", () => {
    expect(SFX_ENVELOPE_PRESET_IDS.length).toBe(5);
    for (let i = 0; i < SFX_ENVELOPE_PRESET_IDS.length; i += 1) {
      const id = SFX_ENVELOPE_PRESET_IDS[i];
      const meta = SFX_ENVELOPE_PRESET_META[id];
      expect(meta.labelKo.length).toBeGreaterThan(2);
      const patch = createSfxEnvelopePreset(id);
      const audit = auditCoonsPatchFoldOver(patch, 18, 9);
      expect(audit.hasFoldOver).toBe(false);
      expect(audit.foldOverCount).toBe(0);
      expect(audit.minJacobianDet).toBeGreaterThan(0);
      expect(audit.maxCornerError).toBeLessThan(1e-9);
      expect(audit.maxBoundaryError).toBeLessThan(1e-9);
    }
  });

  it("5. 5종 프리셋이 최대 강도(intensity=1.5)와 와이드·컴팩트 종횡비에서도 접힘 0건을 유지한다", () => {
    const aspectBounds = [
      { width: 960, height: 140 },
      { width: 320, height: 220 },
    ];
    for (let b = 0; b < aspectBounds.length; b += 1) {
      for (let i = 0; i < SFX_ENVELOPE_PRESET_IDS.length; i += 1) {
        const patch = createSfxEnvelopePreset(SFX_ENVELOPE_PRESET_IDS[i], aspectBounds[b], 1.5);
        const audit = auditCoonsPatchFoldOver(patch, 16, 8);
        expect(audit.hasFoldOver).toBe(false);
        expect(audit.minJacobianDet).toBeGreaterThan(0);
      }
    }
  });

  it("6. 과도하게 교차 구부린 제어점 엔벨로프에서 접힘을 감지하고 clampSafeCoonsEnvelope로 det(J) > 0 복구한다", () => {
    const twistedHandles: CoonsPatchEnvelope = {
      top: {
        p0: { x: 0, y: 0 },
        p1: { x: 220, y: 460 },
        p2: { x: 420, y: 460 },
        p3: { x: 640, y: 0 },
      },
      bottom: {
        p0: { x: 0, y: 180 },
        p1: { x: 220, y: -280 },
        p2: { x: 420, y: -280 },
        p3: { x: 640, y: 180 },
      },
      left: {
        p0: { x: 0, y: 0 },
        p1: { x: 0, y: 60 },
        p2: { x: 0, y: 120 },
        p3: { x: 0, y: 180 },
      },
      right: {
        p0: { x: 640, y: 0 },
        p1: { x: 640, y: 60 },
        p2: { x: 640, y: 120 },
        p3: { x: 640, y: 180 },
      },
    };

    const before = auditCoonsPatchFoldOver(twistedHandles, 16, 8);
    expect(before.hasFoldOver).toBe(true);
    expect(before.foldOverCount).toBeGreaterThan(0);
    expect(before.minJacobianDet).toBeLessThanOrEqual(0);

    const clamped = clampSafeCoonsEnvelope(twistedHandles, { gridU: 16, gridV: 8 });
    expect(clamped.wasClamped).toBe(true);
    expect(clamped.dampingFactor).toBeGreaterThan(0);
    expect(clamped.dampingFactor).toBeLessThan(1);
    expect(clamped.auditAfter.hasFoldOver).toBe(false);
    expect(clamped.auditAfter.foldOverCount).toBe(0);
    expect(clamped.auditAfter.minJacobianDet).toBeGreaterThan(0);
  });

  it("7. 나비넥타이처럼 모서리 자체가 뒤집힌 Coons 패치도 clampSafeCoonsEnvelope가 접힘 0건으로 복구한다", () => {
    const bowtiePatch: CoonsPatchEnvelope = {
      top: { p0: { x: 0, y: 0 }, p1: { x: 200, y: 60 }, p2: { x: 400, y: 120 }, p3: { x: 600, y: 180 } },
      bottom: { p0: { x: 0, y: 180 }, p1: { x: 200, y: 120 }, p2: { x: 400, y: 60 }, p3: { x: 600, y: 0 } },
      left: { p0: { x: 0, y: 0 }, p1: { x: 0, y: 60 }, p2: { x: 0, y: 120 }, p3: { x: 0, y: 180 } },
      right: { p0: { x: 600, y: 180 }, p1: { x: 600, y: 120 }, p2: { x: 600, y: 60 }, p3: { x: 600, y: 0 } },
    };

    const before = auditCoonsPatchFoldOver(bowtiePatch);
    expect(before.hasFoldOver).toBe(true);

    const clamped = clampSafeCoonsEnvelope(bowtiePatch);
    expect(clamped.wasClamped).toBe(true);
    expect(clamped.cornersRepaired).toBe(true);
    expect(clamped.auditAfter.hasFoldOver).toBe(false);
    expect(clamped.auditAfter.minJacobianDet).toBeGreaterThan(0);
  });

  it("8. 이미 안전한 Coons 패치는 clampSafeCoonsEnvelope 호출 시 감쇠 없이 원형을 보존한다", () => {
    const safePatch = createSfxEnvelopePreset("whisper-wave-drift");
    const result = clampSafeCoonsEnvelope(safePatch);
    expect(result.wasClamped).toBe(false);
    expect(result.dampingFactor).toBe(1.0);
    expect(result.auditAfter.hasFoldOver).toBe(false);
  });

  it("9. 원근 후퇴(perspective-recede) 프리셋에서 앞 글자 대비 끝 글자 면적이 단조 축소한다", () => {
    const warped = warpSfxTextToEnvelope("콰아아앙!", {
      presetId: "perspective-recede",
      bounds: { x: 0, y: 0, width: 700, height: 200 },
    });
    expect(warped.glyphs.length).toBe(5);
    expect(warped.audit.hasFoldOver).toBe(false);
    expect(warped.isAreaMonotonicallyDecreasing).toBe(true);
    expect(warped.isScaleMonotonicallyDecreasing).toBe(true);
    expect(warped.firstToLastAreaRatio).toBeLessThan(0.25);
    for (let i = 1; i < warped.glyphs.length; i += 1) {
      expect(warped.glyphs[i].warpedArea).toBeLessThan(warped.glyphs[i - 1].warpedArea);
    }
  });

  it("10. 원근 후퇴 프리셋에서 동일 폭 한글 4자(두근두근)도 면적과 국소 배율이 단조 축소한다", () => {
    const warped = warpSfxTextToEnvelope("두근두근", { presetId: "perspective-recede" });
    expect(warped.glyphs.length).toBe(4);
    expect(warped.isAreaMonotonicallyDecreasing).toBe(true);
    expect(warped.isScaleMonotonicallyDecreasing).toBe(true);
    expect(warped.firstToLastAreaRatio).toBeLessThan(0.42);
  });

  it("11. 검격 호(sword-slash-arc) 프리셋은 충분한 아크 회전각 변화폭을 만든다", () => {
    const warped = warpSfxTextToEnvelope("스윽—", { presetId: "sword-slash-arc" });
    expect(warped.glyphs.length).toBe(3);
    expect(warped.arcAngleSpanDeg).toBeGreaterThan(8);
    expect(warped.audit.hasFoldOver).toBe(false);
  });

  it("12. 충격파 팽창(impact-bulge-burst) 프리셋은 중앙 글리프 면적이 양끝 글리프보다 크다", () => {
    const warped = warpSfxTextToEnvelope("콰아아아앙", { presetId: "impact-bulge-burst" });
    expect(warped.glyphs.length).toBe(5);
    const first = warped.glyphs[0].warpedArea;
    const mid = warped.glyphs[2].warpedArea;
    const last = warped.glyphs[4].warpedArea;
    expect(mid).toBeGreaterThan(first * 1.15);
    expect(mid).toBeGreaterThan(last * 1.15);
  });

  it("13. 속삭임 파동(whisper-wave-drift) 프리셋은 전체 면적 보존 비율이 1.0 부근을 유지한다", () => {
    const warped = warpSfxTextToEnvelope("두근두근", { presetId: "whisper-wave-drift" });
    expect(warped.areaPreservationRatio).toBeGreaterThan(0.92);
    expect(warped.areaPreservationRatio).toBeLessThan(1.08);
    expect(warped.audit.hasFoldOver).toBe(false);
  });

  it("14. 대각선 강타 전단(diagonal-slam-shear) 프리셋은 양의 하향 기울기를 생성한다", () => {
    const warped = warpSfxTextToEnvelope("파지직!", { presetId: "diagonal-slam-shear" });
    expect(warped.glyphs.length).toBe(4);
    expect(warped.glyphs[0].localRotationDeg).toBeGreaterThan(3);
    expect(warped.audit.hasFoldOver).toBe(false);
  });

  it("15. 한/일/영 혼합 효과음 문자열의 스크립트 분류와 워프 폴리라인이 정확히 생성된다", () => {
    const warped = warpSfxTextToEnvelope("콰ゴB!", { presetId: "sword-slash-arc" });
    expect(warped.glyphs.map((g) => g.scriptKind)).toEqual([
      "hangul",
      "kana-cjk",
      "latin",
      "punctuation",
    ]);
    for (let i = 0; i < warped.glyphs.length; i += 1) {
      expect(warped.glyphs[i].warpedBoundsPolygon.length).toBeGreaterThanOrEqual(8);
      expect(warped.glyphs[i].warpedStrokes.length).toBeGreaterThanOrEqual(1);
      expect(warped.glyphs[i].warpedArea).toBeGreaterThan(0);
    }
  });

  it("16. warpSfxTextToEnvelope는 꼬인 커스텀 패치를 넣어도 autoClampFoldOver 기본 동작으로 안전 복구한다", () => {
    const foldedCustom: CoonsPatchEnvelope = {
      top: { p0: { x: 0, y: 0 }, p1: { x: 200, y: 500 }, p2: { x: 400, y: 500 }, p3: { x: 600, y: 0 } },
      bottom: { p0: { x: 0, y: 160 }, p1: { x: 200, y: -320 }, p2: { x: 400, y: -320 }, p3: { x: 600, y: 160 } },
      left: { p0: { x: 0, y: 0 }, p1: { x: 0, y: 53 }, p2: { x: 0, y: 107 }, p3: { x: 0, y: 160 } },
      right: { p0: { x: 600, y: 0 }, p1: { x: 600, y: 53 }, p2: { x: 600, y: 107 }, p3: { x: 600, y: 160 } },
    };
    const warped = warpSfxTextToEnvelope("콰아아앙!", { envelope: foldedCustom });
    expect(warped.presetId).toBe("custom");
    expect(warped.wasSafelyClamped).toBe(true);
    expect(warped.audit.hasFoldOver).toBe(false);
    expect(warped.audit.minJacobianDet).toBeGreaterThan(0);
  });
});

describe("Wave 156 — 배경 대비 자동 다중 링 아웃라인 솔버 & SHA-256", () => {
  it("17. WCAG 2.1 상대휘도 및 명암비가 흑백 21:1, 동일색 1:1 및 대칭성을 만족한다", () => {
    const black: SrgbColor = { r: 0, g: 0, b: 0 };
    const white: SrgbColor = { r: 1, g: 1, b: 1 };
    const red: SrgbColor = { r: 0.9, g: 0.15, b: 0.12 };
    expect(computeRelativeLuminance(black)).toBeCloseTo(0, 8);
    expect(computeRelativeLuminance(white)).toBeCloseTo(1, 8);
    expect(computeWcagContrastRatio(black, white)).toBeCloseTo(21, 6);
    expect(computeWcagContrastRatio(red, red)).toBeCloseTo(1, 6);
    expect(computeWcagContrastRatio(red, white)).toBeCloseTo(computeWcagContrastRatio(white, red), 8);
  });

  it("18. Björn Ottosson OKLab 정변환·역변환 왕복 오차가 1e-4 미만이고 ΔE가 일관된다", () => {
    const samples: readonly SrgbColor[] = [
      { r: 0.95, g: 0.25, b: 0.15 },
      { r: 0.12, g: 0.48, b: 0.88 },
      { r: 0.92, g: 0.84, b: 0.18 },
      { r: 0.20, g: 0.22, b: 0.25 },
    ];
    for (let i = 0; i < samples.length; i += 1) {
      const c = samples[i];
      const roundTrip = oklabToSrgb(srgbToOklab(c));
      expect(Math.abs(roundTrip.r - c.r)).toBeLessThan(1e-4);
      expect(Math.abs(roundTrip.g - c.g)).toBeLessThan(1e-4);
      expect(Math.abs(roundTrip.b - c.b)).toBeLessThan(1e-4);
      expect(computeOklabDeltaE(c, c)).toBeCloseTo(0, 8);
    }
    expect(computeOklabDeltaE({ r: 0, g: 0, b: 0 }, { r: 1, g: 1, b: 1 })).toBeCloseTo(1.0, 2);
  });

  it("19. 어두운 밤 액션 배경 위의 진한 빨강 SFX에 이중 링 아웃라인이 자동 활성화되어 WCAG >= 4.5:1을 달성한다", () => {
    const sol = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.52, g: 0.08, b: 0.09 },
      backgroundSamplesSrgb: [
        { r: 0.05, g: 0.06, b: 0.09 },
        { r: 0.12, g: 0.11, b: 0.16 },
      ],
      sfxText: "콰아아앙!",
      presetId: "diagonal-slam-shear",
    });

    expect(sol.outlineActivated).toBe(true);
    expect(sol.worstNoOutlineContrast).toBeLessThan(4.5);
    expect(sol.fillToInnerContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.innerToOuterContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.worstDualRingBackgroundContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.meetsDualRingReadability).toBe(true);
    expect(sol.contrastImprovementMultiplier).toBeGreaterThan(2.5);
    expect(sol.innerStrokePx).toBeGreaterThan(0);
    expect(sol.outerHaloPx).toBeGreaterThan(0);
  });

  it("20. 밝은 하늘·설원 배경 위의 노랑 SFX에서 이중 링 아웃라인이 WCAG >= 4.5:1과 큰 개선 배수를 입증한다", () => {
    const sol = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.98, g: 0.90, b: 0.22 },
      backgroundSamplesSrgb: [
        { r: 0.94, g: 0.96, b: 0.99 },
        { r: 0.85, g: 0.91, b: 0.97 },
      ],
      sfxText: "파지직!",
    });

    expect(sol.outlineActivated).toBe(true);
    expect(sol.worstNoOutlineContrast).toBeLessThan(1.5);
    expect(sol.fillToInnerContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.worstDualRingBackgroundContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.meetsDualRingReadability).toBe(true);
    expect(sol.contrastImprovementMultiplier).toBeGreaterThan(8.0);
  });

  it("21. 흑·중간회색·강렬한 주황 폭발·순백이 뒤섞인 다색 액션 배경에서도 전 표본 WCAG >= 4.5:1을 달성한다", () => {
    const chaoticActionBg: readonly SrgbColor[] = [
      { r: 0.0, g: 0.0, b: 0.0 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 0.94, g: 0.34, b: 0.12 },
      { r: 1.0, g: 1.0, b: 1.0 },
    ];
    const sol = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.92, g: 0.24, b: 0.14 },
      backgroundSamplesSrgb: chaoticActionBg,
      sfxText: "콰아아앙!",
      presetId: "impact-bulge-burst",
    });

    expect(sol.outlineActivated).toBe(true);
    expect(sol.worstNoOutlineContrast).toBeLessThan(1.5);
    expect(sol.fillToInnerContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.innerToOuterContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.worstDualRingBackgroundContrast).toBeGreaterThanOrEqual(4.5);
    expect(sol.meetsDualRingReadability).toBe(true);
    expect(sol.contrastImprovementMultiplier).toBeGreaterThan(3.0);
    for (let i = 0; i < sol.sampleEvaluations.length; i += 1) {
      expect(sol.sampleEvaluations[i].meetsWcagAa).toBe(true);
      expect(sol.sampleEvaluations[i].dualRingBestContrast).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("22. 10종 대표 SFX 본문 색상을 극단 다색 배경(순흑+임계중간톤+순백)에 올려도 100% WCAG >= 4.5:1을 보장한다", () => {
    const fills: readonly SrgbColor[] = [
      { r: 0.0, g: 0.0, b: 0.0 },
      { r: 1.0, g: 1.0, b: 1.0 },
      { r: 0.95, g: 0.18, b: 0.18 },
      { r: 0.98, g: 0.85, b: 0.12 },
      { r: 0.15, g: 0.72, b: 0.96 },
      { r: 0.62, g: 0.22, b: 0.88 },
      { r: 0.18, g: 0.76, b: 0.36 },
      { r: 0.46, g: 0.46, b: 0.46 },
      { r: 0.96, g: 0.45, b: 0.68 },
      { r: 0.28, g: 0.18, b: 0.12 },
    ];
    const extremeBg: readonly SrgbColor[] = [
      { r: 0.0, g: 0.0, b: 0.0 },
      { r: 0.46, g: 0.46, b: 0.46 },
      { r: 1.0, g: 1.0, b: 1.0 },
    ];
    for (let i = 0; i < fills.length; i += 1) {
      const sol = solveAdaptiveSfxOutline({
        fillSrgb: fills[i],
        backgroundSamplesSrgb: extremeBg,
      });
      expect(sol.fillToInnerContrast).toBeGreaterThanOrEqual(4.5);
      expect(sol.innerToOuterContrast).toBeGreaterThanOrEqual(4.5);
      expect(sol.worstDualRingBackgroundContrast).toBeGreaterThanOrEqual(4.5);
      expect(sol.meetsDualRingReadability).toBe(true);
    }
  });

  it("23. 무아웃라인 상태에서도 이미 전 배경 WCAG >= 4.5:1이면 outlineActivated가 false이고 forceDualRing 시 활성화된다", () => {
    const standby = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.99, g: 0.99, b: 0.99 },
      backgroundSamplesSrgb: [{ r: 0.02, g: 0.02, b: 0.03 }],
    });
    expect(standby.outlineActivated).toBe(false);
    expect(standby.innerStrokePx).toBe(0);
    expect(standby.outerHaloPx).toBe(0);
    expect(standby.worstNoOutlineContrast).toBeGreaterThan(15);

    const forced = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.99, g: 0.99, b: 0.99 },
      backgroundSamplesSrgb: [{ r: 0.02, g: 0.02, b: 0.03 }],
      forceDualRing: true,
    });
    expect(forced.outlineActivated).toBe(true);
    expect(forced.innerStrokePx).toBeGreaterThan(0);
    expect(forced.outerHaloPx).toBeGreaterThan(0);
  });

  it("24. 순수 ES2017 동기 FIPS 180-4 SHA-256이 공식 테스트 벡터와 비트 단위로 일치한다", () => {
    expect(sha256SfxHex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256SfxHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256SfxHex("콰아아앙!")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("25. 매니페스트 지문(sfxManifestSha256Hex)이 동일 입력에 결정론적이고 입력 변화에 민감하다", () => {
    const warpedA = warpSfxTextToEnvelope("콰아아앙!", { presetId: "sword-slash-arc" });
    const warpedB = warpSfxTextToEnvelope("스윽—", { presetId: "sword-slash-arc" });
    const outline = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.9, g: 0.2, b: 0.15 },
      backgroundSamplesSrgb: [{ r: 0.88, g: 0.25, b: 0.2 }],
      sfxText: "콰아아앙!",
    });

    const fp1 = computeSfxManifestFingerprint({
      text: warpedA.text,
      presetId: warpedA.presetId,
      envelope: warpedA.envelope,
      outline,
    });
    const fp2 = computeSfxManifestFingerprint({
      text: warpedA.text,
      presetId: warpedA.presetId,
      envelope: warpedA.envelope,
      outline,
    });
    const fp3 = computeSfxManifestFingerprint({
      text: warpedB.text,
      presetId: warpedB.presetId,
      envelope: warpedB.envelope,
      outline,
    });

    expect(fp1.sfxManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(fp1.sfxManifestSha256Hex).toBe(fp2.sfxManifestSha256Hex);
    expect(fp1.sfxManifestSha256Hex).not.toBe(fp3.sfxManifestSha256Hex);
    expect(canonicalizeSfxJson({ b: 2, a: 1 })).toBe(canonicalizeSfxJson({ a: 1, b: 2 }));
  });

  it("26. formatSrgbAsOklchCss가 순수 oklch(...) 형식만 반환하고 원시 색상 문법을 내지 않는다", () => {
    const css = formatSrgbAsOklchCss({ r: 0.82, g: 0.28, b: 0.19 }, 0.85);
    expect(css).toMatch(/^oklch\([0-9.]+ [0-9.]+ [0-9.]+ \/ [0-9.]+\)$/);
    expect(css).not.toMatch(/#|rgb\(|hsl\(/i);
  });
});

describe("Wave 156 — WebGPU WGSL 다중 링 SDF 셰이더 생성 및 검증", () => {
  it("27. buildSfxSdfOutlineWgsl 생성 셰이더가 64B 16B 정렬·fwidth AA·4바인딩 검증을 통과한다", () => {
    const outline = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.95, g: 0.3, b: 0.12 },
      backgroundSamplesSrgb: [{ r: 0.1, g: 0.1, b: 0.12 }, { r: 0.95, g: 0.94, b: 0.92 }],
    });
    const artifact = buildSfxSdfOutlineWgsl({ outline, brushRoughness: 0.032 });
    const report = validateSfxSdfOutlineWgsl(artifact.wgsl);

    expect(artifact.uniformBufferByteLength).toBe(64);
    expect(artifact.bindings.length).toBe(4);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.uniformBufferByteLength).toBe(64);
    expect(report.uniformBufferAligned).toBe(true);
    expect(report.hasVertexEntry).toBe(true);
    expect(report.hasFragmentEntry).toBe(true);
    expect(report.usesFwidthAa).toBe(true);
  });

  it("28. 빈 WGSL 소스와 괄호 불일치 손상을 정확히 거부한다", () => {
    expect(validateSfxSdfOutlineWgsl("").valid).toBe(false);
    const broken = `${buildSfxSdfOutlineWgsl().wgsl}\nfn broken_brace(x: f32) -> f32 { return x;`;
    const report = validateSfxSdfOutlineWgsl(broken);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.indexOf("괄호") >= 0)).toBe(true);
  });

  it("29. 중복 @group/@binding 슬롯을 검출한다", () => {
    const dup = buildSfxSdfOutlineWgsl().wgsl.replace(
      "@group(0) @binding(3)",
      "@group(0) @binding(1)",
    );
    const report = validateSfxSdfOutlineWgsl(dup);
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.indexOf("중복") >= 0)).toBe(true);
  });

  it("30. 16바이트 비정렬 유니폼 필드(f32) 및 64B 크기 위반을 검출한다", () => {
    const unaligned = buildSfxSdfOutlineWgsl().wgsl.replace(
      "ring_and_brush_params: vec4<f32>,",
      "ring_and_brush_params: f32,",
    );
    const r1 = validateSfxSdfOutlineWgsl(unaligned);
    expect(r1.valid).toBe(false);
    expect(r1.uniformBufferAligned).toBe(false);

    const wrongSize = buildSfxSdfOutlineWgsl().wgsl.replace(
      "  ring_and_brush_params: vec4<f32>,\n};",
      "  ring_and_brush_params: vec4<f32>,\n  extra_pad: vec4<f32>,\n};",
    );
    const r2 = validateSfxSdfOutlineWgsl(wrongSize);
    expect(r2.valid).toBe(false);
    expect(r2.uniformBufferByteLength).toBe(80);
  });

  it("31. GLSL 금지어(gl_FragCoord, sampler2D, texture2D, dFdx, vec4(...) 등) 오염을 검출한다", () => {
    const base = buildSfxSdfOutlineWgsl().wgsl;
    const samples = [
      `${base}\n// ok\nconst bad = gl_FragCoord;`,
      `${base}\nvar s: sampler2D;`,
      `${base}\nlet t = texture2D(a, b);`,
      `${base}\nlet d = dFdx(1.0);`,
      `${base}\nlet v = vec4(1.0, 1.0, 1.0, 1.0);`,
    ];
    for (let i = 0; i < samples.length; i += 1) {
      const report = validateSfxSdfOutlineWgsl(samples[i]);
      expect(report.valid).toBe(false);
      expect(report.errors.some((e) => e.indexOf("GLSL") >= 0)).toBe(true);
    }
  });

  it("32. fwidth 누락 및 NaN 리터럴 오염을 검출한다", () => {
    const noFwidth = buildSfxSdfOutlineWgsl().wgsl.replace("fwidth(sd_base)", "0.01");
    const r1 = validateSfxSdfOutlineWgsl(noFwidth);
    expect(r1.valid).toBe(false);
    expect(r1.usesFwidthAa).toBe(false);

    const withNaN = buildSfxSdfOutlineWgsl().wgsl.replace("0.0012", "NaN");
    const r2 = validateSfxSdfOutlineWgsl(withNaN);
    expect(r2.valid).toBe(false);
    expect(r2.errors.some((e) => e.indexOf("NaN") >= 0)).toBe(true);
  });
});

describe("Wave 156 — 순수 OKLCH SVG 렌더러 & 한국어 레터링 감독 QA 브리프", () => {
  it("33. renderSfxEnvelopeAuditSvg는 순수 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl 및 NaN이 0건이다", () => {
    const warped = warpSfxTextToEnvelope("콰아아앙!", { presetId: "perspective-recede" });
    const outline = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.94, g: 0.28, b: 0.14 },
      backgroundSamplesSrgb: [
        { r: 0.08, g: 0.09, b: 0.14 },
        { r: 0.88, g: 0.32, b: 0.18 },
        { r: 0.96, g: 0.95, b: 0.92 },
      ],
      sfxText: warped.text,
      presetId: warped.presetId,
    });
    const wgslValidation = validateSfxSdfOutlineWgsl(buildSfxSdfOutlineWgsl({ outline }).wgsl);
    const svg = renderSfxEnvelopeAuditSvg({ warped, outline, wgslValidation });

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toContain("야코비안 접힘 0건 · 안전");
    expect(svg).toContain("이중 링 대비");
  });

  it("34. renderSfxEnvelopeAuditSvg와 escapeSvgXml이 XSS/XML 특수문자를 완전히 이스케이프한다", () => {
    const payload = `<script>alert("xss")</script> & 'SFX'`;
    expect(escapeSvgXml(payload)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;SFX&#39;",
    );

    const warped = warpSfxTextToEnvelope("<콰&앙>", { presetId: "sword-slash-arc" });
    const outline = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.92, g: 0.82, b: 0.2 },
      backgroundSamplesSrgb: [{ r: 0.92, g: 0.92, b: 0.92 }],
    });
    const svg = renderSfxEnvelopeAuditSvg({
      warped,
      outline,
      titleKo: payload,
      artistNoteKo: `<img src=x onerror="alert(1)">`,
    });

    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(svg).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("35. summarizeSfxEnvelopeAuditKo는 정상 5종 검수에서 PASS 등급과 자연스러운 한국어 리포트를 반환한다", () => {
    const warped = warpSfxTextToEnvelope("파지직!", { presetId: "impact-bulge-burst" });
    const outline = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.96, g: 0.86, b: 0.16 },
      backgroundSamplesSrgb: [{ r: 0.94, g: 0.94, b: 0.96 }, { r: 0.15, g: 0.18, b: 0.24 }],
      sfxText: warped.text,
      presetId: warped.presetId,
    });
    const wgslValidation = validateSfxSdfOutlineWgsl(buildSfxSdfOutlineWgsl({ outline }).wgsl);
    const brief = summarizeSfxEnvelopeAuditKo({
      warped,
      outline,
      wgslValidation,
      generatedDateIso: "2026-11-28",
      artistNoteKo: "전격 컷 메인 효과음 최종 확인",
    });

    expect(brief.grade).toBe("PASS");
    expect(brief.passed).toBe(true);
    expect(brief.checks.length).toBe(5);
    expect(brief.checks.every((c) => c.passed)).toBe(true);
    expect(brief.sfxManifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(brief.headlineKo).toContain("합격");
    expect(brief.summaryParagraphKo).toContain("2026-11-28");
    expect(brief.summaryParagraphKo).not.toContain("가능하게 합니다");
    expect(brief.summaryParagraphKo).not.toContain("경험을 제공합니다");
  });

  it("36. 자동 안전 감쇠가 발동한 워프는 WARN 등급, 접힘 미보정 또는 WGSL 오류 시 FAIL 등급을 반환한다", () => {
    const foldedPatch: CoonsPatchEnvelope = {
      top: { p0: { x: 0, y: 0 }, p1: { x: 200, y: 480 }, p2: { x: 400, y: 480 }, p3: { x: 600, y: 0 } },
      bottom: { p0: { x: 0, y: 160 }, p1: { x: 200, y: -320 }, p2: { x: 400, y: -320 }, p3: { x: 600, y: 160 } },
      left: { p0: { x: 0, y: 0 }, p1: { x: 0, y: 53 }, p2: { x: 0, y: 107 }, p3: { x: 0, y: 160 } },
      right: { p0: { x: 600, y: 0 }, p1: { x: 600, y: 53 }, p2: { x: 600, y: 107 }, p3: { x: 600, y: 160 } },
    };
    const outline = solveAdaptiveSfxOutline({
      fillSrgb: { r: 0.9, g: 0.25, b: 0.15 },
      backgroundSamplesSrgb: [{ r: 0.85, g: 0.3, b: 0.2 }],
    });
    const okWgsl = validateSfxSdfOutlineWgsl(buildSfxSdfOutlineWgsl({ outline }).wgsl);
    const badWgsl = validateSfxSdfOutlineWgsl("broken wgsl");

    const clampedWarped = warpSfxTextToEnvelope("콰아아앙!", {
      envelope: foldedPatch,
      autoClampFoldOver: true,
    });
    const warnBrief = summarizeSfxEnvelopeAuditKo({
      warped: clampedWarped,
      outline,
      wgslValidation: okWgsl,
    });
    expect(warnBrief.grade).toBe("WARN");
    expect(warnBrief.passed).toBe(true);

    const unclampedWarped = warpSfxTextToEnvelope("콰아아앙!", {
      envelope: foldedPatch,
      autoClampFoldOver: false,
    });
    const failFoldBrief = summarizeSfxEnvelopeAuditKo({
      warped: unclampedWarped,
      outline,
      wgslValidation: okWgsl,
    });
    expect(failFoldBrief.grade).toBe("FAIL");
    expect(failFoldBrief.passed).toBe(false);

    const failWgslBrief = summarizeSfxEnvelopeAuditKo({
      warped: clampedWarped,
      outline,
      wgslValidation: badWgsl,
    });
    expect(failWgslBrief.grade).toBe("FAIL");
    expect(failWgslBrief.passed).toBe(false);
  });
});
