/**
 * 1만+ 오브젝트 단일 드로우 콜 GPU 인스턴싱 · SAH Flat-BVH 공간 분할 · 논문 기반 WebGPU/WASM64 코어.
 *
 * - Flat TypedArray SoA 단일 연속 `ArrayBuffer` 아레나로 JS GC 정지 0ms 및 WASM32/WASM64 Zero-Copy 공유를 보장한다.
 * - 2D 둘레 기반 Binned SAH 반복형 Flat-BVH(`buildFlatBvh2d`)로 O(log N) 뷰포트 컬링·포인터 히트 테스트를 수행한다.
 * - 32-byte 정렬 GPU 인스턴스(8 floats/instance)와 `drawIndexedIndirect`/`drawIndirect` 인자를 패킹한다.
 * - 5대 그래픽스 논문(Kubelka-Munk, MoXi, Wetbrush, Loop-Blinn, Vello/Piet-GPU) 파이프라인을 이론 복잡도·바이트 공식으로 명세한다.
 */

export const INSTANCED_OBJECT_STRIDE_FLOATS = 8 as const;
export const INSTANCED_OBJECT_STRIDE_BYTES = 32 as const;
export const FLAT_BVH_NODE_BOUNDS_FLOATS = 4 as const;
export const FLAT_BVH_NODE_TOPO_U32S = 4 as const;
export const FLAT_BVH_NODE_TOTAL_BYTES = 32 as const;
export const FLAT_BVH_NO_PARENT = 0xffffffff as const;
export const DRAW_INDEXED_INDIRECT_U32_COUNT = 5 as const;
export const DRAW_INDIRECT_U32_COUNT = 4 as const;
/** WASM32 실용 아레나 상한(2 GiB); 초과 시 WASM64 `memory64` 아레나 권고. */
export const WASM32_SAFE_ARENA_CEILING_BYTES = 2 * 1024 * 1024 * 1024;

export const SCENE_OBJECT_KIND_SPEECH_BUBBLE = 0 as const;
export const SCENE_OBJECT_KIND_PANEL_FRAME = 1 as const;
export const SCENE_OBJECT_KIND_SCREENTONE_PATCH = 2 as const;
export const SCENE_OBJECT_KIND_VECTOR_STROKE = 3 as const;
export const SCENE_OBJECT_KIND_BILLBOARD_3D = 4 as const;
export const SCENE_OBJECT_KIND_BRUSH_STAMP = 5 as const;
export const SCENE_OBJECT_ALL_KINDS_MASK = 0x3f as const;

export type SceneObjectKindCode = 0 | 1 | 2 | 3 | 4 | 5;

export const SCENE_OBJECT_FLAG_VISIBLE = 1 as const;
export const SCENE_OBJECT_FLAG_LOCKED = 2 as const;
export const SCENE_OBJECT_FLAG_LOOP_BLINN_CURVE = 4 as const;
export const SCENE_OBJECT_FLAG_IMPASTO_RELIEF = 8 as const;
export const SCENE_OBJECT_FLAG_WET_DIFFUSION = 16 as const;
export const SCENE_OBJECT_FLAG_SPECTRAL_KM = 32 as const;

export interface SceneArenaByteLayout {
  readonly capacity: number; readonly alignedColumnBytes: number;
  readonly minXOffset: number; readonly minYOffset: number; readonly maxXOffset: number; readonly maxYOffset: number;
  readonly rotationRadOffset: number; readonly zOrderOffset: number; readonly curveBiasOffset: number;
  readonly objectIdOffset: number; readonly kindCodeOffset: number; readonly colorPackedRgba8Offset: number;
  readonly textureMaterialIdOffset: number; readonly flagsOffset: number; readonly totalBytes: number;
}

export interface SceneObjectArenaSoA {
  readonly capacity: number; count: number; readonly buffer: ArrayBuffer;
  readonly baseByteOffset: number; readonly layout: SceneArenaByteLayout;
  readonly minX: Float32Array; readonly minY: Float32Array; readonly maxX: Float32Array; readonly maxY: Float32Array;
  readonly rotationRad: Float32Array; readonly zOrder: Float32Array; readonly curveBias: Float32Array;
  readonly objectId: Uint32Array; readonly kindCode: Uint32Array; readonly colorPackedRgba8: Uint32Array;
  readonly textureMaterialId: Uint32Array; readonly flags: Uint32Array;
}

export interface SceneObjectInput {
  readonly objectId: number;
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
  readonly kindCode: SceneObjectKindCode;
  readonly rotationRad?: number; readonly zOrder?: number; readonly curveBias?: number;
  readonly colorPackedRgba8?: number; readonly textureMaterialId?: number; readonly flags?: number;
}

export interface FlatBvh2dBuildOptions {
  readonly maxLeafSize?: number; readonly sahBins?: number;
  readonly traversalCost?: number; readonly intersectionCost?: number;
}

export interface FlatBvh2dStats {
  readonly objectCount: number; readonly nodeCount: number; readonly leafCount: number; readonly internalCount: number;
  readonly maxDepth: number; readonly averageLeafSize: number; readonly rootHalfPerimeter: number; readonly bvhMemoryBytes: number;
}

export interface FlatBvh2d {
  readonly objectCount: number; readonly nodeCount: number;
  /** 노드당 4 floats: `[minX, minY, maxX, maxY]`. */
  readonly nodeBounds: Float32Array;
  /** 노드당 4 u32s: `[left|firstPrim, right|primCount, (depth<<2)|(axis<<1)|isLeaf, parentIdx]`. */
  readonly nodeTopology: Uint32Array;
  readonly primIndices: Uint32Array;
  readonly stats: FlatBvh2dStats;
}

export interface ViewportBounds2d {
  readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number;
}

export interface ViewportCullOptions {
  readonly margin?: number; readonly includeHidden?: boolean; readonly kindMask?: number;
  readonly sortMode?: "none" | "index-asc" | "z-order-asc";
  readonly outIndices?: Uint32Array; readonly traversalStack?: Int32Array;
}

export interface ViewportCullResult {
  readonly visibleIndices: Uint32Array; readonly visibleCount: number;
  readonly visitedNodes: number; readonly testedPrimitives: number; readonly culledSubtreeCount: number;
  readonly cullRatio: number; readonly reusedOutputBuffer: boolean;
}

