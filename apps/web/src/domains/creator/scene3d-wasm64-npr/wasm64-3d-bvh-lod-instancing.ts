/**
 * 3D Wasm64(memory64) 선형 메모리 버퍼 풀 · SAH BVH 가속 구조 · 프러스텀 컬링 ·
 * 4단계 시선 오토 LOD · 자동 GPU Instancing 배칭 · KTX2/Meshopt 점진 스트리밍 엔진.
 *
 * Node 24 / Chromium 133+에서는 실제 `WebAssembly.Memory({ address: "i64" })`로
 * 정점·AABB·인스턴스 행렬을 GC 0바이트로 관리하고, 미지원 환경은 Wasm32(`i32`)로 폴백한다.
 */

export const SCENE3D_WASM_PAGE_BYTES = 65536;
export const SCENE3D_WASM_PAGE_BYTES_BIGINT = BigInt(SCENE3D_WASM_PAGE_BYTES);
export const SCENE3D_WASM64_DEFAULT_MAX_PAGES = BigInt(16384); // 1 GiB 가상 주소 예약
export const SCENE3D_WASM32_DEFAULT_MAX_PAGES = BigInt(4096); // 256 MiB 폴백 상한
export const SCENE3D_VERTEX_STRIDE_FLOATS = 8; // px,py,pz, nx,ny,nz, u,v
export const SCENE3D_VERTEX_STRIDE_BYTES = SCENE3D_VERTEX_STRIDE_FLOATS * 4;
export const SCENE3D_AABB_STRIDE_FLOATS = 6; // minX,minY,minZ, maxX,maxY,maxZ
export const SCENE3D_AABB_STRIDE_BYTES = SCENE3D_AABB_STRIDE_FLOATS * 4;
export const SCENE3D_INSTANCE_MATRIX_FLOATS = 16; // 4x4 column-major
export const SCENE3D_INSTANCE_MATRIX_BYTES = SCENE3D_INSTANCE_MATRIX_FLOATS * 4;
export const SCENE3D_DEFAULT_VRAM_BUDGET_MIB = 256;
export const SCENE3D_LOD_TRIANGLE_RATIOS = [1.0, 0.5, 0.22, 0.06] as const;

export type Scene3dWasmAddressMode = "i64" | "i32";
export type Scene3dLodLevel = 0 | 1 | 2 | 3;
export type ProgressiveStreamTier = "resident-full" | "stream-mid" | "stream-low" | "impostor-atlas" | "evicted-budget";

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface Aabb3d { readonly minX: number; readonly minY: number; readonly minZ: number; readonly maxX: number; readonly maxY: number; readonly maxZ: number }
export interface Scene3dObject {
  readonly id: string; readonly assetId: string; readonly materialId: string;
  readonly aabb: Aabb3d; readonly center: Vec3; readonly boundingRadius: number;
  readonly baseTriangleCount: number; readonly textureBytesLod0: number;
  readonly ktx2Bytes: number; readonly meshoptBytes: number;
  readonly importanceWeight?: number; readonly transformMatrix16?: readonly number[];
}
export interface Scene3dCamera {
  readonly position: Vec3; readonly target: Vec3; readonly up?: Vec3;
  readonly fovYDeg: number; readonly aspect: number; readonly near: number; readonly far: number;
}
export interface Scene3dWasm64PoolOptions {
  readonly initialPages?: number; readonly maximumPages?: bigint;
  readonly forceAddressMode?: "auto" | "i64" | "i32"; readonly webAssembly?: typeof WebAssembly | null;
}
export interface Scene3dWasm64AllocationHandle {
  readonly kind: "vertex" | "aabb" | "instance"; readonly byteOffset: bigint;
  readonly byteLength: number; readonly elementCount: number; readonly floatLength: number;
}
export interface Scene3dWasm64PoolTelemetry {
  readonly addressMode: Scene3dWasmAddressMode; readonly isMemory64: boolean; readonly fallbackReason: string | null;
  readonly committedPages: bigint; readonly maximumPages: bigint;
  readonly committedBytes: number; readonly reservedMaxBytes: bigint;
  readonly usedBytes: number; readonly utilization01: number;
  readonly allocationCount: number; readonly growCount: number; readonly bufferGeneration: number;
  readonly zeroGcResetCount: number; readonly storedVertexCount: number; readonly storedAabbCount: number; readonly storedInstanceCount: number;
}
export interface Scene3dBvh {
  readonly objects: readonly Scene3dObject[]; readonly orderedIndices: Int32Array;
  readonly nodeBounds: Float32Array; readonly nodeLeftOrFirst: Int32Array; readonly nodeRightOrCount: Int32Array;
  readonly nodeCount: number; readonly leafCount: number; readonly maxDepth: number;
  readonly sahCost: number; readonly buildTimeMs: number; readonly rootAabb: Aabb3d;
}
export interface Scene3dRaycastHit { readonly objectIndex: number; readonly objectId: string; readonly assetId: string; readonly distance: number; readonly hitPoint: Vec3 }
export interface Scene3dRaycastResult { readonly hit: Scene3dRaycastHit | null; readonly visitedNodes: number; readonly testedObjects: number; readonly prunedRatio01: number }
export interface VisibleLodObject {
  readonly object: Scene3dObject; readonly objectIndex: number; readonly distance: number;
  readonly screenCoverage01: number; readonly lodLevel: Scene3dLodLevel; readonly lodTriangleRatio: number; readonly effectiveTriangles: number;
}
export interface FrustumLodSelectionResult {
  readonly visibleItems: readonly VisibleLodObject[];
  readonly totalObjects: number; readonly visibleCount: number; readonly culledCount: number; readonly cullRatio01: number;
  readonly bvhNodesVisited: number; readonly bvhSubtreesPruned: number; readonly lodCounts: readonly [number, number, number, number];
  readonly rawTrianglesTotal: number; readonly visibleRawTriangles: number; readonly effectiveLodTriangles: number; readonly triangleReductionRatio01: number;
}
export interface GpuInstancedBatch {
  readonly batchKey: string; readonly assetId: string; readonly materialId: string; readonly isImpostorAtlas: boolean;
  readonly instanceCount: number; readonly lodBreakdown: readonly [number, number, number, number];
  readonly totalEffectiveTriangles: number; readonly packedInstanceMatrices: Float32Array; readonly wasm64Handle: Scene3dWasm64AllocationHandle | null;
}
export interface GpuInstancingPlan {
  readonly batches: readonly GpuInstancedBatch[]; readonly totalSceneObjects: number; readonly visibleInstances: number;
  readonly naiveDrawCalls: number; readonly instancedDrawCalls: number;
  readonly drawCallReductionVsTotal01: number; readonly drawCallReductionVsVisible01: number; readonly uploadedInstanceBytes: number;
}
export interface Progressive3dAssetStreamEntry {
  readonly assetId: string; readonly priorityScore: number; readonly closestDistance: number; readonly instanceCount: number;
  readonly targetMipLevel: 0 | 1 | 2 | 3; readonly compressionFormat: "ktx2-uastc+meshopt" | "ktx2-etc1s+meshopt" | "impostor-ktx2";
  readonly tier: ProgressiveStreamTier; readonly rawUncompressedBytes: number; readonly allocatedVramBytes: number;
}
export interface Progressive3dAssetStreamPlan {
  readonly entries: readonly Progressive3dAssetStreamEntry[];
  readonly vramBudgetBytes: number; readonly allocatedVramBytes: number; readonly rawUncompressedVramBytes: number;
  readonly vramUtilization01: number; readonly ktx2MeshoptSavingsRatio01: number; readonly budgetRespected: boolean; readonly downgradedCount: number;
}

