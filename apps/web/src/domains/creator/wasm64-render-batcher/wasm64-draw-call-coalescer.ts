/**
 * 64바이트 고정 스트라이드 바이너리 프리미티브 버퍼 기반 드로우콜 병합기(Draw-Call Coalescer).
 *
 * - 사전 할당 `ArrayBuffer` + `DataView`(리틀엔디언, 64B/프리미티브)에 직접 기록해
 *   핫 루프에서 프리미티브당 JS 객체 할당이 발생하지 않는다.
 * - `(layerOrder, pipelineId, blendMode, textureAtlasId)` 키가 같은 인접 구간 또는
 *   중간 배치와 AABB가 겹치지 않는 비겹침 프리미티브만 병합해 페인터 순서를 엄격히 보존한다.
 */

export const DRAW_PRIMITIVE_STRIDE_BYTES = 64;
export const DEFAULT_COALESCER_CAPACITY = 1024;
export const DEFAULT_MAX_LOOKBACK_BATCHES = 128;

const META_STRIDE = 8; // head, tail, count, verts, layer, pipeline, blend, atlas
const BOUNDS_STRIDE = 4; // minX, minY, maxX, maxY

export const DrawPrimitiveKind = {
  StrokeRibbon: 0, ScreentoneQuad: 1, BalloonPoly: 2, GlyphRun: 3, TileBlit: 4,
} as const;
export type DrawPrimitiveKindCode = (typeof DrawPrimitiveKind)[keyof typeof DrawPrimitiveKind];
export type DrawPrimitiveKindName =
  | "stroke-ribbon" | "screentone-quad" | "balloon-poly" | "glyph-run" | "tile-blit";

const KIND_NAME_TO_CODE: Readonly<Record<DrawPrimitiveKindName, DrawPrimitiveKindCode>> = {
  "stroke-ribbon": DrawPrimitiveKind.StrokeRibbon,
  "screentone-quad": DrawPrimitiveKind.ScreentoneQuad,
  "balloon-poly": DrawPrimitiveKind.BalloonPoly,
  "glyph-run": DrawPrimitiveKind.GlyphRun,
  "tile-blit": DrawPrimitiveKind.TileBlit,
};

export const DrawBlendMode = {
  Normal: 0, Multiply: 1, Screen: 2, Add: 3, Overlay: 4, Erase: 5,
} as const;
export type DrawBlendModeCode = (typeof DrawBlendMode)[keyof typeof DrawBlendMode];

export const DrawPrimitiveFlag = {
  None: 0, Opaque: 1 << 0, ClipMask: 1 << 1, Instanced: 1 << 2,
} as const;

export interface DrawBatchBounds {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
}

export interface DrawPrimitiveInput extends DrawBatchBounds {
  readonly kind: DrawPrimitiveKindName | DrawPrimitiveKindCode;
  readonly layerOrder: number; readonly pipelineId: number;
  readonly blendMode: DrawBlendModeCode; readonly textureAtlasId: number;
  readonly vertexCount?: number; readonly firstVertex?: number;
  readonly colorRgba8?: number; readonly flags?: number; readonly primitiveId?: number;
  readonly uvMinX?: number; readonly uvMinY?: number;
  readonly uvMaxX?: number; readonly uvMaxY?: number;
}

export interface DecodedDrawPrimitive {
  primitiveId: number; kind: DrawPrimitiveKindCode; blendMode: DrawBlendModeCode; flags: number;
  layerOrder: number; pipelineId: number; textureAtlasId: number;
  vertexCount: number; firstVertex: number; colorRgba8: number;
  minX: number; minY: number; maxX: number; maxY: number;
  uvMinX: number; uvMinY: number; uvMaxX: number; uvMaxY: number;
}

export interface CoalescedDrawBatch {
  readonly batchIndex: number; readonly layerOrder: number; readonly pipelineId: number;
  readonly blendMode: DrawBlendModeCode; readonly textureAtlasId: number;
  readonly primitiveCount: number; readonly totalVertexCount: number;
  readonly primitiveIndices: Uint32Array; readonly bounds: DrawBatchBounds;
}

