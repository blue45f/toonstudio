/**
 * 실시간 WebGPU 멀티피어 협업 타일·임시 스트로크 컴포지터 (`WebGpuCollabCompositor`).
 *
 * - 더티 사각형 병합(`coalesceDirtyRects` + `computeDirtyRectUnion`)으로 변경 영역만 갱신한다.
 * - 피어별 고유 틴트 색상이 입혀진 임시 프리뷰 스트로크 레이어와 확정 타일 레이어를 WGSL 컴퓨트 셰이더
 *   (`WGSL_COLLAB_TILE_COMPOSITE`)로 합성하고, WebGPU 미지원·디바이스 유실 시 CPU/Canvas2D로 전환한다.
 * - 기존 64B `Wasm64DrawCallCoalescer`, `Wasm64ShaderPrewarmer`, `HeapZeroGcObjectPool` 패턴을 재사용한다.
 */

import {
  DrawBlendMode, DrawPrimitiveFlag, DrawPrimitiveKind, Wasm64DrawCallCoalescer,
  type CoalesceResult, type DrawBlendModeCode,
} from "../wasm64-render-batcher/wasm64-draw-call-coalescer";
import {
  Wasm64ShaderPrewarmer, type PrewarmTaskResult, type PrewarmTelemetry,
} from "../wasm64-render-batcher/wasm64-shader-prewarmer";
import {
  computeDirtyRectUnion, type AtlasRect,
} from "../wasm64-render-batcher/wasm64-texture-atlas-packer";
import {
  GPU_BUFFER_USAGE, alignGpuBufferSize,
  type ComputeBindGroupEntryLike, type ComputeGpuBindGroupLayoutLike,
  type ComputeGpuBindGroupLike, type ComputeGpuBufferLike,
  type ComputeGpuDeviceLike, type ComputeGpuPipelineLike, type ComputeGpuShaderModuleLike,
} from "../wasm64-webgpu-compute/webgpu-compute-dispatcher";
import {
  WGSL_WORKGROUP_X, WGSL_WORKGROUP_Y, computeDispatchWorkgroups, validateWgslComputeShader,
  type DispatchWorkgroupGrid, type WgslValidationResult,
} from "../wasm64-webgpu-compute/wgsl-compute-kernels";
import { CrdtStrokeOpKind, type CrdtStrokeOp } from "../wasm64-worker-isolation/lightweight-p2p-crdt-delta";
import { DIRTY_RECT_INT32_STRIDE, HeapZeroGcObjectPool } from "./heap-zero-gc-object-pool";

export const COLLAB_COMPOSITE_UNIFORM_BYTES = 48 as const;
export const COLLAB_COMPOSITE_ENTRY_POINT = "main" as const;
export const DEFAULT_DIRTY_MERGE_MARGIN_PX = 8;
export const DEFAULT_MAX_COALESCED_DIRTY_RECTS = 16;

export function packRgba8(r: number, g: number, b: number, a = 255): number {
  const clampByte = (v: number): number => Math.max(0, Math.min(255, Math.round(v))) & 0xff;
  return (clampByte(r) | (clampByte(g) << 8) | (clampByte(b) << 16) | (clampByte(a) << 24)) >>> 0;
}

const PEER_TINT_PALETTE: readonly (readonly [number, number, number])[] = [
  [44, 128, 224], [222, 92, 68], [46, 168, 124], [186, 112, 226],
  [224, 152, 42], [54, 174, 198], [214, 86, 146], [114, 166, 56],
];

export function getPeerTintRgba8(peerId: number): number {
  const rgb = PEER_TINT_PALETTE[Math.abs(Math.trunc(peerId)) % PEER_TINT_PALETTE.length] ?? PEER_TINT_PALETTE[0]!;
  return packRgba8(rgb[0], rgb[1], rgb[2], 255);
}

