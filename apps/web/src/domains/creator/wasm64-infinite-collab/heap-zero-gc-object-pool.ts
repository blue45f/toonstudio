/**
 * 120Hz 캔버스·협업 파이프라인용 제로-GC 오브젝트 및 TypedArray 슬랩 풀 (`HeapZeroGcObjectPool`).
 *
 * - `Float32Array` 스트로크 포인트 슬랩·`Uint8Array` 타일 스크래치 버퍼는 기존 `StudioZeroCopyBufferPool`을
 *   백엔드로 재사용하고, `Int32Array` 더티 사각형 풀·2D 아핀 행렬(`Float32Array(6)`) 풀·제네릭 재설정
 *   오브젝트 풀을 단일 하드 메모리 상한(`hardMemoryCapBytes`) 아래 통합 관리한다.
 * - `withFrameScope` / `beginFrameScope` 프레임 아레나 스코프, 연령 기반 누수 탐지, 하이-워터마크 텔레메트리 제공.
 */

import {
  StudioZeroCopyBufferPool,
  type StudioZeroCopyBufferPoolStats,
} from "../wasm64-zero-copy-ipc/studio-zero-copy-buffer-pool";

export const DEFAULT_HARD_MEMORY_CAP_BYTES = 64 * 1024 * 1024;
export const DEFAULT_MAX_SLAB_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MAX_ACTIVE_LEASES = 4096;
export const DEFAULT_MAX_IDLE_PER_BUCKET = 16;
export const DEFAULT_STROKE_FLOATS_PER_POINT = 4; // [x, y, pressure, brushWidth]
export const DIRTY_RECT_INT32_STRIDE = 4; // [minX, minY, maxX, maxY]
export const AFFINE_MATRIX_2D_FLOATS = 6; // [a, b, c, d, tx, ty]
export const DEFAULT_TILE_SCRATCH_BYTES = 256 * 256 * 4;

export type ZeroGcPoolCategory =
  | "stroke-float32" | "dirty-rect-int32" | "tile-uint8" | "affine-matrix-2d" | "object";

export interface HeapZeroGcObjectPoolOptions {
  readonly hardMemoryCapBytes?: number; readonly maxSlabBytes?: number;
  readonly maxLeases?: number; readonly maxIdlePerBucket?: number;
  readonly zeroOnRelease?: boolean; readonly preferSharedBacking?: boolean;
  readonly sharedArrayBufferAvailable?: boolean;
}

export interface ZeroGcObjectFactory<T extends object> {
  readonly create: () => T; readonly reset: (instance: T) => void;
  readonly estimatedBytes?: number; readonly maxIdle?: number;
}

export interface ZeroGcCategoryStats {
  readonly acquires: number; readonly hits: number; readonly misses: number;
  readonly releases: number; readonly liveCount: number; readonly pooledCount: number;
  readonly reuseRate: number;
}

export interface ZeroGcLeakEntry {
  readonly leaseId: number; readonly category: ZeroGcPoolCategory; readonly poolName: string;
  readonly byteLength: number; readonly acquiredFrame: number; readonly ageFrames: number; readonly tag: string;
}

export interface ZeroGcLeakReport {
  readonly currentFrame: number; readonly maxAgeFrames: number; readonly leakedCount: number;
  readonly totalLeakedBytes: number; readonly oldestAgeFrames: number; readonly leaks: readonly ZeroGcLeakEntry[];
}

export interface ZeroGcPoolTelemetry {
  readonly currentFrame: number; readonly totalAcquires: number; readonly poolHits: number; readonly poolMisses: number;
  readonly reuseRate: number; readonly reuseRatePercent: number; readonly totalReleases: number;
  readonly duplicateReleasesIgnored: number; readonly evictions: number;
  readonly liveLeases: number; readonly peakLiveLeases: number; readonly liveBytes: number; readonly peakLiveBytes: number;
  readonly pooledCount: number; readonly pooledBytes: number; readonly totalTrackedBytes: number; readonly hardMemoryCapBytes: number;
  readonly frameScopesEntered: number; readonly frameScopesExited: number; readonly peakScopeLeaseCount: number;
  readonly categories: Readonly<Record<ZeroGcPoolCategory, ZeroGcCategoryStats>>;
  readonly backingBufferPool: StudioZeroCopyBufferPoolStats;
}