export interface DrawCallCoalesceMetrics {
  readonly inputPrimitives: number; readonly outputDrawCalls: number;
  readonly stateChangesSaved: number; readonly interleavedSwitchesSaved: number;
  readonly reorderedMerges: number; readonly reductionPct: number;
  readonly bufferBytesUsed: number; readonly bufferBytesAllocated: number;
  readonly bufferReallocations: number;
}

export interface CoalesceResult {
  readonly batches: readonly CoalescedDrawBatch[];
  readonly packedPrimitiveIndices: Uint32Array;
  readonly metrics: DrawCallCoalesceMetrics;
}

export interface Wasm64DrawCallCoalescerOptions {
  readonly initialCapacity?: number;
  readonly fixedCapacity?: boolean;
  readonly maxLookbackBatches?: number;
}

interface ScratchBuffers {
  order: Int32Array; merge: Int32Array; next: Int32Array;
  meta: Int32Array; bounds: Float32Array;
}

function makeScratch(cap: number): ScratchBuffers {
  return {
    order: new Int32Array(cap), merge: new Int32Array(cap), next: new Int32Array(cap),
    meta: new Int32Array(cap * META_STRIDE), bounds: new Float32Array(cap * BOUNDS_STRIDE),
  };
}

export function resolveDrawPrimitiveKindCode(
  kind: DrawPrimitiveKindName | DrawPrimitiveKindCode,
): DrawPrimitiveKindCode {
  if (typeof kind === "number") {
    if (!Number.isInteger(kind) || kind < 0 || kind > DrawPrimitiveKind.TileBlit) {
      throw new RangeError(`유효하지 않은 프리미티브 종류 코드: ${kind}`);
    }
    return kind as DrawPrimitiveKindCode;
  }
  return KIND_NAME_TO_CODE[kind];
}

export function aabbOverlaps(
  aMinX: number, aMinY: number, aMaxX: number, aMaxY: number,
  bMinX: number, bMinY: number, bMaxX: number, bMaxY: number,
): boolean {
  return aMinX < bMaxX && aMaxX > bMinX && aMinY < bMaxY && aMaxY > bMinY;
}

export class Wasm64DrawCallCoalescer {
  private readonly fixedCapacity: boolean;
  private readonly maxLookbackBatches: number;
  private capacity: number;
  private count = 0;
  private reallocations = 0;
  private buffer: ArrayBuffer;
  private view: DataView;
  private scratch: ScratchBuffers;

  constructor(options: Wasm64DrawCallCoalescerOptions = {}) {
    const cap = options.initialCapacity ?? DEFAULT_COALESCER_CAPACITY;
    const lookback = options.maxLookbackBatches ?? DEFAULT_MAX_LOOKBACK_BATCHES;
    if (!Number.isSafeInteger(cap) || cap <= 0) {
      throw new RangeError(`initialCapacity는 양의 정수여야 합니다: ${cap}`);
    }
    if (!Number.isSafeInteger(lookback) || lookback <= 0) {
      throw new RangeError(`maxLookbackBatches는 양의 정수여야 합니다: ${lookback}`);
    }
    this.capacity = cap;
    this.fixedCapacity = options.fixedCapacity ?? false;
    this.maxLookbackBatches = lookback;
    this.buffer = new ArrayBuffer(cap * DRAW_PRIMITIVE_STRIDE_BYTES);
    this.view = new DataView(this.buffer);
    this.scratch = makeScratch(cap);
  }

  get primitiveCount(): number { return this.count; }
  get primitiveCapacity(): number { return this.capacity; }
  get byteLength(): number { return this.count * DRAW_PRIMITIVE_STRIDE_BYTES; }
  get backingBuffer(): ArrayBuffer { return this.buffer; }
  reset(): void { this.count = 0; }