/** 실시간 협업 타일 + 피어 틴트 임시 스트로크 합성용 WGSL 컴퓨트 셰이더. */
export const WGSL_COLLAB_TILE_COMPOSITE: string = /* wgsl */ `
struct CollabCompositeUniforms {
  surface_width: u32, surface_height: u32, dirty_x: u32, dirty_y: u32,
  dirty_w: u32, dirty_h: u32, peer_tint_rgba: u32, blend_mode: u32,
  tint_strength: f32, ephemeral_opacity: f32, dirty_rect_count: u32, flags: u32,
}
@group(0) @binding(0) var<uniform> params: CollabCompositeUniforms;
@group(0) @binding(1) var<storage, read> committed_pixels: array<u32>;
@group(0) @binding(2) var<storage, read> ephemeral_pixels: array<u32>;
@group(0) @binding(3) var<storage, read> dirty_rects: array<vec4<u32>>;
@group(0) @binding(4) var<storage, read_write> output_pixels: array<u32>;
var<workgroup> wg_peer_tint: vec4<f32>;

fn unpack_rgba8(p: u32) -> vec4<f32> {
  return vec4<f32>(f32(p & 0xffu), f32((p >> 8u) & 0xffu), f32((p >> 16u) & 0xffu), f32((p >> 24u) & 0xffu)) / 255.0;
}
fn pack_rgba8(c: vec4<f32>) -> u32 {
  let s = clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0;
  return u32(round(s.r)) | (u32(round(s.g)) << 8u) | (u32(round(s.b)) << 16u) | (u32(round(s.a)) << 24u);
}
fn blend_channel_rgb(dst: vec3<f32>, src: vec3<f32>, mode: u32) -> vec3<f32> {
  if (mode == 1u) { return dst * src; }
  if (mode == 2u) { return vec3<f32>(1.0) - (vec3<f32>(1.0) - dst) * (vec3<f32>(1.0) - src); }
  if (mode == 3u) { return min(vec3<f32>(1.0), dst + src); }
  if (mode == 4u) {
    let low = 2.0 * dst * src;
    let high = vec3<f32>(1.0) - 2.0 * (vec3<f32>(1.0) - dst) * (vec3<f32>(1.0) - src);
    return select(high, low, dst < vec3<f32>(0.5));
  }
  return src;
}
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lidx: u32) {
  if (lidx == 0u) { wg_peer_tint = unpack_rgba8(params.peer_tint_rgba); }
  workgroupBarrier();
  if (gid.x >= params.dirty_w || gid.y >= params.dirty_h) { return; }
  let px = params.dirty_x + gid.x;
  let py = params.dirty_y + gid.y;
  if (px >= params.surface_width || py >= params.surface_height) { return; }
  let idx = py * params.surface_width + px;
  let committed = unpack_rgba8(committed_pixels[idx]);
  let eph = unpack_rgba8(ephemeral_pixels[idx]);
  let src_a = clamp(eph.a * params.ephemeral_opacity, 0.0, 1.0);
  if (src_a <= 0.0) { output_pixels[idx] = committed_pixels[idx]; return; }
  if (params.blend_mode == 5u) {
    output_pixels[idx] = pack_rgba8(vec4<f32>(committed.rgb, committed.a * (1.0 - src_a)));
    return;
  }
  let tinted = mix(eph.rgb, wg_peer_tint.rgb, clamp(params.tint_strength, 0.0, 1.0));
  let blended = blend_channel_rgb(committed.rgb, tinted, params.blend_mode);
  let out_a = src_a + committed.a * (1.0 - src_a);
  let out_rgb = (blended * src_a + committed.rgb * committed.a * (1.0 - src_a)) / max(out_a, 1e-5);
  output_pixels[idx] = pack_rgba8(vec4<f32>(out_rgb, out_a));
}`;

export type CollabCompositorBackend = "webgpu-compute" | "cpu-canvas2d-fallback";

export interface CollabCompositeUniformParams {
  readonly surfaceWidth: number; readonly surfaceHeight: number;
  readonly dirtyX: number; readonly dirtyY: number; readonly dirtyW: number; readonly dirtyH: number;
  readonly peerTintRgba8: number; readonly blendMode: DrawBlendModeCode;
  readonly tintStrength: number; readonly ephemeralOpacity: number;
  readonly dirtyRectCount: number; readonly flags?: number;
}
export interface CollabCompositeBindGroupDescriptor {
  readonly label: string; readonly layout: ComputeGpuBindGroupLayoutLike;
  readonly entries: readonly ComputeBindGroupEntryLike[];
}
export interface CoalescedDirtyRegionReport {
  readonly inputRectCount: number; readonly outputRectCount: number;
  readonly rects: readonly AtlasRect[]; readonly union: AtlasRect | null;
  readonly dirtyPixels: number; readonly surfacePixels: number; readonly savedPixelsPct: number;
}
export interface PeerEphemeralPoint { readonly x: number; readonly y: number; readonly pressure: number; }
export interface PeerEphemeralStrokeInput {
  readonly peerId: number; readonly strokeId: number; readonly layerOrder?: number;
  readonly blendMode?: DrawBlendModeCode; readonly colorRgba8?: number; readonly tintRgba8?: number;
  readonly tintStrength?: number; readonly opacity?: number; readonly brushWidth: number;
  readonly points: readonly PeerEphemeralPoint[];
}
export interface Canvas2DBlitTargetLike {
  putImageData(
    imageData: { readonly data: Uint8ClampedArray; readonly width: number; readonly height: number },
    dx: number, dy: number, dirtyX?: number, dirtyY?: number, dirtyWidth?: number, dirtyHeight?: number,
  ): void;
}
export interface WebGpuCollabCompositorOptions {
  readonly surfaceWidth: number; readonly surfaceHeight: number; readonly tileDim?: number;
  readonly device?: ComputeGpuDeviceLike | null; readonly canvas2dTarget?: Canvas2DBlitTargetLike | null;
  readonly dirtyMergeMarginPx?: number; readonly maxCoalescedDirtyRects?: number;
  readonly objectPool?: HeapZeroGcObjectPool; readonly drawCallCoalescer?: Wasm64DrawCallCoalescer;
  readonly shaderPrewarmer?: Wasm64ShaderPrewarmer;
}
export interface CollabComposeFrameOptions {
  readonly blendMode?: DrawBlendModeCode; readonly tintStrength?: number;
  readonly ephemeralOpacity?: number; readonly primaryPeerId?: number;
  readonly forceFullSurface?: boolean; readonly mirrorCpuOutput?: boolean;
}
export interface CollabComposeFrameResult {
  readonly backend: CollabCompositorBackend; readonly executedOnGpu: boolean;
  readonly dirtyRegion: CoalescedDirtyRegionReport; readonly drawCallBatching: CoalesceResult;
  readonly workgroups: DispatchWorkgroupGrid; readonly bindGroupCacheHit: boolean;
  readonly activePeerCount: number; readonly activeEphemeralStrokes: number;
  readonly committedTileCount: number; readonly outputPixels: Uint8Array;
}
export interface CollabCompositorStats {
  readonly backend: CollabCompositorBackend; readonly frameCount: number;
  readonly gpuDispatchCount: number; readonly cpuFallbackCount: number;
  readonly bindGroupCacheHits: number; readonly bindGroupCacheMisses: number;
  readonly totalInputPrimitives: number; readonly totalOutputDrawCalls: number;
  readonly averageDrawCallReductionPct: number; readonly prewarmTelemetry: PrewarmTelemetry;
}