export interface ZeroGcFrameScope {
  readonly scopeId: number; readonly frameIndex: number; readonly leaseCount: number; readonly closed: boolean;
  acquireStrokePoints(pointCount: number, floatsPerPoint?: number, tag?: string): Float32Array;
  acquireDirtyRects(rectCount: number, tag?: string): Int32Array;
  acquireTileScratch(byteLength?: number, tag?: string): Uint8Array;
  acquireAffineMatrix(tag?: string): Float32Array;
  acquireObject<T extends object>(poolName: string, tag?: string): T;
  releaseAll(): number;
}

export class PoolMemoryCapError extends RangeError {
  readonly requestedBytes: number;
  readonly liveBytes: number;
  readonly hardMemoryCapBytes: number;
  constructor(requestedBytes: number, liveBytes: number, hardMemoryCapBytes: number) {
    super(`HeapZeroGcObjectPool 하드 메모리 상한 초과: requested=${requestedBytes}B, live=${liveBytes}B, cap=${hardMemoryCapBytes}B`);
    this.name = "PoolMemoryCapError";
    this.requestedBytes = requestedBytes;
    this.liveBytes = liveBytes;
    this.hardMemoryCapBytes = hardMemoryCapBytes;
  }
}

interface ActiveLeaseRecord {
  leaseId: number; category: ZeroGcPoolCategory; poolName: string; byteLength: number;
  acquiredFrame: number; tag: string; bucketKey: string; backingPoolManaged: boolean;
}
interface MutableCategoryCounters {
  acquires: number; hits: number; misses: number; releases: number; liveCount: number; pooledCount: number;
}
interface PooledTypedSlab<T extends Int32Array | Float32Array> {
  readonly view: T; readonly byteLength: number; lastReturnedSeq: number;
}
interface RegisteredObjectPool {
  readonly name: string; readonly create: () => object; readonly reset: (instance: object) => void;
  readonly estimatedBytes: number; readonly maxIdle: number; readonly idle: object[];
}

function assertPositiveInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label}는 양의 정수여야 합니다(got ${value}).`);
  return value;
}
function assertNonNegativeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label}는 0 이상의 정수여야 합니다(got ${value}).`);
  return value;
}
function nextPowerOfTwo(value: number, minSize: number): number {
  let size = minSize;
  while (size < value && size < 0x4000_0000) size *= 2;
  return size >= value ? size : value;
}
function emptyCounters(): MutableCategoryCounters {
  return { acquires: 0, hits: 0, misses: 0, releases: 0, liveCount: 0, pooledCount: 0 };
}

/** 2D 아핀 행렬(`Float32Array(6)`)을 항등 행렬 `[1, 0, 0, 1, 0, 0]`으로 초기화한다. */
export function resetAffineIdentity(m: Float32Array): Float32Array {
  m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0;
  return m;
}

/** 두 2D 아핀 행렬 `a * b`를 제로-할당으로 `out`에 기록한다(`out === a` 또는 `out === b` 안전). */
export function multiplyAffine2D(a: Float32Array, b: Float32Array, out: Float32Array): Float32Array {
  const a0 = a[0]!, a1 = a[1]!, a2 = a[2]!, a3 = a[3]!, a4 = a[4]!, a5 = a[5]!;
  const b0 = b[0]!, b1 = b[1]!, b2 = b[2]!, b3 = b[3]!, b4 = b[4]!, b5 = b[5]!;
  out[0] = a0 * b0 + a2 * b1; out[1] = a1 * b0 + a3 * b1;
  out[2] = a0 * b2 + a2 * b3; out[3] = a1 * b2 + a3 * b3;
  out[4] = a0 * b4 + a2 * b5 + a4; out[5] = a1 * b4 + a3 * b5 + a5;
  return out;
}