  /** 핫 루프 전용 제로-할당 프리미티브 인큐(64B 리틀엔디언 바이너리 기록). */
  pushPrimitive(
    kind: DrawPrimitiveKindCode, layerOrder: number, pipelineId: number,
    blendMode: DrawBlendModeCode, textureAtlasId: number,
    minX: number, minY: number, maxX: number, maxY: number,
    vertexCount = 6, firstVertex = 0, colorRgba8 = 0xffffffff,
    flags: number = DrawPrimitiveFlag.None, primitiveId = this.count,
    uvMinX = 0, uvMinY = 0, uvMaxX = 1, uvMaxY = 1,
  ): number {
    if (this.count >= this.capacity) this.growCapacity();
    const slot = this.count;
    const b = slot * DRAW_PRIMITIVE_STRIDE_BYTES;
    const v = this.view;
    v.setUint32(b, primitiveId >>> 0, true);
    v.setUint8(b + 4, kind & 0xff);
    v.setUint8(b + 5, blendMode & 0xff);
    v.setUint16(b + 6, flags & 0xffff, true);
    v.setInt32(b + 8, layerOrder | 0, true);
    v.setUint32(b + 12, pipelineId >>> 0, true);
    v.setUint32(b + 16, textureAtlasId >>> 0, true);
    v.setUint32(b + 20, vertexCount >>> 0, true);
    v.setUint32(b + 24, firstVertex >>> 0, true);
    v.setUint32(b + 28, colorRgba8 >>> 0, true);
    v.setFloat32(b + 32, minX <= maxX ? minX : maxX, true);
    v.setFloat32(b + 36, minY <= maxY ? minY : maxY, true);
    v.setFloat32(b + 40, minX <= maxX ? maxX : minX, true);
    v.setFloat32(b + 44, minY <= maxY ? maxY : minY, true);
    v.setFloat32(b + 48, uvMinX, true);
    v.setFloat32(b + 52, uvMinY, true);
    v.setFloat32(b + 56, uvMaxX, true);
    v.setFloat32(b + 60, uvMaxY, true);
    this.count = slot + 1;
    return slot;
  }

  pushPrimitiveInput(input: DrawPrimitiveInput): number {
    return this.pushPrimitive(
      resolveDrawPrimitiveKindCode(input.kind), input.layerOrder, input.pipelineId,
      input.blendMode, input.textureAtlasId, input.minX, input.minY, input.maxX, input.maxY,
      input.vertexCount ?? 6, input.firstVertex ?? 0, input.colorRgba8 ?? 0xffffffff,
      input.flags ?? DrawPrimitiveFlag.None, input.primitiveId ?? this.count,
      input.uvMinX ?? 0, input.uvMinY ?? 0, input.uvMaxX ?? 1, input.uvMaxY ?? 1,
    );
  }

  readPrimitive(slot: number, target?: DecodedDrawPrimitive): DecodedDrawPrimitive {
    if (!Number.isInteger(slot) || slot < 0 || slot >= this.count) {
      throw new RangeError(`프리미티브 슬롯 범위 초과: ${slot} (count=${this.count})`);
    }
    const b = slot * DRAW_PRIMITIVE_STRIDE_BYTES;
    const v = this.view;
    const decoded: DecodedDrawPrimitive = {
      primitiveId: v.getUint32(b, true),
      kind: v.getUint8(b + 4) as DrawPrimitiveKindCode,
      blendMode: v.getUint8(b + 5) as DrawBlendModeCode,
      flags: v.getUint16(b + 6, true),
      layerOrder: v.getInt32(b + 8, true),
      pipelineId: v.getUint32(b + 12, true),
      textureAtlasId: v.getUint32(b + 16, true),
      vertexCount: v.getUint32(b + 20, true),
      firstVertex: v.getUint32(b + 24, true),
      colorRgba8: v.getUint32(b + 28, true),
      minX: v.getFloat32(b + 32, true), minY: v.getFloat32(b + 36, true),
      maxX: v.getFloat32(b + 40, true), maxY: v.getFloat32(b + 44, true),
      uvMinX: v.getFloat32(b + 48, true), uvMinY: v.getFloat32(b + 52, true),
      uvMaxX: v.getFloat32(b + 56, true), uvMaxY: v.getFloat32(b + 60, true),
    };
    return target ? Object.assign(target, decoded) : decoded;
  }