interface CommittedTileSlot {
  readonly key: string; readonly tileX: number; readonly tileY: number;
  readonly layerOrder: number; readonly pixels: Uint8Array;
}
interface StoredPeerStroke {
  readonly key: string; readonly peerId: number; readonly strokeId: number;
  layerOrder: number; blendMode: DrawBlendModeCode; colorRgba8: number; tintRgba8: number;
  tintStrength: number; opacity: number; brushWidth: number; points: PeerEphemeralPoint[]; bounds: AtlasRect;
}

function clampRectToSurface(r: AtlasRect, w: number, h: number): AtlasRect | null {
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.ceil(r.x + r.width)), y1 = Math.min(h, Math.ceil(r.y + r.height));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}
function rectsNear(a: AtlasRect, b: AtlasRect, m: number): boolean {
  return a.x - m <= b.x + b.width && a.x + a.width + m >= b.x && a.y - m <= b.y + b.height && a.y + a.height + m >= b.y;
}
function unionTwo(a: AtlasRect, b: AtlasRect): AtlasRect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
}

/** 다수의 더티 사각형을 근접/겹침 병합해 최소 GPU 디스패치 영역 집합으로 축약한다. */
export function coalesceDirtyRects(
  inputRects: readonly AtlasRect[],
  surfaceWidth: number,
  surfaceHeight: number,
  mergeMarginPx = DEFAULT_DIRTY_MERGE_MARGIN_PX,
  maxRects = DEFAULT_MAX_COALESCED_DIRTY_RECTS,
): CoalescedDirtyRegionReport {
  const surfacePixels = Math.max(0, surfaceWidth * surfaceHeight);
  const working: AtlasRect[] = [];
  for (const raw of inputRects) {
    const clamped = clampRectToSurface(raw, surfaceWidth, surfaceHeight);
    if (clamped) working.push(clamped);
  }
  let merged = true;
  while (merged && working.length > 1) {
    merged = false;
    for (let i = 0; i < working.length && !merged; i += 1) {
      for (let j = i + 1; j < working.length; j += 1) {
        if (rectsNear(working[i]!, working[j]!, mergeMarginPx)) {
          working[i] = unionTwo(working[i]!, working[j]!);
          working.splice(j, 1);
          merged = true;
          break;
        }
      }
    }
  }
  while (working.length > Math.max(1, maxRects)) {
    let bestI = 0, bestJ = 1, bestWaste = Number.POSITIVE_INFINITY;
    for (let i = 0; i < working.length; i += 1) {
      for (let j = i + 1; j < working.length; j += 1) {
        const u = unionTwo(working[i]!, working[j]!);
        const waste = u.width * u.height - working[i]!.width * working[i]!.height - working[j]!.width * working[j]!.height;
        if (waste < bestWaste) { bestWaste = waste; bestI = i; bestJ = j; }
      }
    }
    working[bestI] = unionTwo(working[bestI]!, working[bestJ]!);
    working.splice(bestJ, 1);
  }
  const union = computeDirtyRectUnion(working);
  let dirtyPixels = 0;
  for (const r of working) dirtyPixels += r.width * r.height;
  return {
    inputRectCount: inputRects.length, outputRectCount: working.length, rects: working, union, dirtyPixels,
    surfacePixels, savedPixelsPct: surfacePixels > 0 ? Math.max(0, ((surfacePixels - dirtyPixels) / surfacePixels) * 100) : 0,
  };
}

/** `WGSL_COLLAB_TILE_COMPOSITE` 유니폼 버퍼(48B)를 패킹한다. */
export function packCollabCompositeUniforms(p: CollabCompositeUniformParams): Uint32Array {
  const buf = new ArrayBuffer(COLLAB_COMPOSITE_UNIFORM_BYTES);
  const v = new DataView(buf);
  v.setUint32(0, p.surfaceWidth >>> 0, true); v.setUint32(4, p.surfaceHeight >>> 0, true);
  v.setUint32(8, p.dirtyX >>> 0, true); v.setUint32(12, p.dirtyY >>> 0, true);
  v.setUint32(16, p.dirtyW >>> 0, true); v.setUint32(20, p.dirtyH >>> 0, true);
  v.setUint32(24, p.peerTintRgba8 >>> 0, true); v.setUint32(28, p.blendMode >>> 0, true);
  v.setFloat32(32, p.tintStrength, true); v.setFloat32(36, p.ephemeralOpacity, true);
  v.setUint32(40, p.dirtyRectCount >>> 0, true); v.setUint32(44, (p.flags ?? 0) >>> 0, true);
  return new Uint32Array(buf);
}

/** `WGSL_COLLAB_TILE_COMPOSITE` 5-바인딩(uniform + 4 storage) 바인드 그룹 디스크립터를 조립한다. */
export function buildCollabCompositeBindGroupDescriptor(
  layout: ComputeGpuBindGroupLayoutLike,
  buffers: {
    readonly uniformBuffer: ComputeGpuBufferLike; readonly committedBuffer: ComputeGpuBufferLike;
    readonly ephemeralBuffer: ComputeGpuBufferLike; readonly dirtyRectsBuffer: ComputeGpuBufferLike;
    readonly outputBuffer: ComputeGpuBufferLike;
  },
  label = "bg:collab-tile-composite",
): CollabCompositeBindGroupDescriptor {
  return {
    label, layout,
    entries: [
      { binding: 0, resource: { buffer: buffers.uniformBuffer } },
      { binding: 1, resource: { buffer: buffers.committedBuffer } },
      { binding: 2, resource: { buffer: buffers.ephemeralBuffer } },
      { binding: 3, resource: { buffer: buffers.dirtyRectsBuffer } },
      { binding: 4, resource: { buffer: buffers.outputBuffer } },
    ],
  };
}

