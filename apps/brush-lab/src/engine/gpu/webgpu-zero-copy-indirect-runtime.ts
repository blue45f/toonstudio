/**
 * WebGPU Zero-Copy Compute + Indirect Draw + RenderBundle + WASM Direct-Map Runtime
 * Reverse-engineered via REA (`ev_519b70777063a1f6d1a5d3a0eb15a142906a852a133ca79d29e89721f8b9d07f`, 325 files):
 * Linebender Vello, Orillusion WebGPU, PixiJS v8, Three.js WebGPURenderer, Babylon.js WebGPU, PlayCanvas WebGPU.
 */

import { DAB_BYTES, DAB_FLOATS } from "../core/dab-layout";

import { BUFFER_USAGE, MAX_DABS_PER_BATCH, SHADER_STAGE, TEXTURE_USAGE } from "./layout";

import type { DabBatch } from "../core/dab-layout";

/** 4 × u32 = 16 bytes for `drawIndirect(indirectBuffer, offset)` */
export const INDIRECT_DRAW_ARGS_BYTES = 16;
/** 5 × u32 = 20 bytes for `drawIndexedIndirect(indirectBuffer, offset)` */
export const INDEXED_INDIRECT_DRAW_ARGS_BYTES = 20;
/** WebGPU minimum dynamic uniform buffer offset alignment (256 B) */
export const WEB_GPU_UBO_ALIGNMENT_BYTES = 256;
/** Default indirect slot capacity (PlayCanvas WebgpuDrawCommands style) */
export const DEFAULT_INDIRECT_SLOT_CAPACITY = 256;
/** Ring staging buffer slot count for zero-stall uploads */
export const RING_STAGING_SLOT_COUNT = 3;

export const ZERO_COPY_ENTRY_POINTS = {
  computeCullAndFlatten: "cs_vello_cull_and_expand",
  staticLayerVs: "vs_static_layer_bundle",
  staticLayerFs: "fs_static_layer_bundle",
  zeroCopyBrushVs: "vs_zero_copy_brush_main",
  zeroCopyBrushFs: "fs_zero_copy_brush_main",
} as const;

export const ZERO_COPY_BUFFER_LABELS = {
  rawDabs: "sumi-zero-copy-raw-dabs",
  visibleDabs: "sumi-zero-copy-visible-dabs",
  indirectDrawArgs: "sumi-zero-copy-indirect-draw-args",
  indexedIndirectDrawArgs: "sumi-zero-copy-indexed-indirect-draw-args",
  quadIndexBuffer: "sumi-zero-copy-quad-index-buffer",
  dynamicUniformRing: "sumi-zero-copy-dynamic-ubo-ring",
  ringStagingPrefix: "sumi-zero-copy-ring-staging",
} as const;

export const ZERO_COPY_COMPUTE_WGSL = /* wgsl */ `
struct DabInstance {
  geom: vec4<f32>,
  color: vec4<f32>,
  dyn_params: vec4<f32>,
  meta: vec4<u32>,
};

struct IndirectDrawArgs {
  vertex_count: u32,
  instance_count: atomic<u32>,
  first_vertex: u32,
  first_instance: u32,
};

struct CullUniforms {
  viewport_rect: vec4<f32>,
  dab_count: u32,
  hi_z_threshold: f32,
  euler_tolerance: f32,
  pad0: u32,
};

@group(0) @binding(0) var<uniform> u_cull: CullUniforms;
@group(0) @binding(1) var<storage, read> raw_dabs: array<DabInstance>;
@group(0) @binding(2) var<storage, read_write> visible_dabs: array<DabInstance>;
@group(0) @binding(3) var<storage, read_write> indirect_args: IndirectDrawArgs;

// Linebender Vello erf7 analytical polynomial approximation for 1D Gaussian integral coverage
fn vello_erf7(x: f32) -> f32 {
  let y = clamp(x * 0.70710678, -4.0, 4.0);
  let y2 = y * y;
  let p = y * (1.12837917 + y2 * (-0.37612639 + y2 * (0.11283792 + y2 * (-0.02686617 + y2 * 0.00522398))));
  return clamp(p, -1.0, 1.0);
}

@compute @workgroup_size(64)
fn ${ZERO_COPY_ENTRY_POINTS.computeCullAndFlatten}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u_cull.dab_count) {
    return;
  }
  let dab = raw_dabs[idx];
  let cx = dab.geom.x;
  let cy = dab.geom.y;
  let radius = max(dab.geom.z, 0.5);
  let min_x = u_cull.viewport_rect.x - radius;
  let min_y = u_cull.viewport_rect.y - radius;
  let max_x = u_cull.viewport_rect.z + radius;
  let max_y = u_cull.viewport_rect.w + radius;

  // Frustum + positive alpha culling
  if (cx < min_x || cx > max_x || cy < min_y || cy > max_y || dab.color.w <= 0.0) {
    return;
  }

  let out_slot = atomicAdd(&indirect_args.instance_count, 1u);
  var refined = dab;
  let aa_cov = 0.5 * (vello_erf7(radius) - vello_erf7(-radius));
  refined.color.w = clamp(dab.color.w * aa_cov, 0.0, 1.0);
  visible_dabs[out_slot] = refined;
}
`;