  coalesce(): CoalesceResult {
    const n = this.count;
    const v = this.view;
    const { order, next, meta, bounds } = this.scratch;
    let naiveSwitches = 0;
    let totalBatches = 0;
    let reorderedMerges = 0;

    if (n > 0) {
      let needsSort = false;
      let prevLayer = v.getInt32(8, true);
      order[0] = 0;
      for (let i = 1; i < n; i++) {
        order[i] = i;
        const layer = v.getInt32(i * DRAW_PRIMITIVE_STRIDE_BYTES + 8, true);
        if (layer < prevLayer) needsSort = true;
        prevLayer = layer;
      }
      if (needsSort) this.stableSortByLayer(n);

      let layerStart = 0;
      const b0 = order[0] * DRAW_PRIMITIVE_STRIDE_BYTES;
      let activeLayer = v.getInt32(b0 + 8, true);
      let pL = activeLayer;
      let pP = v.getUint32(b0 + 12, true);
      let pB = v.getUint8(b0 + 5);
      let pA = v.getUint32(b0 + 16, true);

      for (let idx = 0; idx < n; idx++) {
        const slot = order[idx];
        const base = slot * DRAW_PRIMITIVE_STRIDE_BYTES;
        const layer = v.getInt32(base + 8, true);
        const pipeline = v.getUint32(base + 12, true) | 0;
        const blend = v.getUint8(base + 5);
        const atlas = v.getUint32(base + 16, true) | 0;
        const verts = v.getUint32(base + 20, true);
        const minX = v.getFloat32(base + 32, true);
        const minY = v.getFloat32(base + 36, true);
        const maxX = v.getFloat32(base + 40, true);
        const maxY = v.getFloat32(base + 44, true);

        if (idx > 0 && (layer !== pL || (pipeline >>> 0) !== pP || blend !== pB || (atlas >>> 0) !== pA)) {
          naiveSwitches++;
        }
        pL = layer; pP = pipeline >>> 0; pB = blend; pA = atlas >>> 0;
        if (layer !== activeLayer) {
          activeLayer = layer;
          layerStart = totalBatches;
        }

        // 역방향 스캔으로 호환 배치를 탐색하되, 겹치는 중간 배치는 페인터 순서 장벽으로 차단한다.
        let target = -1;
        const minScan = Math.max(layerStart, totalBatches - this.maxLookbackBatches);
        for (let b = totalBatches - 1; b >= minScan; b--) {
          const mo = b * META_STRIDE;
          if (meta[mo + 5] === pipeline && meta[mo + 6] === blend && meta[mo + 7] === atlas) {
            target = b;
            break;
          }
          if (this.overlapsBatchPrimitives(b, minX, minY, maxX, maxY)) break;
        }

        next[slot] = -1;
        if (target >= 0) {
          if (target < totalBatches - 1) reorderedMerges++;
          const mo = target * META_STRIDE;
          const bo = target * BOUNDS_STRIDE;
          next[meta[mo + 1]] = slot;
          meta[mo + 1] = slot;
          meta[mo + 2]++;
          meta[mo + 3] = (meta[mo + 3] + verts) | 0;
          if (minX < bounds[bo]) bounds[bo] = minX;
          if (minY < bounds[bo + 1]) bounds[bo + 1] = minY;
          if (maxX > bounds[bo + 2]) bounds[bo + 2] = maxX;
          if (maxY > bounds[bo + 3]) bounds[bo + 3] = maxY;
        } else {
          const b = totalBatches++;
          const mo = b * META_STRIDE;
          const bo = b * BOUNDS_STRIDE;
          meta[mo] = slot; meta[mo + 1] = slot; meta[mo + 2] = 1; meta[mo + 3] = verts | 0;
          meta[mo + 4] = layer; meta[mo + 5] = pipeline; meta[mo + 6] = blend; meta[mo + 7] = atlas;
          bounds[bo] = minX; bounds[bo + 1] = minY; bounds[bo + 2] = maxX; bounds[bo + 3] = maxY;
        }
      }
    }

    const packed = new Uint32Array(n);
    const batches: CoalescedDrawBatch[] = new Array<CoalescedDrawBatch>(totalBatches);
    let cursor = 0;
    for (let b = 0; b < totalBatches; b++) {
      const mo = b * META_STRIDE;
      const bo = b * BOUNDS_STRIDE;
      const start = cursor;
      for (let node = meta[mo]; node !== -1; node = next[node]) packed[cursor++] = node;
      batches[b] = {
        batchIndex: b, layerOrder: meta[mo + 4], pipelineId: meta[mo + 5] >>> 0,
        blendMode: meta[mo + 6] as DrawBlendModeCode, textureAtlasId: meta[mo + 7] >>> 0,
        primitiveCount: meta[mo + 2], totalVertexCount: meta[mo + 3] >>> 0,
        primitiveIndices: packed.subarray(start, cursor),
        bounds: { minX: bounds[bo], minY: bounds[bo + 1], maxX: bounds[bo + 2], maxY: bounds[bo + 3] },
      };
    }

    return {
      batches,
      packedPrimitiveIndices: packed,
      metrics: {
        inputPrimitives: n, outputDrawCalls: totalBatches,
        stateChangesSaved: Math.max(0, n - totalBatches),
        interleavedSwitchesSaved: Math.max(0, naiveSwitches - Math.max(0, totalBatches - 1)),
        reorderedMerges, reductionPct: n === 0 ? 0 : ((n - totalBatches) / n) * 100,
        bufferBytesUsed: n * DRAW_PRIMITIVE_STRIDE_BYTES,
        bufferBytesAllocated: this.buffer.byteLength,
        bufferReallocations: this.reallocations,
      },
    };
  }