interface Memory64InitDescriptor { readonly address: "i64"; readonly initial: bigint; readonly maximum: bigint }
interface Memory32InitDescriptor { readonly address: "i32"; readonly initial: number; readonly maximum: number }
type WasmMemoryCtor = new (d: Memory64InitDescriptor | Memory32InitDescriptor) => WebAssembly.Memory;
interface FrustumPlane { readonly nx: number; readonly ny: number; readonly nz: number; readonly d: number }

const MEMORY64_PROBE_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x04, 0x01, 0x05, 0x01, 0x02]);
const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const alignUp16 = (v: bigint): bigint => (v + BigInt(15)) & ~BigInt(15);

function probeMemory64Support(wa: typeof WebAssembly | null): boolean {
  if (!wa) return false;
  try {
    if (!wa.validate(MEMORY64_PROBE_BYTES)) return false;
    const MemoryCtor = wa.Memory as unknown as WasmMemoryCtor;
    const mem = new MemoryCtor({ address: "i64", initial: BigInt(1), maximum: BigInt(2) });
    const prev = (mem.grow as unknown as (delta: bigint) => bigint)(BigInt(1));
    return typeof prev === "bigint" && prev === BigInt(1) && mem.buffer.byteLength === SCENE3D_WASM_PAGE_BYTES * 2;
  } catch {
    return false;
  }
}

/** 64비트 선형 메모리(memory64) 3D 아레나 매니저 (미지원 시 Wasm32 자동 폴백 · resetArena() 0-GC 재사용). */
export class Scene3dWasm64MemoryPool {
  public readonly memory: WebAssembly.Memory;
  public readonly addressMode: Scene3dWasmAddressMode;
  public readonly isMemory64: boolean;
  public readonly fallbackReason: string | null;
  public readonly maximumPages: bigint;

  private writeCursorBytes: bigint = BigInt(0);
  private allocationCount = 0; private growCount = 0; private bufferGeneration = 0; private zeroGcResetCount = 0;
  private storedVertexCount = 0; private storedAabbCount = 0; private storedInstanceCount = 0;

  public constructor(options: Scene3dWasm64PoolOptions = {}) {
    const wa = options.webAssembly === undefined ? (typeof WebAssembly === "object" ? WebAssembly : null) : options.webAssembly;
    if (!wa) throw new Error("WebAssembly 런타임이 존재하지 않아 3D 선형 메모리 풀을 생성할 수 없습니다.");
    const initialPages = Math.max(1, Math.floor(options.initialPages ?? 4));
    const forceMode = options.forceAddressMode ?? "auto";
    const MemoryCtor = wa.Memory as unknown as WasmMemoryCtor;
    const canUse64 = (forceMode === "auto" || forceMode === "i64") && probeMemory64Support(wa);

    if (canUse64) {
      const reqMax = options.maximumPages ?? SCENE3D_WASM64_DEFAULT_MAX_PAGES;
      this.maximumPages = reqMax < BigInt(initialPages) ? BigInt(initialPages) : reqMax;
      this.memory = new MemoryCtor({ address: "i64", initial: BigInt(initialPages), maximum: this.maximumPages });
      this.addressMode = "i64"; this.isMemory64 = true; this.fallbackReason = null;
    } else {
      if (forceMode === "i64") throw new Error("요청한 Wasm64(memory64)가 현재 호스트에서 지원되지 않습니다.");
      const reqMax = options.maximumPages ?? SCENE3D_WASM32_DEFAULT_MAX_PAGES;
      const capped = reqMax > SCENE3D_WASM32_DEFAULT_MAX_PAGES ? SCENE3D_WASM32_DEFAULT_MAX_PAGES : reqMax;
      this.maximumPages = capped < BigInt(initialPages) ? BigInt(initialPages) : capped;
      this.memory = new MemoryCtor({ address: "i32", initial: initialPages, maximum: Number(this.maximumPages) });
      this.addressMode = "i32"; this.isMemory64 = false;
      this.fallbackReason = forceMode === "i32" ? "explicit-i32-requested" : "memory64-unsupported";
    }
  }

  public ensureCapacityBytes(requiredBytes: bigint): void {
    const currentBytes = BigInt(this.memory.buffer.byteLength);
    if (requiredBytes <= currentBytes) return;
    const neededPages = (requiredBytes + SCENE3D_WASM_PAGE_BYTES_BIGINT - BigInt(1)) / SCENE3D_WASM_PAGE_BYTES_BIGINT;
    if (neededPages > this.maximumPages) {
      throw new RangeError(`3D 선형 메모리 상한 초과: 필요 ${neededPages.toString()}p > 최대 ${this.maximumPages.toString()}p`);
    }
    const currentPages = currentBytes / SCENE3D_WASM_PAGE_BYTES_BIGINT;
    let targetPages = currentPages === BigInt(0) ? BigInt(1) : currentPages;
    while (targetPages < neededPages) targetPages = targetPages * BigInt(2);
    if (targetPages > this.maximumPages) targetPages = this.maximumPages;
    const delta = targetPages - currentPages;
    if (delta <= BigInt(0)) return;
    if (this.isMemory64) (this.memory.grow as unknown as (d: bigint) => bigint)(delta);
    else this.memory.grow(Number(delta));
    this.growCount += 1; this.bufferGeneration += 1;
  }

  private allocateBlock(kind: "vertex" | "aabb" | "instance", count: number, strideFloats: number): Scene3dWasm64AllocationHandle {
    const safeCount = Math.max(0, Math.floor(count));
    const floatLength = safeCount * strideFloats;
    const byteLength = floatLength * 4;
    const byteOffset = alignUp16(this.writeCursorBytes);
    const nextCursor = byteOffset + BigInt(byteLength);
    this.ensureCapacityBytes(nextCursor);
    this.writeCursorBytes = nextCursor; this.allocationCount += 1;
    return { kind, byteOffset, byteLength, elementCount: safeCount, floatLength };
  }