/** WGSL `WGSL_COLLAB_TILE_COMPOSITE`와 픽셀 단위 동일 수식으로 RGBA8 버퍼를 CPU 합성한다. */
export function compositeCollabBuffersCpu(
  committedPixels: Uint8Array,
  ephemeralPixels: Uint8Array,
  outputPixels: Uint8Array,
  p: CollabCompositeUniformParams,
): void {
  const w = p.surfaceWidth, h = p.surfaceHeight;
  const tintR = (p.peerTintRgba8 & 0xff) / 255;
  const tintG = ((p.peerTintRgba8 >>> 8) & 0xff) / 255;
  const tintB = ((p.peerTintRgba8 >>> 16) & 0xff) / 255;
  const tintStrength = Math.max(0, Math.min(1, p.tintStrength));
  const ephOpacity = Math.max(0, Math.min(1, p.ephemeralOpacity));
  const mode = p.blendMode;
  const endX = Math.min(w, p.dirtyX + p.dirtyW), endY = Math.min(h, p.dirtyY + p.dirtyH);

  for (let py = Math.max(0, p.dirtyY); py < endY; py += 1) {
    for (let px = Math.max(0, p.dirtyX); px < endX; px += 1) {
      const off = (py * w + px) * 4;
      const ephA = (ephemeralPixels[off + 3]! / 255) * ephOpacity;
      if (ephA <= 0) {
        outputPixels[off] = committedPixels[off]!; outputPixels[off + 1] = committedPixels[off + 1]!;
        outputPixels[off + 2] = committedPixels[off + 2]!; outputPixels[off + 3] = committedPixels[off + 3]!;
        continue;
      }
      const dstR = committedPixels[off]! / 255, dstG = committedPixels[off + 1]! / 255;
      const dstB = committedPixels[off + 2]! / 255, dstA = committedPixels[off + 3]! / 255;
      if (mode === DrawBlendMode.Erase) {
        outputPixels[off] = committedPixels[off]!; outputPixels[off + 1] = committedPixels[off + 1]!;
        outputPixels[off + 2] = committedPixels[off + 2]!;
        outputPixels[off + 3] = Math.round(Math.max(0, Math.min(1, dstA * (1 - ephA))) * 255);
        continue;
      }
      const rawR = ephemeralPixels[off]! / 255, rawG = ephemeralPixels[off + 1]! / 255, rawB = ephemeralPixels[off + 2]! / 255;
      const srcR = rawR + (tintR - rawR) * tintStrength;
      const srcG = rawG + (tintG - rawG) * tintStrength;
      const srcB = rawB + (tintB - rawB) * tintStrength;
      let blR = srcR, blG = srcG, blB = srcB;
      if (mode === DrawBlendMode.Multiply) { blR = dstR * srcR; blG = dstG * srcG; blB = dstB * srcB; }
      else if (mode === DrawBlendMode.Screen) { blR = 1 - (1 - dstR) * (1 - srcR); blG = 1 - (1 - dstG) * (1 - srcG); blB = 1 - (1 - dstB) * (1 - srcB); }
      else if (mode === DrawBlendMode.Add) { blR = Math.min(1, dstR + srcR); blG = Math.min(1, dstG + srcG); blB = Math.min(1, dstB + srcB); }
      else if (mode === DrawBlendMode.Overlay) {
        blR = dstR < 0.5 ? 2 * dstR * srcR : 1 - 2 * (1 - dstR) * (1 - srcR);
        blG = dstG < 0.5 ? 2 * dstG * srcG : 1 - 2 * (1 - dstG) * (1 - srcG);
        blB = dstB < 0.5 ? 2 * dstB * srcB : 1 - 2 * (1 - dstB) * (1 - srcB);
      }
      const outA = ephA + dstA * (1 - ephA);
      const safeA = Math.max(outA, 1e-5);
      outputPixels[off] = Math.round(Math.max(0, Math.min(1, (blR * ephA + dstR * dstA * (1 - ephA)) / safeA)) * 255);
      outputPixels[off + 1] = Math.round(Math.max(0, Math.min(1, (blG * ephA + dstG * dstA * (1 - ephA)) / safeA)) * 255);
      outputPixels[off + 2] = Math.round(Math.max(0, Math.min(1, (blB * ephA + dstB * dstA * (1 - ephA)) / safeA)) * 255);
      outputPixels[off + 3] = Math.round(Math.max(0, Math.min(1, outA)) * 255);
    }
  }
}

export class WebGpuCollabCompositor {
  readonly surfaceWidth: number;
  readonly surfaceHeight: number;
  readonly tileDim: number;
  readonly drawCallCoalescer: Wasm64DrawCallCoalescer;
  readonly shaderPrewarmer: Wasm64ShaderPrewarmer;
  readonly objectPool: HeapZeroGcObjectPool;

  private device: ComputeGpuDeviceLike | null;
  private readonly canvas2dTarget: Canvas2DBlitTargetLike | null;
  private readonly dirtyMergeMarginPx: number;
  private readonly maxCoalescedDirtyRects: number;
  private deviceLost = false;
  private disposed = false;
  private shaderModule: ComputeGpuShaderModuleLike | null = null;
  private pipeline: ComputeGpuPipelineLike | null = null;
  private readonly gpuBuffers = new Map<string, ComputeGpuBufferLike>();
  private readonly bindGroupCache = new Map<string, ComputeGpuBindGroupLike>();
  private readonly committedTiles = new Map<string, CommittedTileSlot>();
  private readonly ephemeralStrokes = new Map<string, StoredPeerStroke>();
  private readonly pendingDirtyRects: AtlasRect[] = [];
  private readonly committedSurface: Uint8Array;
  private readonly ephemeralSurface: Uint8Array;
  private readonly outputSurface: Uint8Array;

