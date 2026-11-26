/**
 * 시선·스타일러스 중심 포비에이티드 우선순위 렌더 스케줄러, WebGPU 64바이트 멀티-인스턴싱 가상화기,
 * 그리고 스타일러스 기울기·배럴롤 기반 물리 지면 마찰 햅틱 피드백 엔진.
 *
 * - 외부 서버 호출 0회(₩0), 메인 스레드 블로킹 없는 순수 클라이언트 결정론 연산.
 * - 뷰포트 타일을 포비얼(Foveal)·파라포비얼(Parafoveal)·주변부(Peripheral) 동심원으로 분할해
 *   펜촉 주변은 1x1 풀 해상도와 LOD 0 승격을 보장하고 주변부는 점진 지연한다.
 * - 수천 개의 3D 프롭·파티클을 64바이트 WebGPU 슬랩(`INSTANCE_SLAB_STRIDE_BYTES = 64`)으로
 *   배치 압축하며, 지면 거칠기·기울기·배럴롤·압력·속도로 물리 마찰력과 햅틱/오디오 큐를 생성한다.
 */

export const INSTANCE_SLAB_STRIDE_BYTES = 64;
export const INSTANCE_SLAB_STRIDE_WORDS = 16;
export const DEFAULT_FOVEAL_TILE_SIZE_PX = 128;
export const DEFAULT_DEVICE_DPI = 264;

export type FoveatedRingKind = "foveal" | "parafoveal" | "peripheral";
export type VariableShadingRate = "1x1" | "2x1" | "2x2" | "4x4";
export type TileBudgetBucket = "immediate" | "this-frame" | "deferred-next-frame";
export type PaperSubstrateKind = "cold-press" | "hot-press" | "kent" | "canvas";
export type HapticBrushTipKind = "g-pen" | "pencil-2b" | "flat-bristle" | "charcoal" | "airbrush";
export type HapticDispatchBackend = "web-vibration" | "audio-tactile-fallback" | "throttled" | "silent";
export type Vec3Tuple = readonly [number, number, number];
export type Vec4Tuple = readonly [number, number, number, number];

export interface FoveatedScheduleInput {
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
  readonly focusX: number; readonly focusY: number;
  readonly tileSizePx?: number; readonly fovealRadiusPx?: number; readonly parafovealRadiusPx?: number;
  readonly velocityX?: number; readonly velocityY?: number; readonly lookaheadMs?: number;
  readonly maxImmediateTiles?: number;
}

export interface FoveatedTileTask {
  readonly tileId: string; readonly col: number; readonly row: number;
  readonly x: number; readonly y: number; readonly width: number; readonly height: number;
  readonly centerX: number; readonly centerY: number; readonly distanceToFocusPx: number;
  readonly ring: FoveatedRingKind; readonly priorityScore: number;
  readonly recommendedLod: 0 | 1 | 2 | 3; readonly shadingRate: VariableShadingRate;
  readonly bucket: TileBudgetBucket; readonly pixelShadingCostRatio: number;
}

export interface FoveatedTilePrioritySchedule {
  readonly cols: number; readonly rows: number; readonly tileSizePx: number;
  readonly predictedFocusX: number; readonly predictedFocusY: number;
  readonly fovealRadiusPx: number; readonly parafovealRadiusPx: number;
  readonly tiles: readonly FoveatedTileTask[];
  readonly ringCounts: Readonly<Record<FoveatedRingKind, number>>;
  readonly immediateTileCount: number; readonly deferredTileCount: number;
  readonly estimatedShadingSavingsPercent: number; readonly serverCostKrw: 0;
}

export interface InstanceTransformInput {
  readonly instanceId: string; readonly meshAssetId: string; readonly materialSlot: number;
  readonly position: Vec3Tuple; readonly rotationQuat?: Vec4Tuple; readonly scale?: Vec3Tuple;
  readonly boundingRadius?: number; readonly colorTintRgba?: Vec4Tuple; readonly baseLod?: 0 | 1 | 2 | 3;
}

export interface VirtualizerCameraContext {
  readonly cameraPosition: Vec3Tuple; readonly cameraForward: Vec3Tuple; readonly cameraUp?: Vec3Tuple;
  readonly verticalFovDeg: number; readonly nearPlane: number; readonly farPlane: number;
  readonly viewportWidthPx: number; readonly viewportHeightPx: number;
  readonly focusX: number; readonly focusY: number;
  readonly fovealRadiusPx?: number; readonly parafovealRadiusPx?: number;
  readonly lodDistances?: readonly [number, number, number];
}

export interface DecodedInstanceSlabRecord {
  readonly position: Vec3Tuple; readonly boundingRadius: number; readonly rotationQuat: Vec4Tuple;
  readonly scale: Vec3Tuple; readonly meshIndex: number; readonly materialSlot: number;
  readonly lodLevel: 0 | 1 | 2 | 3; readonly ringCode: 0 | 1 | 2;
  readonly fovealPromoted: boolean; readonly colorTintRgba: Vec4Tuple;
}

export interface MultiInstanceDrawBatch {
  readonly batchKey: string; readonly meshAssetId: string; readonly meshIndex: number;
  readonly materialSlot: number; readonly lodLevel: 0 | 1 | 2 | 3;
  readonly firstInstance: number; readonly instanceCount: number;
  readonly byteOffset: number; readonly byteLength: number; readonly fovealPromotedCount: number;
  /** WebGPU `drawIndexedIndirect` 5-word 인자 `[indexCount, instanceCount, firstIndex, baseVertex, firstInstance]`. */
  readonly indirectDrawArgs: Uint32Array;
}