  public writeVertices(vertices: Float32Array): Scene3dWasm64AllocationHandle {
    const count = Math.floor(vertices.length / SCENE3D_VERTEX_STRIDE_FLOATS);
    const handle = this.allocateBlock("vertex", count, SCENE3D_VERTEX_STRIDE_FLOATS);
    new Float32Array(this.memory.buffer, Number(handle.byteOffset), handle.floatLength).set(vertices.subarray(0, handle.floatLength));
    this.storedVertexCount += count;
    return handle;
  }

  public writeObjectAabbs(objects: readonly Scene3dObject[]): Scene3dWasm64AllocationHandle {
    const handle = this.allocateBlock("aabb", objects.length, SCENE3D_AABB_STRIDE_FLOATS);
    const view = new Float32Array(this.memory.buffer, Number(handle.byteOffset), handle.floatLength);
    for (let i = 0; i < objects.length; i += 1) {
      const a = objects[i]?.aabb;
      if (!a) continue;
      const b = i * 6;
      view[b] = a.minX; view[b + 1] = a.minY; view[b + 2] = a.minZ; view[b + 3] = a.maxX; view[b + 4] = a.maxY; view[b + 5] = a.maxZ;
    }
    this.storedAabbCount += objects.length;
    return handle;
  }

  public writeInstanceMatrices(matrices: Float32Array): Scene3dWasm64AllocationHandle {
    const count = Math.floor(matrices.length / SCENE3D_INSTANCE_MATRIX_FLOATS);
    const handle = this.allocateBlock("instance", count, SCENE3D_INSTANCE_MATRIX_FLOATS);
    new Float32Array(this.memory.buffer, Number(handle.byteOffset), handle.floatLength).set(matrices.subarray(0, handle.floatLength));
    this.storedInstanceCount += count;
    return handle;
  }

  public readFloat32View(handle: Scene3dWasm64AllocationHandle): Float32Array {
    return new Float32Array(this.memory.buffer, Number(handle.byteOffset), handle.floatLength);
  }

  /** 커밋된 선형 메모리를 유지한 채 쓰기 커서만 0으로 되돌려 0-GC 프레임 재사용을 수행한다. */
  public resetArena(): void {
    this.writeCursorBytes = BigInt(0); this.allocationCount = 0;
    this.storedVertexCount = 0; this.storedAabbCount = 0; this.storedInstanceCount = 0;
    this.zeroGcResetCount += 1;
  }

  public getTelemetry(): Scene3dWasm64PoolTelemetry {
    const committedBytes = this.memory.buffer.byteLength;
    const usedBytes = Number(this.writeCursorBytes);
    return {
      addressMode: this.addressMode, isMemory64: this.isMemory64, fallbackReason: this.fallbackReason,
      committedPages: BigInt(committedBytes) / SCENE3D_WASM_PAGE_BYTES_BIGINT, maximumPages: this.maximumPages,
      committedBytes, reservedMaxBytes: this.maximumPages * SCENE3D_WASM_PAGE_BYTES_BIGINT,
      usedBytes, utilization01: committedBytes > 0 ? clamp01(usedBytes / committedBytes) : 0,
      allocationCount: this.allocationCount, growCount: this.growCount, bufferGeneration: this.bufferGeneration,
      zeroGcResetCount: this.zeroGcResetCount, storedVertexCount: this.storedVertexCount,
      storedAabbCount: this.storedAabbCount, storedInstanceCount: this.storedInstanceCount,
    };
  }
}

// ---------------------------------------------------------------------------
// SAH BVH 가속 구조 · 비재귀 광선 교차 · 계층 프러스텀 컬링 · 4단계 오토 LOD
// ---------------------------------------------------------------------------

const BVH_LEAF_MAX = 4;
const SAH_BINS = 8;

const boxSurfaceArea = (buf: Float32Array, o: number): number => {
  const dx = Math.max(0, (buf[o + 3] ?? 0) - (buf[o] ?? 0));
  const dy = Math.max(0, (buf[o + 4] ?? 0) - (buf[o + 1] ?? 0));
  const dz = Math.max(0, (buf[o + 5] ?? 0) - (buf[o + 2] ?? 0));
  return 2 * (dx * dy + dy * dz + dz * dx);
};
const resetBox = (buf: Float32Array, o: number): void => {
  buf[o] = Infinity; buf[o + 1] = Infinity; buf[o + 2] = Infinity; buf[o + 3] = -Infinity; buf[o + 4] = -Infinity; buf[o + 5] = -Infinity;
};
const expandBoxAabb = (buf: Float32Array, o: number, a: Aabb3d): void => {
  if (a.minX < (buf[o] ?? 0)) buf[o] = a.minX; if (a.minY < (buf[o + 1] ?? 0)) buf[o + 1] = a.minY; if (a.minZ < (buf[o + 2] ?? 0)) buf[o + 2] = a.minZ;
  if (a.maxX > (buf[o + 3] ?? 0)) buf[o + 3] = a.maxX; if (a.maxY > (buf[o + 4] ?? 0)) buf[o + 4] = a.maxY; if (a.maxZ > (buf[o + 5] ?? 0)) buf[o + 5] = a.maxZ;
};
const expandBoxCopy = (dst: Float32Array, d: number, src: Float32Array, s: number): void => {
  for (let k = 0; k < 3; k += 1) {
    if ((src[s + k] ?? 0) < (dst[d + k] ?? 0)) dst[d + k] = src[s + k] ?? 0;
    if ((src[s + 3 + k] ?? 0) > (dst[d + 3 + k] ?? 0)) dst[d + 3 + k] = src[s + 3 + k] ?? 0;
  }
};
const centroidCoord = (obj: Scene3dObject, axis: number): number => (axis === 0 ? obj.center.x : axis === 1 ? obj.center.y : obj.center.z);