/** 2D 좌표를 아핀 행렬로 변환해 `out[outOffset..outOffset+1]`에 기록한다. */
export function transformPoint2D(m: Float32Array, x: number, y: number, out: Float32Array, outOffset = 0): void {
  out[outOffset] = m[0]! * x + m[2]! * y + m[4]!;
  out[outOffset + 1] = m[1]! * x + m[3]! * y + m[5]!;
}

class ReusableFrameScope implements ZeroGcFrameScope {
  private readonly owner: HeapZeroGcObjectPool;
  private readonly leased: object[] = [];
  private _scopeId = 0;
  private _frameIndex = 0;
  private _closed = true;

  constructor(owner: HeapZeroGcObjectPool) { this.owner = owner; }
  get scopeId(): number { return this._scopeId; }
  get frameIndex(): number { return this._frameIndex; }
  get leaseCount(): number { return this.leased.length; }
  get closed(): boolean { return this._closed; }

  open(scopeId: number, frameIndex: number): void {
    this._scopeId = scopeId; this._frameIndex = frameIndex; this._closed = false; this.leased.length = 0;
  }
  acquireStrokePoints(pointCount: number, floatsPerPoint = DEFAULT_STROKE_FLOATS_PER_POINT, tag = "frame:stroke"): Float32Array {
    this.ensureOpen(); return this.track(this.owner.acquireStrokePoints(pointCount, floatsPerPoint, tag));
  }
  acquireDirtyRects(rectCount: number, tag = "frame:dirty-rect"): Int32Array {
    this.ensureOpen(); return this.track(this.owner.acquireDirtyRects(rectCount, tag));
  }
  acquireTileScratch(byteLength = DEFAULT_TILE_SCRATCH_BYTES, tag = "frame:tile"): Uint8Array {
    this.ensureOpen(); return this.track(this.owner.acquireTileScratch(byteLength, tag));
  }
  acquireAffineMatrix(tag = "frame:affine"): Float32Array {
    this.ensureOpen(); return this.track(this.owner.acquireAffineMatrix(tag));
  }
  acquireObject<T extends object>(poolName: string, tag = "frame:object"): T {
    this.ensureOpen(); return this.track(this.owner.acquireObject<T>(poolName, tag));
  }
  releaseAll(): number {
    if (this._closed) return 0;
    let released = 0;
    for (let i = this.leased.length - 1; i >= 0; i -= 1) {
      const item = this.leased[i];
      if (item && this.owner.release(item)) released += 1;
    }
    this.leased.length = 0;
    this._closed = true;
    this.owner.recycleScopeHandle(this);
    return released;
  }
  private track<T extends object>(item: T): T {
    this.leased.push(item);
    this.owner.recordScopeLeaseDepth(this.leased.length);
    return item;
  }
  private ensureOpen(): void {
    if (this._closed) throw new Error("이미 종료된 ZeroGcFrameScope에서 버퍼를 대여할 수 없습니다.");
  }
}

export class HeapZeroGcObjectPool {
  readonly hardMemoryCapBytes: number;
  readonly maxSlabBytes: number;
  readonly maxLeases: number;
  readonly maxIdlePerBucket: number;
  readonly zeroOnRelease: boolean;
  readonly preferSharedBacking: boolean;

  private readonly backingPool: StudioZeroCopyBufferPool;
  private readonly dirtyRectBuckets = new Map<string, PooledTypedSlab<Int32Array>[]>();
  private readonly affineMatrixIdle: PooledTypedSlab<Float32Array>[] = [];
  private readonly objectPools = new Map<string, RegisteredObjectPool>();
  private readonly activeLeases = new Map<object, ActiveLeaseRecord>();
  private readonly freeLeaseRecords: ActiveLeaseRecord[] = [];
  private readonly freeScopes: ReusableFrameScope[] = [];
  private readonly categoryStats: Record<ZeroGcPoolCategory, MutableCategoryCounters> = {
    "stroke-float32": emptyCounters(),
    "dirty-rect-int32": emptyCounters(),
    "tile-uint8": emptyCounters(),
    "affine-matrix-2d": emptyCounters(),
    object: emptyCounters(),
  };

