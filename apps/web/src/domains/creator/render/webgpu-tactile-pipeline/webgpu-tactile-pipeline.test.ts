import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";
import { link } from "wesl";

import * as pipelineBarrel from "./index";
import {
  IMPASTO_RELIEF_LIGHTING_WGSL,
  IMPASTO_RELIEF_UNIFORM_BYTES,
  PAPER_HEIGHTMAP_TILE_DIM,
  SPARSE_TILE_BLEND_MODES,
  SPARSE_TILE_COMPOSITE_UNIFORM_BYTES,
  SPARSE_TILE_COMPOSITE_WGSL,
  SPARSE_TILE_DIM,
  TACTILE_BRUSH_UNIFORM_BYTES,
  TACTILE_PAPER_BRISTLE_COMPUTE_WGSL,
  packImpastoUniforms,
  packTactileBrushUniforms,
  packTileCompositeUniforms,
  resolveSparseTileBlendModeCode,
  validateWgslShaderContract,
  type SparseTileBlendMode,
} from "./tactile-brush-wgsl-shaders";
import {
  UNIFORM_ARENA_ALIGNMENT_BYTES,
  WASM_MEMORY64_PROBE_BYTES,
  WASM_SIMD128_PROBE_BYTES,
  buildKonvaBypassDispatchPlan,
  createProceduralPaperHeightmap64,
  createTileDispatchBatch,
  executeCpuReferenceTilePass,
  executeTilePassWithFallback,
  probeAndSelectNativeRenderBackend,
  selectNativeRenderBackend,
  type NativeRenderCapabilitySnapshot,
  type WebGpuComputeDeviceLike,
} from "./webgpu-tactile-compositor-bridge";

const DESKTOP_WEBGPU_CAPS: NativeRenderCapabilitySnapshot = {
  hasWebGpu: true,
  webGpuAdapterAvailable: true,
  webGpuFeatures: ["shader-f16", "float32-filterable", "bgra8unorm-storage"],
  webGpuMaxStorageBufferBindingSize: 128 * 1024 * 1024,
  hasWebAssembly: true,
  supportsWasmMemory64: true,
  supportsWasmSimd128: true,
  hasOffscreenCanvas: true,
  platformClass: "desktop",
};

describe("WGSL 3종 Compute 셰이더 정적 계약 및 wesl 링커 검증", () => {
  it("TACTILE_PAPER_BRISTLE_COMPUTE_WGSL이 workgroup(8,8,1)·6바인딩·80B 정렬·경계 가드 계약을 통과한다", () => {
    const report = validateWgslShaderContract(TACTILE_PAPER_BRISTLE_COMPUTE_WGSL, {
      expectedWorkgroupSize: [8, 8, 1],
    });
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.entryPoints).toEqual(["tactile_paper_bristle_main"]);
    expect(report.bindings.map((b) => `${b.group}:${b.binding}`)).toEqual(["0:0", "0:1", "0:2", "0:3", "0:4", "0:5"]);
    expect(report.duplicateBindings).toEqual([]);
    expect(report.delimitersBalanced).toBe(true);
    expect(report.hasBoundsGuard).toBe(true);
    expect(report.hasUniformityViolationRisk).toBe(false);
    expect(report.uniformStructBytes["TactileBrushParams"]).toBe(TACTILE_BRUSH_UNIFORM_BYTES);
  });

  it("IMPASTO_RELIEF_LIGHTING_WGSL이 3×3 Sobel·4바인딩·64B 정렬·경계 가드 계약을 통과한다", () => {
    const report = validateWgslShaderContract(IMPASTO_RELIEF_LIGHTING_WGSL, {
      expectedWorkgroupSize: [8, 8, 1],
    });
    expect(report.valid).toBe(true);
    expect(report.entryPoints).toEqual(["impasto_relief_lighting_main"]);
    expect(report.bindings.map((b) => `${b.group}:${b.binding}`)).toEqual(["0:0", "0:1", "0:2", "0:3"]);
    expect(report.uniformStructBytes["ImpastoReliefParams"]).toBe(IMPASTO_RELIEF_UNIFORM_BYTES);
  });

  it("SPARSE_TILE_COMPOSITE_WGSL이 12종 블렌드·3바인딩·48B 정렬·경계 가드 계약을 통과한다", () => {
    const report = validateWgslShaderContract(SPARSE_TILE_COMPOSITE_WGSL, {
      expectedWorkgroupSize: [8, 8, 1],
    });
    expect(report.valid).toBe(true);
    expect(report.entryPoints).toEqual(["sparse_tile_composite_main"]);
    expect(report.bindings.map((b) => `${b.group}:${b.binding}`)).toEqual(["0:0", "0:1", "0:2"]);
    expect(report.uniformStructBytes["SparseTileCompositeParams"]).toBe(SPARSE_TILE_COMPOSITE_UNIFORM_BYTES);
  });

  it("실제 wesl WGSL 링커가 3종 Compute 셰이더 전부를 구문 오류 없이 컴파일·링크한다", async () => {
    const linked1 = (await link({ weslSrc: { main: TACTILE_PAPER_BRISTLE_COMPUTE_WGSL }, rootModuleName: "main" })).dest;
    const linked2 = (await link({ weslSrc: { main: IMPASTO_RELIEF_LIGHTING_WGSL }, rootModuleName: "main" })).dest;
    const linked3 = (await link({ weslSrc: { main: SPARSE_TILE_COMPOSITE_WGSL }, rootModuleName: "main" })).dest;
    expect(linked1).toContain("fn tactile_paper_bristle_main(");
    expect(linked2).toContain("fn impasto_relief_lighting_main(");
    expect(linked3).toContain("fn sparse_tile_composite_main(");
  });

  it("validateWgslShaderContract가 중복 @group/@binding 선언을 정확히 검출한다", () => {
    const duplicated = SPARSE_TILE_COMPOSITE_WGSL.replace("@group(0) @binding(2)", "@group(0) @binding(1)");
    const report = validateWgslShaderContract(duplicated);
    expect(report.valid).toBe(false);
    expect(report.duplicateBindings).toEqual(["0:1"]);
  });

  it("validateWgslShaderContract가 괄호 불균형·@compute 누락·경계 가드 누락·예약어를 검출한다", () => {
    const broken = `
      struct BadParams { width: u32, height: u32, meta: u32, pad: u32, };
      @group(0) @binding(0) var<uniform> params: BadParams;
      fn no_compute_entry(@builtin(global_invocation_id) gid: vec3<u32>) { let x = (gid.x + 1u; }
    `;
    const report = validateWgslShaderContract(broken);
    expect(report.valid).toBe(false);
    expect(report.delimitersBalanced).toBe(false);
    expect(report.hasComputeEntry).toBe(false);
    expect(report.hasBoundsGuard).toBe(false);
    expect(report.issues.some((m) => m.includes("예약어"))).toBe(true);
  });

  it("validateWgslShaderContract가 비균일 배리어 uniformity 위반·16B 미정렬 구조체를 검출하고 wesl도 오류를 차단한다", async () => {
    const unsafeBarrier = SPARSE_TILE_COMPOSITE_WGSL.replace("let idx =", "workgroupBarrier();\n  let idx =");
    const barrierReport = validateWgslShaderContract(unsafeBarrier);
    expect(barrierReport.valid).toBe(false);
    expect(barrierReport.hasUniformityViolationRisk).toBe(true);

    const misaligned = SPARSE_TILE_COMPOSITE_WGSL.replace("pad_1: u32,", "");
    const alignReport = validateWgslShaderContract(misaligned);
    expect(alignReport.valid).toBe(false);
    expect(alignReport.uniformStructBytes["SparseTileCompositeParams"]).toBe(44);

    const syntaxBroken = IMPASTO_RELIEF_LIGHTING_WGSL.replace("return height_in[cy * w + cx];", "return height_in[cy * w + cx]");
    await expect(link({ weslSrc: { main: syntaxBroken }, rootModuleName: "main" })).rejects.toThrow();
  });
});

