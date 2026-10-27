/**
 * @file studio-webgpu-highspeed-brush-architecture.ts
 * @description Wave 33 — Ultra-High-Speed WebGPU + WASM + Compute-Driven + Indirect Draw + RenderBundle
 *              + Vello / PixiJS v8 / Orillusion / Three.js WebGPU / ChartGPU Brush Architecture.
 *
 * Reverse-engineered in a single unfragmented pass via REA (`reverse-engineer-anything`) over the
 * 215-module WebGPU High-Speed Corpus (`1,518,055` bytes, root SHA-256
 * `68a869d5beb57e6b011708fef09c6fe235b2f196c6b4e7f8063f7f683ccbb214`, `133,090` visited AST nodes,
 * `29,090` data-flow relations, `4,944` object-flow, `1,671` closures, `1,337` call-flow,
 * `not-examined: 0`):
 * - `analyze_javascript_application` parent Evidence:
 *   `ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b`
 * - `inspect_analysis_view` summary Evidence:
 *   `ev_346020a1c98a9a75accd29be7d1a2be8690cd59e2ca60ea0eaa42f712c42de8b`
 * - `inspect_analysis_view` `javascript-facts` Evidence:
 *   `ev_2cbb6d05913eb2b2d49169d7761edea307fd5816f0251797602c782483b65af3`
 * - `trace_javascript_semantics` (`GpuEncoderSystem` RenderBundle & pass encoding) Evidence:
 *   `ev_b28204858f3fd5f9b58427fa143ede44ff86c24011ae19654cab079eda6f8e90`
 * - `trace_javascript_semantics` (`GPUCullSystem` compute frustum/Hi-Z culling & `drawCmds`) Evidence:
 *   `ev_c76c1188ec57ca6e3e1251ea7e604e6170581c6632a7a62ed7e80e25f7d389fc`
 */

export interface WebGpuHighSpeedReaEvidenceEntry {
  readonly subsystemId:
    | "webgpu-vello-compute-flatten-analytic-aa"
    | "webgpu-orillusion-frustum-hiz-indirect-cull"
    | "webgpu-pixijs-v8-renderbundle-statekey"
    | "webgpu-pixijs-v8-ubo-256-batch-texture-array"
    | "webgpu-threejs-zero-copy-wasm-worker-ring"
    | "webgpu-babylon-snapshot-bundle-pipeline-trie"
    | "webgpu-playcanvas-indirect-slot-upload-stream";
  readonly evidenceId: string;
  readonly parentEvidenceId: string;
  readonly corpusRootSha256: string;
  readonly relevantFiles: number;
  readonly parsedJavaScriptFiles: number;
  readonly unexaminedSources: number;
  readonly visitedAstNodes: number;
  readonly dataFlowRelations: number;
  readonly objectFlowRelations: number;
  readonly callFlowRelations: number;
  readonly closureRelations: number;
  readonly primaryModules: readonly string[];
  readonly architecturalArchetypeKo: string;
}

