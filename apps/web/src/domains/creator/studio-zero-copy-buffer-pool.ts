/**
 * 제로카피 재사용 슬랩 버퍼 풀 (`StudioZeroCopyBufferPool`).
 *
 * ONNX 텐서 전·후처리, 타일 업스케일, 캔버스 프레임 파이프라인에서 매 프레임
 * `new Float32Array(...)` / `new Uint8Array(...)`를 반복 할당할 때 발생하는
 * 힙 할당·GC 스파이크를 제거한다.
 *
 * 특징:
 * - `Float32Array` / `Uint8Array` 및 `SharedArrayBuffer` 백킹 슬랩 지원
 * - 2의 거듭제곱 버킷 기반 슬랩 재사용 (`subarray(0, length)` 제로카피 뷰 반환)
 * - `exactLength: true` 시 워커 `postMessage(..., [buffer])` 전송용 정확 크기 버퍼 할당
 * - 이중 `release()` 무시, `postMessage` 전송으로 detached된 버퍼 자동 폐기
 * - 누수 방지 상한(`maxPoolBytes`, `maxSingleBufferBytes`, `maxBuffersPerBucket`, `maxActiveLeases`)
 */

export type StudioZeroCopyBufferKind =
  | "float32"
  | "uint8"
  | "shared-float32"
  | "shared-uint8";

export interface StudioZeroCopyBufferTypeMap {
  readonly float32: Float32Array;
  readonly uint8: Uint8Array;
  readonly "shared-float32": Float32Array;
  readonly "shared-uint8": Uint8Array;
}

export interface StudioZeroCopyBufferPoolOptions {
  /** 풀에 보관할 최대 유휴 메모리(바이트). 기본값 64 MiB. */
  readonly maxPoolBytes?: number;
  /** 단일 버퍼 캐시 상한(바이트). 초과 버퍼는 반환 시 즉시 폐기한다. 기본값 16 MiB. */
  readonly maxSingleBufferBytes?: number;
  /** 크기 버킷당 최대 보관 버퍼 수. 기본값 8. */
  readonly maxBuffersPerBucket?: number;
  /** 동시 미반환 대여 상한(누수 방지 가드). 기본값 512. */
  readonly maxActiveLeases?: number;
  /** `release()` 시 버퍼를 0으로 덮어쓸지 여부. 기본값 false. */
  readonly zeroOnRelease?: boolean;
  /** 테스트용 `SharedArrayBuffer` 가용 여부 주입. */
  readonly sharedArrayBufferAvailable?: boolean;
}

export interface StudioZeroCopyAcquireOptions {
  /** 반환 전 0으로 초기화한다. 기본값 false. */
  readonly zeroFill?: boolean;
  /** true이면 정확히 요청 바이트 크기 버퍼를 대여한다(Transferable `postMessage`용). */
  readonly exactLength?: boolean;
  /** `float32`/`uint8` 호출 시 가능하면 `SharedArrayBuffer` 백킹을 우선한다. */
  readonly preferShared?: boolean;
}

export interface StudioZeroCopyBufferPoolStats {
  readonly acquires: number;
  readonly hits: number;
  readonly misses: number;
  readonly hitRate: number;
  readonly releases: number;
  readonly evictions: number;
  readonly detachedDiscards: number;
  readonly duplicateReleasesIgnored: number;
  readonly pooledBuffers: number;
  readonly pooledBytes: number;
  readonly inUseBuffers: number;
  readonly inUseBytes: number;
  readonly peakInUseBytes: number;
  readonly maxPoolBytes: number;
  readonly maxSingleBufferBytes: number;
  readonly maxBuffersPerBucket: number;
  readonly maxActiveLeases: number;
  readonly sharedArrayBufferAvailable: boolean;
}

interface PooledSlab {
  readonly bucketKey: string;
  readonly buffer: ArrayBufferLike;
  readonly byteLength: number;
  readonly isShared: boolean;
  readonly exactLength: boolean;
  lastReturnedSeq: number;
}

interface ActiveLease {
  readonly bucketKey: string;
  buffer: ArrayBufferLike | null;
  readonly byteLength: number;
  readonly isShared: boolean;
  readonly exactLength: boolean;
  released: boolean;
}

const DEFAULT_MAX_POOL_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_SINGLE_BUFFER_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_BUFFERS_PER_BUCKET = 8;
const DEFAULT_MAX_ACTIVE_LEASES = 512;
const MIN_BUCKET_BYTES = 256;

