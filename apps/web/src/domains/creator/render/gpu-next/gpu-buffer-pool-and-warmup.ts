/**
 * WebGPU 버퍼 오브젝트 풀 & 비동기 셰이더 파이프라인 프리웜업 통합 진입점.
 *
 * - 2의 거듭제곱(Power-of-Two) 버킷으로 `GPUBuffer` 및 CPU 업로드용 `Float32Array`를 재사용해
 *   프레임당 할당/GC 스파이크를 차단한다.
 * - 메모리 상한(`maxPooledGpuBytes`, `maxPooledFloat32Bytes`) 초과 시 전역 LRU 순서로
 *   유휴 버퍼를 회수하고 즉시 `destroy()`를 호출해 VRAM 누수를 0으로 유지한다.
 * - 유휴 시간 `createComputePipelineAsync` 순차 프리웜업 큐(`GpuPipelineWarmupQueue`)를 함께 제공한다.
 */

export {
  DEFAULT_GPU_NEXT_WARMUP_TASKS,
  GpuPipelineWarmupQueue,
  type GpuNextComputePipelineLike,
  type GpuNextPipelineDeviceLike,
  type GpuNextShaderModuleLike,
  type GpuPipelineWarmupMetrics,
  type GpuPipelineWarmupQueueOptions,
  type GpuPipelineWarmupTaskSpec,
  type GpuWarmupIdleDeadline,
  type GpuWarmupIdleScheduler,
  type GpuWarmupTaskStatus,
} from "./gpu-pipeline-warmup-queue";

/** WebGPU 명세 고정 GPUBufferUsage 비트 플래그(Node/Vitest에서도 안전하게 사용). */
export const GPU_NEXT_BUFFER_USAGE = Object.freeze({
  MAP_READ: 0x0001,
  MAP_WRITE: 0x0002,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  QUERY_RESOLVE: 0x0200,
} as const);

export interface GpuNextBufferLike {
  readonly size: number;
  readonly usage?: number;
  readonly label?: string;
  destroy(): void;
}

export interface GpuNextBufferDeviceLike {
  createBuffer(descriptor: {
    readonly size: number;
    readonly usage: number;
    readonly mappedAtCreation?: boolean;
    readonly label?: string;
  }): GpuNextBufferLike;
}

export interface GpuBufferPoolOptions {
  /** 유휴 GPU 버퍼 총 바이트 상한(기본 64 MiB). */
  readonly maxPooledGpuBytes?: number;
  /** 유휴 Float32Array 총 바이트 상한(기본 32 MiB). */
  readonly maxPooledFloat32Bytes?: number;
  /** 동일 (usage, bucketBytes) 버킷당 최대 보관 개수(기본 8). */
  readonly maxBuffersPerBucket?: number;
  /** GPU 버퍼 최소 버킷 크기(4의 배수이자 2의 거듭제곱, 기본 256 bytes). */
  readonly minGpuBucketBytes?: number;
  /** Float32Array 최소 버킷 원소 수(2의 거듭제곱, 기본 64 floats = 256 bytes). */
  readonly minFloat32BucketLength?: number;
  /** 단조 시각 공급자(테스트 주입용). */
  readonly now?: () => number;
}

export interface PooledGpuBufferHandle<TBuffer extends GpuNextBufferLike = GpuNextBufferLike> {
  readonly buffer: TBuffer;
  readonly bucketBytes: number;
  readonly requestedBytes: number;
  readonly usage: number;
  readonly reused: boolean;
  release(): void;
}

export interface PooledFloat32Handle {
  readonly array: Float32Array;
  readonly bucketLength: number;
  readonly requestedLength: number;
  readonly reused: boolean;
  release(): void;
}