describe("16-byte 정렬 Uniform Pack 바이트 오프셋 결정론 검증", () => {
  it("packTactileBrushUniforms가 80B ArrayBuffer의 u32/f32/패딩 오프셋을 정확히 패킹한다", () => {
    const buf = packTactileBrushUniforms({
      width: 256, height: 128, tileOriginX: 512, tileOriginY: 256,
      pressure: 0.75, paperToothDepth: 0.6, pressurePenetration: 0.9, bristleCount: 16,
      bristleDryness: 0.4, wetEdgePooling: 0.5, strokeAngleRad: 0.75, flowOpacity: 0.8,
      pigmentR: 0.25, pigmentG: 0.5, pigmentB: 0.75, pigmentA: 0.95,
      outputMode: "rgba16f-and-rgba8", paperScale: 1.5,
    });
    expect(buf.byteLength).toBe(TACTILE_BRUSH_UNIFORM_BYTES);
    expect(buf.byteLength % 16).toBe(0);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    expect([u32[0], u32[1], u32[2], u32[3]]).toEqual([256, 128, 512, 256]);
    expect(f32[4]).toBeCloseTo(0.75, 5);
    expect(f32[7]).toBeCloseTo(16, 5);
    expect(f32[12]).toBeCloseTo(0.25, 5);
    expect(f32[15]).toBeCloseTo(0.95, 5);
    expect(u32[16]).toBe(1);
    expect(f32[17]).toBeCloseTo(1.5, 5);
    expect([u32[18], u32[19]]).toEqual([0, 0]);
  });

  it("packImpastoUniforms가 64B ArrayBuffer에 45° 키/225° 림 조명 기본값과 0 패딩을 기록한다", () => {
    const buf = packImpastoUniforms({ width: 128, height: 64, reliefStrength: 3.5, specularShininess: 32 });
    expect(buf.byteLength).toBe(IMPASTO_RELIEF_UNIFORM_BYTES);
    expect(buf.byteLength % 16).toBe(0);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    expect([u32[0], u32[1]]).toEqual([128, 64]);
    expect(f32[2]).toBeCloseTo(3.5, 5);
    expect(f32[4]).toBeCloseTo(Math.PI / 4, 5);
    expect(f32[5]).toBeCloseTo(Math.PI / 4, 5);
    expect(f32[9]).toBeCloseTo(32, 5);
    expect(f32[12]).toBeCloseTo((5 * Math.PI) / 4, 5);
    expect([f32[14], f32[15]]).toEqual([0, 0]);
  });

  it("packTileCompositeUniforms가 48B ArrayBuffer에 Dirty-Rect 클램핑과 블렌드 코드를 기록한다", () => {
    const buf = packTileCompositeUniforms({
      width: 256, height: 256, dirtyX: 200, dirtyY: 220, dirtyWidth: 100, dirtyHeight: 80,
      blendMode: "color-dodge", opacity: 0.625, inputIsSrgb: false, outputToSrgb: true,
    });
    expect(buf.byteLength).toBe(SPARSE_TILE_COMPOSITE_UNIFORM_BYTES);
    expect(buf.byteLength % 16).toBe(0);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    expect([u32[0], u32[1], u32[2], u32[3], u32[4], u32[5]]).toEqual([256, 256, 200, 220, 56, 36]);
    expect(u32[6]).toBe(resolveSparseTileBlendModeCode("color-dodge"));
    expect(f32[7]).toBeCloseTo(0.625, 5);
    expect([u32[8], u32[9], u32[10], u32[11]]).toEqual([0, 1, 0, 0]);
  });

  it("사전 할당 공유 ArrayBuffer의 256B 오프셋에 Zero-Copy 인플레이스로 패킹한다", () => {
    const sharedArena = new ArrayBuffer(512);
    new Uint32Array(sharedArena, 0, 4).set([11, 22, 33, 44]);
    const returned = packImpastoUniforms({ width: 64, height: 32, reliefStrength: 4.0 }, sharedArena, 256);
    expect(returned).toBe(sharedArena);
    expect(Array.from(new Uint32Array(sharedArena, 0, 4))).toEqual([11, 22, 33, 44]);
    const view = new DataView(sharedArena, 256, IMPASTO_RELIEF_UNIFORM_BYTES);
    expect(view.getUint32(0, true)).toBe(64);
    expect(view.getUint32(4, true)).toBe(32);
    expect(view.getFloat32(8, true)).toBeCloseTo(4.0, 5);
  });

  it("NaN/범위초과 입력을 안전 클램프하고 12종 블렌드 모드를 0..11로 연속 매핑한다", () => {
    expect(SPARSE_TILE_BLEND_MODES).toHaveLength(12);
    SPARSE_TILE_BLEND_MODES.forEach((mode, index) => {
      expect(resolveSparseTileBlendModeCode(mode)).toBe(index);
    });
    expect(resolveSparseTileBlendModeCode("normal")).toBe(0);
    expect(resolveSparseTileBlendModeCode("add")).toBe(11);

    const buf = packTactileBrushUniforms({
      width: -10, height: Number.NaN, pressure: 9.5, bristleDryness: -3, flowOpacity: Number.POSITIVE_INFINITY,
    });
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    expect(u32[0]).toBe(0);
    expect(u32[1]).toBe(SPARSE_TILE_DIM);
    expect(f32[4]).toBe(1);
    expect(f32[8]).toBe(0);
    expect(f32[11]).toBeCloseTo(0.85, 5);
  });
});