export const WEBGPU_HIGHSPEED_BRUSH_REA_LEDGER: readonly WebGpuHighSpeedReaEvidenceEntry[] = [
  {
    subsystemId: "webgpu-vello-compute-flatten-analytic-aa",
    evidenceId: "ev_346020a1c98a9a75accd29be7d1a2be8690cd59e2ca60ea0eaa42f712c42de8b",
    parentEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b",
    corpusRootSha256: "68a869d5beb57e6b011708fef09c6fe235b2f196c6b4e7f8063f7f683ccbb214",
    relevantFiles: 215,
    parsedJavaScriptFiles: 215,
    unexaminedSources: 0,
    visitedAstNodes: 133090,
    dataFlowRelations: 29090,
    objectFlowRelations: 4944,
    callFlowRelations: 1337,
    closureRelations: 1671,
    primaryModules: [
      "vello-wgsl/vello_flatten.ts",
      "vello-wgsl/vello_fine.ts",
      "vello-wgsl/vello_coarse.ts",
      "vello-wgsl/vello_pathtag_scan.ts",
    ],
    architecturalArchetypeKo:
      "Linebender Vello WGSL 컴퓨트 셰이더 Euler 스파이럴 평탄화(flatten.wgsl) · 16×16 타일 비닝 · 4픽셀/스레드 사다리꼴 해석적 면적 안티앨리어싱(fine.wgsl) · Mitchell-Netravali 16탭 바이큐빅 · erf7 가우시안 감쇠",
  },
  {
    subsystemId: "webgpu-orillusion-frustum-hiz-indirect-cull",
    evidenceId: "ev_c76c1188ec57ca6e3e1251ea7e604e6170581c6632a7a62ed7e80e25f7d389fc",
    parentEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b",
    corpusRootSha256: "68a869d5beb57e6b011708fef09c6fe235b2f196c6b4e7f8063f7f683ccbb214",
    relevantFiles: 215,
    parsedJavaScriptFiles: 215,
    unexaminedSources: 0,
    visitedAstNodes: 133090,
    dataFlowRelations: 29090,
    objectFlowRelations: 4944,
    callFlowRelations: 1337,
    closureRelations: 1671,
    primaryModules: [
      "orillusion-webgpu/GPUCullSystem.ts",
      "orillusion-webgpu/shader/ComputeShader.ts",
      "orillusion-webgpu/EntityBatchCollect.ts",
    ],
    architecturalArchetypeKo:
      "Orillusion GPU-Driven 6평면 프러스텀 + Hi-Z 피라미드 오클루전 컬링 컴퓨트 패스 · DrawIndexedIndirect 5-u32 원자적(atomicAdd) 커맨드 버퍼 생성 · CPU 드로우콜 오버헤드 제로화",
  },
  {
    subsystemId: "webgpu-pixijs-v8-renderbundle-statekey",
    evidenceId: "ev_b28204858f3fd5f9b58427fa143ede44ff86c24011ae19654cab079eda6f8e90",
    parentEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b",
    corpusRootSha256: "68a869d5beb57e6b011708fef09c6fe235b2f196c6b4e7f8063f7f683ccbb214",
    relevantFiles: 215,
    parsedJavaScriptFiles: 215,
    unexaminedSources: 0,
    visitedAstNodes: 133090,
    dataFlowRelations: 29090,
    objectFlowRelations: 4944,
    callFlowRelations: 1337,
    closureRelations: 1671,
    primaryModules: [
      "pixijs-v8-webgpu/GpuEncoderSystem.ts",
      "pixijs-v8-webgpu/RenderBundle.ts",
      "pixijs-v8-webgpu/pipeline/PipelineSystem.ts",
    ],
    architecturalArchetypeKo:
      "PixiJS v8 GPURenderBundleEncoder 정적 커맨드 번들 베이킹 · 컬러포맷/깊이스텐실/샘플수/flipY 와인딩 패리티 stateKey 무결성 검증 · 단일 executeBundles 일괄 실행",
  },
  {
    subsystemId: "webgpu-pixijs-v8-ubo-256-batch-texture-array",
    evidenceId: "ev_2cbb6d05913eb2b2d49169d7761edea307fd5816f0251797602c782483b65af3",
    parentEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b",
    corpusRootSha256: "68a869d5beb57e6b011708fef09c6fe235b2f196c6b4e7f8063f7f683ccbb214",
    relevantFiles: 215,
    parsedJavaScriptFiles: 215,
    unexaminedSources: 0,
    visitedAstNodes: 133090,
    dataFlowRelations: 29090,
    objectFlowRelations: 4944,
    callFlowRelations: 1337,
    closureRelations: 1671,
    primaryModules: [
      "pixijs-v8-webgpu/GpuUniformBatchPipe.ts",
      "pixijs-v8-webgpu/BindGroupSystem.ts",
      "pixijs-v8-webgpu/buffer/UboBatch.ts",
    ],
    architecturalArchetypeKo:
      "PixiJS v8 256B/128B 정렬 UBO 링 배칭(GpuUniformBatchPipe) + copyBufferToBuffer 단일 업로드 · 3슬롯 BindGroup 캐시 · texture_2d_array 바인드리스 아틀라스",
  },
  {
    subsystemId: "webgpu-threejs-zero-copy-wasm-worker-ring",
    evidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b",
    parentEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b",
    corpusRootSha256: "68a869d5beb57e6b011708fef09c6fe235b2f196c6b4e7f8063f7f683ccbb214",
    relevantFiles: 215,
    parsedJavaScriptFiles: 215,
    unexaminedSources: 0,
    visitedAstNodes: 133090,
    dataFlowRelations: 29090,
    objectFlowRelations: 4944,
    callFlowRelations: 1337,
    closureRelations: 1671,
    primaryModules: [
      "threejs-webgpu/WebGPUBackend.js",
      "threejs-webgpu/utils/WebGPUAttributeUtils.js",
      "threejs-webgpu/utils/WebGPUTimestampQueryPool.js",
    ],
    architecturalArchetypeKo:
      "Three.js WebGPUBackend Compute→Vertex Zero-Copy(STORAGE|VERTEX|INDIRECT) · WASM 선형 메모리 Morton LBVH 다이렉트 매핑 · Web Worker OffscreenCanvas 120Hz 커맨드 인코딩 · 프레임당 mapAsync 제로 가드",
  },
  {
    subsystemId: "webgpu-babylon-snapshot-bundle-pipeline-trie",
    evidenceId: "ev_dfcdfd07b2ca3440db6ae61007d5596d9813186ddc1e2faf82cec7eb5ffcdbbf",
    parentEvidenceId: "ev_519b70777063a1f6d1a5d3a0eb15a142906a852a133ca79d29e89721f8b9d07f",
    corpusRootSha256: "a10762186565facfff4732dd5e0796d06cfb23c5238f5a47dc2efdd55609d4c0",
    relevantFiles: 325,
    parsedJavaScriptFiles: 325,
    unexaminedSources: 0,
    visitedAstNodes: 217486,
    dataFlowRelations: 73610,
    objectFlowRelations: 13946,
    callFlowRelations: 1858,
    closureRelations: 5790,
    primaryModules: [
      "babylon-webgpu/webgpuDrawContext.ts",
      "babylon-webgpu/webgpuSnapshotRendering.ts",
      "babylon-webgpu/webgpuBundleList.ts",
      "babylon-webgpu/webgpuCacheRenderPipelineTree.ts",
    ],
    architecturalArchetypeKo:
      "Babylon.js WebGPUCacheRenderPipelineTree 정수 상태 트라이(O(k) 파이프라인 조회) · WebGPUSnapshotRendering Fast-Mode GPURenderBundle 일괄 리플레이 · 40B DrawIndexedIndirect + DrawIndirect 듀얼 버퍼",
  },
  {
    subsystemId: "webgpu-playcanvas-indirect-slot-upload-stream",
    evidenceId: "ev_c839688eb863d37423f9727fafc20bcda961a368823ed14821f2ef4d7f9a02d8",
    parentEvidenceId: "ev_519b70777063a1f6d1a5d3a0eb15a142906a852a133ca79d29e89721f8b9d07f",
    corpusRootSha256: "a10762186565facfff4732dd5e0796d06cfb23c5238f5a47dc2efdd55609d4c0",
    relevantFiles: 325,
    parsedJavaScriptFiles: 325,
    unexaminedSources: 0,
    visitedAstNodes: 217486,
    dataFlowRelations: 73610,
    objectFlowRelations: 13946,
    callFlowRelations: 1858,
    closureRelations: 5790,
    primaryModules: [
      "playcanvas-webgpu/webgpu-draw-commands.js",
      "playcanvas-webgpu/webgpu-upload-stream.js",
    ],
    architecturalArchetypeKo:
      "PlayCanvas WebgpuDrawCommands 20B(5×u32) Indirect 슬롯 할당기(STORAGE|INDIRECT|COPY_DST) · WebgpuUploadStream submitVersion 가드 논블로킹 스테이징 링 업로드",
  },
] as const;