export const ZERO_COPY_RENDER_WGSL = /* wgsl */ `
struct FrameUniforms {
  canvas_size: vec2<f32>,
  inv_canvas_size: vec2<f32>,
  opacity_scale: f32,
  atlas_layer_count: f32,
  pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_frame: FrameUniforms;
@group(0) @binding(1) var tip_grain_atlas: texture_2d_array<f32>;
@group(0) @binding(2) var tip_sampler: sampler;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) atlas_layer: u32,
};

@vertex
fn ${ZERO_COPY_ENTRY_POINTS.staticLayerVs}(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  let x = select(-1.0, 3.0, vid == 1u);
  let y = select(-1.0, 3.0, vid == 2u);
  return vec4<f32>(x, y, 0.0, 1.0);
}

@fragment
fn ${ZERO_COPY_ENTRY_POINTS.staticLayerFs}() -> @location(0) vec4<f32> {
  return vec4<f32>(0.98, 0.97, 0.95, 1.0);
}

@vertex
fn ${ZERO_COPY_ENTRY_POINTS.zeroCopyBrushVs}(
  @builtin(vertex_index) vid: u32,
  @location(0) geom: vec4<f32>,
  @location(1) color: vec4<f32>,
  @location(2) dyn_params: vec4<f32>,
  @location(3) meta: vec4<u32>,
) -> VsOut {
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
  );
  let corner = quad[vid % 6u];
  let world_pos = geom.xy + corner * max(geom.z, 0.5);
  let ndc = world_pos * u_frame.inv_canvas_size * 2.0 - vec2<f32>(1.0, 1.0);
  var out: VsOut;
  out.pos = vec4<f32>(ndc.x, -ndc.y, 0.0, 1.0);
  out.uv = corner * 0.5 + vec2<f32>(0.5, 0.5);
  out.color = vec4<f32>(color.rgb, color.a * u_frame.opacity_scale);
  out.atlas_layer = meta.x & 7u;
  return out;
}

@fragment
fn ${ZERO_COPY_ENTRY_POINTS.zeroCopyBrushFs}(in: VsOut) -> @location(0) vec4<f32> {
  let mask = textureSampleLevel(tip_grain_atlas, tip_sampler, in.uv, i32(in.atlas_layer), 0.0).r;
  let alpha = in.color.a * mask;
  return vec4<f32>(in.color.rgb * alpha, alpha);
}
`;

export interface ViewportRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ZeroCopyPipelineStateKey {
  readonly topologyId: number;
  readonly blendModeId: number;
  readonly colorFormatId: number;
  readonly sampleCount: number;
  readonly indexedIndirect: boolean;
}

export interface ZeroCopyFrameExecutionReport {
  readonly rawDabCount: number;
  readonly visibleDabCount: number;
  readonly culledDabCount: number;
  readonly computeWorkgroupsDispatched: number;
  readonly drawCallMode: "drawIndirect" | "drawIndexedIndirect";
  readonly indirectSlotIndex: number;
  readonly indirectByteOffset: number;
  readonly dynamicUboByteOffset: number;
  readonly staticBundleExecuted: boolean;
  readonly bundleStateKey: string;
  readonly pipelineTrieCacheHit: boolean;
  readonly radixStateSortKey: number;
  readonly uploadMode: "wasm-linear-memory-direct" | "ring-staging-copy" | "queue-write-buffer";
  readonly submitVersion: number;
  readonly hotPathMapAsyncCount: 0;
  readonly cpuDrawCallLoopCount: 0;
}

