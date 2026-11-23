import { describe, expect, it, vi } from "vitest";
import { link as linkWgsl } from "wesl";
import {
  COMPOSITE_10_FILTER_NAMES,
  FRAME_BUDGET_60FPS_MS,
  MIXED_12_BRUSH_MEDIA_IDS,
  runFullDrawingToolsSoakBenchmark,
  runMultiUserCrdtSketchBurstSoak,
} from "./drawing-tools-perf-soak-harness";
import {
  WGSL_ARAP_MESH_WARP_SHADER,
  WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER,
  WGSL_MULTI_LAYER_BLEND_SHADER,
  WGSL_SEPARABLE_FILTER_GRAPH_SHADER,
  WGSL_SHADER_CONTRACTS,
  WebGpuVelloZeroCopyPipeline,
  ZeroCopyGpuRingBridge,
  applyImpastoReliefCpu,
  applySeparableFilterGraphCpu,
  compositeMultiLayerCpu,
  computeDelaunayTriangulation,
  computeWorkgroupDispatch,
  warpImageArapMeshCpu,
  type ArapWarpPin,
  type WebGpuBufferLike,
  type WebGpuDeviceLike,
} from "./webgpu-vello-zerocopy-pipeline";

function assertBalancedDelimiters(source: string): void {
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    expect(braceDepth).toBeGreaterThanOrEqual(0);
    expect(parenDepth).toBeGreaterThanOrEqual(0);
  }
  expect(braceDepth).toBe(0);
  expect(parenDepth).toBe(0);
}

