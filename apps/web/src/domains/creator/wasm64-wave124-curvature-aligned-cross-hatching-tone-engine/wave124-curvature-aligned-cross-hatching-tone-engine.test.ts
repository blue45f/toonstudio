import { describe, expect, it } from "vitest";
import {
  ALL_HATCH_STYLES,
  ALL_SURFACE_PRESETS,
  buildCrossHatchingToneWgsl,
  buildTaperedStrokeRibbonPolygon,
  computeTaperWidthPx,
  createSurfaceFieldEvaluator,
  escapeCrossHatchXml,
  generateCurvatureAlignedCrossHatching,
  getHatchStyleProfile,
  renderCrossHatchingAuditSvg,
  summarizeCrossHatchingAuditKo,
  validateCrossHatchingToneWgsl,
  type CrossHatchingSpec,
  type CustomNormalFieldInput,
  type HatchStyleId,
  type SurfacePresetId,
} from "./index";

const LEFT_LIGHT = { x: -1, y: 0, z: 0.6 } as const;
const RIGHT_LIGHT = { x: 1, y: 0, z: 0.6 } as const;

function runHatch(spec: CrossHatchingSpec = {}) {
  return generateCurvatureAlignedCrossHatching({
    width: 260,
    height: 260,
    lightDirection: LEFT_LIGHT,
    seed: 12401,
    ...spec,
  });
}

function buildCircularCustomField(
  width: number,
  height: number,
  options: { readonly includeNormals?: boolean; readonly includeTangents?: boolean } = {},
): CustomNormalFieldInput {
  const mask = new Uint8Array(width * height);
  const normals = options.includeNormals ? new Float32Array(width * height * 3) : undefined;
  const principalTangents = options.includeTangents ? new Float32Array(width * height * 2) : undefined;
  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.38;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5 - cx) / radius;
      const v = (y + 0.5 - cy) / radius;
      const r2 = u * u + v * v;
      const idx = y * width + x;
      if (r2 <= 1) {
        mask[idx] = 1;
        const nz = Math.sqrt(Math.max(0.01, 1 - r2));
        if (normals) {
          normals[idx * 3] = u;
          normals[idx * 3 + 1] = v;
          normals[idx * 3 + 2] = nz;
        }
        if (principalTangents) {
          principalTangents[idx * 2] = 0.8 * nz + 0.2;
          principalTangents[idx * 2 + 1] = -0.45 * u * v;
        }
      }
    }
  }
  return { width, height, mask, normals, principalTangents };
}