  private currentFrame = 0;
  private nextLeaseId = 1;
  private nextScopeId = 1;
  private lruSequence = 0;
  private localPooledCount = 0;
  private localPooledBytes = 0;
  private liveBytes = 0;
  private peakLiveBytes = 0;
  private peakLiveLeases = 0;
  private duplicateReleasesIgnored = 0;
  private localEvictions = 0;
  private frameScopesEntered = 0;
  private frameScopesExited = 0;
  private peakScopeLeaseCount = 0;

  constructor(options: HeapZeroGcObjectPoolOptions = {}) {
    this.hardMemoryCapBytes = assertPositiveInt(options.hardMemoryCapBytes ?? DEFAULT_HARD_MEMORY_CAP_BYTES, "hardMemoryCapBytes");
    this.maxSlabBytes = assertPositiveInt(Math.min(options.maxSlabBytes ?? DEFAULT_MAX_SLAB_BYTES, this.hardMemoryCapBytes), "maxSlabBytes");
    this.maxLeases = assertPositiveInt(options.maxLeases ?? DEFAULT_MAX_ACTIVE_LEASES, "maxLeases");
    this.maxIdlePerBucket = assertPositiveInt(options.maxIdlePerBucket ?? DEFAULT_MAX_IDLE_PER_BUCKET, "maxIdlePerBucket");
    this.zeroOnRelease = options.zeroOnRelease === true;
    this.preferSharedBacking = options.preferSharedBacking === true;
    this.backingPool = new StudioZeroCopyBufferPool({
      maxPoolBytes: this.hardMemoryCapBytes,
      maxSingleBufferBytes: this.maxSlabBytes,
      maxBuffersPerBucket: this.maxIdlePerBucket,
      maxActiveLeases: this.maxLeases,
      zeroOnRelease: this.zeroOnRelease,
      sharedArrayBufferAvailable: options.sharedArrayBufferAvailable,
    });
  }

  get frameIndex(): number { return this.currentFrame; }
  advanceFrame(delta = 1): number { this.currentFrame += assertPositiveInt(delta, "delta"); return this.currentFrame; }

  registerObjectPool<T extends object>(name: string, factory: ZeroGcObjectFactory<T>): void {
    if (!name.trim()) throw new RangeError("오브젝트 풀 이름은 비어 있을 수 없습니다.");
    if (this.objectPools.has(name)) throw new Error(`이미 등록된 오브젝트 풀입니다: '${name}'`);
    this.objectPools.set(name, {
      name, create: factory.create, reset: factory.reset as (instance: object) => void,
      estimatedBytes: assertPositiveInt(factory.estimatedBytes ?? 64, "estimatedBytes"),
      maxIdle: assertPositiveInt(factory.maxIdle ?? this.maxIdlePerBucket * 4, "maxIdle"),
      idle: [],
    });
  }

  acquireStrokePoints(pointCount: number, floatsPerPoint = DEFAULT_STROKE_FLOATS_PER_POINT, tag = "stroke-points"): Float32Array {
    const elemCount = assertNonNegativeInt(pointCount, "pointCount") * assertPositiveInt(floatsPerPoint, "floatsPerPoint");
    this.ensureCapacityBeforeAcquire(nextPowerOfTwo(Math.max(4, elemCount * 4), 256), true);
    const hitsBefore = this.backingPool.stats().hits;
    const view = this.backingPool.acquireFloat32(elemCount, { preferShared: this.preferSharedBacking, zeroFill: false });
    const isHit = this.backingPool.stats().hits > hitsBefore;
    this.recordAcquire("stroke-float32", "stroke-float32", view, view.buffer.byteLength, tag, "", true, isHit);
    if (!isHit) this.enforceIdleMemoryBudget();
    return view;
  }