describe("4계층 실행 백엔드 자동 협상 및 실제 Wasm 기능 프로브", () => {
  it("WebGPU 어댑터 및 features가 가용하면 1순위 webgpu-wgsl을 협상한다", () => {
    const sel = selectNativeRenderBackend(DESKTOP_WEBGPU_CAPS);
    expect(sel.backend).toBe("webgpu-wgsl");
    expect(sel.tierRank).toBe(1);
    expect(sel.supportsRgba16FloatStorage).toBe(false);
    expect(sel.zeroCopyTileUpload).toBe(false);
    expect(sel.executionVerified).toBe(false);
    expect(sel.selectionScope).toBe("capability-candidate-only");
    expect(sel.negotiatedFeatures).toEqual(["shader-f16", "float32-filterable", "bgra8unorm-storage"]);
    expect(sel.fallbackChain).toEqual(["webgpu-wgsl", "rust-wasm64", "rust-wasm32-simd", "canvas2d-tile-fallback"]);
  });

  it("WebGPU 미지원 또는 device lost 데스크톱에서 memory64 지원 시 2순위 rust-wasm64로 전환한다", () => {
    const sel = selectNativeRenderBackend({ ...DESKTOP_WEBGPU_CAPS, webGpuDeviceLost: true });
    expect(sel.backend).toBe("rust-wasm64");
    expect(sel.tierRank).toBe(2);
    expect(sel.zeroCopyTileUpload).toBe(false);
    expect(sel.negotiatedFeatures).toContain("wasm-memory64");
    expect(sel.fallbackChain).toEqual(["rust-wasm64", "rust-wasm32-simd", "canvas2d-tile-fallback"]);
  });

  it("iPad/Safari 태블릿 또는 memory64 미지원 환경에서 3순위 rust-wasm32-simd를 선택한다", () => {
    const ipadSel = selectNativeRenderBackend({
      ...DESKTOP_WEBGPU_CAPS, hasWebGpu: false, webGpuAdapterAvailable: false, platformClass: "tablet-safari",
    });
    expect(ipadSel.backend).toBe("rust-wasm32-simd");
    expect(ipadSel.tierRank).toBe(3);
    expect(ipadSel.negotiatedFeatures).toEqual(["wasm-simd128"]);
    expect(ipadSel.fallbackChain).toEqual(["rust-wasm32-simd", "canvas2d-tile-fallback"]);
  });

  it("WebGPU·Wasm SIMD128 모두 미지원 환경에서 4순위 canvas2d-tile-fallback을 안전 선택한다", () => {
    const sel = selectNativeRenderBackend({
      hasWebGpu: false, webGpuAdapterAvailable: false, webGpuFeatures: [],
      hasWebAssembly: false, supportsWasmMemory64: false, supportsWasmSimd128: false,
    });
    expect(sel.backend).toBe("canvas2d-tile-fallback");
    expect(sel.tierRank).toBe(4);
    expect(sel.zeroCopyTileUpload).toBe(false);
    expect(sel.fallbackChain).toEqual(["canvas2d-tile-fallback"]);
  });

  it("preferredOverride가 유효하면 우선 적용하고 미지원 시 안전하게 자동 폴백한다", () => {
    const forced = selectNativeRenderBackend({ ...DESKTOP_WEBGPU_CAPS, preferredOverride: "rust-wasm32-simd" });
    expect(forced.backend).toBe("rust-wasm32-simd");
    const impossible = selectNativeRenderBackend({
      hasWebGpu: false, webGpuAdapterAvailable: false, webGpuFeatures: [],
      hasWebAssembly: true, supportsWasmMemory64: false, supportsWasmSimd128: true,
      preferredOverride: "webgpu-wgsl",
    });
    expect(impossible.backend).toBe("rust-wasm32-simd");
  });

  it("실제 Wasm SIMD128/Memory64 프로브 바이너리 및 비동기 어댑터 프로브가 안전하게 동작한다", async () => {
    expect(WebAssembly.validate(WASM_SIMD128_PROBE_BYTES)).toBe(true);
    expect(typeof WebAssembly.validate(WASM_MEMORY64_PROBE_BYTES)).toBe("boolean");

    const webgpuSel = await probeAndSelectNativeRenderBackend({
      navigatorGpu: {
        requestAdapter: async () => ({
          features: new Set(["shader-f16", "timestamp-query"]),
          limits: { maxStorageBufferBindingSize: 64 * 1024 * 1024 },
        }),
      },
    });
    expect(webgpuSel.backend).toBe("webgpu-wgsl");
    expect(webgpuSel.negotiatedFeatures).toEqual(["shader-f16", "timestamp-query"]);

    const degradedSel = await probeAndSelectNativeRenderBackend({
      navigatorGpu: { requestAdapter: async () => { throw new Error("adapter lost"); } },
      webAssembly: { validate: (bytes) => bytes.byteLength === WASM_SIMD128_PROBE_BYTES.byteLength },
    });
    expect(degradedSel.backend).toBe("rust-wasm32-simd");
  });
});

