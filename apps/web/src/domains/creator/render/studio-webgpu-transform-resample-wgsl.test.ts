import { describe, expect, it, vi } from "vitest";
import { link } from "wesl";

import {
  applyLiquifyDisplacement,
  buildLiquifyDisplacementField,
} from "../studio-liquify";
import {
  applyCornerPinTransform,
  constrainIsopodTrapezoidQuad,
  createIdentityCornerPinQuad,
  packCornerPinTransformUniforms,
  solveHomography8Dof,
} from "../transform/studio-corner-pin-transform";
import {
  applyRasterMeshTransform,
  createRasterMeshLattice,
  moveRasterMeshNode,
  packRasterMeshControlPoints,
} from "../transform/studio-raster-mesh-transform";

import { downsampleMipLevelCpu } from "./studio-webgpu-tile-viewport-culling";
import {
  buildInverseAffineMatrix3x3,
  computeHomographyLocalScale,
  evaluateCatmullRomWeight,
  evaluateLanczos3Weight,
  executeTransformResampleCpu,
  measureLineartEdgeEnergy,
  STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL,
  StudioWebGpuTransformComputeExecutor,
} from "./studio-webgpu-transform-resample-wgsl";
import {
  STUDIO_MESH_CONTROL_STRIDE_FLOATS,
  STUDIO_TRANSFORM_UNIFORM_FLOATS,
} from "./studio-webgpu-zero-copy-pack";

import type { StudioImageDataLike } from "../studio-filters";

/** 웹툰 펜선(3px 수직·수평·대각선 잉크, 밝은 원고지 배경) 테스트 패턴을 생성한다. */
function createCrispLineartImage(width: number, height: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const isVerticalLine = (x % 20) >= 6 && (x % 20) < 9;
      const isHorizontalLine = (y % 20) >= 6 && (y % 20) < 9;
      const isDiagonalLine = Math.abs(((x - y + width) % 24) - 10) < 1.5;
      const isInk = isVerticalLine || isHorizontalLine || isDiagonalLine;
      const value = isInk ? 20 : 240;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 투명 배경 위 빨간 원형 마커 패턴(변위·회전·알파 경계 검증용). */
function createSpotImage(width: number, height: number, cx: number, cy: number, radius: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist <= radius) {
        const idx = (y * width + x) * 4;
        data[idx] = 235;
        data[idx + 1] = 40;
        data[idx + 2] = 60;
        data[idx + 3] = 255;
      }
    }
  }
  return { width, height, data };
}

function findRedCentroid(image: StudioImageDataLike): { readonly x: number; readonly y: number; readonly mass: number } {
  let sumX = 0;
  let sumY = 0;
  let mass = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const off = (y * image.width + x) * 4;
      const a = image.data[off + 3]! / 255;
      const r = image.data[off]!;
      if (a > 0.2 && r > 120) {
        const w = a * r;
        sumX += x * w;
        sumY += y * w;
        mass += w;
      }
    }
  }
  return {
    x: mass > 0 ? sumX / mass : Number.NaN,
    y: mass > 0 ? sumY / mass : Number.NaN,
    mass,
  };
}