  acquireDirtyRects(rectCount: number, tag = "dirty-rects"): Int32Array {
    const neededInts = Math.max(DIRTY_RECT_INT32_STRIDE, assertNonNegativeInt(rectCount, "rectCount") * DIRTY_RECT_INT32_STRIDE);
    const bucketInts = nextPowerOfTwo(neededInts, 16);
    const bucketKey = `i32:${bucketInts}`;
    const bucket = this.dirtyRectBuckets.get(bucketKey);
    const recycled = bucket?.pop();
    if (recycled) {
      this.localPooledCount -= 1;
      this.localPooledBytes -= recycled.byteLength;
      this.categoryStats["dirty-rect-int32"].pooledCount -= 1;
      if (bucket && bucket.length === 0) this.dirtyRectBuckets.delete(bucketKey);
      this.ensureCapacityBeforeAcquire(recycled.byteLength, true);
      this.recordAcquire("dirty-rect-int32", "dirty-rect-int32", recycled.view, recycled.byteLength, tag, bucketKey, false, true);
      return recycled.view;
    }
    this.ensureCapacityBeforeAcquire(bucketInts * Int32Array.BYTES_PER_ELEMENT);
    const view = new Int32Array(bucketInts);
    this.recordAcquire("dirty-rect-int32", "dirty-rect-int32", view, view.byteLength, tag, bucketKey, false, false);
    return view;
  }

  acquireTileScratch(byteLength = DEFAULT_TILE_SCRATCH_BYTES, tag = "tile-scratch"): Uint8Array {
    const len = assertNonNegativeInt(byteLength, "byteLength");
    this.ensureCapacityBeforeAcquire(nextPowerOfTwo(Math.max(1, len), 256), true);
    const hitsBefore = this.backingPool.stats().hits;
    const view = this.backingPool.acquireUint8(len, { preferShared: this.preferSharedBacking, zeroFill: false });
    const isHit = this.backingPool.stats().hits > hitsBefore;
    this.recordAcquire("tile-uint8", "tile-uint8", view, view.buffer.byteLength, tag, "", true, isHit);
    if (!isHit) this.enforceIdleMemoryBudget();
    return view;
  }

  acquireAffineMatrix(tag = "affine-2d"): Float32Array {
    const bytes = AFFINE_MATRIX_2D_FLOATS * Float32Array.BYTES_PER_ELEMENT;
    const recycled = this.affineMatrixIdle.pop();
    if (recycled) {
      this.localPooledCount -= 1;
      this.localPooledBytes -= recycled.byteLength;
      this.categoryStats["affine-matrix-2d"].pooledCount -= 1;
      this.ensureCapacityBeforeAcquire(recycled.byteLength, true);
      resetAffineIdentity(recycled.view);
      this.recordAcquire("affine-matrix-2d", "affine-matrix-2d", recycled.view, recycled.byteLength, tag, "affine:6", false, true);
      return recycled.view;
    }
    this.ensureCapacityBeforeAcquire(bytes);
    const mat = resetAffineIdentity(new Float32Array(AFFINE_MATRIX_2D_FLOATS));
    this.recordAcquire("affine-matrix-2d", "affine-matrix-2d", mat, mat.byteLength, tag, "affine:6", false, false);
    return mat;
  }

  acquireObject<T extends object>(poolName: string, tag = poolName): T {
    const reg = this.objectPools.get(poolName);
    if (!reg) throw new Error(`등록되지 않은 오브젝트 풀입니다: '${poolName}'`);
    const recycled = reg.idle.pop();
    if (recycled) {
      this.localPooledCount -= 1;
      this.localPooledBytes -= reg.estimatedBytes;
      this.categoryStats.object.pooledCount -= 1;
      this.ensureCapacityBeforeAcquire(reg.estimatedBytes, true);
      reg.reset(recycled);
      this.recordAcquire("object", poolName, recycled, reg.estimatedBytes, tag, poolName, false, true);
      return recycled as T;
    }
    this.ensureCapacityBeforeAcquire(reg.estimatedBytes);
    const created = reg.create();
    reg.reset(created);
    this.recordAcquire("object", poolName, created, reg.estimatedBytes, tag, poolName, false, false);
    return created as T;
  }