export interface GpuBufferPoolMetrics {
  readonly disposed: boolean;
  readonly gpuAcquires: number;
  readonly gpuHits: number;
  readonly gpuMisses: number;
  readonly gpuHitRate: number;
  readonly gpuCreated: number;
  readonly gpuDestroyed: number;
  readonly leakedGpuBuffers: number;
  readonly gpuEvictions: number;
  readonly gpuActiveCount: number;
  readonly gpuIdleCount: number;
  readonly gpuActiveBytes: number;
  readonly gpuIdleBytes: number;
  readonly gpuPeakBytes: number;
  readonly maxPooledGpuBytes: number;
  readonly float32Acquires: number;
  readonly float32Hits: number;
  readonly float32Misses: number;
  readonly float32HitRate: number;
  readonly float32Evictions: number;
  readonly float32ActiveCount: number;
  readonly float32IdleCount: number;
  readonly float32IdleBytes: number;
  readonly maxPooledFloat32Bytes: number;
}

interface TrackedGpuEntry<TBuffer extends GpuNextBufferLike> {
  readonly buffer: TBuffer;
  readonly bucketKey: string;
  readonly bucketBytes: number;
  readonly usage: number;
  inUse: boolean;
  destroyed: boolean;
  lastUsedSeq: number;
  lastReleasedAtMs: number;
}

interface TrackedFloat32Entry {
  readonly array: Float32Array;
  readonly bucketLength: number;
  readonly byteLength: number;
  inUse: boolean;
  lastUsedSeq: number;
  lastReleasedAtMs: number;
}

const DEFAULT_MAX_POOLED_GPU_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_POOLED_FLOAT32_BYTES = 32 * 1024 * 1024;
const DEFAULT_MAX_BUFFERS_PER_BUCKET = 8;
const DEFAULT_MIN_GPU_BUCKET_BYTES = 256;
const DEFAULT_MIN_FLOAT32_BUCKET_LENGTH = 64;
const MAX_SAFE_POWER_OF_TWO = 1 << 30;

function defaultNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * 요청 크기를 최소 단위 이상의 가장 가까운 2의 거듭제곱 버킷으로 올린다.
 * WebGPU 버퍼는 최소 4바이트 정렬이 필요하므로 `minBucket >= 4`를 유지한다.
 */
export function computePowerOfTwoBucket(requestedSize: number, minBucket: number): number {
  const safeMin = Math.max(4, Number.isFinite(minBucket) ? Math.floor(minBucket) : 256);
  let floorPow2 = 4;
  while (floorPow2 < safeMin && floorPow2 < MAX_SAFE_POWER_OF_TWO) {
    floorPow2 *= 2;
  }
  if (!Number.isFinite(requestedSize) || requestedSize <= floorPow2) {
    return floorPow2;
  }
  const ceiled = Math.ceil(requestedSize);
  if (ceiled >= MAX_SAFE_POWER_OF_TWO) {
    return Math.ceil(ceiled / 4) * 4;
  }
  let bucket = floorPow2;
  while (bucket < ceiled && bucket < MAX_SAFE_POWER_OF_TWO) {
    bucket *= 2;
  }
  return bucket;
}

function safeDestroyGpuBuffer(buffer: GpuNextBufferLike): void {
  try {
    buffer.destroy();
  } catch {
    // 이미 소실(device-lost)된 버퍼의 destroy 예외는 정리 경로에서 안전하게 삼킨다.
  }
}

export class GpuBufferPool<TBuffer extends GpuNextBufferLike = GpuNextBufferLike> {
  private readonly maxPooledGpuBytes: number;
  private readonly maxPooledFloat32Bytes: number;
  private readonly maxBuffersPerBucket: number;
  private readonly minGpuBucketBytes: number;
  private readonly minFloat32BucketLength: number;
  private readonly now: () => number;

  private readonly gpuBuckets = new Map<string, TrackedGpuEntry<TBuffer>[]>();
  private readonly gpuEntries = new Map<TBuffer, TrackedGpuEntry<TBuffer>>();
  private readonly float32Buckets = new Map<number, TrackedFloat32Entry[]>();
  private readonly float32Entries = new Map<Float32Array, TrackedFloat32Entry>();

  private seq = 0;
  private disposed = false;

