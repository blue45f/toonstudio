import { describe, expect, it, vi } from "vitest";
import { link } from "wesl";

import { normalizeScreentoneLayer } from "../../screentone/screentone-layer";
import { renderScreentoneWithOutlineFallback } from "../../screentone/screentone-render";
import { buildStudioDiagnosticsReport } from "../../studio-device-diagnostics";
import type { StudioReliabilityStatusSnapshot } from "../../studio-reliability-status-store";

import {
  GpuBufferPool,
  GpuPipelineWarmupQueue,
  type GpuNextBufferLike,
  type GpuNextComputePipelineLike,
  type GpuNextPipelineDeviceLike,
} from "./gpu-buffer-pool-and-warmup";
import type { GpuNextHdrComputeDeviceLike } from "./gpu-hdr-dither-and-frame-budget";
import {
  StudioGpuNextRuntimeHub,
  disposeStudioGpuNextRuntimeHub,
  formatStudioGpuNextTelemetrySummary,
  getStudioGpuNextRuntimeHub,
  peekStudioGpuNextDiagnosticsSnapshot,
} from "./gpu-next-runtime-bridge";
import {
  GPU_NEXT_JFA_OUTLINE_WGSL,
  GPU_NEXT_SCREENTONE_OUTLINE_ONEPASS_WGSL,
} from "./gpu-next-wgsl-shaders";
import {
  StylusSubpixelPredictor,
  computeJfaStepSchedule,
  computeScreentoneCellPx,
  dispatchScreentoneAndOutline,
  evaluateCentripetalCatmullRom,
  evaluateScreentoneDotCoverageCpu,
  packJfaStepUniforms,
  packScreentoneOutlineUniforms,
  renderScreentoneAndOutlineCpu,
  type StylusPointerEventLike,
} from "./gpu-stylus-predict-and-screentone";

describe("스크린톤·Sobel·JFA 외곽선 WGSL 구문 무결성(wesl)", () => {
  it("1패스 스크린톤/Sobel 셰이더와 JFA 외곽선 셰이더 모두 wesl로 오류 없이 링크된다", async () => {
    for (const shader of [GPU_NEXT_SCREENTONE_OUTLINE_ONEPASS_WGSL, GPU_NEXT_JFA_OUTLINE_WGSL]) {
      expect(shader).not.toMatch(/\b(meta|active)\b/u);
    }
    const toneLinked = (
      await link({
        weslSrc: { main: GPU_NEXT_SCREENTONE_OUTLINE_ONEPASS_WGSL },
        rootModuleName: "main",
      })
    ).dest;
    expect(toneLinked).toContain("fn screentone_and_outline_main(");
    expect(toneLinked).toContain("fn screentone_coverage(");
    expect(toneLinked).toContain("fn sobel_edge(");

    const jfaLinked = (
      await link({
        weslSrc: { main: GPU_NEXT_JFA_OUTLINE_WGSL },
        rootModuleName: "main",
      })
    ).dest;
    expect(jfaLinked).toContain("fn jfa_seed_init_main(");
    expect(jfaLinked).toContain("fn jfa_flood_step_main(");
    expect(jfaLinked).toContain("fn jfa_outline_resolve_main(");
  });
});