describe("Konva 핫패스 분리 계획기 및 0-복사 타일 디스패치 배치", () => {
  it("픽셀·브러시·임파스토·레이어 합성은 오프스크린 타일로 직행시키고 Konva에는 기즈모·가이드만 남긴다", () => {
    const sharedBuf = new Float32Array(256 * 256 * 4).buffer;
    const plan = buildKonvaBypassDispatchPlan({
      canvasWidth: 512,
      canvasHeight: 512,
      capabilities: DESKTOP_WEBGPU_CAPS,
      operations: [
        { id: "op-1", kind: "brush-dab-tactile", layerId: "ink", dirtyRect: { x: 20, y: 30, width: 80, height: 80 }, sharedPixelBufferRef: sharedBuf },
        { id: "op-2", kind: "impasto-relief-pass", layerId: "ink", dirtyRect: { x: 20, y: 30, width: 80, height: 80 } },
        { id: "op-3", kind: "sparse-tile-composite", layerId: "paint", dirtyRect: { x: 20, y: 30, width: 80, height: 80 }, blendMode: "multiply", opacity: 0.7 },
        { id: "op-4", kind: "selection-gizmo", layerId: "overlay" },
        { id: "op-5", kind: "perspective-guide", layerId: "overlay" },
      ],
    });
    expect(plan.konvaPixelWorkCount).toBe(0);
    expect(plan.nativeOffscreenOps.map((o) => o.id)).toEqual(["op-1", "op-2", "op-3"]);
    expect(plan.konvaOverlayOps.map((o) => o.id)).toEqual(["op-4", "op-5"]);
    expect(plan.konvaBypassRatio).toBeCloseTo(0.6, 5);
    expect(plan.dirtyTileCount).toBe(1);
    expect(plan.dispatchBatch.commands.map((c) => c.stage)).toEqual(["tactile-bristle", "impasto-relief", "sparse-composite"]);
    expect(plan.dispatchBatch.commands[0]?.sharedPixelBufferRef).toBe(sharedBuf);
  });

  it("타일 경계를 나누되 두 작업과 각 작업의 (tileY, tileX) 순서를 모두 보존한다", () => {
    const plan = buildKonvaBypassDispatchPlan({
      canvasWidth: 1024,
      canvasHeight: 1024,
      capabilities: DESKTOP_WEBGPU_CAPS,
      operations: [
        { id: "c1", kind: "sparse-tile-composite", layerId: "l1", dirtyRect: { x: 240, y: 240, width: 40, height: 40 } },
        { id: "c2", kind: "sparse-tile-composite", layerId: "l1", dirtyRect: { x: 250, y: 245, width: 30, height: 35 } },
      ],
    });
    expect(plan.dirtyTileCount).toBe(4);
    expect(plan.dispatchBatch.commands.map((c) => c.tileKey)).toEqual(["0:0", "1:0", "0:1", "1:1", "0:0", "1:0", "0:1", "1:1"]);
    expect(plan.dispatchBatch.commands.map((c) => c.operationId)).toEqual(["c1", "c1", "c1", "c1", "c2", "c2", "c2", "c2"]);
    expect(plan.dispatchBatch.commands[0]?.dirtyRect).toEqual({ x: 240, y: 240, width: 16, height: 16 });
    expect(plan.dispatchBatch.commands[3]?.dirtyRect).toEqual({ x: 0, y: 0, width: 24, height: 24 });
  });

  it("createTileDispatchBatch가 256B 정렬 단일 uniformArenaBuffer와 transferable을 0-복사로 생성한다", () => {
    const sharedPixels = new Float32Array(16).buffer;
    const batch = createTileDispatchBatch({
      backend: "webgpu-wgsl",
      requests: [
        { tileX: 0, tileY: 0, dirtyRect: { x: 0, y: 0, width: 256, height: 256 }, stage: "tactile-bristle", sharedPixelBufferRef: sharedPixels },
        { tileX: 1, tileY: 0, dirtyRect: { x: 8, y: 8, width: 64, height: 64 }, stage: "sparse-composite", compositeParams: { width: 256, height: 256, blendMode: "screen", opacity: 0.5 } },
      ],
    });
    expect(batch.uniformAlignmentBytes).toBe(UNIFORM_ARENA_ALIGNMENT_BYTES);
    expect(batch.uniformArenaBuffer.byteLength).toBe(512);
    expect(batch.transferables).toEqual([batch.uniformArenaBuffer]);
    expect(batch.zeroCopyCommandCount).toBe(0);
    expect(batch.commands.every((command) => !command.zeroCopy)).toBe(true);
    expect(batch.commands[0]?.uniformByteOffset).toBe(0);
    expect(batch.commands[1]?.uniformByteOffset).toBe(256);
    expect(batch.commands[0]?.workgroupsX).toBe(32);
    expect(batch.commands[0]?.workgroupsY).toBe(32);
    expect(batch.commands[0]?.sharedPixelBufferRef).toBe(sharedPixels);
    expect(new DataView(batch.uniformArenaBuffer, 256, 48).getUint32(24, true)).toBe(resolveSparseTileBlendModeCode("screen"));
  });

  it("256의 배수가 아닌 캔버스 가장자리 타일 크기를 경계 초과 없이 정확히 클램프한다", () => {
    const plan = buildKonvaBypassDispatchPlan({
      canvasWidth: 600,
      canvasHeight: 300,
      capabilities: DESKTOP_WEBGPU_CAPS,
      operations: [{ id: "edge", kind: "pixel-layer-raster", layerId: "bg", dirtyRect: { x: 500, y: 250, width: 200, height: 200 } }],
    });
    const edgeBottomRight = plan.dispatchBatch.commands.find((c) => c.tileKey === "2:1");
    expect(edgeBottomRight).toBeDefined();
    expect(edgeBottomRight?.tileWidth).toBe(88);
    expect(edgeBottomRight?.tileHeight).toBe(44);
    expect(edgeBottomRight?.dirtyRect).toEqual({ x: 0, y: 0, width: 88, height: 44 });
  });

  it("빈 작업 목록에서 안전하게 0-커맨드 배치와 100% Konva 우회율을 반환한다", () => {
    const plan = buildKonvaBypassDispatchPlan({ canvasWidth: 256, canvasHeight: 256, capabilities: DESKTOP_WEBGPU_CAPS, operations: [] });
    expect(plan.konvaPixelWorkCount).toBe(0);
    expect(plan.konvaBypassRatio).toBe(1);
    expect(plan.dirtyTileCount).toBe(0);
    expect(plan.dispatchBatch.commands).toHaveLength(0);
    expect(plan.dispatchBatch.totalWorkgroups).toBe(0);
  });
});