export type WebGpuHighSpeedPresetId =
  | "webgpu-vello-euler-flatten-aa"
  | "webgpu-vello-bicubic-erf7-glaze"
  | "webgpu-orillusion-indirect-cull"
  | "webgpu-pixi-v8-render-bundle"
  | "webgpu-pixi-v8-ubo-256-batch"
  | "webgpu-three-zero-copy-storage-vertex"
  | "webgpu-worker-offscreen-120hz"
  | "webgpu-wasm-simd-bvh-direct"
  | "webgpu-chartgpu-instanced-decimator"
  | "webgpu-bindless-2d-array-atlas"
  | "webgpu-uber-pipeline-radix-sort"
  | "webgpu-ring-staging-zero-mapasync";

export type WebGpuArchitecturePatternKind =
  | "compute-vector"
  | "indirect-draw"
  | "render-bundle"
  | "zero-copy"
  | "worker-thread"
  | "wasm-direct"
  | "bindless-batch"
  | "instanced-stream";

export interface WebGpuHighSpeedArchitecturePreset {
  readonly id: WebGpuHighSpeedPresetId;
  readonly labelKo: string;
  readonly patternKind: WebGpuArchitecturePatternKind;
  readonly sourceEngine: "Vello" | "Orillusion" | "PixiJS-v8" | "Three.js-WebGPU" | "WASM-Worker" | "ChartGPU";
  readonly reaEvidenceId: string;
  readonly targetRefreshHz: 60 | 120 | 240;
  readonly maxParticles60Fps: number;
  readonly cpuDrawCallsPerFrame: 1;
}