export interface MultiInstanceBatchFrame {
  readonly slabBuffer: ArrayBuffer; readonly strideBytes: typeof INSTANCE_SLAB_STRIDE_BYTES;
  readonly batches: readonly MultiInstanceDrawBatch[];
  readonly totalSubmitted: number; readonly visibleCount: number; readonly culledCount: number;
  readonly fovealPromotedCount: number; readonly drawCallCount: number;
  readonly drawCallReductionRatio: number; readonly gpuMemoryBytes: number; readonly serverCostKrw: 0;
}

export interface PaperSubstrateProfile {
  readonly kind: PaperSubstrateKind; readonly labelKo: string;
  readonly baseKineticFrictionMu: number; readonly staticFrictionBoost: number;
  readonly grainFrequencyPerMm: number; readonly grainAmplitude: number;
  readonly weaveAnisotropy: number; readonly resonantClickHz: number;
}

export interface BrushTipFrictionProfile {
  readonly kind: HapticBrushTipKind; readonly stiffness: number;
  readonly contactAreaFactor: number; readonly barrelRollAnisotropy: number;
  readonly tiltEngagementGain: number;
}

export interface StylusHapticSample {
  readonly xPx: number; readonly yPx: number; readonly pressure: number;
  readonly tiltXDeg: number; readonly tiltYDeg: number; readonly twistDeg: number;
  readonly velocityPxPerSec: number; readonly timestampMs: number; readonly dpi?: number;
}

export interface TactileAudioClickCue {
  readonly carrierHz: number; readonly bandpassQ: number; readonly gainLinear: number;
  readonly transientDecayMs: number; readonly noiseMixRatio: number; readonly grainHitRateHz: number;
}

export interface HapticFrictionFrame {
  readonly substrate: PaperSubstrateKind; readonly brushTip: HapticBrushTipKind;
  readonly timestampMs: number; readonly elevationDeg: number; readonly azimuthDeg: number;
  readonly contactAreaMultiplier: number; readonly barrelRollDragFactor: number;
  readonly grainRoughnessSignal: number; readonly frictionForceN: number; readonly normalizedDrag01: number;
  readonly stickSlipBurst: boolean; readonly applePencilHapticIntensity: number;
  readonly applePencilSharpness: number; readonly vibrationPatternMs: readonly number[];
  readonly recommendedDispatchIntervalMs: number; readonly audioCue: TactileAudioClickCue;
}

export interface VibrationTargetLike {
  vibrate(pattern: number | number[]): boolean;
}

export interface HapticDispatchOptions {
  readonly vibrator?: VibrationTargetLike | null;
  readonly minIntervalMs?: number;
}

export interface HapticDispatchResult {
  readonly dispatched: boolean; readonly backend: HapticDispatchBackend;
  readonly patternMs: readonly number[]; readonly suppressedReason?: string;
}

export interface HapticBrushFrictionEngineOptions {
  readonly substrate?: PaperSubstrateKind;
  readonly brushTip?: HapticBrushTipKind;
  readonly minDispatchIntervalMs?: number;
}

/** 64바이트 인스턴스 슬랩 프러스텀 컬링 · 포비얼 LOD 승격 · Indirect Draw 카운트 누적용 WGSL 컴퓨트 셰이더. */
export const WGSL_MULTI_INSTANCE_CULL_BATCH = /* wgsl */ `
struct InstanceSlab {
  pos_radius : vec4<f32>,
  rot_quat   : vec4<f32>,
  scale_pack : vec4<f32>,
  tint_rgba  : vec4<f32>,
};

struct FovealCullUniforms {
  view_proj      : mat4x4<f32>,
  viewport_focus : vec4<f32>,
  ring_radii     : vec4<f32>,
  instance_count : u32,
  batch_count    : u32,
  _pad0          : u32,
  _pad1          : u32,
};

struct IndirectDrawArgs {
  index_count    : u32,
  instance_count : atomic<u32>,
  first_index    : u32,
  base_vertex    : i32,
  first_instance : u32,
};

@group(0) @binding(0) var<uniform> uniforms : FovealCullUniforms;
@group(0) @binding(1) var<storage, read> src_instances : array<InstanceSlab>;
@group(0) @binding(2) var<storage, read_write> dst_instances : array<InstanceSlab>;
@group(0) @binding(3) var<storage, read_write> indirect_draws : array<IndirectDrawArgs>;

@compute @workgroup_size(64)
fn cs_cull_and_promote(@builtin(global_invocation_id) gid : vec3<u32>) {
  let idx = gid.x;
  if (idx >= uniforms.instance_count) { return; }
  var inst = src_instances[idx];
  let clip = uniforms.view_proj * vec4<f32>(inst.pos_radius.xyz, 1.0);
  if (clip.w <= uniforms.ring_radii.z || clip.w >= uniforms.ring_radii.w) { return; }
  let ndc = clip.xyz / clip.w;
  let margin = clamp(inst.pos_radius.w / max(clip.w, 0.001), 0.02, 1.5);
  if (abs(ndc.x) > 1.0 + margin || abs(ndc.y) > 1.0 + margin) { return; }
  let screen_xy = vec2<f32>(
    (ndc.x * 0.5 + 0.5) * uniforms.viewport_focus.x,
    (0.5 - ndc.y * 0.5) * uniforms.viewport_focus.y
  );
  let focus_dist = distance(screen_xy, uniforms.viewport_focus.zw);
  var packed = bitcast<u32>(inst.scale_pack.w);
  let mesh_idx = packed & 0xFFFu;
  let cur_lod = (packed >> 20u) & 0x3u;
  var next_lod = cur_lod;
  var ring_code = 2u;
  var flags = (packed >> 28u) & 0xFu;
  if (focus_dist <= uniforms.ring_radii.x) {
    ring_code = 0u;
    next_lod = select(cur_lod - 1u, 0u, cur_lod == 0u);
    flags = flags | 0x3u;
  } else if (focus_dist <= uniforms.ring_radii.y) {
    ring_code = 1u;
    flags = flags | 0x1u;
  } else {
    ring_code = 2u;
    next_lod = min(cur_lod + 1u, 3u);
    flags = flags | 0x1u;
  }
  packed = (packed & 0x000FFFFFu) | (next_lod << 20u) | (ring_code << 24u) | (flags << 28u);
  inst.scale_pack.w = bitcast<f32>(packed);
  let batch_idx = min(mesh_idx * 4u + next_lod, uniforms.batch_count - 1u);
  let local_slot = atomicAdd(&indirect_draws[batch_idx].instance_count, 1u);
  let write_slot = indirect_draws[batch_idx].first_instance + local_slot;
  dst_instances[write_slot] = inst;
}
`;

