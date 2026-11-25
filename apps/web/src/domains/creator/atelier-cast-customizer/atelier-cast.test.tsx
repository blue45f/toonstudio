// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_ARCHETYPE_IDS,
  ATELIER_CAST_ARCHETYPES,
  ATELIER_CAST_BRAND,
  ATELIER_CAST_SCHEMA_VERSION,
  ATELIER_CAST_WEBGPU_LOOKDEV_WGSL,
  ATELIER_LOOKDEV_BRAND,
  ATELIER_PARAM_BOUNDS,
  ATELIER_PIGMENT_IDS,
  ATELIER_PIGMENT_PALETTES,
  ATELIER_RUNTIME_BRAND,
  ATELIER_UNIFORM_BYTE_SIZE,
  ATELIER_WEBGPU_RENDER_PASSES,
  CHARACTER_LAB_INTEGRATION_CHECKLIST,
  CHARACTER_LAB_ROUTE_MAPPINGS,
  StudioAtelierCastPanel,
  buildAtelierCastSnapshot,
  buildAtelierPigmentHarmony,
  evaluateCharacterCustomQuality,
  exportAtelierCastManifestJson,
  formatOklch,
  getAtelierArchetype,
  getAtelierPigment,
  isVioletSlopHue,
  negotiateAtelier3dWebGpuDefault,
  normalizeAtelierParams,
  normalizeHue,
  packAtelierCastLookdevUniforms,
  sanitizeNonVioletHue,
  solveAnatomyAndCageRefit,
  summarizeCharacterLabIntegration,
  validateAtelierCastWgsl,
  type AtelierArchetypeId,
  type AtelierPigmentId,
} from "./index";

afterEach(cleanup);

function assertSvgZeroRawAndViolet(svgMarkup: string): void {
  expect(svgMarkup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(svgMarkup).not.toMatch(/\brgba?\s*\(/iu);
  expect(svgMarkup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const m of svgMarkup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(m[1]))).toBe(false);
  }
}

describe("1. 5종 한국 웹툰 정밀 원형 프리셋 & 파라미터 정규화", () => {
  it("ATELIER_CAST_ARCHETYPES가 5종 원형과 고유 등신비(7.5/8.0/7.0/7.8/2.8)를 정확히 정의한다", () => {
    expect(ATELIER_CAST_ARCHETYPES).toHaveLength(5);
    expect(ATELIER_CAST_ARCHETYPES.map((a) => `${a.id}:${a.params.headRatio}`)).toEqual([
      "rofan-noble-lead:7.5",
      "action-hunter-lead:8",
      "campus-romance-lead:7",
      "noir-detective-lead:7.8",
      "chibi-mascot-cast:2.8",
    ]);
    expect(ATELIER_ARCHETYPE_IDS).toHaveLength(5);
  });

  it("미등록 원형·안료 ID 입력 시 기본 원형(rofan-noble-lead)과 기본 안료(character)로 안전 폴백한다", () => {
    expect(getAtelierArchetype("missing-id" as AtelierArchetypeId).id).toBe("rofan-noble-lead");
    expect(getAtelierPigment("missing-pigment" as AtelierPigmentId).id).toBe("character");
  });

  it("normalizeAtelierParams가 키(152~192cm)·등신비(2.5~8.5)·여유(2~14mm)·외곽선(0.6~3.0px) 경계를 정확히 클램핑한다", () => {
    const base = getAtelierArchetype("rofan-noble-lead");
    const low = normalizeAtelierParams(base, { heightCm: 100, headRatio: 1.0, shoulderWidth: 0, waistRatio: 0, outfitClearanceMm: 0, outlineWidthPx: 0 });
    expect(low.heightCm).toBe(ATELIER_PARAM_BOUNDS.heightCm.min);
    expect(low.headRatio).toBe(ATELIER_PARAM_BOUNDS.headRatio.min);
    expect(low.shoulderWidth).toBe(ATELIER_PARAM_BOUNDS.shoulderWidth.min);
    expect(low.outfitClearanceMm).toBe(ATELIER_PARAM_BOUNDS.outfitClearanceMm.min);
    expect(low.outlineWidthPx).toBe(ATELIER_PARAM_BOUNDS.outlineWidthPx.min);

    const high = normalizeAtelierParams(base, { heightCm: 250, headRatio: 12, shoulderWidth: 2, waistRatio: 2, outfitClearanceMm: 40, outlineWidthPx: 10 });
    expect(high.heightCm).toBe(ATELIER_PARAM_BOUNDS.heightCm.max);
    expect(high.headRatio).toBe(ATELIER_PARAM_BOUNDS.headRatio.max);
    expect(high.shoulderWidth).toBe(ATELIER_PARAM_BOUNDS.shoulderWidth.max);
    expect(high.outfitClearanceMm).toBe(ATELIER_PARAM_BOUNDS.outfitClearanceMm.max);
    expect(high.outlineWidthPx).toBe(ATELIER_PARAM_BOUNDS.outlineWidthPx.max);
  });

  it("normalizeAtelierParams가 NaN·Infinity 입력에도 기본 원형 값으로 안전 복원한다", () => {
    const hunter = getAtelierArchetype("action-hunter-lead");
    const safe = normalizeAtelierParams(hunter, { heightCm: Number.NaN, headRatio: Number.POSITIVE_INFINITY, eyeScale: Number.NEGATIVE_INFINITY });
    expect(safe.heightCm).toBe(hunter.params.heightCm);
    expect(safe.headRatio).toBe(hunter.params.headRatio);
    expect(safe.eyeScale).toBe(hunter.params.eyeScale);
  });

  it("5종 원형 기본 파라미터가 normalizeAtelierParams 통과 후 변경 없이 멱등성을 유지한다", () => {
    for (const arch of ATELIER_CAST_ARCHETYPES) {
      expect(normalizeAtelierParams(arch, arch.params)).toEqual(arch.params);
    }
  });

  it("SD 마스코트(chibi-mascot-cast)는 sd-chibi 체제로 판정되고 나머지 4종은 webtoon-humanoid 체제다", () => {
    for (const arch of ATELIER_CAST_ARCHETYPES) {
      const sol = solveAnatomyAndCageRefit(arch.params, "atelier-coupled");
      expect(sol.regime).toBe(arch.id === "chibi-mascot-cast" ? "sd-chibi" : "webtoon-humanoid");
    }
  });
});