  private gpuAcquires = 0;
  private gpuHits = 0;
  private gpuMisses = 0;
  private gpuCreated = 0;
  private gpuDestroyed = 0;
  private gpuEvictions = 0;
  private gpuActiveCount = 0;
  private gpuIdleCount = 0;
  private gpuActiveBytes = 0;
  private gpuIdleBytes = 0;
  private gpuPeakBytes = 0;

  private float32Acquires = 0;
  private float32Hits = 0;
  private float32Misses = 0;
  private float32Evictions = 0;
  private float32ActiveCount = 0;
  private float32IdleCount = 0;
  private float32IdleBytes = 0;

  constructor(options: GpuBufferPoolOptions = {}) {
    this.maxPooledGpuBytes = Math.max(
      256,
      Math.floor(options.maxPooledGpuBytes ?? DEFAULT_MAX_POOLED_GPU_BYTES),
    );
    this.maxPooledFloat32Bytes = Math.max(
      256,
      Math.floor(options.maxPooledFloat32Bytes ?? DEFAULT_MAX_POOLED_FLOAT32_BYTES),
    );
    this.maxBuffersPerBucket = Math.max(
      1,
      Math.floor(options.maxBuffersPerBucket ?? DEFAULT_MAX_BUFFERS_PER_BUCKET),
    );
    this.minGpuBucketBytes = computePowerOfTwoBucket(
      options.minGpuBucketBytes ?? DEFAULT_MIN_GPU_BUCKET_BYTES,
      4,
    );
    this.minFloat32BucketLength = computePowerOfTwoBucket(
      options.minFloat32BucketLength ?? DEFAULT_MIN_FLOAT32_BUCKET_LENGTH,
      4,
    );
    this.now = options.now ?? defaultNowMs;
  }

  /**
   * 2의 거듭제곱 버킷에서 `GPUBuffer`를 대여한다.
   * 유휴 버퍼가 있으면 즉시 재사용(hit)하고, 없으면 `device.createBuffer`로 생성한다.
   */
  acquireGpuBuffer(
    device: GpuNextBufferDeviceLike,
    requestedBytes: number,
    usage: number,
    label?: string,
  ): PooledGpuBufferHandle<TBuffer> {
    if (this.disposed) {
      throw new Error("이미 폐기(dispose)된 GpuBufferPool에서 버퍼를 대여할 수 없습니다.");
    }
    if (!Number.isFinite(requestedBytes) || requestedBytes <= 0) {
      throw new RangeError(`GPUBuffer 요청 바이트는 양수여야 합니다: ${String(requestedBytes)}`);
    }
    const normalizedUsage = usage >>> 0;
    const bucketBytes = computePowerOfTwoBucket(requestedBytes, this.minGpuBucketBytes);
    const bucketKey = `${normalizedUsage}:${bucketBytes}`;

    this.gpuAcquires += 1;
    this.seq += 1;

    const bucket = this.gpuBuckets.get(bucketKey);
    let entry: TrackedGpuEntry<TBuffer> | undefined;
    let reused = false;

    if (bucket && bucket.length > 0) {
      entry = bucket.pop();
      if (bucket.length === 0) {
        this.gpuBuckets.delete(bucketKey);
      }
      if (entry && !entry.destroyed) {
        reused = true;
        this.gpuHits += 1;
        this.gpuIdleCount -= 1;
        this.gpuIdleBytes -= entry.bucketBytes;
      } else {
        entry = undefined;
      }
    }

    if (!entry) {
      this.gpuMisses += 1;
      const created = device.createBuffer({
        size: bucketBytes,
        usage: normalizedUsage,
        label: label ?? `gpu-next-pool:${normalizedUsage}:${bucketBytes}`,
      }) as TBuffer;
      this.gpuCreated += 1;
      entry = {
        buffer: created,
        bucketKey,
        bucketBytes,
        usage: normalizedUsage,
        inUse: true,
        destroyed: false,
        lastUsedSeq: this.seq,
        lastReleasedAtMs: 0,
      };
      this.gpuEntries.set(created, entry);
    } else {
      entry.inUse = true;
      entry.lastUsedSeq = this.seq;
    }

    this.gpuActiveCount += 1;
    this.gpuActiveBytes += entry.bucketBytes;
    const totalLiveBytes = this.gpuActiveBytes + this.gpuIdleBytes;
    if (totalLiveBytes > this.gpuPeakBytes) {
      this.gpuPeakBytes = totalLiveBytes;
    }

    const ownedBuffer = entry.buffer;
    return {
      buffer: ownedBuffer,
      bucketBytes: entry.bucketBytes,
      requestedBytes,
      usage: normalizedUsage,
      reused,
      release: () => {
        this.releaseGpuBuffer(ownedBuffer);
      },
    };
  }