function detectSharedArrayBufferSupport(): boolean {
  if (typeof SharedArrayBuffer !== "function") return false;
  const isolated = (globalThis as { readonly crossOriginIsolated?: unknown }).crossOriginIsolated;
  // 브라우저 탭에서는 COOP/COEP(crossOriginIsolated)가 필요하고, Node 테스트 환경은 crossOriginIsolated가 undefined다.
  if (isolated === false) return false;
  try {
    const probe = new SharedArrayBuffer(4);
    return probe.byteLength === 4;
  } catch {
    return false;
  }
}

function assertPositiveCap(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`StudioZeroCopyBufferPool ${name}는 양의 정수여야 합니다.`);
  }
  return value;
}

function assertElementLength(length: number): number {
  if (!Number.isSafeInteger(length) || length < 0) {
    throw new RangeError("버퍼 요소 길이는 0 이상의 안전한 정수여야 합니다.");
  }
  return length;
}

function nextPowerOfTwoBytes(byteLength: number): number {
  if (byteLength <= MIN_BUCKET_BYTES) return MIN_BUCKET_BYTES;
  let size = MIN_BUCKET_BYTES;
  while (size < byteLength && size < 0x4000_0000) {
    size *= 2;
  }
  return size >= byteLength ? size : byteLength;
}

function bytesPerElement(kind: StudioZeroCopyBufferKind): 1 | 4 {
  return kind === "float32" || kind === "shared-float32" ? 4 : 1;
}

function isSharedKind(kind: StudioZeroCopyBufferKind): boolean {
  return kind === "shared-float32" || kind === "shared-uint8";
}

function isDetachedArrayBuffer(buffer: ArrayBufferLike): boolean {
  if (buffer.byteLength === 0) return true;
  if ("detached" in buffer && (buffer as { readonly detached?: unknown }).detached === true) {
    return true;
  }
  return false;
}

/** 뷰의 백킹 메모리가 `SharedArrayBuffer`인지 확인한다. */
export function isSharedArrayBufferView(view: ArrayBufferView): boolean {
  return typeof SharedArrayBuffer === "function" && view.buffer instanceof SharedArrayBuffer;
}

/**
 * 뷰가 소유한 단독 `ArrayBuffer`를 워커 제로카피 `postMessage` 전송 목록용으로 추출한다.
 * `SharedArrayBuffer`이거나 부분 슬라이스(`subarray`)인 경우 안전을 위해 `null`을 반환한다.
 */
export function extractTransferableArrayBuffer(
  view: ArrayBufferView,
): ArrayBuffer | null {
  if (isSharedArrayBufferView(view)) return null;
  if (view.byteOffset !== 0 || view.byteLength !== view.buffer.byteLength) return null;
  if (view.buffer.byteLength === 0) return null;
  return view.buffer as ArrayBuffer;
}

/**
 * ONNX 텐서 및 타일 파이프라인용 재사용 슬랩 버퍼 풀.
 */
export class StudioZeroCopyBufferPool {
  readonly maxPoolBytes: number;
  readonly maxSingleBufferBytes: number;
  readonly maxBuffersPerBucket: number;
  readonly maxActiveLeases: number;
  readonly zeroOnRelease: boolean;
  readonly sharedArrayBufferAvailable: boolean;

  private readonly buckets = new Map<string, PooledSlab[]>();
  private readonly activeLeases = new WeakMap<ArrayBufferView, ActiveLease>();
  private pooledBuffers = 0;
  private pooledBytes = 0;
  private inUseBuffers = 0;
  private inUseBytes = 0;
  private peakInUseBytes = 0;
  private acquires = 0;
  private hits = 0;
  private misses = 0;
  private releases = 0;
  private evictions = 0;
  private detachedDiscards = 0;
  private duplicateReleasesIgnored = 0;
  private lruSequence = 0;

  constructor(options: StudioZeroCopyBufferPoolOptions = {}) {
    this.maxPoolBytes = assertPositiveCap(
      options.maxPoolBytes ?? DEFAULT_MAX_POOL_BYTES,
      "maxPoolBytes",
    );
    this.maxSingleBufferBytes = assertPositiveCap(
      Math.min(
        options.maxSingleBufferBytes ?? DEFAULT_MAX_SINGLE_BUFFER_BYTES,
        this.maxPoolBytes,
      ),
      "maxSingleBufferBytes",
    );
    this.maxBuffersPerBucket = assertPositiveCap(
      options.maxBuffersPerBucket ?? DEFAULT_MAX_BUFFERS_PER_BUCKET,
      "maxBuffersPerBucket",
    );
    this.maxActiveLeases = assertPositiveCap(
      options.maxActiveLeases ?? DEFAULT_MAX_ACTIVE_LEASES,
      "maxActiveLeases",
    );
    this.zeroOnRelease = options.zeroOnRelease === true;
    this.sharedArrayBufferAvailable =
      options.sharedArrayBufferAvailable ?? detectSharedArrayBufferSupport();
  }