/** Surface Area Heuristic(SAH) 8-빈 분할로 평탄화된 캐시 친화적 BVH를 구축한다. */
export function buildScene3dBvh(objects: readonly Scene3dObject[]): Scene3dBvh {
  const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const count = objects.length;
  const orderedIndices = new Int32Array(count);
  for (let i = 0; i < count; i += 1) orderedIndices[i] = i;
  if (count === 0) {
    return {
      objects, orderedIndices, nodeBounds: new Float32Array(6), nodeLeftOrFirst: new Int32Array(1), nodeRightOrCount: new Int32Array(1),
      nodeCount: 0, leafCount: 0, maxDepth: 0, sahCost: 0, buildTimeMs: 0, rootAabb: { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 },
    };
  }

  const maxNodes = Math.max(1, count * 2);
  const nodeBounds = new Float32Array(maxNodes * 6);
  const nodeLeftOrFirst = new Int32Array(maxNodes);
  const nodeRightOrCount = new Int32Array(maxNodes);
  const binCounts = new Int32Array(SAH_BINS);
  const binBounds = new Float32Array(SAH_BINS * 6);
  const sweepBox = new Float32Array(6);
  const leftArea = new Float32Array(SAH_BINS - 1);
  const leftCount = new Int32Array(SAH_BINS - 1);
  const cBox = new Float32Array(6);
  let nodeCount = 0; let leafCount = 0; let maxDepth = 0;

  function buildNode(start: number, end: number, depth: number): number {
    const nodeIdx = nodeCount++;
    if (depth > maxDepth) maxDepth = depth;
    const bo = nodeIdx * 6;
    resetBox(nodeBounds, bo); resetBox(cBox, 0);
    for (let i = start; i < end; i += 1) {
      const obj = objects[orderedIndices[i] ?? 0];
      if (!obj) continue;
      expandBoxAabb(nodeBounds, bo, obj.aabb);
      const { x, y, z } = obj.center;
      if (x < (cBox[0] ?? 0)) cBox[0] = x; if (y < (cBox[1] ?? 0)) cBox[1] = y; if (z < (cBox[2] ?? 0)) cBox[2] = z;
      if (x > (cBox[3] ?? 0)) cBox[3] = x; if (y > (cBox[4] ?? 0)) cBox[4] = y; if (z > (cBox[5] ?? 0)) cBox[5] = z;
    }

    const span = end - start;
    if (span <= BVH_LEAF_MAX || depth >= 28) {
      nodeLeftOrFirst[nodeIdx] = start; nodeRightOrCount[nodeIdx] = -span; leafCount += 1;
      return nodeIdx;
    }

    const e0 = (cBox[3] ?? 0) - (cBox[0] ?? 0); const e1 = (cBox[4] ?? 0) - (cBox[1] ?? 0); const e2 = (cBox[5] ?? 0) - (cBox[2] ?? 0);
    const axis = e0 >= e1 && e0 >= e2 ? 0 : e1 >= e2 ? 1 : 2;
    const axisMin = cBox[axis] ?? 0;
    const axisExt = axis === 0 ? e0 : axis === 1 ? e1 : e2;
    let splitIdx = start + (span >> 1);

    if (axisExt > 1e-5) {
      binCounts.fill(0);
      for (let b = 0; b < SAH_BINS; b += 1) resetBox(binBounds, b * 6);
      const scale = SAH_BINS / axisExt;
      for (let i = start; i < end; i += 1) {
        const obj = objects[orderedIndices[i] ?? 0];
        if (!obj) continue;
        const bin = Math.min(SAH_BINS - 1, Math.max(0, Math.floor((centroidCoord(obj, axis) - axisMin) * scale)));
        binCounts[bin] = (binCounts[bin] ?? 0) + 1;
        expandBoxAabb(binBounds, bin * 6, obj.aabb);
      }
      resetBox(sweepBox, 0);
      for (let b = 0, accL = 0; b < SAH_BINS - 1; b += 1) {
        const cnt = binCounts[b] ?? 0;
        if (cnt > 0) { expandBoxCopy(sweepBox, 0, binBounds, b * 6); accL += cnt; }
        leftCount[b] = accL; leftArea[b] = accL > 0 ? boxSurfaceArea(sweepBox, 0) : 0;
      }
      resetBox(sweepBox, 0);
      let bestCost = Infinity; let bestBin = -1;
      for (let b = SAH_BINS - 1, accR = 0; b >= 1; b -= 1) {
        const cnt = binCounts[b] ?? 0;
        if (cnt > 0) { expandBoxCopy(sweepBox, 0, binBounds, b * 6); accR += cnt; }
        const lc = leftCount[b - 1] ?? 0;
        if (lc > 0 && accR > 0) {
          const cost = lc * (leftArea[b - 1] ?? 0) + accR * boxSurfaceArea(sweepBox, 0);
          if (cost < bestCost) { bestCost = cost; bestBin = b; }
        }
      }
      if (bestBin > 0) {
        const splitPos = axisMin + (bestBin * axisExt) / SAH_BINS;
        let i = start; let j = end - 1;
        while (i <= j) {
          const obj = objects[orderedIndices[i] ?? 0];
          if (obj && centroidCoord(obj, axis) < splitPos) i += 1;
          else { const tmp = orderedIndices[i] ?? 0; orderedIndices[i] = orderedIndices[j] ?? 0; orderedIndices[j] = tmp; j -= 1; }
        }
        if (i > start && i < end) splitIdx = i;
      }
    }

    nodeLeftOrFirst[nodeIdx] = buildNode(start, splitIdx, depth + 1);
    nodeRightOrCount[nodeIdx] = buildNode(splitIdx, end, depth + 1);
    return nodeIdx;
  }

  buildNode(0, count, 1);
  const rootArea = Math.max(1e-6, boxSurfaceArea(nodeBounds, 0));
  let sahCost = 0;
  for (let n = 0; n < nodeCount; n += 1) {
    const rc = nodeRightOrCount[n] ?? 0;
    sahCost += (boxSurfaceArea(nodeBounds, n * 6) / rootArea) * (rc < 0 ? -rc : 1.25);
  }
  const endMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  return {
    objects, orderedIndices, nodeBounds: nodeBounds.subarray(0, nodeCount * 6),
    nodeLeftOrFirst: nodeLeftOrFirst.subarray(0, nodeCount), nodeRightOrCount: nodeRightOrCount.subarray(0, nodeCount),
    nodeCount, leafCount, maxDepth, sahCost, buildTimeMs: Math.max(0, endMs - startMs),
    rootAabb: { minX: nodeBounds[0] ?? 0, minY: nodeBounds[1] ?? 0, minZ: nodeBounds[2] ?? 0, maxX: nodeBounds[3] ?? 0, maxY: nodeBounds[4] ?? 0, maxZ: nodeBounds[5] ?? 0 },
  };
}

function intersectRayBox(
  ox: number, oy: number, oz: number, invX: number, invY: number, invZ: number,
  minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, tLimit: number,
): number {
  const tx1 = (minX - ox) * invX; const tx2 = (maxX - ox) * invX;
  const ty1 = (minY - oy) * invY; const ty2 = (maxY - oy) * invY;
  const tz1 = (minZ - oz) * invZ; const tz2 = (maxZ - oz) * invZ;
  const tMin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2), Math.min(tz1, tz2));
  const tMax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2), Math.max(tz1, tz2));
  return tMax < Math.max(0, tMin) || tMin > tLimit ? Infinity : tMin >= 0 ? tMin : tMax;
}