  /** 대여한 `GPUBuffer`를 풀에 반납한다(이중 반납은 안전하게 무시된다). */
  releaseGpuBuffer(buffer: TBuffer): boolean {
    const entry = this.gpuEntries.get(buffer);
    if (!entry || !entry.inUse || entry.destroyed) {
      return false;
    }

    entry.inUse = false;
    this.gpuActiveCount -= 1;
    this.gpuActiveBytes -= entry.bucketBytes;

    if (this.disposed || entry.bucketBytes > this.maxPooledGpuBytes) {
      this.destroyGpuEntry(entry, false);
      return true;
    }

    const existingBucket = this.gpuBuckets.get(entry.bucketKey);
    if (existingBucket && existingBucket.length >= this.maxBuffersPerBucket) {
      this.destroyGpuEntry(entry, true);
      return true;
    }

    this.seq += 1;
    entry.lastUsedSeq = this.seq;
    entry.lastReleasedAtMs = this.now();

    if (existingBucket) {
      existingBucket.push(entry);
    } else {
      this.gpuBuckets.set(entry.bucketKey, [entry]);
    }
    this.gpuIdleCount += 1;
    this.gpuIdleBytes += entry.bucketBytes;

    this.trimGpuPoolToBytes(this.maxPooledGpuBytes);
    return true;
  }

  /** 유휴 GPU 버퍼 총량이 `targetBytes` 이하가 될 때까지 전역 LRU 순으로 `destroy()`한다. */
  trimGpuPoolToBytes(targetBytes: number): number {
    const safeTarget = Math.max(0, Math.floor(targetBytes));
    let evicted = 0;

    while (this.gpuIdleBytes > safeTarget && this.gpuIdleCount > 0) {
      const victim = this.findOldestIdleGpuEntry();
      if (!victim) break;
      this.removeFromGpuBucket(victim);
      this.gpuIdleCount -= 1;
      this.gpuIdleBytes -= victim.bucketBytes;
      this.destroyGpuEntry(victim, true);
      evicted += 1;
    }

    return evicted;
  }

  /** 지정한 유휴 시간(`maxIdleMs`)을 넘긴 미사용 GPU 버퍼를 회수해 VRAM 점유를 낮춘다. */
  evictIdleGpuBuffersOlderThan(maxIdleMs: number, nowMs: number = this.now()): number {
    if (!Number.isFinite(maxIdleMs) || maxIdleMs < 0) return 0;
    const cutoff = nowMs - maxIdleMs;
    let evicted = 0;

    for (const [key, list] of this.gpuBuckets) {
      const kept: TrackedGpuEntry<TBuffer>[] = [];
      for (const entry of list) {
        if (entry.lastReleasedAtMs <= cutoff) {
          this.gpuIdleCount -= 1;
          this.gpuIdleBytes -= entry.bucketBytes;
          this.destroyGpuEntry(entry, true);
          evicted += 1;
        } else {
          kept.push(entry);
        }
      }
      if (kept.length === 0) {
        this.gpuBuckets.delete(key);
      } else {
        this.gpuBuckets.set(key, kept);
      }
    }

    return evicted;
  }