  /** 지정된 타입과 길이의 버퍼를 풀에서 대여하거나 새로 할당한다. */
  acquire<K extends StudioZeroCopyBufferKind>(
    kind: K,
    length: number,
    options: StudioZeroCopyAcquireOptions = {},
  ): StudioZeroCopyBufferTypeMap[K] {
    const count = assertElementLength(length);
    if (this.inUseBuffers >= this.maxActiveLeases) {
      throw new RangeError(
        `StudioZeroCopyBufferPool 동시 대여 상한(${this.maxActiveLeases})을 초과했습니다. release() 누락을 확인하세요.`,
      );
    }

    const elemBytes = bytesPerElement(kind);
    const requestedBytes = count * elemBytes;
    const wantShared =
      (isSharedKind(kind) || options.preferShared === true) && this.sharedArrayBufferAvailable;
    const exactLength = options.exactLength === true;
    const allocBytes = exactLength
      ? Math.max(elemBytes, requestedBytes)
      : nextPowerOfTwoBytes(Math.max(elemBytes, requestedBytes));
    const bucketKey = `${wantShared ? "sab" : "ab"}:${exactLength ? "exact" : "pow2"}:${allocBytes}`;

    this.acquires += 1;
    let buffer: ArrayBufferLike | null = null;
    const bucket = this.buckets.get(bucketKey);
    while (bucket && bucket.length > 0) {
      const slab = bucket.pop()!;
      this.pooledBuffers -= 1;
      this.pooledBytes -= slab.byteLength;
      if (!isDetachedArrayBuffer(slab.buffer)) {
        buffer = slab.buffer;
        this.hits += 1;
        break;
      }
      this.detachedDiscards += 1;
    }
    if (bucket && bucket.length === 0) {
      this.buckets.delete(bucketKey);
    }

    if (buffer === null) {
      this.misses += 1;
      buffer = wantShared ? new SharedArrayBuffer(allocBytes) : new ArrayBuffer(allocBytes);
    }

    const view = (
      elemBytes === 4
        ? new Float32Array(buffer, 0, count)
        : new Uint8Array(buffer, 0, count)
    ) as StudioZeroCopyBufferTypeMap[K];

    if (options.zeroFill === true) {
      view.fill(0);
    }

    this.activeLeases.set(view, {
      bucketKey,
      buffer,
      byteLength: buffer.byteLength,
      isShared: wantShared,
      exactLength,
      released: false,
    });
    this.inUseBuffers += 1;
    this.inUseBytes += buffer.byteLength;
    if (this.inUseBytes > this.peakInUseBytes) {
      this.peakInUseBytes = this.inUseBytes;
    }
    return view;
  }

  /** `Float32Array` 버퍼를 대여한다. */
  acquireFloat32(
    length: number,
    options: StudioZeroCopyAcquireOptions = {},
  ): Float32Array {
    return this.acquire("float32", length, options);
  }

  /** `Uint8Array` 버퍼를 대여한다. */
  acquireUint8(
    length: number,
    options: StudioZeroCopyAcquireOptions = {},
  ): Uint8Array {
    return this.acquire("uint8", length, options);
  }

  /** 대여한 버퍼를 풀에 반환한다. 이중 반환은 무시하고 detached 버퍼는 안전하게 폐기한다. */
  release(view: Float32Array | Uint8Array): boolean {
    const lease = this.activeLeases.get(view);
    if (!lease) return false;
    if (lease.released) {
      this.duplicateReleasesIgnored += 1;
      return false;
    }
    const backingBuffer = lease.buffer;
    lease.released = true;
    lease.buffer = null;
    this.inUseBuffers = Math.max(0, this.inUseBuffers - 1);
    this.inUseBytes = Math.max(0, this.inUseBytes - lease.byteLength);
    this.releases += 1;

    if (!backingBuffer || isDetachedArrayBuffer(backingBuffer)) {
      this.detachedDiscards += 1;
      return false;
    }

    if (lease.byteLength > this.maxSingleBufferBytes) {
      this.evictions += 1;
      return false;
    }

    if (this.zeroOnRelease) {
      new Uint8Array(backingBuffer).fill(0);
    }

    let bucket = this.buckets.get(lease.bucketKey);
    if (!bucket) {
      bucket = [];
      this.buckets.set(lease.bucketKey, bucket);
    }
    if (bucket.length >= this.maxBuffersPerBucket) {
      this.evictions += 1;
      return false;
    }

    this.lruSequence += 1;
    bucket.push({
      bucketKey: lease.bucketKey,
      buffer: backingBuffer,
      byteLength: lease.byteLength,
      isShared: lease.isShared,
      exactLength: lease.exactLength,
      lastReturnedSeq: this.lruSequence,
    });
    this.pooledBuffers += 1;
    this.pooledBytes += lease.byteLength;

    if (this.pooledBytes > this.maxPoolBytes) {
      this.trim(this.maxPoolBytes);
    }
    return true;
  }