  private frameCount = 0;
  private gpuDispatchCount = 0;
  private cpuFallbackCount = 0;
  private bindGroupCacheHits = 0;
  private bindGroupCacheMisses = 0;
  private totalInputPrimitives = 0;
  private totalOutputDrawCalls = 0;

  constructor(options: WebGpuCollabCompositorOptions) {
    if (!Number.isSafeInteger(options.surfaceWidth) || options.surfaceWidth <= 0 || !Number.isSafeInteger(options.surfaceHeight) || options.surfaceHeight <= 0) {
      throw new RangeError(`Invalid surface size: ${options.surfaceWidth}x${options.surfaceHeight}`);
    }
    this.surfaceWidth = options.surfaceWidth;
    this.surfaceHeight = options.surfaceHeight;
    this.tileDim = options.tileDim ?? 256;
    this.device = options.device ?? null;
    this.canvas2dTarget = options.canvas2dTarget ?? null;
    this.dirtyMergeMarginPx = options.dirtyMergeMarginPx ?? DEFAULT_DIRTY_MERGE_MARGIN_PX;
    this.maxCoalescedDirtyRects = options.maxCoalescedDirtyRects ?? DEFAULT_MAX_COALESCED_DIRTY_RECTS;
    this.drawCallCoalescer = options.drawCallCoalescer ?? new Wasm64DrawCallCoalescer({ initialCapacity: 512 });
    this.shaderPrewarmer = options.shaderPrewarmer ?? new Wasm64ShaderPrewarmer({ autoStart: false });
    this.objectPool = options.objectPool ?? new HeapZeroGcObjectPool();

    const surfaceBytes = this.surfaceWidth * this.surfaceHeight * 4;
    this.committedSurface = new Uint8Array(surfaceBytes);
    this.ephemeralSurface = new Uint8Array(surfaceBytes);
    this.outputSurface = new Uint8Array(surfaceBytes);
    if (this.device?.lost) void this.device.lost.then(() => { this.markDeviceLost(); });
  }

  getActiveBackend(): CollabCompositorBackend {
    return this.device && !this.deviceLost && !this.disposed ? "webgpu-compute" : "cpu-canvas2d-fallback";
  }
  validateShaderSource(): WgslValidationResult {
    return validateWgslComputeShader(WGSL_COLLAB_TILE_COMPOSITE, COLLAB_COMPOSITE_ENTRY_POINT);
  }
  markDeviceLost(): void { this.deviceLost = true; this.releaseGpuResources(); }
  markDirtyRect(rect: AtlasRect): void {
    const c = clampRectToSurface(rect, this.surfaceWidth, this.surfaceHeight);
    if (c) this.pendingDirtyRects.push(c);
  }

  async prewarmPipelines(): Promise<PrewarmTaskResult<ComputeGpuPipelineLike | "cpu-fallback">> {
    const taskPromise = this.shaderPrewarmer.enqueue<ComputeGpuPipelineLike | "cpu-fallback">({
      id: "wgsl:collab-tile-composite", kind: "wgsl-compute", priority: "critical", estimatedMs: 1.0,
      compile: async () => {
        const v = this.validateShaderSource();
        if (!v.valid) throw new Error(`Invalid WGSL collab composite shader: ${v.errors.join("; ")}`);
        return this.getActiveBackend() === "webgpu-compute" ? this.ensurePipeline() : "cpu-fallback";
      },
      fallback: () => "cpu-fallback",
    });
    await this.shaderPrewarmer.drain();
    return taskPromise;
  }

  setCommittedTile(tileX: number, tileY: number, pixels: Uint8Array, layerOrder = 0): void {
    const expected = this.tileDim * this.tileDim * 4;
    if (pixels.byteLength !== expected) throw new RangeError(`Expected ${expected}B committed tile, got ${pixels.byteLength}B`);
    const key = `${layerOrder}:${tileX}:${tileY}`;
    let slot = this.committedTiles.get(key);
    if (!slot) { slot = { key, tileX, tileY, layerOrder, pixels: new Uint8Array(expected) }; this.committedTiles.set(key, slot); }
    slot.pixels.set(pixels);
    const ox = tileX * this.tileDim, oy = tileY * this.tileDim;
    const cw = Math.max(0, Math.min(this.tileDim, this.surfaceWidth - ox));
    const ch = Math.max(0, Math.min(this.tileDim, this.surfaceHeight - oy));
    if (cw > 0 && ch > 0 && ox >= 0 && oy >= 0) {
      for (let row = 0; row < ch; row += 1) {
        const sOff = row * this.tileDim * 4;
        this.committedSurface.set(pixels.subarray(sOff, sOff + cw * 4), ((oy + row) * this.surfaceWidth + ox) * 4);
      }
      this.markDirtyRect({ x: ox, y: oy, width: cw, height: ch });
    }
  }

  upsertEphemeralStroke(input: PeerEphemeralStrokeInput): AtlasRect {
    const key = `${input.peerId}:${input.strokeId}`;
    const prev = this.ephemeralStrokes.get(key);
    if (prev) this.markDirtyRect(prev.bounds);
    const bounds = this.computeStrokeBounds(input.points, input.brushWidth);
    const tint = input.tintRgba8 ?? getPeerTintRgba8(input.peerId);
    this.ephemeralStrokes.set(key, {
      key, peerId: input.peerId, strokeId: input.strokeId, layerOrder: input.layerOrder ?? 100,
      blendMode: input.blendMode ?? DrawBlendMode.Normal, colorRgba8: input.colorRgba8 ?? tint,
      tintRgba8: tint, tintStrength: input.tintStrength ?? 0.45, opacity: input.opacity ?? 0.9,
      brushWidth: Math.max(1, input.brushWidth), points: [...input.points], bounds,
    });
    this.markDirtyRect(bounds);
    return bounds;
  }