  /**
   * 2의 거듭제곱 원소 버킷에서 CPU 업로드용 `Float32Array`를 대여한다.
   * 반환된 배열은 최소 `requestedLength` 길이를 보장한다.
   */
  acquireFloat32Array(requestedLength: number, zeroFill = false): PooledFloat32Handle {
    if (this.disposed) {
      throw new Error("이미 폐기(dispose)된 GpuBufferPool에서 Float32Array를 대여할 수 없습니다.");
    }
    if (!Number.isFinite(requestedLength) || requestedLength <= 0) {
      throw new RangeError(`Float32Array 요청 길이는 양수여야 합니다: ${String(requestedLength)}`);
    }

    const bucketLength = computePowerOfTwoBucket(requestedLength, this.minFloat32BucketLength);
    this.float32Acquires += 1;
    this.seq += 1;

    const bucket = this.float32Buckets.get(bucketLength);
    let entry: TrackedFloat32Entry | undefined;
    let reused = false;

    if (bucket && bucket.length > 0) {
      entry = bucket.pop();
      if (bucket.length === 0) {
        this.float32Buckets.delete(bucketLength);
      }
      if (entry) {
        reused = true;
        this.float32Hits += 1;
        this.float32IdleCount -= 1;
        this.float32IdleBytes -= entry.byteLength;
        if (zeroFill) {
          entry.array.fill(0, 0, Math.min(requestedLength, entry.array.length));
        }
      }
    }

    if (!entry) {
      this.float32Misses += 1;
      const array = new Float32Array(bucketLength);
      entry = {
        array,
        bucketLength,
        byteLength: array.byteLength,
        inUse: true,
        lastUsedSeq: this.seq,
        lastReleasedAtMs: 0,
      };
      this.float32Entries.set(array, entry);
    } else {
      entry.inUse = true;
      entry.lastUsedSeq = this.seq;
    }

    this.float32ActiveCount += 1;
    const ownedArray = entry.array;

    return {
      array: ownedArray,
      bucketLength: entry.bucketLength,
      requestedLength,
      reused,
      release: () => {
        this.releaseFloat32Array(ownedArray);
      },
    };
  }

  /** 대여한 `Float32Array`를 풀에 반납한다(이중 반납 안전). */
  releaseFloat32Array(array: Float32Array): boolean {
    const entry = this.float32Entries.get(array);
    if (!entry || !entry.inUse) {
      return false;
    }

    entry.inUse = false;
    this.float32ActiveCount -= 1;

    if (this.disposed || entry.byteLength > this.maxPooledFloat32Bytes) {
      this.float32Entries.delete(array);
      return true;
    }

    const existing = this.float32Buckets.get(entry.bucketLength);
    if (existing && existing.length >= this.maxBuffersPerBucket) {
      this.float32Entries.delete(array);
      this.float32Evictions += 1;
      return true;
    }

    this.seq += 1;
    entry.lastUsedSeq = this.seq;
    entry.lastReleasedAtMs = this.now();

    if (existing) {
      existing.push(entry);
    } else {
      this.float32Buckets.set(entry.bucketLength, [entry]);
    }
    this.float32IdleCount += 1;
    this.float32IdleBytes += entry.byteLength;

    this.trimFloat32PoolToBytes(this.maxPooledFloat32Bytes);
    return true;
  }

  /** 유휴 `Float32Array` 총량을 LRU 순으로 `targetBytes` 이하로 정리한다. */
  trimFloat32PoolToBytes(targetBytes: number): number {
    const safeTarget = Math.max(0, Math.floor(targetBytes));
    let evicted = 0;

    while (this.float32IdleBytes > safeTarget && this.float32IdleCount > 0) {
      let oldest: TrackedFloat32Entry | null = null;
      for (const bucket of this.float32Buckets.values()) {
        for (const candidate of bucket) {
          if (!oldest || candidate.lastUsedSeq < oldest.lastUsedSeq) {
            oldest = candidate;
          }
        }
      }
      if (!oldest) break;

      const bucket = this.float32Buckets.get(oldest.bucketLength);
      if (bucket) {
        const idx = bucket.indexOf(oldest);
        if (idx >= 0) bucket.splice(idx, 1);
        if (bucket.length === 0) this.float32Buckets.delete(oldest.bucketLength);
      }
      this.float32IdleCount -= 1;
      this.float32IdleBytes -= oldest.byteLength;
      this.float32Entries.delete(oldest.array);
      this.float32Evictions += 1;
      evicted += 1;
    }

    return evicted;
  }