export interface BvhHitTestOptions {
  readonly radius?: number; readonly maxHits?: number;
  readonly includeHidden?: boolean; readonly includeLocked?: boolean;
  readonly kindMask?: number; readonly traversalStack?: Int32Array;
}

export interface BvhHitTestResult {
  readonly topHitIndex: number; readonly topObjectId: number;
  readonly hitIndices: Uint32Array; readonly hitCount: number;
  readonly visitedNodes: number; readonly testedPrimitives: number;
}

export interface PackedInstancedDrawBuffer {
  readonly instanceFloatData: Float32Array; readonly instanceUintData: Uint32Array;
  readonly instanceCount: number;
  readonly strideFloats: typeof INSTANCED_OBJECT_STRIDE_FLOATS;
  readonly strideBytes: typeof INSTANCED_OBJECT_STRIDE_BYTES;
  readonly byteLength: number;
  /** WebGPU `drawIndexedIndirect`: `[indexCount, instanceCount, firstIndex, baseVertex, firstInstance]`. */
  readonly drawIndexedIndirectArgs: Uint32Array;
  /** WebGPU `drawIndirect`: `[vertexCount, instanceCount, firstVertex, firstInstance]`. */
  readonly drawIndirectArgs: Uint32Array;
  readonly reusedBuffer: boolean;
}

export type GraphicsPaperPipelineId =
  | "kubelka-munk-1931" | "chu-tai-moxi-2005" | "chen-diverdi-wetbrush-2015"
  | "loop-blinn-2005" | "levien-vello-piet-gpu-2025";

export interface GraphicsPaperPipelineSpec {
  readonly id: GraphicsPaperPipelineId; readonly authors: string; readonly year: string;
  readonly venue: string; readonly title: string; readonly koreanSummary: string; readonly coreEquations: string;
  readonly webgpuPass: {
    readonly stage: "compute" | "render" | "compute-then-render";
    readonly workgroupSize: readonly [number, number, number];
    readonly storageFormat: string; readonly bindingSlotCount: number; readonly indirectDrawCompatible: boolean;
  };
  readonly wasm64Bridge: {
    readonly arenaSharingMode: "zero-copy-soa" | "ring-staging" | "tile-arena";
    readonly pointerWidthBits: readonly (32 | 64)[]; readonly simdLaneWidth: 128;
  };
  readonly theoreticalComplexity: { readonly build: string; readonly perFrame: string; readonly memory: string };
  readonly bytesPerUnitFormula: { readonly unitLabel: string; readonly bytesPerUnit: number; readonly overheadBytes: number };
}

export interface PipelineMemoryFootprintEstimate {
  readonly specId: GraphicsPaperPipelineId; readonly unitCount: number;
  readonly totalBytes: number; readonly totalKiB: number; readonly totalMiB: number;
  readonly fitsWasm32Ceiling: boolean; readonly recommendedArenaMode: "wasm32" | "wasm64";
}

function alignUp16(bytes: number): number { return (bytes + 15) & ~15; }
function clampByte(v: number): number { return !Number.isFinite(v) || v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v); }
function finiteOr(value: number | undefined, fallback: number): number { return value !== undefined && Number.isFinite(value) ? value : fallback; }
function halfPerimeter2d(x0: number, y0: number, x1: number, y1: number): number { return (x1 > x0 ? x1 - x0 : 0) + (y1 > y0 ? y1 - y0 : 0); }

/** 0..255 RGBA 채널을 WGSL `unpack4x8unorm` 호환 u32(LSB=R, MSB=A)로 패킹한다. */
export function packRgba8U32(r: number, g: number, b: number, a = 255): number {
  return ((clampByte(a) << 24) | (clampByte(b) << 16) | (clampByte(g) << 8) | clampByte(r)) >>> 0;
}

/** 패킹된 RGBA8 u32를 `[r, g, b, a]` 튜플로 언팩한다. */
export function unpackRgba8U32(packed: number): readonly [number, number, number, number] {
  const u = packed >>> 0;
  return [u & 0xff, (u >>> 8) & 0xff, (u >>> 16) & 0xff, (u >>> 24) & 0xff];
}

/** GPU 인스턴스 `material_bits` 필드(kind:4 | flags:4 | materialId:24)를 비트 패킹한다. */
export function packInstanceMaterialMeta(kindCode: number, flags: number, textureMaterialId: number): number {
  return ((kindCode & 0x0f) | ((flags & 0x0f) << 4) | ((textureMaterialId & 0x00ffffff) << 8)) >>> 0;
}

/** 12개 SoA 컬럼을 단일 연속 버퍼에 16-byte 정렬 배치하기 위한 바이트 오프셋 테이블을 계산한다. */
export function computeSceneArenaByteLayout(capacity: number): SceneArenaByteLayout {
  const safeCap = Math.max(0, Math.floor(capacity));
  const col = alignUp16(safeCap * 4);
  return {
    capacity: safeCap, alignedColumnBytes: col,
    minXOffset: 0, minYOffset: col, maxXOffset: col * 2, maxYOffset: col * 3,
    rotationRadOffset: col * 4, zOrderOffset: col * 5, curveBiasOffset: col * 6,
    objectIdOffset: col * 7, kindCodeOffset: col * 8, colorPackedRgba8Offset: col * 9,
    textureMaterialIdOffset: col * 10, flagsOffset: col * 11, totalBytes: col * 12,
  };
}