describe("2. 해부학 연동 블렌드셰이프 & 의상 케이지 자동 리핏 솔버", () => {
  it("5종 한국 웹툰 원형 전체에서 atelier-coupled 솔버가 메쉬 관통 0건·비율 파탄 0건을 보장한다", () => {
    for (const arch of ATELIER_CAST_ARCHETYPES) {
      const sol = solveAnatomyAndCageRefit(arch.params, "atelier-coupled");
      expect(sol.meshClippingCount).toBe(0);
      expect(sol.proportionBreakCount).toBe(0);
      expect(sol.collarCageClearanceMm).toBeGreaterThanOrEqual(arch.params.outfitClearanceMm);
      expect(sol.clippingHotspotsKo).toHaveLength(0);
    }
  });

  it("극단 체형·헤어·눈 조합 전 구간에서도 atelier-coupled 모드는 관통 0건·파탄 0건을 유지한다", () => {
    const base = getAtelierArchetype("action-hunter-lead");
    const extremeCases = [
      { heightCm: 152, headRatio: 6.0, shoulderWidth: 0.25, waistRatio: 0.4, hairVolume: 0.95, eyeScale: 0.9, eyeSpacing: 0.8, outfitClearanceMm: 2.0 },
      { heightCm: 192, headRatio: 8.5, shoulderWidth: 0.95, waistRatio: 0.9, hairVolume: 0.95, eyeScale: 0.3, eyeSpacing: 0.3, outfitClearanceMm: 14.0 },
      { heightCm: 152, headRatio: 2.8, shoulderWidth: 0.95, waistRatio: 0.9, hairVolume: 0.95, eyeScale: 0.9, eyeSpacing: 0.8, outfitClearanceMm: 3.0 },
    ];
    for (const patch of extremeCases) {
      const sol = solveAnatomyAndCageRefit(normalizeAtelierParams(base, patch), "atelier-coupled");
      expect(sol.meshClippingCount).toBe(0);
      expect(sol.proportionBreakCount).toBe(0);
      expect(sol.collarCageClearanceMm).toBeGreaterThanOrEqual(patch.outfitClearanceMm);
      expect(sol.hairShoulderBufferMm).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("legacy-linear 모드는 관통(>=2건)·비율 파탄(>=2건)과 구체적 원인 핫스팟을 탐지한다", () => {
    const hunter = getAtelierArchetype("action-hunter-lead");
    const legacy = solveAnatomyAndCageRefit(hunter.params, "legacy-linear");
    expect(legacy.meshClippingCount).toBeGreaterThanOrEqual(2);
    expect(legacy.proportionBreakCount).toBeGreaterThanOrEqual(2);
    expect(legacy.clippingHotspotsKo.length).toBeGreaterThanOrEqual(1);
    expect(legacy.clippingHotspotsEn.length).toBeGreaterThanOrEqual(1);
  });

  it("어깨 폭 조절 시 쇄골 폭·갈비뼈 폭·어깨 관절 비틀림 보정각이 연동 보정된다", () => {
    const base = getAtelierArchetype("campus-romance-lead");
    const narrow = solveAnatomyAndCageRefit(normalizeAtelierParams(base, { shoulderWidth: 0.32 }), "atelier-coupled");
    const broad = solveAnatomyAndCageRefit(normalizeAtelierParams(base, { shoulderWidth: 0.88 }), "atelier-coupled");
    expect(broad.clavicleSpanCm).toBeGreaterThan(narrow.clavicleSpanCm);
    expect(broad.ribcageWidthCm).toBeGreaterThan(narrow.ribcageWidthCm);
    expect(broad.shoulderJointTwistDeg).toBeGreaterThan(0);
    expect(narrow.shoulderJointTwistDeg).toBeGreaterThan(0);
  });

  it("의상 리핏 여유(mm) 증가 시 칼라 케이지 여유와 헤어-어깨 완충 간격이 함께 증가한다", () => {
    const base = getAtelierArchetype("rofan-noble-lead");
    const snug = solveAnatomyAndCageRefit(normalizeAtelierParams(base, { outfitClearanceMm: 3.0 }), "atelier-coupled");
    const roomy = solveAnatomyAndCageRefit(normalizeAtelierParams(base, { outfitClearanceMm: 12.0 }), "atelier-coupled");
    expect(roomy.collarCageClearanceMm).toBeGreaterThan(snug.collarCageClearanceMm);
    expect(roomy.hairShoulderBufferMm).toBeGreaterThan(snug.hairShoulderBufferMm);
  });

  it("눈 크기·눈 간격을 최대치로 올려도 atelier-coupled는 관자놀이 안전 여유(>=3.2mm)를 지킨다", () => {
    const base = getAtelierArchetype("rofan-noble-lead");
    const wideEyes = normalizeAtelierParams(base, { eyeScale: 0.9, eyeSpacing: 0.8 });
    const coupled = solveAnatomyAndCageRefit(wideEyes, "atelier-coupled");
    const legacy = solveAnatomyAndCageRefit(wideEyes, "legacy-linear");
    expect(coupled.eyeTempleMarginMm).toBeGreaterThanOrEqual(3.2);
    expect(coupled.eyeTempleMarginMm).toBeGreaterThan(legacy.eyeTempleMarginMm);
  });

  it("atelier-coupled는 3회 케이지 리핏 반복을 수행하고 legacy-linear는 0회로 미보정 상태를 보고한다", () => {
    const p = getAtelierArchetype("noir-detective-lead").params;
    expect(solveAnatomyAndCageRefit(p, "atelier-coupled").refitIterations).toBe(3);
    expect(solveAnatomyAndCageRefit(p, "legacy-linear").refitIterations).toBe(0);
  });
});

describe("3. PrismLight WebGPU WGSL 정적 계약 · 16B Uniform 패킹 · 5패스 파이프라인", () => {
  it("ATELIER_CAST_WEBGPU_LOOKDEV_WGSL이 정적 계약 검증을 통과하고 gpuCompiled=false 사실을 명시한다", () => {
    const report = validateAtelierCastWgsl(ATELIER_CAST_WEBGPU_LOOKDEV_WGSL);
    expect(report.valid).toBe(true);
    expect(report.validationKind).toBe("static-source-contract");
    expect(report.gpuCompiled).toBe(false);
    expect(report.balancedDelimiters).toBe(true);
    expect(report.reservedKeywordCollisions).toHaveLength(0);
    expect(report.bindingCount).toBe(5);
    expect(report.withinBindingLimit).toBe(true);
    expect(report.entryPoints).toEqual([
      "atelier_cast_compute_skinning",
      "tooncore_adaptive_outline_vs",
      "prismlight_lookdev_fs",
    ]);
  });

  it("WGSL 소스가 컴퓨트 스키닝·Face-SDF·3층 안구·헤어 엔젤링·테이퍼 외곽선 함수를 모두 포함한다", () => {
    const report = validateAtelierCastWgsl(ATELIER_CAST_WEBGPU_LOOKDEV_WGSL);
    expect(report.hasComputeSkinningEntry).toBe(true);
    expect(report.hasFaceSdfFunction).toBe(true);
    expect(report.hasThreeLayerEyeFunction).toBe(true);
    expect(report.hasHairAngelRingFunction).toBe(true);
    expect(report.hasAdaptiveOutlineEntry).toBe(true);
  });

  it("괄호 불균형·예약어 충돌·함수 누락 WGSL은 검증기가 오류로 정확히 차단한다", () => {
    const broken = validateAtelierCastWgsl("fn bad_shader( { let class = 1.0; }");
    expect(broken.valid).toBe(false);
    expect(broken.balancedDelimiters).toBe(false);
    expect(broken.reservedKeywordCollisions).toContain("class");
    expect(broken.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("packAtelierCastLookdevUniforms가 128B 16바이트 정렬 버퍼에 파라미터와 OKLCH 톤을 정확히 패킹한다", () => {
    const arch = getAtelierArchetype("rofan-noble-lead");
    const harmony = buildAtelierPigmentHarmony("draw", "atelier-coupled");
    const packed = packAtelierCastLookdevUniforms(arch.params, harmony);
    expect(packed.byteLength).toBe(ATELIER_UNIFORM_BYTE_SIZE);
    expect(packed.aligned16Bytes).toBe(true);
    expect(packed.floatView[0]).toBeCloseTo(arch.params.heightCm, 2);
    expect(packed.floatView[1]).toBeCloseTo(arch.params.headRatio, 2);
    expect(packed.floatView[7]).toBeCloseTo(arch.params.outfitClearanceMm, 2);
    expect(packed.floatView[8]).toBeCloseTo(arch.params.outlineWidthPx, 2);
  });

  it("ATELIER_WEBGPU_RENDER_PASSES가 5패스 순서를 지키며 ToonCore·PrismLight·AtelierCast 브랜드만 사용한다", () => {
    expect(ATELIER_WEBGPU_RENDER_PASSES).toHaveLength(5);
    expect(ATELIER_WEBGPU_RENDER_PASSES.map((p) => p.order)).toEqual([1, 2, 3, 4, 5]);
    const allowedBrands = new Set([ATELIER_CAST_BRAND, ATELIER_LOOKDEV_BRAND, ATELIER_RUNTIME_BRAND]);
    for (const pass of ATELIER_WEBGPU_RENDER_PASSES) {
      expect(allowedBrands.has(pass.brandLayer)).toBe(true);
    }
  });

  it("WGSL 컴퓨트 스키닝 패스가 @workgroup_size(64, 1, 1) 규격을 선언한다", () => {
    const report = validateAtelierCastWgsl();
    expect(report.workgroupSizes).toContain("64, 1, 1");
  });
});

describe("4. 단일 탈-바이올렛 OKLCH 5안료 룩뎁 조화 패스", () => {
  it("ATELIER_PIGMENT_PALETTES 5안료가 모두 바이올렛 금지 대역(265°~325°) 바깥에 위치한다", () => {
    expect(ATELIER_PIGMENT_PALETTES).toHaveLength(5);
    expect(ATELIER_PIGMENT_PALETTES.map((p) => p.id)).toEqual([...ATELIER_PIGMENT_IDS]);
    for (const p of ATELIER_PIGMENT_PALETTES) {
      expect(isVioletSlopHue(p.hueDeg)).toBe(false);
      expect(isVioletSlopHue(p.darkAnchor.h)).toBe(false);
      expect(isVioletSlopHue(p.lightAnchor.h)).toBe(false);
    }
  });

  it("5안료 × 2모드 전체 조화 패스에서 바이올렛 위반 토큰이 단 1건도 발생하지 않는다", () => {
    for (const pid of ATELIER_PIGMENT_IDS) {
      for (const mode of ["atelier-coupled", "legacy-linear"] as const) {
        const harmony = buildAtelierPigmentHarmony(pid, mode);
        expect(harmony.violetViolationCount).toBe(0);
        expect(harmony.inspectedTokenCount).toBeGreaterThanOrEqual(19);
      }
    }
  });

  it("sanitizeNonVioletHue와 normalizeHue가 바이올렛 휴와 음수/초과 각도를 안전 범위로 보정한다", () => {
    expect(normalizeHue(-30)).toBe(330);
    expect(normalizeHue(432)).toBe(72);
    expect(isVioletSlopHue(285)).toBe(true);
    expect(isVioletSlopHue(sanitizeNonVioletHue(285))).toBe(false);
    expect(isVioletSlopHue(sanitizeNonVioletHue(312))).toBe(false);
  });

  it("formatOklch가 원시 hex/rgb/hsl 없이 유효한 oklch 문자열을 생성하고 바이올렛 휴를 차단한다", () => {
    const solid = formatOklch({ l: 0.72, c: 0.15, h: 290 });
    const alpha = formatOklch({ l: 0.79, c: 0.158, h: 72 }, 0.25);
    expect(solid).toMatch(/^oklch\([\d.]+ [\d.]+ \d+(?:\.\d+)?\)$/u);
    expect(alpha).toMatch(/^oklch\([\d.]+ [\d.]+ \d+(?:\.\d+)? \/ [\d.]+\)$/u);
    expect(solid).not.toContain("290");
  });

  it("atelier-coupled 룩뎁 조화 패스가 구형 모드보다 높은 톤 일관성과 따뜻한 피부 음영 채도를 제공한다", () => {
    const coupled = buildAtelierPigmentHarmony("draw", "atelier-coupled");
    const legacy = buildAtelierPigmentHarmony("draw", "legacy-linear");
    expect(coupled.toneCohesionScore).toBeGreaterThan(legacy.toneCohesionScore);
    expect(coupled.skinSdfShadow.c).toBeGreaterThan(legacy.skinSdfShadow.c);
  });
});

describe("5. WebGPU 기본 3D 협상 정책 · 4축 품질 평가기 · apps/character-lab 통합 계약", () => {
  it("navigator.gpu 하드웨어 감지 시 ToonCore WebGPU 기본 5패스 실행을 선택한다", () => {
    const neg = negotiateAtelier3dWebGpuDefault({ hasNavigatorGpu: true, adapterAvailable: true, isFallbackAdapter: false });
    expect(neg.policy).toBe("webgpu-default");
    expect(neg.activeBackend).toBe("webgpu");
    expect(neg.laneId).toBe("tooncore-webgpu-default");
    expect(neg.fallbackTriggered).toBe(false);
    expect(neg.computeSkinningEnabled).toBe(true);
    expect(neg.instancedHairEnabled).toBe(true);
    expect(neg.activePassCount).toBe(5);
  });

  it("navigator.gpu 미지원 환경에서 WebGL2 투명 폴백으로 자동 전환한다", () => {
    const neg = negotiateAtelier3dWebGpuDefault({ hasNavigatorGpu: false, supportsWebGl2: true });
    expect(neg.activeBackend).toBe("webgl2");
    expect(neg.laneId).toBe("tooncore-webgl2-fallback");
    expect(neg.fallbackTriggered).toBe(true);
    expect(neg.faceSdfPassEnabled).toBe(true);
    expect(neg.activePassCount).toBe(4);
  });

  it("소프트웨어 WebGPU 폴백 어댑터는 제외하고 WebGL2 투명 폴백으로 전환한다", () => {
    const neg = negotiateAtelier3dWebGpuDefault({ hasNavigatorGpu: true, adapterAvailable: true, isFallbackAdapter: true, supportsWebGl2: true });
    expect(neg.activeBackend).toBe("webgl2");
    expect(neg.fallbackTriggered).toBe(true);
    expect(neg.reasonKo).toContain("소프트웨어 WebGPU");
  });

  it("WebGPU·WebGL2가 모두 없는 환경에서는 시맨틱 SVG 안전 프리뷰로 폴백한다", () => {
    const neg = negotiateAtelier3dWebGpuDefault({ hasNavigatorGpu: false, supportsWebGl2: false });
    expect(neg.activeBackend).toBe("svg-preview");
    expect(neg.laneId).toBe("atelier-svg-safe-preview");
    expect(neg.activePassCount).toBe(1);
  });

  it("evaluateCharacterCustomQuality가 4축 점수에서 구형 선형 대비 +35pt 이상 개선을 증명한다", () => {
    const params = getAtelierArchetype("action-hunter-lead").params;
    const coupled = evaluateCharacterCustomQuality(params, { solverMode: "atelier-coupled", pigmentId: "3d" });
    const legacy = evaluateCharacterCustomQuality(params, { solverMode: "legacy-linear", pigmentId: "3d" });
    expect(coupled.axes).toHaveLength(4);
    expect(coupled.overallScore).toBeGreaterThanOrEqual(92);
    expect(coupled.improvementPoints).toBeGreaterThanOrEqual(35);
    expect(coupled.faceSdfSmoothnessPct).toBeGreaterThan(legacy.faceSdfSmoothnessPct);
    expect(coupled.eyeParallaxLayers).toBe(3);
    expect(legacy.eyeParallaxLayers).toBe(1);
  });

  it("apps/character-lab 통합 계약이 5개 실제 스튜디오 라우트 매핑·6개 체크리스트·교차 앱 직접 import 0건을 제공한다", () => {
    const summary = summarizeCharacterLabIntegration();
    expect(summary.totalItems).toBe(CHARACTER_LAB_INTEGRATION_CHECKLIST.length);
    expect(summary.totalItems).toBe(6);
    expect(summary.contractReadyCount).toBe(4);
    expect(summary.plannedMigrationCount).toBe(2);
    expect(summary.routeCount).toBe(CHARACTER_LAB_ROUTE_MAPPINGS.length);
    expect(summary.crossAppDirectImports).toBe(0);
    expect(summary.routeMappings.map((r) => r.studioRoute)).toEqual([
      "/studio/assets/characters/new",
      "/studio/character",
      "/studio/poser",
      "/studio/work/:workId/character",
      "/studio/character-convert",
    ]);
  });

  it("buildAtelierCastSnapshot과 exportAtelierCastManifestJson이 유효한 매니페스트 JSON을 왕복 생성한다", () => {
    const snap = buildAtelierCastSnapshot({ archetypeId: "noir-detective-lead", solverMode: "atelier-coupled" });
    const json = exportAtelierCastManifestJson(snap);
    const parsed = JSON.parse(json) as {
      schemaVersion: string;
      brands: { customizer: string; lookdev: string; runtime: string };
      anatomyRefit: { meshClippingCount: number; proportionBreakCount: number };
      webGpuDefaultPolicy: { activeBackend: string };
      oklchHarmony: { violetViolationCount: number };
    };
    expect(parsed.schemaVersion).toBe(ATELIER_CAST_SCHEMA_VERSION);
    expect(parsed.brands).toEqual({ customizer: "AtelierCast", lookdev: "PrismLight", runtime: "ToonCore" });
    expect(parsed.anatomyRefit.meshClippingCount).toBe(0);
    expect(parsed.anatomyRefit.proportionBreakCount).toBe(0);
    expect(parsed.webGpuDefaultPolicy.activeBackend).toBe("webgpu");
    expect(parsed.oklchHarmony.violetViolationCount).toBe(0);
  });
});

describe("6. StudioAtelierCastPanel UI 인터랙션 · 2단 시맨틱 SVG · 로케일/콜백 검증", () => {
  it("props 없이 기본 렌더링(<StudioAtelierCastPanel />) 시 WebGPU 기본·관통 0건·2단 SVG가 정상 표시된다", () => {
    render(<StudioAtelierCastPanel />);
    expect(screen.getByTestId("atelier-cast-panel")).toBeTruthy();
    expect(screen.getByTestId("atelier-cast-backend-badge").textContent).toContain("WebGPU");
    expect(screen.getByTestId("atelier-cast-clipping-badge").textContent).toContain("관통 0건");
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-clipping-count")).toBe("0");
    expect(screen.getByTestId("atelier-cast-webgpu-svg").getAttribute("data-active-backend")).toBe("webgpu");
    expect(screen.getByTestId("atelier-cast-face-sdf-curve")).toBeTruthy();
  });

  it("5종 웹툰 원형 카드 클릭 시 등신비·원형 속성 및 onCharacterChange 콜백이 즉시 갱신된다", () => {
    const onCharacterChange = vi.fn();
    render(<StudioAtelierCastPanel onCharacterChange={onCharacterChange} />);

    fireEvent.click(screen.getByTestId("atelier-cast-archetype-action-hunter-lead"));
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-archetype-id")).toBe("action-hunter-lead");
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-head-ratio")).toBe("8.0");

    fireEvent.click(screen.getByTestId("atelier-cast-archetype-chibi-mascot-cast"));
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-archetype-id")).toBe("chibi-mascot-cast");
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-head-ratio")).toBe("2.8");
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-clipping-count")).toBe("0");
    expect(onCharacterChange).toHaveBeenCalledTimes(2);
  });

  it("키·등신비·어깨·허리·턱선·눈 크기·눈 간격·헤어·의상 여유·외곽선 슬라이더 변경 시 실시간 반영되며 관통 0건을 유지한다", () => {
    render(<StudioAtelierCastPanel />);
    fireEvent.change(screen.getByTestId("atelier-cast-slider-heightCm"), { target: { value: "190" } });
    fireEvent.change(screen.getByTestId("atelier-cast-slider-headRatio"), { target: { value: "8.4" } });
    fireEvent.change(screen.getByTestId("atelier-cast-slider-shoulderWidth"), { target: { value: "0.9" } });
    fireEvent.change(screen.getByTestId("atelier-cast-slider-outfitClearanceMm"), { target: { value: "11.5" } });
    fireEvent.change(screen.getByTestId("atelier-cast-slider-outlineWidthPx"), { target: { value: "2.4" } });

    expect(screen.getByTestId("atelier-cast-value-heightCm").textContent).toBe("190cm");
    expect(screen.getByTestId("atelier-cast-value-headRatio").textContent).toBe("8.4등신");
    expect(screen.getByTestId("atelier-cast-value-shoulderWidth").textContent).toBe("90%");
    expect(screen.getByTestId("atelier-cast-value-outfitClearanceMm").textContent).toBe("11.5mm");
    expect(screen.getByTestId("atelier-cast-value-outlineWidthPx").textContent).toBe("2.40px");
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-clipping-count")).toBe("0");
  });

  it("WebGPU 기본 vs 구형 선형 스케일 비교 토글 시 Face-SDF와 구형 삼각형 그림자·관통 경고가 즉시 전환된다", () => {
    render(<StudioAtelierCastPanel />);
    expect(screen.queryByTestId("atelier-cast-legacy-phong-tri")).toBeNull();
    expect(screen.queryByTestId("atelier-cast-clipping-warning")).toBeNull();

    fireEvent.click(screen.getByTestId("atelier-cast-mode-legacy"));
    expect(screen.getByTestId("atelier-cast-legacy-phong-tri")).toBeTruthy();
    expect(screen.getByTestId("atelier-cast-clipping-warning")).toBeTruthy();
    expect(Number(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-clipping-count"))).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByTestId("atelier-cast-mode-coupled"));
    expect(screen.getByTestId("atelier-cast-face-sdf-curve")).toBeTruthy();
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-clipping-count")).toBe("0");
  });

  it("WebGL2 투명 폴백 체험 토글 및 5안료 버튼 클릭이 우측 파이프라인 SVG와 배지를 갱신한다", () => {
    render(<StudioAtelierCastPanel />);
    fireEvent.click(screen.getByTestId("atelier-cast-fallback-toggle"));
    expect(screen.getByTestId("atelier-cast-webgpu-svg").getAttribute("data-active-backend")).toBe("webgl2");
    expect(screen.getByTestId("atelier-cast-webgpu-svg").getAttribute("data-pass-count")).toBe("4");

    fireEvent.click(screen.getByTestId("atelier-cast-pigment-market"));
    expect(screen.getByTestId("atelier-cast-pigment-market").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("atelier-cast-violet-badge").textContent).toContain("바이올렛 0건");
  });

  it("JSON/WGSL 복사 및 미리보기 드로어 전환과 onExportJson 콜백이 정상 동작한다", async () => {
    const onExportJson = vi.fn();
    render(<StudioAtelierCastPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("atelier-cast-code-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("atelier-cast-copy-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(onExportJson.mock.calls[0]?.[0]).toContain(ATELIER_CAST_SCHEMA_VERSION);
    expect(screen.getByTestId("atelier-cast-code-preview").getAttribute("data-preview-kind")).toBe("json");

    fireEvent.click(screen.getByTestId("atelier-cast-copy-wgsl-btn"));
    expect(screen.getByTestId("atelier-cast-code-preview").getAttribute("data-preview-kind")).toBe("wgsl");
    expect(screen.getByTestId("atelier-cast-code-preview").textContent).toContain("prismlight_eval_face_sdf");

    fireEvent.click(screen.getByTestId("atelier-cast-preview-wgsl-btn"));
    expect(screen.queryByTestId("atelier-cast-code-preview")).toBeNull();
  });

  it("초기화 버튼 클릭 시 수정한 원형·비교 모드·폴백 상태가 모두 초기값으로 복원된다", () => {
    render(<StudioAtelierCastPanel initialArchetypeId="campus-romance-lead" />);
    fireEvent.click(screen.getByTestId("atelier-cast-archetype-noir-detective-lead"));
    fireEvent.click(screen.getByTestId("atelier-cast-mode-legacy"));
    fireEvent.click(screen.getByTestId("atelier-cast-reset-btn"));

    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-archetype-id")).toBe("campus-romance-lead");
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-solver-mode")).toBe("atelier-coupled");
    expect(screen.getByTestId("atelier-cast-webgpu-svg").getAttribute("data-active-backend")).toBe("webgpu");
  });

  it("영문 로케일(locale='en') 및 initialArchetypeId 선택적 props를 정확히 렌더링한다", () => {
    render(<StudioAtelierCastPanel locale="en" initialArchetypeId="noir-detective-lead" />);
    expect(screen.getByTestId("atelier-cast-panel").getAttribute("aria-label")).toContain("AtelierCast");
    expect(screen.getByTestId("atelier-cast-anatomy-svg").getAttribute("data-archetype-id")).toBe("noir-detective-lead");
    expect(screen.getByTestId("atelier-cast-value-headRatio").textContent).toBe("7.8H");
    expect(screen.getByTestId("atelier-cast-route-mapping-list").textContent).toContain("/studio/character");
  });
});

describe("7. 엄격 품질·하네스 계약 · 100% 고유 브랜드 · Calm Atelier 자가 감사", () => {
  it("소유 4개 파일 존재, 줄 수 상한(engine<=740, panel<=680, all<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "atelier-cast-engine.ts",
      "StudioAtelierCastPanel.tsx",
      "index.ts",
      "atelier-cast.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "atelier-cast-engine.ts") expect(lines).toBeLessThanOrEqual(740);
      if (file === "StudioAtelierCastPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "atelier-cast.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioAtelierCastPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("소유 4개 파일 전체에 외부 경쟁사·라이브러리 제품명이 0건이고 고유 브랜드(AtelierCast·PrismLight·ToonCore)만 사용한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const forbiddenTerms = [
      ["Sha", "pr3D"], ["C", "SP"], ["Blen", "der"], ["Vel", "lo"], ["Hoku", "sai"],
      ["Pro", "create"], ["Photo", "shop"], ["Mag", "ma"], ["Reb", "elle"],
    ].map(([a, b]) => `${a}${b}`);
    const forbiddenRegex = new RegExp(`\\b(?:${forbiddenTerms.join("|")})\\b`, "iu");

    for (const file of readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f))) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toMatch(forbiddenRegex);
    }

    const engineSrc = readFileSync(path.join(dir, "atelier-cast-engine.ts"), "utf8");
    expect(engineSrc).toContain("AtelierCast");
    expect(engineSrc).toContain("PrismLight");
    expect(engineSrc).toContain("ToonCore");
  });

  it("렌더된 모든 버튼이 min-h-11을 준수하고 2단 SVG 마크업에 원시 색·바이올렛 휴가 0건이다", () => {
    const { container } = render(<StudioAtelierCastPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(16);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(2);
    for (const svg of svgs) {
      assertSvgZeroRawAndViolet(svg.outerHTML);
    }
  });
});
