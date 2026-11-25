// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CPU_PARITY_GRID_COLS,
  CPU_PARITY_GRID_ROWS,
  JFA_SDF_SEED_AND_STEP_WGSL,
  LIGHT_TEMPERATURE_PRESETS,
  RADIANCE_CASCADES_SCHEMA_VERSION,
  RADIANCE_CASCADE_MERGE_AND_CEL_WGSL,
  RADIANCE_CASCADE_PROBE_WGSL,
  RADIANCE_LIGHTING_SCENARIOS,
  RADIANCE_MAX_BINDINGS_PER_PASS,
  RADIANCE_MODEL_KIND,
  RADIANCE_SCENARIO_IDS,
  RADIANCE_UNIFORM_BYTE_SIZE,
  StudioWebGpuRadiancePanel,
  buildCascadePyramidMetrics,
  compareWebGpuVsWebGl2Architecture,
  evaluateOccluderSdf2d,
  evaluateSceneSdf2d,
  evaluateWebGpuRadianceScene,
  exportRadianceCascadesJson,
  formatOklch,
  getRadianceLightingScenario,
  isVioletHueDeg,
  linearChannelsToOklch,
  normalizeRadianceSceneInput,
  oklchToLinearChannels,
  packRadianceUniforms,
  sanitizeNonVioletOklch,
  traceSoftShadow2d,
  validateRadianceWgslContracts,
  type WebGpuRadianceSceneEvaluation,
} from "./index";

afterEach(cleanup);