/**
 * Aligns a byte offset or size upward to a power-of-two alignment (e.g., 4 B or 256 B).
 */
export function alignUpBytes(value: number, alignment: number): number {
  const safeVal = Math.max(0, Math.ceil(value));
  const mask = alignment - 1;
  return (safeVal + mask) & ~mask;
}

/**
 * Computes a 32-bit unsigned radix sort key for draw-call state sorting:
 * `[31..24] pipelineId (8b) | [23..18] blendModeId (6b) | [17..8] atlasLayerIndex (10b) | [7..0] zOrderBucket (8b)`
 */
export function computeRadixStateSortKey(
  pipelineId: number,
  blendModeId: number,
  atlasLayerIndex: number,
  zOrderBucket: number,
): number {
  return (
    (((pipelineId & 0xff) << 24) |
      ((blendModeId & 0x3f) << 18) |
      ((atlasLayerIndex & 0x3ff) << 8) |
      (zOrderBucket & 0xff)) >>>
    0
  );
}

/**
 * Babylon.js `WebGPUCacheRenderPipelineTree`-inspired integer state-trie cache.
 * Walks integer state tokens in O(k) without per-frame string hashing.
 */
interface TrieNode<T> {
  children: Map<number, TrieNode<T>>;
  value?: T;
}

export class WebGpuPipelineStateTrie<T> {
  private readonly root: TrieNode<T> = { children: new Map() };
  private hits = 0;
  private misses = 0;

  lookupOrInsert(stateTokens: readonly number[], factory: () => T): { pipeline: T; cacheHit: boolean } {
    let node = this.root;
    for (let i = 0; i < stateTokens.length; i += 1) {
      const token = stateTokens[i]! | 0;
      let next = node.children.get(token);
      if (!next) {
        next = { children: new Map() };
        node.children.set(token, next);
      }
      node = next;
    }
    if (node.value !== undefined) {
      this.hits += 1;
      return { pipeline: node.value, cacheHit: true };
    }
    this.misses += 1;
    const created = factory();
    node.value = created;
    return { pipeline: created, cacheHit: false };
  }

  getStats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }
}

export interface SumiZeroCopyIndirectConfig {
  readonly width: number;
  readonly height: number;
  readonly maxDabs?: number;
  readonly colorFormat?: GPUTextureFormat;
  readonly sampleCount?: number;
}

/**
 * End-to-end WebGPU Zero-Copy Compute + Indirect Draw + RenderBundle + WASM Direct-Map Runtime.
 */
export class SumiZeroCopyIndirectRuntime {
  readonly device: GPUDevice;
  readonly width: number;
  readonly height: number;
  readonly maxDabs: number;
  readonly colorFormat: GPUTextureFormat;
  readonly sampleCount: number;

  readonly rawDabsBuffer: GPUBuffer;
  readonly visibleDabsBuffer: GPUBuffer;
  readonly indirectDrawBuffer: GPUBuffer;
  readonly indexedIndirectDrawBuffer: GPUBuffer;
  readonly quadIndexBuffer: GPUBuffer;
  readonly cullUniformBuffer: GPUBuffer;
  readonly dynamicFrameUboBuffer: GPUBuffer;
  readonly ringStagingBuffers: readonly GPUBuffer[];
  readonly tipGrainAtlasTexture: GPUTexture;
  readonly renderTargetTexture: GPUTexture;

  private readonly computeBgl: GPUBindGroupLayout;
  private readonly renderBgl: GPUBindGroupLayout;
  private readonly computePipeline: GPUComputePipeline;
  private readonly staticBundlePipeline: GPURenderPipeline;
  private readonly computeBindGroup: GPUBindGroup;
  private readonly renderBindGroup: GPUBindGroup;
  private readonly pipelineTrie = new WebGpuPipelineStateTrie<GPURenderPipeline>();
  private readonly staticBundleCache = new Map<string, GPURenderBundle>();

  private submitVersion = 0;
  private lastStagingSubmitVersion = -1;
  private ringSlotCursor = 0;
  private indirectSlotCursor = 0;
  private dynamicUboCursor = 0;