describe("서브픽셀 예측 스타일러스 입력 (Coalesced + Predicted + Catmull-Rom)", () => {
  it("Centripetal Catmull-Rom이 양 끝점(p1, p2)을 정확히 통과하고 매끄러운 중점을 생성한다", () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 10, y: 0 };
    const p2 = { x: 20, y: 10 };
    const p3 = { x: 30, y: 10 };

    const start = evaluateCentripetalCatmullRom(p0, p1, p2, p3, 0);
    const end = evaluateCentripetalCatmullRom(p0, p1, p2, p3, 1);
    const mid = evaluateCentripetalCatmullRom(p0, p1, p2, p3, 0.5);

    expect(start.x).toBeCloseTo(10, 5);
    expect(start.y).toBeCloseTo(0, 5);
    expect(end.x).toBeCloseTo(20, 5);
    expect(end.y).toBeCloseTo(10, 5);
    expect(mid.x).toBeGreaterThan(10);
    expect(mid.x).toBeLessThan(20);
    expect(mid.y).toBeGreaterThan(0);
    expect(mid.y).toBeLessThan(10);
  });

  it("getCoalescedEvents 수집 및 등속 직선·원호 스트로크에서 1프레임 선행 예측 오차를 서브픽셀 수준으로 유지한다", () => {
    const predictor = new StylusSubpixelPredictor({ lookaheadMs: 8, maxLookaheadMs: 24 });

    // 120Hz(8ms 간격) 등속 직선 스트로크: 초당 1000px → 8ms당 8px 전진.
    const coalescedBatch: StylusPointerEventLike[] = [
      { clientX: 0, clientY: 50, pressure: 0.5, timeStamp: 0 },
      { clientX: 8, clientY: 50, pressure: 0.5, timeStamp: 8 },
      { clientX: 16, clientY: 50, pressure: 0.5, timeStamp: 16 },
      { clientX: 24, clientY: 50, pressure: 0.5, timeStamp: 24 },
    ];
    const event: StylusPointerEventLike = {
      ...coalescedBatch[3]!,
      getCoalescedEvents: () => coalescedBatch,
    };

    const step = predictor.ingestPointerEvent(event);
    expect(step.authoritative).toHaveLength(4);
    expect(step.authoritative.every((p) => p.authority === "authoritative")).toBe(true);
    expect(step.predicted).toHaveLength(2);
    expect(step.predicted.every((p) => p.authority === "predicted-preview")).toBe(true);

    // 다음 프레임(t=32ms)의 실제 위치는 (32, 50) — 예측 오차 < 0.05px!
    const tip = step.predicted[1]!;
    expect(Math.hypot(tip.x - 32, tip.y - 50)).toBeLessThan(0.05);

    // 완만한 원호(R=200px) 스트로크에서 2차 곡률 외삽이 선형 외삽보다 실제 다음 점을 더 정확히 추종한다.
    predictor.reset();
    const radius = 200;
    const dTheta = 0.08;
    for (let k = 0; k < 4; k += 1) {
      const angle = k * dTheta;
      predictor.ingestPointerEvent({
        clientX: radius * Math.cos(angle),
        clientY: radius * Math.sin(angle),
        pressure: 0.6,
        timeStamp: k * 8,
      });
    }
    const arcStep = predictor.ingestPointerEvent({
      clientX: radius * Math.cos(4 * dTheta),
      clientY: radius * Math.sin(4 * dTheta),
      pressure: 0.6,
      timeStamp: 32,
    });
    const trueNextX = radius * Math.cos(5 * dTheta);
    const trueNextY = radius * Math.sin(5 * dTheta);
    const arcTip = arcStep.predicted[1]!;
    expect(Math.hypot(arcTip.x - trueNextX, arcTip.y - trueNextY)).toBeLessThan(0.35);
  });

  it("네이티브 getPredictedEvents 융합과 급격한 코너 반전 오버슈트 클램프를 적용한다", () => {
    const predictor = new StylusSubpixelPredictor({
      lookaheadMs: 16,
      maxStepMultiplier: 1.25,
      maxLeadDistancePx: 20,
    });

    predictor.ingestPointerEvent({ clientX: 0, clientY: 0, pressure: 0.5, timeStamp: 0 });
    predictor.ingestPointerEvent({ clientX: 10, clientY: 0, pressure: 0.5, timeStamp: 8 });
    predictor.ingestPointerEvent({ clientX: 20, clientY: 0, pressure: 0.5, timeStamp: 16 });

    // 네이티브 예측이 터무니없이 멀리(x=200) 튀어도 maxLeadDistancePx(20px) 이내로 클램프된다.
    const nativeSpiky = predictor.ingestPointerEvent({
      clientX: 30,
      clientY: 0,
      pressure: 0.6,
      timeStamp: 24,
      getPredictedEvents: () => [{ clientX: 200, clientY: 0, pressure: 1.5, timeStamp: 40 }],
    });
    expect(nativeSpiky.diagnostics.usedNativeFusion).toBe(true);
    expect(nativeSpiky.diagnostics.overshootClamped).toBe(true);
    expect(nativeSpiky.diagnostics.leadDistancePx).toBeLessThanOrEqual(20.001);
    expect(nativeSpiky.predicted[1]!.pressure).toBeLessThanOrEqual(1);

    // 급격한 180° 반전 시 turnAttenuation이 감쇠되어 코너 오버슈트가 억제된다.
    const reversal = predictor.ingestPointerEvent({
      clientX: 22,
      clientY: 0,
      pressure: 0.5,
      timeStamp: 32,
    });
    expect(reversal.diagnostics.turnAttenuation).toBeLessThan(0.2);
    expect(reversal.diagnostics.leadDistancePx).toBeLessThan(2);
  });
});