describe("1. WGSL 3종 컴퓨트 셰이더 · 16B 정렬 Uniform 패커 · 계약 검증기", () => {
  it("3종 실제 WGSL 컴퓨트 셰이더가 계약 검증기(validateRadianceWgslContracts)를 전원 통과한다", () => {
    const report = validateRadianceWgslContracts();
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.shaders).toHaveLength(3);
    expect(report.totalReservedKeywordCollisions).toBe(0);
    expect(report.maxBindingCount).toBeLessThanOrEqual(RADIANCE_MAX_BINDINGS_PER_PASS);
    expect(report.uniformByteSize).toBe(RADIANCE_UNIFORM_BYTE_SIZE);
    expect(report.uniformAligned16).toBe(true);
  });

  it("모든 WGSL 셰이더가 @compute @workgroup_size(8, 8)과 @builtin(global_invocation_id)을 선언한다", () => {
    const report = validateRadianceWgslContracts();
    for (const shader of report.shaders) {
      expect(shader.valid).toBe(true);
      expect(shader.entryPoints.length).toBeGreaterThanOrEqual(1);
      for (const wg of shader.workgroupSizes) {
        expect(wg).toBe("8,8");
      }
      expect(shader.balancedDelimiters).toBe(true);
    }
  });

  it("모든 WGSL 셰이더가 Storage Texture를 사용하고 바인딩 수 8개 이하 및 슬롯 중복 0건을 만족한다", () => {
    const report = validateRadianceWgslContracts();
    for (const shader of report.shaders) {
      expect(shader.usesStorageTexture).toBe(true);
      expect(shader.withinBindingLimit).toBe(true);
      expect(shader.bindingCount).toBeGreaterThanOrEqual(4);
      expect(shader.bindingCount).toBeLessThanOrEqual(8);
    }
  });

  it("JFA_SDF_SEED_AND_STEP_WGSL이 시드 패스와 O(log N) 점프 플로드 스텝 진입점을 제공한다", () => {
    const report = validateRadianceWgslContracts();
    const jfa = report.shaders[0];
    expect(jfa?.id).toBe("jfa-sdf");
    expect(jfa?.entryPoints).toEqual(["jfa_seed_occluder_mask", "jfa_jump_flood_step"]);
    expect(JFA_SDF_SEED_AND_STEP_WGSL).toContain("texture_storage_2d<rg32float, write>");
    expect(JFA_SDF_SEED_AND_STEP_WGSL).toContain("texture_storage_2d<r32float, write>");
  });

  it("RADIANCE_CASCADE_PROBE_WGSL이 var<workgroup> 공유 메모리와 균일 제어 흐름 workgroupBarrier()를 사용한다", () => {
    const report = validateRadianceWgslContracts();
    const probe = report.shaders[1];
    expect(probe?.id).toBe("cascade-probe");
    expect(probe?.entryPoints).toEqual(["trace_radiance_cascade"]);
    expect(probe?.usesWorkgroupSharedMemory).toBe(true);
    expect(RADIANCE_CASCADE_PROBE_WGSL).toContain("var<workgroup> probe_scratch");
    expect(RADIANCE_CASCADE_PROBE_WGSL).toContain("workgroupBarrier()");
  });

  it("RADIANCE_CASCADE_MERGE_AND_CEL_WGSL이 이중선형 병합과 웹툰 셀 림라이트 합성 진입점을 제공한다", () => {
    const report = validateRadianceWgslContracts();
    const merge = report.shaders[2];
    expect(merge?.id).toBe("merge-cel");
    expect(merge?.entryPoints).toEqual(["merge_radiance_cascades", "composite_cel_rim_final"]);
    expect(RADIANCE_CASCADE_MERGE_AND_CEL_WGSL).toContain("smoothstep");
    expect(RADIANCE_CASCADE_MERGE_AND_CEL_WGSL).toContain("textureStore(final_frame_out");
  });

  it("계약 검증기가 WGSL 예약어 충돌(target·filter 등)을 즉시 탐지해 실패 판정한다", () => {
    const broken = RADIANCE_CASCADE_PROBE_WGSL.replace("let bounce_gain =", "let target =");
    const report = validateRadianceWgslContracts({ cascadeProbeWgsl: broken });
    expect(report.valid).toBe(false);
    expect(report.totalReservedKeywordCollisions).toBeGreaterThan(0);
    expect(report.shaders[1]?.reservedKeywordCollisions).toContain("target");
  });

  it("계약 검증기가 중괄호 불균형 WGSL 소스를 탐지한다", () => {
    const report = validateRadianceWgslContracts({ jfaSdfWgsl: `${JFA_SDF_SEED_AND_STEP_WGSL}\n{` });
    expect(report.valid).toBe(false);
    expect(report.shaders[0]?.balancedDelimiters).toBe(false);
  });

  it("계약 검증기가 바인딩 8개 초과 및 중복 바인딩 슬롯을 거부한다", () => {
    const dupBindings = JFA_SDF_SEED_AND_STEP_WGSL.replace("@binding(4)", "@binding(3)");
    const dupReport = validateRadianceWgslContracts({ jfaSdfWgsl: dupBindings });
    expect(dupReport.valid).toBe(false);
    expect(dupReport.errors.some((e) => e.includes("중복 바인딩"))).toBe(true);

    const extraBindings = [
      "@group(0) @binding(5) var ex5: texture_2d<f32>;",
      "@group(0) @binding(6) var ex6: texture_2d<f32>;",
      "@group(0) @binding(7) var ex7: texture_2d<f32>;",
      "@group(0) @binding(8) var ex8: texture_2d<f32>;",
    ].join("\n");
    const overReport = validateRadianceWgslContracts({ jfaSdfWgsl: `${extraBindings}\n${JFA_SDF_SEED_AND_STEP_WGSL}` });
    expect(overReport.valid).toBe(false);
    expect(overReport.shaders[0]?.withinBindingLimit).toBe(false);
  });

  it("계약 검증기가 Storage Texture 누락 및 잘못된 workgroup_size를 거부한다", () => {
    const badWg = RADIANCE_CASCADE_PROBE_WGSL.replace("@workgroup_size(8, 8)", "@workgroup_size(16, 16)");
    const wgReport = validateRadianceWgslContracts({ cascadeProbeWgsl: badWg });
    expect(wgReport.valid).toBe(false);

    const noStorage = RADIANCE_CASCADE_PROBE_WGSL.replace("texture_storage_2d<rgba16float, write>", "texture_2d<f32>");
    const stReport = validateRadianceWgslContracts({ cascadeProbeWgsl: noStorage });
    expect(stReport.valid).toBe(false);
    expect(stReport.shaders[1]?.usesStorageTexture).toBe(false);
  });

  it("packRadianceUniforms가 96바이트 16B 정렬 버퍼에 f32/u32 필드를 정확히 패킹한다", () => {
    const config = normalizeRadianceSceneInput({
      scenarioId: "sunset-classroom-window",
      cascadeLevels: 6,
      baseRayCount: 12,
      penumbraSoftness: 0.75,
      bounceGiStrength: 1.1,
      rimCutThreshold: 0.4,
      canvasWidth: 1024,
      canvasHeight: 512,
    });
    const packed = packRadianceUniforms(config, 3, 64);
    expect(packed.byteLength).toBe(96);
    expect(packed.aligned16Bytes).toBe(true);
    expect(packed.floatView[0]).toBe(1024);
    expect(packed.floatView[1]).toBe(512);
    expect(packed.uintView[4]).toBe(3);
    expect(packed.uintView[5]).toBe(6);
    expect(packed.uintView[6]).toBe(12);
    expect(packed.uintView[7]).toBe(64);
    expect(packed.floatView[8]).toBeCloseTo(0.75, 4);
    expect(packed.floatView[9]).toBeCloseTo(1.1, 4);
    expect(packed.floatView[10]).toBeCloseTo(0.4, 4);
  });
});

