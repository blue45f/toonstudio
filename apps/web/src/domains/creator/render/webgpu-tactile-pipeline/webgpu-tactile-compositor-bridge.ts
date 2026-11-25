/**
 * WGSL 소스·CPU 참조 타일 처리와 백엔드 후보·Konva 분리 계획 API.
 *
 * - 4계층 백엔드 자동 협상(`selectNativeRenderBackend`): `webgpu-wgsl` → `rust-wasm64` → `rust-wasm32-simd` → `canvas2d-tile-fallback`
 * - Konva 핫패스 분리(`buildKonvaBypassDispatchPlan`) & 0-복사 배치(`createTileDispatchBatch`)
 * - 검증된 CPU 참조 실행. GPU 저장 바인딩·완료·결과 회수와 Rust 커널 연결은 아직 없다.
 */

import {
  IMPASTO_RELIEF_LIGHTING_WGSL, IMPASTO_RELIEF_UNIFORM_BYTES, PAPER_HEIGHTMAP_TILE_DIM,
  SPARSE_TILE_COMPOSITE_UNIFORM_BYTES, SPARSE_TILE_COMPOSITE_WGSL, SPARSE_TILE_DIM,
  TACTILE_BRUSH_UNIFORM_BYTES, TACTILE_PAPER_BRISTLE_COMPUTE_WGSL,
  TACTILE_WORKGROUP_SIZE_X, TACTILE_WORKGROUP_SIZE_Y,
  packImpastoUniforms, packTactileBrushUniforms, packTileCompositeUniforms, resolveSparseTileBlendModeCode,
  type ImpastoReliefUniformInput, type SparseTileBlendMode, type SparseTileCompositeUniformInput, type TactileBrushUniformInput,
} from "./tactile-brush-wgsl-shaders";
import {
  MAX_TACTILE_CANVAS_DIMENSION, MAX_TACTILE_DISPATCH_COMMANDS,
  boundedTactileInteger, clippedTactileRect, executeAtomicTactileCpuPass, tactileTileDimensions,
} from "./webgpu-tactile-input-contract";

export const UNIFORM_ARENA_ALIGNMENT_BYTES = 256;
const MIN_WEBGPU_STORAGE_BINDING_BYTES = 16 * 1024 * 1024;

/** 표준 Wasm SIMD128(`v128.const`) 유효성 프로브 바이너리(39 bytes). */
export const WASM_SIMD128_PROBE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00, 0x0a, 0x16, 0x01, 0x14, 0x00, 0xfd, 0x0c,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x0b,
]);

/** 표준 Wasm Memory64(`(memory i64 1)`) 유효성 프로브 바이너리(13 bytes). */
export const WASM_MEMORY64_PROBE_BYTES = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x04, 0x01,
]);

export type NativeRenderBackendId = "webgpu-wgsl" | "rust-wasm64" | "rust-wasm32-simd" | "canvas2d-tile-fallback";
export type TactilePipelineStage = "tactile-bristle" | "impasto-relief" | "sparse-composite";
export type NativeOffscreenOperationKind = "brush-dab-tactile" | "impasto-relief-pass" | "sparse-tile-composite" | "pixel-layer-raster";
export type KonvaOverlayOperationKind = "selection-gizmo" | "transform-handle" | "perspective-guide" | "panel-gutter-overlay" | "cursor-reticle";
export type RenderWorkloadOperationKind = NativeOffscreenOperationKind | KonvaOverlayOperationKind;
export interface CanvasDirtyRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export interface NativeRenderCapabilitySnapshot {
  readonly hasWebGpu: boolean;
  readonly webGpuAdapterAvailable: boolean;
  readonly webGpuFeatures: readonly string[];
  readonly webGpuMaxStorageBufferBindingSize?: number | undefined;
  readonly hasWebAssembly: boolean;
  readonly supportsWasmMemory64: boolean;
  readonly supportsWasmSimd128: boolean;
  readonly hasOffscreenCanvas?: boolean | undefined;
  readonly platformClass?: "desktop" | "tablet-safari" | "mobile" | "headless" | undefined;
  readonly preferredOverride?: NativeRenderBackendId | "auto" | undefined;
  readonly webGpuDeviceLost?: boolean | undefined;
}

export interface NativeBackendSelectionResult {
  readonly backend: NativeRenderBackendId;
  readonly tierRank: 1 | 2 | 3 | 4;
  readonly fallbackChain: readonly NativeRenderBackendId[];
  readonly supportsRgba16FloatStorage: boolean;
  readonly zeroCopyTileUpload: boolean;
  readonly maxRecommendedTileCacheCount: number;
  readonly negotiatedFeatures: readonly string[];
  readonly reason: string;
  readonly selectionScope: "capability-candidate-only";
  readonly executionVerified: false;
}

export interface WebGpuAdapterLike {
  readonly features?: Iterable<string> | ReadonlySet<string> | undefined;
  readonly limits?: { readonly maxStorageBufferBindingSize?: number | undefined } | undefined;
}

export interface NativeRuntimeProbeEnvironment {
  readonly navigatorGpu?: { readonly requestAdapter: () => Promise<WebGpuAdapterLike | null> } | null | undefined;
  readonly webAssembly?: Pick<typeof WebAssembly, "validate"> | null | undefined;
  readonly hasOffscreenCanvas?: boolean | undefined;
  readonly platformClass?: "desktop" | "tablet-safari" | "mobile" | "headless" | undefined;
  readonly preferredOverride?: NativeRenderBackendId | "auto" | undefined;
  readonly webGpuDeviceLost?: boolean | undefined;
}