describe("studio-webgpu-transform-resample-wgsl", () => {
  it("WGSL 1패스 변형·리샘플링 Compute 셰이더가 wesl 파싱·링크 및 예약어 검사를 통과한다", async () => {
    const linked = await link({
      weslSrc: { "transform_resample.wgsl": STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL },
      rootModuleName: "transform_resample",
    });
    expect(linked.dest).toContain("@compute @workgroup_size(8, 8, 1)");
    expect(linked.dest).toContain("fn cs_transform_resample");
    for (let binding = 0; binding <= 4; binding += 1) {
      expect(STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL).toContain(`@group(0) @binding(${binding})`);
    }
    // Chromium WGSL 예약어 회피 검증
    expect(STUDIO_WEBGPU_TRANSFORM_RESAMPLE_WGSL).not.toMatch(/\b(meta|active|self|ref|using)\b/u);
  });

  it("Lanczos3 및 Catmull-Rom 커널이 정수 교차점(0/1)과 가중치 합(=1) 수학 불변식을 만족한다", () => {
    expect(evaluateLanczos3Weight(0)).toBe(1);
    expect(Math.abs(evaluateLanczos3Weight(1))).toBeLessThan(1e-12);
    expect(Math.abs(evaluateLanczos3Weight(2))).toBeLessThan(1e-12);
    expect(evaluateLanczos3Weight(3)).toBe(0);
    expect(evaluateLanczos3Weight(-3.5)).toBe(0);

    expect(evaluateCatmullRomWeight(0)).toBe(1);
    expect(evaluateCatmullRomWeight(1)).toBe(0);
    expect(evaluateCatmullRomWeight(2)).toBe(0);

    for (const frac of [0.15, 0.37, 0.5, 0.82]) {
      let lanczosSum = 0;
      for (let k = -2; k <= 3; k += 1) {
        lanczosSum += evaluateLanczos3Weight(k - frac);
      }
      // 비정규화 Lanczos3 커널 합은 최대 ±0.006 진동하므로 리샘플러 내부에서 sumW로 정규화한다.
      expect(Math.abs(lanczosSum - 1)).toBeLessThan(0.01);

      let catmullSum = 0;
      for (let k = -1; k <= 2; k += 1) {
        catmullSum += evaluateCatmullRomWeight(k - frac);
      }
      expect(catmullSum).toBeCloseTo(1, 10);
    }
  });

  it("선화 회전 및 축소 시 Lanczos3 및 Catmull-Rom이 단순 bilinear(및 이중 bilinear)보다 선명도(edge energy·대비)를 유의미하게 보존한다", () => {
    const src = createCrispLineartImage(128, 128);

    // 1) 17.5도 회전 (1:1 스케일) — 단일 패스 Lanczos3 / Catmull-Rom vs 단일·이중 Bilinear
    const rotBase = {
      mode: "affine" as const,
      outputWidth: 128,
      outputHeight: 128,
      affine: { angleDeg: 17.5, pivotX: 64, pivotY: 64 },
    };
    const rotLanczos = measureLineartEdgeEnergy(
      executeTransformResampleCpu(src, { ...rotBase, resampler: "lanczos3" }),
    );
    const rotCatmull = measureLineartEdgeEnergy(
      executeTransformResampleCpu(src, { ...rotBase, resampler: "catmull-rom" }),
    );
    const rotNearest = measureLineartEdgeEnergy(
      executeTransformResampleCpu(src, { ...rotBase, resampler: "nearest-sharp" }),
    );
    const rotBilinear = measureLineartEdgeEnergy(
      executeTransformResampleCpu(src, { ...rotBase, resampler: "bilinear" }),
    );
    const rotHalf = executeTransformResampleCpu(src, {
      mode: "affine",
      resampler: "bilinear",
      affine: { angleDeg: 8.75, pivotX: 64, pivotY: 64 },
    });
    const rotDoubleBilinear = measureLineartEdgeEnergy(
      executeTransformResampleCpu(rotHalf, {
        mode: "affine",
        resampler: "bilinear",
        affine: { angleDeg: 8.75, pivotX: 64, pivotY: 64 },
      }),
    );

    expect(rotLanczos.edgeEnergy).toBeGreaterThan(rotBilinear.edgeEnergy * 1.15);
    expect(rotLanczos.edgeEnergy).toBeGreaterThan(rotDoubleBilinear.edgeEnergy * 1.4);
    expect(rotCatmull.edgeEnergy).toBeGreaterThan(rotBilinear.edgeEnergy * 1.12);
    expect(rotNearest.edgeEnergy).toBeGreaterThan(rotBilinear.edgeEnergy);
    expect(rotLanczos.peakContrast).toBeGreaterThan(rotBilinear.peakContrast);

    // 2) 0.5x 축소 + 12도 동시 1패스 변형 vs 2패스(축소 후 회전) 이중 양선형 블러
    const downRotBase = {
      mode: "affine" as const,
      outputWidth: 64,
      outputHeight: 64,
      affine: {
        angleDeg: 12,
        scaleX: 0.5,
        scaleY: 0.5,
        pivotX: 64,
        pivotY: 64,
        translateX: -32,
        translateY: -32,
      },
    };
    const downLanczos = measureLineartEdgeEnergy(
      executeTransformResampleCpu(src, { ...downRotBase, resampler: "lanczos3" }),
    );
    const downCatmull = measureLineartEdgeEnergy(
      executeTransformResampleCpu(src, { ...downRotBase, resampler: "catmull-rom" }),
    );
    const downBilinear = measureLineartEdgeEnergy(
      executeTransformResampleCpu(src, { ...downRotBase, resampler: "bilinear" }),
    );
    const shrunkBilinear = downsampleMipLevelCpu(src, "bilinear");
    const downDoubleBilinear = measureLineartEdgeEnergy(
      executeTransformResampleCpu(shrunkBilinear, {
        mode: "affine",
        resampler: "bilinear",
        affine: { angleDeg: 12, pivotX: 32, pivotY: 32 },
      }),
    );

    expect(downLanczos.edgeEnergy).toBeGreaterThan(downBilinear.edgeEnergy);
    expect(downLanczos.edgeEnergy).toBeGreaterThan(downDoubleBilinear.edgeEnergy * 1.45);
    expect(downCatmull.edgeEnergy).toBeGreaterThan(downDoubleBilinear.edgeEnergy * 1.35);
    expect(downLanczos.peakContrast).toBeGreaterThan(downBilinear.peakContrast);
    expect(downLanczos.minLuminance).toBeLessThan(downBilinear.minLuminance);
  });

  it("아핀 역변환 행렬이 항등 무손실 및 90도 회전 정밀도를 보장한다", () => {
    const src = createSpotImage(25, 25, 18, 12, 2.2);

    // 항등 변환: 모든 리샘플러에서 원본 바이트 100% 일치
    for (const resampler of ["nearest-sharp", "bilinear", "catmull-rom", "lanczos3"] as const) {
      const identityOut = executeTransformResampleCpu(src, {
        mode: "affine",
        resampler,
        affine: { angleDeg: 0, scaleX: 1, scaleY: 1 },
      });
      expect([...identityOut.data]).toEqual([...src.data]);
    }

    // 중심 (12, 12) 기준 시계방향 90도 회전: (18, 12) -> (12, 18)
    const invH = buildInverseAffineMatrix3x3({ angleDeg: 90, pivotX: 12, pivotY: 12 }, 25, 25);
    expect(invH[0] * 12 + invH[1] * 18 + invH[2]).toBeCloseTo(18, 6);
    expect(invH[3] * 12 + invH[4] * 18 + invH[5]).toBeCloseTo(12, 6);

    const rotated = executeTransformResampleCpu(src, {
      mode: "affine",
      resampler: "lanczos3",
      affine: { angleDeg: 90, pivotX: 12, pivotY: 12 },
    });
    const centroid = findRedCentroid(rotated);
    expect(centroid.x).toBeCloseTo(12, 0.5);
    expect(centroid.y).toBeCloseTo(18, 0.5);
  });

  it("3×3 원근 호모그래피 역변환·국소 자코비안 및 코너핀 리샘플러·유니폼 패킹 연결이 정확히 동작한다", () => {
    const src = createCrispLineartImage(32, 32);
    const srcQuad = createIdentityCornerPinQuad(32, 32);
    const dstQuad = constrainIsopodTrapezoidQuad(srcQuad, "topLeft", { x: 8, y: 3 }, "horizontal");
    const invH = solveHomography8Dof(dstQuad, srcQuad)!;
    expect(invH).not.toBeNull();

    // 상단이 좁아졌으므로 상단 중앙(16, 4)의 역자코비안 X 축소 배율은 > 1.3이어야 한다.
    const [topScaleX] = computeHomographyLocalScale(invH, 16, 4);
    const [botScaleX] = computeHomographyLocalScale(invH, 16, 29);
    expect(topScaleX).toBeGreaterThan(1.3);
    expect(botScaleX).toBeCloseTo(1, 1);

    const lanczosCorner = applyCornerPinTransform(src, dstQuad, { resampler: "lanczos3" });
    const bilinearCorner = applyCornerPinTransform(src, dstQuad, { resampler: "bilinear" });
    expect(measureLineartEdgeEnergy(lanczosCorner).edgeEnergy).toBeGreaterThan(
      measureLineartEdgeEnergy(bilinearCorner).edgeEnergy,
    );

    const packedUniforms = packCornerPinTransformUniforms(32, 32, dstQuad, { resampler: "lanczos3" });
    expect(packedUniforms).toHaveLength(STUDIO_TRANSFORM_UNIFORM_FLOATS);
    expect(packedUniforms[0]).toBe(32);
    expect(packedUniforms[1]).toBe(32);
    expect(packedUniforms[16]).toBe(1); // perspective mode
    expect(packedUniforms[17]).toBe(3); // lanczos3 mode
  });

  it("격자 메쉬 워프(Bilinear·Bicubic Catmull-Rom) 및 래스터 메쉬 연결·패킹이 정확히 동작한다", () => {
    const src = createSpotImage(25, 25, 12, 12, 2.4);
    const baseLattice = createRasterMeshLattice(25, 25, 3, 3);

    // 항등 격자: bilinear · bicubic 모두 무손실
    for (const patchMode of ["bilinear", "bicubic"] as const) {
      const out = executeTransformResampleCpu(src, {
        mode: "mesh-warp",
        resampler: "lanczos3",
        mesh: {
          rows: baseLattice.rows,
          cols: baseLattice.cols,
          nodes: baseLattice.nodes,
          patchMode,
        },
      });
      expect([...out.data]).toEqual([...src.data]);
    }

    // 중앙 제어점 (1, 1)을 우측 하단 (+4, +3) 이동
    const moved = moveRasterMeshNode(baseLattice, 1, 1, 16, 15);
    const bicubicOut = executeTransformResampleCpu(src, {
      mode: "mesh-warp",
      resampler: "catmull-rom",
      mesh: {
        rows: moved.rows,
        cols: moved.cols,
        nodes: moved.nodes,
        patchMode: "bicubic",
      },
    });
    const centroid = findRedCentroid(bicubicOut);
    expect(centroid.x).toBeGreaterThan(14.5);
    expect(centroid.y).toBeGreaterThan(13.5);

    // 기존 applyRasterMeshTransform의 lanczos3 옵션 및 제로카피 제어점 패커 연결 검증
    const meshLanczos = applyRasterMeshTransform(src, moved, { resampler: "lanczos3" });
    expect(findRedCentroid(meshLanczos).x).toBeGreaterThan(14.5);

    const packedNodes = packRasterMeshControlPoints(moved);
    expect(packedNodes).toHaveLength(moved.nodes.length * STUDIO_MESH_CONTROL_STRIDE_FLOATS);
    // 중앙 노드(idx = 4)의 rest=(12, 12), curr=(16, 15)
    expect(packedNodes[4 * 4]).toBe(12);
    expect(packedNodes[4 * 4 + 1]).toBe(12);
    expect(packedNodes[4 * 4 + 2]).toBe(16);
    expect(packedNodes[4 * 4 + 3]).toBe(15);
  });

  it("액화(Liquify) 방사 변위 5종(Push·Bloat·Pinch·Twirl)과 applyLiquifyDisplacement 선명 리샘플링이 동작한다", () => {
    const src = createSpotImage(33, 33, 16, 16, 3.2);

    // Push: 우측(+5px) 이동
    const pushed = executeTransformResampleCpu(src, {
      mode: "liquify",
      resampler: "lanczos3",
      liquifyOps: [
        { centerX: 16, centerY: 16, deltaX: 5, deltaY: 0, radius: 14, strength: 1, mode: "push", hardness: 0.4 },
      ],
    });
    expect(findRedCentroid(pushed).x).toBeGreaterThan(19.5);

    // Bloat vs Pinch: 불투명 반경 면적 비교 (Bloat > 원본 > Pinch)
    const countOpaque = (img: StudioImageDataLike) => {
      let count = 0;
      for (let i = 3; i < img.data.length; i += 4) {
        if (img.data[i]! > 128) count += 1;
      }
      return count;
    };
    const bloated = executeTransformResampleCpu(src, {
      mode: "liquify",
      resampler: "catmull-rom",
      liquifyOps: [
        { centerX: 16, centerY: 16, radius: 14, strength: 0.9, mode: "bloat" },
      ],
    });
    const pinched = executeTransformResampleCpu(src, {
      mode: "liquify",
      resampler: "catmull-rom",
      liquifyOps: [
        { centerX: 16, centerY: 16, radius: 14, strength: 0.9, mode: "pinch" },
      ],
    });
    expect(countOpaque(bloated)).toBeGreaterThan(countOpaque(src));
    expect(countOpaque(pinched)).toBeLessThan(countOpaque(src));

    // Twirl CW: 중심 우측 마커(21, 16)가 시계방향(아래쪽 y > 16)으로 이동
    const offCenter = createSpotImage(33, 33, 21, 16, 2.0);
    const twirled = executeTransformResampleCpu(offCenter, {
      mode: "liquify",
      resampler: "lanczos3",
      liquifyOps: [
        { centerX: 16, centerY: 16, radius: 14, strength: 1, mode: "twirl-cw", hardness: 0.3 },
      ],
    });
    expect(findRedCentroid(twirled).y).toBeGreaterThan(17.5);

    // 기존 studio-liquify.ts의 applyLiquifyDisplacement에 lanczos3 연결 검증
    const field = buildLiquifyDisplacementField(
      [{ x: 14, y: 16 }, { x: 20, y: 16 }],
      10,
      0.8,
      33,
      33,
    )!;
    const dst: StudioImageDataLike = {
      width: 33,
      height: 33,
      data: new Uint8ClampedArray(src.data),
    };
    applyLiquifyDisplacement(src, dst, field, { resampler: "lanczos3" });
    expect(findRedCentroid(dst).x).toBeGreaterThan(16.5);
  });

  it("StudioWebGpuTransformComputeExecutor가 모의 GPUDevice 디스패치와 CPU 폴백을 모두 정확히 수행한다", () => {
    const src = createSpotImage(20, 18, 10, 9, 2.5);

    // 1) CPU 폴백 경로 (device = null)
    const cpuExec = new StudioWebGpuTransformComputeExecutor(null);
    expect(cpuExec.isGpuAvailable).toBe(false);
    const cpuRes = cpuExec.executeImageFallbackSafe(src, {
      mode: "affine",
      resampler: "lanczos3",
      affine: { translateX: 2 },
    });
    expect(cpuRes.report.backend).toBe("cpu-parity");
    expect(cpuRes.report.workgroupsX).toBe(Math.ceil(20 / 8));
    expect(cpuRes.report.workgroupsY).toBe(Math.ceil(18 / 8));
    expect(findRedCentroid(cpuRes.image).x).toBeCloseTo(12, 0.4);

    // 2) Mock WebGPU GPUDevice 경로
    const writeBuffer = vi.fn();
    const submit = vi.fn();
    const dispatchWorkgroups = vi.fn();
    const createShaderModule = vi.fn(() => ({ label: "shader" }));
    const createComputePipeline = vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => ({ label: "bgl-0" })),
    }));
    const createBindGroup = vi.fn(() => ({ label: "bg-0" }));
    const createBuffer = vi.fn((desc: GPUBufferDescriptor) => ({
      label: desc.label,
      size: desc.size,
      destroy: vi.fn(),
    }));
    const createCommandEncoder = vi.fn(() => ({
      beginComputePass: vi.fn(() => ({
        setPipeline: vi.fn(),
        setBindGroup: vi.fn(),
        dispatchWorkgroups,
        end: vi.fn(),
      })),
      finish: vi.fn(() => ({ label: "cmd" })),
    }));

    const fakeDevice = {
      createShaderModule,
      createComputePipeline,
      createBindGroup,
      createBuffer,
      createCommandEncoder,
      queue: { writeBuffer, submit },
    } as unknown as GPUDevice;

    const gpuExec = new StudioWebGpuTransformComputeExecutor(fakeDevice);
    expect(gpuExec.isGpuAvailable).toBe(true);

    const r1 = gpuExec.executeImageFallbackSafe(src, {
      mode: "affine",
      resampler: "lanczos3",
      affine: { angleDeg: 15 },
    });
    const r2 = gpuExec.executeImageFallbackSafe(src, {
      mode: "liquify",
      resampler: "catmull-rom",
      liquifyOps: [{ centerX: 10, centerY: 9, radius: 6, strength: 0.5, mode: "bloat" }],
    });

    expect(r1.report.backend).toBe("webgpu-compute");
    expect(r1.report.uploadedUniformBytes).toBe(STUDIO_TRANSFORM_UNIFORM_FLOATS * 4);
    expect(r1.report.uniformRingSlot).toBe(0);
    expect(r2.report.uniformRingSlot).toBe(1);
    expect(r2.report.uploadedLiquifyBytes).toBe(32);
    expect(createShaderModule).toHaveBeenCalledTimes(1); // 파이프라인 캐싱 확인
    expect(createComputePipeline).toHaveBeenCalledTimes(1);
    expect(dispatchWorkgroups).toHaveBeenCalledTimes(2);
    expect(submit).toHaveBeenCalledTimes(2);

    gpuExec.dispose();
    expect(gpuExec.isGpuAvailable).toBe(false);
  });
});