  private overlapsBatchPrimitives(
    b: number, minX: number, minY: number, maxX: number, maxY: number,
  ): boolean {
    const { meta, bounds, next } = this.scratch;
    const bo = b * BOUNDS_STRIDE;
    if (!aabbOverlaps(minX, minY, maxX, maxY, bounds[bo], bounds[bo + 1], bounds[bo + 2], bounds[bo + 3])) {
      return false;
    }
    const v = this.view;
    for (let slot = meta[b * META_STRIDE]; slot !== -1; slot = next[slot]) {
      const base = slot * DRAW_PRIMITIVE_STRIDE_BYTES;
      if (aabbOverlaps(minX, minY, maxX, maxY, v.getFloat32(base + 32, true), v.getFloat32(base + 36, true), v.getFloat32(base + 40, true), v.getFloat32(base + 44, true))) {
        return true;
      }
    }
    return false;
  }

  private stableSortByLayer(n: number): void {
    const v = this.view;
    let src = this.scratch.order;
    let dst = this.scratch.merge;
    for (let width = 1; width < n; width *= 2) {
      for (let left = 0; left < n; left += width * 2) {
        const mid = Math.min(left + width, n);
        const right = Math.min(left + width * 2, n);
        let i = left;
        let j = mid;
        let k = left;
        while (i < mid && j < right) {
          const lA = v.getInt32(src[i] * DRAW_PRIMITIVE_STRIDE_BYTES + 8, true);
          const lB = v.getInt32(src[j] * DRAW_PRIMITIVE_STRIDE_BYTES + 8, true);
          dst[k++] = lA <= lB ? src[i++] : src[j++];
        }
        while (i < mid) dst[k++] = src[i++];
        while (j < right) dst[k++] = src[j++];
      }
      const tmp = src; src = dst; dst = tmp;
    }
    if (src !== this.scratch.order) this.scratch.order.set(src.subarray(0, n));
  }

  private growCapacity(): void {
    if (this.fixedCapacity) {
      throw new RangeError(`Wasm64DrawCallCoalescer 고정 용량 초과: capacity=${this.capacity}`);
    }
    const nextCap = this.capacity * 2;
    const nextBuf = new ArrayBuffer(nextCap * DRAW_PRIMITIVE_STRIDE_BYTES);
    new Uint8Array(nextBuf).set(new Uint8Array(this.buffer));
    this.capacity = nextCap;
    this.buffer = nextBuf;
    this.view = new DataView(nextBuf);
    this.scratch = makeScratch(nextCap);
    this.reallocations++;
  }
}