export interface RenderWorkloadOperation {
  readonly id: string;
  readonly kind: RenderWorkloadOperationKind;
  readonly layerId: string;
  readonly dirtyRect?: CanvasDirtyRect | undefined;
  readonly blendMode?: SparseTileBlendMode | undefined;
  readonly opacity?: number | undefined;
  readonly brushParams?: Partial<TactileBrushUniformInput> | undefined;
  readonly impastoParams?: Partial<ImpastoReliefUniformInput> | undefined;
  readonly sharedPixelBufferRef?: ArrayBufferLike | null | undefined;
}

export interface TileDispatchRequest {
  readonly operationId?: string | undefined;
  readonly layerId?: string | undefined;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileWidth?: number | undefined;
  readonly tileHeight?: number | undefined;
  readonly dirtyRect: CanvasDirtyRect;
  readonly stage: TactilePipelineStage;
  readonly brushParams?: TactileBrushUniformInput | undefined;
  readonly impastoParams?: ImpastoReliefUniformInput | undefined;
  readonly compositeParams?: SparseTileCompositeUniformInput | undefined;
  readonly sharedPixelBufferRef?: ArrayBufferLike | null | undefined;
}

export interface TileDispatchCommand {
  readonly operationId: string | null;
  readonly layerId: string | null;
  readonly tileKey: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly dirtyRect: CanvasDirtyRect;
  readonly stage: TactilePipelineStage;
  readonly shaderEntryPoint: string;
  readonly wgslSource: string;
  readonly workgroupsX: number;
  readonly workgroupsY: number;
  readonly workgroupsZ: 1;
  readonly uniformByteOffset: number;
  readonly uniformByteLength: number;
  readonly zeroCopy: boolean;
  readonly sharedPixelBufferRef: ArrayBufferLike | null;
}

export interface TileDispatchBatch {
  readonly backend: NativeRenderBackendId;
  readonly tileSize: number;
  readonly uniformAlignmentBytes: number;
  readonly uniformArenaBuffer: ArrayBuffer;
  readonly commands: readonly TileDispatchCommand[];
  readonly transferables: readonly ArrayBuffer[];
  readonly totalWorkgroups: number;
  readonly zeroCopyCommandCount: number;
}

export interface KonvaBypassPlanInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly tileSize?: number | undefined;
  readonly capabilities: NativeRenderCapabilitySnapshot;
  readonly operations: readonly RenderWorkloadOperation[];
}

export interface KonvaBypassDispatchPlan {
  readonly backendSelection: NativeBackendSelectionResult;
  readonly nativeOffscreenOps: readonly RenderWorkloadOperation[];
  readonly konvaOverlayOps: readonly RenderWorkloadOperation[];
  readonly konvaPixelWorkCount: 0;
  readonly konvaBypassRatio: number;
  readonly dirtyTileCount: number;
  readonly dispatchBatch: TileDispatchBatch;
}

export type CpuReferenceTilePassInput =
  | { readonly stage: "tactile-bristle"; readonly params: TactileBrushUniformInput; readonly paperHeightmap: Float32Array; readonly strokeMaskIn: Float32Array; readonly canvasRgbaF32: Float32Array; readonly paintHeightOut: Float32Array; readonly canvasRgba8Out?: Uint32Array | undefined }
  | { readonly stage: "impasto-relief"; readonly params: ImpastoReliefUniformInput; readonly heightIn: Float32Array; readonly colorIn: Float32Array; readonly colorOut: Float32Array }
  | { readonly stage: "sparse-composite"; readonly params: SparseTileCompositeUniformInput; readonly srcTile: Float32Array; readonly dstTile: Float32Array };

export interface CpuReferenceTilePassResult {
  readonly stage: TactilePipelineStage;
  readonly backend: "cpu-reference-parity";
  readonly processedPixels: number;
  readonly modifiedPixels: number;
  readonly workgroupsX: number;
  readonly workgroupsY: number;
  readonly uniformByteLength: number;
  readonly checksum: number;
}

export interface WebGpuComputeDeviceLike {
  createShaderModule(descriptor: { readonly code: string; readonly label?: string }): unknown;
  createComputePipeline(descriptor: { readonly layout: "auto"; readonly compute: { readonly module: unknown; readonly entryPoint: string }; readonly label?: string }): { getBindGroupLayout(index: number): unknown };
  createBuffer(descriptor: { readonly size: number; readonly usage: number; readonly label?: string }): unknown;
  createBindGroup(descriptor: { readonly layout: unknown; readonly entries: readonly { readonly binding: number; readonly resource: { readonly buffer: unknown } }[] }): unknown;
  createCommandEncoder(): {
    beginComputePass(): { setPipeline(pipeline: unknown): void; setBindGroup(index: number, bindGroup: unknown): void; dispatchWorkgroups(x: number, y?: number, z?: number): void; end(): void };
    finish(): unknown;
  };
  readonly queue: { writeBuffer(buffer: unknown, bufferOffset: number, data: ArrayBuffer | ArrayBufferView): void; submit(commandBuffers: readonly unknown[]): void };
}

export interface TileExecutionResult {
  readonly executedBackend: NativeRenderBackendId | "cpu-reference-parity";
  readonly fallbackTriggered: boolean;
  readonly fallbackReason: string | null;
  readonly stage: TactilePipelineStage;
  readonly workgroupsX: number;
  readonly workgroupsY: number;
  readonly cpuReferenceResult: CpuReferenceTilePassResult | null;
}