  release(item: object): boolean {
    const lease = this.activeLeases.get(item);
    if (!lease) { this.duplicateReleasesIgnored += 1; return false; }
    this.activeLeases.delete(item);
    const stats = this.categoryStats[lease.category];
    stats.releases += 1;
    stats.liveCount = Math.max(0, stats.liveCount - 1);
    this.liveBytes = Math.max(0, this.liveBytes - lease.byteLength);

    if (lease.backingPoolManaged) {
      this.backingPool.release(item as Float32Array | Uint8Array);
      this.enforceIdleMemoryBudget();
      this.recycleLeaseRecord(lease);
      return true;
    }

    if (lease.category === "dirty-rect-int32") {
      const view = item as Int32Array;
      if (this.zeroOnRelease) view.fill(0);
      let bucket = this.dirtyRectBuckets.get(lease.bucketKey);
      if (lease.byteLength <= this.maxSlabBytes && (!bucket || bucket.length < this.maxIdlePerBucket)) {
        if (!bucket) { bucket = []; this.dirtyRectBuckets.set(lease.bucketKey, bucket); }
        this.lruSequence += 1;
        bucket.push({ view, byteLength: lease.byteLength, lastReturnedSeq: this.lruSequence });
        this.localPooledCount += 1; this.localPooledBytes += lease.byteLength; stats.pooledCount += 1;
      } else { this.localEvictions += 1; }
    } else if (lease.category === "affine-matrix-2d") {
      if (this.affineMatrixIdle.length < this.maxIdlePerBucket * 4) {
        this.lruSequence += 1;
        this.affineMatrixIdle.push({ view: item as Float32Array, byteLength: lease.byteLength, lastReturnedSeq: this.lruSequence });
        this.localPooledCount += 1; this.localPooledBytes += lease.byteLength; stats.pooledCount += 1;
      } else { this.localEvictions += 1; }
    } else if (lease.category === "object") {
      const reg = this.objectPools.get(lease.poolName);
      if (reg && reg.idle.length < reg.maxIdle) {
        reg.reset(item); reg.idle.push(item);
        this.localPooledCount += 1; this.localPooledBytes += reg.estimatedBytes; stats.pooledCount += 1;
      } else { this.localEvictions += 1; }
    }

    this.enforceIdleMemoryBudget();
    this.recycleLeaseRecord(lease);
    return true;
  }

  beginFrameScope(): ZeroGcFrameScope {
    const scope = this.freeScopes.pop() ?? new ReusableFrameScope(this);
    const scopeId = this.nextScopeId++;
    this.frameScopesEntered += 1;
    scope.open(scopeId, this.currentFrame);
    return scope;
  }

  withFrameScope<R>(callback: (scope: ZeroGcFrameScope) => R): R {
    const scope = this.beginFrameScope();
    try {
      const result = callback(scope);
      if (
        result !== null
        && (typeof result === "object" || typeof result === "function")
        && "then" in result
        && typeof (result as { readonly then?: unknown }).then === "function"
      ) {
        return (result as unknown as Promise<unknown>).finally(() => { scope.releaseAll(); }) as R;
      }
      scope.releaseAll();
      return result;
    } catch (error) {
      scope.releaseAll();
      throw error;
    }
  }

  detectLeaks(maxAgeFrames = 2): ZeroGcLeakReport {
    const threshold = assertNonNegativeInt(maxAgeFrames, "maxAgeFrames");
    const leaks: ZeroGcLeakEntry[] = [];
    let totalLeakedBytes = 0;
    let oldestAgeFrames = 0;
    for (const lease of this.activeLeases.values()) {
      const age = Math.max(0, this.currentFrame - lease.acquiredFrame);
      if (age >= threshold) {
        leaks.push({
          leaseId: lease.leaseId, category: lease.category, poolName: lease.poolName,
          byteLength: lease.byteLength, acquiredFrame: lease.acquiredFrame, ageFrames: age, tag: lease.tag,
        });
        totalLeakedBytes += lease.byteLength;
        if (age > oldestAgeFrames) oldestAgeFrames = age;
      }
    }
    return { currentFrame: this.currentFrame, maxAgeFrames: threshold, leakedCount: leaks.length, totalLeakedBytes, oldestAgeFrames, leaks };
  }

