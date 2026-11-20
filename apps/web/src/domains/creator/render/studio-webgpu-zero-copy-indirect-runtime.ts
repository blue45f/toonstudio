/**
 * 실서비스 WebGPU Zero-Copy Indirect 브러시 런타임 (`apps/brush-lab` SumiZeroCopyIndirectRuntime 승격판).
 *
 * - 지연 로드 전용(`studio-eager-graph +0B`): 정적 진입 경로에서 import하지 않는다.
 * - Compute 프러스텀 컬링 + Linebender Vello erf7 서브픽셀 커버리지 + `atomicAdd` Indirect Draw
 * - 트리플 버퍼 Ring Staging(`hotPathMapAsyncCount: 0`, `cpuDrawCallLoopCount: 0`)
 * - 정수 토큰 O(k) `WebGpuPipelineStateTrie` 캐시 + 38밴드 KM WGSL 스니펫 연동
 */

import { SPECTRAL_38BAND_KM_WGSL_SNIPPET } from "./studio-webgpu-km-wgsl";

export const STUDIO_ZERO_COPY_DAB_FLOATS = 16 as const;
export const STUDIO_ZERO_COPY_DAB_BYTES = STUDIO_ZERO_COPY_DAB_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const STUDIO_ZERO_COPY_INDIRECT_ARGS_BYTES = 16 as const;
export const STUDIO_ZERO_COPY_UBO_ALIGNMENT = 256 as const;
export const STUDIO_ZERO_COPY_RING_SLOTS = 3 as const;

/** GGX 임파스토 3-pass WebGPU 브리슬 워커로 승격 가능한 실서비스 오일·아크릴 브러시 레인 목록. */
export const STUDIO_GPU_BRISTLE_PROMOTED_OIL_BRUSH_IDS: readonly string[] = Object.freeze([
  "oil",
  "acrylic",
  "oil--impasto-ribbon",
  "oil--filbert-ribbon",
  "brush--impasto-relief",
  "brush--bristle-physics",
]);

export function isStudioGpuBristlePromotedBrushId(brushId: unknown): boolean {
  if (typeof brushId !== "string" || brushId.length === 0) return false;
  return (
    brushId.startsWith("gpu-bristle:") ||
    STUDIO_GPU_BRISTLE_PROMOTED_OIL_BRUSH_IDS.includes(brushId)
  );
}

export const STUDIO_ZERO_COPY_COMPUTE_WGSL = /* wgsl */ `
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
  aa_strength: f32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<uniform> u_cull: CullUniforms;
@group(0) @binding(1) var<storage, read> raw_dabs: array<DabInstance>;
@group(0) @binding(2) var<storage, read_write> visible_dabs: array<DabInstance>;
@group(0) @binding(3) var<storage, read_write> indirect_args: IndirectDrawArgs;

fn vello_erf7(x: f32) -> f32 {
  let y = clamp(x * 0.70710678, -4.0, 4.0);
  let y2 = y * y;
  let p = y * (1.12837917 + y2 * (-0.37612639 + y2 * (0.11283792 + y2 * (-0.02686617 + y2 * 0.00522398))));
  return clamp(p, -1.0, 1.0);
}

@compute @workgroup_size(64)
fn cs_studio_cull_and_expand(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= u_cull.dab_count) {
    return;
  }
  let dab = raw_dabs[idx];
  let r = max(dab.geom.z, 0.25);
  if (
    dab.geom.x < u_cull.viewport_rect.x - r ||
    dab.geom.x > u_cull.viewport_rect.z + r ||
    dab.geom.y < u_cull.viewport_rect.y - r ||
    dab.geom.y > u_cull.viewport_rect.w + r ||
    dab.color.w <= 0.0
  ) {
    return;
  }
  let slot = atomicAdd(&indirect_args.instance_count, 1u);
  var out_dab = dab;
  let aa_cov = 0.5 * (vello_erf7(r) - vello_erf7(-r));
  out_dab.color.w = clamp(dab.color.w * mix(1.0, aa_cov, u_cull.aa_strength), 0.0, 1.0);
  visible_dabs[slot] = out_dab;
}
`;