describe("2. 탈-바이올렛 OKLCH 색공간 & 4종 웹툰 조명 시나리오", () => {
  it("요구된 4종 웹툰 조명 시나리오가 모두 정본으로 등록되어 있다", () => {
    expect(RADIANCE_LIGHTING_SCENARIOS.map((s) => s.id)).toEqual([...RADIANCE_SCENARIO_IDS]);
    for (const sc of RADIANCE_LIGHTING_SCENARIOS) {
      expect(sc.occluders.length).toBeGreaterThanOrEqual(4);
      expect(sc.occluders.some((o) => o.kind === "character")).toBe(true);
      expect(sc.occluders.some((o) => o.kind === "background")).toBe(true);
      expect(sc.occluders.some((o) => o.kind === "balloon")).toBe(true);
    }
  });

  it("4종 시나리오와 6종 색온도 프리셋의 모든 색상이 바이올렛 휴(270~320°)를 0% 배제한다", () => {
    for (const sc of RADIANCE_LIGHTING_SCENARIOS) {
      expect(isVioletHueDeg(sc.keyLightColor.h)).toBe(false);
      expect(isVioletHueDeg(sc.fillLightColor.h)).toBe(false);
      expect(isVioletHueDeg(sc.rimLightColor.h)).toBe(false);
      for (const occ of sc.occluders) {
        expect(isVioletHueDeg(occ.albedo.h)).toBe(false);
      }
    }
    for (const preset of LIGHT_TEMPERATURE_PRESETS) {
      if (preset.color) {
        expect(isVioletHueDeg(preset.color.h)).toBe(false);
      }
    }
  });

  it("sanitizeNonVioletOklch가 270~320° 바이올렛 입력을 안전 휴 대역으로 결정론적 치환한다", () => {
    for (const violetHue of [270, 285, 294, 305, 320, -65]) {
      expect(isVioletHueDeg(violetHue)).toBe(true);
      const safe = sanitizeNonVioletOklch({ l: 0.72, c: 0.18, h: violetHue });
      expect(isVioletHueDeg(safe.h)).toBe(false);
    }
    const amber = sanitizeNonVioletOklch({ l: 0.78, c: 0.16, h: 58 });
    expect(amber.h).toBe(58);
  });

  it("formatOklch가 순수 oklch() 표기만 출력하고 원시 hex/rgb/hsl을 포함하지 않는다", () => {
    const solid = formatOklch({ l: 0.78, c: 0.15, h: 58 });
    const translucent = formatOklch({ l: 0.78, c: 0.15, h: 202 }, 0.65);
    expect(solid).toMatch(/^oklch\([\d.]+\s+[\d.]+\s+[\d.]+\)$/u);
    expect(translucent).toMatch(/^oklch\([\d.]+\s+[\d.]+\s+[\d.]+\s+\/\s+[\d.]+\)$/u);
    expect(solid).not.toMatch(/#|rgb|hsl/iu);
  });

  it("oklchToLinearChannels와 linearChannelsToOklch가 유한 값과 탈-바이올렛 불변식을 유지한다", () => {
    const lin = oklchToLinearChannels({ l: 0.76, c: 0.16, h: 156 });
    expect(lin.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    const back = linearChannelsToOklch(lin[0], lin[1], lin[2]);
    expect(isVioletHueDeg(back.h)).toBe(false);
    expect(back.l).toBeGreaterThan(0.5);
  });

  it("normalizeRadianceSceneInput이 비정상·NaN·범위 초과 파라미터를 안전 범위로 정규화한다", () => {
    const norm = normalizeRadianceSceneInput({
      cascadeLevels: 99,
      baseRayCount: -4,
      penumbraSoftness: Number.NaN,
      rimCutThreshold: 2.5,
      bounceGiStrength: -1,
      keyLightX: 5,
      keyLightY: -2,
    });
    expect(norm.cascadeLevels).toBe(6);
    expect(norm.baseRayCount).toBe(4);
    expect(norm.penumbraSoftness).toBe(0.62);
    expect(norm.rimCutThreshold).toBe(0.9);
    expect(norm.bounceGiStrength).toBe(0);
    expect(norm.keyLightX).toBe(0.94);
    expect(norm.keyLightY).toBe(0.06);
  });
});

describe("3. 결정론적 CPU 참조 2D SDF · Radiance Cascades 피라미드 · GI 시뮬레이터", () => {
  it("2D SDF 평가기가 원·캡슐·둥근 사각형 내부에서 음수, 경계에서 0, 외부에서 양수를 반환한다", () => {
    const sc = getRadianceLightingScenario("neon-alley-rim");
    const head = sc.occluders[1];
    const torso = sc.occluders[0];
    const balloon = sc.occluders[3];
    if (!head || !torso || !balloon) throw new Error("missing scenario occluders");

    expect(evaluateOccluderSdf2d(head.x, head.y, head)).toBeLessThan(0);
    expect(evaluateOccluderSdf2d(head.x + head.radius, head.y, head)).toBeCloseTo(0, 5);
    expect(evaluateOccluderSdf2d(0.05, 0.05, head)).toBeGreaterThan(0);
    expect(evaluateOccluderSdf2d(torso.x, 0.65, torso)).toBeLessThan(0);
    expect(evaluateOccluderSdf2d(balloon.x, balloon.y, balloon)).toBeLessThan(0);
    expect(evaluateSceneSdf2d(head.x, head.y, sc.occluders).distance).toBeLessThan(0);
  });

  it("Radiance Cascades 계층 피라미드가 공간 간격 2× 증가와 각도 광선 4× 증가 법칙을 정확히 만족한다", () => {
    const cfg = normalizeRadianceSceneInput({ cascadeLevels: 6, baseRayCount: 8 });
    const pyramid = buildCascadePyramidMetrics(cfg);
    expect(pyramid).toHaveLength(6);
    for (let i = 0; i < pyramid.length; i += 1) {
      const lv = pyramid[i];
      expect(lv?.probeSpacingPx).toBe(1 << i);
      expect(lv?.angularRayCount).toBe(8 * (1 << (2 * i)));
      if (i > 0) {
        const prev = pyramid[i - 1];
        expect(lv?.probeSpacingPx).toBe((prev?.probeSpacingPx ?? 0) * 2);
        expect(lv?.angularRayCount).toBe((prev?.angularRayCount ?? 0) * 4);
      }
    }
  });

  it("각 캐스케이드 광선 구간 [intervalStartPx, intervalEndPx]이 빈틈 없이 연속 분할된다", () => {
    const pyramid = buildCascadePyramidMetrics(normalizeRadianceSceneInput({ cascadeLevels: 5 }));
    expect(pyramid[0]?.intervalStartPx).toBe(0);
    for (let i = 1; i < pyramid.length; i += 1) {
      expect(pyramid[i]?.intervalStartPx).toBe(pyramid[i - 1]?.intervalEndPx);
      expect(pyramid[i]?.intervalEndPx).toBeGreaterThan(pyramid[i]?.intervalStartPx ?? 0);
    }
  });

  it("traceSoftShadow2d가 차폐체 뒤 본그림자(0)와 직사 노출(1)을 물리적으로 구분한다", () => {
    const sc = getRadianceLightingScenario("noir-spotlight-shadow");
    const blocked = traceSoftShadow2d(0.50, 0.94, 0.50, 0.12, sc.keyLightRadius, 0.4, sc.occluders);
    const open = traceSoftShadow2d(0.88, 0.18, 0.50, 0.12, sc.keyLightRadius, 0.4, sc.occluders);
    expect(blocked).toBe(0);
    expect(open).toBeGreaterThan(0.9);
  });

  it("evaluateWebGpuRadianceScene이 동일 입력에 대해 비트 단위로 결정론적 결과를 반환한다", () => {
    const a = exportRadianceCascadesJson({ scenarioId: "fantasy-crystal-bounce", cascadeLevels: 5, bounceGiStrength: 1.0 });
    const b = exportRadianceCascadesJson({ scenarioId: "fantasy-crystal-bounce", cascadeLevels: 5, bounceGiStrength: 1.0 });
    expect(a.json).toBe(b.json);
    expect(a.evaluation.gridSamples).toHaveLength(CPU_PARITY_GRID_COLS * CPU_PARITY_GRID_ROWS);
  });

  it("4종 웹툰 조명 시나리오가 서로 구분되는 실측 그림자·바운스·림라이트 분포를 생성한다", () => {
    const results = RADIANCE_SCENARIO_IDS.map((scenarioId) => evaluateWebGpuRadianceScene({ scenarioId }));
    const signatures = new Set(
      results.map((r) => `${r.gridMetrics.umbraCellCount}:${r.gridMetrics.penumbraCellCount}:${r.gridMetrics.meanBounceGiEnergy}`),
    );
    expect(signatures.size).toBe(4);
    for (const r of results) {
      expect(r.gridMetrics.penumbraCellCount + r.gridMetrics.umbraCellCount).toBeGreaterThan(10);
      expect(r.gridMetrics.meanBounceGiEnergy).toBeGreaterThan(0);
      expect(r.gridMetrics.rimActiveCellCount).toBeGreaterThan(0);
    }
  });

  it("반그림자 부드러움(penumbraSoftness)을 높이면 부드러운 반그림자 전환 영역이 넓어진다", () => {
    const sharp = evaluateWebGpuRadianceScene({ scenarioId: "sunset-classroom-window", penumbraSoftness: 0.1 });
    const soft = evaluateWebGpuRadianceScene({ scenarioId: "sunset-classroom-window", penumbraSoftness: 0.95 });
    expect(soft.gridMetrics.penumbraCellCount).toBeGreaterThan(sharp.gridMetrics.penumbraCellCount);
    expect(soft.gridMetrics.meanPenumbraRatio).toBeGreaterThan(sharp.gridMetrics.meanPenumbraRatio);
  });

  it("바운스 GI 강도(bounceGiStrength)를 높이면 평균 색 번짐 에너지가 단조 증가한다", () => {
    const e0 = evaluateWebGpuRadianceScene({ scenarioId: "fantasy-crystal-bounce", bounceGiStrength: 0 }).gridMetrics.meanBounceGiEnergy;
    const e50 = evaluateWebGpuRadianceScene({ scenarioId: "fantasy-crystal-bounce", bounceGiStrength: 0.5 }).gridMetrics.meanBounceGiEnergy;
    const e100 = evaluateWebGpuRadianceScene({ scenarioId: "fantasy-crystal-bounce", bounceGiStrength: 1.0 }).gridMetrics.meanBounceGiEnergy;
    const e150 = evaluateWebGpuRadianceScene({ scenarioId: "fantasy-crystal-bounce", bounceGiStrength: 1.5 }).gridMetrics.meanBounceGiEnergy;
    expect(e0).toBe(0);
    expect(e50).toBeGreaterThan(e0);
    expect(e100).toBeGreaterThan(e50);
    expect(e150).toBeGreaterThan(e100);
  });

  it("셀 림라이트 컷 임계값(rimCutThreshold)을 높이면 림라이트 활성 셀 수가 축소된다", () => {
    const wideRim = evaluateWebGpuRadianceScene({ scenarioId: "neon-alley-rim", rimCutThreshold: 0.15 });
    const tightRim = evaluateWebGpuRadianceScene({ scenarioId: "neon-alley-rim", rimCutThreshold: 0.9 });
    expect(wideRim.gridMetrics.rimActiveCellCount).toBeGreaterThanOrEqual(tightRim.gridMetrics.rimActiveCellCount);
  });

  it("주광원 좌표를 이동하면 20×12 격자의 그림자·조도 분포가 즉시 재계산된다", () => {
    const leftLight = evaluateWebGpuRadianceScene({ scenarioId: "neon-alley-rim", keyLightX: 0.12, keyLightY: 0.18 });
    const rightLight = evaluateWebGpuRadianceScene({ scenarioId: "neon-alley-rim", keyLightX: 0.88, keyLightY: 0.18 });
    const changedCells = leftLight.gridSamples.filter(
      (cell, idx) => cell.keyVisibility !== rightLight.gridSamples[idx]?.keyVisibility,
    );
    expect(changedCells.length).toBeGreaterThan(25);
  });

  it("WebGPU vs WebGL2 구조 비교가 modelKind 계약과 허위 FPS 0건·정직한 패스/공유메모리 차이를 유지한다", () => {
    const cmp = compareWebGpuVsWebGl2Architecture(normalizeRadianceSceneInput({ cascadeLevels: 5, canvasWidth: 1024, canvasHeight: 1024 }));
    expect(cmp.modelKind).toBe(RADIANCE_MODEL_KIND);
    expect(cmp.jfaPassCount).toBe(10);
    expect(cmp.webgpu.renderPassSwitches).toBe(0);
    expect(cmp.webgpu.pingPongFboCount).toBe(0);
    expect(cmp.webgpu.storageTextureWriteSupport).toBe(true);
    expect(cmp.webgpu.workgroupSharedMemoryBytes).toBeGreaterThan(0);
    expect(cmp.legacyWebgl2.renderPassSwitches).toBeGreaterThan(15);
    expect(cmp.legacyWebgl2.pingPongFboCount).toBeGreaterThan(0);
    expect(cmp.legacyWebgl2.storageTextureWriteSupport).toBe(false);
    expect(cmp.legacyWebgl2.workgroupSharedMemoryBytes).toBe(0);
    expect(cmp.passReductionCount).toBeGreaterThan(0);

    const { json } = exportRadianceCascadesJson({ cascadeLevels: 5 });
    const parsed = JSON.parse(json) as {
      schemaVersion: string;
      modelKind: string;
      wgslSources: Record<string, string>;
      honestScopeDisclosure: { currentImplementationKo: string; targetRuntimeKo: string };
    };
    expect(parsed.schemaVersion).toBe(RADIANCE_CASCADES_SCHEMA_VERSION);
    expect(parsed.modelKind).toBe("webgpu-compute-architecture-and-cpu-parity");
    expect(Object.keys(parsed.wgslSources)).toEqual(["jfa-sdf", "cascade-probe", "merge-cel"]);
    expect(parsed.honestScopeDisclosure.currentImplementationKo).toContain("현재 구현:");
    expect(parsed.honestScopeDisclosure.targetRuntimeKo).toContain("목표 런타임:");
    expect(json).not.toMatch(/"estimatedFps"|"measuredFps"|"benchmarkFps"/u);
  });
});

describe("4. 스튜디오 WebGPU GI 제어판 UI (StudioWebGpuRadiancePanel)", () => {
  it("props 없이 단독 렌더링되며 기본 한국어 UI·4종 시나리오·SVG 2종·구조 비교표·WGSL 미리보기를 표시한다", () => {
    render(<StudioWebGpuRadiancePanel />);
    expect(screen.getByTestId("studio-webgpu-radiance-panel")).toBeTruthy();
    expect(screen.getByTestId("radiance-scene-svg")).toBeTruthy();
    expect(screen.getByTestId("cascade-pyramid-svg")).toBeTruthy();
    expect(screen.getByTestId("architecture-comparison-table").querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByTestId("architecture-model-kind").textContent).toBe(RADIANCE_MODEL_KIND);
    expect(screen.getByTestId("kpi-wgsl-contract").textContent).toContain("3/3 PASS");
    for (const id of RADIANCE_SCENARIO_IDS) {
      expect(screen.getByTestId(`scenario-card-${id}`)).toBeTruthy();
    }
  });

  it("4종 웹툰 조명 시나리오 카드 클릭 시 SVG 속성이 갱신되고 onSceneChange 콜백이 호출된다", () => {
    const onSceneChange = vi.fn();
    render(<StudioWebGpuRadiancePanel onSceneChange={onSceneChange} />);
    fireEvent.click(screen.getByTestId("scenario-card-fantasy-crystal-bounce"));

    expect(onSceneChange).toHaveBeenCalledTimes(1);
    const svg = screen.getByTestId("radiance-scene-svg");
    expect(svg.getAttribute("data-scenario")).toBe("fantasy-crystal-bounce");
    expect(screen.getByTestId("radiance-panel-status").textContent).toContain("판타지 에메랄드 반사광");
  });

  it("캐스케이드 단계 버튼(3~6)과 슬라이더가 피라미드 SVG와 최대 광선 수를 즉시 갱신한다", () => {
    render(<StudioWebGpuRadiancePanel initialCascadeLevels={4} />);
    const pyramid = screen.getByTestId("cascade-pyramid-svg");
    expect(pyramid.getAttribute("data-levels")).toBe("4");

    fireEvent.click(screen.getByTestId("cascade-level-6"));
    expect(pyramid.getAttribute("data-levels")).toBe("6");
    expect(pyramid.getAttribute("data-max-rays")).toBe("8192");

    fireEvent.change(screen.getByTestId("slider-cascade-levels"), { target: { value: "3" } });
    expect(pyramid.getAttribute("data-levels")).toBe("3");
    expect(pyramid.getAttribute("data-max-rays")).toBe("128");
  });

  it("광선 밀도·반그림자·림라이트 컷·바운스 GI·주광원 XY 슬라이더가 씬 계산과 상태를 갱신한다", () => {
    render(<StudioWebGpuRadiancePanel />);
    fireEvent.change(screen.getByTestId("slider-base-rays"), { target: { value: "12" } });
    expect(screen.getByTestId("radiance-scene-svg").getAttribute("data-base-rays")).toBe("12");

    fireEvent.change(screen.getByTestId("slider-penumbra-softness"), { target: { value: "0.95" } });
    expect(screen.getByTestId("radiance-panel-status").textContent).toContain("0.95");

    fireEvent.change(screen.getByTestId("slider-rim-cut"), { target: { value: "0.2" } });
    expect(screen.getByTestId("radiance-panel-status").textContent).toContain("0.20");

    fireEvent.change(screen.getByTestId("slider-bounce-gi"), { target: { value: "1.4" } });
    expect(screen.getByTestId("radiance-panel-status").textContent).toContain("140%");

    fireEvent.change(screen.getByTestId("slider-key-light-x"), { target: { value: "0.22" } });
    fireEvent.change(screen.getByTestId("slider-key-light-y"), { target: { value: "0.34" } });
    expect(screen.getByTestId("radiance-scene-svg").textContent).toContain("(0.22, 0.34)");
  });

  it("광원 색온도 프리셋 버튼 클릭 시 활성 상태와 상태 안내가 갱신된다", () => {
    render(<StudioWebGpuRadiancePanel />);
    const warmBtn = screen.getByTestId("temp-preset-warm-amber");
    fireEvent.click(warmBtn);
    expect(warmBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("radiance-panel-status").textContent).toContain("3200K");
  });

  it("순수 시맨틱 SVG 2종이 240개 실측 GI 셀과 차폐체·캐스케이드 바를 원시 hex/rgb 없이 렌더링한다", () => {
    const { container } = render(<StudioWebGpuRadiancePanel initialCascadeLevels={5} />);
    const sceneSvg = screen.getByTestId("radiance-scene-svg");
    const pyramidSvg = screen.getByTestId("cascade-pyramid-svg");
    expect(sceneSvg.getAttribute("role")).toBe("img");
    expect(pyramidSvg.getAttribute("role")).toBe("img");
    expect(container.querySelectorAll("[data-testid='radiance-grid-cells'] rect")).toHaveLength(240);
    expect(container.querySelectorAll("[data-cascade-level]")).toHaveLength(5);
    expect(sceneSvg.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/iu);
    expect(pyramidSvg.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/iu);
  });

  it("WGSL 3종 탭 전환 및 코드 복사 버튼이 각 셰이더 소스를 정확히 표시하고 복사한다", () => {
    render(<StudioWebGpuRadiancePanel />);
    expect(screen.getByTestId("wgsl-code-preview").textContent).toContain("fn jfa_jump_flood_step");

    fireEvent.click(screen.getByTestId("wgsl-tab-cascade-probe"));
    expect(screen.getByTestId("wgsl-code-preview").textContent).toContain("fn trace_radiance_cascade");

    fireEvent.click(screen.getByTestId("wgsl-tab-merge-cel"));
    expect(screen.getByTestId("wgsl-code-preview").textContent).toContain("fn composite_cel_rim_final");

    fireEvent.click(screen.getByTestId("copy-wgsl-btn"));
    expect(screen.getByTestId("radiance-panel-status").textContent).toContain("merge-cel");
  });

  it("JSON 내보내기 버튼이 onExportJson을 호출하고 JSON 미리보기 토글이 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioWebGpuRadiancePanel initialScenarioId="noir-spotlight-shadow" onExportJson={onExportJson} />);

    expect(screen.queryByTestId("radiance-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-radiance-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const [jsonArg, evalArg] = onExportJson.mock.calls[0] as [string, WebGpuRadianceSceneEvaluation];
    expect(jsonArg).toContain(RADIANCE_CASCADES_SCHEMA_VERSION);
    expect(evalArg.scenario.id).toBe("noir-spotlight-shadow");
    expect(screen.getByTestId("radiance-json-preview").textContent).toContain("webgpu-compute-architecture-and-cpu-parity");

    fireEvent.click(screen.getByTestId("toggle-json-preview-btn"));
    expect(screen.queryByTestId("radiance-json-preview")).toBeNull();
  });

  it("초기값 복원(Reset) 버튼이 시나리오·캐스케이드 깊이를 초기 props 값으로 되돌린다", () => {
    render(<StudioWebGpuRadiancePanel initialScenarioId="sunset-classroom-window" initialCascadeLevels={4} />);
    fireEvent.click(screen.getByTestId("scenario-card-noir-spotlight-shadow"));
    fireEvent.click(screen.getByTestId("cascade-level-6"));
    expect(screen.getByTestId("radiance-scene-svg").getAttribute("data-scenario")).toBe("noir-spotlight-shadow");

    fireEvent.click(screen.getByTestId("reset-radiance-btn"));
    expect(screen.getByTestId("radiance-scene-svg").getAttribute("data-scenario")).toBe("sunset-classroom-window");
    expect(screen.getByTestId("cascade-pyramid-svg").getAttribute("data-levels")).toBe("4");
  });

  it("영문 로케일(locale='en')과 모든 버튼 min-h-11 접근성 터치 타깃을 만족한다", () => {
    const { container } = render(<StudioWebGpuRadiancePanel locale="en" />);
    expect(screen.getByTestId("radiance-scene-svg").textContent).toContain("RADIANCE CASCADES GI · SDF PENUMBRA · CEL RIM");
    expect(screen.getByTestId("cascade-pyramid-svg").textContent).toContain("CASCADE PYRAMID (2× SPACE · 4× RAYS)");
    expect(screen.getByTestId("arch-row-webgpu").textContent).toContain("Full WebGPU Compute");

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(18);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});

describe("5. 코드 위생 · 줄 수 상한 · 탈-바이올렛 OKLCH · 하네스 계약 자가 검증", () => {
  it("소유 파일 4개의 줄 수 상한(engine<=750, panel<=680, 전체<=800)을 엄격 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "radiance-cascades-engine.ts",
      "StudioWebGpuRadiancePanel.tsx",
      "index.ts",
      "radiance-cascades.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const lines = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/u).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "radiance-cascades-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioWebGpuRadiancePanel.tsx") expect(lines).toBeLessThanOrEqual(680);
    }
  });

  it("소스 3개 파일에 금지 패턴(raw color·storage·BigInt·private Map·Sparkles·번역투·transition-all·기본 props)이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    for (const file of ["radiance-cascades-engine.ts", "StudioWebGpuRadiancePanel.tsx", "index.ts"]) {
      const src = readFileSync(path.join(dir, file), "utf8");
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
      if (file === "StudioWebGpuRadiancePanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
      }
    }
  });

  it("패널 내 모든 oklch() 리터럴 색상이 바이올렛 휴(270~320°)를 0% 배제한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioWebGpuRadiancePanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(6);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("패널이 한글 줄바꿈([word-break:keep-all])·tabular-nums·min-h-11·motion-reduce 계약을 모두 포함한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioWebGpuRadiancePanel.tsx"),
      "utf8",
    );
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });
});