  applyCrdtStrokeOp(op: CrdtStrokeOp): void {
    const key = `${op.peerId}:${op.strokeId}`;
    if (op.kind === CrdtStrokeOpKind.StrokeUndo || op.kind === CrdtStrokeOpKind.StrokeEnd) {
      const existing = this.ephemeralStrokes.get(key);
      if (existing) { this.markDirtyRect(existing.bounds); this.ephemeralStrokes.delete(key); }
      return;
    }
    if (op.kind === CrdtStrokeOpKind.LayerClear) {
      for (const [k, s] of this.ephemeralStrokes) if (s.layerOrder === op.layerIndex) { this.markDirtyRect(s.bounds); this.ephemeralStrokes.delete(k); }
      return;
    }
    const existing = this.ephemeralStrokes.get(key);
    const pt = { x: op.x, y: op.y, pressure: op.pressure };
    this.upsertEphemeralStroke({
      peerId: op.peerId, strokeId: op.strokeId, layerOrder: op.layerIndex + 100,
      brushWidth: Math.max(1, op.brushWidth), points: existing ? [...existing.points, pt] : [pt],
    });
  }

  clearPeerEphemeralStrokes(peerId: number): number {
    let removed = 0;
    for (const [k, s] of this.ephemeralStrokes) {
      if (s.peerId === peerId) { this.markDirtyRect(s.bounds); this.ephemeralStrokes.delete(k); removed += 1; }
    }
    return removed;
  }

  async composeFrame(options: CollabComposeFrameOptions = {}): Promise<CollabComposeFrameResult> {
    const rawDirty = options.forceFullSurface
      ? [{ x: 0, y: 0, width: this.surfaceWidth, height: this.surfaceHeight }]
      : this.pendingDirtyRects.splice(0, this.pendingDirtyRects.length);
    const dirtyRegion = coalesceDirtyRects(rawDirty, this.surfaceWidth, this.surfaceHeight, this.dirtyMergeMarginPx, this.maxCoalescedDirtyRects);
    const drawCallBatching = this.buildCoalescedDrawBatches();
    this.totalInputPrimitives += drawCallBatching.metrics.inputPrimitives;
    this.totalOutputDrawCalls += drawCallBatching.metrics.outputDrawCalls;

    const primaryPeerId = options.primaryPeerId ?? this.ephemeralStrokes.values().next().value?.peerId ?? 0;
    const { dirtyRectU32, unionRect } = this.objectPool.withFrameScope((scope) => {
      const rectCount = Math.max(1, dirtyRegion.rects.length);
      const packedInt32 = scope.acquireDirtyRects(rectCount, "compositor:dirty-rects");
      const outU32 = new Uint32Array(rectCount * DIRTY_RECT_INT32_STRIDE);
      for (let i = 0; i < dirtyRegion.rects.length; i += 1) {
        const r = dirtyRegion.rects[i]!, base = i * DIRTY_RECT_INT32_STRIDE;
        packedInt32[base] = r.x; packedInt32[base + 1] = r.y; packedInt32[base + 2] = r.x + r.width; packedInt32[base + 3] = r.y + r.height;
        outU32[base] = r.x >>> 0; outU32[base + 1] = r.y >>> 0; outU32[base + 2] = r.width >>> 0; outU32[base + 3] = r.height >>> 0;
      }
      this.rasterizeEphemeralLayer(dirtyRegion.rects);
      return { dirtyRectU32: outU32, unionRect: dirtyRegion.union };
    });

    const activePeers = new Set<number>();
    for (const s of this.ephemeralStrokes.values()) activePeers.add(s.peerId);
    if (!unionRect) {
      this.frameCount += 1;
      return {
        backend: this.getActiveBackend(), executedOnGpu: false, dirtyRegion, drawCallBatching,
        workgroups: computeDispatchWorkgroups(0, 0, WGSL_WORKGROUP_X, WGSL_WORKGROUP_Y),
        bindGroupCacheHit: false, activePeerCount: activePeers.size,
        activeEphemeralStrokes: this.ephemeralStrokes.size, committedTileCount: this.committedTiles.size, outputPixels: this.outputSurface,
      };
    }

    const uniformParams: CollabCompositeUniformParams = {
      surfaceWidth: this.surfaceWidth, surfaceHeight: this.surfaceHeight,
      dirtyX: unionRect.x, dirtyY: unionRect.y, dirtyW: unionRect.width, dirtyH: unionRect.height,
      peerTintRgba8: getPeerTintRgba8(primaryPeerId), blendMode: options.blendMode ?? DrawBlendMode.Normal,
      tintStrength: options.tintStrength ?? 0.45, ephemeralOpacity: options.ephemeralOpacity ?? 1.0,
      dirtyRectCount: dirtyRegion.outputRectCount, flags: 0,
    };
    const workgroups = computeDispatchWorkgroups(unionRect.width, unionRect.height, WGSL_WORKGROUP_X, WGSL_WORKGROUP_Y);
    let executedOnGpu = false;
    let bindGroupCacheHit = false;

    if (this.getActiveBackend() === "webgpu-compute" && this.device) {
      try {
        bindGroupCacheHit = (await this.dispatchWebGpuComposite(uniformParams, dirtyRectU32, workgroups)).bindGroupCacheHit;
        executedOnGpu = true;
        this.gpuDispatchCount += 1;
        if (options.mirrorCpuOutput) this.compositeDirtyRectsOnCpu(dirtyRegion.rects, uniformParams);
      } catch {
        this.markDeviceLost();
      }
    }
    if (!executedOnGpu) {
      this.compositeDirtyRectsOnCpu(dirtyRegion.rects, uniformParams);
      this.blitToCanvas2D(dirtyRegion.rects);
      this.cpuFallbackCount += 1;
    }

    this.frameCount += 1;
    return {
      backend: executedOnGpu ? "webgpu-compute" : "cpu-canvas2d-fallback", executedOnGpu, dirtyRegion,
      drawCallBatching, workgroups, bindGroupCacheHit, activePeerCount: activePeers.size,
      activeEphemeralStrokes: this.ephemeralStrokes.size, committedTileCount: this.committedTiles.size, outputPixels: this.outputSurface,
    };
  }