  /** 대여·사용·반환을 `finally`로 보장하는 스코프 헬퍼. */
  withBuffer<K extends StudioZeroCopyBufferKind, R>(
    kind: K,
    length: number,
    callback: (buffer: StudioZeroCopyBufferTypeMap[K]) => R,
    options?: StudioZeroCopyAcquireOptions,
  ): R {
    const buffer = this.acquire(kind, length, options);
    let released = false;
    const releaseOnce = () => {
      if (released) return;
      released = true;
      this.release(buffer);
    };
    try {
      const result = callback(buffer);
      if (
        result !== null
        && (typeof result === "object" || typeof result === "function")
        && "then" in result
        && typeof (result as { readonly then?: unknown }).then === "function"
      ) {
        return (result as unknown as Promise<unknown>).finally(releaseOnce) as R;
      }
      releaseOnce();
      return result;
    } catch (cause) {
      releaseOnce();
      throw cause;
    }
  }

  /** 유휴 풀 메모리를 목표 바이트 이하로 LRU 축출한다. 반환값은 축출한 버퍼 개수다. */
  trim(targetBytes = 0): number {
    const ceiling = Math.max(0, Math.floor(targetBytes));
    let evictedNow = 0;

    while (this.pooledBytes > ceiling && this.pooledBuffers > 0) {
      let oldestBucketKey: string | null = null;
      let oldestIndex = -1;
      let oldestSeq = Number.POSITIVE_INFINITY;

      for (const [key, slabs] of this.buckets) {
        for (let i = 0; i < slabs.length; i += 1) {
          const slab = slabs[i]!;
          if (slab.lastReturnedSeq < oldestSeq) {
            oldestSeq = slab.lastReturnedSeq;
            oldestBucketKey = key;
            oldestIndex = i;
          }
        }
      }

      if (oldestBucketKey === null || oldestIndex < 0) break;
      const slabs = this.buckets.get(oldestBucketKey)!;
      const [removed] = slabs.splice(oldestIndex, 1);
      if (slabs.length === 0) {
        this.buckets.delete(oldestBucketKey);
      }
      if (removed) {
        this.pooledBuffers -= 1;
        this.pooledBytes = Math.max(0, this.pooledBytes - removed.byteLength);
        this.evictions += 1;
        evictedNow += 1;
      }
    }

    return evictedNow;
  }

  /** 풀에 보관된 모든 유휴 슬랩을 비운다. */
  clear(): void {
    this.trim(0);
  }

  /** 현재 풀 적중률·유휴 메모리·누수 방지 카운터 스냅샷을 반환한다. */
  stats(): StudioZeroCopyBufferPoolStats {
    const hitRate = this.acquires > 0 ? this.hits / this.acquires : 0;
    return Object.freeze({
      acquires: this.acquires,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      releases: this.releases,
      evictions: this.evictions,
      detachedDiscards: this.detachedDiscards,
      duplicateReleasesIgnored: this.duplicateReleasesIgnored,
      pooledBuffers: this.pooledBuffers,
      pooledBytes: this.pooledBytes,
      inUseBuffers: this.inUseBuffers,
      inUseBytes: this.inUseBytes,
      peakInUseBytes: this.peakInUseBytes,
      maxPoolBytes: this.maxPoolBytes,
      maxSingleBufferBytes: this.maxSingleBufferBytes,
      maxBuffersPerBucket: this.maxBuffersPerBucket,
      maxActiveLeases: this.maxActiveLeases,
      sharedArrayBufferAvailable: this.sharedArrayBufferAvailable,
    });
  }
}

export function createStudioZeroCopyBufferPool(
  options?: StudioZeroCopyBufferPoolOptions,
): StudioZeroCopyBufferPool {
  return new StudioZeroCopyBufferPool(options);
}
