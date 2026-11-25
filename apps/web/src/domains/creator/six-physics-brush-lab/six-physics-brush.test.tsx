// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_COMMON_STROKE_INPUT,
  MIN_GPEN_SDF_DPI,
  SIX_PHYSICS_BRUSH_ENGINES,
  SIX_PHYSICS_MANIFEST_SCHEMA_VERSION,
  STROKE_SCENARIO_PRESETS,
  StudioSixPhysicsBrushLabPanel,
  compareBrushPhysicsDivergence,
  exportBrushPhysicsManifestJson,
  formatOklch,
  getPhysicsBrushEngineSpec,
  isVioletHueDeg,
  normalizeBrushStrokeInput,
  sanitizeNonVioletOklch,
  simulatePhysicsBrushStroke,
  type BrushPhysicsPipelineManifest,
  type PhysicsBrushEngineId,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const ALL_ENGINE_IDS: readonly PhysicsBrushEngineId[] = [
  "watercolor-curtis97",
  "oil-wetbrush15",
  "sumi-moxi05",
  "drymedia-sousa99",
  "gpen-loopblinn05",
  "marker-foil-pbr",
];

describe("1. 6대 독립 물리 브러시 엔진 아키텍처 스펙 및 논문 출처 (산식 회귀이며 물리 재현 검증 아님)", () => {
  it("6대 브러시 계열이 요구된 정확한 ID 순서로 등록되어 있다", () => {
    expect(SIX_PHYSICS_BRUSH_ENGINES).toHaveLength(6);
    expect(SIX_PHYSICS_BRUSH_ENGINES.map((engine) => engine.id)).toEqual(ALL_ENGINE_IDS);
  });

  it("6대 엔진의 GPU 상태 버퍼 ID가 단 하나도 중복되지 않는다(18개 완전 분리)", () => {
    const allBufferIds = SIX_PHYSICS_BRUSH_ENGINES.flatMap((engine) => engine.stateBuffers.map((buf) => buf.id));
    expect(allBufferIds).toHaveLength(18);
    expect(new Set(allBufferIds).size).toBe(18);
  });

  it("각 설계 예제가 WGSL 이름·3개 패스·미완성 엔트리포인트 문자열을 보유한다", () => {
    const pipelineIds = SIX_PHYSICS_BRUSH_ENGINES.map((engine) => engine.wgslPipeline.pipelineId);
    expect(new Set(pipelineIds).size).toBe(6);
    for (const engine of SIX_PHYSICS_BRUSH_ENGINES) {
      expect(engine.wgslPipeline.passNames).toHaveLength(3);
      expect(engine.wgslPipeline.wgslSnippet).toMatch(/@(?:compute|fragment)/u);
      expect(engine.paperCitation.paperTitle.length).toBeGreaterThan(10);
      expect(engine.paperCitation.authors.length).toBeGreaterThan(5);
    }
  });

  it("6대 엔진이 혼색·에지 거동·입체 높이 모델·지배 방정식 계열 모두 고유하게 분리되어 있다", () => {
    expect(new Set(SIX_PHYSICS_BRUSH_ENGINES.map((e) => e.colorMixing)).size).toBe(6);
    expect(new Set(SIX_PHYSICS_BRUSH_ENGINES.map((e) => e.edgeBehavior)).size).toBe(6);
    expect(new Set(SIX_PHYSICS_BRUSH_ENGINES.map((e) => e.heightModel)).size).toBe(6);
    expect(new Set(SIX_PHYSICS_BRUSH_ENGINES.map((e) => e.governingEquationFamily)).size).toBe(6);
  });

  it("모든 엔진의 OKLCH 안료·강조색이 바이올렛 대역(270~320°)을 0% 배제하며 sanitizeNonVioletOklch가 방어한다", () => {
    for (const engine of SIX_PHYSICS_BRUSH_ENGINES) {
      expect(isVioletHueDeg(engine.pigmentOklch.h)).toBe(false);
      expect(isVioletHueDeg(engine.accentOklch.h)).toBe(false);
      expect(formatOklch(engine.pigmentOklch)).toMatch(/^oklch\(/u);
    }
    const sanitized = sanitizeNonVioletOklch({ l: 0.55, c: 0.16, h: 292 });
    expect(isVioletHueDeg(sanitized.h)).toBe(false);
    expect(sanitized.h).toBe(235);
  });
});

describe("2. 수채화 유체 엔진 (watercolor-curtis97 · Curtis et al. SIGGRAPH 1997)", () => {
  it("3층(천수 속도·안료 이류·모세관 에지) 시뮬레이션 지표를 모두 산출한다", () => {
    const sim = simulatePhysicsBrushStroke("watercolor-curtis97", {
      pressure: 0.7, waterSolventLoad: 0.75, paperAbsorbency: 0.8, velocityPxPerSec: 400, repeatPasses: 2,
    });
    expect(sim.physics.kind).toBe("watercolor-curtis97");
    if (sim.physics.kind !== "watercolor-curtis97") throw new Error("unexpected kind");
    expect(sim.physics.shallowWaterPeakVelocity).toBeGreaterThan(2);
    expect(sim.physics.pigmentAdvectionFlux).toBeGreaterThan(0.3);
    expect(sim.physics.capillaryEdgeDeposit).toBeGreaterThan(0.3);
    expect(sim.physics.edgeDarkeningRatio).toBeGreaterThan(1.4);
    expect(sim.physics.bleedRadiusMm).toBeGreaterThan(2.5);
  });

  it("물 함량에 따른 가장자리 색 농축비(edgeDarkeningRatio)가 비선형 모세관 곡선을 보인다", () => {
    const dry = simulatePhysicsBrushStroke("watercolor-curtis97", { waterSolventLoad: 0, paperAbsorbency: 0.85 });
    const midWet = simulatePhysicsBrushStroke("watercolor-curtis97", { waterSolventLoad: 0.72, paperAbsorbency: 0.85 });
    const flooded = simulatePhysicsBrushStroke("watercolor-curtis97", { waterSolventLoad: 1.0, paperAbsorbency: 0.85 });
    if (dry.physics.kind !== "watercolor-curtis97" || midWet.physics.kind !== "watercolor-curtis97" || flooded.physics.kind !== "watercolor-curtis97") {
      throw new Error("unexpected kind");
    }
    expect(dry.physics.edgeDarkeningRatio).toBe(1);
    expect(midWet.physics.edgeDarkeningRatio).toBeGreaterThan(1.7);
    expect(midWet.physics.edgeDarkeningRatio).toBeGreaterThan(flooded.physics.edgeDarkeningRatio);
  });

  it("종이 흡수율이 높을수록 에지 농축비와 번짐 반경이 함께 증가한다", () => {
    const lowAbs = simulatePhysicsBrushStroke("watercolor-curtis97", { waterSolventLoad: 0.7, paperAbsorbency: 0.2 });
    const highAbs = simulatePhysicsBrushStroke("watercolor-curtis97", { waterSolventLoad: 0.7, paperAbsorbency: 0.95 });
    if (lowAbs.physics.kind !== "watercolor-curtis97" || highAbs.physics.kind !== "watercolor-curtis97") throw new Error("unexpected kind");
    expect(highAbs.physics.edgeDarkeningRatio).toBeGreaterThan(lowAbs.physics.edgeDarkeningRatio);
    expect(highAbs.physics.bleedRadiusMm).toBeGreaterThan(lowAbs.physics.bleedRadiusMm);
  });

  it("빠른 붓질은 체류 시간을 줄여 번짐 반경을 축소하며 표면 두께는 평탄(<=0.05mm)하게 유지한다", () => {
    const slow = simulatePhysicsBrushStroke("watercolor-curtis97", { velocityPxPerSec: 180, waterSolventLoad: 0.8 });
    const fast = simulatePhysicsBrushStroke("watercolor-curtis97", { velocityPxPerSec: 2500, waterSolventLoad: 0.8 });
    if (slow.physics.kind !== "watercolor-curtis97" || fast.physics.kind !== "watercolor-curtis97") throw new Error("unexpected kind");
    expect(slow.physics.bleedRadiusMm).toBeGreaterThan(fast.physics.bleedRadiusMm);
    expect(slow.paintThicknessMm).toBeLessThanOrEqual(0.05);
  });
});

describe("3. 유화·임파스토 엔진 (oil-wetbrush15 · Baxter '01 + Wetbrush '15)", () => {
  it("3D 탄성 브리슬·양방향 픽업/침착·높이필드·Sobel 45° 광택·Kubelka-Munk 지표를 산출한다", () => {
    const sim = simulatePhysicsBrushStroke("oil-wetbrush15", { pressure: 0.85, tiltDeg: 30, waterSolventLoad: 0.2, repeatPasses: 2 });
    expect(sim.physics.kind).toBe("oil-wetbrush15");
    if (sim.physics.kind !== "oil-wetbrush15") throw new Error("unexpected kind");
    expect(sim.physics.bristleBendDeg).toBeGreaterThan(45);
    expect(sim.physics.canvasPickupRatio).toBeGreaterThan(0.2);
    expect(sim.physics.depositionVolumeMm3).toBeGreaterThan(1.2);
    expect(sim.physics.paintThicknessMm).toBeGreaterThan(1.0);
    expect(sim.physics.highlight45Specular).toBeGreaterThan(0.5);
    expect(sim.physics.kubelkaMunkBlendRatio).toBeGreaterThan(0.5);
  });

  it("필압이 강해질수록 임파스토 물감 두께(paintThicknessMm)와 Sobel 법선 기울기가 커진다", () => {
    const light = simulatePhysicsBrushStroke("oil-wetbrush15", { pressure: 0.15, waterSolventLoad: 0.2 });
    const heavy = simulatePhysicsBrushStroke("oil-wetbrush15", { pressure: 0.95, waterSolventLoad: 0.2 });
    if (light.physics.kind !== "oil-wetbrush15" || heavy.physics.kind !== "oil-wetbrush15") throw new Error("unexpected kind");
    expect(heavy.physics.paintThicknessMm).toBeGreaterThan(light.physics.paintThicknessMm * 2);
    expect(heavy.physics.sobelNormalSlope).toBeGreaterThan(light.physics.sobelNormalSlope);
  });

  it("테레빈/린시드 용제량이 늘어나면 점도와 두께가 낮아지고 캔버스 픽업 비율이 증가한다", () => {
    const stiff = simulatePhysicsBrushStroke("oil-wetbrush15", { pressure: 0.8, waterSolventLoad: 0.1 });
    const thinned = simulatePhysicsBrushStroke("oil-wetbrush15", { pressure: 0.8, waterSolventLoad: 0.9 });
    if (stiff.physics.kind !== "oil-wetbrush15" || thinned.physics.kind !== "oil-wetbrush15") throw new Error("unexpected kind");
    expect(thinned.physics.viscosity).toBeLessThan(stiff.physics.viscosity);
    expect(thinned.physics.paintThicknessMm).toBeLessThan(stiff.physics.paintThicknessMm);
    expect(thinned.physics.canvasPickupRatio).toBeGreaterThan(stiff.physics.canvasPickupRatio);
  });

  it("동일 강필압 입력에서 수채화·먹물·G펜보다 압도적으로 두꺼운 3D 높이필드를 생성한다", () => {
    const input = { pressure: 0.85, waterSolventLoad: 0.25, velocityPxPerSec: 300, repeatPasses: 3 };
    const oil = simulatePhysicsBrushStroke("oil-wetbrush15", input);
    const wc = simulatePhysicsBrushStroke("watercolor-curtis97", input);
    const sumi = simulatePhysicsBrushStroke("sumi-moxi05", input);
    const gpen = simulatePhysicsBrushStroke("gpen-loopblinn05", input);
    expect(oil.paintThicknessMm).toBeGreaterThan(wc.paintThicknessMm * 20);
    expect(oil.paintThicknessMm).toBeGreaterThan(sumi.paintThicknessMm * 50);
    expect(oil.paintThicknessMm).toBeGreaterThan(gpen.paintThicknessMm * 30);
  });
});

describe("4. 먹물·갈필 MoXi 엔진 (sumi-moxi05 · Chu & Tai SIGGRAPH 2005)", () => {
  it("안정적인 LBM 이완시간(tau > 0.5)과 이방성 섬유 확산·활성 모발수를 산출한다", () => {
    const sim = simulatePhysicsBrushStroke("sumi-moxi05", { velocityPxPerSec: 600, waterSolventLoad: 0.6, paperAbsorbency: 0.8 });
    expect(sim.physics.kind).toBe("sumi-moxi05");
    if (sim.physics.kind !== "sumi-moxi05") throw new Error("unexpected kind");
    expect(sim.physics.lbmRelaxationTau).toBeGreaterThan(0.5);
    expect(sim.physics.lbmAnisotropyRatio).toBeGreaterThan(2.0);
    expect(sim.physics.activeFilaments).toBeGreaterThanOrEqual(2);
    expect(sim.physics.activeFilaments).toBeLessThanOrEqual(16);
  });

  it("고속 붓질과 잉크 고갈 조건에서 갈필 모발 분기수(activeFilaments)가 급감하고 비백 간극이 커진다", () => {
    const wetSlow = simulatePhysicsBrushStroke("sumi-moxi05", { velocityPxPerSec: 180, waterSolventLoad: 0.88, pressure: 0.75 });
    const dryFast = simulatePhysicsBrushStroke("sumi-moxi05", { velocityPxPerSec: 2500, waterSolventLoad: 0.12, pressure: 0.25 });
    if (wetSlow.physics.kind !== "sumi-moxi05" || dryFast.physics.kind !== "sumi-moxi05") throw new Error("unexpected kind");
    expect(wetSlow.physics.activeFilaments).toBeGreaterThanOrEqual(13);
    expect(dryFast.physics.activeFilaments).toBeLessThanOrEqual(5);
    expect(dryFast.physics.flyingWhiteGapRatio).toBeGreaterThan(wetSlow.physics.flyingWhiteGapRatio * 4);
  });

  it("종이 흡수율이 높을수록 LBM 섬유 이방성 비율과 번짐 폭이 증가한다", () => {
    const lowAbs = simulatePhysicsBrushStroke("sumi-moxi05", { paperAbsorbency: 0.15, waterSolventLoad: 0.7 });
    const highAbs = simulatePhysicsBrushStroke("sumi-moxi05", { paperAbsorbency: 0.95, waterSolventLoad: 0.7 });
    if (lowAbs.physics.kind !== "sumi-moxi05" || highAbs.physics.kind !== "sumi-moxi05") throw new Error("unexpected kind");
    expect(highAbs.physics.lbmAnisotropyRatio).toBeGreaterThan(lowAbs.physics.lbmAnisotropyRatio);
    expect(highAbs.physics.fiberFeatheringMm).toBeGreaterThan(lowAbs.physics.fiberFeatheringMm);
  });

  it("먹물은 섬유 내부로 침투하므로 표면 융기 두께가 0.01mm로 유지된다", () => {
    const sim = simulatePhysicsBrushStroke("sumi-moxi05", { pressure: 0.95, repeatPasses: 5 });
    expect(sim.paintThicknessMm).toBe(0.01);
  });
});

describe("5. 크레용·흑연 연필 엔진 (drymedia-sousa99 · Sousa & Buchanan SIGGRAPH 1999)", () => {
  it("약필압에서 이중 스케일 종이 봉우리만 클리핑되어 골짜기가 노출된다", () => {
    const light = simulatePhysicsBrushStroke("drymedia-sousa99", { pressure: 0.12, tiltDeg: 45, repeatPasses: 1 });
    expect(light.physics.kind).toBe("drymedia-sousa99");
    if (light.physics.kind !== "drymedia-sousa99") throw new Error("unexpected kind");
    expect(light.physics.peakClippingRatio).toBeGreaterThan(0.8);
    expect(light.physics.valleyFill).toBeLessThan(0.2);
  });

  it("스타일러스 기울기가 커지면 옆면 섀이딩 폭 배수와 유효 획 폭이 크게 확장된다", () => {
    const upright = simulatePhysicsBrushStroke("drymedia-sousa99", { tiltDeg: 5, pressure: 0.5 });
    const angled = simulatePhysicsBrushStroke("drymedia-sousa99", { tiltDeg: 70, pressure: 0.5 });
    if (upright.physics.kind !== "drymedia-sousa99" || angled.physics.kind !== "drymedia-sousa99") throw new Error("unexpected kind");
    expect(angled.physics.sideShadingWidthMultiplier).toBeGreaterThan(2.5);
    expect(angled.effectiveStrokeWidthMm).toBeGreaterThan(upright.effectiveStrokeWidthMm * 2);
  });

  it("겹칠 횟수가 늘어나면 버니싱 골짜기 충진도(valleyFill)와 광택이 단조 증가한다", () => {
    const pass1 = simulatePhysicsBrushStroke("drymedia-sousa99", { pressure: 0.65, repeatPasses: 1 });
    const pass5 = simulatePhysicsBrushStroke("drymedia-sousa99", { pressure: 0.65, repeatPasses: 5 });
    if (pass1.physics.kind !== "drymedia-sousa99" || pass5.physics.kind !== "drymedia-sousa99") throw new Error("unexpected kind");
    expect(pass5.physics.valleyFill).toBeGreaterThan(pass1.physics.valleyFill + 0.35);
    expect(pass5.physics.burnishGlossRatio).toBeGreaterThan(pass1.physics.burnishGlossRatio);
  });

  it("강필압·고속 마찰에서 왁스/흑연 크럼블 입자 밀도가 증가한다", () => {
    const gentle = simulatePhysicsBrushStroke("drymedia-sousa99", { pressure: 0.15, velocityPxPerSec: 120, repeatPasses: 1 });
    const rough = simulatePhysicsBrushStroke("drymedia-sousa99", { pressure: 0.92, velocityPxPerSec: 2200, repeatPasses: 3 });
    if (gentle.physics.kind !== "drymedia-sousa99" || rough.physics.kind !== "drymedia-sousa99") throw new Error("unexpected kind");
    expect(rough.physics.crumbleParticleDensity).toBeGreaterThan(gentle.physics.crumbleParticleDensity * 2);
  });
});

describe("6. 만화 G펜·벡터 잉크 엔진 (gpen-loopblinn05 · Loop & Blinn '05 + Vello)", () => {
  it("모든 종이 흡수율 조건에서 600DPI 이상의 해상도 독립 해석적 SDF 선명도를 보장한다", () => {
    const roughPaper = simulatePhysicsBrushStroke("gpen-loopblinn05", { paperAbsorbency: 1.0 });
    const kentPaper = simulatePhysicsBrushStroke("gpen-loopblinn05", { paperAbsorbency: 0.15 });
    if (roughPaper.physics.kind !== "gpen-loopblinn05" || kentPaper.physics.kind !== "gpen-loopblinn05") throw new Error("unexpected kind");
    expect(roughPaper.physics.sdfEdgeSharpnessDpi).toBeGreaterThanOrEqual(MIN_GPEN_SDF_DPI);
    expect(kentPaper.physics.sdfEdgeSharpnessDpi).toBeGreaterThan(1000);
  });

  it("필압 증가에 따라 강철 펜촉 벌어짐(nibSplitMm)이 선명하게 확장된다", () => {
    const hairline = simulatePhysicsBrushStroke("gpen-loopblinn05", { pressure: 0.08, velocityPxPerSec: 400 });
    const bold = simulatePhysicsBrushStroke("gpen-loopblinn05", { pressure: 0.96, velocityPxPerSec: 400 });
    if (hairline.physics.kind !== "gpen-loopblinn05" || bold.physics.kind !== "gpen-loopblinn05") throw new Error("unexpected kind");
    expect(bold.physics.nibSplitMm).toBeGreaterThan(hairline.physics.nibSplitMm * 6);
  });

  it("고속 스냅 획에서 펜촉이 좁혀지고 날카로운 테이퍼(taperSharpnessRatio)가 강화된다", () => {
    const slow = simulatePhysicsBrushStroke("gpen-loopblinn05", { pressure: 0.7, velocityPxPerSec: 120 });
    const flick = simulatePhysicsBrushStroke("gpen-loopblinn05", { pressure: 0.7, velocityPxPerSec: 2600 });
    if (slow.physics.kind !== "gpen-loopblinn05" || flick.physics.kind !== "gpen-loopblinn05") throw new Error("unexpected kind");
    expect(flick.physics.nibSplitMm).toBeLessThan(slow.physics.nibSplitMm);
    expect(flick.physics.taperSharpnessRatio).toBeGreaterThan(slow.physics.taperSharpnessRatio);
  });

  it("해석적 SDF 윤곽으로 99% 에지 선명도와 평탄한 잉크 박막(0.02mm)을 유지한다", () => {
    const sim = simulatePhysicsBrushStroke("gpen-loopblinn05", DEFAULT_COMMON_STROKE_INPUT);
    expect(sim.edgeContrastIndex).toBe(0.99);
    expect(sim.paintThicknessMm).toBe(0.02);
  });
});

describe("7. 알코올 마커·메탈릭 포일 PBR 엔진 (marker-foil-pbr · Cook-Torrance BRDF)", () => {
  it("겹칠 횟수가 늘어나도 용제 포화 상한 아래로 수렴하며 탁해지지 않는다(muddyPreventionScore >= 0.86)", () => {
    const pass1 = simulatePhysicsBrushStroke("marker-foil-pbr", { repeatPasses: 1, waterSolventLoad: 0.65 });
    const pass5 = simulatePhysicsBrushStroke("marker-foil-pbr", { repeatPasses: 5, waterSolventLoad: 0.65 });
    if (pass1.physics.kind !== "marker-foil-pbr" || pass5.physics.kind !== "marker-foil-pbr") throw new Error("unexpected kind");
    expect(pass5.physics.achievedSaturation).toBeGreaterThan(pass1.physics.achievedSaturation);
    expect(pass5.physics.achievedSaturation).toBeLessThanOrEqual(pass5.physics.solventSaturationCeiling);
    expect(pass5.physics.muddyPreventionScore).toBeGreaterThanOrEqual(0.86);
  });

  it("표면이 매끈할수록 금속 거칠기(metallicRoughness)가 낮아지고 GGX 스페큘러 반사율이 높아진다", () => {
    const smooth = simulatePhysicsBrushStroke("marker-foil-pbr", { paperAbsorbency: 0.15, pressure: 0.85, waterSolventLoad: 0.8 });
    const rough = simulatePhysicsBrushStroke("marker-foil-pbr", { paperAbsorbency: 0.95, pressure: 0.2, waterSolventLoad: 0.1 });
    if (smooth.physics.kind !== "marker-foil-pbr" || rough.physics.kind !== "marker-foil-pbr") throw new Error("unexpected kind");
    expect(smooth.physics.metallicRoughness).toBeLessThan(rough.physics.metallicRoughness);
    expect(smooth.physics.ggxSpecularReflectance).toBeGreaterThan(rough.physics.ggxSpecularReflectance);
  });

  it("이방성 포일 스페큘러 틴트(specularTint)가 기울기에 반응하면서도 바이올렛 휴(270~320°)를 배제한다", () => {
    const flat = simulatePhysicsBrushStroke("marker-foil-pbr", { tiltDeg: 5 });
    const tilted = simulatePhysicsBrushStroke("marker-foil-pbr", { tiltDeg: 70 });
    if (flat.physics.kind !== "marker-foil-pbr" || tilted.physics.kind !== "marker-foil-pbr") throw new Error("unexpected kind");
    expect(isVioletHueDeg(flat.physics.specularTint.h)).toBe(false);
    expect(isVioletHueDeg(tilted.physics.specularTint.h)).toBe(false);
    expect(tilted.physics.specularTint.h).toBeGreaterThan(flat.physics.specularTint.h);
  });

  it("획 속도가 빠를수록 스트로크 방향 금속 입자 정렬도(anisotropicFlakeAlignment)가 높아진다", () => {
    const slow = simulatePhysicsBrushStroke("marker-foil-pbr", { velocityPxPerSec: 120 });
    const fast = simulatePhysicsBrushStroke("marker-foil-pbr", { velocityPxPerSec: 2500 });
    if (slow.physics.kind !== "marker-foil-pbr" || fast.physics.kind !== "marker-foil-pbr") throw new Error("unexpected kind");
    expect(fast.physics.anisotropicFlakeAlignment).toBeGreaterThan(slow.physics.anisotropicFlakeAlignment);
  });
});

describe("8. 입력 정규화 · 6축 개성 분화 정량 검증기 · JSON/WGSL 매니페스트", () => {
  it("normalizeBrushStrokeInput이 비정상(NaN·음수·초과) 입력을 안전 범위로 클램핑한다", () => {
    const norm = normalizeBrushStrokeInput({
      pressure: Number.NaN, tiltDeg: 180, velocityPxPerSec: -50, waterSolventLoad: 5, paperAbsorbency: 0, repeatPasses: 99,
    });
    expect(norm.clamped).toBe(true);
    expect(norm.pressure).toBe(0.05);
    expect(norm.tiltDeg).toBe(75);
    expect(norm.velocityPxPerSec).toBe(60);
    expect(norm.waterSolventLoad).toBe(1);
    expect(norm.paperAbsorbency).toBe(0.1);
    expect(norm.repeatPasses).toBe(5);
  });

  it("예제 계수로 계산한 15개 조합의 점수 >= 72 · 설계 이름 공유 0%를 회귀 검증한다", () => {
    let pairCount = 0;
    for (let i = 0; i < ALL_ENGINE_IDS.length; i += 1) {
      for (let j = i + 1; j < ALL_ENGINE_IDS.length; j += 1) {
        const a = ALL_ENGINE_IDS[i] ?? "watercolor-curtis97";
        const b = ALL_ENGINE_IDS[j] ?? "oil-wetbrush15";
        const report = compareBrushPhysicsDivergence(a, b, DEFAULT_COMMON_STROKE_INPUT);
        pairCount += 1;
        expect(report.isDistinctArchitecture).toBe(true);
        expect(report.isSliderTweakOnly).toBe(false);
        expect(report.sharedBufferOverlapPct).toBe(0);
        expect(report.overallDivergenceScore).toBeGreaterThanOrEqual(72);
        expect(report.axes).toHaveLength(6);
      }
    }
    expect(pairCount).toBe(15);
  });

  it("동일 엔진끼리 비교하면 분화도 0 · 공유 버퍼 100% · isDistinctArchitecture=false를 반환한다", () => {
    const same = compareBrushPhysicsDivergence("sumi-moxi05", "sumi-moxi05");
    expect(same.isDistinctArchitecture).toBe(false);
    expect(same.isSliderTweakOnly).toBe(true);
    expect(same.overallDivergenceScore).toBe(0);
    expect(same.sharedBufferOverlapPct).toBe(100);
    expect(same.axes.every((axis) => axis.divergenceScore === 0)).toBe(true);
  });

  it("exportBrushPhysicsManifestJson이 스키마 버전·전용 WGSL·6축 분화 리포트·정직성 고지를 직렬화한다", () => {
    const { json, manifest } = exportBrushPhysicsManifestJson({
      primaryId: "watercolor-curtis97", compareId: "gpen-loopblinn05", input: STROKE_SCENARIO_PRESETS[0]?.input,
    });
    expect(manifest.schemaVersion).toBe(SIX_PHYSICS_MANIFEST_SCHEMA_VERSION);
    expect(manifest.activeEngines).toHaveLength(2);
    const parsed = JSON.parse(json) as BrushPhysicsPipelineManifest;
    expect(parsed.primaryEngineId).toBe("watercolor-curtis97");
    expect(parsed.compareEngineId).toBe("gpen-loopblinn05");
    expect(parsed.activeEngines[0]?.wgslPipeline.pipelineId).toBe("wgsl_curtis97_3layer_fluid");
    expect(parsed.activeEngines[1]?.wgslPipeline.pipelineId).toBe("wgsl_loopblinn05_vello_sdf");
    expect(parsed.honestyNoteKo).toContain("현재 구현(Current)");
    expect(parsed.honestyNoteKo).toContain("향후 목표(Target)");
  });

  it("3종 공통 스트로크 프리셋이 모두 유효한 입력 계약을 충족한다", () => {
    expect(STROKE_SCENARIO_PRESETS).toHaveLength(3);
    for (const preset of STROKE_SCENARIO_PRESETS) {
      const normalized = normalizeBrushStrokeInput(preset.input);
      expect(normalized.clamped).toBe(false);
    }
  });
});

describe("9. StudioSixPhysicsBrushLabPanel UI · SVG 단면 비교 · 상호작용 · 로케일", () => {
  it("기본 렌더 시 6대 엔진 카드, 수채 vs 유화 SVG 도해, 6축 분화도, 2종 논문 출처 카드가 표시된다", () => {
    render(<StudioSixPhysicsBrushLabPanel />);
    for (const id of ALL_ENGINE_IDS) {
      expect(screen.getByTestId(`engine-card-${id}`)).toBeTruthy();
    }
    const svg = screen.getByTestId("six-physics-comparison-svg");
    expect(svg.getAttribute("data-primary-engine")).toBe("watercolor-curtis97");
    expect(svg.getAttribute("data-compare-engine")).toBe("oil-wetbrush15");
    expect(screen.getByTestId("svg-stroke-primary-watercolor-curtis97")).toBeTruthy();
    expect(screen.getByTestId("svg-cross-primary-watercolor-curtis97")).toBeTruthy();
    expect(screen.getByTestId("svg-stroke-compare-oil-wetbrush15")).toBeTruthy();
    expect(screen.getByTestId("svg-cross-compare-oil-wetbrush15")).toBeTruthy();
    expect(screen.getByTestId("citation-card-watercolor-curtis97")).toBeTruthy();
    expect(screen.getByTestId("citation-card-oil-wetbrush15")).toBeTruthy();
    expect(screen.getByTestId("shared-buffer-overlap-badge").textContent).toContain("0%");
  });

  it("나머지 4대 엔진(먹물·크레용·G펜·알코올 포일)으로 전환하면 전용 SVG 탑뷰·단면·논문 카드가 교체된다", () => {
    render(<StudioSixPhysicsBrushLabPanel />);

    fireEvent.click(screen.getByTestId("select-primary-sumi-moxi05"));
    fireEvent.click(screen.getByTestId("select-compare-drymedia-sousa99"));
    expect(screen.getByTestId("svg-stroke-primary-sumi-moxi05")).toBeTruthy();
    expect(screen.getByTestId("svg-cross-primary-sumi-moxi05")).toBeTruthy();
    expect(screen.getByTestId("svg-stroke-compare-drymedia-sousa99")).toBeTruthy();
    expect(screen.getByTestId("svg-cross-compare-drymedia-sousa99")).toBeTruthy();

    fireEvent.click(screen.getByTestId("select-primary-gpen-loopblinn05"));
    fireEvent.click(screen.getByTestId("select-compare-marker-foil-pbr"));
    expect(screen.getByTestId("svg-stroke-primary-gpen-loopblinn05")).toBeTruthy();
    expect(screen.getByTestId("svg-cross-primary-gpen-loopblinn05")).toBeTruthy();
    expect(screen.getByTestId("svg-stroke-compare-marker-foil-pbr")).toBeTruthy();
    expect(screen.getByTestId("svg-cross-compare-marker-foil-pbr")).toBeTruthy();
    expect(screen.getByTestId("citation-card-gpen-loopblinn05")).toBeTruthy();
    expect(screen.getByTestId("citation-card-marker-foil-pbr")).toBeTruthy();
  });

  it("동일 엔진을 A와 B에 동시에 선택하면 분화도 0 / 100과 공유 버퍼 100%가 표시된다", () => {
    render(<StudioSixPhysicsBrushLabPanel initialPrimaryId="gpen-loopblinn05" initialCompareId="gpen-loopblinn05" />);
    expect(screen.getByTestId("divergence-overall-badge").textContent).toContain("0 / 100");
    expect(screen.getByTestId("shared-buffer-overlap-badge").textContent).toContain("100%");
    expect(screen.getByTestId("divergence-verdict-banner").textContent).toContain("동일 엔진");
  });

  it("공통 스트로크 슬라이더·프리셋·초기화·A↔B 맞바꾸기가 두 엔진 수치와 SVG를 즉시 갱신한다", () => {
    render(<StudioSixPhysicsBrushLabPanel initialPrimaryId="sumi-moxi05" initialCompareId="gpen-loopblinn05" />);

    fireEvent.click(screen.getByTestId("stroke-preset-fast-dry-tilted"));
    expect(screen.getByTestId("slider-velocity-readout").textContent).toBe("2150 px/s");
    const drySumiMetric = screen.getByTestId("card-metric-sumi-moxi05").textContent ?? "";
    expect(drySumiMetric).toContain("/ 16");

    fireEvent.change(screen.getByTestId("slider-pressure"), { target: { value: "0.95" } });
    expect(screen.getByTestId("slider-pressure-readout").textContent).toBe("95%");

    fireEvent.click(screen.getByTestId("swap-engines-btn"));
    const svg = screen.getByTestId("six-physics-comparison-svg");
    expect(svg.getAttribute("data-primary-engine")).toBe("gpen-loopblinn05");
    expect(svg.getAttribute("data-compare-engine")).toBe("sumi-moxi05");

    fireEvent.click(screen.getByTestId("reset-stroke-btn"));
    expect(screen.getByTestId("slider-velocity-readout").textContent).toBe(`${DEFAULT_COMMON_STROKE_INPUT.velocityPxPerSec} px/s`);
  });

  it("JSON·WGSL 내보내기 버튼이 onExportJson을 호출하고 미리보기를 열며 숨기기 토글이 동작한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onExportJson = vi.fn();
    render(<StudioSixPhysicsBrushLabPanel onExportJson={onExportJson} />);

    expect(screen.queryByTestId("physics-manifest-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    const [jsonArg, manifestArg] = onExportJson.mock.calls[0] as [string, BrushPhysicsPipelineManifest];
    expect(jsonArg).toContain(SIX_PHYSICS_MANIFEST_SCHEMA_VERSION);
    expect(manifestArg.activeEngines[0]?.wgslPipeline.pipelineId).toBe("wgsl_curtis97_3layer_fluid");
    expect(screen.getByTestId("physics-manifest-json-preview").textContent).toContain("wgsl_wetbrush15_impasto_km");

    fireEvent.click(screen.getByTestId("toggle-manifest-json-btn"));
    expect(screen.queryByTestId("physics-manifest-json-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')과 사용자 지정 className이 일관되게 반영된다", () => {
    render(
      <StudioSixPhysicsBrushLabPanel
        locale="en"
        initialPrimaryId="watercolor-curtis97"
        initialCompareId="marker-foil-pbr"
        className="custom-physics-host"
      />,
    );
    const root = screen.getByTestId("studio-six-physics-brush-lab");
    expect(root.className).toContain("custom-physics-host");
    expect(screen.getByTestId("six-physics-comparison-svg").textContent).toContain("TOP STROKE");
    expect(screen.getByTestId("divergence-verdict-banner").textContent).toContain("Illustrative design score");
    expect(screen.getByTestId("physics-honesty-note").textContent).toContain("Current:");
  });

  it("getPhysicsBrushEngineSpec이 모든 6대 ID에 대해 정확한 논문 메타데이터를 반환한다", () => {
    for (const id of ALL_ENGINE_IDS) {
      const spec = getPhysicsBrushEngineSpec(id);
      expect(spec.id).toBe(id);
      expect(spec.stateBuffers.length).toBe(3);
    }
  });
});

describe("10. 코드 위생 · 파일 줄 수 · 탈-바이올렛 OKLCH · Calm Atelier 계약 자가 감사", () => {
  it("4개 단독 소유 파일만 존재하고 줄 수 제한(engine<=750, panel<=700, 전체<=800) 및 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "six-physics-brush-engine.ts",
      "StudioSixPhysicsBrushLabPanel.tsx",
      "index.ts",
      "six-physics-brush.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "six-physics-brush-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioSixPhysicsBrushLabPanel.tsx") expect(lines).toBeLessThanOrEqual(700);

      if (file !== "six-physics-brush.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioSixPhysicsBrushLabPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 내 모든 oklch() 리터럴이 바이올렛 휴 대역(270~320°)을 0% 배제한다", () => {
    const panelSrc = readFileSync(path.resolve(import.meta.dirname, "StudioSixPhysicsBrushLabPanel.tsx"), "utf8");
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(6);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 터치 타깃 접근성 계약을 충족한다", () => {
    const { container } = render(<StudioSixPhysicsBrushLabPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(18);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});


describe("실제 복사 ACK·예제 범위·비유한 색상 회귀", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("비유한 hue %s도 유효한 CSS 색상으로 보정한다", (h) => {
    const color = sanitizeNonVioletOklch({ l: 0.5, c: 0.1, h });
    expect(Number.isFinite(color.h)).toBe(true);
    expect(formatOklch({ l: 0.5, c: 0.1, h })).not.toMatch(/NaN|Infinity/u);
  });

  it("클립보드 ACK 전에는 복사 완료를 표시하거나 수신자를 호출하지 않는다", async () => {
    let acknowledge: (() => void) | undefined;
    const writeText = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onExportJson = vi.fn();
    render(<StudioSixPhysicsBrushLabPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    try {
      expect(screen.getByTestId("export-physics-manifest-btn").textContent).not.toContain("복사됨");
      expect(onExportJson).not.toHaveBeenCalled();
    } finally { await act(async () => { acknowledge?.(); }); }
    await waitFor(() => expect(onExportJson).toHaveBeenCalledOnce());
  });

  it("거절된 복사는 오류와 재시도를 표시하고 성공을 가장하지 않는다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("clipboard denied")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioSixPhysicsBrushLabPanel />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("다시"));
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(screen.getByTestId("export-physics-manifest-btn").textContent).toContain("복사됨"));
    expect(writeText).toHaveBeenCalledTimes(2);
  });

  it("JSON은 장치·GPU·음성·저장·DPI 실측을 보증하지 않는 계산 예제로 구분한다", () => {
    const { json } = exportBrushPhysicsManifestJson({ primaryId: "watercolor-curtis97", compareId: "gpen-loopblinn05" });
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.runtimeState).toEqual({ model: "illustrative-cpu-formulas", gpuExecuted: false, wasmExecuted: false, audioPlayed: false, canvasApplied: false, persisted: false, calibratedPhysicalUnits: false, validatedPrintDpi: false });
    expect(json).not.toMatch(/Distinct architecture verified|독립 파이프라인 확인|실측 mm급/u);
  });
});


it("9개 f16 상태의 텍스처 계획은 선언한 포맷의 패딩 용량과 일치한다", () => {
  const bytesByFormat: Record<string, number> = { r16float: 2, rg16float: 4, rgba16float: 8, r32float: 4, rg32float: 8, rgba32float: 16, "3 × rgba16float": 24 };
  for (const spec of SIX_PHYSICS_BRUSH_ENGINES) {
    for (const buffer of spec.stateBuffers) expect(buffer.bytesPerTexel).toBe(bytesByFormat[buffer.format]);
  }
});

it("외부 수신자가 export 객체를 바꿔도 정본 스펙과 다음 JSON이 보존된다", () => {
  const before = JSON.stringify(getPhysicsBrushEngineSpec("watercolor-curtis97"));
  const { manifest } = exportBrushPhysicsManifestJson({ primaryId: "watercolor-curtis97", compareId: "gpen-loopblinn05" });
  const citation = manifest.activeEngines[0]?.citation;
  if (!citation) throw new Error("missing citation");
  Reflect.set(citation, "authors", "외부 수정 🖋️");
  expect(JSON.stringify(getPhysicsBrushEngineSpec("watercolor-curtis97"))).toBe(before);
});


it("내보내기 감사의 clamped 표시는 원래 입력의 보정을 보존한다", () => {
  const raw = Object.freeze({ pressure: Number.NaN, tiltDeg: 1e308, velocityPxPerSec: -1e308, repeatPasses: 1e308 });
  const { manifest } = exportBrushPhysicsManifestJson({ primaryId: "watercolor-curtis97", compareId: "gpen-loopblinn05", input: raw });
  expect(manifest.strokeInput.clamped).toBe(true);
  expect(manifest.divergenceReport.compareSim.input.clamped).toBe(true);
  expect(Number.isNaN(raw.pressure)).toBe(true);
});


describe("복사 스냅샷과 최신 알림 수신자", () => {
  it("ACK 도중 추가된 수신자가 거절한 뒤 제거돼도 재시도는 전달 없이 성공하지 않는다", async () => {
    let acknowledge: (() => void) | undefined;
    const writeText = vi.fn((_text: string) => new Promise<void>((resolve) => { acknowledge = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { rerender } = render(<StudioSixPhysicsBrushLabPanel />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    const snapshot = writeText.mock.calls[0]?.[0];
    const reject = vi.fn().mockRejectedValue(new Error("recipient rejected"));
    rerender(<StudioSixPhysicsBrushLabPanel onExportJson={reject} />);
    fireEvent.change(screen.getByTestId("slider-pressure"), { target: { value: "0.95" } });
    await act(async () => { acknowledge?.(); });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(reject).toHaveBeenCalledOnce();
    expect(reject.mock.calls[0]?.[0]).toBe(snapshot);
    rerender(<StudioSixPhysicsBrushLabPanel />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByTestId("export-physics-manifest-btn").textContent).not.toContain("복사됨");
    const accept = vi.fn().mockResolvedValue(undefined);
    rerender(<StudioSixPhysicsBrushLabPanel onExportJson={accept} />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(screen.getByTestId("export-physics-manifest-btn").textContent).toContain("복사됨"));
    expect(accept.mock.calls[0]?.[0]).toBe(snapshot);
    expect(screen.getByTestId("physics-manifest-json-preview").textContent).toBe(snapshot);
    expect(writeText).toHaveBeenCalledOnce();
  });

  it.each(["throw", "reject"])("%s 수신자 실패는 같은 payload를 최신 수신자로 재시도한다", async (failure) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const bad = vi.fn((_json: string, _manifest: BrushPhysicsPipelineManifest) => {
      if (failure === "throw") throw new Error("recipient failed");
      return Promise.reject(new Error("recipient failed"));
    });
    const { rerender } = render(<StudioSixPhysicsBrushLabPanel onExportJson={bad} />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const good = vi.fn().mockResolvedValue(undefined);
    rerender(<StudioSixPhysicsBrushLabPanel onExportJson={good} />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(good).toHaveBeenCalledOnce());
    expect(good.mock.calls[0]?.[0]).toBe(bad.mock.calls[0]?.[0]);
    expect(writeText).toHaveBeenCalledOnce();
  });

  it("클립보드 API 부재와 unmount 대기는 외부 전달·허위 성공 없이 끝난다", async () => {
    vi.stubGlobal("navigator", {});
    const recipient = vi.fn();
    const first = render(<StudioSixPhysicsBrushLabPanel onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(recipient).not.toHaveBeenCalled();
    first.unmount();
    let acknowledge: (() => void) | undefined;
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; })) } });
    const second = render(<StudioSixPhysicsBrushLabPanel onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId("export-physics-manifest-btn"));
    second.unmount();
    await act(async () => { acknowledge?.(); });
    expect(recipient).not.toHaveBeenCalled();
  });
});

it.each(["__proto__", "unknown"])("외부 enum %s를 다른 엔진으로 오인하지 않는다", (id) => {
  expect(() => Reflect.apply(getPhysicsBrushEngineSpec, null, [id])).toThrow(RangeError);
  expect(() => Reflect.apply(simulatePhysicsBrushStroke, null, [id])).toThrow(RangeError);
});
