// @vitest-environment jsdom

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_XPBD_CONFIG,
  StudioWebgpuXpbdLightingPanel,
  TOON_LIGHTING_PRESETS,
  TOON_SDF_RAYMARCH_WGSL,
  XPBD_HAIR_CLOTH_WGSL,
  auditCapsulePenetration,
  bakeToonSdfLighting,
  createDefaultHumanoidCapsuleColliders,
  createDefaultXpbdRigState,
  formatOklch,
  kelvinToOklch,
  packToonLightingUniformBuffer,
  packXpbdGpuBuffers,
  renderXpbdLightingPreviewCanvas,
  runXpbdSimulation,
  stepXpbdSimulation,
  validateWgslComputeShader,
  type XpbdParticle,
} from "./index";

const RAW_COLOR_REGEX = /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/u;
const FORBIDDEN_STORAGE_REGEX = /\blocalStorage\b|\bsessionStorage\b/u;
const FORBIDDEN_TRANSITION_ALL_REGEX = /\btransition-all\b/u;
const FORBIDDEN_SPARKLES_REGEX = /\bSparkles\b/u;
const FORBIDDEN_PRIVATE_STORE_MAP_REGEX =
  /\bprivate\s+(?:readonly\s+)?store\b|\bstore\s*=\s*new\s+Map\b/u;

function createMockCanvas2dContext() {
  const gradientStub = {
    addColorStop: vi.fn(),
  };
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => gradientStub),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
  } satisfies Partial<CanvasRenderingContext2D>;
}