  trimIdle(targetIdleBytes = 0): number {
    const ceiling = Math.max(0, Math.floor(targetIdleBytes));
    let evicted = 0;
    while (this.localPooledBytes + this.backingPool.stats().pooledBytes > ceiling) {
      const bp = this.backingPool.stats().pooledBytes;
      if (bp > 0 && bp >= this.localPooledBytes) {
        const removed = this.backingPool.trim(Math.max(0, ceiling - this.localPooledBytes));
        evicted += removed;
        if (removed > 0) continue;
      }
      if (!this.evictOneLocalIdle()) break;
      evicted += 1;
    }
    return evicted;
  }

  getTelemetry(): ZeroGcPoolTelemetry {
    const bp = this.backingPool.stats();
    const cats = this.categoryStats;
    const toView = (c: MutableCategoryCounters): ZeroGcCategoryStats => ({
      acquires: c.acquires, hits: c.hits, misses: c.misses, releases: c.releases,
      liveCount: c.liveCount, pooledCount: c.pooledCount, reuseRate: c.acquires > 0 ? c.hits / c.acquires : 0,
    });
    const list = Object.values(cats);
    const totalAcquires = list.reduce((s, c) => s + c.acquires, 0);
    const poolHits = list.reduce((s, c) => s + c.hits, 0);
    const totalReleases = list.reduce((s, c) => s + c.releases, 0);
    const reuseRate = totalAcquires > 0 ? poolHits / totalAcquires : 0;
    const pooledBytes = this.localPooledBytes + bp.pooledBytes;
    return {
      currentFrame: this.currentFrame, totalAcquires, poolHits, poolMisses: totalAcquires - poolHits,
      reuseRate, reuseRatePercent: reuseRate * 100, totalReleases,
      duplicateReleasesIgnored: this.duplicateReleasesIgnored + bp.duplicateReleasesIgnored,
      evictions: this.localEvictions + bp.evictions,
      liveLeases: this.activeLeases.size, peakLiveLeases: this.peakLiveLeases,
      liveBytes: this.liveBytes, peakLiveBytes: this.peakLiveBytes,
      pooledCount: this.localPooledCount + bp.pooledBuffers, pooledBytes,
      totalTrackedBytes: this.liveBytes + pooledBytes, hardMemoryCapBytes: this.hardMemoryCapBytes,
      frameScopesEntered: this.frameScopesEntered, frameScopesExited: this.frameScopesExited,
      peakScopeLeaseCount: this.peakScopeLeaseCount,
      categories: {
        "stroke-float32": toView(cats["stroke-float32"]),
        "dirty-rect-int32": toView(cats["dirty-rect-int32"]),
        "tile-uint8": toView(cats["tile-uint8"]),
        "affine-matrix-2d": toView(cats["affine-matrix-2d"]),
        object: toView(cats.object),
      },
      backingBufferPool: bp,
    };
  }

  recycleScopeHandle(scope: ReusableFrameScope): void {
    this.frameScopesExited += 1;
    if (this.freeScopes.length < 16) this.freeScopes.push(scope);
  }
  recordScopeLeaseDepth(depth: number): void {
    if (depth > this.peakScopeLeaseCount) this.peakScopeLeaseCount = depth;
  }

  private ensureCapacityBeforeAcquire(requiredBytes: number, skipPreTrim = false): void {
    if (this.activeLeases.size >= this.maxLeases) {
      throw new RangeError(`HeapZeroGcObjectPool 동시 대여 상한(${this.maxLeases}) 초과.`);
    }
    if (this.liveBytes + requiredBytes > this.hardMemoryCapBytes) {
      throw new PoolMemoryCapError(requiredBytes, this.liveBytes, this.hardMemoryCapBytes);
    }
    if (!skipPreTrim) {
      const maxAllowedIdle = Math.max(0, this.hardMemoryCapBytes - this.liveBytes - requiredBytes);
      if (this.localPooledBytes + this.backingPool.stats().pooledBytes > maxAllowedIdle) this.trimIdle(maxAllowedIdle);
    }
  }