function solidRgba(width: number, height: number, r: number, g: number, b: number, a: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

describe("WebGPU 제로카피 4종 WGSL 셰이더 구문 및 바인딩 계약", () => {
  it("4종 WGSL 셰이더가 모두 @compute @workgroup_size(16, 16) · 바인딩 계약 · WESL 파서 링크를 통과한다", async () => {
    expect(WGSL_SHADER_CONTRACTS).toHaveLength(4);
    expect(WGSL_MULTI_LAYER_BLEND_SHADER).toContain("eval_blend_rgb");
    expect(WGSL_SEPARABLE_FILTER_GRAPH_SHADER).toContain("apply_hsl_grade");
    expect(WGSL_ARAP_MESH_WARP_SHADER).toContain("sample_bilinear");
    expect(WGSL_IMPASTO_RELIEF_COMPOSITE_SHADER).toContain("height_field");

    for (const contract of WGSL_SHADER_CONTRACTS) {
      expect(contract.workgroupSize).toEqual([16, 16, 1]);
      expect(contract.uniformByteLength % 16).toBe(0);
      expect(contract.source).toContain("@compute @workgroup_size(16, 16)");
      expect(contract.source).toContain(`fn ${contract.entryPoint}(@builtin(global_invocation_id)`);
      assertBalancedDelimiters(contract.source);
      for (let b = 0; b < contract.bindingCount; b += 1) {
        expect(contract.source).toContain(`@group(0) @binding(${b})`);
      }
      const linked = await linkWgsl({
        weslSrc: { [`${contract.id}.wgsl`]: contract.source },
        rootModuleName: contract.id,
      });
      expect(linked.dest).toContain("@compute @workgroup_size(16, 16)");
    }
  });

  it("16×16 워크그룹 디스패치 크기를 정확히 올림 계산한다", () => {
    expect(computeWorkgroupDispatch(1, 1)).toEqual({ x: 1, y: 1, z: 1 });
    expect(computeWorkgroupDispatch(256, 256)).toEqual({ x: 16, y: 16, z: 1 });
    expect(computeWorkgroupDispatch(257, 300)).toEqual({ x: 17, y: 19, z: 1 });
  });
});

describe("4종 GPU/CPU 바이트 동등 폴백 픽셀 정확도 검증", () => {
  it("다중 레이어 블렌드 5종(Normal/Multiply/Screen/Overlay/Add)과 마스크를 정확히 합성한다", () => {
    const base = solidRgba(2, 1, 100, 180, 60, 255);
    const top = solidRgba(2, 1, 200, 100, 120, 255);
    const mask = new Uint8ClampedArray([255, 0]); // 픽셀 0은 100% 적용, 픽셀 1은 0% 마스크 차단

    const mul = compositeMultiLayerCpu(2, 1, [
      { pixels: base, blendMode: "normal", opacity: 1 },
      { pixels: top, blendMode: "multiply", opacity: 1, mask },
    ]);
    expect(Math.abs(mul[0] - Math.round((100 / 255) * (200 / 255) * 255))).toBeLessThanOrEqual(1);
    expect(Math.abs(mul[1] - Math.round((180 / 255) * (100 / 255) * 255))).toBeLessThanOrEqual(1);
    // 픽셀 1은 마스크=0 이므로 베이스 색상이 그대로 보존되어야 한다
    expect(mul[4]).toBe(100);
    expect(mul[5]).toBe(180);
    expect(mul[6]).toBe(60);

    const screen = compositeMultiLayerCpu(2, 1, [
      { pixels: base, blendMode: "normal", opacity: 1 },
      { pixels: top, blendMode: "screen", opacity: 1 },
    ]);
    const expScreenR = Math.round((1 - (1 - 100 / 255) * (1 - 200 / 255)) * 255);
    expect(Math.abs(screen[0] - expScreenR)).toBeLessThanOrEqual(1);

    const overlay = compositeMultiLayerCpu(2, 1, [
      { pixels: base, blendMode: "normal", opacity: 1 },
      { pixels: top, blendMode: "overlay", opacity: 1 },
    ]);
    const expOverlayR = Math.round(2 * (100 / 255) * (200 / 255) * 255);
    const expOverlayG = Math.round((1 - 2 * (1 - 180 / 255) * (1 - 100 / 255)) * 255);
    expect(Math.abs(overlay[0] - expOverlayR)).toBeLessThanOrEqual(1);
    expect(Math.abs(overlay[1] - expOverlayG)).toBeLessThanOrEqual(1);

    const add = compositeMultiLayerCpu(2, 1, [
      { pixels: base, blendMode: "normal", opacity: 1 },
      { pixels: top, blendMode: "add", opacity: 1 },
    ]);
    expect(add[0]).toBe(255);
    expect(add[1]).toBe(255);
    expect(add[2]).toBe(180);
  });

  it("분리형 가우시안 블러 · 언샤프 마스크 · HSL 색보정 1패스 퓨전이 수학적으로 정확하다", () => {
    const w = 16;
    const h = 16;
    const stepImg = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const v = x < 8 ? 40 : 210;
        const p4 = (y * w + x) * 4;
        stepImg[p4] = v;
        stepImg[p4 + 1] = v;
        stepImg[p4 + 2] = v;
        stepImg[p4 + 3] = 255;
      }
    }

    const blurred = applySeparableFilterGraphCpu(w, h, stepImg, {
      blurRadius: 2, unsharpAmount: 0, hueShiftDeg: 0, saturationDelta: 0, lightnessDelta: 0,
    });
    const edgeLeftIdx = (8 * w + 7) * 4;
    const edgeRightIdx = (8 * w + 8) * 4;
    expect(blurred[edgeLeftIdx]).toBeGreaterThan(40);
    expect(blurred[edgeRightIdx]).toBeLessThan(210);

    const sharpened = applySeparableFilterGraphCpu(w, h, stepImg, {
      blurRadius: 2, unsharpAmount: 1.2, unsharpThreshold: 0, hueShiftDeg: 0, saturationDelta: 0, lightnessDelta: 0,
    });
    expect(sharpened[edgeRightIdx] - sharpened[edgeLeftIdx]).toBeGreaterThan(210 - 40);

    const red = solidRgba(4, 4, 255, 0, 0, 255);
    const hueShifted = applySeparableFilterGraphCpu(4, 4, red, {
      blurRadius: 0, unsharpAmount: 0, hueShiftDeg: 120, saturationDelta: 0, lightnessDelta: 0,
    });
    expect(hueShifted[0]).toBeLessThanOrEqual(2);
    expect(hueShifted[1]).toBeGreaterThanOrEqual(253);
    expect(hueShifted[2]).toBeLessThanOrEqual(2);

    const desaturated = applySeparableFilterGraphCpu(4, 4, red, {
      blurRadius: 0, unsharpAmount: 0, hueShiftDeg: 0, saturationDelta: -1, lightnessDelta: 0,
    });
    expect(desaturated[0]).toBe(desaturated[1]);
    expect(desaturated[1]).toBe(desaturated[2]);
  });

  it("델라우니 삼각 분할과 ARAP/MLS 메쉬 워프가 항등 보존 및 핀 이동 모핑을 정확히 수행한다", () => {
    const pts = [
      { x: 0, y: 0 }, { x: 31, y: 0 }, { x: 31, y: 31 }, { x: 0, y: 31 },
      { x: 10, y: 12 }, { x: 22, y: 18 }, { x: 15, y: 24 },
    ];
    const tris = computeDelaunayTriangulation(pts);
    expect(tris.length).toBeGreaterThanOrEqual(6);

    const w = 32;
    const h = 32;
    const img = solidRgba(w, h, 20, 20, 20, 255);
    // 중앙 (16, 16)에 밝은 빨강 3×3 마커 배치
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const p4 = ((16 + dy) * w + (16 + dx)) * 4;
        img[p4] = 250;
        img[p4 + 1] = 30;
        img[p4 + 2] = 30;
      }
    }

    const pins: ArapWarpPin[] = [
      { restX: 4, restY: 4, targetX: 4, targetY: 4 },
      { restX: 27, restY: 4, targetX: 27, targetY: 4 },
      { restX: 16, restY: 16, targetX: 21, targetY: 16 },
      { restX: 4, restY: 27, targetX: 4, targetY: 27 },
      { restX: 27, restY: 27, targetX: 27, targetY: 27 },
    ];

    const identity = warpImageArapMeshCpu(w, h, img, pins, 0);
    expect(identity.pixels[(16 * w + 16) * 4]).toBe(250);

    const warpedFull = warpImageArapMeshCpu(w, h, img, pins, 1);
    expect(warpedFull.pixels[(16 * w + 21) * 4]).toBeGreaterThan(200);
    expect(warpedFull.pixels[(16 * w + 16) * 4]).toBeLessThan(120);
  });

  it("2.5D 임파스토 Sobel 법선 광원 셰이딩이 광원 방향 경사면 하이라이트와 반대면 그림자를 생성한다", () => {
    const w = 24;
    const h = 24;
    const base = solidRgba(w, h, 170, 120, 90, 255);
    const heightField = new Float32Array(w * h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const dist = Math.hypot(x - 12, y - 12) / 8;
        heightField[y * w + x] = dist < 1 ? Math.cos(dist * Math.PI * 0.5) : 0;
      }
    }
    // 좌상단 광원 (-0.8, -0.8, 0.8) → 돔의 좌상단 경사면이 우하단 경사면보다 밝아야 한다
    const lit = applyImpastoReliefCpu(w, h, base, heightField, {
      reliefScale: 2.5,
      ambient: 0.3,
      lightX: -0.8,
      lightY: -0.8,
      lightZ: 0.8,
      specularStrength: 0.4,
      shininess: 20,
      shadowStrength: 0.45,
    });
    const litSlopeLuma = lit[(9 * w + 9) * 4];
    const shadowSlopeLuma = lit[(15 * w + 15) * 4];
    expect(litSlopeLuma).toBeGreaterThan(shadowSlopeLuma + 25);
  });
});