function mockCanvas2dContext(canvas: HTMLCanvasElement, mockCtx = createMockCanvas2dContext()) {
  const canvas2d: {
    getContext(contextId: "2d"): Pick<CanvasRenderingContext2D, keyof typeof mockCtx> | null;
  } = canvas;
  vi.spyOn(canvas2d, "getContext").mockImplementation((id) => (id === "2d" ? mockCtx : null));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wave 37D — WebGPU 컴퓨트 XPBD 헤어·의상 물리 충돌 엔진", () => {
  it("1. XPBD_HAIR_CLOTH_WGSL은 유효한 @compute 진입점 3종·바인딩 5종·구조체 5종을 선언한다", () => {
    const report = validateWgslComputeShader(XPBD_HAIR_CLOTH_WGSL);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.balancedDelimiters).toBe(true);
    expect(report.entryPoints).toEqual([
      "predict_positions",
      "solve_constraints_and_collide",
      "integrate_velocities",
    ]);
    expect(report.bindings).toHaveLength(5);
    expect(report.structs).toEqual(
      expect.arrayContaining([
        "SimParams",
        "Particle",
        "CapsuleCollider",
        "DistanceConstraint",
        "BendingConstraint",
      ]),
    );
  });

  it("2. TOON_SDF_RAYMARCH_WGSL 구조 검증을 통과하고 잘못된 WGSL 문법 오류를 검출한다", () => {
    const validReport = validateWgslComputeShader(TOON_SDF_RAYMARCH_WGSL);
    expect(validReport.valid).toBe(true);
    expect(validReport.entryPoints).toEqual(["bake_toon_sdf_lighting"]);
    expect(validReport.bindings).toHaveLength(3);
    expect(validReport.workgroupSizes).toEqual(["8,8,1"]);

    const brokenReport = validateWgslComputeShader(`
      @group(0) @binding(0) var<uniform> a: u32;
      @group(0) @binding(0) var<uniform> b: u32;
      fn broken( {
    `);
    expect(brokenReport.valid).toBe(false);
    expect(brokenReport.balancedDelimiters).toBe(false);
    expect(brokenReport.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("3. 머리·목·양어깨·상체 5종 캡슐 내부에 강제 침투된 입자도 1스텝 만에 0mm 비관통을 보장한다", () => {
    const baseState = createDefaultXpbdRigState();
    const colliders = createDefaultHumanoidCapsuleColliders();
    expect(colliders).toHaveLength(5);

    // 5종 캡슐 중심 좌표에 자유 입자를 강제 배치해 깊은 관통 유발
    const injectedParticles: XpbdParticle[] = baseState.particles.map((p, idx) => {
      if (p.invMass <= 0) return p;
      const targetCap = colliders[idx % colliders.length];
      if (!targetCap) return p;
      const mid: readonly [number, number, number] = [
        (targetCap.a[0] + targetCap.b[0]) * 0.5,
        (targetCap.a[1] + targetCap.b[1]) * 0.5,
        (targetCap.a[2] + targetCap.b[2]) * 0.5,
      ];
      return { ...p, pos: mid, prevPos: mid };
    });

    const preAudit = auditCapsulePenetration(injectedParticles, colliders);
    expect(preAudit.penetrationMm).toBeGreaterThan(50);

    const stepped = stepXpbdSimulation(
      { ...baseState, particles: injectedParticles },
      DEFAULT_XPBD_CONFIG,
    );
    expect(stepped.collision.rawPenetrationBeforeProjectMm).toBeGreaterThan(50);
    expect(stepped.collision.penetrationMm).toBe(0);
    expect(stepped.metrics.penetrationMm).toBe(0);
    expect(stepped.collision.minSurfaceMarginMm).toBeGreaterThan(0);
  });

  it("4. 강풍+돌풍 난류 90프레임 장기 시뮬레이션 내내 0mm 비관통·루트 고정·신장률 상한을 지킨다", () => {
    const initial = createDefaultXpbdRigState();
    const stormCfg = {
      ...DEFAULT_XPBD_CONFIG,
      maxStretchRatio: 1.08,
      wind: {
        strengthMps: 14,
        azimuthDeg: 35,
        gustTurbulence: 0.9,
        gustFrequencyHz: 1.8,
      },
    };

    let current = initial;
    for (let frame = 0; frame < 90; frame += 1) {
      const res = stepXpbdSimulation(current, stormCfg);
      expect(res.metrics.penetrationMm).toBe(0);
      expect(res.metrics.stable).toBe(true);
      expect(res.metrics.maxStretchRatioObserved).toBeLessThanOrEqual(1.16);
      current = res.state;
    }

    // 모든 고정 뿌리(invMass === 0) 좌표는 초기 위치와 완전 일치해야 한다
    for (let i = 0; i < initial.particles.length; i += 1) {
      const orig = initial.particles[i];
      const next = current.particles[i];
      if (orig && next && orig.invMass === 0) {
        expect(next.pos).toEqual(orig.pos);
      }
    }
  });

  it("5. 바람 세기와 방위각(+X vs -X)이 헤어·의상 끝단 변위 방향과 크기에 물리적으로 반영된다", () => {
    const initial = createDefaultXpbdRigState();
    const calm = runXpbdSimulation(initial, 30, {
      wind: { strengthMps: 0, azimuthDeg: 0, gustTurbulence: 0, gustFrequencyHz: 1.2 },
    });
    const windRight = runXpbdSimulation(initial, 30, {
      wind: { strengthMps: 12, azimuthDeg: 0, gustTurbulence: 0.2, gustFrequencyHz: 1.2 },
    });
    const windLeft = runXpbdSimulation(initial, 30, {
      wind: { strengthMps: 12, azimuthDeg: 180, gustTurbulence: 0.2, gustFrequencyHz: 1.2 },
    });

    const meanFreeX = (particles: readonly XpbdParticle[]): number => {
      const free = particles.filter((p) => p.invMass > 0);
      return free.reduce((acc, p) => acc + p.pos[0], 0) / Math.max(1, free.length);
    };

    expect(windRight.metrics.meanTipDisplacementMm).toBeGreaterThan(
      calm.metrics.meanTipDisplacementMm + 10,
    );
    expect(meanFreeX(windRight.state.particles)).toBeGreaterThan(meanFreeX(calm.state.particles) + 0.02);
    expect(meanFreeX(windLeft.state.particles)).toBeLessThan(meanFreeX(calm.state.particles) - 0.02);
  });

  it("6. 무풍 감쇠 구간에서 초기 운동 에너지가 발산하지 않고 안정적으로 소산된다", () => {
    const base = createDefaultXpbdRigState();
    const excited = runXpbdSimulation(base, 20, {
      wind: { strengthMps: 15, azimuthDeg: 15, gustTurbulence: 0.85, gustFrequencyHz: 2.0 },
    });
    const afterCalm10 = runXpbdSimulation(excited.state, 10, {
      damping: 0.25,
      wind: { strengthMps: 0, azimuthDeg: 0, gustTurbulence: 0, gustFrequencyHz: 1.0 },
    });
    const afterCalm80 = runXpbdSimulation(afterCalm10.state, 80, {
      damping: 0.25,
      wind: { strengthMps: 0, azimuthDeg: 0, gustTurbulence: 0, gustFrequencyHz: 1.0 },
    });

    expect(afterCalm80.metrics.stable).toBe(true);
    expect(afterCalm80.metrics.kineticEnergyJ).toBeLessThan(afterCalm10.metrics.kineticEnergyJ);
    expect(afterCalm80.metrics.kineticEnergyJ).toBeLessThan(0.02);
    expect(afterCalm80.metrics.penetrationMm).toBe(0);
  });

  it("7. 천·헤어 강성(stiffness) 변화가 컴플라이언스와 바람 변형량에 유의미한 차이를 만든다", () => {
    const initial = createDefaultXpbdRigState();
    const soft = runXpbdSimulation(initial, 35, {
      clothStiffness: 0.05,
      hairStiffness: 0.05,
      wind: { strengthMps: 10, azimuthDeg: 0, gustTurbulence: 0.1, gustFrequencyHz: 1.0 },
    });
    const stiff = runXpbdSimulation(initial, 35, {
      clothStiffness: 0.98,
      hairStiffness: 0.98,
      wind: { strengthMps: 10, azimuthDeg: 0, gustTurbulence: 0.1, gustFrequencyHz: 1.0 },
    });

    expect(soft.metrics.stateHashHex).not.toBe(stiff.metrics.stateHashHex);
    expect(soft.metrics.penetrationMm).toBe(0);
    expect(stiff.metrics.penetrationMm).toBe(0);
  });

  it("8. 비트 결정론적 해시 일치 및 WebGPU std140/std430 버퍼 패킹 규격을 충족한다", () => {
    const runA = runXpbdSimulation(createDefaultXpbdRigState(), 24, DEFAULT_XPBD_CONFIG);
    const runB = runXpbdSimulation(createDefaultXpbdRigState(), 24, DEFAULT_XPBD_CONFIG);
    expect(runA.metrics.stateHashHex).toBe(runB.metrics.stateHashHex);
    expect(runA.state.particles).toEqual(runB.state.particles);

    const packed = packXpbdGpuBuffers(runA.state, DEFAULT_XPBD_CONFIG);
    expect(packed.uniformF32).toHaveLength(16);
    expect(packed.particleF32).toHaveLength(runA.state.particles.length * 12);
    expect(packed.colliderF32).toHaveLength(runA.state.colliders.length * 8);
    expect(packed.distanceConstraintU32).toHaveLength(runA.state.distanceConstraints.length * 4);
    expect(packed.bendingConstraintU32).toHaveLength(runA.state.bendingConstraints.length * 8);
    expect(packed.workgroupCountX).toBeGreaterThanOrEqual(1);
  });
});

describe("Wave 37D — 2D/3D 단일 물리 광원 리그 & SDF 툰 광원 베이크 엔진", () => {
  it("9. 2D 배경 컷과 3D VRM 광원의 방위각·고도각·색온도가 0 오차로 일치하고 투영 그림자가 정확히 180° 반대다", () => {
    for (const preset of TOON_LIGHTING_PRESETS) {
      const baked = bakeToonSdfLighting(preset.light, { gridSize: 12 });
      expect(baked.alignmentMetrics.azimuthMismatchDeg).toBe(0);
      expect(baked.alignmentMetrics.elevationMismatchDeg).toBe(0);
      expect(baked.alignmentMetrics.kelvinMismatchK).toBe(0);
      expect(baked.alignmentMetrics.shadowOppositionErrorDeg).toBe(0);
      expect(baked.alignmentMetrics.harmonyScore).toBe(100);
      expect(baked.cut2dLightMetadata.shadowAngleDeg).toBe(
        baked.vrmShaderUniforms.projectedShadowAngleDeg,
      );
      expect(baked.projectedShadowAngleDeg).toBe((baked.input.azimuthDeg + 180) % 360);
    }

    const lowSun = bakeToonSdfLighting({ azimuthDeg: 40, elevationDeg: 16, colorTempKelvin: 3000 });
    const highSun = bakeToonSdfLighting({ azimuthDeg: 40, elevationDeg: 74, colorTempKelvin: 5600 });
    expect(lowSun.projectedShadowLengthRatio).toBeGreaterThan(highSun.projectedShadowLengthRatio * 3);
  });

  it("10. 색온도(K)가 OKLCH 주광원·림라이트·바닥 바운스·단조 증가 셀 램프에 정확히 반영된다", () => {
    const warm = bakeToonSdfLighting({
      azimuthDeg: 60,
      elevationDeg: 25,
      colorTempKelvin: 2700,
      celStepCount: 4,
    });
    const cool = bakeToonSdfLighting({
      azimuthDeg: 60,
      elevationDeg: 25,
      colorTempKelvin: 8600,
      celStepCount: 4,
    });

    // 난색(2700K)은 주황~황색 OKLCH 각도(<100°), 한색(8600K)은 청색 OKLCH 각도(>200°)
    expect(kelvinToOklch(2700).h).toBeLessThan(100);
    expect(kelvinToOklch(8600).h).toBeGreaterThan(200);
    expect(warm.keyLightOklch.h).toBeLessThan(100);
    expect(cool.keyLightOklch.h).toBeGreaterThan(200);
    expect(warm.celRamp).toHaveLength(4);
    expect(warm.keyLightCss).toMatch(/^oklch\(/u);
    expect(formatOklch(warm.floorBounceOklch, 0.5)).toMatch(/^oklch\(.+\/ 0\.50\)$/u);

    // 4단 셀 램프 명도(L)는 음영 → 하이라이트 순으로 단조 증가해야 한다
    for (let i = 1; i < warm.celRamp.length; i += 1) {
      const prev = warm.celRamp[i - 1];
      const curr = warm.celRamp[i];
      expect(curr?.colorOklch.l).toBeGreaterThan(prev?.colorOklch.l ?? 0);
    }
  });

  it("11. CPU SDF 레이마칭 폴백이 휴머노이드 볼륨을 적중시키고 좌/우 광원 전환에 따라 음영이 반전된다", () => {
    const rightLit = bakeToonSdfLighting(
      { azimuthDeg: 0, elevationDeg: 35, colorTempKelvin: 5200 },
      { gridSize: 16 },
    );
    const leftLit = bakeToonSdfLighting(
      { azimuthDeg: 180, elevationDeg: 35, colorTempKelvin: 5200 },
      { gridSize: 16 },
    );
    const rightLitAgain = bakeToonSdfLighting(
      { azimuthDeg: 0, elevationDeg: 35, colorTempKelvin: 5200 },
      { gridSize: 16 },
    );

    const hitSamplesRight = rightLit.sdfSamples.filter((s) => s.hit);
    expect(hitSamplesRight.length).toBeGreaterThan(25);
    expect(rightLit.bakeHashHex).toBe(rightLitAgain.bakeHashHex);
    expect(rightLit.bakeHashHex).not.toBe(leftLit.bakeHashHex);

    // 오른쪽 반구(u > 0.52) 평균 ndotl은 우측 광원(0°)일 때 좌측 광원(180°)보다 명확히 커야 한다
    const rightSideAvgNdotl = (samples: typeof rightLit.sdfSamples): number => {
      const subset = samples.filter((s) => s.hit && s.u > 0.52);
      return subset.reduce((acc, s) => acc + s.ndotl, 0) / Math.max(1, subset.length);
    };
    expect(rightSideAvgNdotl(rightLit.sdfSamples)).toBeGreaterThan(
      rightSideAvgNdotl(leftLit.sdfSamples) + 0.35,
    );

    const uniformBuf = packToonLightingUniformBuffer(rightLit, 5);
    expect(uniformBuf).toHaveLength(24);
  });

  it("12. renderXpbdLightingPreviewCanvas가 OKLCH·시맨틱 토큰으로 프리뷰 캔버스를 안전하게 그린다", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 560;
    canvas.height = 340;
    const mockCtx = createMockCanvas2dContext();
    mockCanvas2dContext(canvas, mockCtx);
    expect(canvas.getContext("webgpu")).toBeNull();

    const sim = stepXpbdSimulation(createDefaultXpbdRigState(), DEFAULT_XPBD_CONFIG);
    const light = bakeToonSdfLighting({ azimuthDeg: 45, elevationDeg: 40, colorTempKelvin: 5200 });

    const rendered = renderXpbdLightingPreviewCanvas(canvas, sim.state, light, {
      showColliders: true,
      wind: DEFAULT_XPBD_CONFIG.wind,
    });
    expect(rendered).toBe(true);
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.ellipse).toHaveBeenCalled();
  });
});