describe("CPU 소프트웨어 참조 패리티 — 종이 요철·갈필·습윤 에지·임파스토", () => {
  it("createProceduralPaperHeightmap64가 결정론적이고 비평탄한 64×64 [0,1] 하이트맵을 생성한다", () => {
    const mapA = createProceduralPaperHeightmap64(42);
    const mapB = createProceduralPaperHeightmap64(42);
    const mapC = createProceduralPaperHeightmap64(99);
    expect(mapA.length).toBe(PAPER_HEIGHTMAP_TILE_DIM * PAPER_HEIGHTMAP_TILE_DIM);
    expect(Array.from(mapA)).toEqual(Array.from(mapB));
    expect(mapA[17]).not.toBe(mapC[17]);
    let minV = 1;
    let maxV = 0;
    for (let i = 0; i < mapA.length; i += 1) {
      const val = mapA[i] ?? 0;
      if (val < minV) minV = val;
      if (val > maxV) maxV = val;
    }
    expect(minV).toBeGreaterThanOrEqual(0);
    expect(maxV).toBeLessThanOrEqual(1);
    expect(maxV - minV).toBeGreaterThan(0.35);
  });

  it("tactile-bristle 패스에서 높은 필압이 종이 골짜기 투과도를 높여 더 많은 안료와 높이를 침착한다", () => {
    const w = 16;
    const h = 16;
    const paper = createProceduralPaperHeightmap64(7);
    const mask = new Float32Array(w * h).fill(0.8);

    const runPressure = (pressure: number) => {
      const canvas = new Float32Array(w * h * 4);
      const heightOut = new Float32Array(w * h);
      executeCpuReferenceTilePass({
        stage: "tactile-bristle",
        params: { width: w, height: h, pressure, paperToothDepth: 0.9, pressurePenetration: 1.0, bristleDryness: 0.1, wetEdgePooling: 0 },
        paperHeightmap: paper, strokeMaskIn: mask, canvasRgbaF32: canvas, paintHeightOut: heightOut,
      });
      let sumAlpha = 0;
      let sumHeight = 0;
      for (let i = 0; i < w * h; i += 1) { sumAlpha += canvas[i * 4 + 3] ?? 0; sumHeight += heightOut[i] ?? 0; }
      return { sumAlpha, sumHeight };
    };

    const light = runPressure(0.15);
    const heavy = runPressure(0.95);
    expect(heavy.sumAlpha).toBeGreaterThan(light.sumAlpha * 1.25);
    expect(heavy.sumHeight).toBeGreaterThan(light.sumHeight * 1.5);
  });

  it("tactile-bristle 패스에서 갈필(bristleDryness)이 필라멘트 방향 분기 편차를 만들어낸다", () => {
    const w = 24;
    const h = 24;
    const flatPaper = new Float32Array(PAPER_HEIGHTMAP_TILE_DIM * PAPER_HEIGHTMAP_TILE_DIM).fill(0.9);
    const mask = new Float32Array(w * h).fill(1.0);
    const measureAlphaVariance = (bristleDryness: number) => {
      const canvas = new Float32Array(w * h * 4);
      executeCpuReferenceTilePass({
        stage: "tactile-bristle",
        params: { width: w, height: h, pressure: 0.3, paperToothDepth: 0, bristleCount: 10, bristleDryness, wetEdgePooling: 0, flowOpacity: 0.9 },
        paperHeightmap: flatPaper, strokeMaskIn: mask, canvasRgbaF32: canvas, paintHeightOut: new Float32Array(w * h),
      });
      const alphas = Array.from({ length: w * h }, (_, i) => canvas[i * 4 + 3] ?? 0);
      const mean = alphas.reduce((a, b) => a + b, 0) / alphas.length;
      return alphas.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / alphas.length;
    };
    expect(measureAlphaVariance(0.95)).toBeGreaterThan(measureAlphaVariance(0) + 0.02);
  });

  it("tactile-bristle 패스에서 모세관 습윤 에지가 경계(mask=0.45)를 진하게 풀링하고 RGBA8 버퍼를 일관되게 패킹한다", () => {
    const paper = new Float32Array(PAPER_HEIGHTMAP_TILE_DIM * PAPER_HEIGHTMAP_TILE_DIM).fill(0.2);
    const mask = new Float32Array([0.45]);
    const dryCanvas = new Float32Array(4);
    const wetCanvas = new Float32Array(4);
    const rgba8 = new Uint32Array(1);

    executeCpuReferenceTilePass({
      stage: "tactile-bristle",
      params: { width: 1, height: 1, paperToothDepth: 0, bristleDryness: 0, wetEdgePooling: 0, pigmentR: 0.5, pigmentG: 0.4, pigmentB: 0.3, flowOpacity: 0.6 },
      paperHeightmap: paper, strokeMaskIn: mask, canvasRgbaF32: dryCanvas, paintHeightOut: new Float32Array(1),
    });
    executeCpuReferenceTilePass({
      stage: "tactile-bristle",
      params: { width: 1, height: 1, paperToothDepth: 0, bristleDryness: 0, wetEdgePooling: 1.0, pigmentR: 0.5, pigmentG: 0.4, pigmentB: 0.3, flowOpacity: 0.6, outputMode: "rgba16f-and-rgba8" },
      paperHeightmap: paper, strokeMaskIn: mask, canvasRgbaF32: wetCanvas, paintHeightOut: new Float32Array(1), canvasRgba8Out: rgba8,
    });
    expect(wetCanvas[3] ?? 0).toBeGreaterThan(dryCanvas[3] ?? 0);
    expect(wetCanvas[0] ?? 1).toBeLessThan(dryCanvas[0] ?? 0);
    expect(((rgba8[0] ?? 0) >>> 24) & 255).toBe(Math.floor((wetCanvas[3] ?? 0) * 255 + 0.5));
  });

  it("impasto-relief 패스가 3×3 Sobel + 45° 아틀리에 키 조명으로 양지 경사를 밝히고 평탄 배경은 보존한다", () => {
    const size = 9;
    const heightIn = new Float32Array(size * size);
    const colorIn = new Float32Array(size * size * 4);
    const colorOut = new Float32Array(size * size * 4);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const idx = y * size + x;
        const dist = Math.hypot(x - 4, y - 4);
        heightIn[idx] = dist < 3.2 ? Math.max(0, 1 - dist / 3.2) : 0;
        colorIn[idx * 4] = 0.5; colorIn[idx * 4 + 1] = 0.4; colorIn[idx * 4 + 2] = 0.3; colorIn[idx * 4 + 3] = 1;
      }
    }
    const res = executeCpuReferenceTilePass({
      stage: "impasto-relief",
      params: { width: size, height: size, reliefStrength: 2.8, keyAzimuthRad: Math.PI / 4, keyElevationRad: Math.PI / 4 },
      heightIn, colorIn, colorOut,
    });
    expect(res.modifiedPixels).toBeGreaterThan(15);
    // 평탄 모서리(0,0)는 높이 0이므로 원본 색(Float32 비트) 100% 보존.
    expect(colorOut[0]).toBe(colorIn[0]);
    expect(colorOut[1]).toBe(colorIn[1]);
    expect(colorOut[2]).toBe(colorIn[2]);
    // 45° 키 조명(+x, +y 방향)을 마주보는 경사(5,5: 법선 +x,+y)가 반대 경사(3,3: 법선 -x,-y)보다 밝다.
    const litR = colorOut[(5 * size + 5) * 4] ?? 0;
    const shadowR = colorOut[(3 * size + 3) * 4] ?? 0;
    expect(litR).toBeGreaterThan(shadowR + 0.12);
  });

  it("요철→임파스토→희소 타일 합성 3단계 체인이 반복 실행 시 비트 수준으로 결정론적 일치를 보장한다", () => {
    const runChain = () => {
      const w = 8;
      const h = 8;
      const paper = createProceduralPaperHeightmap64(2026);
      const mask = new Float32Array(w * h).fill(0.7);
      const brushBuf = new Float32Array(w * h * 4);
      const heightBuf = new Float32Array(w * h);
      const litBuf = new Float32Array(w * h * 4);
      const dstTile = new Float32Array(w * h * 4);
      for (let i = 0; i < w * h; i += 1) { dstTile[i * 4] = 0.9; dstTile[i * 4 + 1] = 0.88; dstTile[i * 4 + 2] = 0.84; dstTile[i * 4 + 3] = 1; }
      const r1 = executeCpuReferenceTilePass({ stage: "tactile-bristle", params: { width: w, height: h }, paperHeightmap: paper, strokeMaskIn: mask, canvasRgbaF32: brushBuf, paintHeightOut: heightBuf });
      const r2 = executeCpuReferenceTilePass({ stage: "impasto-relief", params: { width: w, height: h }, heightIn: heightBuf, colorIn: brushBuf, colorOut: litBuf });
      const r3 = executeCpuReferenceTilePass({ stage: "sparse-composite", params: { width: w, height: h, blendMode: "overlay", inputIsSrgb: false, outputToSrgb: false }, srcTile: litBuf, dstTile });
      return { r1, r2, r3, dstTile: Array.from(dstTile) };
    };
    expect(runChain()).toEqual(runChain());
  });
});