  /** 모든 유휴·활성 GPU 버퍼에 `destroy()`를 호출해 VRAM 누수를 0으로 정리한다. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const entry of [...this.gpuEntries.values()]) {
      if (!entry.destroyed) {
        this.destroyGpuEntry(entry, false);
      }
    }
    this.gpuBuckets.clear();
    this.gpuEntries.clear();
    this.gpuActiveCount = 0;
    this.gpuIdleCount = 0;
    this.gpuActiveBytes = 0;
    this.gpuIdleBytes = 0;

    this.float32Buckets.clear();
    this.float32Entries.clear();
    this.float32ActiveCount = 0;
    this.float32IdleCount = 0;
    this.float32IdleBytes = 0;
  }

  getMetrics(): GpuBufferPoolMetrics {
    return Object.freeze({
      disposed: this.disposed,
      gpuAcquires: this.gpuAcquires,
      gpuHits: this.gpuHits,
      gpuMisses: this.gpuMisses,
      gpuHitRate: this.gpuAcquires > 0 ? this.gpuHits / this.gpuAcquires : 0,
      gpuCreated: this.gpuCreated,
      gpuDestroyed: this.gpuDestroyed,
      leakedGpuBuffers: Math.max(0, this.gpuCreated - this.gpuDestroyed),
      gpuEvictions: this.gpuEvictions,
      gpuActiveCount: this.gpuActiveCount,
      gpuIdleCount: this.gpuIdleCount,
      gpuActiveBytes: this.gpuActiveBytes,
      gpuIdleBytes: this.gpuIdleBytes,
      gpuPeakBytes: this.gpuPeakBytes,
      maxPooledGpuBytes: this.maxPooledGpuBytes,
      float32Acquires: this.float32Acquires,
      float32Hits: this.float32Hits,
      float32Misses: this.float32Misses,
      float32HitRate: this.float32Acquires > 0 ? this.float32Hits / this.float32Acquires : 0,
      float32Evictions: this.float32Evictions,
      float32ActiveCount: this.float32ActiveCount,
      float32IdleCount: this.float32IdleCount,
      float32IdleBytes: this.float32IdleBytes,
      maxPooledFloat32Bytes: this.maxPooledFloat32Bytes,
    });
  }

  private findOldestIdleGpuEntry(): TrackedGpuEntry<TBuffer> | null {
    let oldest: TrackedGpuEntry<TBuffer> | null = null;
    for (const bucket of this.gpuBuckets.values()) {
      for (const candidate of bucket) {
        if (!oldest || candidate.lastUsedSeq < oldest.lastUsedSeq) {
          oldest = candidate;
        }
      }
    }
    return oldest;
  }

  private removeFromGpuBucket(entry: TrackedGpuEntry<TBuffer>): void {
    const bucket = this.gpuBuckets.get(entry.bucketKey);
    if (!bucket) return;
    const idx = bucket.indexOf(entry);
    if (idx >= 0) {
      bucket.splice(idx, 1);
    }
    if (bucket.length === 0) {
      this.gpuBuckets.delete(entry.bucketKey);
    }
  }

  private destroyGpuEntry(entry: TrackedGpuEntry<TBuffer>, countAsEviction: boolean): void {
    if (entry.destroyed) return;
    entry.destroyed = true;
    this.gpuEntries.delete(entry.buffer);
    safeDestroyGpuBuffer(entry.buffer);
    this.gpuDestroyed += 1;
    if (countAsEviction) {
      this.gpuEvictions += 1;
    }
  }
}