export const PAPER_SUBSTRATE_PROFILES: Readonly<Record<PaperSubstrateKind, PaperSubstrateProfile>> = {
  "cold-press": {
    kind: "cold-press", labelKo: "중목 수채화지(Cold-Press)",
    baseKineticFrictionMu: 0.46, staticFrictionBoost: 0.16, grainFrequencyPerMm: 1.45,
    grainAmplitude: 0.62, weaveAnisotropy: 0.12, resonantClickHz: 680,
  },
  "hot-press": {
    kind: "hot-press", labelKo: "세목 수채화지(Hot-Press)",
    baseKineticFrictionMu: 0.27, staticFrictionBoost: 0.08, grainFrequencyPerMm: 2.85,
    grainAmplitude: 0.28, weaveAnisotropy: 0.06, resonantClickHz: 1120,
  },
  kent: {
    kind: "kent", labelKo: "만화 원고 켄트지(Kent)",
    baseKineticFrictionMu: 0.17, staticFrictionBoost: 0.05, grainFrequencyPerMm: 4.2,
    grainAmplitude: 0.14, weaveAnisotropy: 0.04, resonantClickHz: 1580,
  },
  canvas: {
    kind: "canvas", labelKo: "린넨 유화 캔버스(Canvas)",
    baseKineticFrictionMu: 0.64, staticFrictionBoost: 0.22, grainFrequencyPerMm: 0.88,
    grainAmplitude: 0.84, weaveAnisotropy: 0.58, resonantClickHz: 420,
  },
};

export const BRUSH_TIP_FRICTION_PROFILES: Readonly<Record<HapticBrushTipKind, BrushTipFrictionProfile>> = {
  "g-pen": { kind: "g-pen", stiffness: 0.92, contactAreaFactor: 0.55, barrelRollAnisotropy: 0.32, tiltEngagementGain: 0.4 },
  "pencil-2b": { kind: "pencil-2b", stiffness: 0.78, contactAreaFactor: 0.82, barrelRollAnisotropy: 0.18, tiltEngagementGain: 1.15 },
  "flat-bristle": { kind: "flat-bristle", stiffness: 0.45, contactAreaFactor: 1.25, barrelRollAnisotropy: 0.78, tiltEngagementGain: 0.72 },
  charcoal: { kind: "charcoal", stiffness: 0.65, contactAreaFactor: 1.12, barrelRollAnisotropy: 0.24, tiltEngagementGain: 1.35 },
  airbrush: { kind: "airbrush", stiffness: 0.12, contactAreaFactor: 0.15, barrelRollAnisotropy: 0.05, tiltEngagementGain: 0.1 },
};

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) { return min; }
  return v < min ? min : v > max ? max : v;
}

function normalizeVec3(v: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len <= 1e-8 ? [0, 0, -1] : [v[0] / len, v[1] / len, v[2] / len];
}