const WEBGPU_INTEREST_FEATURES = ["shader-f16", "float32-filterable", "bgra8unorm-storage", "timestamp-query"] as const;
const BACKEND_ORDER: readonly NativeRenderBackendId[] = ["webgpu-wgsl", "rust-wasm64", "rust-wasm32-simd", "canvas2d-tile-fallback"];
const NATIVE_OFFSCREEN_KINDS: ReadonlySet<RenderWorkloadOperationKind> = new Set([
  "brush-dab-tactile", "impasto-relief-pass", "sparse-tile-composite", "pixel-layer-raster",
]);

function isBackendViable(backend: NativeRenderBackendId, cap: NativeRenderCapabilitySnapshot): boolean {
  if (backend === "webgpu-wgsl") {
    return cap.hasWebGpu && cap.webGpuAdapterAvailable && cap.webGpuDeviceLost !== true && (cap.webGpuMaxStorageBufferBindingSize ?? MIN_WEBGPU_STORAGE_BINDING_BYTES) >= MIN_WEBGPU_STORAGE_BINDING_BYTES;
  }
  if (backend === "rust-wasm64") {
    return cap.hasWebAssembly && cap.supportsWasmMemory64 && cap.platformClass !== "tablet-safari" && cap.platformClass !== "mobile";
  }
  return backend === "rust-wasm32-simd" ? cap.hasWebAssembly && cap.supportsWasmSimd128 : true;
}

function buildSelection(backend: NativeRenderBackendId, cap: NativeRenderCapabilitySnapshot, reason: string): NativeBackendSelectionResult {
  const idx = BACKEND_ORDER.indexOf(backend);
  const fallbackChain = BACKEND_ORDER.slice(idx).filter((c) => c === backend || c === "canvas2d-tile-fallback" || isBackendViable(c, cap));
  const featureSet = new Set(cap.webGpuFeatures);
  const features =
    backend === "webgpu-wgsl" ? WEBGPU_INTEREST_FEATURES.filter((f) => featureSet.has(f))
      : backend === "rust-wasm64" ? (["wasm-memory64", ...(cap.supportsWasmSimd128 ? ["wasm-simd128"] : [])] as const)
        : backend === "rust-wasm32-simd" ? (["wasm-simd128"] as const)
          : (["canvas2d-tile-copy"] as const);
  return Object.freeze({
    backend,
    tierRank: (idx + 1) as 1 | 2 | 3 | 4,
    fallbackChain: Object.freeze(fallbackChain),
    supportsRgba16FloatStorage: false,
    zeroCopyTileUpload: false,
    maxRecommendedTileCacheCount: 0,
    negotiatedFeatures: Object.freeze([...features]),
    reason: `${reason} 기능 프로브에 따른 후보이며 실제 GPU/Rust 커널 실행·f16 저장·캐시 용량은 검증하지 않았습니다.`,
    selectionScope: "capability-candidate-only" as const,
    executionVerified: false as const,
  });
}

/** 4계층 백엔드 우선순위(`webgpu-wgsl` → `rust-wasm64` → `rust-wasm32-simd` → `canvas2d-tile-fallback`) 자동 협상. */
export function selectNativeRenderBackend(capabilities: NativeRenderCapabilitySnapshot): NativeBackendSelectionResult {
  const override = capabilities.preferredOverride;
  if (override && override !== "auto" && isBackendViable(override, capabilities)) {
    return buildSelection(override, capabilities, `요청된 백엔드(${override})가 기능 검증을 통과해 선택되었습니다.`);
  }
  if (isBackendViable("webgpu-wgsl", capabilities)) {
    return buildSelection("webgpu-wgsl", capabilities, "WebGPU 어댑터와 스토리지 버퍼 한도에 따라 WGSL 후보를 선택했습니다.");
  }
  if (isBackendViable("rust-wasm64", capabilities)) {
    return buildSelection(
      "rust-wasm64",
      capabilities,
      capabilities.webGpuDeviceLost === true
        ? "WebGPU 디바이스 손실로 Rust Wasm64(memory64) 후보를 선택했습니다."
        : "memory64 지원 데스크톱 환경에서 2순위 Rust Wasm64 경로를 선택했습니다.",
    );
  }
  if (isBackendViable("rust-wasm32-simd", capabilities)) {
    return buildSelection("rust-wasm32-simd", capabilities, "Wasm SIMD128 기능 프로브에 따라 32비트 SIMD 후보를 선택했습니다.");
  }
  return buildSelection("canvas2d-tile-fallback", capabilities, "WebGPU·Wasm SIMD128 미지원 환경으로 4순위 Canvas2D 안전 폴백을 선택했습니다.");
}