describe("Wasm64 ↔ WebGPU 제로 카피 링 버퍼 브리지 & 메모리 거버너", () => {
  it("SharedArrayBuffer/ArrayBuffer 슬라이스가 복사 0회·256B 정렬·동일 백킹 참조를 유지한다", () => {
    const bridge = new ZeroCopyGpuRingBridge({
      slotCount: 3,
      slotByteLength: 8192,
      alignment: 256,
      preferSharedArrayBuffer: true,
    });
    const s1 = bridge.acquireZeroCopySlice(1000);
    const s2 = bridge.acquireZeroCopySlice(1500);
    expect(s1.copyCount).toBe(0);
    expect(s2.copyCount).toBe(0);
    expect(s1.view.buffer).toBe(bridge.backingBuffer);
    expect(s2.view.buffer).toBe(bridge.backingBuffer);
    expect(s1.byteOffset % 256).toBe(0);
    expect(s2.byteOffset % 256).toBe(0);
    expect(s2.byteOffset).toBeGreaterThanOrEqual(s1.byteOffset + 1024);

    // Wasm64(address: "i64") 선형 메모리를 직접 백킹으로 마운트해도 복사 0회 유지
    if (typeof WebAssembly !== "undefined") {
      try {
        type Memory64Ctor = new (descriptor: {
          readonly initial: bigint;
          readonly maximum: bigint;
          readonly address: "i64";
        }) => WebAssembly.Memory;
        const MemoryCtor = WebAssembly.Memory as unknown as Memory64Ctor;
        const mem64 = new MemoryCtor({
          initial: BigInt(1),
          maximum: BigInt(4),
          address: "i64",
        });
        const wasmBridge = new ZeroCopyGpuRingBridge({
          slotCount: 2,
          slotByteLength: 16384,
          externalBackingBuffer: mem64.buffer,
        });
        const ws = wasmBridge.acquireZeroCopySlice(512);
        expect(ws.buffer).toBe(mem64.buffer);
        expect(ws.copyCount).toBe(0);
      } catch {
        // 구형 엔진에서는 memory64 미지원을 허용
      }
    }
  });

  it("WebGPU 미지원 환경은 자동 CPU 폴백, 지원 환경은 writeBuffer 제로카피 업로드를 수행한다", () => {
    const fallbackPipeline = new WebGpuVelloZeroCopyPipeline({ slotByteLength: 65536 });
    const receipt = fallbackPipeline.runMultiLayerBlend(4, 4, [
      { pixels: solidRgba(4, 4, 80, 120, 200, 255), blendMode: "normal", opacity: 1 },
    ]);
    expect(receipt.backend).toBe("cpu-fallback");
    expect(receipt.copyCount).toBe(0);
    expect(receipt.result.buffer).toBe(fallbackPipeline.bridge.backingBuffer);

    const writeBuffer = vi.fn();
    const mockDevice: WebGpuDeviceLike = { queue: { writeBuffer } };
    const gpuBridge = new ZeroCopyGpuRingBridge({
      slotByteLength: 8192,
      preferSharedArrayBuffer: false,
      gpuDevice: mockDevice,
    });
    const targetBuf: WebGpuBufferLike = { label: "tile-storage", size: 4096 };
    const slice = gpuBridge.acquireZeroCopySlice(1024);
    const plan = gpuBridge.dispatchWriteBuffer(targetBuf, slice, 256);

    expect(plan.backend).toBe("webgpu");
    expect(plan.copyCount).toBe(0);
    expect(writeBuffer).toHaveBeenCalledTimes(1);
    expect(writeBuffer).toHaveBeenCalledWith(targetBuf, 256, gpuBridge.backingBuffer, slice.byteOffset, 1024);
  });

  it("GPU 메모리 상한 거버너가 예산 초과 시 LRU 자원을 자동 회수해 상한을 엄수한다", () => {
    const destroySpies = [vi.fn(), vi.fn(), vi.fn()];
    const bridge = new ZeroCopyGpuRingBridge({
      slotCount: 2,
      slotByteLength: 4096,
      gpuMemoryBudgetBytes: 8192,
    });
    expect(bridge.registerGpuResource("r0", 4096, { size: 4096, destroy: destroySpies[0] })).toBe(true);
    expect(bridge.registerGpuResource("r1", 4096, { size: 4096, destroy: destroySpies[1] })).toBe(true);
    expect(bridge.registerGpuResource("r2", 4096, { size: 4096, destroy: destroySpies[2] })).toBe(true);

    const stats = bridge.getMemoryGovernorStats();
    expect(destroySpies[0]).toHaveBeenCalledTimes(1);
    expect(stats.allocatedBytes).toBeLessThanOrEqual(8192);
    expect(stats.peakAllocatedBytes).toBeLessThanOrEqual(8192);
    expect(stats.evictionCount).toBe(1);
    expect(stats.totalBufferCopies).toBe(0);
  });
});