/** 단일 연속 `ArrayBuffer` 기반 Flat SoA 씬 아레나를 생성한다(`externalBuffer` 지정 시 WASM Zero-Copy 공유). */
export function createSceneObjectArena(capacity: number, externalBuffer?: ArrayBuffer, baseByteOffset = 0): SceneObjectArenaSoA {
  const layout = computeSceneArenaByteLayout(capacity);
  const safeBase = Math.max(0, Math.floor(baseByteOffset));
  if (safeBase % 16 !== 0) throw new RangeError("baseByteOffset은 WebGPU/WASM 16-byte 정렬 배수여야 합니다.");
  const required = safeBase + layout.totalBytes;
  if (externalBuffer !== undefined && required > externalBuffer.byteLength) {
    throw new RangeError(`외부 ArrayBuffer(${externalBuffer.byteLength}B)가 필요 크기(${required}B)보다 작습니다.`);
  }
  const buffer = externalBuffer ?? new ArrayBuffer(required);
  const len = layout.capacity;
  return {
    capacity: len, count: 0, buffer, baseByteOffset: safeBase, layout,
    minX: new Float32Array(buffer, safeBase + layout.minXOffset, len),
    minY: new Float32Array(buffer, safeBase + layout.minYOffset, len),
    maxX: new Float32Array(buffer, safeBase + layout.maxXOffset, len),
    maxY: new Float32Array(buffer, safeBase + layout.maxYOffset, len),
    rotationRad: new Float32Array(buffer, safeBase + layout.rotationRadOffset, len),
    zOrder: new Float32Array(buffer, safeBase + layout.zOrderOffset, len),
    curveBias: new Float32Array(buffer, safeBase + layout.curveBiasOffset, len),
    objectId: new Uint32Array(buffer, safeBase + layout.objectIdOffset, len),
    kindCode: new Uint32Array(buffer, safeBase + layout.kindCodeOffset, len),
    colorPackedRgba8: new Uint32Array(buffer, safeBase + layout.colorPackedRgba8Offset, len),
    textureMaterialId: new Uint32Array(buffer, safeBase + layout.textureMaterialIdOffset, len),
    flags: new Uint32Array(buffer, safeBase + layout.flagsOffset, len),
  };
}

/** 씬 오브젝트 1건을 힙 할당 없이 Flat SoA 아레나에 추가하고 인덱스를 반환한다. */
export function pushSceneObject(arena: SceneObjectArenaSoA, input: SceneObjectInput): number {
  const idx = arena.count;
  if (idx >= arena.capacity) throw new RangeError(`SceneObjectArenaSoA 용량(${arena.capacity}) 초과`);
  const x0 = finiteOr(input.minX, 0), y0 = finiteOr(input.minY, 0);
  const x1 = finiteOr(input.maxX, x0), y1 = finiteOr(input.maxY, y0);
  arena.minX[idx] = x0 <= x1 ? x0 : x1;
  arena.maxX[idx] = x0 <= x1 ? x1 : x0;
  arena.minY[idx] = y0 <= y1 ? y0 : y1;
  arena.maxY[idx] = y0 <= y1 ? y1 : y0;
  arena.rotationRad[idx] = finiteOr(input.rotationRad, 0);
  arena.zOrder[idx] = finiteOr(input.zOrder, idx);
  arena.curveBias[idx] = finiteOr(input.curveBias, 0);
  arena.objectId[idx] = input.objectId >>> 0;
  arena.kindCode[idx] = input.kindCode & 0x0f;
  arena.colorPackedRgba8[idx] = input.colorPackedRgba8 !== undefined ? input.colorPackedRgba8 >>> 0 : packRgba8U32(255, 255, 255, 255);
  arena.textureMaterialId[idx] = (input.textureMaterialId ?? 0) & 0x00ffffff;
  arena.flags[idx] = input.flags !== undefined ? input.flags >>> 0 : SCENE_OBJECT_FLAG_VISIBLE;
  arena.count = idx + 1;
  return idx;
}

/** 기존 아레나 슬롯의 AABB 경계를 제자리(in-place) 갱신한다. */
export function updateSceneObjectBounds(
  arena: SceneObjectArenaSoA, index: number, minX: number, minY: number, maxX: number, maxY: number,
): void {
  if (index < 0 || index >= arena.count) throw new RangeError(`유효하지 않은 아레나 인덱스: ${index}`);
  const x0 = finiteOr(minX, 0), y0 = finiteOr(minY, 0);
  const x1 = finiteOr(maxX, x0), y1 = finiteOr(maxY, y0);
  arena.minX[index] = x0 <= x1 ? x0 : x1;
  arena.maxX[index] = x0 <= x1 ? x1 : x0;
  arena.minY[index] = y0 <= y1 ? y0 : y1;
  arena.maxY[index] = y0 <= y1 ? y1 : y0;
}

