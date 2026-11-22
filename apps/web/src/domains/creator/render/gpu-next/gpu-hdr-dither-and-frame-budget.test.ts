import { describe, expect, it, vi } from "vitest";
import { link } from "wesl";

import { STUDIO_HIGHBIT_BAYER_8 } from "../../studio-highbit-dither";
import { studioHighBitSrgbToLinear } from "../../studio-highbit-transfer";

import {
  GpuBufferPool,
  GpuPipelineWarmupQueue,
  type GpuNextBufferLike,
  type GpuNextComputePipelineLike,
  type GpuNextPipelineDeviceLike,
} from "./gpu-buffer-pool-and-warmup";
import {
  AdaptiveFrameBudgetController,
  GPU_NEXT_HDR_TEXTURE_FORMAT,
  LruTileResidencyEvictionScheduler,
  blendLinearHdrPixelsCpu,
  computeBayer8x8Cell,
  dispatchHdrBlendAndDither,
  encodeLinearHdrToSrgb8Dithered,
  float16BitsToFloat32,
  float32ToFloat16Bits,
  measureGradientBandingMetrics,
  packHdrDitherUniforms,
  packLinearRgbaToRgba16Float,
  unpackRgba16FloatToLinearRgba,
  type GpuNextHdrComputeDeviceLike,
} from "./gpu-hdr-dither-and-frame-budget";
import { GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL } from "./gpu-next-wgsl-shaders";

describe("HDR 선형 블렌딩·디더링 WGSL 구문 무결성(wesl)", () => {
  it("HDR 블렌드 및 Bayer8x8/TPDF 디더링 Compute 셰이더가 wesl로 오류 없이 링크되고 예약어를 피한다", async () => {
    expect(GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL).not.toMatch(/\b(meta|active)\b/u);
    const linked = (
      await link({
        weslSrc: { main: GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL },
        rootModuleName: "main",
      })
    ).dest;
    expect(linked).toContain("fn hdr_linear_blend_main(");
    expect(linked).toContain("fn hdr_tonemap_dither_srgb8_main(");
    expect(linked).toContain("fn bayer8x8_threshold(");
    expect(linked).toContain("fn blend_linear_optical(");
  });

  it("문법 오류가 주입되면 wesl 링크가 실제로 실패한다", async () => {
    const broken = GPU_NEXT_HDR_LINEAR_BLEND_DITHER_WGSL.replace(
      "return v * 12.92;",
      "return v * 12.92",
    );
    await expect(link({ weslSrc: { main: broken }, rootModuleName: "main" })).rejects.toThrow();
  });
});