describe("Wave 124 — 주곡률 방향장 기반 만화 크로스해칭 톤 엔진", () => {
  it("01. 4종 내장 3D 해석적 표면 프리셋 모두 법선·주곡률 접선 단위 벡터와 유효 조도 [0, 1]을 산출한다", () => {
    for (const preset of ALL_SURFACE_PRESETS) {
      const evaluator = createSurfaceFieldEvaluator({
        surfacePreset: preset,
        width: 240,
        height: 240,
        lightDirection: LEFT_LIGHT,
      });
      const center = evaluator.sample(120, 120);
      expect(center.insideMask).toBe(true);
      expect(Math.hypot(center.normal.x, center.normal.y, center.normal.z)).toBeCloseTo(1, 5);
      expect(Math.hypot(center.principalTangent1.x, center.principalTangent1.y)).toBeCloseTo(1, 5);
      expect(Math.hypot(center.principalTangent2.x, center.principalTangent2.y)).toBeCloseTo(1, 5);
      const orthoDot =
        center.principalTangent1.x * center.principalTangent2.x +
        center.principalTangent1.y * center.principalTangent2.y;
      expect(Math.abs(orthoDot)).toBeLessThan(1e-5);
      expect(center.luminance).toBeGreaterThanOrEqual(0);
      expect(center.luminance).toBeLessThanOrEqual(1);
    }
  });

  it("02. 4종 내장 3D 표면 프리셋이 암부·중간톤·하이라이트 영역을 모두 보유한다", () => {
    for (const preset of ALL_SURFACE_PRESETS) {
      const result = runHatch({ surfacePreset: preset, styleId: "g-pen-classic-cross", seed: 12402 });
      expect(result.metrics.toneZones.shadowAreaPx).toBeGreaterThan(200);
      expect(result.metrics.toneZones.midtoneAreaPx).toBeGreaterThan(200);
      expect(result.metrics.toneZones.highlightAreaPx).toBeGreaterThan(200);
    }
  });

  it("03. 4종 만화 해칭 스타일 프리셋 프로파일이 유효한 계층·테이퍼 파라미터를 제공한다", () => {
    for (const styleId of ALL_HATCH_STYLES) {
      const profile = getHatchStyleProfile(styleId);
      expect(profile.id).toBe(styleId);
      expect(profile.labelKo.length).toBeGreaterThan(3);
      expect(profile.stepSizePx).toBeGreaterThan(0);
      expect(profile.tipWidthRatio).toBeGreaterThan(0);
      expect(profile.tipWidthRatio).toBeLessThan(0.5);
      expect(profile.layers.length).toBe(3);
      expect(profile.layers[0].enabled).toBe(true);
    }
  });

  it("04. [불변식 1] 4종 표면 × 4종 스타일 전체 16개 조합에서 실루엣 외곽 침범 0건과 NaN/Infinity 0건을 보장한다", () => {
    for (const preset of ALL_SURFACE_PRESETS) {
      for (const styleId of ALL_HATCH_STYLES) {
        const result = runHatch({ surfacePreset: preset, styleId, width: 240, height: 240, seed: 12404 });
        expect(result.metrics.totalStrokeCount).toBeGreaterThan(10);
        expect(result.metrics.outsideMaskPointCount).toBe(0);
        expect(result.metrics.nonFiniteValueCount).toBe(0);
      }
    }
  });

  it("05. [불변식 2] 4종 표면 × 4종 스타일 전체 16개 조합에서 암부 > 중간톤 > 하이라이트 밀도 단조성을 보장한다", () => {
    for (const preset of ALL_SURFACE_PRESETS) {
      for (const styleId of ALL_HATCH_STYLES) {
        const result = runHatch({ surfacePreset: preset, styleId, seed: 12405 });
        const tz = result.metrics.toneZones;
        expect(tz.monotonicToneOrderPassed).toBe(true);
        expect(tz.shadowDensity).toBeGreaterThan(tz.midtoneDensity);
        expect(tz.midtoneDensity).toBeGreaterThan(tz.highlightDensity);
      }
    }
  });

  it("06. [불변식 2 하이라이트 백지 보존] 모든 스타일에서 밝은 하이라이트(L > 0.82) 영역의 잉크 밀도가 0이다", () => {
    for (const styleId of ALL_HATCH_STYLES) {
      const result = runHatch({ surfacePreset: "sphere-head", styleId, seed: 12406 });
      expect(result.metrics.toneZones.highlightInkAreaPx).toBe(0);
      expect(result.metrics.toneZones.highlightDensity).toBe(0);
    }
  });

  it("07. [불변식 3] g-pen-classic-cross에서 1·2·3층 해칭이 모두 순차 활성화되고 암부로 갈수록 평균 조도가 낮아진다", () => {
    const result = runHatch({
      surfacePreset: "sphere-head",
      styleId: "g-pen-classic-cross",
      width: 280,
      height: 280,
      seed: 12407,
    });
    expect(result.metrics.activeLayers).toEqual([1, 2, 3]);
    expect(result.metrics.layerStrokeCounts[1]).toBeGreaterThan(0);
    expect(result.metrics.layerStrokeCounts[2]).toBeGreaterThan(0);
    expect(result.metrics.layerStrokeCounts[3]).toBeGreaterThan(0);

    const meanLumaByTier = (tier: 1 | 2 | 3): number => {
      const subset = result.strokes.filter((s) => s.layer === tier);
      return subset.reduce((acc, s) => acc + s.meanLuminance, 0) / subset.length;
    };
    expect(meanLumaByTier(1)).toBeGreaterThan(meanLumaByTier(2));
    expect(meanLumaByTier(2)).toBeGreaterThan(meanLumaByTier(3));
  });

  it("08. [불변식 3] murim-brush-hatch에서 1·2·3층 붓터치 해칭이 순차 활성화되고 G펜보다 평균 폭이 더 굵다", () => {
    const gpen = runHatch({ surfacePreset: "cylinder-limb", styleId: "g-pen-classic-cross", width: 280, height: 280, seed: 12408 });
    const murim = runHatch({ surfacePreset: "cylinder-limb", styleId: "murim-brush-hatch", width: 280, height: 280, seed: 12408 });

    expect(murim.metrics.activeLayers).toEqual([1, 2, 3]);
    expect(murim.metrics.layerStrokeCounts[1]).toBeGreaterThan(0);
    expect(murim.metrics.layerStrokeCounts[2]).toBeGreaterThan(0);
    expect(murim.metrics.layerStrokeCounts[3]).toBeGreaterThan(0);

    const avgCenterW = (list: readonly { readonly centerWidthPx: number }[]): number =>
      list.reduce((acc, s) => acc + s.centerWidthPx, 0) / list.length;
    expect(avgCenterW(murim.strokes)).toBeGreaterThan(avgCenterW(gpen.strokes));
  });

  it("09. [불변식 3] noir-parallel-engraving은 1층 평행 조각선만 사용하고 2·3층은 0가닥이다", () => {
    for (const preset of ALL_SURFACE_PRESETS) {
      const noir = runHatch({ surfacePreset: preset, styleId: "noir-parallel-engraving", seed: 12409 });
      expect(noir.metrics.activeLayers).toEqual([1]);
      expect(noir.metrics.layerStrokeCounts[1]).toBeGreaterThan(15);
      expect(noir.metrics.layerStrokeCounts[2]).toBe(0);
      expect(noir.metrics.layerStrokeCounts[3]).toBe(0);
      expect(noir.metrics.toneZones.monotonicToneOrderPassed).toBe(true);
    }
  });

  it("10. stipple-fine-liner는 세밀하고 짧은 다층 점묘 스트로크를 생성하며 G펜보다 가늘다", () => {
    const gpen = runHatch({ surfacePreset: "sphere-head", styleId: "g-pen-classic-cross", seed: 12410 });
    const stipple = runHatch({ surfacePreset: "sphere-head", styleId: "stipple-fine-liner", seed: 12410 });

    expect(stipple.metrics.activeLayers).toEqual([1, 2, 3]);
    const avgLen = (list: readonly { readonly arcLengthPx: number }[]): number =>
      list.reduce((acc, s) => acc + s.arcLengthPx, 0) / list.length;
    const avgW = (list: readonly { readonly centerWidthPx: number }[]): number =>
      list.reduce((acc, s) => acc + s.centerWidthPx, 0) / list.length;
    expect(avgLen(stipple.strokes)).toBeLessThan(avgLen(gpen.strokes));
    expect(avgW(stipple.strokes)).toBeLessThan(avgW(gpen.strokes));
  });

  it("11. [불변식 4] sphere-head에서 좌측([-1,0,0.6])↔우측([+1,0,0.6]) 광원 전환 시 해칭 중심이 우반구↔좌반구로 정확히 반전된다", () => {
    const leftLit = runHatch({ surfacePreset: "sphere-head", styleId: "g-pen-classic-cross", width: 280, height: 280, lightDirection: LEFT_LIGHT, seed: 12411 });
    const rightLit = runHatch({ surfacePreset: "sphere-head", styleId: "g-pen-classic-cross", width: 280, height: 280, lightDirection: RIGHT_LIGHT, seed: 12411 });

    expect(leftLit.metrics.hatchingCentroid.x).toBeGreaterThan(leftLit.metrics.maskCentroid.x);
    expect(rightLit.metrics.hatchingCentroid.x).toBeLessThan(rightLit.metrics.maskCentroid.x);
    expect(leftLit.metrics.rightHalfInkShare).toBeGreaterThan(0.65);
    expect(rightLit.metrics.leftHalfInkShare).toBeGreaterThan(0.65);
    const leftOffset = leftLit.metrics.hatchingCentroid.x - leftLit.metrics.maskCentroid.x;
    const rightOffset = rightLit.metrics.hatchingCentroid.x - rightLit.metrics.maskCentroid.x;
    expect(Math.abs(leftOffset + rightOffset)).toBeLessThan(12);
  });

  it("12. [불변식 4] cylinder-limb·folded-drapery·planar-wall에서도 좌↔우 광원 반전 시 해칭 중심과 반구 점유율이 반전된다", () => {
    const presets: readonly SurfacePresetId[] = ["cylinder-limb", "folded-drapery", "planar-wall"];
    for (const preset of presets) {
      const leftLit = runHatch({ surfacePreset: preset, styleId: "g-pen-classic-cross", lightDirection: LEFT_LIGHT, seed: 12412 });
      const rightLit = runHatch({ surfacePreset: preset, styleId: "g-pen-classic-cross", lightDirection: RIGHT_LIGHT, seed: 12412 });
      expect(leftLit.metrics.horizontalBiasNormalized).toBeGreaterThan(0.08);
      expect(rightLit.metrics.horizontalBiasNormalized).toBeLessThan(-0.08);
      expect(leftLit.metrics.rightHalfInkShare).toBeGreaterThan(leftLit.metrics.leftHalfInkShare);
      expect(rightLit.metrics.leftHalfInkShare).toBeGreaterThan(rightLit.metrics.rightHalfInkShare);
    }
  });

  it("13. computeTaperWidthPx가 중앙 최대 폭과 양 끝단 대칭 테이퍼를 산출한다", () => {
    const startW = computeTaperWidthPx(0, 2.0, 0.16, 0.8);
    const quarterW = computeTaperWidthPx(0.25, 2.0, 0.16, 0.8);
    const centerW = computeTaperWidthPx(0.5, 2.0, 0.16, 0.8);
    const endW = computeTaperWidthPx(1, 2.0, 0.16, 0.8);

    expect(centerW).toBeCloseTo(2.0, 6);
    expect(startW).toBeCloseTo(endW, 6);
    expect(centerW).toBeGreaterThan(quarterW);
    expect(quarterW).toBeGreaterThan(startW);
  });

  it("14. 모든 스타일에서 생성된 모든 스트로크의 중앙 폭이 양 끝단 폭보다 엄격히 두껍다", () => {
    for (const styleId of ALL_HATCH_STYLES) {
      const result = runHatch({ surfacePreset: "folded-drapery", styleId, seed: 12414 });
      expect(result.metrics.allStrokesTaperedAtEnds).toBe(true);
      expect(result.metrics.meanTaperRatio).toBeLessThan(0.5);
      for (const stroke of result.strokes) {
        expect(stroke.centerWidthPx).toBeGreaterThan(stroke.startWidthPx);
        expect(stroke.centerWidthPx).toBeGreaterThan(stroke.endWidthPx);
      }
    }
  });

  it("15. [시드 결정론] 동일 입력·동일 시드에서 스트로크 좌표·폭·통계가 비트 단위로 100% 일치한다", () => {
    const spec: CrossHatchingSpec = {
      surfacePreset: "folded-drapery",
      styleId: "murim-brush-hatch",
      width: 240,
      height: 240,
      lightDirection: LEFT_LIGHT,
      seed: 987654,
    };
    const first = generateCurvatureAlignedCrossHatching(spec);
    const second = generateCurvatureAlignedCrossHatching(spec);

    expect(first.strokes).toEqual(second.strokes);
    expect(first.metrics).toEqual(second.metrics);
    expect(first.directionArrows).toEqual(second.directionArrows);
  });

  it("16. 시드가 달라지면 결정론적 분포가 달라져 서로 다른 스트로크 궤적을 생성한다", () => {
    const a = runHatch({ surfacePreset: "sphere-head", width: 220, height: 220, seed: 1001 });
    const b = runHatch({ surfacePreset: "sphere-head", width: 220, height: 220, seed: 2002 });
    expect(a.strokes[0].points[0]).not.toEqual(b.strokes[0].points[0]);
  });

  it("17. 커스텀 2D 마스크+법선+주곡률 접선장 입력에서 외곽 침범 0건과 톤 단조성을 보장한다", () => {
    const customField = buildCircularCustomField(220, 220, { includeNormals: true, includeTangents: true });
    const result = generateCurvatureAlignedCrossHatching({
      customField,
      styleId: "g-pen-classic-cross",
      lightDirection: LEFT_LIGHT,
      seed: 12417,
    });

    expect(result.surfacePreset).toBe("custom");
    expect(result.metrics.totalStrokeCount).toBeGreaterThan(15);
    expect(result.metrics.outsideMaskPointCount).toBe(0);
    expect(result.metrics.nonFiniteValueCount).toBe(0);
    expect(result.metrics.toneZones.monotonicToneOrderPassed).toBe(true);
  });

  it("18. 커스텀 2D 마스크만 제공(법선·접선 생략)해도 자동 볼록 법선 유도로 정상 해칭된다", () => {
    const customField = buildCircularCustomField(200, 200, { includeNormals: false, includeTangents: false });
    const result = generateCurvatureAlignedCrossHatching({
      customField,
      styleId: "noir-parallel-engraving",
      lightDirection: RIGHT_LIGHT,
      seed: 12418,
    });

    expect(result.metrics.totalStrokeCount).toBeGreaterThan(10);
    expect(result.metrics.outsideMaskPointCount).toBe(0);
    expect(result.metrics.horizontalBiasNormalized).toBeLessThan(-0.08);
  });

  it("19. 빈 마스크(모두 0) 입력에서 크래시·NaN 없이 0가닥 안전 결과를 반환한다", () => {
    const result = generateCurvatureAlignedCrossHatching({
      customField: { width: 120, height: 120, mask: new Uint8Array(120 * 120) },
      styleId: "g-pen-classic-cross",
      seed: 12419,
    });

    expect(result.strokes).toEqual([]);
    expect(result.metrics.totalStrokeCount).toBe(0);
    expect(result.metrics.outsideMaskPointCount).toBe(0);
    expect(result.metrics.nonFiniteValueCount).toBe(0);
    expect(result.metrics.maskAreaPx).toBe(0);
    expect(result.metrics.toneZones.shadowDensity).toBe(0);
  });

  it("20. 극소(2×2) 마스크 및 NaN/영벡터 입력에서도 유한값과 외곽 침범 0건을 보장한다", () => {
    const tinyResult = generateCurvatureAlignedCrossHatching({
      customField: { width: 2, height: 2, mask: new Uint8Array([1, 1, 1, 1]) },
      lightDirection: { x: 0, y: 0, z: 0 },
      seed: Number.NaN,
      densityScale: Number.POSITIVE_INFINITY,
      strokeWidthScale: Number.NaN,
    });

    expect(tinyResult.metrics.outsideMaskPointCount).toBe(0);
    expect(tinyResult.metrics.nonFiniteValueCount).toBe(0);
    expect(Number.isFinite(tinyResult.metrics.hatchingCentroid.x)).toBe(true);
    expect(Number.isFinite(tinyResult.metrics.hatchingCentroid.y)).toBe(true);
    const lNorm = Math.hypot(
      tinyResult.lightDirection.x,
      tinyResult.lightDirection.y,
      tinyResult.lightDirection.z,
    );
    expect(lNorm).toBeCloseTo(1, 5);
  });

  it("21. densityScale 증가 시 총 스트로크 수와 암부 잉크 밀도가 단조 증가한다", () => {
    const sparse = runHatch({ surfacePreset: "sphere-head", width: 240, height: 240, densityScale: 0.65, seed: 12421 });
    const dense = runHatch({ surfacePreset: "sphere-head", width: 240, height: 240, densityScale: 1.45, seed: 12421 });

    expect(dense.metrics.totalStrokeCount).toBeGreaterThan(sparse.metrics.totalStrokeCount);
    expect(dense.metrics.toneZones.shadowDensity).toBeGreaterThan(sparse.metrics.toneZones.shadowDensity);
  });

  it("22. strokeWidthScale 증가 시 스트로크 중앙 펜 폭이 비례 증가한다", () => {
    const thin = runHatch({ surfacePreset: "cylinder-limb", width: 220, height: 220, strokeWidthScale: 0.7, seed: 12422 });
    const thick = runHatch({ surfacePreset: "cylinder-limb", width: 220, height: 220, strokeWidthScale: 1.6, seed: 12422 });
    expect(thick.strokes[0].centerWidthPx).toBeGreaterThan(thin.strokes[0].centerWidthPx * 1.8);
  });

  it("23. 주곡률 방향장 미니 화살표와 실루엣 외곽선이 마스크 내부 유효 좌표로 추출된다", () => {
    const result = runHatch({ surfacePreset: "folded-drapery", seed: 12423 });
    expect(result.directionArrows.length).toBeGreaterThan(20);
    for (const arrow of result.directionArrows) {
      expect(Math.hypot(arrow.dx, arrow.dy)).toBeCloseTo(1, 5);
      expect(Number.isFinite(arrow.x)).toBe(true);
      expect(Number.isFinite(arrow.y)).toBe(true);
    }
    expect(result.silhouetteOutline.length).toBe(64);
  });

  it("24. 4종 해칭 스타일 모두 WebGPU WGSL 셰이더 생성과 구조 검증을 오류 0건으로 통과한다", () => {
    for (const styleId of ALL_HATCH_STYLES) {
      const artifact = buildCrossHatchingToneWgsl(styleId);
      const report = validateCrossHatchingToneWgsl(artifact);

      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(artifact.uniformBufferByteLength).toBe(64);
      expect(artifact.uniformBufferByteLength % 16).toBe(0);
      expect(artifact.bindings.length).toBe(4);
      expect(artifact.entryPoints).toEqual(["cs_curvature_hatch_metrics", "fs_cross_hatching_aa"]);
      expect(artifact.wgsl).toContain("fwidth(");
    }
  });

  it("25. noir-parallel-engraving WGSL은 1티어 전용이고 나머지 3스타일은 3티어 교차 해칭 WGSL을 생성한다", () => {
    const noir = buildCrossHatchingToneWgsl("noir-parallel-engraving");
    expect(noir.activeTierCount).toBe(1);
    expect(noir.wgsl).toContain("let h2 = 0.0;");
    expect(noir.wgsl).toContain("let h3 = 0.0;");

    const multiStyles: readonly HatchStyleId[] = [
      "g-pen-classic-cross",
      "murim-brush-hatch",
      "stipple-fine-liner",
    ];
    for (const styleId of multiStyles) {
      const artifact = buildCrossHatchingToneWgsl(styleId);
      expect(artifact.activeTierCount).toBe(3);
      expect(artifact.wgsl).toContain("aa_hatch_stripe(coord2");
      expect(artifact.wgsl).toContain("aa_hatch_stripe(coord3");
    }
  });

  it("26. WGSL 검증기가 64B 비정렬 유니폼·바인딩 누락·fwidth 누락·괄호 불균형을 적발한다", () => {
    const base = buildCrossHatchingToneWgsl("g-pen-classic-cross");
    const broken = validateCrossHatchingToneWgsl({
      ...base,
      uniformBufferByteLength: 48,
      wgsl: base.wgsl
        .replace("@group(0) @binding(3)", "")
        .replace("fwidth(coord)", "0.01")
        .replace("return vec4<f32>(tone, tone, tone, mask);", "return { NaN;"),
    });

    expect(broken.valid).toBe(false);
    expect(broken.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("27. WGSL 검증기가 GLSL 금지어(gl_FragCoord, vec3(, sampler2D, dFdx(, uniform)을 정확히 거부한다", () => {
    const base = buildCrossHatchingToneWgsl("g-pen-classic-cross");
    const glslContaminated = validateCrossHatchingToneWgsl({
      ...base,
      wgsl: `${base.wgsl}\nuniform float bad_u;\nlet a = gl_FragCoord.x + dFdx(1.0) + vec3(1.0, 0.0, 0.0).x;\n// sampler2D\n`,
    });

    expect(glslContaminated.valid).toBe(false);
    expect(glslContaminated.errors.some((e) => e.includes("gl_FragCoord"))).toBe(true);
    expect(glslContaminated.errors.some((e) => e.includes("GLSL vec2/3/4"))).toBe(true);
    expect(glslContaminated.errors.some((e) => e.includes("dFdx/dFdy"))).toBe(true);
    expect(glslContaminated.errors.some((e) => e.includes("sampler2D"))).toBe(true);
    expect(glslContaminated.errors.some((e) => e.includes("GLSL uniform"))).toBe(true);
  });

  it("28. WGSL 검증기가 빈 셰이더 문자열과 누락된 엔트리포인트를 거부한다", () => {
    const base = buildCrossHatchingToneWgsl("stipple-fine-liner");
    const emptyReport = validateCrossHatchingToneWgsl({ ...base, wgsl: "   " });

    expect(emptyReport.valid).toBe(false);
    expect(emptyReport.errors.some((e) => e.includes("비어 있습니다"))).toBe(true);
    expect(emptyReport.errors.some((e) => e.includes("엔트리포인트"))).toBe(true);
  });

  it("29. renderCrossHatchingAuditSvg가 순수 OKLCH만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 0건이다", () => {
    const result = runHatch({ surfacePreset: "sphere-head", styleId: "g-pen-classic-cross", seed: 12429 });
    const svg = renderCrossHatchingAuditSvg(result, {
      title: "구형 두상 크로스해칭 검수",
      theme: "print-monochrome",
    });

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).toContain('data-layer="hatch-tier-1"');
    expect(svg).toContain('data-layer="hatch-tier-2"');
    expect(svg).toContain('data-layer="hatch-tier-3"');
    expect(svg).toContain('data-layer="curvature-direction-arrows"');
    expect(svg).toContain('data-layer="tone-density-chart"');
    expect(svg).toContain('data-tone-bar="shadow"');
    expect(svg).toContain('data-tone-bar="midtone"');
    expect(svg).toContain('data-tone-bar="highlight"');
  });

  it("30. renderCrossHatchingAuditSvg가 studio-dark 테마와 XML 특수문자/XSS 공격 문자열을 안전 이스케이프한다", () => {
    const result = runHatch({ surfacePreset: "cylinder-limb", styleId: "murim-brush-hatch", width: 240, height: 240, seed: 12430 });
    const svg = renderCrossHatchingAuditSvg(result, {
      title: `<script>alert("xss")</script> & '무협' <검수>`,
      theme: "studio-dark",
    });

    expect(escapeCrossHatchXml(`<tag attr="a" & 'b'>`)).toBe(
      "&lt;tag attr=&quot;a&quot; &amp; &apos;b&apos;&gt;",
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp; &apos;무협&apos; &lt;검수&gt;");
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
  });

  it("31. buildTaperedStrokeRibbonPolygon이 유효한 닫힌 테이퍼 리본 정점을 생성한다", () => {
    const result = runHatch({ surfacePreset: "planar-wall", width: 220, height: 220, seed: 12431 });
    const firstStroke = result.strokes[0];
    const ribbon = buildTaperedStrokeRibbonPolygon(firstStroke);

    expect(ribbon.length).toBe(firstStroke.points.length * 2);
    for (const pt of ribbon) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
  });

  it("32. renderCrossHatchingAuditSvg에서 화살표·차트 토글과 빈 마스크 결과를 안전 렌더링한다", () => {
    const emptyResult = generateCurvatureAlignedCrossHatching({
      customField: { width: 100, height: 100, mask: new Uint8Array(100 * 100) },
      styleId: "g-pen-classic-cross",
    });
    const minimalSvg = renderCrossHatchingAuditSvg(emptyResult, {
      showCurvatureArrows: false,
      showToneChart: false,
    });

    expect(minimalSvg).not.toContain('data-layer="curvature-direction-arrows"');
    expect(minimalSvg).not.toContain('data-layer="tone-density-chart"');
    expect(minimalSvg).not.toContain("NaN");
    expect(minimalSvg).not.toContain("Infinity");
  });

  it("33. summarizeCrossHatchingAuditKo가 번역투 없이 자연스러운 한국어 펜선 QA 브리프를 생성한다", () => {
    const result = runHatch({ surfacePreset: "sphere-head", styleId: "g-pen-classic-cross", seed: 12433 });
    const report = summarizeCrossHatchingAuditKo(result);

    expect(report.surfaceLabelKo).toBe("구형 두상 곡면");
    expect(report.styleLabelKo).toBe("G펜 정통 크로스해칭");
    expect(report.outsideMaskPointCount).toBe(0);
    expect(report.toneMonotonicPassed).toBe(true);
    expect(report.headlineKo).toContain("구형 두상 곡면");
    expect(report.summaryParagraphKo).toContain("우측 암부");
    expect(report.silhouetteVerdictKo).toContain("한 점도 없어");
    expect(report.checklistKo.length).toBe(4);

    const allText = [
      report.headlineKo,
      report.summaryParagraphKo,
      report.toneVerdictKo,
      report.silhouetteVerdictKo,
      report.layerBreakdownKo,
      ...report.checklistKo,
    ].join(" ");
    for (const phrase of [
      "가능하게 합니다",
      "직관적인 경험을 제공",
      "원활한 워크플로우",
      "최적화된 결과를 제공",
      "효율적으로 수행합니다",
    ]) {
      expect(allText).not.toContain(phrase);
    }
  });

  it("34. summarizeCrossHatchingAuditKo가 누아르 단일층 판화 및 빈 마스크 상태를 정확히 분기 설명한다", () => {
    const noir = runHatch({
      surfacePreset: "planar-wall",
      styleId: "noir-parallel-engraving",
      width: 240,
      height: 240,
      lightDirection: RIGHT_LIGHT,
      seed: 12434,
    });
    const noirReport = summarizeCrossHatchingAuditKo(noir);
    expect(noirReport.layerBreakdownKo).toContain("1층 평행 조각선");
    expect(noirReport.layerBreakdownKo).toContain("비활성화");
    expect(noirReport.summaryParagraphKo).toContain("좌측 암부");

    const empty = generateCurvatureAlignedCrossHatching({
      customField: { width: 80, height: 80, mask: new Uint8Array(80 * 80) },
      styleId: "g-pen-classic-cross",
    });
    const emptyReport = summarizeCrossHatchingAuditKo(empty);
    expect(emptyReport.totalStrokeCount).toBe(0);
    expect(emptyReport.toneVerdictKo).toContain("비어 있거나");
  });
});