/** 런타임 WebGPU 어댑터 및 Wasm memory64/SIMD128 기능을 안전하게 프로브한다. */
export async function probeRuntimeRenderCapabilities(env?: NativeRuntimeProbeEnvironment): Promise<NativeRenderCapabilitySnapshot> {
  const wasmApi = env && "webAssembly" in env ? env.webAssembly : typeof WebAssembly !== "undefined" ? WebAssembly : null;
  const hasWebAssembly = Boolean(wasmApi && typeof wasmApi.validate === "function");
  let supportsWasmMemory64 = false;
  let supportsWasmSimd128 = false;
  if (hasWebAssembly && wasmApi) {
    try { supportsWasmMemory64 = wasmApi.validate(WASM_MEMORY64_PROBE_BYTES); } catch { supportsWasmMemory64 = false; }
    try { supportsWasmSimd128 = wasmApi.validate(WASM_SIMD128_PROBE_BYTES); } catch { supportsWasmSimd128 = false; }
  }
  const gpuApi =
    env && "navigatorGpu" in env
      ? env.navigatorGpu
      : typeof navigator !== "undefined" && "gpu" in navigator
        ? ((navigator as unknown as { gpu?: NativeRuntimeProbeEnvironment["navigatorGpu"] }).gpu ?? null)
        : null;
  const hasWebGpu = Boolean(gpuApi && typeof gpuApi.requestAdapter === "function");
  let webGpuAdapterAvailable = false;
  const webGpuFeatures: string[] = [];
  let webGpuMaxStorageBufferBindingSize: number | undefined;
  if (hasWebGpu && gpuApi && env?.webGpuDeviceLost !== true) {
    try {
      const adapter = await gpuApi.requestAdapter();
      if (adapter) {
        webGpuAdapterAvailable = true;
        if (adapter.features) { for (const f of adapter.features) webGpuFeatures.push(f); }
        webGpuMaxStorageBufferBindingSize = adapter.limits?.maxStorageBufferBindingSize;
      }
    } catch { webGpuAdapterAvailable = false; }
  }
  return Object.freeze({
    hasWebGpu, webGpuAdapterAvailable, webGpuFeatures: Object.freeze(webGpuFeatures), webGpuMaxStorageBufferBindingSize,
    hasWebAssembly, supportsWasmMemory64, supportsWasmSimd128,
    hasOffscreenCanvas: env?.hasOffscreenCanvas ?? typeof OffscreenCanvas !== "undefined",
    platformClass: env?.platformClass ?? "desktop",
    preferredOverride: env?.preferredOverride ?? "auto",
    webGpuDeviceLost: env?.webGpuDeviceLost ?? false,
  });
}

/** 런타임 프로브 후 최적 네이티브 렌더링 백엔드를 반환한다. */
export async function probeAndSelectNativeRenderBackend(env?: NativeRuntimeProbeEnvironment): Promise<NativeBackendSelectionResult> {
  return selectNativeRenderBackend(await probeRuntimeRenderCapabilities(env));
}

function stageMetadata(stage: TactilePipelineStage) {
  if (stage === "tactile-bristle") return { entryPoint: "tactile_paper_bristle_main", wgslSource: TACTILE_PAPER_BRISTLE_COMPUTE_WGSL, uniformBytes: TACTILE_BRUSH_UNIFORM_BYTES, sortOrder: 0 } as const;
  if (stage === "impasto-relief") return { entryPoint: "impasto_relief_lighting_main", wgslSource: IMPASTO_RELIEF_LIGHTING_WGSL, uniformBytes: IMPASTO_RELIEF_UNIFORM_BYTES, sortOrder: 1 } as const;
  return { entryPoint: "sparse_tile_composite_main", wgslSource: SPARSE_TILE_COMPOSITE_WGSL, uniformBytes: SPARSE_TILE_COMPOSITE_UNIFORM_BYTES, sortOrder: 2 } as const;
}

/** 정렬된 uniform arena와 전달 목록을 준비한다. 픽셀 업로드나 실행을 수행하지 않는다. */
export function createTileDispatchBatch(options: {
  readonly backend: NativeRenderBackendId;
  readonly tileSize?: number | undefined;
  readonly requests: readonly TileDispatchRequest[];
}): TileDispatchBatch {
  const tileSize = boundedTactileInteger(options.tileSize ?? SPARSE_TILE_DIM, 16, 1024, "tile size");
  boundedTactileInteger(options.requests.length, 0, MAX_TACTILE_DISPATCH_COMMANDS, "dispatch commands");
  const requests = options.requests.map((req) => {
    const [tileWidth, tileHeight] = tactileTileDimensions(req.tileWidth ?? tileSize, req.tileHeight ?? tileSize);
    if (tileWidth > tileSize || tileHeight > tileSize) throw new RangeError("타일 크기가 배치의 tileSize를 초과했습니다.");
    return { ...req, tileWidth, tileHeight,
      tileX: boundedTactileInteger(req.tileX, 0, MAX_TACTILE_CANVAS_DIMENSION, "tile x"),
      tileY: boundedTactileInteger(req.tileY, 0, MAX_TACTILE_CANVAS_DIMENSION, "tile y"),
      dirtyRect: clippedTactileRect(req.dirtyRect, tileWidth, tileHeight) };
  });
  const uniformArenaBuffer = new ArrayBuffer(Math.max(UNIFORM_ARENA_ALIGNMENT_BYTES, options.requests.length * UNIFORM_ARENA_ALIGNMENT_BYTES));
  const commands: TileDispatchCommand[] = [];
  let totalWorkgroups = 0;
  const zeroCopyCommandCount = 0;

  for (let index = 0; index < requests.length; index += 1) {
    const req = requests[index];
    if (!req) continue;
    const tileWidth = Math.max(1, Math.floor(req.tileWidth ?? tileSize));
    const tileHeight = Math.max(1, Math.floor(req.tileHeight ?? tileSize));
    const meta = stageMetadata(req.stage);
    const uniformByteOffset = index * UNIFORM_ARENA_ALIGNMENT_BYTES;

    if (req.stage === "tactile-bristle") {
      packTactileBrushUniforms({ ...req.brushParams, width: tileWidth, height: tileHeight, tileOriginX: req.tileX * tileSize, tileOriginY: req.tileY * tileSize }, uniformArenaBuffer, uniformByteOffset);
    } else if (req.stage === "impasto-relief") {
      packImpastoUniforms({ ...req.impastoParams, width: tileWidth, height: tileHeight }, uniformArenaBuffer, uniformByteOffset);
    } else {
      packTileCompositeUniforms({ ...req.compositeParams, width: tileWidth, height: tileHeight, dirtyX: req.dirtyRect.x, dirtyY: req.dirtyRect.y, dirtyWidth: req.dirtyRect.width, dirtyHeight: req.dirtyRect.height }, uniformArenaBuffer, uniformByteOffset);
    }

    const workgroupsX = Math.ceil(tileWidth / TACTILE_WORKGROUP_SIZE_X);
    const workgroupsY = Math.ceil(tileHeight / TACTILE_WORKGROUP_SIZE_Y);
    totalWorkgroups += workgroupsX * workgroupsY;
    const zeroCopy = false;

    commands.push(Object.freeze({
      operationId: req.operationId ?? null, layerId: req.layerId ?? null,
      tileKey: `${req.tileX}:${req.tileY}`, tileX: req.tileX, tileY: req.tileY, tileWidth, tileHeight,
      dirtyRect: Object.freeze({ ...req.dirtyRect }), stage: req.stage, shaderEntryPoint: meta.entryPoint,
      wgslSource: meta.wgslSource, workgroupsX, workgroupsY, workgroupsZ: 1 as const,
      uniformByteOffset, uniformByteLength: meta.uniformBytes, zeroCopy, sharedPixelBufferRef: req.sharedPixelBufferRef ?? null,
    }));
  }

  return Object.freeze({
    backend: options.backend, tileSize, uniformAlignmentBytes: UNIFORM_ARENA_ALIGNMENT_BYTES,
    uniformArenaBuffer, commands: Object.freeze(commands), transferables: Object.freeze([uniformArenaBuffer]),
    totalWorkgroups, zeroCopyCommandCount,
  });
}