/** 2D 둘레 기반 Binned SAH 반복형 Flat-BVH 구축 (이론 복잡도 O(N log N), 노드당 32B). */
export function buildFlatBvh2d(arena: SceneObjectArenaSoA, options: FlatBvh2dBuildOptions = {}): FlatBvh2d {
  const count = arena.count;
  if (count === 0) {
    return {
      objectCount: 0, nodeCount: 0,
      nodeBounds: new Float32Array(0), nodeTopology: new Uint32Array(0), primIndices: new Uint32Array(0),
      stats: { objectCount: 0, nodeCount: 0, leafCount: 0, internalCount: 0, maxDepth: 0, averageLeafSize: 0, rootHalfPerimeter: 0, bvhMemoryBytes: 0 },
    };
  }

  const maxLeafSize = Math.max(1, Math.min(64, Math.floor(options.maxLeafSize ?? 8)));
  const sahBins = Math.max(4, Math.min(32, Math.floor(options.sahBins ?? 12)));
  const traversalCost = finiteOr(options.traversalCost, 1.0);
  const intersectionCost = finiteOr(options.intersectionCost, 1.5);

  const primIndices = new Uint32Array(count);
  const centroidX = new Float32Array(count);
  const centroidY = new Float32Array(count);
  const { minX: aMinX, minY: aMinY, maxX: aMaxX, maxY: aMaxY } = arena;
  for (let i = 0; i < count; i += 1) {
    primIndices[i] = i;
    centroidX[i] = ((aMinX[i] ?? 0) + (aMaxX[i] ?? 0)) * 0.5;
    centroidY[i] = ((aMinY[i] ?? 0) + (aMaxY[i] ?? 0)) * 0.5;
  }

  const maxNodes = Math.max(1, 2 * count - 1);
  const rawNodeBounds = new Float32Array(maxNodes * FLAT_BVH_NODE_BOUNDS_FLOATS);
  const rawNodeTopology = new Uint32Array(maxNodes * FLAT_BVH_NODE_TOPO_U32S);
  const binCounts = new Int32Array(sahBins);
  const binBounds = new Float32Array(sahBins * 4);
  const leftCount = new Int32Array(sahBins);
  const leftPerim = new Float32Array(sahBins);

  const maxStack = Math.max(128, Math.ceil(Math.log2(count + 2)) * 8 + 64);
  // 반복형 빌드 프레임 4-튜플: [nodeIdx, start, end, depth]
  const buildStack = new Int32Array(maxStack * 4);
  rawNodeTopology[3] = FLAT_BVH_NO_PARENT;
  buildStack[0] = 0; buildStack[1] = 0; buildStack[2] = count; buildStack[3] = 0;

  let sp = 1, nodeCount = 1, leafCount = 0, internalCount = 0, leafPrimSum = 0, maxDepth = 0, rootHalfPerimeter = 0;
  const commitLeaf = (topoBase: number, start: number, primCount: number, depth: number): void => {
    rawNodeTopology[topoBase] = start >>> 0;
    rawNodeTopology[topoBase + 1] = primCount >>> 0;
    rawNodeTopology[topoBase + 2] = (((depth & 0x3fffffff) << 2) | 1) >>> 0;
    leafCount += 1;
    leafPrimSum += primCount;
  };

  while (sp > 0) {
    sp -= 1;
    const fBase = sp * 4;
    const nodeIdx = buildStack[fBase] ?? 0, start = buildStack[fBase + 1] ?? 0;
    const end = buildStack[fBase + 2] ?? 0, depth = buildStack[fBase + 3] ?? 0;
    const primCount = end - start;
    if (depth > maxDepth) maxDepth = depth;

    let bMinX = Infinity, bMinY = Infinity, bMaxX = -Infinity, bMaxY = -Infinity;
    let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
    for (let i = start; i < end; i += 1) {
      const p = primIndices[i] ?? 0;
      const x0 = aMinX[p] ?? 0, y0 = aMinY[p] ?? 0, x1 = aMaxX[p] ?? 0, y1 = aMaxY[p] ?? 0;
      if (x0 < bMinX) bMinX = x0;
      if (y0 < bMinY) bMinY = y0;
      if (x1 > bMaxX) bMaxX = x1;
      if (y1 > bMaxY) bMaxY = y1;
      const cx = centroidX[p] ?? 0, cy = centroidY[p] ?? 0;
      if (cx < cMinX) cMinX = cx;
      if (cy < cMinY) cMinY = cy;
      if (cx > cMaxX) cMaxX = cx;
      if (cy > cMaxY) cMaxY = cy;
    }

    const bBase = nodeIdx * FLAT_BVH_NODE_BOUNDS_FLOATS;
    rawNodeBounds[bBase] = bMinX; rawNodeBounds[bBase + 1] = bMinY;
    rawNodeBounds[bBase + 2] = bMaxX; rawNodeBounds[bBase + 3] = bMaxY;
    const parentPerim = halfPerimeter2d(bMinX, bMinY, bMaxX, bMaxY);
    if (nodeIdx === 0) rootHalfPerimeter = parentPerim;

    const topoBase = nodeIdx * FLAT_BVH_NODE_TOPO_U32S;
    if (primCount <= maxLeafSize || nodeCount + 2 > maxNodes || sp + 2 > maxStack) {
      commitLeaf(topoBase, start, primCount, depth);
      continue;
    }

    const spanX = cMaxX - cMinX, spanY = cMaxY - cMinY;
    let bestAxis = spanX >= spanY ? 0 : 1, bestSplitBin = -1, bestCost = Infinity;

    if (parentPerim > 1e-7 && (spanX > 1e-6 || spanY > 1e-6)) {
      for (let axis = 0; axis < 2; axis += 1) {
        const axisMin = axis === 0 ? cMinX : cMinY;
        const axisSpan = axis === 0 ? spanX : spanY;
        if (axisSpan <= 1e-6) continue;
        const invScale = sahBins / axisSpan;
        binCounts.fill(0);
        for (let b = 0; b < sahBins; b += 1) {
          const o = b * 4;
          binBounds[o] = Infinity; binBounds[o + 1] = Infinity;
          binBounds[o + 2] = -Infinity; binBounds[o + 3] = -Infinity;
        }
        const cArr = axis === 0 ? centroidX : centroidY;
        for (let i = start; i < end; i += 1) {
          const p = primIndices[i] ?? 0;
          const raw = Math.floor(((cArr[p] ?? 0) - axisMin) * invScale);
          const bi = raw < 0 ? 0 : raw >= sahBins ? sahBins - 1 : raw;
          binCounts[bi] = (binCounts[bi] ?? 0) + 1;
          const o = bi * 4;
          const x0 = aMinX[p] ?? 0, y0 = aMinY[p] ?? 0, x1 = aMaxX[p] ?? 0, y1 = aMaxY[p] ?? 0;
          if (x0 < (binBounds[o] ?? Infinity)) binBounds[o] = x0;
          if (y0 < (binBounds[o + 1] ?? Infinity)) binBounds[o + 1] = y0;
          if (x1 > (binBounds[o + 2] ?? -Infinity)) binBounds[o + 2] = x1;
          if (y1 > (binBounds[o + 3] ?? -Infinity)) binBounds[o + 3] = y1;
        }

        let lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity, lAcc = 0;
        for (let b = 0; b < sahBins - 1; b += 1) {
          const bc = binCounts[b] ?? 0;
          if (bc > 0) {
            lAcc += bc;
            const o = b * 4;
            if ((binBounds[o] ?? Infinity) < lx0) lx0 = binBounds[o] ?? Infinity;
            if ((binBounds[o + 1] ?? Infinity) < ly0) ly0 = binBounds[o + 1] ?? Infinity;
            if ((binBounds[o + 2] ?? -Infinity) > lx1) lx1 = binBounds[o + 2] ?? -Infinity;
            if ((binBounds[o + 3] ?? -Infinity) > ly1) ly1 = binBounds[o + 3] ?? -Infinity;
          }
          leftCount[b] = lAcc;
          leftPerim[b] = lAcc > 0 ? halfPerimeter2d(lx0, ly0, lx1, ly1) : 0;
        }

        let rx0 = Infinity, ry0 = Infinity, rx1 = -Infinity, ry1 = -Infinity, rAcc = 0;
        for (let b = sahBins - 1; b >= 1; b -= 1) {
          const bc = binCounts[b] ?? 0;
          if (bc > 0) {
            rAcc += bc;
            const o = b * 4;
            if ((binBounds[o] ?? Infinity) < rx0) rx0 = binBounds[o] ?? Infinity;
            if ((binBounds[o + 1] ?? Infinity) < ry0) ry0 = binBounds[o + 1] ?? Infinity;
            if ((binBounds[o + 2] ?? -Infinity) > rx1) rx1 = binBounds[o + 2] ?? -Infinity;
            if ((binBounds[o + 3] ?? -Infinity) > ry1) ry1 = binBounds[o + 3] ?? -Infinity;
          }
          const lc = leftCount[b - 1] ?? 0;
          if (lc === 0 || rAcc === 0) continue;
          const cost = traversalCost + intersectionCost * ((lc * (leftPerim[b - 1] ?? 0) + rAcc * halfPerimeter2d(rx0, ry0, rx1, ry1)) / parentPerim);
          if (cost < bestCost) { bestCost = cost; bestAxis = axis; bestSplitBin = b; }
        }
      }
    }

    if (primCount <= maxLeafSize * 2 && (bestCost >= intersectionCost * primCount || (bestSplitBin < 0 && spanX <= 1e-6 && spanY <= 1e-6))) {
      commitLeaf(topoBase, start, primCount, depth);
      continue;
    }

    let mid = (start + end) >>> 1;
    if (bestSplitBin > 0) {
      const splitCoord = (bestAxis === 0 ? cMinX : cMinY) + ((bestAxis === 0 ? spanX : spanY) * bestSplitBin) / sahBins;
      const cArr = bestAxis === 0 ? centroidX : centroidY;
      let l = start, r = end - 1;
      while (l <= r) {
        const p = primIndices[l] ?? 0;
        if ((cArr[p] ?? 0) < splitCoord) { l += 1; } else { primIndices[l] = primIndices[r] ?? 0; primIndices[r] = p; r -= 1; }
      }
      if (l > start && l < end) mid = l;
    }

    const leftChild = nodeCount, rightChild = nodeCount + 1;
    nodeCount += 2; internalCount += 1;
    rawNodeTopology[topoBase] = leftChild >>> 0;
    rawNodeTopology[topoBase + 1] = rightChild >>> 0;
    rawNodeTopology[topoBase + 2] = (((depth & 0x3fffffff) << 2) | ((bestAxis & 1) << 1)) >>> 0;
    rawNodeTopology[leftChild * FLAT_BVH_NODE_TOPO_U32S + 3] = nodeIdx >>> 0;
    rawNodeTopology[rightChild * FLAT_BVH_NODE_TOPO_U32S + 3] = nodeIdx >>> 0;

    const rBase = sp * 4;
    buildStack[rBase] = rightChild; buildStack[rBase + 1] = mid; buildStack[rBase + 2] = end; buildStack[rBase + 3] = depth + 1;
    sp += 1;
    const lBase = sp * 4;
    buildStack[lBase] = leftChild; buildStack[lBase + 1] = start; buildStack[lBase + 2] = mid; buildStack[lBase + 3] = depth + 1;
    sp += 1;
  }

  return {
    objectCount: count, nodeCount,
    nodeBounds: rawNodeBounds.subarray(0, nodeCount * FLAT_BVH_NODE_BOUNDS_FLOATS),
    nodeTopology: rawNodeTopology.subarray(0, nodeCount * FLAT_BVH_NODE_TOPO_U32S),
    primIndices,
    stats: {
      objectCount: count, nodeCount, leafCount, internalCount, maxDepth,
      averageLeafSize: leafCount > 0 ? leafPrimSum / leafCount : 0,
      rootHalfPerimeter, bvhMemoryBytes: nodeCount * FLAT_BVH_NODE_TOTAL_BYTES + count * 4,
    },
  };
}