/** 비재귀 고정 스택으로 BVH 광선 교차를 수행해 최근접 오브젝트와 노드 프루닝 비율을 반환한다. */
export function raycastScene3dBvh(bvh: Scene3dBvh, origin: Vec3, direction: Vec3, maxDistance = 2000): Scene3dRaycastResult {
  if (bvh.nodeCount === 0) return { hit: null, visitedNodes: 0, testedObjects: 0, prunedRatio01: 1 };
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const dx = direction.x / len; const dy = direction.y / len; const dz = direction.z / len;
  const invX = Math.abs(dx) > 1e-12 ? 1 / dx : (dx >= 0 ? 1e12 : -1e12);
  const invY = Math.abs(dy) > 1e-12 ? 1 / dy : (dy >= 0 ? 1e12 : -1e12);
  const invZ = Math.abs(dz) > 1e-12 ? 1 / dz : (dz >= 0 ? 1e12 : -1e12);

  const stack = new Int32Array(64);
  let top = 1; let closestT = maxDistance; let closestIdx = -1; let visitedNodes = 0; let testedObjects = 0;
  const rayNode = (n: number): number => {
    const b = n * 6;
    return intersectRayBox(origin.x, origin.y, origin.z, invX, invY, invZ,
      bvh.nodeBounds[b] ?? 0, bvh.nodeBounds[b + 1] ?? 0, bvh.nodeBounds[b + 2] ?? 0,
      bvh.nodeBounds[b + 3] ?? 0, bvh.nodeBounds[b + 4] ?? 0, bvh.nodeBounds[b + 5] ?? 0, closestT);
  };

  while (top > 0) {
    const nodeIdx = stack[--top] ?? 0;
    if (rayNode(nodeIdx) === Infinity) continue;
    visitedNodes += 1;
    const rc = bvh.nodeRightOrCount[nodeIdx] ?? 0;
    if (rc < 0) {
      const first = bvh.nodeLeftOrFirst[nodeIdx] ?? 0;
      for (let i = 0; i < -rc; i += 1) {
        const objIdx = bvh.orderedIndices[first + i] ?? 0;
        const obj = bvh.objects[objIdx];
        if (!obj) continue;
        testedObjects += 1;
        const t = intersectRayBox(origin.x, origin.y, origin.z, invX, invY, invZ,
          obj.aabb.minX, obj.aabb.minY, obj.aabb.minZ, obj.aabb.maxX, obj.aabb.maxY, obj.aabb.maxZ, closestT);
        if (t < closestT) { closestT = t; closestIdx = objIdx; }
      }
    } else {
      const lc = bvh.nodeLeftOrFirst[nodeIdx] ?? 0;
      const tL = rayNode(lc); const tR = rayNode(rc);
      if (tL < tR) {
        if (tR < Infinity && top < 64) stack[top++] = rc;
        if (tL < Infinity && top < 64) stack[top++] = lc;
      } else {
        if (tL < Infinity && top < 64) stack[top++] = lc;
        if (tR < Infinity && top < 64) stack[top++] = rc;
      }
    }
  }
  const hitObj = closestIdx >= 0 ? bvh.objects[closestIdx] : undefined;
  return {
    hit: hitObj ? { objectIndex: closestIdx, objectId: hitObj.id, assetId: hitObj.assetId, distance: closestT, hitPoint: { x: origin.x + dx * closestT, y: origin.y + dy * closestT, z: origin.z + dz * closestT } } : null,
    visitedNodes, testedObjects, prunedRatio01: bvh.nodeCount > 0 ? clamp01(1 - visitedNodes / bvh.nodeCount) : 1,
  };
}

const normVec = (x: number, y: number, z: number): Vec3 => { const l = Math.hypot(x, y, z) || 1; return { x: x / l, y: y / l, z: z / l }; };
const makePlane = (nx: number, ny: number, nz: number, p: Vec3): FrustumPlane => {
  const n = normVec(nx, ny, nz);
  return { nx: n.x, ny: n.y, nz: n.z, d: -(n.x * p.x + n.y * p.y + n.z * p.z) };
};

function extractFrustumPlanes(cam: Scene3dCamera): readonly FrustumPlane[] {
  const up = cam.up ?? { x: 0, y: 1, z: 0 };
  const fwd = normVec(cam.target.x - cam.position.x, cam.target.y - cam.position.y, cam.target.z - cam.position.z);
  const right = normVec(fwd.y * up.z - fwd.z * up.y, fwd.z * up.x - fwd.x * up.z, fwd.x * up.y - fwd.y * up.x);
  const trueUp = { x: right.y * fwd.z - right.z * fwd.y, y: right.z * fwd.x - right.x * fwd.z, z: right.x * fwd.y - right.y * fwd.x };
  const halfV = ((cam.fovYDeg * Math.PI) / 180) * 0.5;
  const halfH = Math.atan(Math.tan(halfV) * Math.max(0.25, cam.aspect));
  const sinV = Math.sin(halfV); const cosV = Math.cos(halfV); const sinH = Math.sin(halfH); const cosH = Math.cos(halfH);
  const nearPt = { x: cam.position.x + fwd.x * cam.near, y: cam.position.y + fwd.y * cam.near, z: cam.position.z + fwd.z * cam.near };
  const farPt = { x: cam.position.x + fwd.x * cam.far, y: cam.position.y + fwd.y * cam.far, z: cam.position.z + fwd.z * cam.far };
  return [
    makePlane(fwd.x, fwd.y, fwd.z, nearPt), makePlane(-fwd.x, -fwd.y, -fwd.z, farPt),
    makePlane(fwd.x * sinH + right.x * cosH, fwd.y * sinH + right.y * cosH, fwd.z * sinH + right.z * cosH, cam.position),
    makePlane(fwd.x * sinH - right.x * cosH, fwd.y * sinH - right.y * cosH, fwd.z * sinH - right.z * cosH, cam.position),
    makePlane(fwd.x * sinV + trueUp.x * cosV, fwd.y * sinV + trueUp.y * cosV, fwd.z * sinV + trueUp.z * cosV, cam.position),
    makePlane(fwd.x * sinV - trueUp.x * cosV, fwd.y * sinV - trueUp.y * cosV, fwd.z * sinV - trueUp.z * cosV, cam.position),
  ];
}

function classifyBoxFrustum(planes: readonly FrustumPlane[], minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): -1 | 0 | 1 {
  let allInside = true;
  for (let i = 0; i < planes.length; i += 1) {
    const p = planes[i];
    if (!p) continue;
    if (p.nx * (p.nx >= 0 ? maxX : minX) + p.ny * (p.ny >= 0 ? maxY : minY) + p.nz * (p.nz >= 0 ? maxZ : minZ) + p.d < 0) return -1;
    if (p.nx * (p.nx >= 0 ? minX : maxX) + p.ny * (p.ny >= 0 ? minY : maxY) + p.nz * (p.nz >= 0 ? minZ : maxZ) + p.d < 0) allInside = false;
  }
  return allInside ? 1 : 0;
}