describe("Wave 37D — StudioWebgpuXpbdLightingPanel UI 상호작용 및 Calm Atelier 위생 계약", () => {
  it("13. props 없이 단독 렌더링되고 0mm 관통·2D/3D 광원 일치·WGSL 계약 요약을 표시한다", () => {
    mockCanvas2dContext(HTMLCanvasElement.prototype);

    render(createElement(StudioWebgpuXpbdLightingPanel));
    expect(screen.getByTestId("studio-webgpu-xpbd-lighting-panel")).toBeTruthy();
    expect(screen.getByTestId("xpbd-penetration-badge").textContent).toContain("0.00mm");
    expect(screen.getByTestId("lighting-harmony-badge").textContent).toContain("100/100");
    expect(screen.getByTestId("lighting-mismatch-summary").textContent).toContain("0° / 0K");

    fireEvent.click(screen.getByTestId("toggle-wgsl-inspector"));
    const wgslSummary = screen.getByTestId("wgsl-contract-summary").textContent ?? "";
    expect(wgslSummary).toContain("predict_positions");
    expect(wgslSummary).toContain("bake_toon_sdf_lighting");
  });

  it("14. 프리셋 전환·바람/강성/광원 슬라이더·셀 단계·1스텝·초기화가 실시간 반영된다", () => {
    mockCanvas2dContext(HTMLCanvasElement.prototype);
    const onMetricsChange = vi.fn();

    render(createElement(StudioWebgpuXpbdLightingPanel, { onMetricsChange }));

    fireEvent.click(screen.getByTestId("lighting-preset-golden-sunset"));
    expect((screen.getByTestId("slider-color-temp") as HTMLInputElement).value).toBe("2900");

    fireEvent.change(screen.getByTestId("slider-wind-strength"), { target: { value: "12" } });
    fireEvent.change(screen.getByTestId("slider-wind-azimuth"), { target: { value: "180" } });
    fireEvent.change(screen.getByTestId("slider-cloth-stiffness"), { target: { value: "90" } });
    fireEvent.change(screen.getByTestId("slider-light-azimuth"), { target: { value: "120" } });
    fireEvent.change(screen.getByTestId("slider-light-elevation"), { target: { value: "60" } });
    fireEvent.change(screen.getByTestId("slider-color-temp"), { target: { value: "7400" } });

    fireEvent.click(screen.getByTestId("cel-steps-4"));
    fireEvent.click(screen.getByTestId("xpbd-step-once"));
    fireEvent.click(screen.getByTestId("xpbd-toggle-colliders"));

    expect(screen.getByTestId("xpbd-penetration-badge").textContent).toContain("0.00mm");
    expect(onMetricsChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("xpbd-lighting-reset"));
    expect((screen.getByTestId("slider-color-temp") as HTMLInputElement).value).toBe("5200");
    expect((screen.getByTestId("slider-wind-strength") as HTMLInputElement).value).toBe("3.4");
  });

  it("15. 모듈 전역 위생 계약: 모든 소스 <= 800줄, 원시 hex/rgb/hsl·Web Storage·transition-all·private store Map 0건", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const sourceFiles = fs
      .readdirSync(dir)
      .filter((name) => /\.(ts|tsx)$/u.test(name) && !name.includes(".test."));
    expect(sourceFiles.length).toBeGreaterThanOrEqual(4);

    for (const file of sourceFiles) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const lineCount = content.split("\n").length;
      expect(lineCount, `${file} 줄 수 초과`).toBeLessThanOrEqual(800);
      expect(content, `${file} 원시 색상 검출`).not.toMatch(RAW_COLOR_REGEX);
      expect(content, `${file} Web Storage 검출`).not.toMatch(FORBIDDEN_STORAGE_REGEX);
      expect(content, `${file} transition-all 검출`).not.toMatch(FORBIDDEN_TRANSITION_ALL_REGEX);
      expect(content, `${file} Sparkles 검출`).not.toMatch(FORBIDDEN_SPARKLES_REGEX);
      expect(content, `${file} private store Map 검출`).not.toMatch(
        FORBIDDEN_PRIVATE_STORE_MAP_REGEX,
      );
    }
  });
});