/** 공유 반복형 AABB BVH 순회 커널 (컬링·히트 테스트 공용, 스택 할당 최소화). */
function traverseFlatBvhAabb(
  bvh: FlatBvh2d,
  qMinX: number, qMinY: number, qMaxX: number, qMaxY: number,
  providedStack: Int32Array | undefined,
  onLeaf: (firstPrim: number, limitPrim: number) => void,
): { readonly visitedNodes: number; readonly culledSubtreeCount: number } {
  const stack = providedStack !== undefined && providedStack.length >= bvh.stats.maxDepth + 16
    ? providedStack
    : new Int32Array(Math.max(64, bvh.stats.maxDepth + 16));
  const { nodeBounds: bounds, nodeTopology: topo } = bvh;
  let sp = 1, visitedNodes = 0, culledSubtreeCount = 0;
  stack[0] = 0;
  while (sp > 0) {
    sp -= 1;
    const nodeIdx = stack[sp] ?? 0;
    visitedNodes += 1;
    const bBase = nodeIdx * FLAT_BVH_NODE_BOUNDS_FLOATS;
    if ((bounds[bBase + 2] ?? -Infinity) < qMinX || (bounds[bBase] ?? Infinity) > qMaxX || (bounds[bBase + 3] ?? -Infinity) < qMinY || (bounds[bBase + 1] ?? Infinity) > qMaxY) {
      culledSubtreeCount += 1;
      continue;
    }
    const tBase = nodeIdx * FLAT_BVH_NODE_TOPO_U32S;
    if (((topo[tBase + 2] ?? 0) & 1) === 1) {
      const first = topo[tBase] ?? 0;
      onLeaf(first, first + (topo[tBase + 1] ?? 0));
    } else {
      stack[sp] = topo[tBase + 1] ?? 0; sp += 1;
      stack[sp] = topo[tBase] ?? 0; sp += 1;
    }
  }
  return { visitedNodes, culledSubtreeCount };
}