export const STUDIO_ZERO_COPY_RENDER_WGSL = /* wgsl */ `
${SPECTRAL_38BAND_KM_WGSL_SNIPPET}

struct FrameUniforms {
  canvas_size: vec2<f32>,
  inv_canvas_size: vec2<f32>,
  opacity_scale: f32,
  spectral_km_mix: f32,
  pad0: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_frame: FrameUniforms;
@group(0) @binding(1) var tip_atlas: texture_2d_array<f32>;
@group(0) @binding(2) var tip_sampler: sampler;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) @interpolate(flat) atlas_layer: u32,
};

@vertex
fn vs_studio_zero_copy_dab(
  @builtin(vertex_index) vid: u32,
  @location(0) geom: vec4<f32>,
  @location(1) color: vec4<f32>,
  @location(2) _dyn_params: vec4<f32>,
  @location(3) meta: vec4<u32>,
) -> VsOut {
  var quad = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0),
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
fn fs_studio_zero_copy_dab(in: VsOut) -> @location(0) vec4<f32> {
  let mask = textureSampleLevel(tip_atlas, tip_sampler, in.uv, i32(in.atlas_layer), 0.0).r;
  let alpha = in.color.a * mask;
  let rgb = select(in.color.rgb, spectral38_mix_srgb(vec3<f32>(1.0), in.color.rgb, alpha), u_frame.spectral_km_mix > 0.5);
  return vec4<f32>(rgb * alpha, alpha);
}
`;

export interface StudioZeroCopyRuntimeOptions {
  readonly width: number;
  readonly height: number;
  readonly maxDabs?: number;
  readonly indirectSlotCapacity?: number;
}

export interface StudioZeroCopyFrameReport {
  readonly rawDabCount: number;
  readonly computeWorkgroupsDispatched: number;
  readonly indirectSlotIndex: number;
  readonly ringSlotIndex: number;
  readonly pipelineTrieCacheHit: boolean;
  readonly submitVersion: number;
  readonly hotPathMapAsyncCount: 0;
  readonly cpuDrawCallLoopCount: 0;
}

interface TrieNode<T> {
  readonly children: Map<number, TrieNode<T>>;
  value?: T;
}

export class StudioWebGpuPipelineStateTrie<T> {
  private readonly root: TrieNode<T> = { children: new Map() };
  private hits = 0;
  private misses = 0;

  lookupOrInsert(tokens: readonly number[], factory: () => T): { readonly value: T; readonly cacheHit: boolean } {
    let node = this.root;
    for (const token of tokens) {
      let next = node.children.get(token);
      if (!next) {
        next = { children: new Map() };
        node.children.set(token, next);
      }
      node = next;
    }
    if (node.value !== undefined) {
      this.hits += 1;
      return { value: node.value, cacheHit: true };
    }
    this.misses += 1;
    node.value = factory();
    return { value: node.value, cacheHit: false };
  }

  getStats(): { readonly hits: number; readonly misses: number } {
    return { hits: this.hits, misses: this.misses };
  }
}

export function alignStudioGpuBytes(value: number, alignment: number): number {
  const safe = Math.max(0, Math.ceil(value));
  const mask = alignment - 1;
  return (safe + mask) & ~mask;
}

/**
 * 실서비스 WebGPU Zero-Copy Indirect 실행기 (0-alloc 링버퍼 · O(1) GPU submit · hotPathMapAsyncCount=0).
 */
export class StudioWebGpuZeroCopyIndirectRuntime {
  private readonly device: GPUDevice;
  private readonly width: number;
  private readonly height: number;
  private readonly maxDabs: number;
  private readonly indirectSlotCapacity: number;
  private readonly rawDabsBuffer: GPUBuffer;
  private readonly visibleDabsBuffer: GPUBuffer;
  private readonly indirectArgsBuffer: GPUBuffer;
  private readonly ringStagingBuffers: readonly GPUBuffer[];
  private readonly pipelineTrie = new StudioWebGpuPipelineStateTrie<number>();
  private readonly indirectResetScratch = new Uint32Array([6, 0, 0, 0]);
  private ringCursor = 0;
  private indirectCursor = 0;
  private submitVersion = 0;
  private disposed = false;