describe("CPU 참조 패리티 — 12종 블렌드·선형 sRGB·Dirty-Rect 및 WebGPU 폴백 실행", () => {
  it("12종 블렌드 모드(Normal~Add) 전부가 W3C/선형광 해석 수식과 1e-5 이내로 일치한다", () => {
    const d = 0.4;
    const s = 0.6;
    const expected: Readonly<Record<SparseTileBlendMode, number>> = {
      normal: s,
      multiply: d * s,
      screen: 1 - (1 - d) * (1 - s),
      overlay: 2 * d * s,
      darken: Math.min(d, s),
      lighten: Math.max(d, s),
      "color-dodge": Math.min(1, d / (1 - s)),
      "color-burn": 1 - Math.min(1, (1 - d) / s),
      "hard-light": 1 - 2 * (1 - d) * (1 - s),
      "soft-light": d + (2 * s - 1) * (Math.sqrt(d) - d),
      difference: Math.abs(d - s),
      add: d + s,
    };

    for (const mode of SPARSE_TILE_BLEND_MODES) {
      const dst = new Float32Array([d, d, d, 1]);
      const src = new Float32Array([s, s, s, 1]);
      executeCpuReferenceTilePass({
        stage: "sparse-composite",
        params: { width: 1, height: 1, blendMode: mode, opacity: 1, inputIsSrgb: false, outputToSrgb: false },
        srcTile: src,
        dstTile: dst,
      });
      expect(dst[0]).toBeCloseTo(expected[mode], 5);
    }
  });

  it("선형광 sRGB 감마 보정 합성이 검정 위 흰색 50%를 감마 0.5가 아닌 물리적 중간톤(~0.73536)으로 합성한다", () => {
    const dst = new Float32Array([0, 0, 0, 1]);
    const src = new Float32Array([1, 1, 1, 0.5]);
    executeCpuReferenceTilePass({
      stage: "sparse-composite",
      params: { width: 1, height: 1, blendMode: "normal", opacity: 1, inputIsSrgb: true, outputToSrgb: true },
      srcTile: src,
      dstTile: dst,
    });
    expect(dst[0]).toBeCloseTo(0.7353569, 4);
    expect(dst[3]).toBeCloseTo(1, 5);
  });

  it("sparse-composite Dirty-Rect 클리핑이 영역 밖 픽셀을 단 1비트도 변경하지 않는다", () => {
    const w = 8;
    const h = 8;
    const src = new Float32Array(w * h * 4);
    const dst = new Float32Array(w * h * 4);
    for (let i = 0; i < w * h; i += 1) {
      src[i * 4] = 0.9; src[i * 4 + 3] = 1;
      dst[i * 4] = 0.2; dst[i * 4 + 3] = 1;
    }
    const res = executeCpuReferenceTilePass({
      stage: "sparse-composite",
      params: { width: w, height: h, dirtyX: 2, dirtyY: 3, dirtyWidth: 3, dirtyHeight: 2, blendMode: "normal", inputIsSrgb: false, outputToSrgb: false },
      srcTile: src,
      dstTile: dst,
    });
    expect(res.modifiedPixels).toBe(6);
    expect(dst[(0 * w + 0) * 4]).toBeCloseTo(0.2, 6);
    expect(dst[(3 * w + 2) * 4]).toBeCloseTo(0.9, 6);
    expect(dst[(4 * w + 4) * 4]).toBeCloseTo(0.9, 6);
    expect(dst[(5 * w + 4) * 4]).toBeCloseTo(0.2, 6);
  });

  it("GPU 결과 회수 연결 전에는 디바이스가 있어도 제출하지 않고 CPU 결과를 반환한다", () => {
    const dispatchSpy = vi.fn();
    const submitSpy = vi.fn();
    const writeSpy = vi.fn();
    const mockDevice: WebGpuComputeDeviceLike = {
      createShaderModule: vi.fn(() => ({})),
      createComputePipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
      createBuffer: vi.fn(() => ({})),
      createBindGroup: vi.fn(() => ({})),
      createCommandEncoder: vi.fn(() => ({
        beginComputePass: () => ({ setPipeline: vi.fn(), setBindGroup: vi.fn(), dispatchWorkgroups: dispatchSpy, end: vi.fn() }),
        finish: () => ({}),
      })),
      queue: { writeBuffer: writeSpy, submit: submitSpy },
    };

    const result = executeTilePassWithFallback({
      device: mockDevice,
      pass: {
        stage: "sparse-composite",
        params: { width: 64, height: 32, blendMode: "multiply" },
        srcTile: new Float32Array(64 * 32 * 4),
        dstTile: new Float32Array(64 * 32 * 4),
      },
    });
    expect(result.executedBackend).toBe("cpu-reference-parity");
    expect(result.fallbackTriggered).toBe(true);
    expect(result.cpuReferenceResult?.workgroupsX).toBe(8);
    expect(result.cpuReferenceResult?.workgroupsY).toBe(4);
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("디바이스 부재·미연결 디바이스 모두에서 CPU 픽셀을 완성하고 실행 경로를 알린다", () => {
    const dstA = new Float32Array([0.2, 0.2, 0.2, 1]);
    const nullResult = executeTilePassWithFallback({
      device: null,
      pass: {
        stage: "sparse-composite",
        params: { width: 1, height: 1, blendMode: "add", inputIsSrgb: false, outputToSrgb: false },
        srcTile: new Float32Array([0.3, 0.3, 0.3, 1]),
        dstTile: dstA,
      },
    });
    expect(nullResult.executedBackend).toBe("cpu-reference-parity");
    expect(nullResult.fallbackTriggered).toBe(true);
    expect(dstA[0]).toBeCloseTo(0.5, 5);

    const brokenDevice: WebGpuComputeDeviceLike = {
      createShaderModule: () => { throw new Error("GPUDevice lost"); },
      createComputePipeline: () => ({ getBindGroupLayout: () => ({}) }),
      createBuffer: () => ({}),
      createBindGroup: () => ({}),
      createCommandEncoder: () => ({
        beginComputePass: () => ({ setPipeline: () => undefined, setBindGroup: () => undefined, dispatchWorkgroups: () => undefined, end: () => undefined }),
        finish: () => ({}),
      }),
      queue: { writeBuffer: () => undefined, submit: () => undefined },
    };
    const dstB = new Float32Array([0.2, 0.2, 0.2, 1]);
    const errResult = executeTilePassWithFallback({
      device: brokenDevice,
      pass: {
        stage: "sparse-composite",
        params: { width: 1, height: 1, blendMode: "add", inputIsSrgb: false, outputToSrgb: false },
        srcTile: new Float32Array([0.3, 0.3, 0.3, 1]),
        dstTile: dstB,
      },
    });
    expect(errResult.fallbackTriggered).toBe(true);
    expect(errResult.fallbackReason).toContain("GPU 저장 버퍼");
    expect(dstB[0]).toBeCloseTo(0.5, 5);
  });
});

describe("공개 배럴 및 Wave 51B 하네스·소스 품질 계약 자가 검증", () => {
  it("index.ts 배럴이 모든 필수 WGSL 상수·유틸·브리지 API를 빠짐없이 노출한다", () => {
    expect(typeof pipelineBarrel.TACTILE_PAPER_BRISTLE_COMPUTE_WGSL).toBe("string");
    expect(typeof pipelineBarrel.IMPASTO_RELIEF_LIGHTING_WGSL).toBe("string");
    expect(typeof pipelineBarrel.SPARSE_TILE_COMPOSITE_WGSL).toBe("string");
    expect(typeof pipelineBarrel.packTactileBrushUniforms).toBe("function");
    expect(typeof pipelineBarrel.packImpastoUniforms).toBe("function");
    expect(typeof pipelineBarrel.packTileCompositeUniforms).toBe("function");
    expect(typeof pipelineBarrel.validateWgslShaderContract).toBe("function");
    expect(typeof pipelineBarrel.selectNativeRenderBackend).toBe("function");
    expect(typeof pipelineBarrel.buildKonvaBypassDispatchPlan).toBe("function");
    expect(typeof pipelineBarrel.createTileDispatchBatch).toBe("function");
    expect(typeof pipelineBarrel.executeCpuReferenceTilePass).toBe("function");
  });

  it("모듈 파일이 줄 수 상한·원시 색 0건·웹 스토리지 0건·private Map 0건·BigInt 0건 계약을 지킨다", () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const specs = [
      { file: "tactile-brush-wgsl-shaders.ts", maxLines: 650 },
      { file: "webgpu-tactile-compositor-bridge.ts", maxLines: 650 },
      { file: "index.ts", maxLines: 800 },
      { file: "webgpu-tactile-pipeline.test.ts", maxLines: 800 },
      { file: "webgpu-tactile-input-contract.ts", maxLines: 800 },
      { file: "webgpu-tactile-boundaries.test.ts", maxLines: 800 },
    ] as const;

    const rawHexPattern = /#[0-9a-fA-F]{3,8}\b/u;
    const rawCssFuncPattern = new RegExp("\\b(?:" + "rgb|rgba|hsl|hsla" + ")\\s*\\(", "iu");
    const webStoragePattern = new RegExp("\\b" + "local" + "Storage\\b", "u");
    const privateMapStorePattern = /private\s+(?:readonly\s+)?\w*store\w*[^;]*new\s+Map\b/iu;
    const bigIntHexPattern = /\b0x[0-9a-fA-F]+n\b/u;

    for (const spec of specs) {
      const src = readFileSync(resolve(dir, spec.file), "utf8");
      const lineCount = src.split("\n").length;
      expect(lineCount).toBeLessThanOrEqual(spec.maxLines);
      expect(rawHexPattern.test(src)).toBe(false);
      expect(rawCssFuncPattern.test(src)).toBe(false);
      expect(webStoragePattern.test(src)).toBe(false);
      expect(privateMapStorePattern.test(src)).toBe(false);
      expect(bigIntHexPattern.test(src)).toBe(false);
    }
  });
});