/** Flat-BVH O(log N + K) 뷰포트 프러스텀 컬링 (`outIndices`·`traversalStack` 재사용 시 GC 0건). */
export function queryViewportVisibleIndices(
  bvh: FlatBvh2d, arena: SceneObjectArenaSoA, viewport: ViewportBounds2d, options: ViewportCullOptions = {},
): ViewportCullResult {
  const margin = Math.max(0, finiteOr(options.margin, 0));
  const rx0 = finiteOr(viewport.minX, 0), rx1 = finiteOr(viewport.maxX, rx0);
  const ry0 = finiteOr(viewport.minY, 0), ry1 = finiteOr(viewport.maxY, ry0);
  const qMinX = (rx0 <= rx1 ? rx0 : rx1) - margin, qMaxX = (rx0 <= rx1 ? rx1 : rx0) + margin;
  const qMinY = (ry0 <= ry1 ? ry0 : ry1) - margin, qMaxY = (ry0 <= ry1 ? ry1 : ry0) + margin;
  const includeHidden = options.includeHidden ?? false;
  const kindMask = options.kindMask ?? SCENE_OBJECT_ALL_KINDS_MASK;
  const sortMode = options.sortMode ?? "none";
  const reusedOutputBuffer = options.outIndices !== undefined && options.outIndices.length >= bvh.objectCount;
  const outBuf = reusedOutputBuffer && options.outIndices !== undefined ? options.outIndices : new Uint32Array(bvh.objectCount);

  if (bvh.nodeCount === 0 || bvh.objectCount === 0) {
    return { visibleIndices: outBuf.subarray(0, 0), visibleCount: 0, visitedNodes: 0, testedPrimitives: 0, culledSubtreeCount: 0, cullRatio: 1, reusedOutputBuffer };
  }

  const prims = bvh.primIndices;
  const { minX: aMinX, minY: aMinY, maxX: aMaxX, maxY: aMaxY, flags: aFlags, kindCode: aKinds } = arena;
  let visibleCount = 0, testedPrimitives = 0;

  const { visitedNodes, culledSubtreeCount } = traverseFlatBvhAabb(
    bvh, qMinX, qMinY, qMaxX, qMaxY, options.traversalStack,
    (first, limit) => {
      for (let i = first; i < limit; i += 1) {
        const objIdx = prims[i] ?? 0;
        testedPrimitives += 1;
        if (!includeHidden && ((aFlags[objIdx] ?? 0) & SCENE_OBJECT_FLAG_VISIBLE) === 0) continue;
        if (((1 << ((aKinds[objIdx] ?? 0) & 0x0f)) & kindMask) === 0) continue;
        if ((aMaxX[objIdx] ?? -Infinity) >= qMinX && (aMinX[objIdx] ?? Infinity) <= qMaxX && (aMaxY[objIdx] ?? -Infinity) >= qMinY && (aMinY[objIdx] ?? Infinity) <= qMaxY) {
          outBuf[visibleCount] = objIdx;
          visibleCount += 1;
        }
      }
    },
  );

  const visibleSlice = outBuf.subarray(0, visibleCount);
  if (sortMode === "index-asc" && visibleCount > 1) {
    visibleSlice.sort();
  } else if (sortMode === "z-order-asc" && visibleCount > 1) {
    const zOrders = arena.zOrder;
    visibleSlice.sort((lhs, rhs) => ((zOrders[lhs] ?? 0) - (zOrders[rhs] ?? 0)) || lhs - rhs);
  }
  return {
    visibleIndices: visibleSlice, visibleCount, visitedNodes, testedPrimitives, culledSubtreeCount,
    cullRatio: 1 - visibleCount / Math.max(1, bvh.objectCount), reusedOutputBuffer,
  };
}

/** 포인터 좌표 `(x, y)`에 대해 Flat-BVH O(log N) 히트 테스트를 수행해 최상단 `zOrder` 오브젝트를 반환한다. */
export function hitTestPointBvh(
  bvh: FlatBvh2d, arena: SceneObjectArenaSoA, x: number, y: number, options: BvhHitTestOptions = {},
): BvhHitTestResult {
  if (bvh.nodeCount === 0 || bvh.objectCount === 0) {
    return { topHitIndex: -1, topObjectId: 0, hitIndices: new Uint32Array(0), hitCount: 0, visitedNodes: 0, testedPrimitives: 0 };
  }
  const px = finiteOr(x, 0), py = finiteOr(y, 0);
  const r = Math.max(0, finiteOr(options.radius, 0));
  const maxHits = Math.max(1, Math.floor(options.maxHits ?? 16));
  const includeHidden = options.includeHidden ?? false;
  const includeLocked = options.includeLocked ?? true;
  const kindMask = options.kindMask ?? SCENE_OBJECT_ALL_KINDS_MASK;
  const qMinX = px - r, qMaxX = px + r, qMinY = py - r, qMaxY = py + r;

  const prims = bvh.primIndices;
  const { minX: aMinX, minY: aMinY, maxX: aMaxX, maxY: aMaxY, flags: aFlags, kindCode: aKinds } = arena;
  const hits: number[] = [];
  let testedPrimitives = 0;

  const { visitedNodes } = traverseFlatBvhAabb(
    bvh, qMinX, qMinY, qMaxX, qMaxY, options.traversalStack,
    (first, limit) => {
      for (let i = first; i < limit; i += 1) {
        const objIdx = prims[i] ?? 0;
        testedPrimitives += 1;
        const flg = aFlags[objIdx] ?? 0;
        if (!includeHidden && (flg & SCENE_OBJECT_FLAG_VISIBLE) === 0) continue;
        if (!includeLocked && (flg & SCENE_OBJECT_FLAG_LOCKED) !== 0) continue;
        if (((1 << ((aKinds[objIdx] ?? 0) & 0x0f)) & kindMask) === 0) continue;
        if ((aMaxX[objIdx] ?? -Infinity) >= qMinX && (aMinX[objIdx] ?? Infinity) <= qMaxX && (aMaxY[objIdx] ?? -Infinity) >= qMinY && (aMinY[objIdx] ?? Infinity) <= qMaxY) {
          hits.push(objIdx);
        }
      }
    },
  );

  if (hits.length > 1) {
    const zOrders = arena.zOrder;
    hits.sort((lhs, rhs) => ((zOrders[rhs] ?? 0) - (zOrders[lhs] ?? 0)) || rhs - lhs);
  }
  const finalCount = Math.min(hits.length, maxHits);
  const hitIndices = new Uint32Array(finalCount);
  for (let i = 0; i < finalCount; i += 1) hitIndices[i] = hits[i] ?? 0;
  const topHitIndex = finalCount > 0 ? (hitIndices[0] ?? -1) : -1;
  return { topHitIndex, topObjectId: topHitIndex >= 0 ? (arena.objectId[topHitIndex] ?? 0) : 0, hitIndices, hitCount: finalCount, visitedNodes, testedPrimitives };
}