  getStats(): CollabCompositorStats {
    return {
      backend: this.getActiveBackend(), frameCount: this.frameCount, gpuDispatchCount: this.gpuDispatchCount,
      cpuFallbackCount: this.cpuFallbackCount, bindGroupCacheHits: this.bindGroupCacheHits,
      bindGroupCacheMisses: this.bindGroupCacheMisses, totalInputPrimitives: this.totalInputPrimitives,
      totalOutputDrawCalls: this.totalOutputDrawCalls,
      averageDrawCallReductionPct: this.totalInputPrimitives > 0 ? ((this.totalInputPrimitives - this.totalOutputDrawCalls) / this.totalInputPrimitives) * 100 : 0,
      prewarmTelemetry: this.shaderPrewarmer.getTelemetry(),
    };
  }

  dispose(): void { this.disposed = true; this.releaseGpuResources(); this.device = null; }

  private buildCoalescedDrawBatches(): CoalesceResult {
    this.drawCallCoalescer.reset();
    for (const tile of this.committedTiles.values()) {
      const x0 = tile.tileX * this.tileDim, y0 = tile.tileY * this.tileDim;
      this.drawCallCoalescer.pushPrimitive(DrawPrimitiveKind.TileBlit, tile.layerOrder, 1, DrawBlendMode.Normal, 1, x0, y0, x0 + this.tileDim, y0 + this.tileDim, 6, 0, 0xffffffff, DrawPrimitiveFlag.Opaque);
    }
    for (const s of this.ephemeralStrokes.values()) {
      const r = s.brushWidth * 0.5;
      for (const pt of s.points) {
        this.drawCallCoalescer.pushPrimitive(DrawPrimitiveKind.StrokeRibbon, s.layerOrder, 2, s.blendMode, 2, pt.x - r, pt.y - r, pt.x + r, pt.y + r, 6, 0, s.tintRgba8, DrawPrimitiveFlag.Instanced);
      }
    }
    return this.drawCallCoalescer.coalesce();
  }

  private rasterizeEphemeralLayer(dirtyRects: readonly AtlasRect[]): void {
    for (const rect of dirtyRects) {
      const xEnd = Math.min(this.surfaceWidth, rect.x + rect.width);
      const yEnd = Math.min(this.surfaceHeight, rect.y + rect.height);
      for (let y = rect.y; y < yEnd; y += 1) {
        const sOff = (y * this.surfaceWidth + rect.x) * 4;
        this.ephemeralSurface.fill(0, sOff, sOff + (xEnd - rect.x) * 4);
      }
    }
    for (const s of this.ephemeralStrokes.values()) {
      const r = s.colorRgba8 & 0xff, g = (s.colorRgba8 >>> 8) & 0xff, b = (s.colorRgba8 >>> 16) & 0xff;
      const alphaByte = Math.round(Math.max(0, Math.min(1, (((s.colorRgba8 >>> 24) & 0xff) / 255) * s.opacity)) * 255);
      for (const pt of s.points) {
        const radius = Math.max(0.5, s.brushWidth * 0.5 * Math.max(0.2, pt.pressure));
        const rCeil = Math.ceil(radius), cx = Math.round(pt.x), cy = Math.round(pt.y), rSq = radius * radius;
        for (let py = Math.max(0, cy - rCeil); py <= Math.min(this.surfaceHeight - 1, cy + rCeil); py += 1) {
          for (let px = Math.max(0, cx - rCeil); px <= Math.min(this.surfaceWidth - 1, cx + rCeil); px += 1) {
            if ((px - pt.x) ** 2 + (py - pt.y) ** 2 > rSq) continue;
            const off = (py * this.surfaceWidth + px) * 4;
            if (alphaByte >= this.ephemeralSurface[off + 3]!) {
              this.ephemeralSurface[off] = r; this.ephemeralSurface[off + 1] = g;
              this.ephemeralSurface[off + 2] = b; this.ephemeralSurface[off + 3] = alphaByte;
            }
          }
        }
      }
    }
  }

  private compositeDirtyRectsOnCpu(dirtyRects: readonly AtlasRect[], base: CollabCompositeUniformParams): void {
    for (const r of dirtyRects) {
      compositeCollabBuffersCpu(this.committedSurface, this.ephemeralSurface, this.outputSurface, {
        ...base, dirtyX: r.x, dirtyY: r.y, dirtyW: r.width, dirtyH: r.height,
      });
    }
  }

  private blitToCanvas2D(dirtyRects: readonly AtlasRect[]): void {
    if (!this.canvas2dTarget) return;
    const img = {
      data: new Uint8ClampedArray(this.outputSurface.buffer, this.outputSurface.byteOffset, this.outputSurface.byteLength),
      width: this.surfaceWidth, height: this.surfaceHeight,
    };
    for (const r of dirtyRects) this.canvas2dTarget.putImageData(img, 0, 0, r.x, r.y, r.width, r.height);
  }