/** 타일 분리 계획만 생성한다. 작업 순서·레이어·개별 설정을 합치거나 실제 Konva 실행을 바꾸지 않는다. */
export function buildKonvaBypassDispatchPlan(input: KonvaBypassPlanInput): KonvaBypassDispatchPlan {
  const backendSelection = selectNativeRenderBackend(input.capabilities);
  const tileSize = boundedTactileInteger(input.tileSize ?? SPARSE_TILE_DIM, 16, 1024, "tile size");
  const canvasW = boundedTactileInteger(input.canvasWidth, 1, MAX_TACTILE_CANVAS_DIMENSION, "canvas width");
  const canvasH = boundedTactileInteger(input.canvasHeight, 1, MAX_TACTILE_CANVAS_DIMENSION, "canvas height");
  boundedTactileInteger(input.operations.length, 0, MAX_TACTILE_DISPATCH_COMMANDS, "operations");
  const nativeOffscreenOps = input.operations.filter((op) => NATIVE_OFFSCREEN_KINDS.has(op.kind));
  const konvaOverlayOps = input.operations.filter((op) => !NATIVE_OFFSCREEN_KINDS.has(op.kind));
  const requests: TileDispatchRequest[] = [];
  const distinctTiles = new Set<string>();

  for (const op of nativeOffscreenOps) {
    const stage: TactilePipelineStage =
      op.kind === "brush-dab-tactile" ? "tactile-bristle" : op.kind === "impasto-relief-pass" ? "impasto-relief" : "sparse-composite";
    const rect = clippedTactileRect(op.dirtyRect ?? { x: 0, y: 0, width: canvasW, height: canvasH }, canvasW, canvasH);
    const [x0, y0, x1, y1] = [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height];
    if (x1 <= x0 || y1 <= y0) continue;
    const firstX = Math.floor(x0 / tileSize); const lastX = Math.floor((x1 - 1) / tileSize);
    const firstY = Math.floor(y0 / tileSize); const lastY = Math.floor((y1 - 1) / tileSize);
    if (requests.length + (lastX - firstX + 1) * (lastY - firstY + 1) > MAX_TACTILE_DISPATCH_COMMANDS) throw new RangeError("타일 명령 상한을 초과했습니다.");
    for (let ty = firstY; ty <= lastY; ty += 1) {
      for (let tx = firstX; tx <= lastX; tx += 1) {
        const originX = tx * tileSize;
        const originY = ty * tileSize;
        const tileW = Math.min(tileSize, canvasW - originX);
        const tileH = Math.min(tileSize, canvasH - originY);
        const lx0 = Math.max(0, x0 - originX);
        const ly0 = Math.max(0, y0 - originY);
        const lx1 = Math.min(tileW, x1 - originX);
        const ly1 = Math.min(tileH, y1 - originY);
        if (lx1 <= lx0 || ly1 <= ly0) continue;

        const tileKey = `${tx}:${ty}`;
        distinctTiles.add(tileKey);
        requests.push({
          operationId: op.id, layerId: op.layerId,
          tileX: tx, tileY: ty, tileWidth: tileW, tileHeight: tileH,
          dirtyRect: { x: lx0, y: ly0, width: lx1 - lx0, height: ly1 - ly0 },
          stage,
          brushParams: op.brushParams ? { ...op.brushParams, width: tileW, height: tileH, tileOriginX: originX, tileOriginY: originY } : undefined,
          impastoParams: op.impastoParams ? { ...op.impastoParams, width: tileW, height: tileH } : undefined,
          compositeParams: { width: tileW, height: tileH, blendMode: op.blendMode ?? "normal", opacity: op.opacity ?? 1 },
          sharedPixelBufferRef: op.sharedPixelBufferRef ?? null,
        });
      }
    }
  }

  return Object.freeze({
    backendSelection,
    nativeOffscreenOps: Object.freeze(nativeOffscreenOps),
    konvaOverlayOps: Object.freeze(konvaOverlayOps),
    konvaPixelWorkCount: 0 as const,
    konvaBypassRatio: input.operations.length === 0 ? 1 : nativeOffscreenOps.length / input.operations.length,
    dirtyTileCount: distinctTiles.size,
    dispatchBatch: createTileDispatchBatch({ backend: backendSelection.backend, tileSize, requests }),
  });
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
function safeSmoothstepCpu(e0: number, e1: number, x: number): number { const t = clamp01((x - e0) / Math.max(e1 - e0, 1e-5)); return t * t * (3 - 2 * t); }
function srgbToLinearChCpu(s: number): number { const v = clamp01(s); return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function linearToSrgbChCpu(lin: number): number { const v = clamp01(lin); return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055; }
function unitLightDir(az: number, el: number): readonly [number, number, number] {
  const ce = Math.cos(el);
  const [x, y, z] = [Math.cos(az) * ce, Math.sin(az) * ce, Math.sin(el)];
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l] as const;
}

function blendChannelCpu(d: number, s: number, mode: number): number {
  if (mode === 1) return d * s;
  if (mode === 2) return 1 - (1 - d) * (1 - s);
  if (mode === 3) return d < 0.5 ? 2 * d * s : 1 - 2 * (1 - d) * (1 - s);
  if (mode === 4) return Math.min(d, s);
  if (mode === 5) return Math.max(d, s);
  if (mode === 6) return d <= 0 ? 0 : s >= 0.9999 ? 1 : Math.min(1, d / Math.max(1 - s, 1e-4));
  if (mode === 7) return d >= 1 ? 1 : s <= 0.0001 ? 0 : 1 - Math.min(1, (1 - d) / Math.max(s, 1e-4));
  if (mode === 8) return s < 0.5 ? 2 * d * s : 1 - 2 * (1 - d) * (1 - s);
  if (mode === 9) {
    if (s <= 0.5) return d - (1 - 2 * s) * d * (1 - d);
    const g = d <= 0.25 ? ((16 * d - 12) * d + 4) * d : Math.sqrt(Math.max(d, 0));
    return d + (2 * s - 1) * (g - d);
  }
  if (mode === 10) return Math.abs(d - s);
  return mode === 11 ? d + s : s;
}

function makeCpuPassResult(stage: TactilePipelineStage, w: number, h: number, modified: number, uniformBytes: number, checksum: number): CpuReferenceTilePassResult {
  return Object.freeze({
    stage, backend: "cpu-reference-parity", processedPixels: w * h, modifiedPixels: modified,
    workgroupsX: Math.ceil(w / TACTILE_WORKGROUP_SIZE_X), workgroupsY: Math.ceil(h / TACTILE_WORKGROUP_SIZE_Y),
    uniformByteLength: uniformBytes, checksum: Math.round(checksum * 1e4) / 1e4,
  });
}

/** 64×64 결정론적 콜드프레스 종이 요철 하이트맵([0, 1])을 생성한다. */
export function createProceduralPaperHeightmap64(seed = 1337): Float32Array {
  const out = new Float32Array(PAPER_HEIGHTMAP_TILE_DIM * PAPER_HEIGHTMAP_TILE_DIM);
  for (let y = 0; y < PAPER_HEIGHTMAP_TILE_DIM; y += 1) {
    for (let x = 0; x < PAPER_HEIGHTMAP_TILE_DIM; x += 1) {
      let h = (Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1) ^ (seed | 0)) | 0;
      h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) | 0;
      const noise = ((h ^ (h >>> 13)) >>> 0) / 4294967296;
      const wave = 0.5 + 0.25 * Math.sin((x / 64) * Math.PI * 8 + (y / 64) * Math.PI * 4) + 0.25 * Math.cos((y / 64) * Math.PI * 10 - (x / 64) * Math.PI * 2);
      out[y * PAPER_HEIGHTMAP_TILE_DIM + x] = clamp01(wave * 0.6 + noise * 0.4);
    }
  }
  return out;
}