/** 가시 오브젝트를 32-byte 정렬 스트라이드(8 floats/instance)와 `drawIndexedIndirect`/`drawIndirect` 인자로 패킹한다. */
export function packInstancedDrawBuffer(
  arena: SceneObjectArenaSoA, visibleIndices: Uint32Array, outBuffer?: Float32Array, indexOrVertexCount = 6,
): PackedInstancedDrawBuffer {
  const instanceCount = visibleIndices.length;
  const requiredFloats = instanceCount * INSTANCED_OBJECT_STRIDE_FLOATS;
  const reusedBuffer = outBuffer !== undefined && outBuffer.length >= requiredFloats;
  const targetFloat = reusedBuffer && outBuffer !== undefined ? outBuffer.subarray(0, requiredFloats) : new Float32Array(requiredFloats);
  const targetUint = new Uint32Array(targetFloat.buffer, targetFloat.byteOffset, requiredFloats);
  const { minX, minY, maxX, maxY, rotationRad, curveBias, colorPackedRgba8, kindCode, flags, textureMaterialId } = arena;

  for (let i = 0; i < instanceCount; i += 1) {
    const objIdx = visibleIndices[i] ?? 0;
    const base = i * INSTANCED_OBJECT_STRIDE_FLOATS;
    const x0 = minX[objIdx] ?? 0, y0 = minY[objIdx] ?? 0, x1 = maxX[objIdx] ?? 0, y1 = maxY[objIdx] ?? 0;
    targetFloat[base] = (x0 + x1) * 0.5;
    targetFloat[base + 1] = (y0 + y1) * 0.5;
    targetFloat[base + 2] = (x1 - x0) * 0.5;
    targetFloat[base + 3] = (y1 - y0) * 0.5;
    targetFloat[base + 4] = rotationRad[objIdx] ?? 0;
    targetFloat[base + 5] = curveBias[objIdx] ?? 0;
    targetUint[base + 6] = colorPackedRgba8[objIdx] ?? 0;
    targetUint[base + 7] = packInstanceMaterialMeta(kindCode[objIdx] ?? 0, flags[objIdx] ?? 0, textureMaterialId[objIdx] ?? 0);
  }

  const safeVerts = Math.max(3, Math.floor(indexOrVertexCount)) >>> 0;
  return {
    instanceFloatData: targetFloat, instanceUintData: targetUint, instanceCount,
    strideFloats: INSTANCED_OBJECT_STRIDE_FLOATS, strideBytes: INSTANCED_OBJECT_STRIDE_BYTES,
    byteLength: instanceCount * INSTANCED_OBJECT_STRIDE_BYTES,
    drawIndexedIndirectArgs: new Uint32Array([safeVerts, instanceCount >>> 0, 0, 0, 0]),
    drawIndirectArgs: new Uint32Array([safeVerts, instanceCount >>> 0, 0, 0]),
    reusedBuffer,
  };
}

/** 아레나 전체 오브젝트(0..count-1)를 GPU Compute 프러스텀 컬링 입력 버퍼(32B/instance)로 일괄 패킹한다. */
export function packAllSceneInstancesForGpuCull(arena: SceneObjectArenaSoA, outBuffer?: Float32Array): PackedInstancedDrawBuffer {
  const allIndices = new Uint32Array(arena.count);
  for (let i = 0; i < arena.count; i += 1) allIndices[i] = i;
  return packInstancedDrawBuffer(arena, allIndices, outBuffer, 6);
}