  private enforceIdleMemoryBudget(): void {
    const maxIdle = Math.max(0, this.hardMemoryCapBytes - this.liveBytes);
    if (this.localPooledBytes + this.backingPool.stats().pooledBytes > maxIdle) this.trimIdle(maxIdle);
  }

  private evictOneLocalIdle(): boolean {
    let oldestKey: string | null = null;
    let oldestIdx = -1;
    let oldestSeq = Number.POSITIVE_INFINITY;
    for (const [key, list] of this.dirtyRectBuckets) {
      for (let i = 0; i < list.length; i += 1) {
        if (list[i]!.lastReturnedSeq < oldestSeq) { oldestSeq = list[i]!.lastReturnedSeq; oldestKey = key; oldestIdx = i; }
      }
    }
    if (oldestKey !== null && oldestIdx >= 0) {
      const list = this.dirtyRectBuckets.get(oldestKey)!;
      const removed = list.splice(oldestIdx, 1)[0];
      if (list.length === 0) this.dirtyRectBuckets.delete(oldestKey);
      if (removed) {
        this.localPooledCount -= 1; this.localPooledBytes = Math.max(0, this.localPooledBytes - removed.byteLength);
        this.categoryStats["dirty-rect-int32"].pooledCount = Math.max(0, this.categoryStats["dirty-rect-int32"].pooledCount - 1);
        this.localEvictions += 1; return true;
      }
    }
    const mat = this.affineMatrixIdle.shift();
    if (mat) {
      this.localPooledCount -= 1; this.localPooledBytes = Math.max(0, this.localPooledBytes - mat.byteLength);
      this.categoryStats["affine-matrix-2d"].pooledCount = Math.max(0, this.categoryStats["affine-matrix-2d"].pooledCount - 1);
      this.localEvictions += 1; return true;
    }
    for (const reg of this.objectPools.values()) {
      if (reg.idle.length > 0) {
        reg.idle.shift();
        this.localPooledCount -= 1; this.localPooledBytes = Math.max(0, this.localPooledBytes - reg.estimatedBytes);
        this.categoryStats.object.pooledCount = Math.max(0, this.categoryStats.object.pooledCount - 1);
        this.localEvictions += 1; return true;
      }
    }
    return false;
  }

  private recordAcquire(
    category: ZeroGcPoolCategory, poolName: string, item: object, byteLength: number,
    tag: string, bucketKey: string, backingPoolManaged: boolean, isHit: boolean,
  ): void {
    const rec = this.freeLeaseRecords.pop() ?? {
      leaseId: 0, category, poolName, byteLength: 0, acquiredFrame: 0, tag: "", bucketKey: "", backingPoolManaged: false,
    };
    rec.leaseId = this.nextLeaseId++; rec.category = category; rec.poolName = poolName;
    rec.byteLength = byteLength; rec.acquiredFrame = this.currentFrame; rec.tag = tag;
    rec.bucketKey = bucketKey; rec.backingPoolManaged = backingPoolManaged;
    this.activeLeases.set(item, rec);
    const stats = this.categoryStats[category];
    stats.acquires += 1; stats.liveCount += 1;
    if (isHit) stats.hits += 1; else stats.misses += 1;
    this.liveBytes += byteLength;
    if (this.liveBytes > this.peakLiveBytes) this.peakLiveBytes = this.liveBytes;
    if (this.activeLeases.size > this.peakLiveLeases) this.peakLiveLeases = this.activeLeases.size;
  }

  private recycleLeaseRecord(rec: ActiveLeaseRecord): void {
    if (this.freeLeaseRecords.length < 512) { rec.tag = ""; rec.bucketKey = ""; rec.poolName = ""; this.freeLeaseRecords.push(rec); }
  }
}

export function createHeapZeroGcObjectPool(options?: HeapZeroGcObjectPoolOptions): HeapZeroGcObjectPool {
  return new HeapZeroGcObjectPool(options);
}