function normalizeQuat(q: Vec4Tuple): Vec4Tuple {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  return len <= 1e-8 ? [0, 0, 0, 1] : [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function crossVec3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dotVec3(a: Vec3Tuple, b: Vec3Tuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function distancePointToRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number): number {
  return Math.hypot(px - clamp(px, rx, rx + rw), py - clamp(py, ry, ry + rh));
}

/**
 * 스타일러스·시선 초점을 중심으로 뷰포트 타일을 포비얼/파라포비얼/주변부 우선순위 링으로 분할한다.
 * 빠른 스트로크 시 속도 선행 예측(`lookaheadMs`)으로 진행 방향 타일을 선제 승격한다.
 */
export function computeFoveatedTilePrioritySchedule(input: FoveatedScheduleInput): FoveatedTilePrioritySchedule {
  const viewportWidthPx = Math.max(1, Math.round(input.viewportWidthPx));
  const viewportHeightPx = Math.max(1, Math.round(input.viewportHeightPx));
  const tileSizePx = Math.max(16, Math.round(input.tileSizePx ?? DEFAULT_FOVEAL_TILE_SIZE_PX));
  const minViewportDim = Math.min(viewportWidthPx, viewportHeightPx);
  const fovealRadiusPx = Math.max(tileSizePx * 0.5, input.fovealRadiusPx ?? minViewportDim * 0.18);
  const parafovealRadiusPx = Math.max(
    fovealRadiusPx + tileSizePx * 0.75,
    input.parafovealRadiusPx ?? minViewportDim * 0.44,
  );

  const lookaheadSec = clamp(input.lookaheadMs ?? 12, 0, 50) / 1000;
  const predictedFocusX = clamp(input.focusX + (input.velocityX ?? 0) * lookaheadSec, 0, viewportWidthPx);
  const predictedFocusY = clamp(input.focusY + (input.velocityY ?? 0) * lookaheadSec, 0, viewportHeightPx);

  const cols = Math.ceil(viewportWidthPx / tileSizePx);
  const rows = Math.ceil(viewportHeightPx / tileSizePx);
  const maxDiagonal = Math.max(1, Math.hypot(viewportWidthPx, viewportHeightPx));
  const maxImmediateTiles = input.maxImmediateTiles !== undefined
    ? Math.max(1, Math.floor(input.maxImmediateTiles))
    : Math.max(4, Math.ceil(cols * rows * 0.55));

  const drafts: Array<Omit<FoveatedTileTask, "bucket">> = [];

  for (let row = 0; row < rows; row += 1) {
    const y = row * tileSizePx;
    const height = Math.min(tileSizePx, viewportHeightPx - y);
    for (let col = 0; col < cols; col += 1) {
      const x = col * tileSizePx;
      const width = Math.min(tileSizePx, viewportWidthPx - x);
      const centerX = x + width * 0.5;
      const centerY = y + height * 0.5;
      const centerDist = Math.hypot(centerX - predictedFocusX, centerY - predictedFocusY);
      const edgeDist = distancePointToRect(predictedFocusX, predictedFocusY, x, y, width, height);

      let ring: FoveatedRingKind;
      let recommendedLod: 0 | 1 | 2 | 3;
      let shadingRate: VariableShadingRate;
      let pixelShadingCostRatio: number;
      let baseRingPriority: number;

      if (edgeDist <= fovealRadiusPx) {
        ring = "foveal"; recommendedLod = 0; shadingRate = "1x1"; pixelShadingCostRatio = 1.0; baseRingPriority = 800;
      } else if (edgeDist <= parafovealRadiusPx) {
        ring = "parafoveal"; recommendedLod = 1; shadingRate = "2x2"; pixelShadingCostRatio = 0.25; baseRingPriority = 450;
      } else {
        ring = "peripheral";
        recommendedLod = centerDist > parafovealRadiusPx * 1.65 ? 3 : 2;
        shadingRate = "4x4"; pixelShadingCostRatio = 0.0625; baseRingPriority = 100;
      }

      const proximityBonus = Math.round((1 - clamp(centerDist / maxDiagonal, 0, 1)) * 200);
      drafts.push({
        tileId: `tile_${col}_${row}`, col, row, x, y, width, height, centerX, centerY,
        distanceToFocusPx: Number(centerDist.toFixed(2)),
        ring, priorityScore: clamp(baseRingPriority + proximityBonus, 1, 1000),
        recommendedLod, shadingRate, pixelShadingCostRatio,
      });
    }
  }

  drafts.sort((a, b) =>
    b.priorityScore !== a.priorityScore
      ? b.priorityScore - a.priorityScore
      : a.distanceToFocusPx !== b.distanceToFocusPx
        ? a.distanceToFocusPx - b.distanceToFocusPx
        : a.tileId.localeCompare(b.tileId),
  );

  const ringCounts: Record<FoveatedRingKind, number> = { foveal: 0, parafoveal: 0, peripheral: 0 };
  let immediateTileCount = 0;
  let deferredTileCount = 0;
  let weightedShadingWork = 0;
  let totalPixelArea = 0;

  const tiles: FoveatedTileTask[] = drafts.map((draft, index) => {
    ringCounts[draft.ring] += 1;
    const area = draft.width * draft.height;
    totalPixelArea += area;
    weightedShadingWork += area * draft.pixelShadingCostRatio;

    let bucket: TileBudgetBucket;
    if (draft.ring === "foveal") {
      bucket = "immediate"; immediateTileCount += 1;
    } else if (draft.ring === "parafoveal" && index < maxImmediateTiles) {
      bucket = "this-frame"; immediateTileCount += 1;
    } else {
      bucket = "deferred-next-frame"; deferredTileCount += 1;
    }
    return { ...draft, bucket };
  });

  const estimatedShadingSavingsPercent = totalPixelArea > 0
    ? Number((((totalPixelArea - weightedShadingWork) / totalPixelArea) * 100).toFixed(2))
    : 0;

  return {
    cols, rows, tileSizePx,
    predictedFocusX: Number(predictedFocusX.toFixed(2)),
    predictedFocusY: Number(predictedFocusY.toFixed(2)),
    fovealRadiusPx: Number(fovealRadiusPx.toFixed(2)),
    parafovealRadiusPx: Number(parafovealRadiusPx.toFixed(2)),
    tiles, ringCounts, immediateTileCount, deferredTileCount,
    estimatedShadingSavingsPercent, serverCostKrw: 0,
  };
}

/** 64바이트 WebGPU 인스턴스 슬랩에서 지정 인덱스의 바이너리 레코드를 디코딩한다. */
export function decodeInstanceSlabRecord(slabBuffer: ArrayBuffer, index: number): DecodedInstanceSlabRecord {
  const byteOffset = index * INSTANCE_SLAB_STRIDE_BYTES;
  if (byteOffset < 0 || byteOffset + INSTANCE_SLAB_STRIDE_BYTES > slabBuffer.byteLength) {
    throw new RangeError(`인스턴스 슬랩 인덱스 범위를 초과했습니다: index=${index}`);
  }
  const f32 = new Float32Array(slabBuffer, byteOffset, INSTANCE_SLAB_STRIDE_WORDS);
  const u32 = new Uint32Array(slabBuffer, byteOffset, INSTANCE_SLAB_STRIDE_WORDS);
  const packed = u32[11];
  const rawLod = (packed >>> 20) & 0x3;
  const rawRing = (packed >>> 24) & 0x3;

  return {
    position: [f32[0], f32[1], f32[2]],
    boundingRadius: f32[3],
    rotationQuat: [f32[4], f32[5], f32[6], f32[7]],
    scale: [f32[8], f32[9], f32[10]],
    meshIndex: packed & 0xfff,
    materialSlot: (packed >>> 12) & 0xff,
    lodLevel: (rawLod <= 3 ? rawLod : 3) as 0 | 1 | 2 | 3,
    ringCode: (rawRing <= 2 ? rawRing : 2) as 0 | 1 | 2,
    fovealPromoted: (((packed >>> 28) & 0xf) & 0x2) !== 0,
    colorTintRgba: [f32[12], f32[13], f32[14], f32[15]],
  };
}

interface StoredInstanceEntry {
  readonly instanceId: string; readonly meshAssetId: string; readonly meshIndex: number;
  readonly materialSlot: number; readonly position: Vec3Tuple; readonly rotationQuat: Vec4Tuple;
  readonly scale: Vec3Tuple; readonly boundingRadius: number; readonly colorTintRgba: Vec4Tuple;
  readonly baseLod: 0 | 1 | 2 | 3;
}

/**
 * 수천 개의 3D 프롭·군중·파티클을 64바이트 WebGPU 인스턴싱 슬랩과 Indirect Draw 배치로 가상화한다.
 */
export class MultiInstancingVirtualizer {
  private readonly instances = new Map<string, StoredInstanceEntry>();
  private readonly meshAssetToIndex = new Map<string, number>();
  private readonly meshIndexCounts = new Map<string, number>();

  public registerMeshIndexCount(meshAssetId: string, indexCount: number): void {
    this.ensureMeshIndex(meshAssetId);
    this.meshIndexCounts.set(meshAssetId, Math.max(3, Math.floor(indexCount)));
  }

  public upsertInstances(inputs: readonly InstanceTransformInput[]): number {
    for (let i = 0; i < inputs.length; i += 1) {
      const item = inputs[i];
      const meshIndex = this.ensureMeshIndex(item.meshAssetId);
      const scale: Vec3Tuple = item.scale ? [item.scale[0], item.scale[1], item.scale[2]] : [1, 1, 1];
      const maxScale = Math.max(Math.abs(scale[0]), Math.abs(scale[1]), Math.abs(scale[2]), 0.01);
      const tint = item.colorTintRgba ?? [1, 1, 1, 1];

      this.instances.set(item.instanceId, {
        instanceId: item.instanceId,
        meshAssetId: item.meshAssetId,
        meshIndex,
        materialSlot: clamp(Math.floor(item.materialSlot), 0, 255),
        position: [item.position[0], item.position[1], item.position[2]],
        rotationQuat: normalizeQuat(item.rotationQuat ?? [0, 0, 0, 1]),
        scale,
        boundingRadius: Math.max(0.05, item.boundingRadius ?? maxScale * 0.85),
        colorTintRgba: [clamp(tint[0], 0, 1), clamp(tint[1], 0, 1), clamp(tint[2], 0, 1), clamp(tint[3], 0, 1)],
        baseLod: item.baseLod ?? 0,
      });
    }
    return this.instances.size;
  }

  public removeInstance(instanceId: string): boolean {
    return this.instances.delete(instanceId);
  }

  public clear(): void {
    this.instances.clear();
  }

  public get instanceCount(): number {
    return this.instances.size;
  }

  /** 카메라 프러스텀 컬링 + 시선 포비얼 중심 LOD 승격 + 64바이트 슬랩 패킹을 1패스로 수행한다. */
  public buildBatchedDrawFrame(camera: VirtualizerCameraContext): MultiInstanceBatchFrame {
    const forward = normalizeVec3(camera.cameraForward);
    const upHint = normalizeVec3(camera.cameraUp ?? [0, 1, 0]);
    const rawRight = crossVec3(forward, upHint);
    const right = Math.hypot(rawRight[0], rawRight[1], rawRight[2]) > 1e-6
      ? normalizeVec3(rawRight)
      : normalizeVec3(crossVec3(forward, [1, 0, 0]));
    const up = normalizeVec3(crossVec3(right, forward));

    const viewportW = Math.max(1, camera.viewportWidthPx);
    const viewportH = Math.max(1, camera.viewportHeightPx);
    const tanHalfFovY = Math.tan(((clamp(camera.verticalFovDeg, 10, 160) * Math.PI) / 180) * 0.5);
    const tanHalfFovX = tanHalfFovY * (viewportW / viewportH);
    const nearPlane = Math.max(0.01, camera.nearPlane);
    const farPlane = Math.max(nearPlane + 1, camera.farPlane);

    const minDim = Math.min(viewportW, viewportH);
    const fovealRadiusPx = camera.fovealRadiusPx ?? minDim * 0.18;
    const parafovealRadiusPx = Math.max(fovealRadiusPx + 32, camera.parafovealRadiusPx ?? minDim * 0.44);
    const lodDistances = camera.lodDistances ?? [18, 45, 95];

    interface SurvivingEntry {
      readonly entry: StoredInstanceEntry; readonly lodLevel: 0 | 1 | 2 | 3;
      readonly ringCode: 0 | 1 | 2; readonly fovealPromoted: boolean;
    }

    const grouped = new Map<string, SurvivingEntry[]>();
    let visibleCount = 0;
    let fovealPromotedCount = 0;

    this.instances.forEach((entry) => {
      const rel: Vec3Tuple = [
        entry.position[0] - camera.cameraPosition[0],
        entry.position[1] - camera.cameraPosition[1],
        entry.position[2] - camera.cameraPosition[2],
      ];
      const viewZ = dotVec3(rel, forward);
      if (viewZ + entry.boundingRadius < nearPlane || viewZ - entry.boundingRadius > farPlane) {
        return;
      }
      const clampedZ = Math.max(nearPlane, viewZ);
      const ndcX = dotVec3(rel, right) / (clampedZ * tanHalfFovX);
      const ndcY = dotVec3(rel, up) / (clampedZ * tanHalfFovY);
      const ndcMarginX = entry.boundingRadius / (clampedZ * tanHalfFovX);
      const ndcMarginY = entry.boundingRadius / (clampedZ * tanHalfFovY);
      if (Math.abs(ndcX) > 1 + ndcMarginX || Math.abs(ndcY) > 1 + ndcMarginY) {
        return;
      }

      const screenX = (ndcX * 0.5 + 0.5) * viewportW;
      const screenY = (0.5 - ndcY * 0.5) * viewportH;
      const focusDistPx = Math.hypot(screenX - camera.focusX, screenY - camera.focusY);

      const distLod: 0 | 1 | 2 | 3 = viewZ > lodDistances[2] ? 3 : viewZ > lodDistances[1] ? 2 : viewZ > lodDistances[0] ? 1 : 0;
      const initialLod = Math.max(entry.baseLod, distLod) as 0 | 1 | 2 | 3;

      let lodLevel: 0 | 1 | 2 | 3 = initialLod;
      let ringCode: 0 | 1 | 2;
      let fovealPromoted = false;

      if (focusDistPx <= fovealRadiusPx) {
        ringCode = 0;
        if (initialLod > 0) { lodLevel = (initialLod - 1) as 0 | 1 | 2 | 3; }
        fovealPromoted = true;
        fovealPromotedCount += 1;
      } else if (focusDistPx <= parafovealRadiusPx) {
        ringCode = 1;
      } else {
        ringCode = 2;
        lodLevel = Math.min(3, initialLod + 1) as 0 | 1 | 2 | 3;
      }

      const batchKey = `${entry.meshIndex}:${entry.materialSlot}:lod${lodLevel}`;
      let bucket = grouped.get(batchKey);
      if (!bucket) { bucket = []; grouped.set(batchKey, bucket); }
      bucket.push({ entry, lodLevel, ringCode, fovealPromoted });
      visibleCount += 1;
    });

    const sortedBatchKeys = Array.from(grouped.keys()).sort();
    const slabBuffer = new ArrayBuffer(visibleCount * INSTANCE_SLAB_STRIDE_BYTES);
    const f32 = new Float32Array(slabBuffer);
    const u32 = new Uint32Array(slabBuffer);
    const batches: MultiInstanceDrawBatch[] = [];

    let cursorInstance = 0;
    for (let b = 0; b < sortedBatchKeys.length; b += 1) {
      const key = sortedBatchKeys[b];
      const list = grouped.get(key);
      if (!list || list.length === 0) { continue; }
      const firstInstance = cursorInstance;
      let batchFovealCount = 0;

      for (let i = 0; i < list.length; i += 1) {
        const item = list[i];
        const e = item.entry;
        const w = cursorInstance * INSTANCE_SLAB_STRIDE_WORDS;

        f32[w] = e.position[0]; f32[w + 1] = e.position[1]; f32[w + 2] = e.position[2]; f32[w + 3] = e.boundingRadius;
        f32[w + 4] = e.rotationQuat[0]; f32[w + 5] = e.rotationQuat[1]; f32[w + 6] = e.rotationQuat[2]; f32[w + 7] = e.rotationQuat[3];
        f32[w + 8] = e.scale[0]; f32[w + 9] = e.scale[1]; f32[w + 10] = e.scale[2];
        const flags = item.fovealPromoted ? 0x3 : 0x1;
        u32[w + 11] = ((e.meshIndex & 0xfff) | ((e.materialSlot & 0xff) << 12) | ((item.lodLevel & 0x3) << 20) | ((item.ringCode & 0x3) << 24) | ((flags & 0xf) << 28)) >>> 0;
        f32[w + 12] = e.colorTintRgba[0]; f32[w + 13] = e.colorTintRgba[1]; f32[w + 14] = e.colorTintRgba[2]; f32[w + 15] = e.colorTintRgba[3];

        if (item.fovealPromoted) { batchFovealCount += 1; }
        cursorInstance += 1;
      }

      const rep = list[0];
      const baseIndices = this.meshIndexCounts.get(rep.entry.meshAssetId) ?? 384;
      const lodIndices = Math.max(12, Math.floor(baseIndices / (1 << rep.lodLevel)));
      batches.push({
        batchKey: key, meshAssetId: rep.entry.meshAssetId, meshIndex: rep.entry.meshIndex,
        materialSlot: rep.entry.materialSlot, lodLevel: rep.lodLevel,
        firstInstance, instanceCount: list.length,
        byteOffset: firstInstance * INSTANCE_SLAB_STRIDE_BYTES,
        byteLength: list.length * INSTANCE_SLAB_STRIDE_BYTES,
        fovealPromotedCount: batchFovealCount,
        indirectDrawArgs: new Uint32Array([lodIndices, list.length, 0, 0, firstInstance]),
      });
    }

    const totalSubmitted = this.instances.size;
    return {
      slabBuffer, strideBytes: INSTANCE_SLAB_STRIDE_BYTES, batches, totalSubmitted,
      visibleCount, culledCount: totalSubmitted - visibleCount, fovealPromotedCount,
      drawCallCount: batches.length,
      drawCallReductionRatio: visibleCount > 0 ? Number((1 - batches.length / visibleCount).toFixed(4)) : 0,
      gpuMemoryBytes: slabBuffer.byteLength + batches.length * 20,
      serverCostKrw: 0,
    };
  }

  private ensureMeshIndex(meshAssetId: string): number {
    const existing = this.meshAssetToIndex.get(meshAssetId);
    if (existing !== undefined) { return existing; }
    const nextIndex = this.meshAssetToIndex.size;
    if (nextIndex > 0xfff) { throw new RangeError("메시 에셋 인덱스 슬롯(4096) 한도를 초과했습니다."); }
    this.meshAssetToIndex.set(meshAssetId, nextIndex);
    return nextIndex;
  }
}

/**
 * 스타일러스 기울기·배럴롤·필압·속도와 지면 거칠기(Cold-Press/Hot-Press/Kent/Canvas)를
 * 물리 마찰력, 마이크로 펄스 햅틱, 촉각 오디오 클릭 큐로 변환하는 엔진.
 */
export class HapticBrushFrictionEngine {
  private substrate: PaperSubstrateKind;
  private brushTip: HapticBrushTipKind;
  private readonly defaultMinIntervalMs: number;
  private lastX = 0;
  private lastY = 0;
  private hasPreviousPoint = false;
  private lastDispatchTimestampMs = -Infinity;
  private accumulatedStrokeMm = 0;

  public constructor(options: HapticBrushFrictionEngineOptions = {}) {
    this.substrate = options.substrate ?? "cold-press";
    this.brushTip = options.brushTip ?? "pencil-2b";
    this.defaultMinIntervalMs = Math.max(8, options.minDispatchIntervalMs ?? 24);
  }

  public setSubstrate(substrate: PaperSubstrateKind): void { this.substrate = substrate; }
  public setBrushTip(brushTip: HapticBrushTipKind): void { this.brushTip = brushTip; }
  public getSubstrate(): PaperSubstrateKind { return this.substrate; }
  public getBrushTip(): HapticBrushTipKind { return this.brushTip; }
  public getAccumulatedStrokeMm(): number { return Number(this.accumulatedStrokeMm.toFixed(3)); }
  public resetStroke(): void { this.hasPreviousPoint = false; this.accumulatedStrokeMm = 0; }

  /** 단일 스타일러스 포인터 샘플로부터 물리 마찰력과 햅틱·오디오 촉각 프레임을 계산한다. */
  public sampleStylusFriction(sample: StylusHapticSample): HapticFrictionFrame {
    const paper = PAPER_SUBSTRATE_PROFILES[this.substrate];
    const tip = BRUSH_TIP_FRICTION_PROFILES[this.brushTip];
    const pxToMm = 25.4 / Math.max(72, sample.dpi ?? DEFAULT_DEVICE_DPI);

    const pressure = clamp(sample.pressure, 0, 1);
    const tiltX = clamp(sample.tiltXDeg, -90, 90);
    const tiltY = clamp(sample.tiltYDeg, -90, 90);
    const tiltMagDeg = Math.min(89, Math.hypot(tiltX, tiltY));
    const elevationDeg = clamp(90 - tiltMagDeg, 1, 90);
    const azimuthRad = Math.atan2(tiltY, tiltX);
    const azimuthDeg = ((azimuthRad * 180) / Math.PI + 360) % 360;

    let strokeDirRad = azimuthRad;
    if (this.hasPreviousPoint) {
      const dxPx = sample.xPx - this.lastX;
      const dyPx = sample.yPx - this.lastY;
      const stepPx = Math.hypot(dxPx, dyPx);
      if (stepPx > 0.25) {
        strokeDirRad = Math.atan2(dyPx, dxPx);
        this.accumulatedStrokeMm += stepPx * pxToMm;
      }
    }
    this.lastX = sample.xPx;
    this.lastY = sample.yPx;
    this.hasPreviousPoint = true;

    const velocityMmPerSec = Math.max(0, sample.velocityPxPerSec) * pxToMm;
    const tiltNormalized = tiltMagDeg / 90;
    const contactAreaMultiplier = Number(
      (tip.contactAreaFactor * (1 + tiltNormalized * tip.tiltEngagementGain * (0.45 + 0.55 * pressure))).toFixed(4),
    );

    const twistRad = ((sample.twistDeg % 360) * Math.PI) / 180;
    const rollAlignment = Math.cos(2 * (twistRad - strokeDirRad));
    const barrelRollDragFactor = Number(
      (1 + tip.barrelRollAnisotropy * (0.5 - 0.5 * rollAlignment)).toFixed(4),
    );

    const xMm = sample.xPx * pxToMm;
    const yMm = sample.yPx * pxToMm;
    const omega = 2 * Math.PI * paper.grainFrequencyPerMm;
    const weaveBias = 1 + paper.weaveAnisotropy * Math.abs(Math.sin(2 * strokeDirRad));
    const grainRaw =
      (Math.sin(xMm * omega) * Math.cos(yMm * omega) * 0.65 +
        Math.sin((xMm + yMm) * omega * 0.7071) * 0.35) *
      weaveBias;
    const grainRoughnessSignal = Number(clamp(0.5 + 0.5 * grainRaw * paper.grainAmplitude, 0, 1).toFixed(4));

    const normalForceN = Math.pow(pressure, 1.15) * 4.2 * (0.75 + 0.25 * tip.stiffness);
    const stribeckDecay = Math.exp(-velocityMmPerSec / 18);
    const effectiveMu =
      (paper.baseKineticFrictionMu +
        paper.staticFrictionBoost * stribeckDecay +
        paper.grainAmplitude * 0.22 * grainRoughnessSignal) *
      barrelRollDragFactor *
      (0.75 + 0.25 * Math.min(2.2, contactAreaMultiplier));

    const motionActive = pressure > 0.01 && velocityMmPerSec > 0.25;
    const frictionForceN = motionActive ? Number((normalForceN * effectiveMu).toFixed(4)) : 0;
    const normalizedDrag01 = Number(clamp(frictionForceN / 3.2, 0, 1).toFixed(4));
    const stickSlipBurst =
      motionActive && velocityMmPerSec > 0.8 && velocityMmPerSec < 28 && grainRoughnessSignal > 0.56 && pressure > 0.2;
    const grainHitRateHz = Number(clamp(velocityMmPerSec * paper.grainFrequencyPerMm, 0, 420).toFixed(2));

    const applePencilHapticIntensity = Number(
      clamp(normalizedDrag01 * (0.62 + 0.38 * paper.grainAmplitude) + (stickSlipBurst ? 0.14 : 0), 0, 1).toFixed(4),
    );
    const applePencilSharpness = Number(
      clamp(tip.stiffness * 0.65 + (1 - Math.min(1, paper.grainAmplitude)) * 0.35, 0.05, 1).toFixed(4),
    );

    const pulseOnMs = motionActive ? Math.round(clamp(4 + applePencilHapticIntensity * 14, 4, 18)) : 0;
    const pulseGapMs = motionActive ? Math.round(clamp(1000 / Math.max(12, grainHitRateHz), 10, 42)) : 0;
    const vibrationPatternMs: readonly number[] = !motionActive
      ? []
      : stickSlipBurst
        ? [pulseOnMs, Math.max(8, Math.round(pulseGapMs * 0.6)), Math.max(4, pulseOnMs - 2)]
        : [pulseOnMs];

    const audioCue: TactileAudioClickCue = {
      carrierHz: Number(
        clamp(
          paper.resonantClickHz * (0.82 + 0.36 * Math.min(1.5, velocityMmPerSec / 120)) * (1 - 0.18 * tiltNormalized),
          180,
          4200,
        ).toFixed(1),
      ),
      bandpassQ: Number(clamp(1.8 + tip.stiffness * 4.5, 1.5, 8.0).toFixed(2)),
      gainLinear: Number(clamp(applePencilHapticIntensity * 0.32, 0, 0.35).toFixed(4)),
      transientDecayMs: Number(clamp(6 + paper.grainAmplitude * 18, 5, 28).toFixed(1)),
      noiseMixRatio: Number(clamp(0.25 + paper.grainAmplitude * 0.65, 0.2, 0.95).toFixed(3)),
      grainHitRateHz,
    };

    return {
      substrate: this.substrate, brushTip: this.brushTip, timestampMs: sample.timestampMs,
      elevationDeg: Number(elevationDeg.toFixed(2)), azimuthDeg: Number(azimuthDeg.toFixed(2)),
      contactAreaMultiplier, barrelRollDragFactor, grainRoughnessSignal, frictionForceN,
      normalizedDrag01, stickSlipBurst, applePencilHapticIntensity, applePencilSharpness,
      vibrationPatternMs,
      recommendedDispatchIntervalMs: Math.round(clamp(pulseOnMs + pulseGapMs, this.defaultMinIntervalMs, 80)),
      audioCue,
    };
  }

  /** 메인 스레드 스터터를 방지하는 쓰로틀 기반 Web Vibration / 오디오 촉각 폴백 디스패처. */
  public dispatchHapticFeedback(
    frame: HapticFrictionFrame,
    options: HapticDispatchOptions = {},
  ): HapticDispatchResult {
    if (frame.vibrationPatternMs.length === 0 || frame.applePencilHapticIntensity <= 0.02) {
      return { dispatched: false, backend: "silent", patternMs: [], suppressedReason: "below-threshold" };
    }
    const minIntervalMs = Math.max(
      this.defaultMinIntervalMs,
      options.minIntervalMs ?? frame.recommendedDispatchIntervalMs,
    );
    if (frame.timestampMs - this.lastDispatchTimestampMs < minIntervalMs) {
      return { dispatched: false, backend: "throttled", patternMs: [], suppressedReason: "interval-throttled" };
    }

    const resolvedVibrator = options.vibrator !== undefined ? options.vibrator : resolveGlobalVibrator();
    this.lastDispatchTimestampMs = frame.timestampMs;

    if (resolvedVibrator) {
      try {
        if (resolvedVibrator.vibrate(Array.from(frame.vibrationPatternMs))) {
          return { dispatched: true, backend: "web-vibration", patternMs: frame.vibrationPatternMs };
        }
      } catch {
        // 브라우저 권한·제스처 제약 시 오디오 촉각 폴백으로 전환한다.
      }
    }
    return { dispatched: true, backend: "audio-tactile-fallback", patternMs: frame.vibrationPatternMs };
  }
}

function resolveGlobalVibrator(): VibrationTargetLike | null {
  if (typeof navigator === "undefined") { return null; }
  const maybeNav = navigator as { vibrate?: (pattern: number | number[]) => boolean };
  const vibrateFn = maybeNav.vibrate;
  if (typeof vibrateFn !== "function") { return null; }
  return { vibrate: (pattern: number | number[]) => vibrateFn.call(navigator, pattern) };
}