  private async ensurePipeline(): Promise<ComputeGpuPipelineLike> {
    if (this.pipeline) return this.pipeline;
    if (!this.device) throw new Error("WebGPU device unavailable");
    this.shaderModule ??= this.device.createShaderModule({ code: WGSL_COLLAB_TILE_COMPOSITE, label: "wgsl:collab-tile-composite" });
    const desc = { label: "pipeline:collab-tile-composite", layout: "auto" as const, compute: { module: this.shaderModule, entryPoint: COLLAB_COMPOSITE_ENTRY_POINT } };
    if (typeof this.device.createComputePipelineAsync === "function") this.pipeline = await this.device.createComputePipelineAsync(desc);
    else if (typeof this.device.createComputePipeline === "function") this.pipeline = this.device.createComputePipeline(desc);
    else throw new Error("GPUDevice missing createComputePipelineAsync / createComputePipeline");
    return this.pipeline;
  }

  private ensureGpuBuffer(name: string, minBytes: number, usage: number): ComputeGpuBufferLike {
    const active = this.device!, aligned = alignGpuBufferSize(minBytes), existing = this.gpuBuffers.get(name);
    if (existing && existing.size >= aligned && existing.usage === usage) return existing;
    if (existing) { existing.destroy(); this.bindGroupCache.clear(); }
    const created = active.createBuffer({ size: aligned, usage, label: `collab:${name}` });
    this.gpuBuffers.set(name, created);
    return created;
  }

  private async dispatchWebGpuComposite(
    uniformParams: CollabCompositeUniformParams, dirtyRectU32: Uint32Array, workgroups: DispatchWorkgroupGrid,
  ): Promise<{ readonly bindGroupCacheHit: boolean }> {
    const active = this.device!, pipeline = await this.ensurePipeline();
    const uniformData = packCollabCompositeUniforms(uniformParams);
    const uniformBuffer = this.ensureGpuBuffer("uniform", uniformData.byteLength, GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST);
    const committedBuffer = this.ensureGpuBuffer("committed", this.committedSurface.byteLength, GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST);
    const ephemeralBuffer = this.ensureGpuBuffer("ephemeral", this.ephemeralSurface.byteLength, GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST);
    const dirtyRectsBuffer = this.ensureGpuBuffer("dirty-rects", Math.max(16, dirtyRectU32.byteLength), GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_DST);
    const outputBuffer = this.ensureGpuBuffer("output", this.outputSurface.byteLength, GPU_BUFFER_USAGE.STORAGE | GPU_BUFFER_USAGE.COPY_SRC);

    active.queue.writeBuffer(uniformBuffer, 0, uniformData.buffer, uniformData.byteOffset, uniformData.byteLength);
    active.queue.writeBuffer(committedBuffer, 0, this.committedSurface.buffer, this.committedSurface.byteOffset, this.committedSurface.byteLength);
    active.queue.writeBuffer(ephemeralBuffer, 0, this.ephemeralSurface.buffer, this.ephemeralSurface.byteOffset, this.ephemeralSurface.byteLength);
    active.queue.writeBuffer(dirtyRectsBuffer, 0, dirtyRectU32.buffer, dirtyRectU32.byteOffset, dirtyRectU32.byteLength);

    const bgKey = `${uniformBuffer.size}:${committedBuffer.size}:${ephemeralBuffer.size}:${dirtyRectsBuffer.size}:${outputBuffer.size}`;
    let bindGroup = this.bindGroupCache.get(bgKey);
    let bindGroupCacheHit = false;
    if (bindGroup) { bindGroupCacheHit = true; this.bindGroupCacheHits += 1; }
    else {
      bindGroup = active.createBindGroup(buildCollabCompositeBindGroupDescriptor(pipeline.getBindGroupLayout(0), {
        uniformBuffer, committedBuffer, ephemeralBuffer, dirtyRectsBuffer, outputBuffer,
      }));
      this.bindGroupCache.set(bgKey, bindGroup);
      this.bindGroupCacheMisses += 1;
    }

    const enc = active.createCommandEncoder({ label: "enc:collab-tile-composite" });
    const pass = enc.beginComputePass({ label: "pass:collab-tile-composite" });
    pass.setPipeline(pipeline); pass.setBindGroup(0, bindGroup);
    if (workgroups.totalWorkgroups > 0) pass.dispatchWorkgroups(workgroups.x, workgroups.y, workgroups.z);
    pass.end();
    active.queue.submit([enc.finish()]);
    return { bindGroupCacheHit };
  }

  private computeStrokeBounds(points: readonly PeerEphemeralPoint[], brushWidth: number): AtlasRect {
    if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    const pad = Math.ceil(Math.max(1, brushWidth * 0.5)) + 2;
    let minX = points[0]!.x, minY = points[0]!.y, maxX = minX, maxY = minY;
    for (let i = 1; i < points.length; i += 1) {
      const pt = points[i]!;
      if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
    }
    return { x: Math.floor(minX - pad), y: Math.floor(minY - pad), width: Math.ceil(maxX - minX + pad * 2), height: Math.ceil(maxY - minY + pad * 2) };
  }

  private releaseGpuResources(): void {
    for (const buf of this.gpuBuffers.values()) buf.destroy();
    this.gpuBuffers.clear(); this.bindGroupCache.clear(); this.pipeline = null; this.shaderModule = null;
  }
}

export function createWebGpuCollabCompositor(options: WebGpuCollabCompositorOptions): WebGpuCollabCompositor {
  return new WebGpuCollabCompositor(options);
}