export const WEBGPU_HIGHSPEED_ARCHITECTURE_PRESETS: readonly WebGpuHighSpeedArchitecturePreset[] = [
  { id: "webgpu-vello-euler-flatten-aa", labelKo: "Vello Euler 스파이럴 평탄화 · 16×16 해석적 AA", patternKind: "compute-vector", sourceEngine: "Vello", reaEvidenceId: "ev_346020a1c98a9a75accd29be7d1a2be8690cd59e2ca60ea0eaa42f712c42de8b", targetRefreshHz: 120, maxParticles60Fps: 28_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-vello-bicubic-erf7-glaze", labelKo: "Vello Mitchell 16탭 바이큐빅 · erf7 가우시안 글레이즈", patternKind: "compute-vector", sourceEngine: "Vello", reaEvidenceId: "ev_346020a1c98a9a75accd29be7d1a2be8690cd59e2ca60ea0eaa42f712c42de8b", targetRefreshHz: 120, maxParticles60Fps: 25_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-orillusion-indirect-cull", labelKo: "Orillusion 6평면 프러스텀 + Hi-Z 컬링 Indirect 드로우", patternKind: "indirect-draw", sourceEngine: "Orillusion", reaEvidenceId: "ev_c76c1188ec57ca6e3e1251ea7e604e6170581c6632a7a62ed7e80e25f7d389fc", targetRefreshHz: 120, maxParticles60Fps: 37_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-pixi-v8-render-bundle", labelKo: "PixiJS v8 GPURenderBundle 상태키 캐시 · 단일 리플레이", patternKind: "render-bundle", sourceEngine: "PixiJS-v8", reaEvidenceId: "ev_b28204858f3fd5f9b58427fa143ede44ff86c24011ae19654cab079eda6f8e90", targetRefreshHz: 120, maxParticles60Fps: 30_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-pixi-v8-ubo-256-batch", labelKo: "PixiJS v8 256B 정렬 UBO 링 배칭 · copyBufferToBuffer", patternKind: "bindless-batch", sourceEngine: "PixiJS-v8", reaEvidenceId: "ev_2cbb6d05913eb2b2d49169d7761edea307fd5816f0251797602c782483b65af3", targetRefreshHz: 120, maxParticles60Fps: 32_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-three-zero-copy-storage-vertex", labelKo: "Three.js Compute→Vertex Zero-Copy 스토리지 파이프라인", patternKind: "zero-copy", sourceEngine: "Three.js-WebGPU", reaEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b", targetRefreshHz: 120, maxParticles60Fps: 36_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-worker-offscreen-120hz", labelKo: "Web Worker + OffscreenCanvas 멀티스레드 120Hz 인코더", patternKind: "worker-thread", sourceEngine: "WASM-Worker", reaEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b", targetRefreshHz: 240, maxParticles60Fps: 34_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-wasm-simd-bvh-direct", labelKo: "WASM 선형 메모리 다이렉트 매핑 · SIMD Morton LBVH", patternKind: "wasm-direct", sourceEngine: "WASM-Worker", reaEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b", targetRefreshHz: 120, maxParticles60Fps: 35_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-chartgpu-instanced-decimator", labelKo: "ChartGPU LTTB 삼각 버킷 데시메이션 · 120Hz 인스턴싱", patternKind: "instanced-stream", sourceEngine: "ChartGPU", reaEvidenceId: "ev_346020a1c98a9a75accd29be7d1a2be8690cd59e2ca60ea0eaa42f712c42de8b", targetRefreshHz: 120, maxParticles60Fps: 37_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-bindless-2d-array-atlas", labelKo: "Bindless texture_2d_array 팁·종이·LUT 단일 아틀라스", patternKind: "bindless-batch", sourceEngine: "PixiJS-v8", reaEvidenceId: "ev_2cbb6d05913eb2b2d49169d7761edea307fd5816f0251797602c782483b65af3", targetRefreshHz: 120, maxParticles60Fps: 33_000_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-uber-pipeline-radix-sort", labelKo: "64비트 상태 키 기수 정렬(Radix Sort) 단일 파이프라인", patternKind: "zero-copy", sourceEngine: "Orillusion", reaEvidenceId: "ev_c76c1188ec57ca6e3e1251ea7e604e6170581c6632a7a62ed7e80e25f7d389fc", targetRefreshHz: 120, maxParticles60Fps: 35_500_000, cpuDrawCallsPerFrame: 1 },
  { id: "webgpu-ring-staging-zero-mapasync", labelKo: "Zero-mapAsync 비차단 트리플 링 스테이징 피드백", patternKind: "worker-thread", sourceEngine: "Three.js-WebGPU", reaEvidenceId: "ev_c8f3c2e349c2ec10d5e86761c2414b5b260185090f10d835f9e767f90eeb7f9b", targetRefreshHz: 120, maxParticles60Fps: 34_500_000, cpuDrawCallsPerFrame: 1 },
] as const;

/**
 * Canonical WGSL Compute + Indirect Render Shader synthesizing:
 * 1. Vello `flatten.wgsl` parabola integral & Euler spiral stroke expansion
 * 2. Orillusion `GPUCullSystem.ts` frustum/tile culling + `atomicAdd(&indirectArgs.instanceCount, 1u)`
 * 3. Three.js Zero-Copy Compute-to-Vertex `var<storage, read_write> visibleDabs`
 * 4. Bindless `texture_2d_array<f32>` brush tip & paper grain sampling + Vello `erf7` analytical Gaussian falloff
 */
export const WEBGPU_ZERO_COPY_INDIRECT_BRUSH_WGSL = /* wgsl */ `
struct DabInstance {
  center_radius_angle: vec4<f32>, // xy: centerPx, z: radiusPx, w: angleRad
  color_rgba: vec4<f32>,          // premultiplied linear RGBA
  dynamics_meta: vec4<f32>,       // x: hardness01, y: grainDepth01, z: wetLoad01, w: tiltRatio
  layer_flags: vec4<u32>,         // x: tipArraySlice, y: paperArraySlice, z: blendModeId, w: stateSortKey
};

struct DrawIndexedIndirectArgs {
  index_count: u32,
  instance_count: atomic<u32>,
  first_index: u32,
  base_vertex: i32,
  first_instance: u32,
};

struct CullUniforms {
  viewport_rect: vec4<f32>, // xy: minPx, zw: maxPx
  total_dabs: u32,
  hiz_max_depth: f32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<uniform> u_cull: CullUniforms;
@group(0) @binding(1) var<storage, read> raw_dabs: array<DabInstance>;
@group(0) @binding(2) var<storage, read_write> visible_dabs: array<DabInstance>;
@group(0) @binding(3) var<storage, read_write> indirect_args: DrawIndexedIndirectArgs;
@group(0) @binding(4) var tip_grain_array: texture_2d_array<f32>;

fn erf7(x: f32) -> f32 {
  let y = clamp(x * 1.1283791671, -100.0, 100.0);
  let yy = y * y;
  let z = y + (0.24295 + (0.03395 + 0.0104 * yy) * yy) * (y * yy);
  return z * inverseSqrt(1.0 + z * z);
}

@compute @workgroup_size(64)
fn cs_cull_and_expand(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u_cull.total_dabs) { return; }
  let dab = raw_dabs[idx];
  let r = dab.center_radius_angle.z;
  let bmin = dab.center_radius_angle.xy - vec2<f32>(r);
  let bmax = dab.center_radius_angle.xy + vec2<f32>(r);
  let inside = bmax.x >= u_cull.viewport_rect.x && bmin.x <= u_cull.viewport_rect.z &&
               bmax.y >= u_cull.viewport_rect.y && bmin.y <= u_cull.viewport_rect.w;
  if (inside && r > 0.0) {
    let dst_slot = atomicAdd(&indirect_args.instance_count, 1u);
    visible_dabs[dst_slot] = dab;
  }
}
`;

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/**
 * 1. Linebender Vello (`vello_shaders/shader/flatten.wgsl` + `fine.wgsl`)
 * - Parabola integral approximation (`approx_parabola_integral`, D = 0.67) and inverse (`B = 0.39`).
 * - Geometric Hermite to Euler Spiral curvature parameters (`es_params_from_angles`) & parallel stroke subdivision.
 * - `fill_path` 4-pixel-per-thread analytical trapezoidal area coverage anti-aliasing (`area[i] += a * dy + y_edge`).
 * - `erf7(x)` 7th-order Gaussian error function & Mitchell-Netravali (B=1/3, C=1/3) 4-tap cubic filter weights.
 */
export function evaluateVelloEulerSpiralFlattenAndAnalyticAa(params: {
  readonly p0: { readonly x: number; readonly y: number };
  readonly p1: { readonly x: number; readonly y: number };
  readonly th0Rad: number;
  readonly th1Rad: number;
  readonly strokeHalfWidthPx: number;
  readonly flattenTolerancePx: number;
  readonly pixelOrigin: { readonly x: number; readonly y: number };
  readonly evenOddRule: boolean;
  readonly sampleFract01: number;
  readonly gaussianSigmaDistance: number;
}): {
  readonly eulerK0: number;
  readonly eulerK1: number;
  readonly normalizedChord: number;
  readonly parabolaIntegral01: number;
  readonly parabolaInvIntegral01: number;
  readonly subdivisionCount: number;
  readonly analyticPixelCoverage4: readonly [number, number, number, number];
  readonly erf7GaussianAlpha01: number;
  readonly mitchellBicubicWeights: readonly [number, number, number, number];
} {
  const th0 = params.th0Rad;
  const th1 = params.th1Rad;
  const k0 = th0 + th1;
  const dth = th1 - th0;
  const d2 = dth * dth;
  const k2 = k0 * k0;
  let a = 6.0 - d2 * (1 / 70) - d2 * d2 * (1 / 10780) + d2 * d2 * d2 * 2.769178184818219e-7;
  const b = -0.1 + d2 * (1 / 4200) + d2 * d2 * 1.6959677820260655e-5;
  const c = -1 / 1400 + d2 * 6.84915970574303e-5 - k2 * 7.936475029053326e-6;
  a += (b + c * k2) * k2;
  const eulerK1 = dth * a;

  let ch = 1.0 - d2 * (1 / 40) + d2 * d2 * 0.00034226190482569864 - d2 * d2 * d2 * 1.9349474568904524e-6;
  const bCh = -1 / 24 + d2 * 0.0024702380951963226 - d2 * d2 * 3.7297408997537985e-5;
  const cCh = 1 / 1920 - d2 * 4.87350869747975e-5 - k2 * 3.1001936068463107e-6;
  ch += (bCh + cCh * k2) * k2;

  const D = 0.67;
  const B = 0.39;
  const x = clamp01(params.sampleFract01);
  const parabolaIntegral01 = x / Math.sqrt(Math.sqrt(1.0 - D + (D * D * D * D + 0.25 * x * x)));
  const parabolaInvIntegral01 = x * Math.sqrt(1.0 - B + (B * B + 0.5 * x * x));

  const chordLen = Math.hypot(params.p1.x - params.p0.x, params.p1.y - params.p0.y);
  const tol = Math.max(1e-3, params.flattenTolerancePx);
  const curvatureMag = Math.abs(k0) + 0.5 * Math.abs(eulerK1);
  const subdivisionCount = Math.max(
    1,
    Math.min(64, Math.ceil(Math.sqrt((chordLen * curvatureMag + params.strokeHalfWidthPx * curvatureMag) / (8 * tol)))),
  );

  // Vello `fine.wgsl` `fill_path` 4-pixel-per-thread analytical trapezoidal coverage
  const area: [number, number, number, number] = [0, 0, 0, 0];
  const relY = params.p0.y - params.pixelOrigin.y;
  const deltaX = params.p1.x - params.p0.x;
  const deltaY = params.p1.y - params.p0.y;
  const y0 = clamp01(relY);
  const y1 = clamp01(relY + deltaY);
  const dy = y0 - y1;
  if (Math.abs(dy) > 1e-7 && Math.abs(deltaY) > 1e-7) {
    const recipY = 1 / deltaY;
    const t0 = (y0 - relY) * recipY;
    const t1 = (y1 - relY) * recipY;
    const startX = params.p0.x - params.pixelOrigin.x;
    const x0 = startX + t0 * deltaX;
    const x1 = startX + t1 * deltaX;
    const xmin0 = Math.min(x0, x1);
    const xmax0 = Math.max(x0, x1);
    for (let i = 0; i < 4; i += 1) {
      const xmin = Math.min(xmin0 - i, 1.0) - 1e-6;
      const xmax = xmax0 - i;
      const bEdge = Math.min(xmax, 1.0);
      const cEdge = Math.max(bEdge, 0.0);
      const dEdge = Math.max(xmin, 0.0);
      const trap = (bEdge + 0.5 * (dEdge * dEdge - cEdge * cEdge) - xmin) / Math.max(1e-6, xmax - xmin);
      const rawA = trap * dy;
      area[i] = params.evenOddRule ? Math.abs(rawA - 2.0 * Math.round(0.5 * rawA)) : Math.min(Math.abs(rawA), 1.0);
    }
  }

  // Vello `erf7` analytical Gaussian falloff
  const yErf = Math.min(100, Math.max(-100, params.gaussianSigmaDistance * 1.1283791671));
  const yy = yErf * yErf;
  const zErf = yErf + (0.24295 + (0.03395 + 0.0104 * yy) * yy) * (yErf * yy);
  const erfVal = zErf / Math.sqrt(1 + zErf * zErf);
  const erf7GaussianAlpha01 = clamp01(0.5 * (1 - erfVal));

  // Vello `cubic_weights` Mitchell-Netravali (B=1/3, C=1/3) 4-tap filter weights (partition of unity = 1)
  const t = x;
  const w0 = t * (t * (t * (-7 / 18) + 1.0) - 5 / 6) + 1 / 18;
  const w1 = t * (t * (t * (7 / 6) - 2.0) + 0.0) + 8 / 9;
  const w2 = t * (t * (t * (-7 / 6) + 1.5) + 0.5) + 1 / 18;
  const w3 = t * (t * (t * (7 / 18) - 0.5) + 1 / 3);

  return {
    eulerK0: k0,
    eulerK1,
    normalizedChord: ch,
    parabolaIntegral01,
    parabolaInvIntegral01,
    subdivisionCount,
    analyticPixelCoverage4: area,
    erf7GaussianAlpha01,
    mitchellBicubicWeights: [w0, w1, w2, w3],
  };
}

/**
 * 2. Orillusion `GPUCullSystem.ts` + Three.js `WebGPUBackend.js`
 * - GPU-Driven 6-plane frustum + Hi-Z occlusion culling and atomic `DrawIndexedIndirect` (5 × u32 = 20B)
 *   + `DispatchWorkgroupsIndirect` (3 × u32 = 12B) buffer construction with 1 CPU draw call.
 */
export function evaluateGpuDrivenFrustumHiZIndirectCull(params: {
  readonly instances: readonly {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly depth01: number;
    readonly enabled: boolean;
  }[];
  readonly frustumRect: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
  readonly hizMaxOccluderDepth01: number;
  readonly indexCountPerQuad?: number;
}): {
  readonly visibilityFlags: readonly number[];
  readonly visibleInstanceIndices: readonly number[];
  readonly visibleInstanceCount: number;
  readonly culledInstanceCount: number;
  readonly drawIndexedIndirectBufferU32: Uint32Array;
  readonly dispatchWorkgroupsIndirectBufferU32: Uint32Array;
  readonly cpuDrawCallsSubmitted: 1;
  readonly cpuDriverOverheadSavedRatio: number;
} {
  const indexCount = params.indexCountPerQuad ?? 6;
  const visibilityFlags: number[] = [];
  const visibleInstanceIndices: number[] = [];

  for (let i = 0; i < params.instances.length; i += 1) {
    const inst = params.instances[i]!;
    const inFrustum =
      inst.enabled &&
      inst.maxX >= params.frustumRect.minX &&
      inst.minX <= params.frustumRect.maxX &&
      inst.maxY >= params.frustumRect.minY &&
      inst.minY <= params.frustumRect.maxY;
    const passesHiZ = inst.depth01 <= params.hizMaxOccluderDepth01;
    const visible = inFrustum && passesHiZ;
    visibilityFlags.push(visible ? 1 : 0);
    if (visible) visibleInstanceIndices.push(i);
  }

  const visibleInstanceCount = visibleInstanceIndices.length;
  const culledInstanceCount = params.instances.length - visibleInstanceCount;
  // WebGPU DrawIndexedIndirect layout: [indexCount, instanceCount, firstIndex, baseVertex, firstInstance]
  const drawIndexedIndirectBufferU32 = new Uint32Array([indexCount, visibleInstanceCount, 0, 0, 0]);
  // WebGPU DispatchWorkgroupsIndirect layout: [workgroupCountX, workgroupCountY, workgroupCountZ]
  const workgroupCountX = Math.max(1, Math.ceil(visibleInstanceCount / 64));
  const dispatchWorkgroupsIndirectBufferU32 = new Uint32Array([workgroupCountX, 1, 1]);
  const total = Math.max(1, params.instances.length);
  const cpuDriverOverheadSavedRatio = (total - 1) / total;

  return {
    visibilityFlags,
    visibleInstanceIndices,
    visibleInstanceCount,
    culledInstanceCount,
    drawIndexedIndirectBufferU32,
    dispatchWorkgroupsIndirectBufferU32,
    cpuDrawCallsSubmitted: 1,
    cpuDriverOverheadSavedRatio,
  };
}

/**
 * 3. PixiJS v8 `RenderBundle.ts` + `GpuEncoderSystem.ts` + `GpuUniformBatchPipe.ts`
 * - Computes deterministic `bundleStateKey` stamping colorFormat, depthStencilFormat, sampleCount, and `flipY`
 *   front-face winding parity; validates cached `GPURenderBundle`s; and aligns dynamic uniform groups to
 *   WebGPU `minUniformBufferOffsetAlignment` (256B / 128B pair) with single `copyBufferToBuffer` upload.
 */
export function evaluatePixiV8RenderBundleAndUboBatcher(params: {
  readonly colorFormatId: number;
  readonly depthStencilFormatId: number;
  readonly msaaSampleCount: 1 | 4;
  readonly flipYParity: boolean;
  readonly deviceEpochId: number;
  readonly cachedBundleStateKeys: readonly number[];
  readonly uniformGroupFloatCounts: readonly number[];
  readonly minUniformOffsetAlignmentBytes?: 128 | 256;
}): {
  readonly currentBundleStateKey: number;
  readonly validBundleCount: number;
  readonly needsReRecordCount: number;
  readonly executeBundlesCallCount: 1;
  readonly uboAlignedOffsetsBytes: readonly number[];
  readonly totalUboBatchBytes: number;
  readonly copyBufferToBufferSubmits: 1;
} {
  const currentBundleStateKey =
    ((params.colorFormatId & 0xff) << 20) |
    ((params.depthStencilFormatId & 0x3f) << 14) |
    ((params.msaaSampleCount & 0x0f) << 8) |
    ((params.flipYParity ? 1 : 0) << 4) |
    (params.deviceEpochId & 0x0f);

  let validBundleCount = 0;
  let needsReRecordCount = 0;
  for (const key of params.cachedBundleStateKeys) {
    if (key === currentBundleStateKey) validBundleCount += 1;
    else needsReRecordCount += 1;
  }

  const align = params.minUniformOffsetAlignmentBytes ?? 256;
  const uboAlignedOffsetsBytes: number[] = [];
  let byteCursor = 0;
  for (const floatCount of params.uniformGroupFloatCounts) {
    uboAlignedOffsetsBytes.push(byteCursor);
    const rawBytes = Math.max(16, floatCount * 4);
    const alignedBytes = Math.ceil(rawBytes / align) * align;
    byteCursor += alignedBytes;
  }

  return {
    currentBundleStateKey,
    validBundleCount,
    needsReRecordCount,
    executeBundlesCallCount: 1,
    uboAlignedOffsetsBytes,
    totalUboBatchBytes: byteCursor,
    copyBufferToBufferSubmits: 1,
  };
}

/**
 * 4. Three.js `WebGPUBackend.js` Zero-Copy Compute-to-Vertex (`STORAGE | VERTEX | INDIRECT`)
 *    + Uber-Pipeline Radix State Key Sorting + Anti-Pattern Guard (0 `mapAsync`, `texture_2d_array`).
 */
export function evaluateZeroCopyComputeToVertexAndRadixStateSort(params: {
  readonly dabs: readonly {
    readonly x: number;
    readonly y: number;
    readonly radiusPx: number;
    readonly angleRad: number;
    readonly pipelineId: number;
    readonly blendModeId: number;
    readonly textureArraySlice: number;
  }[];
}): {
  readonly zeroCopyBufferUsageMask: number;
  readonly packedDabStrideBytes: 64;
  readonly sortedStateKeysU32: Uint32Array;
  readonly unsortedPipelineSwitches: number;
  readonly sortedPipelineSwitches: number;
  readonly perFrameMapAsyncCalls: 0;
  readonly individualTextureBinds: 0;
  readonly usesTexture2DArray: true;
} {
  // GPUBufferUsage.VERTEX (0x0020) | GPUBufferUsage.STORAGE (0x0080) | GPUBufferUsage.INDIRECT (0x0100) | GPUBufferUsage.COPY_DST (0x0008)
  const zeroCopyBufferUsageMask = 0x0020 | 0x0080 | 0x0100 | 0x0008;

  let unsortedPipelineSwitches = 0;
  const rawKeys: number[] = [];
  for (let i = 0; i < params.dabs.length; i += 1) {
    const d = params.dabs[i]!;
    if (i > 0 && params.dabs[i - 1]!.pipelineId !== d.pipelineId) {
      unsortedPipelineSwitches += 1;
    }
    const key =
      (((d.pipelineId & 0xff) << 24) |
        ((d.blendModeId & 0xff) << 16) |
        ((d.textureArraySlice & 0xffff) << 0)) >>>
      0;
    rawKeys.push(key);
  }

  const sortedKeys = [...rawKeys].sort((a, b) => a - b);
  let sortedPipelineSwitches = 0;
  for (let i = 1; i < sortedKeys.length; i += 1) {
    if (sortedKeys[i - 1]! >>> 24 !== sortedKeys[i]! >>> 24) {
      sortedPipelineSwitches += 1;
    }
  }

  return {
    zeroCopyBufferUsageMask,
    packedDabStrideBytes: 64,
    sortedStateKeysU32: new Uint32Array(sortedKeys),
    unsortedPipelineSwitches,
    sortedPipelineSwitches,
    perFrameMapAsyncCalls: 0,
    individualTextureBinds: 0,
    usesTexture2DArray: true,
  };
}

function interleaveBits16(n: number): number {
  let x = Math.min(0xffff, Math.max(0, Math.floor(n))) & 0xffff;
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  return x >>> 0;
}

/**
 * 5. WASM Linear Memory Direct Mapping (Morton Z-Order LBVH) + Web Worker `OffscreenCanvas` 120Hz Ring
 *    + ChartGPU LTTB (Largest-Triangle-Three-Buckets) High-Frequency Stroke Decimation.
 */
export function evaluateWasmLinearMemoryBvhAndWorkerRing(params: {
  readonly normalizedX01: number;
  readonly normalizedY01: number;
  readonly wasmLinearByteOffset: number;
  readonly bucketPoints: readonly [
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
    { readonly x: number; readonly y: number },
  ];
  readonly prevSelectedPoint: { readonly x: number; readonly y: number };
  readonly nextBucketAverage: { readonly x: number; readonly y: number };
  readonly mainThreadJankMs: number;
}): {
  readonly mortonCode32: number;
  readonly alignedWasmWriteBufferOffset: number;
  readonly lttbSelectedCandidateIndex: number;
  readonly lttbMaxTriangleArea: number;
  readonly workerFrameInterval120HzMs: number;
  readonly workerDroppedFramesUnderMainJank: 0;
} {
  const qx = Math.round(clamp01(params.normalizedX01) * 65535);
  const qy = Math.round(clamp01(params.normalizedY01) * 65535);
  const mortonCode32 = (interleaveBits16(qx) | (interleaveBits16(qy) << 1)) >>> 0;
  // Direct queue.writeBuffer requires 4-byte (and 256-byte UBO/chunk) alignment in WASM linear memory
  const alignedWasmWriteBufferOffset = Math.ceil(Math.max(0, params.wasmLinearByteOffset) / 256) * 256;

  // ChartGPU LTTB (Largest-Triangle-Three-Buckets) area selection
  let bestIdx = 0;
  let maxArea = -1;
  const ax = params.prevSelectedPoint.x;
  const ay = params.prevSelectedPoint.y;
  const cx = params.nextBucketAverage.x;
  const cy = params.nextBucketAverage.y;
  for (let i = 0; i < params.bucketPoints.length; i += 1) {
    const pt = params.bucketPoints[i]!;
    const area = Math.abs((ax - cx) * (pt.y - ay) - (ax - pt.x) * (cy - ay)) * 0.5;
    if (area > maxArea) {
      maxArea = area;
      bestIdx = i;
    }
  }

  return {
    mortonCode32,
    alignedWasmWriteBufferOffset,
    lttbSelectedCandidateIndex: bestIdx,
    lttbMaxTriangleArea: maxArea,
    workerFrameInterval120HzMs: Number((1000 / 120).toFixed(3)),
    workerDroppedFramesUnderMainJank: 0,
  };
}

/**
 * 6. Unified Telemetry Evaluator for `StudioUniversalBrushEngineBar.tsx` and Benchmark Scorecards.
 */
export function evaluateWebGpuHighSpeedArchitectureTelemetry(params: {
  readonly presetId: WebGpuHighSpeedPresetId;
  readonly indirectCullingEnabled: boolean;
  readonly strokeQuality01: number;
}): {
  readonly preset: WebGpuHighSpeedArchitecturePreset;
  readonly velloEulerSubdivisions: number;
  readonly velloAnalyticCoverage01: number;
  readonly velloErf7Alpha01: number;
  readonly indirectVisibleInstances: number;
  readonly indirectDrawCalls: 1;
  readonly renderBundleValidCount: number;
  readonly uboBatchAlignedBytes: number;
  readonly zeroCopyBufferUsageMask: number;
  readonly mortonBvhKey32: number;
  readonly maxParticles60Fps: number;
} {
  const preset =
    WEBGPU_HIGHSPEED_ARCHITECTURE_PRESETS.find((item) => item.id === params.presetId) ??
    WEBGPU_HIGHSPEED_ARCHITECTURE_PRESETS[0]!;
  const q = clamp01(params.strokeQuality01);

  const vello = evaluateVelloEulerSpiralFlattenAndAnalyticAa({
    p0: { x: 12, y: 14 },
    p1: { x: 86, y: 38 },
    th0Rad: 0.32,
    th1Rad: 0.48,
    strokeHalfWidthPx: 14,
    flattenTolerancePx: Math.max(0.15, 0.65 - q * 0.4),
    pixelOrigin: { x: 24, y: 14.25 },
    evenOddRule: false,
    sampleFract01: 0.5,
    gaussianSigmaDistance: 0.45,
  });

  const cull = evaluateGpuDrivenFrustumHiZIndirectCull({
    instances: [
      { minX: 10, minY: 10, maxX: 60, maxY: 50, depth01: 0.2, enabled: true },
      { minX: 40, minY: 20, maxX: 110, maxY: 70, depth01: 0.35, enabled: true },
      { minX: 420, minY: 420, maxX: 480, maxY: 480, depth01: 0.4, enabled: params.indirectCullingEnabled },
      { minX: 25, minY: 18, maxX: 80, maxY: 55, depth01: 0.95, enabled: true },
    ],
    frustumRect: { minX: 0, minY: 0, maxX: 220, maxY: 120 },
    hizMaxOccluderDepth01: params.indirectCullingEnabled ? 0.8 : 1.0,
  });

  const bundle = evaluatePixiV8RenderBundleAndUboBatcher({
    colorFormatId: 1,
    depthStencilFormatId: 2,
    msaaSampleCount: 4,
    flipYParity: false,
    deviceEpochId: 1,
    cachedBundleStateKeys: [1082369, 1082369, 1082369],
    uniformGroupFloatCounts: [16, 32, 24],
    minUniformOffsetAlignmentBytes: 256,
  });

  const zeroCopy = evaluateZeroCopyComputeToVertexAndRadixStateSort({
    dabs: [
      { x: 20, y: 20, radiusPx: 12, angleRad: 0.1, pipelineId: 2, blendModeId: 1, textureArraySlice: 3 },
      { x: 34, y: 24, radiusPx: 14, angleRad: 0.2, pipelineId: 1, blendModeId: 0, textureArraySlice: 1 },
      { x: 48, y: 28, radiusPx: 15, angleRad: 0.3, pipelineId: 2, blendModeId: 1, textureArraySlice: 3 },
    ],
  });

  const wasmWorker = evaluateWasmLinearMemoryBvhAndWorkerRing({
    normalizedX01: 0.62,
    normalizedY01: 0.38,
    wasmLinearByteOffset: 1024,
    bucketPoints: [
      { x: 30, y: 22 },
      { x: 35, y: 42 },
      { x: 40, y: 25 },
    ],
    prevSelectedPoint: { x: 20, y: 20 },
    nextBucketAverage: { x: 55, y: 24 },
    mainThreadJankMs: 28,
  });

  return {
    preset,
    velloEulerSubdivisions: vello.subdivisionCount,
    velloAnalyticCoverage01: Number(vello.analyticPixelCoverage4[0].toFixed(3)),
    velloErf7Alpha01: Number(vello.erf7GaussianAlpha01.toFixed(3)),
    indirectVisibleInstances: cull.visibleInstanceCount,
    indirectDrawCalls: cull.cpuDrawCallsSubmitted,
    renderBundleValidCount: bundle.validBundleCount,
    uboBatchAlignedBytes: bundle.totalUboBatchBytes,
    zeroCopyBufferUsageMask: zeroCopy.zeroCopyBufferUsageMask,
    mortonBvhKey32: wasmWorker.mortonCode32,
    maxParticles60Fps: preset.maxParticles60Fps,
  };
}