/** BVH 계층 프러스텀 컬링 + 화면 점유율(screenCoverage01) 기반 4단계 시선 오토 LOD 선택기. */
export function cullFrustumAndSelectLod(bvh: Scene3dBvh, camera: Scene3dCamera, lodAggressiveness = 0.5): FrustumLodSelectionResult {
  const agg = clamp01(lodAggressiveness);
  let rawTrianglesTotal = 0;
  for (let i = 0; i < bvh.objects.length; i += 1) rawTrianglesTotal += bvh.objects[i]?.baseTriangleCount ?? 0;
  if (bvh.nodeCount === 0) {
    return {
      visibleItems: [], totalObjects: 0, visibleCount: 0, culledCount: 0, cullRatio01: 0, bvhNodesVisited: 0, bvhSubtreesPruned: 0,
      lodCounts: [0, 0, 0, 0], rawTrianglesTotal: 0, visibleRawTriangles: 0, effectiveLodTriangles: 0, triangleReductionRatio01: 0,
    };
  }

  const planes = extractFrustumPlanes(camera);
  const tanHalfFov = Math.max(0.1, Math.tan(((camera.fovYDeg * Math.PI) / 180) * 0.5));
  const t0 = 0.14 + agg * 0.16; const t1 = 0.055 + agg * 0.085; const t2 = 0.02 + agg * 0.035;
  const visibleItems: VisibleLodObject[] = [];
  const lodCounts: [number, number, number, number] = [0, 0, 0, 0];
  let visibleRawTriangles = 0; let effectiveLodTriangles = 0; let bvhNodesVisited = 0; let bvhSubtreesPruned = 0;
  const nodeStack = new Int32Array(64);
  const insideStack = new Uint8Array(64);
  let top = 1;

  while (top > 0) {
    top -= 1;
    const nodeIdx = nodeStack[top] ?? 0;
    let fullyInside = (insideStack[top] ?? 0) === 1;
    bvhNodesVisited += 1;
    if (!fullyInside) {
      const bo = nodeIdx * 6;
      const cls = classifyBoxFrustum(planes,
        bvh.nodeBounds[bo] ?? 0, bvh.nodeBounds[bo + 1] ?? 0, bvh.nodeBounds[bo + 2] ?? 0,
        bvh.nodeBounds[bo + 3] ?? 0, bvh.nodeBounds[bo + 4] ?? 0, bvh.nodeBounds[bo + 5] ?? 0);
      if (cls === -1) { bvhSubtreesPruned += 1; continue; }
      if (cls === 1) fullyInside = true;
    }

    const rc = bvh.nodeRightOrCount[nodeIdx] ?? 0;
    if (rc < 0) {
      const first = bvh.nodeLeftOrFirst[nodeIdx] ?? 0;
      for (let i = 0; i < -rc; i += 1) {
        const objIdx = bvh.orderedIndices[first + i] ?? 0;
        const obj = bvh.objects[objIdx];
        if (!obj) continue;
        if (!fullyInside && classifyBoxFrustum(planes, obj.aabb.minX, obj.aabb.minY, obj.aabb.minZ, obj.aabb.maxX, obj.aabb.maxY, obj.aabb.maxZ) === -1) continue;
        const dist = Math.max(camera.near, Math.hypot(obj.center.x - camera.position.x, obj.center.y - camera.position.y, obj.center.z - camera.position.z));
        const cov = clamp01((obj.boundingRadius * (obj.importanceWeight ?? 1)) / (dist * tanHalfFov));
        const lodLevel: Scene3dLodLevel = cov >= t0 ? 0 : cov >= t1 ? 1 : cov >= t2 ? 2 : 3;
        const lodTriangleRatio = SCENE3D_LOD_TRIANGLE_RATIOS[lodLevel];
        const effectiveTriangles = Math.max(2, Math.round(obj.baseTriangleCount * lodTriangleRatio));
        lodCounts[lodLevel] += 1; visibleRawTriangles += obj.baseTriangleCount; effectiveLodTriangles += effectiveTriangles;
        visibleItems.push({ object: obj, objectIndex: objIdx, distance: dist, screenCoverage01: cov, lodLevel, lodTriangleRatio, effectiveTriangles });
      }
    } else if (top + 2 <= 64) {
      nodeStack[top] = rc; insideStack[top] = fullyInside ? 1 : 0; top += 1;
      nodeStack[top] = bvh.nodeLeftOrFirst[nodeIdx] ?? 0; insideStack[top] = fullyInside ? 1 : 0; top += 1;
    }
  }

  const totalObjects = bvh.objects.length; const visibleCount = visibleItems.length; const culledCount = Math.max(0, totalObjects - visibleCount);
  return {
    visibleItems, totalObjects, visibleCount, culledCount, cullRatio01: totalObjects > 0 ? culledCount / totalObjects : 0,
    bvhNodesVisited, bvhSubtreesPruned, lodCounts, rawTrianglesTotal, visibleRawTriangles, effectiveLodTriangles,
    triangleReductionRatio01: rawTrianglesTotal > 0 ? clamp01(1 - effectiveLodTriangles / rawTrianglesTotal) : 0,
  };
}

// ---------------------------------------------------------------------------
// 자동 GPU Instancing 배칭 + KTX2/BasisU · Meshopt 점진 스트리밍 + 1,000개 씬 생성기
// ---------------------------------------------------------------------------