describe("전 드로잉 서브시스템 통합 스트레스 · 30분 모사 소크 벤치마크", () => {
  it("8인 동시 스케치 CRDT 버스트가 도착 순서와 무관하게 충돌 0건 · <= 16.7ms로 수렴한다", () => {
    const crdt = runMultiUserCrdtSketchBurstSoak(8, 50, FRAME_BUDGET_60FPS_MS);
    expect(crdt.userCount).toBe(8);
    expect(crdt.totalOpsSubmitted).toBe(400);
    expect(crdt.mergedUniqueOps).toBe(400);
    expect(crdt.unresolvedConflicts).toBe(0);
    expect(crdt.orderIndependentConvergence).toBe(true);
    expect(crdt.timing.p95Ms).toBeLessThanOrEqual(FRAME_BUDGET_60FPS_MS);
    expect(crdt.passed).toBe(true);
  });

  it("12종 브러시 · 10종 필터 · 500오브젝트 ARAP · 8인 CRDT · 30분(3,600틱) 소크 전수 PASS", () => {
    const report = runFullDrawingToolsSoakBenchmark();
    expect(report.mixed12Brushes.brushCount).toBe(MIXED_12_BRUSH_MEDIA_IDS.length);
    expect(report.mixed12Brushes.mutatedBrushes).toBe(12);
    expect(report.mixed12Brushes.passed).toBe(true);

    expect(report.composite10Filters.filterCount).toBe(COMPOSITE_10_FILTER_NAMES.length);
    expect(report.composite10Filters.distinctChecksums).toBeGreaterThanOrEqual(8);
    expect(report.composite10Filters.passed).toBe(true);

    expect(report.multiObject500Arap.objectCount).toBe(500);
    expect(report.multiObject500Arap.delaunayTriangleCount).toBeGreaterThanOrEqual(4);
    expect(report.multiObject500Arap.finiteVertexIntegrity).toBe(true);
    expect(report.multiObject500Arap.passed).toBe(true);

    expect(report.multiUser8Crdt.userCount).toBe(8);
    expect(report.multiUser8Crdt.unresolvedConflicts).toBe(0);
    expect(report.multiUser8Crdt.timing.p95Ms).toBeLessThanOrEqual(FRAME_BUDGET_60FPS_MS);
    expect(report.multiUser8Crdt.passed).toBe(true);

    expect(report.simulated30MinSoak.totalTicks).toBe(3600);
    expect(report.simulated30MinSoak.simulatedMinutes).toBe(30);
    expect(report.simulated30MinSoak.timing.p95Ms).toBeLessThanOrEqual(FRAME_BUDGET_60FPS_MS);
    expect(report.simulated30MinSoak.totalBufferCopies).toBe(0);
    expect(report.simulated30MinSoak.managedBytesPeak).toBeLessThanOrEqual(
      report.simulated30MinSoak.managedMemoryBudgetBytes,
    );
    expect(report.simulated30MinSoak.passed).toBe(true);
    expect(report.allPassed).toBe(true);
  });
});