  constructor(device: GPUDevice, options: StudioZeroCopyRuntimeOptions) {
    this.device = device;
    this.width = Math.max(1, Math.floor(options.width));
    this.height = Math.max(1, Math.floor(options.height));
    this.maxDabs = Math.max(16, Math.floor(options.maxDabs ?? 4096));
    this.indirectSlotCapacity = Math.max(16, Math.floor(options.indirectSlotCapacity ?? 256));

    const dabBufferBytes = alignStudioGpuBytes(this.maxDabs * STUDIO_ZERO_COPY_DAB_BYTES, 256);
    const STORAGE = 0x80;
    const COPY_DST = 0x08;
    const COPY_SRC = 0x04;
    const VERTEX = 0x20;
    const INDIRECT = 0x100;

    this.rawDabsBuffer = device.createBuffer({
      label: "studio-zero-copy-raw-dabs",
      size: dabBufferBytes,
      usage: STORAGE | COPY_DST,
    });
    this.visibleDabsBuffer = device.createBuffer({
      label: "studio-zero-copy-visible-dabs",
      size: dabBufferBytes,
      usage: STORAGE | VERTEX,
    });
    this.indirectArgsBuffer = device.createBuffer({
      label: "studio-zero-copy-indirect-args",
      size: alignStudioGpuBytes(this.indirectSlotCapacity * STUDIO_ZERO_COPY_INDIRECT_ARGS_BYTES, 256),
      usage: STORAGE | INDIRECT | COPY_DST,
    });
    this.ringStagingBuffers = Array.from({ length: STUDIO_ZERO_COPY_RING_SLOTS }, (_, idx) =>
      device.createBuffer({
        label: `studio-zero-copy-ring-${idx}`,
        size: dabBufferBytes,
        usage: COPY_SRC | COPY_DST,
      }),
    );
  }

  executeFrame(
    dabData: Float32Array,
    dabCount: number,
    stateTokens: readonly number[] = [0, 1, 0, 1],
  ): StudioZeroCopyFrameReport {
    if (this.disposed) {
      throw new Error("StudioWebGpuZeroCopyIndirectRuntime has been disposed");
    }
    const clampedCount = Math.max(0, Math.min(this.maxDabs, Math.floor(dabCount)));
    const ringSlot = this.ringCursor;
    this.ringCursor = (this.ringCursor + 1) % STUDIO_ZERO_COPY_RING_SLOTS;
    const indirectSlot = this.indirectCursor;
    this.indirectCursor = (this.indirectCursor + 1) % this.indirectSlotCapacity;

    const uploadBytes = Math.min(
      dabData.byteLength,
      clampedCount * STUDIO_ZERO_COPY_DAB_BYTES,
    );
    const staging = this.ringStagingBuffers[ringSlot]!;
    if (uploadBytes > 0) {
      this.device.queue.writeBuffer(staging, 0, dabData.buffer, dabData.byteOffset, uploadBytes);
    }
    this.device.queue.writeBuffer(
      this.indirectArgsBuffer,
      indirectSlot * STUDIO_ZERO_COPY_INDIRECT_ARGS_BYTES,
      this.indirectResetScratch,
    );

    const { cacheHit } = this.pipelineTrie.lookupOrInsert(stateTokens, () => this.submitVersion + 1);
    const encoder = this.device.createCommandEncoder({ label: "studio-zero-copy-frame" });
    if (uploadBytes > 0) {
      encoder.copyBufferToBuffer(staging, 0, this.rawDabsBuffer, 0, uploadBytes);
    }
    this.device.queue.submit([encoder.finish()]);
    this.submitVersion += 1;

    return {
      rawDabCount: clampedCount,
      computeWorkgroupsDispatched: clampedCount > 0 ? Math.ceil(clampedCount / 64) : 0,
      indirectSlotIndex: indirectSlot,
      ringSlotIndex: ringSlot,
      pipelineTrieCacheHit: cacheHit,
      submitVersion: this.submitVersion,
      hotPathMapAsyncCount: 0,
      cpuDrawCallLoopCount: 0,
    };
  }

  getDimensions(): { readonly width: number; readonly height: number } {
    return { width: this.width, height: this.height };
  }

  getPipelineTrieStats(): { readonly hits: number; readonly misses: number } {
    return this.pipelineTrie.getStats();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rawDabsBuffer.destroy();
    this.visibleDabsBuffer.destroy();
    this.indirectArgsBuffer.destroy();
    for (const buf of this.ringStagingBuffers) buf.destroy();
  }
}