describe("16-bit rgba16float 선형 HDR 인코딩·블렌딩 및 무밴딩 디더링", () => {
  it("IEEE-754 half-float(rgba16float) 왕복 변환이 SDR·서브노멀·HDR(>1.0)을 정확히 보존한다", () => {
    const samples = [0, 0.0001, 0.0031308, 0.18, 0.5, 1.0, 2.5, 16.0, 1024.0, 65504.0];
    for (const sample of samples) {
      const bits = float32ToFloat16Bits(sample);
      const decoded = float16BitsToFloat32(bits);
      const relTolerance = Math.max(1e-4, sample * 0.002);
      expect(Math.abs(decoded - sample)).toBeLessThanOrEqual(relTolerance);
    }

    // 유한 오버플로는 Inf/NaN 대신 최대 유한값 65504로 클램프된다.
    expect(float16BitsToFloat32(float32ToFloat16Bits(100_000))).toBe(65504);
    expect(Number.isNaN(float16BitsToFloat32(float32ToFloat16Bits(Number.NaN)))).toBe(true);

    const linear = new Float32Array([0.25, 1.75, 4.0, 1.0]);
    const packed = packLinearRgbaToRgba16Float(linear);
    const unpacked = unpackRgba16FloatToLinearRgba(packed);
    expect(packed).toHaveLength(4);
    expect(unpacked[0]).toBeCloseTo(0.25, 3);
    expect(unpacked[1]).toBeCloseTo(1.75, 3);
    expect(unpacked[2]).toBeCloseTo(4.0, 2);
    expect(unpacked[3]).toBeCloseTo(1.0, 3);
  });

  it("비트 인터리빙 Bayer 8×8 계산이 기존 재귀 STUDIO_HIGHBIT_BAYER_8 행렬과 64칸 모두 비트 일치한다", () => {
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        expect(computeBayer8x8Cell(x, y)).toBe(STUDIO_HIGHBIT_BAYER_8[y * 8 + x]);
      }
    }
  });

  it("선형 광학 공간 source-over 블렌딩(검정 위 흰색 50%)이 감마 128이 아닌 물리적 중간톤(~188)을 생성하고 HDR 가산을 보존한다", () => {
    const dst = new Float32Array([0, 0, 0, 1]);
    const src = new Float32Array([1, 1, 1, 0.5]);
    blendLinearHdrPixelsCpu(dst, src, 1, "source-over", 1);

    // 선형 0.5 → IEC 61966-2-1 sRGB ≈ 0.735357 → 8비트 코드 188.
    const srgb8 = encodeLinearHdrToSrgb8Dithered(dst, {
      width: 1,
      height: 1,
      ditherMode: "none",
      tonemapMode: "clamp",
    });
    expect(srgb8[0]).toBe(188);

    // HDR additive 블렌딩은 1.0을 초과하는 선형 광량을 보존하고 Reinhard 톤맵으로 롤오프한다.
    const hdrDst = new Float32Array([1.2, 0.6, 0.2, 1]);
    const hdrSrc = new Float32Array([1.8, 0.4, 0.1, 1]);
    blendLinearHdrPixelsCpu(hdrDst, hdrSrc, 1, "additive", 1);
    expect(hdrDst[0]).toBeCloseTo(3.0, 4);

    const mapped = encodeLinearHdrToSrgb8Dithered(hdrDst, {
      width: 1,
      height: 1,
      ditherMode: "none",
      tonemapMode: "reinhard-extended",
      whitePoint: 6,
    });
    expect(mapped[0]).toBeGreaterThan(220);
    expect(mapped[0]).toBeLessThanOrEqual(255);
  });

  it("완만한 16-bit 선형 그라데이션(4 LSB 폭)에서 Bayer 8×8 및 TPDF 디더링이 계단 밴딩을 제거하고 8×8 국소 평균 오차를 0에 수렴시킨다", () => {
    const width = 512;
    const height = 64;
    const linear = new Float32Array(width * height * 4);
    const expectedSrgb255 = new Float32Array(width * height);

    // 512px 폭에 걸쳐 sRGB 118.0 → 122.0 (단 4 LSB 차이!) 완만 그라데이션.
    // 무디더링 8비트 양자화는 약 128px마다 뚝 끊기는 거대한 평탄 계단 밴드를 만든다.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const t = x / (width - 1);
        const srgbCode = 118 + t * 4;
        const lin = studioHighBitSrgbToLinear(srgbCode / 255);
        const idx = y * width + x;
        expectedSrgb255[idx] = srgbCode;
        linear[idx * 4] = lin;
        linear[idx * 4 + 1] = lin;
        linear[idx * 4 + 2] = lin;
        linear[idx * 4 + 3] = 1;
      }
    }

    const noDither = encodeLinearHdrToSrgb8Dithered(linear, {
      width,
      height,
      ditherMode: "none",
      tonemapMode: "clamp",
      simulateRgba16FloatQuantization: true,
    });
    const bayerDither = encodeLinearHdrToSrgb8Dithered(linear, {
      width,
      height,
      ditherMode: "bayer8x8",
      tonemapMode: "clamp",
      seed: 17,
      simulateRgba16FloatQuantization: true,
    });
    const tpdfDither = encodeLinearHdrToSrgb8Dithered(linear, {
      width,
      height,
      ditherMode: "tpdf",
      tonemapMode: "clamp",
      seed: 17,
      simulateRgba16FloatQuantization: true,
    });
    const hybridDither = encodeLinearHdrToSrgb8Dithered(linear, {
      width,
      height,
      ditherMode: "bayer8x8-tpdf-hybrid",
      tonemapMode: "clamp",
      seed: 17,
      simulateRgba16FloatQuantization: true,
    });

    const mNone = measureGradientBandingMetrics(noDither, expectedSrgb255, width, height, 0);
    const mBayer = measureGradientBandingMetrics(bayerDither, expectedSrgb255, width, height, 0);
    const mTpdf = measureGradientBandingMetrics(tpdfDither, expectedSrgb255, width, height, 0);
    const mHybrid = measureGradientBandingMetrics(hybridDither, expectedSrgb255, width, height, 0);

    // 무디더링은 긴 평탄 계단(≥ 100px)과 큰 8×8 블록 평균 오차(≈ 0.45 LSB)를 보인다.
    expect(mNone.maxFlatRunLength).toBeGreaterThanOrEqual(100);
    expect(mNone.maxBlockMeanErrorLsb).toBeGreaterThan(0.35);

    // Bayer 8×8 디더링은 8×8 블록 평균 오차를 < 0.08 LSB로 수렴시키고 평탄 계단 길이를 절반 이하로 줄인다.
    expect(mBayer.maxFlatRunLength).toBeLessThan(mNone.maxFlatRunLength * 0.55);
    expect(mBayer.transitionCount).toBeGreaterThan(mNone.transitionCount * 10);
    expect(mBayer.maxBlockMeanErrorLsb).toBeLessThan(0.08);
    expect(mBayer.rmsBlockMeanErrorLsb).toBeLessThan(0.04);

    // TPDF 삼각 디더링은 ±1 LSB 범위로 정수 교차점 평탄역까지 70% 이상 분쇄한다.
    expect(mTpdf.maxFlatRunLength).toBeLessThan(mNone.maxFlatRunLength * 0.3);
    expect(mTpdf.rmsBlockMeanErrorLsb).toBeLessThan(mNone.rmsBlockMeanErrorLsb * 0.5);

    // 하이브리드(Bayer 8×8 + TPDF)는 짧은 평탄역과 낮은 8×8 블록 평균 오차를 동시에 달성한다.
    expect(mHybrid.maxFlatRunLength).toBeLessThan(mNone.maxFlatRunLength * 0.35);
    expect(mHybrid.rmsBlockMeanErrorLsb).toBeLessThan(0.08);

    // 완전 결정성: 동일 seed 재실행 시 바이트 동일.
    const bayerRepeat = encodeLinearHdrToSrgb8Dithered(linear, {
      width,
      height,
      ditherMode: "bayer8x8",
      tonemapMode: "clamp",
      seed: 17,
      simulateRgba16FloatQuantization: true,
    });
    expect(bayerRepeat).toEqual(bayerDither);
  });

  it("WebGPU Compute 디스패치 경로가 버퍼 풀을 재사용하고 누수 없이 반납하며, GPU 미지원 시 CPU 폴백을 실행한다", async () => {
    const dispatched: [number, number, number][] = [];
    const submitted = vi.fn();
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
        writeBuffer: vi.fn(),
        submit: submitted,
      },
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: () => ({
        beginComputePass: () => ({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          dispatchWorkgroups: (x: number, y = 1, z = 1) => {
            dispatched.push([x, y, z]);
          },
          end: vi.fn(),
        }),
        finish: () => ({}),
      }),
    };

    const pool = new GpuBufferPool();
    const warmup = new GpuPipelineWarmupQueue(fakeDevice);
    const dst = new Float32Array(16 * 16 * 4);
    const src = new Float32Array(16 * 16 * 4);

    const uniform = packHdrDitherUniforms({ width: 16, height: 16, ditherMode: "bayer8x8" });
    expect(uniform.byteLength).toBe(48);

    const res1 = await dispatchHdrBlendAndDither({
      device: fakeDevice,
      pool,
      warmupQueue: warmup,
      dstLinear: dst,
      srcLinear: src,
      options: { width: 16, height: 16, ditherMode: "bayer8x8" },
    });
    expect(res1.backend).toBe("webgpu");
    expect(res1.textureFormat).toBe(GPU_NEXT_HDR_TEXTURE_FORMAT);
    expect(res1.workgroupsX).toBe(2);
    expect(res1.workgroupsY).toBe(2);
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(dispatched).toEqual([
      [2, 2, 1],
      [2, 2, 1],
    ]);
    expect(pool.getMetrics().gpuActiveCount).toBe(0);

    // 두 번째 프레임은 풀링된 GPU 버퍼를 100% 재사용한다.
    await dispatchHdrBlendAndDither({
      device: fakeDevice,
      pool,
      warmupQueue: warmup,
      dstLinear: dst,
      srcLinear: src,
      options: { width: 16, height: 16, ditherMode: "tpdf" },
    });
    expect(pool.getMetrics().gpuHits).toBe(4);
    expect(pool.getMetrics().gpuActiveCount).toBe(0);

    pool.dispose();
    expect(pool.getMetrics().leakedGpuBuffers).toBe(0);

    // CPU 폴백 검증.
    const cpuPool = new GpuBufferPool();
    const cpuWarmup = new GpuPipelineWarmupQueue(null);
    src.fill(0.5);
    const cpuRes = await dispatchHdrBlendAndDither({
      device: null,
      pool: cpuPool,
      warmupQueue: cpuWarmup,
      dstLinear: new Float32Array(16 * 16 * 4),
      srcLinear: src,
      options: { width: 16, height: 16, ditherMode: "bayer8x8" },
    });
    expect(cpuRes.backend).toBe("cpu-fallback");
    expect(cpuRes.srgb8Pixels).toHaveLength(16 * 16 * 4);
  });
});