/** 동일 에셋·머티리얼을 GPU Instancing 배치로 통합해 1,000개 반복 소품을 12개 이하 드로우콜로 압축한다. */
export function planGpuInstancedBatches(
  selection: FrustumLodSelectionResult,
  options: { readonly memoryPool?: Scene3dWasm64MemoryPool; readonly maxDrawCalls?: number } = {},
): GpuInstancingPlan {
  const maxDrawCalls = Math.max(2, Math.floor(options.maxDrawCalls ?? 12));
  const grouped = new Map<string, VisibleLodObject[]>();
  for (const item of selection.visibleItems) {
    const key = `${item.object.assetId}::${item.object.materialId}`;
    const list = grouped.get(key);
    if (list) list.push(item); else grouped.set(key, [item]);
  }
  if (grouped.size > maxDrawCalls) {
    const impostors: VisibleLodObject[] = [];
    for (const [key, items] of [...grouped.entries()]) {
      const kept = items.filter((it) => (it.lodLevel === 3 ? (impostors.push(it), false) : true));
      if (kept.length === 0) grouped.delete(key); else grouped.set(key, kept);
    }
    if (impostors.length > 0) grouped.set("__impostor-atlas__::impostor-card", impostors);
  }

  const batches: GpuInstancedBatch[] = [];
  let uploadedInstanceBytes = 0;
  for (const [batchKey, items] of [...grouped.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const first = items[0];
    if (!first) continue;
    const isImpostorAtlas = batchKey.startsWith("__impostor-atlas__");
    const lodBreakdown: [number, number, number, number] = [0, 0, 0, 0];
    let totalEffectiveTriangles = 0;
    const packed = new Float32Array(items.length * SCENE3D_INSTANCE_MATRIX_FLOATS);
    for (let i = 0; i < items.length; i += 1) {
      const it = items[i];
      if (!it) continue;
      lodBreakdown[it.lodLevel] += 1; totalEffectiveTriangles += it.effectiveTriangles;
      const off = i * 16; const mat = it.object.transformMatrix16;
      if (mat && mat.length === 16) { for (let m = 0; m < 16; m += 1) packed[off + m] = mat[m] ?? 0; }
      else {
        packed[off] = 1; packed[off + 5] = 1; packed[off + 10] = 1; packed[off + 15] = 1;
        packed[off + 12] = it.object.center.x; packed[off + 13] = it.object.center.y; packed[off + 14] = it.object.center.z;
      }
    }
    const wasm64Handle = options.memoryPool ? options.memoryPool.writeInstanceMatrices(packed) : null;
    uploadedInstanceBytes += packed.byteLength;
    batches.push({
      batchKey, assetId: isImpostorAtlas ? "__impostor-atlas__" : first.object.assetId,
      materialId: isImpostorAtlas ? "impostor-card" : first.object.materialId,
      isImpostorAtlas, instanceCount: items.length, lodBreakdown, totalEffectiveTriangles, packedInstanceMatrices: packed, wasm64Handle,
    });
  }
  const instancedDrawCalls = batches.length; const naiveDrawCalls = selection.visibleCount;
  return {
    batches, totalSceneObjects: selection.totalObjects, visibleInstances: selection.visibleCount,
    naiveDrawCalls, instancedDrawCalls, uploadedInstanceBytes,
    drawCallReductionVsTotal01: selection.totalObjects > 0 ? clamp01(1 - instancedDrawCalls / selection.totalObjects) : 0,
    drawCallReductionVsVisible01: naiveDrawCalls > 0 ? clamp01(1 - instancedDrawCalls / naiveDrawCalls) : 0,
  };
}

/** 뷰포트 거리 우선순위로 KTX2/BasisU·Meshopt 에셋을 점진 스트리밍하고 VRAM 상한(<= 256 MiB)을 강제한다. */
export function planProgressive3dAssetStream(selection: FrustumLodSelectionResult, vramBudgetMiB = SCENE3D_DEFAULT_VRAM_BUDGET_MIB): Progressive3dAssetStreamPlan {
  const vramBudgetBytes = Math.floor(Math.max(0.5, Math.min(SCENE3D_DEFAULT_VRAM_BUDGET_MIB, vramBudgetMiB)) * 1024 * 1024);
  const stats = new Map<string, { closestDistance: number; maxCoverage: number; instanceCount: number; rawTexBytes: number; ktx2Bytes: number; meshoptBytes: number; bestLod: Scene3dLodLevel }>();
  for (const { object, distance, screenCoverage01, lodLevel } of selection.visibleItems) {
    const p = stats.get(object.assetId);
    if (!p) stats.set(object.assetId, { closestDistance: distance, maxCoverage: screenCoverage01, instanceCount: 1, rawTexBytes: object.textureBytesLod0, ktx2Bytes: object.ktx2Bytes, meshoptBytes: object.meshoptBytes, bestLod: lodLevel });
    else { p.closestDistance = Math.min(p.closestDistance, distance); p.maxCoverage = Math.max(p.maxCoverage, screenCoverage01); p.instanceCount += 1; if (lodLevel < p.bestLod) p.bestLod = lodLevel; }
  }
  const prioritized = [...stats.entries()]
    .map(([assetId, s]) => ({ assetId, ...s, priorityScore: (s.maxCoverage * 100 + Math.log2(s.instanceCount + 1) * 8) / Math.max(1, s.closestDistance * 0.1) }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  let allocatedVramBytes = 0; let rawUncompressedVramBytes = 0; let downgradedCount = 0;
  const entries: Progressive3dAssetStreamEntry[] = [];
  for (const asset of prioritized) {
    const rawBytes = asset.rawTexBytes + Math.round(asset.meshoptBytes * 3.8);
    rawUncompressedVramBytes += rawBytes;
    const fullCost = asset.ktx2Bytes + asset.meshoptBytes;
    const midCost = Math.round(asset.ktx2Bytes * 0.35 + asset.meshoptBytes * 0.5);
    const lowCost = Math.round(asset.ktx2Bytes * 0.14 + asset.meshoptBytes * 0.25);
    const impCost = Math.max(16 * 1024, Math.round(asset.ktx2Bytes * 0.05));
    const rem = vramBudgetBytes - allocatedVramBytes;
    let tier: ProgressiveStreamTier = "evicted-budget"; let targetMipLevel: 0 | 1 | 2 | 3 = 3;
    let compressionFormat: Progressive3dAssetStreamEntry["compressionFormat"] = "impostor-ktx2"; let cost = 0;
    if (asset.bestLod === 0 && fullCost <= rem) { tier = "resident-full"; targetMipLevel = 0; compressionFormat = "ktx2-uastc+meshopt"; cost = fullCost; }
    else if (asset.bestLod <= 1 && midCost <= rem) { tier = "stream-mid"; targetMipLevel = 1; compressionFormat = "ktx2-etc1s+meshopt"; cost = midCost; if (asset.bestLod === 0) downgradedCount += 1; }
    else if (lowCost <= rem) { tier = "stream-low"; targetMipLevel = 2; compressionFormat = "ktx2-etc1s+meshopt"; cost = lowCost; if (asset.bestLod < 2) downgradedCount += 1; }
    else if (impCost <= rem) { tier = "impostor-atlas"; targetMipLevel = 3; compressionFormat = "impostor-ktx2"; cost = impCost; downgradedCount += 1; }
    else { downgradedCount += 1; }
    allocatedVramBytes += cost;
    entries.push({ assetId: asset.assetId, priorityScore: Number(asset.priorityScore.toFixed(2)), closestDistance: Number(asset.closestDistance.toFixed(2)), instanceCount: asset.instanceCount, targetMipLevel, compressionFormat, tier, rawUncompressedBytes: rawBytes, allocatedVramBytes: cost });
  }
  return {
    entries, vramBudgetBytes, allocatedVramBytes, rawUncompressedVramBytes,
    vramUtilization01: vramBudgetBytes > 0 ? clamp01(allocatedVramBytes / vramBudgetBytes) : 0,
    ktx2MeshoptSavingsRatio01: rawUncompressedVramBytes > 0 ? clamp01(1 - allocatedVramBytes / rawUncompressedVramBytes) : 0,
    budgetRespected: allocatedVramBytes <= vramBudgetBytes, downgradedCount,
  };
}

const MB = 1024 * 1024; const KB = 1024;
const DEMO_ARCHETYPES: readonly { readonly assetId: string; readonly materialId: string; readonly halfExtent: Vec3; readonly baseTriangleCount: number; readonly textureBytesLod0: number; readonly ktx2Bytes: number; readonly meshoptBytes: number; readonly importanceWeight: number }[] = [
  { assetId: "hero-cafe-facade", materialId: "mat-plaster-npr", halfExtent: { x: 2.8, y: 3.4, z: 2.2 }, baseTriangleCount: 4200, textureBytesLod0: 16 * MB, ktx2Bytes: 2.8 * MB, meshoptBytes: 420 * KB, importanceWeight: 1.3 },
  { assetId: "street-lamp-post", materialId: "mat-painted-metal", halfExtent: { x: 0.45, y: 2.6, z: 0.45 }, baseTriangleCount: 1800, textureBytesLod0: 8 * MB, ktx2Bytes: 1.4 * MB, meshoptBytes: 180 * KB, importanceWeight: 1.0 },
  { assetId: "cafe-terrace-chair", materialId: "mat-wood-toon", halfExtent: { x: 0.4, y: 0.55, z: 0.4 }, baseTriangleCount: 1400, textureBytesLod0: 6 * MB, ktx2Bytes: 1.1 * MB, meshoptBytes: 140 * KB, importanceWeight: 0.95 },
  { assetId: "alley-vending-unit", materialId: "mat-gloss-enamel", halfExtent: { x: 0.65, y: 1.05, z: 0.45 }, baseTriangleCount: 2200, textureBytesLod0: 12 * MB, ktx2Bytes: 2.0 * MB, meshoptBytes: 230 * KB, importanceWeight: 1.1 },
  { assetId: "ginkgo-street-tree", materialId: "mat-foliage-card", halfExtent: { x: 1.7, y: 2.9, z: 1.7 }, baseTriangleCount: 3100, textureBytesLod0: 12 * MB, ktx2Bytes: 2.2 * MB, meshoptBytes: 310 * KB, importanceWeight: 1.0 },
  { assetId: "neon-shop-sign", materialId: "mat-emissive-sign", halfExtent: { x: 0.9, y: 0.45, z: 0.2 }, baseTriangleCount: 960, textureBytesLod0: 8 * MB, ktx2Bytes: 1.3 * MB, meshoptBytes: 95 * KB, importanceWeight: 1.05 },
  { assetId: "rooftop-ac-unit", materialId: "mat-galvanized", halfExtent: { x: 0.55, y: 0.45, z: 0.35 }, baseTriangleCount: 1100, textureBytesLod0: 6 * MB, ktx2Bytes: 0.95 * MB, meshoptBytes: 110 * KB, importanceWeight: 0.8 },
  { assetId: "window-sash-module", materialId: "mat-glass-frame", halfExtent: { x: 0.9, y: 1.1, z: 0.18 }, baseTriangleCount: 840, textureBytesLod0: 8 * MB, ktx2Bytes: 1.2 * MB, meshoptBytes: 88 * KB, importanceWeight: 0.9 },
  { assetId: "utility-pole-cluster", materialId: "mat-concrete-npr", halfExtent: { x: 0.4, y: 4.1, z: 0.4 }, baseTriangleCount: 1650, textureBytesLod0: 8 * MB, ktx2Bytes: 1.25 * MB, meshoptBytes: 165 * KB, importanceWeight: 0.85 },
  { assetId: "crosswalk-bollard", materialId: "mat-painted-metal", halfExtent: { x: 0.2, y: 0.5, z: 0.2 }, baseTriangleCount: 520, textureBytesLod0: 4 * MB, ktx2Bytes: 0.65 * MB, meshoptBytes: 56 * KB, importanceWeight: 0.75 },
];

export const DEFAULT_DEMO_3D_CAMERA: Scene3dCamera = {
  position: { x: 0, y: 2.2, z: 0 }, target: { x: 0, y: 2.0, z: -40 }, up: { x: 0, y: 1, z: 0 }, fovYDeg: 52, aspect: 16 / 9, near: 0.5, far: 240,
};

function seededUnit(seed: number): number {
  let x = (seed ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}

/** 근경·중경·원경·카메라 후방에 걸쳐 1,000개 반복 소품을 결정론적으로 배치한 3D 웹툰 도시 씬을 생성한다. */
export function createDemoWebtoonCityScene(objectCount = 1000): readonly Scene3dObject[] {
  const safeCount = Math.max(10, Math.floor(objectCount));
  const result: Scene3dObject[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    const a = DEMO_ARCHETYPES[i % DEMO_ARCHETYPES.length];
    if (!a) continue;
    const u1 = seededUnit(i * 3 + 17); const u2 = seededUnit(i * 3 + 53); const u3 = seededUnit(i * 3 + 97);
    let z: number; let x: number;
    if (i % 9 === 0 || i % 9 === 5) { z = 6 + u1 * 70; x = (u2 - 0.5) * 60; }
    else if (i % 10 < 2) { z = -(5 + u1 * 14); x = (u2 - 0.5) * 14; }
    else if (i % 10 < 5) { z = -(20 + u1 * 38); x = (u2 - 0.5) * 42; }
    else if (i % 10 < 8) { z = -(60 + u1 * 75); x = (u2 - 0.5) * 90; }
    else { z = -(138 + u1 * 88); x = (u2 - 0.5) * 140; }
    const y = a.halfExtent.y + u3 * 1.6;
    const { x: hx, y: hy, z: hz } = a.halfExtent;
    result.push({
      id: `${a.assetId}-${String(i).padStart(4, "0")}`, assetId: a.assetId, materialId: a.materialId,
      aabb: { minX: x - hx, minY: y - hy, minZ: z - hz, maxX: x + hx, maxY: y + hy, maxZ: z + hz },
      center: { x, y, z }, boundingRadius: Math.hypot(hx, hy, hz), baseTriangleCount: a.baseTriangleCount,
      textureBytesLod0: a.textureBytesLod0, ktx2Bytes: a.ktx2Bytes, meshoptBytes: a.meshoptBytes, importanceWeight: a.importanceWeight,
    });
  }
  return result;
}