/** 5대 그래픽스 논문 기반 WebGPU + WASM64 물리 렌더링 레퍼런스 카탈로그 (이론 복잡도·실측 바이트 공식 전용). */
export const GRAPHICS_PAPER_PIPELINE_SPECS: readonly GraphicsPaperPipelineSpec[] = [
  {
    id: "kubelka-munk-1931", authors: "Paul Kubelka & Franz Munk", year: "1931",
    venue: "Zeitschrift für Technische Physik 12, 593–601", title: "Ein Beitrag zur Optik der Farbanstriche",
    koreanSummary: "2-플럭스 흡수(K)·산란(S) 분광 계수 기반 물리 안료 감산 혼색 파이프라인",
    coreEquations: "K/S = (1 - R)^2 / (2R); R_mix = 1 + (K_m/S_m) - sqrt((K_m/S_m)^2 + 2(K_m/S_m))",
    webgpuPass: { stage: "compute", workgroupSize: [8, 8, 1], storageFormat: "rgba16float", bindingSlotCount: 4, indirectDrawCompatible: false },
    wasm64Bridge: { arenaSharingMode: "zero-copy-soa", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(P) 안료 분광 LUT 사전 적분", perFrame: "O(W_dirty * H_dirty * B) 분광 혼색", memory: "O(N_pixels * 16B) RGBA16F K/S 버퍼" },
    bytesPerUnitFormula: { unitLabel: "pixel (RGBA16F + K/S 2-flux state)", bytesPerUnit: 16, overheadBytes: 16384 },
  },
  {
    id: "chu-tai-moxi-2005", authors: "Nelson S.-H. Chu & Chiew-Lan Tai", year: "2005",
    venue: "ACM SIGGRAPH 2005 (ACM TOG 24(3), 504–511)", title: "MoXi: Real-Time Ink Dispersion in Absorbent Paper",
    koreanSummary: "D2Q9 격자 볼츠만(LBM) 모세관 종이 섬유 유동 및 습윤 먹물 3-계층 확산",
    coreEquations: "f_i(x + e_i, t + 1) = (1 - w) f_i(x, t) + w f_i^eq(rho, u); fiber-blocking kappa",
    webgpuPass: { stage: "compute", workgroupSize: [8, 8, 1], storageFormat: "rgba16float", bindingSlotCount: 6, indirectDrawCompatible: false },
    wasm64Bridge: { arenaSharingMode: "tile-arena", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(T_active * S^2) 섬유 공극장 초기화", perFrame: "O(T_wet * S^2 * Q) 활성 습윤 타일 LBM", memory: "O(T_wet * S^2 * 48B) 9-방향 더블 버퍼" },
    bytesPerUnitFormula: { unitLabel: "active wet cell (D2Q9 + 3-layer pigment)", bytesPerUnit: 48, overheadBytes: 65536 },
  },
  {
    id: "chen-diverdi-wetbrush-2015", authors: "Zhili Chen, Stephen DiVerdi, Byungmoon Kim, Daichi Ito & Huamin Wang", year: "2015",
    venue: "ACM SIGGRAPH 2015 (ACM TOG 34(6), Article 200)", title: "Wetbrush: GPU-Based 3D Painting Simulation at the Bristle Level",
    koreanSummary: "3D 탄성 브리슬 동역학·물감 전이 및 임파스토 높이맵 릴리프 조명 합성",
    coreEquations: "PBD bristle chain constraints + heightmap delta H(x,y) -> Sobel normal + Blinn-Phong",
    webgpuPass: { stage: "compute-then-render", workgroupSize: [64, 1, 1], storageFormat: "rgba16float", bindingSlotCount: 5, indirectDrawCompatible: true },
    wasm64Bridge: { arenaSharingMode: "ring-staging", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(B * S) 브리슬 체인 정지 자세 구성", perFrame: "O(B * S * I_pbd + A_footprint) 동역학·스탬핑", memory: "O(B * S * 32B + N_tiles * S^2 * 12B)" },
    bytesPerUnitFormula: { unitLabel: "3D bristle segment (pos/vel/ink-load)", bytesPerUnit: 32, overheadBytes: 32768 },
  },
  {
    id: "loop-blinn-2005", authors: "Charles Loop & Jim Blinn", year: "2005",
    venue: "ACM SIGGRAPH 2005 (ACM TOG 24(3), 1000–1009)", title: "Resolution Independent Curve Rendering using Programmable Graphics Hardware",
    koreanSummary: "해상도 독립 2차/3차 음함수 베지어 곡선 GPU 평가 및 fwidth 스크린 공간 AA",
    coreEquations: "f(u, v) = u^2 - v; sd = f / max(length(vec2(dpdx(f), dpdy(f))), eps)",
    webgpuPass: { stage: "render", workgroupSize: [1, 1, 1], storageFormat: "bgra8unorm", bindingSlotCount: 2, indirectDrawCompatible: true },
    wasm64Bridge: { arenaSharingMode: "zero-copy-soa", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(N_curves) 인스턴스 32B 패킹", perFrame: "O(log N + K_visible) 컬링 후 단일 drawIndirect", memory: "O(N_curves * 32B) 32-byte 정렬 스트라이드" },
    bytesPerUnitFormula: { unitLabel: "instanced curve/object record (32B)", bytesPerUnit: INSTANCED_OBJECT_STRIDE_BYTES, overheadBytes: 4096 },
  },
  {
    id: "levien-vello-piet-gpu-2025", authors: "Raph Levien & Linebender Contributors", year: "2020–2025",
    venue: "Linebender / Vello · Piet-GPU Architecture", title: "Vello / Piet-GPU: Compute-Centric 2D Vector Rendering with GPU Prefix-Sum Tile Binning",
    koreanSummary: "GPU Prefix-Sum 타일 빈닝·Coarse/Fine 경로 분할 기반 컴퓨트 2D 벡터 렌더링",
    coreEquations: "PathFlatten -> TileAlloc -> PrefixSum(backdrop) -> CoarseBinning -> FineRaster(16x16)",
    webgpuPass: { stage: "compute", workgroupSize: [64, 1, 1], storageFormat: "rgba8unorm", bindingSlotCount: 7, indirectDrawCompatible: true },
    wasm64Bridge: { arenaSharingMode: "zero-copy-soa", pointerWidthBits: [32, 64], simdLaneWidth: 128 },
    theoreticalComplexity: { build: "O(N_segments) 경로 스트림 인코딩", perFrame: "O((N_seg + N_tiles) / P_gpu + log P_gpu)", memory: "O(N_segments * 32B + N_tiles * 16B)" },
    bytesPerUnitFormula: { unitLabel: "flattened path segment + tile bin", bytesPerUnit: 48, overheadBytes: 16384 },
  },
] as const;

/** ID로 그래픽스 논문 파이프라인 명세를 조회한다. */
export function getGraphicsPaperPipelineSpec(id: GraphicsPaperPipelineId): GraphicsPaperPipelineSpec {
  for (let i = 0; i < GRAPHICS_PAPER_PIPELINE_SPECS.length; i += 1) {
    const spec = GRAPHICS_PAPER_PIPELINE_SPECS[i];
    if (spec !== undefined && spec.id === id) return spec;
  }
  throw new RangeError(`알 수 없는 그래픽스 논문 파이프라인 ID: ${id}`);
}

/** 입력 단위 수에 따른 결정론적 메모리 발자국(Bytes/KiB/MiB)과 WASM32/WASM64 권장 모드를 산출한다. */
export function estimatePipelineMemoryFootprint(specId: GraphicsPaperPipelineId, unitCount: number): PipelineMemoryFootprintEstimate {
  const spec = getGraphicsPaperPipelineSpec(specId);
  const safeUnits = Math.max(0, Math.floor(finiteOr(unitCount, 0)));
  const totalBytes = safeUnits * spec.bytesPerUnitFormula.bytesPerUnit + spec.bytesPerUnitFormula.overheadBytes;
  const fitsWasm32Ceiling = totalBytes <= WASM32_SAFE_ARENA_CEILING_BYTES;
  return {
    specId, unitCount: safeUnits, totalBytes, totalKiB: totalBytes / 1024, totalMiB: totalBytes / (1024 * 1024),
    fitsWasm32Ceiling, recommendedArenaMode: fitsWasm32Ceiling ? "wasm32" : "wasm64",
  };
}