describe("가변 프레임 버제팅 & 화면 밖 LRU 타일 회수 스케줄러", () => {
  it("고속 패닝 과부하 시 해상도 스케일을 동적 완화하고 정지 시 즉시 1.0x로 복귀한다", () => {
    const controller = new AdaptiveFrameBudgetController({
      targetFrameMs: 16.67,
      emaAlpha: 0.5,
      degradeConsecutiveFrames: 2,
      recoverConsecutiveFrames: 3,
    });

    // 정상 속도 패닝은 1.0x 유지.
    const ok = controller.recordFrame({ frameDurationMs: 12, interactionMode: "panning" });
    expect(ok.resolutionScale).toBe(1.0);

    // 연속 느린 프레임(30ms)으로 고속 패닝 시 동적 스케일 하향(1.0 → 0.85 → 0.75).
    controller.recordFrame({ frameDurationMs: 30, interactionMode: "panning" });
    const d1 = controller.recordFrame({ frameDurationMs: 30, interactionMode: "panning" });
    expect(d1.resolutionScale).toBe(0.85);
    expect(d1.degraded).toBe(true);

    controller.recordFrame({ frameDurationMs: 32, interactionMode: "panning" });
    const d2 = controller.recordFrame({ frameDurationMs: 32, interactionMode: "panning" });
    expect(d2.resolutionScale).toBe(0.75);

    // 정지(idle) 즉시 지연 없이 1.0x 정해상도로 복귀!
    const stopped = controller.recordFrame({ frameDurationMs: 32, interactionMode: "idle" });
    expect(stopped.resolutionScale).toBe(1.0);
    expect(stopped.snappedBackToFull).toBe(true);
    expect(stopped.reason).toBe("snap-back-on-stop");

    // 메모리 압력 critical 상태에서 줌 중이면 즉시 완화하고 markInteractionStopped()로 즉시 1.0x 복귀.
    const crit = controller.recordFrame({
      frameDurationMs: 15,
      interactionMode: "zooming",
      memoryPressure: "critical",
    });
    expect(crit.resolutionScale).toBeLessThan(1.0);
    const snap = controller.markInteractionStopped();
    expect(snap.resolutionScale).toBe(1.0);
    expect(snap.snappedBackToFull).toBe(true);
    expect(controller.getSnapshot().immediateSnapBackCount).toBe(2);
  });

  it("메모리 압력 단계에 따라 화면 밖 LRU 타일만 회수하며 가시 뷰포트·고정 타일은 보호한다", () => {
    const evictedLog: string[] = [];
    const scheduler = new LruTileResidencyEvictionScheduler({
      memoryBudgetBytes: 1000,
      moderatePressureRatio: 0.75,
      criticalPressureRatio: 0.9,
      targetAfterEvictRatio: 0.65,
      maxModerateEvictionsPerFrame: 2,
      prefetchMarginPx: 64,
    });

    const viewport = { minX: 0, minY: 0, maxX: 256, maxY: 256 };

    // 화면 밖 오래된 타일 4개 (각 150B = 600B)
    for (let i = 0; i < 4; i += 1) {
      scheduler.touchTile({
        tileId: `off-${i}`,
        byteSize: 150,
        bounds: { minX: 1000 + i * 256, minY: 0, maxX: 1256 + i * 256, maxY: 256 },
        onEvict: (id) => evictedLog.push(id),
      });
    }
    // 화면 밖이지만 고정(pinned) 타일 (150B)
    scheduler.touchTile({
      tileId: "pinned-off",
      byteSize: 150,
      bounds: { minX: 3000, minY: 0, maxX: 3256, maxY: 256 },
      pinned: true,
      onEvict: (id) => evictedLog.push(id),
    });
    // 가시 뷰포트 타일 (100B) → 총 850B / 1000B = 85% (moderate)
    scheduler.touchTile({
      tileId: "visible-0",
      byteSize: 100,
      bounds: { minX: 0, minY: 0, maxX: 256, maxY: 256 },
      onEvict: (id) => evictedLog.push(id),
    });

    expect(scheduler.classifyPressure()).toBe("moderate");

    // moderate: 프레임당 최대 2개씩 가장 오래된 화면 밖 타일(off-0, off-1) 회수.
    const plan1 = scheduler.evictOffscreenTiles(viewport);
    expect(plan1.evictedTileIds).toEqual(["off-0", "off-1"]);
    expect(plan1.freedBytes).toBe(300);
    expect(plan1.remainingResidentBytes).toBe(550);
    expect(scheduler.hasTile("visible-0")).toBe(true);
    expect(scheduler.hasTile("pinned-off")).toBe(true);

    // nominal(55%) 상태에서는 추가 회수 0.
    const plan2 = scheduler.evictOffscreenTiles(viewport);
    expect(plan2.evictedTileIds).toEqual([]);

    // critical 압력 강제: 남은 off-screen 비고정 타일(off-2, off-3) 회수하되 visible·pinned는 끝까지 보호!
    const plan3 = scheduler.evictOffscreenTiles(viewport, "critical");
    expect(plan3.evictedTileIds).toEqual(["off-2", "off-3"]);
    expect(scheduler.hasTile("visible-0")).toBe(true);
    expect(scheduler.hasTile("pinned-off")).toBe(true);

    // dispose 시 남은 2개 타일도 정확히 1회씩 onEvict 호출.
    scheduler.dispose();
    expect(evictedLog).toEqual(["off-0", "off-1", "off-2", "off-3", "pinned-off", "visible-0"]);
    expect(scheduler.getSnapshot().residentTileCount).toBe(0);
  });
});