/** 3종 WGSL 셰이더와 수식 100% 동치인 결정론적 CPU 소프트웨어 참조 패리티 실행기. */
function executeCpuReferenceTilePassUnchecked(input: CpuReferenceTilePassInput): CpuReferenceTilePassResult {
  if (input.stage === "tactile-bristle") {
    const v = new DataView(packTactileBrushUniforms(input.params));
    const [w, h, ox, oy, outMode] = [v.getUint32(0, true), v.getUint32(4, true), v.getUint32(8, true), v.getUint32(12, true), v.getUint32(64, true)];
    const [pressure, tooth, pen, bristles, dry, wet, angle, flow, pR, pG, pB, pA, pScale] = [
      v.getFloat32(16, true), v.getFloat32(20, true), v.getFloat32(24, true), v.getFloat32(28, true),
      v.getFloat32(32, true), v.getFloat32(36, true), v.getFloat32(40, true), v.getFloat32(44, true),
      v.getFloat32(48, true), v.getFloat32(52, true), v.getFloat32(56, true), v.getFloat32(60, true), Math.max(v.getFloat32(68, true), 0.25),
    ];
    const [ca, sa] = [Math.cos(angle), Math.sin(angle)];
    const baseThr = (1 - clamp01(pressure * pen)) * tooth;
    const feather = Math.max(0.08, 0.22 * (1 - pressure * 0.5));
    const dryCut = Math.min(0.95, Math.max(0, dry * (1 - pressure * 0.45)));
    let modified = 0;
    let checksum = 0;

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        const mask = clamp01(input.strokeMaskIn[idx] ?? 0);
        if (mask <= 1e-6) continue;
        const [wx, wy] = [ox + x, oy + y];
        const paperH = clamp01(input.paperHeightmap[(Math.floor(wy * pScale) & 63) * 64 + (Math.floor(wx * pScale) & 63)] ?? 0.5);
        const paperMod = 1 + (safeSmoothstepCpu(baseThr - feather, baseThr + feather, paperH) - 1) * tooth;
        const phase = (-wx * sa + wy * ca) * Math.max(bristles, 1) * 0.31415927;
        const bField = clamp01((0.5 + 0.5 * Math.sin(phase + paperH * 2.4)) * 0.65 + (0.5 + 0.5 * Math.sin(phase * 2.17 + (wx * ca + wy * sa) * 0.09)) * 0.35);
        const bristleMod = 1 + (safeSmoothstepCpu(dryCut * 0.7, dryCut * 0.7 + 0.28, bField) - 1) * dry;
        const rim = 4 * mask * (1 - mask);
        const srcA = clamp01(mask * flow * pA * paperMod * bristleMod * (1 + wet * rim * (0.45 + 0.55 * (1 - paperH))));
        const darken = 1 - wet * rim * 0.22;
        const base = idx * 4;
        const dstA = clamp01(input.canvasRgbaF32[base + 3] ?? 0);
        const outA = srcA + dstA * (1 - srcA);
        const [outR, outG, outB] = outA > 1e-6
          ? [
              (pR * darken * srcA + (input.canvasRgbaF32[base] ?? 0) * dstA * (1 - srcA)) / outA,
              (pG * darken * srcA + (input.canvasRgbaF32[base + 1] ?? 0) * dstA * (1 - srcA)) / outA,
              (pB * darken * srcA + (input.canvasRgbaF32[base + 2] ?? 0) * dstA * (1 - srcA)) / outA,
            ]
          : [0, 0, 0];
        input.canvasRgbaF32[base] = outR; input.canvasRgbaF32[base + 1] = outG; input.canvasRgbaF32[base + 2] = outB; input.canvasRgbaF32[base + 3] = outA;
        input.paintHeightOut[idx] = Math.min(4, Math.max(0, (input.paintHeightOut[idx] ?? 0) + srcA * (0.35 + 0.65 * pressure)));
        if (outMode === 1 && input.canvasRgba8Out) {
          input.canvasRgba8Out[idx] = (
            Math.floor(clamp01(linearToSrgbChCpu(outR)) * 255 + 0.5) |
            (Math.floor(clamp01(linearToSrgbChCpu(outG)) * 255 + 0.5) << 8) |
            (Math.floor(clamp01(linearToSrgbChCpu(outB)) * 255 + 0.5) << 16) |
            (Math.floor(clamp01(outA) * 255 + 0.5) << 24)
          ) >>> 0;
        }
        modified += 1;
        checksum += outR + outG + outB + outA;
      }
    }
    return makeCpuPassResult("tactile-bristle", w, h, modified, TACTILE_BRUSH_UNIFORM_BYTES, checksum);
  }

  if (input.stage === "impasto-relief") {
    const v = new DataView(packImpastoUniforms(input.params));
    const [w, h] = [v.getUint32(0, true), v.getUint32(4, true)];
    const [relief, ambient, keyI, rimI, specS, specP, hThr, wetG] = [
      v.getFloat32(8, true), v.getFloat32(12, true), v.getFloat32(24, true), v.getFloat32(28, true),
      v.getFloat32(32, true), Math.max(v.getFloat32(36, true), 1), v.getFloat32(40, true), v.getFloat32(44, true),
    ];
    const [kx, ky, kz] = unitLightDir(v.getFloat32(16, true), v.getFloat32(20, true));
    const [rx, ry, rz] = unitLightDir(v.getFloat32(48, true), v.getFloat32(52, true));
    const hLen = Math.hypot(kx, ky, kz + 1) || 1;
    const [hx, hy, hz] = [kx / hLen, ky / hLen, (kz + 1) / hLen];
    const sampleH = (sx: number, sy: number) =>
      input.heightIn[Math.min(Math.max(sy, 0), Math.max(h - 1, 0)) * w + Math.min(Math.max(sx, 0), Math.max(w - 1, 0))] ?? 0;

    let modified = 0;
    let checksum = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        const base = idx * 4;
        const [cr, cg, cb, ca] = [input.colorIn[base] ?? 0, input.colorIn[base + 1] ?? 0, input.colorIn[base + 2] ?? 0, input.colorIn[base + 3] ?? 0];
        const hc = input.heightIn[idx] ?? 0;
        const weight = clamp01((hc - hThr) / 0.05);
        if (weight <= 1e-6) {
          input.colorOut[base] = cr; input.colorOut[base + 1] = cg; input.colorOut[base + 2] = cb; input.colorOut[base + 3] = ca;
          checksum += cr + cg + cb + ca;
          continue;
        }
        const gx = sampleH(x + 1, y - 1) + 2 * sampleH(x + 1, y) + sampleH(x + 1, y + 1) - (sampleH(x - 1, y - 1) + 2 * sampleH(x - 1, y) + sampleH(x - 1, y + 1));
        const gy = sampleH(x - 1, y + 1) + 2 * sampleH(x, y + 1) + sampleH(x + 1, y + 1) - (sampleH(x - 1, y - 1) + 2 * sampleH(x, y - 1) + sampleH(x + 1, y - 1));
        const nLen = Math.hypot(-gx * relief, -gy * relief, 1) || 1;
        const [nx, ny, nz] = [(-gx * relief) / nLen, (-gy * relief) / nLen, 1 / nLen];
        const [ndotlK, ndotlR] = [Math.max(nx * kx + ny * ky + nz * kz, 0), Math.max(nx * rx + ny * ry + nz * rz, 0)];
        const shade = 1 + (Math.min(1.65, Math.max(0.25, ambient + (ndotlK - kz) * keyI + (ndotlR - rz) * rimI * 0.25)) - 1) * weight;
        const specK = Math.pow(Math.max(nx * hx + ny * hy + nz * hz, 0), specP) * specS * (1 + wetG * clamp01(hc));
        const addLight = (specK + Math.pow(clamp01(Math.hypot(nx, ny)), 1.5) * ndotlR * rimI * 0.2) * weight;
        const [outR, outG, outB] = [Math.min(4, Math.max(0, cr * shade + addLight)), Math.min(4, Math.max(0, cg * shade + addLight)), Math.min(4, Math.max(0, cb * shade + addLight))];
        input.colorOut[base] = outR; input.colorOut[base + 1] = outG; input.colorOut[base + 2] = outB; input.colorOut[base + 3] = ca;
        modified += 1;
        checksum += outR + outG + outB + ca;
      }
    }
    return makeCpuPassResult("impasto-relief", w, h, modified, IMPASTO_RELIEF_UNIFORM_BYTES, checksum);
  }

  const v = new DataView(packTileCompositeUniforms(input.params));
  const [w, h, dx, dy, dw, dh, modeCode] = [v.getUint32(0, true), v.getUint32(4, true), v.getUint32(8, true), v.getUint32(12, true), v.getUint32(16, true), v.getUint32(20, true), v.getUint32(24, true)];
  const [opacity, inSrgb, outSrgb, addCode] = [v.getFloat32(28, true), v.getUint32(32, true) === 1, v.getUint32(36, true) === 1, resolveSparseTileBlendModeCode("add")];

  let modified = 0;
  let checksum = 0;
  for (let y = dy; y < dy + dh && y < h; y += 1) {
    for (let x = dx; x < dx + dw && x < w; x += 1) {
      const base = (y * w + x) * 4;
      const sa = clamp01((input.srcTile[base + 3] ?? 0) * opacity);
      const da = clamp01(input.dstTile[base + 3] ?? 0);
      const readLin = (buf: Float32Array, off: number) => { const raw = Math.max(0, buf[off] ?? 0); return inSrgb ? srgbToLinearChCpu(raw) : raw; };
      const [sr, sg, sb] = [readLin(input.srcTile, base), readLin(input.srcTile, base + 1), readLin(input.srcTile, base + 2)];
      const [dr, dg, db] = [readLin(input.dstTile, base), readLin(input.dstTile, base + 1), readLin(input.dstTile, base + 2)];
      const outA = clamp01(sa + da * (1 - sa));
      if (outA <= 1e-6) {
        input.dstTile[base] = 0; input.dstTile[base + 1] = 0; input.dstTile[base + 2] = 0; input.dstTile[base + 3] = 0;
        modified += 1;
        continue;
      }
      const mixCh = (dCh: number, sCh: number) =>
        modeCode === addCode ? (dCh * da + sCh * sa) / outA : (sCh * sa * (1 - da) + dCh * da * (1 - sa) + blendChannelCpu(clamp01(dCh), clamp01(sCh), modeCode) * sa * da) / outA;
      const [outR, outG, outB] = [mixCh(dr, sr), mixCh(dg, sg), mixCh(db, sb)];
      const [finR, finG, finB] = outSrgb ? [linearToSrgbChCpu(outR), linearToSrgbChCpu(outG), linearToSrgbChCpu(outB)] : [outR, outG, outB];
      input.dstTile[base] = finR; input.dstTile[base + 1] = finG; input.dstTile[base + 2] = finB; input.dstTile[base + 3] = outA;
      modified += 1;
      checksum += finR + finG + finB + outA;
    }
  }
  return makeCpuPassResult("sparse-composite", w, h, modified, SPARSE_TILE_COMPOSITE_UNIFORM_BYTES, checksum);
}