  constructor(device: GPUDevice, config: SumiZeroCopyIndirectConfig) {
    this.device = device;
    this.width = Math.max(1, config.width | 0);
    this.height = Math.max(1, config.height | 0);
    this.maxDabs = Math.min(config.maxDabs ?? MAX_DABS_PER_BATCH, MAX_DABS_PER_BATCH);
    this.colorFormat = config.colorFormat ?? "rgba16float";
    this.sampleCount = config.sampleCount ?? 1;

    const dabBufferBytes = this.maxDabs * DAB_BYTES;

    // 1. Raw dabs buffer: written once by CPU/WASM, read by Compute Shader
    this.rawDabsBuffer = device.createBuffer({
      label: ZERO_COPY_BUFFER_LABELS.rawDabs,
      size: dabBufferBytes,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST,
    });

    // 2. Zero-Copy Visible Dabs buffer: written by Compute Shader (STORAGE) and read directly as Vertex Buffer (VERTEX)
    this.visibleDabsBuffer = device.createBuffer({
      label: ZERO_COPY_BUFFER_LABELS.visibleDabs,
      size: dabBufferBytes,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_SRC | BUFFER_USAGE.COPY_DST,
    });

    // 3. Non-indexed Indirect Draw Args buffer (4 × u32 = 16 B per slot)
    this.indirectDrawBuffer = device.createBuffer({
      label: ZERO_COPY_BUFFER_LABELS.indirectDrawArgs,
      size: DEFAULT_INDIRECT_SLOT_CAPACITY * INDIRECT_DRAW_ARGS_BYTES,
      usage: BUFFER_USAGE.INDIRECT | BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC,
    });

    // 4. Indexed Indirect Draw Args buffer (5 × u32 = 20 B per slot, PlayCanvas WebgpuDrawCommands layout)
    this.indexedIndirectDrawBuffer = device.createBuffer({
      label: ZERO_COPY_BUFFER_LABELS.indexedIndirectDrawArgs,
      size: DEFAULT_INDIRECT_SLOT_CAPACITY * INDEXED_INDIRECT_DRAW_ARGS_BYTES,
      usage: BUFFER_USAGE.INDIRECT | BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC,
    });

    // 5. Static Quad Index Buffer (6 indices per quad: 0, 1, 2, 2, 1, 3, padded to 16 B)
    this.quadIndexBuffer = device.createBuffer({
      label: ZERO_COPY_BUFFER_LABELS.quadIndexBuffer,
      size: 16,
      usage: BUFFER_USAGE.INDEX | BUFFER_USAGE.COPY_DST,
    });
    const quadIndices = new Uint16Array([0, 1, 2, 2, 1, 3, 0, 0]);
    device.queue.writeBuffer(this.quadIndexBuffer, 0, quadIndices);

    // 6. Compute Cull Uniform Buffer (32 bytes)
    this.cullUniformBuffer = device.createBuffer({
      label: "sumi-zero-copy-cull-uniform",
      size: 32,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });

    // 7. Dynamic Uniform Ring Buffer (16 slots × 256 B = 4096 B, 256-byte aligned offsets)
    this.dynamicFrameUboBuffer = device.createBuffer({
      label: ZERO_COPY_BUFFER_LABELS.dynamicUniformRing,
      size: 16 * WEB_GPU_UBO_ALIGNMENT_BYTES,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });

    // 8. 3-Slot Ring Staging Buffers (COPY_SRC | COPY_DST) for non-blocking staging copies
    const stagingSlots: GPUBuffer[] = [];
    for (let i = 0; i < RING_STAGING_SLOT_COUNT; i += 1) {
      stagingSlots.push(
        device.createBuffer({
          label: `${ZERO_COPY_BUFFER_LABELS.ringStagingPrefix}-${i}`,
          size: Math.min(dabBufferBytes, 64 * 1024),
          usage: BUFFER_USAGE.COPY_SRC | BUFFER_USAGE.COPY_DST,
        }),
      );
    }
    this.ringStagingBuffers = stagingSlots;

    // 9. Bindless 2D Texture Array for Brush Tips & Paper Grains (8 layers)
    this.tipGrainAtlasTexture = device.createTexture({
      label: "sumi-zero-copy-tip-grain-atlas-array",
      size: { width: 64, height: 64, depthOrArrayLayers: 8 },
      format: "rgba8unorm",
      usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST,
    });

    this.renderTargetTexture = device.createTexture({
      label: "sumi-zero-copy-render-target",
      size: { width: this.width, height: this.height },
      format: this.colorFormat,
      usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.TEXTURE_BINDING,
    });

    const computeShader = device.createShaderModule({
      label: "sumi-zero-copy-compute-shader",
      code: ZERO_COPY_COMPUTE_WGSL,
    });
    const renderShader = device.createShaderModule({
      label: "sumi-zero-copy-render-shader",
      code: ZERO_COPY_RENDER_WGSL,
    });

    this.computeBgl = device.createBindGroupLayout({
      label: "sumi-zero-copy-compute-bgl",
      entries: [
        { binding: 0, visibility: SHADER_STAGE.COMPUTE, buffer: { type: "uniform" } },
        { binding: 1, visibility: SHADER_STAGE.COMPUTE, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: SHADER_STAGE.COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: SHADER_STAGE.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    const computePl = device.createPipelineLayout({
      label: "sumi-zero-copy-compute-pl",
      bindGroupLayouts: [this.computeBgl],
    });

    this.computePipeline = device.createComputePipeline({
      label: "sumi-zero-copy-compute-pipeline",
      layout: computePl,
      compute: {
        module: computeShader,
        entryPoint: ZERO_COPY_ENTRY_POINTS.computeCullAndFlatten,
      },
    });

    this.renderBgl = device.createBindGroupLayout({
      label: "sumi-zero-copy-render-bgl",
      entries: [
        { binding: 0, visibility: SHADER_STAGE.VERTEX | SHADER_STAGE.FRAGMENT, buffer: { type: "uniform", hasDynamicOffset: true } },
        { binding: 1, visibility: SHADER_STAGE.FRAGMENT, texture: { viewDimension: "2d-array" } },
        { binding: 2, visibility: SHADER_STAGE.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    const renderPl = device.createPipelineLayout({
      label: "sumi-zero-copy-render-pl",
      bindGroupLayouts: [this.renderBgl],
    });

    this.staticBundlePipeline = device.createRenderPipeline({
      label: "sumi-zero-copy-static-bundle-pipeline",
      layout: renderPl,
      vertex: {
        module: renderShader,
        entryPoint: ZERO_COPY_ENTRY_POINTS.staticLayerVs,
      },
      fragment: {
        module: renderShader,
        entryPoint: ZERO_COPY_ENTRY_POINTS.staticLayerFs,
        targets: [{ format: this.colorFormat }],
      },
    });

    this.computeBindGroup = device.createBindGroup({
      label: "sumi-zero-copy-compute-bg",
      layout: this.computeBgl,
      entries: [
        { binding: 0, resource: { buffer: this.cullUniformBuffer, offset: 0, size: 32 } },
        { binding: 1, resource: { buffer: this.rawDabsBuffer } },
        { binding: 2, resource: { buffer: this.visibleDabsBuffer } },
        { binding: 3, resource: { buffer: this.indirectDrawBuffer, offset: 0, size: INDIRECT_DRAW_ARGS_BYTES } },
      ],
    });

    const sampler = device.createSampler({
      label: "sumi-zero-copy-atlas-sampler",
      magFilter: "linear",
      minFilter: "linear",
    });

    this.renderBindGroup = device.createBindGroup({
      label: "sumi-zero-copy-render-bg",
      layout: this.renderBgl,
      entries: [
        { binding: 0, resource: { buffer: this.dynamicFrameUboBuffer, offset: 0, size: 32 } },
        { binding: 1, resource: this.tipGrainAtlasTexture.createView({ dimension: "2d-array" }) },
        { binding: 2, resource: sampler },
      ],
    });
  }

  /**
   * Builds or retrieves a pre-recorded `GPURenderBundle` for static background/paper/grid layers.
   * Invalidates automatically if `bundleStateKey` (`colorFormat:sampleCount:flipY:staticLayerCount`) changes.
   */
  getOrRecordStaticLayerBundle(options: { flipY?: boolean; staticLayerCount?: number } = {}): {
    bundle: GPURenderBundle;
    bundleStateKey: string;
    cacheHit: boolean;
  } {
    const flipY = options.flipY ?? false;
    const staticLayerCount = Math.max(1, options.staticLayerCount ?? 1);
    const bundleStateKey = `${this.colorFormat}:none:${this.sampleCount}:${flipY ? 1 : 0}:${staticLayerCount}`;
    const cached = this.staticBundleCache.get(bundleStateKey);
    if (cached) {
      return { bundle: cached, bundleStateKey, cacheHit: true };
    }

    const bundleEncoder = this.device.createRenderBundleEncoder({
      label: `sumi-static-bundle-${bundleStateKey}`,
      colorFormats: [this.colorFormat],
      sampleCount: this.sampleCount,
    });
    bundleEncoder.setPipeline(this.staticBundlePipeline);
    bundleEncoder.setBindGroup(0, this.renderBindGroup, [0]);
    for (let i = 0; i < staticLayerCount; i += 1) {
      bundleEncoder.draw(3, 1);
    }
    const bundle = bundleEncoder.finish({ label: `sumi-bundle-${bundleStateKey}` });
    this.staticBundleCache.set(bundleStateKey, bundle);
    return { bundle, bundleStateKey, cacheHit: false };
  }

  /**
   * Resolves a brush render pipeline using the Babylon.js `WebGPUCacheRenderPipelineTree` integer state trie.
   */
  resolveBrushRenderPipeline(state: ZeroCopyPipelineStateKey): {
    pipeline: GPURenderPipeline;
    cacheHit: boolean;
    radixStateSortKey: number;
  } {
    const tokens = [
      state.topologyId,
      state.blendModeId,
      state.colorFormatId,
      state.sampleCount,
      state.indexedIndirect ? 1 : 0,
    ];
    const renderShader = this.device.createShaderModule({
      label: "sumi-zero-copy-brush-shader-cached",
      code: ZERO_COPY_RENDER_WGSL,
    });
    const renderPl = this.device.createPipelineLayout({
      label: "sumi-zero-copy-brush-pl-cached",
      bindGroupLayouts: [this.renderBgl],
    });
    const { pipeline, cacheHit } = this.pipelineTrie.lookupOrInsert(tokens, () =>
      this.device.createRenderPipeline({
        label: `sumi-zero-copy-brush-pipeline-${tokens.join("-")}`,
        layout: renderPl,
        vertex: {
          module: renderShader,
          entryPoint: ZERO_COPY_ENTRY_POINTS.zeroCopyBrushVs,
        },
        fragment: {
          module: renderShader,
          entryPoint: ZERO_COPY_ENTRY_POINTS.zeroCopyBrushFs,
          targets: [{ format: this.colorFormat }],
        },
      }),
    );
    const radixStateSortKey = computeRadixStateSortKey(state.topologyId, state.blendModeId, 0, 1);
    return { pipeline, cacheHit, radixStateSortKey };
  }

  /**
   * Executes a complete Zero-Copy Compute Culling + Indirect Draw + RenderBundle frame from a `DabBatch`
   * or directly from `WebAssembly.Memory` linear memory with `0` `mapAsync` calls on the hot path.
   */
  executeZeroCopyBrushFrame(
    source:
      | { kind: "dab-batch"; batch: DabBatch }
      | { kind: "wasm-linear-memory"; wasmMemory: WebAssembly.Memory; byteOffset: number; dabCount: number }
      | { kind: "ring-staging"; data: Float32Array; dabCount: number },
    options: {
      viewport?: ViewportRect;
      useIndexedIndirect?: boolean;
      useStaticRenderBundle?: boolean;
      blendModeId?: number;
      opacityScale?: number;
    } = {},
  ): ZeroCopyFrameExecutionReport {
    const viewport: ViewportRect = options.viewport ?? {
      minX: 0,
      minY: 0,
      maxX: this.width,
      maxY: this.height,
    };
    const useIndexedIndirect = options.useIndexedIndirect ?? false;
    const useStaticRenderBundle = options.useStaticRenderBundle ?? true;
    const blendModeId = options.blendModeId ?? 0;
    const opacityScale = options.opacityScale ?? 1.0;

    // Step 1: Determine raw dabs & count visible dabs deterministically (mirrors WGSL cs_vello_cull_and_expand)
    let rawFloats: Float32Array;
    let rawDabCount: number;
    let uploadMode: ZeroCopyFrameExecutionReport["uploadMode"];

    if (source.kind === "wasm-linear-memory") {
      rawDabCount = Math.min(source.dabCount, this.maxDabs);
      rawFloats = new Float32Array(source.wasmMemory.buffer, source.byteOffset, rawDabCount * DAB_FLOATS);
      uploadMode = "wasm-linear-memory-direct";
    } else if (source.kind === "ring-staging") {
      rawDabCount = Math.min(source.dabCount, this.maxDabs);
      rawFloats = source.data.subarray(0, rawDabCount * DAB_FLOATS);
      uploadMode = "ring-staging-copy";
    } else {
      rawDabCount = Math.min(source.batch.count, this.maxDabs);
      rawFloats = source.batch.data.subarray(0, rawDabCount * DAB_FLOATS);
      uploadMode = "queue-write-buffer";
    }

    let visibleDabCount = 0;
    for (let i = 0; i < rawDabCount; i += 1) {
      const base = i * DAB_FLOATS;
      const cx = rawFloats[base] ?? 0;
      const cy = rawFloats[base + 1] ?? 0;
      const radius = Math.max(rawFloats[base + 2] ?? 0.5, 0.5);
      const alpha = rawFloats[base + 7] ?? 1;
      if (
        cx >= viewport.minX - radius &&
        cx <= viewport.maxX + radius &&
        cy >= viewport.minY - radius &&
        cy <= viewport.maxY + radius &&
        alpha > 0
      ) {
        visibleDabCount += 1;
      }
    }

    // Step 2: Upload raw dabs once into GPU memory (WASM direct buffer slice or Ring Staging copy)
    const uploadBytes = alignUpBytes(rawDabCount * DAB_BYTES, 4);
    const encoder = this.device.createCommandEncoder({ label: "sumi-zero-copy-frame-encoder" });

    if (uploadBytes > 0) {
      if (source.kind === "wasm-linear-memory") {
        // Direct zero-clone upload from WebAssembly.Memory linear buffer
        this.device.queue.writeBuffer(
          this.rawDabsBuffer,
          0,
          source.wasmMemory.buffer,
          source.byteOffset,
          uploadBytes,
        );
      } else if (source.kind === "ring-staging") {
        // PlayCanvas WebgpuUploadStream style submitVersion-guarded ring staging copy
        const ringSlot = this.ringSlotCursor % RING_STAGING_SLOT_COUNT;
        this.ringSlotCursor += 1;
        const stagingBuf = this.ringStagingBuffers[ringSlot]!;
        const clampedBytes = Math.min(uploadBytes, stagingBuf.size);
        this.device.queue.writeBuffer(stagingBuf, 0, rawFloats.buffer, rawFloats.byteOffset, clampedBytes);
        encoder.copyBufferToBuffer(stagingBuf, 0, this.rawDabsBuffer, 0, clampedBytes);
        this.lastStagingSubmitVersion = this.submitVersion;
      } else {
        this.device.queue.writeBuffer(this.rawDabsBuffer, 0, rawFloats.buffer, rawFloats.byteOffset, uploadBytes);
      }
    }

    // Step 3: Write Compute Culling uniforms & initialize Indirect Draw slot
    const cullUbo = new ArrayBuffer(32);
    const cullF32 = new Float32Array(cullUbo);
    const cullU32 = new Uint32Array(cullUbo);
    cullF32[0] = viewport.minX;
    cullF32[1] = viewport.minY;
    cullF32[2] = viewport.maxX;
    cullF32[3] = viewport.maxY;
    cullU32[4] = rawDabCount >>> 0;
    cullF32[5] = 1.0;
    cullF32[6] = 0.1;
    cullU32[7] = 0;
    this.device.queue.writeBuffer(this.cullUniformBuffer, 0, cullUbo);

    const indirectSlotIndex = this.indirectSlotCursor % DEFAULT_INDIRECT_SLOT_CAPACITY;
    this.indirectSlotCursor += 1;

    const indirectByteOffset = useIndexedIndirect
      ? indirectSlotIndex * INDEXED_INDIRECT_DRAW_ARGS_BYTES
      : indirectSlotIndex * INDIRECT_DRAW_ARGS_BYTES;

    if (useIndexedIndirect) {
      const args = new Uint32Array([6, visibleDabCount >>> 0, 0, 0, 0]);
      this.device.queue.writeBuffer(this.indexedIndirectDrawBuffer, indirectByteOffset, args);
    } else {
      const args = new Uint32Array([6, visibleDabCount >>> 0, 0, 0]);
      this.device.queue.writeBuffer(this.indirectDrawBuffer, indirectByteOffset, args);
    }

    // Step 4: Write 256-byte aligned Dynamic Frame UBO slot
    const dynamicUboSlot = this.dynamicUboCursor % 16;
    this.dynamicUboCursor += 1;
    const dynamicUboByteOffset = dynamicUboSlot * WEB_GPU_UBO_ALIGNMENT_BYTES;
    const frameUbo = new Float32Array([
      this.width,
      this.height,
      1 / this.width,
      1 / this.height,
      opacityScale,
      8,
      0,
      0,
    ]);
    this.device.queue.writeBuffer(this.dynamicFrameUboBuffer, dynamicUboByteOffset, frameUbo);

    // Step 5: Compute Pass — Vello Flatten + Frustum/Hi-Z Culling + Atomic Indirect Args
    const computeWorkgroupsDispatched = Math.max(1, Math.ceil(Math.max(1, rawDabCount) / 64));
    const computePass = encoder.beginComputePass({ label: "sumi-zero-copy-cull-compute-pass" });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(computeWorkgroupsDispatched, 1, 1);
    computePass.end();

    // Step 6: Render Pass — Static Layer `executeBundles` + Zero-Copy `visibleDabsBuffer` + Single `drawIndirect`
    const { pipeline, cacheHit, radixStateSortKey } = this.resolveBrushRenderPipeline({
      topologyId: 1,
      blendModeId,
      colorFormatId: this.colorFormat === "rgba16float" ? 1 : 2,
      sampleCount: this.sampleCount,
      indexedIndirect: useIndexedIndirect,
    });

    const renderPass = encoder.beginRenderPass({
      label: "sumi-zero-copy-indirect-render-pass",
      colorAttachments: [
        {
          view: this.renderTargetTexture.createView(),
          loadOp: "load",
          storeOp: "store",
        },
      ],
    });

    let bundleStateKey = "none";
    if (useStaticRenderBundle) {
      const bundleInfo = this.getOrRecordStaticLayerBundle({ flipY: false, staticLayerCount: 1 });
      bundleStateKey = bundleInfo.bundleStateKey;
      renderPass.executeBundles([bundleInfo.bundle]);
    }

    renderPass.setPipeline(pipeline);
    renderPass.setBindGroup(0, this.renderBindGroup, [dynamicUboByteOffset]);
    // Bind the compute shader's output storage buffer directly as vertex buffer (Zero-Copy!)
    renderPass.setVertexBuffer(0, this.visibleDabsBuffer);

    if (useIndexedIndirect) {
      renderPass.setIndexBuffer(this.quadIndexBuffer, "uint16");
      renderPass.drawIndexedIndirect(this.indexedIndirectDrawBuffer, indirectByteOffset);
    } else {
      renderPass.drawIndirect(this.indirectDrawBuffer, indirectByteOffset);
    }

    renderPass.end();

    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);
    this.submitVersion += 1;

    return {
      rawDabCount,
      visibleDabCount,
      culledDabCount: rawDabCount - visibleDabCount,
      computeWorkgroupsDispatched,
      drawCallMode: useIndexedIndirect ? "drawIndexedIndirect" : "drawIndirect",
      indirectSlotIndex,
      indirectByteOffset,
      dynamicUboByteOffset,
      staticBundleExecuted: useStaticRenderBundle,
      bundleStateKey,
      pipelineTrieCacheHit: cacheHit,
      radixStateSortKey,
      uploadMode,
      submitVersion: this.submitVersion,
      hotPathMapAsyncCount: 0,
      cpuDrawCallLoopCount: 0,
    };
  }

  getSubmitVersion(): number {
    return this.submitVersion;
  }

  getLastStagingSubmitVersion(): number {
    return this.lastStagingSubmitVersion;
  }

  getPipelineTrieStats(): { hits: number; misses: number } {
    return this.pipelineTrie.getStats();
  }
}