describe("WebGPU Compute & CPU 폴백 비파괴 스크린톤 + Sobel/JFA 외곽선", () => {
  it("원형·다이아몬드·선형 망점이 회전각·LPI 조건에서 목표 농도 면적을 보존한다", () => {
    const cellPx = computeScreentoneCellPx(30, 300); // 10px
    expect(cellPx).toBe(10);

    const targetDensity = 0.4;
    const rad = (45 * Math.PI) / 180;
    const cosAngle = Math.cos(rad);
    const sinAngle = Math.sin(rad);

    for (const dotShape of ["circle", "diamond", "line"] as const) {
      let sum = 0;
      const size = 80;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          sum += evaluateScreentoneDotCoverageCpu(
            x,
            y,
            { dotShape, cellPx, cosAngle, sinAngle, phaseX: 0, phaseY: 0 },
            targetDensity,
          );
        }
      }
      const meanCoverage = sum / (size * size);
      expect(Math.abs(meanCoverage - targetDensity)).toBeLessThan(0.06);
    }

    // 다이아몬드 d=0.49 <-> d=0.51 연속성 확인(급격한 점프 없음).
    const dLow = evaluateScreentoneDotCoverageCpu(
      3,
      3,
      { dotShape: "diamond", cellPx: 10, cosAngle: 1, sinAngle: 0, phaseX: 0, phaseY: 0 },
      0.49,
    );
    const dHigh = evaluateScreentoneDotCoverageCpu(
      3,
      3,
      { dotShape: "diamond", cellPx: 10, cosAngle: 1, sinAngle: 0, phaseX: 0, phaseY: 0 },
      0.51,
    );
    expect(Math.abs(dHigh - dLow)).toBeLessThan(0.2);
  });

  it("Sobel 1패스 외곽선과 Jump-Flooding(JFA) 유클리드 외곽선이 실루엣 경계를 정확히 둘러싼다", () => {
    const width = 40;
    const height = 40;
    const src = new Uint8ClampedArray(width * height * 4);
    // 중앙 12x12 정사각형 불투명 실루엣(x: 14..25, y: 14..25)
    for (let y = 14; y <= 25; y += 1) {
      for (let x = 14; x <= 25; x += 1) {
        const o = (y * width + x) * 4;
        src[o] = 128;
        src[o + 1] = 128;
        src[o + 2] = 128;
        src[o + 3] = 255;
      }
    }

    // 1) Sobel 1패스 외곽선
    const sobelRes = renderScreentoneAndOutlineCpu(src, {
      width,
      height,
      dotShape: "circle",
      lpi: 60,
      angleDeg: 45,
      density: 0.35,
      outlineMode: "sobel",
      outlineThreshold: 0.2,
      outlineRgba: [220, 30, 30, 255],
    });
    expect(sobelRes.passCount).toBe(1);
    const sobelPixels = sobelRes.pixels!;
    // 경계 픽셀 (13, 20) 또는 (14, 20)은 외곽선 빨간색 성분이 강하게 검출된다.
    expect(sobelPixels[(20 * width + 14) * 4]).toBeGreaterThan(150);
    // 멀리 떨어진 배경 (2, 2)는 완전 투명.
    expect(sobelPixels[(2 * width + 2) * 4 + 3]).toBe(0);

    // 2) Jump-Flooding Algorithm (JFA) 반경 4px 외곽선
    expect(computeJfaStepSchedule(6)).toEqual([4, 2, 1]);
    const jfaRes = renderScreentoneAndOutlineCpu(src, {
      width,
      height,
      dotShape: "diamond",
      lpi: 50,
      angleDeg: 30,
      density: 0.4,
      outlineMode: "jump-flood",
      outlineWidthPx: 4,
      outlineRgba: [20, 40, 220, 255],
    });
    expect(jfaRes.jfaSteps).toEqual([4, 2, 1]);
    const jfaPixels = jfaRes.pixels!;

    // 실루엣 바깥 3px 지점 (11, 20): 유클리드 거리 3 <= 4 → 외곽선 불투명(파랑) 채색!
    expect(jfaPixels[(20 * width + 11) * 4 + 2]).toBeGreaterThan(180);
    expect(jfaPixels[(20 * width + 11) * 4 + 3]).toBe(255);
    // 실루엣 바깥 6px 지점 (8, 20): 거리 6 > 4 → 투명!
    expect(jfaPixels[(20 * width + 8) * 4 + 3]).toBe(0);
    // 대각선 코너 바깥 (10, 10): 유클리드 거리 hypot(4, 4) ≈ 5.66 > 4 → 둥근 유클리드 코너(투명)!
    expect(jfaPixels[(10 * width + 10) * 4 + 3]).toBe(0);
    // 대각선 코너 바깥 (12, 12): 유클리드 거리 hypot(2, 2) ≈ 2.83 <= 4 → 외곽선 채색!
    expect(jfaPixels[(12 * width + 12) * 4 + 3]).toBe(255);

    // screentone-render.ts 통합 경로 검증.
    const integrated = renderScreentoneWithOutlineFallback(
      src,
      width,
      height,
      normalizeScreentoneLayer({ kind: "dot", lines: 50, angle: 45, density: 40 }),
      { dotShape: "diamond", outlineMode: "jump-flood", outlineWidthPx: 3 },
    );
    expect(integrated.pixels).toHaveLength(width * height * 4);
    expect(integrated.pixels![(20 * width + 12) * 4 + 3]).toBe(255);
  });

  it("WebGPU Compute JFA 디스패치가 단계별 독립 uniform 버퍼를 풀링·반납하고 런타임 브리지·진단 리포트와 연동된다", async () => {
    const writtenBuffers: unknown[] = [];
    const fakeDevice: GpuNextHdrComputeDeviceLike & GpuNextPipelineDeviceLike = {
      createBuffer({ size, usage, label }): GpuNextBufferLike {
        return { size, usage, label, destroy() {} };
      },
      createShaderModule({ label }) {
        return { label };
      },
      async createComputePipelineAsync({ label }): Promise<GpuNextComputePipelineLike> {
        return {
          label,
          getBindGroupLayout: () => ({}) as GPUBindGroupLayout,
        };
      },
      queue: {
        writeBuffer: vi.fn((buf: unknown) => {
          writtenBuffers.push(buf);
        }),
        submit: vi.fn(),
      },
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: () => ({
        beginComputePass: () => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          dispatchWorkgroups: vi.fn(),
          end: vi.fn(),
        }),
        finish: () => ({}),
      }),
    };

    expect(packScreentoneOutlineUniforms({ width: 16, height: 16 }).byteLength).toBe(64);
    expect(
      packJfaStepUniforms({
        width: 16,
        height: 16,
        stepSize: 4,
        alphaThresholdU8: 128,
        outlineWidthPx: 4,
        outlineRgba: [0, 0, 0, 255],
      }).byteLength,
    ).toBe(32);

    const pool = new GpuBufferPool();
    const warmup = new GpuPipelineWarmupQueue(fakeDevice);
    const src = new Uint8ClampedArray(16 * 16 * 4);

    const gpuRes = await dispatchScreentoneAndOutline({
      device: fakeDevice,
      pool,
      warmupQueue: warmup,
      srcRgba8: src,
      options: {
        width: 16,
        height: 16,
        dotShape: "circle",
        outlineMode: "jump-flood",
        outlineWidthPx: 4,
      },
    });
    expect(gpuRes.backend).toBe("webgpu");
    expect(gpuRes.jfaSteps).toEqual([4, 2, 1]);
    // 1(screentone) + 1(init) + 3(jfa steps) + 1(resolve) = 6 passes
    expect(gpuRes.passCount).toBe(6);
    // 모든 풀링 버퍼가 반납 완료(활성 0).
    expect(pool.getMetrics().gpuActiveCount).toBe(0);
    // 각 JFA 단계가 별도 uniform 버퍼에 기록되어 CommandEncoder 제출 전 덮어쓰기 경합이 없다.
    expect(new Set(writtenBuffers).size).toBeGreaterThanOrEqual(6);

    pool.dispose();
    expect(pool.getMetrics().leakedGpuBuffers).toBe(0);

    // 런타임 브리지 & 기기 진단 리포트 통합 검증.
    disposeStudioGpuNextRuntimeHub();
    expect(peekStudioGpuNextDiagnosticsSnapshot()).toBeNull();

    const hub = getStudioGpuNextRuntimeHub();
    hub.recordFrameSample(14.5, "idle");
    const snap = hub.getDiagnosticsSnapshot();
    expect(formatStudioGpuNextTelemetrySummary(snap)).toContain("rgba16float");

    const cleanReliability: StudioReliabilityStatusSnapshot = {
      gpu: null,
      save: null,
      storage: null,
      safeMode: {
        active: false,
        reasons: [],
        enteredAt: null,
        quality: { gpuLanesDisabled: false, livingInkSuspended: false },
        manuallyDismissed: false,
      },
    };
    const report = buildStudioDiagnosticsReport({
      collectedAt: 1_700_000_000_000,
      browser: null,
      capability: null,
      gpuFabric: null,
      adapter: null,
      sqlite: null,
      storage: null,
      reliability: cleanReliability,
      renderBackend: "webgpu",
      appVersion: "test",
      secureContext: true,
      gpuNext: snap,
    });
    const gpuGroup = report.groups.find((g) => g.id === "gpu");
    const nextField = gpuGroup?.fields.find((f) => f.id === "gpu.next-pipeline");
    expect(nextField?.measured).toBe(true);
    expect(nextField?.value).toContain("rgba16float");

    // 독립 허브 인스턴스 CPU 폴백 왕복 검증.
    const standaloneHub = new StudioGpuNextRuntimeHub({ device: null });
    const hdrRun = await standaloneHub.runHdrBlendAndDither(
      new Float32Array(4 * 4 * 4),
      new Float32Array(4 * 4 * 4).fill(0.5),
      { width: 4, height: 4, ditherMode: "bayer8x8" },
    );
    expect(hdrRun.backend).toBe("cpu-fallback");
    const toneRun = await standaloneHub.runScreentoneAndOutline(new Uint8ClampedArray(4 * 4 * 4), {
      width: 4,
      height: 4,
      outlineMode: "sobel",
    });
    expect(toneRun.backend).toBe("cpu-fallback");
    standaloneHub.dispose();
    disposeStudioGpuNextRuntimeHub();
  });
});