/** 입력·출력 검증이 끝나기 전에는 호출자의 원본 버퍼를 바꾸지 않는다. GPU 패리티 실측은 아니다. */
export function executeCpuReferenceTilePass(input: CpuReferenceTilePassInput): CpuReferenceTilePassResult {
  return executeAtomicTactileCpuPass(input, executeCpuReferenceTilePassUnchecked);
}

/** 동기 API에는 GPU 저장 바인딩·완료 확인·결과 회수가 없어 CPU 참조 실행만 확정한다. */
export function executeTilePassWithFallback(options: { readonly device: WebGpuComputeDeviceLike | null; readonly pass: CpuReferenceTilePassInput }): TileExecutionResult {
  const cpuReferenceResult = executeCpuReferenceTilePass(options.pass);
  const fallbackReason = options.device
    ? "GPU 저장 버퍼 바인딩·비동기 검증·완료·결과 회수가 연결되지 않아 CPU 참조로 실행했습니다."
    : "WebGPU 디바이스가 없어 CPU 참조로 실행했습니다.";
  return Object.freeze({
    executedBackend: "cpu-reference-parity", fallbackTriggered: true, fallbackReason,
    stage: options.pass.stage, workgroupsX: cpuReferenceResult.workgroupsX, workgroupsY: cpuReferenceResult.workgroupsY, cpuReferenceResult,
  });
}
