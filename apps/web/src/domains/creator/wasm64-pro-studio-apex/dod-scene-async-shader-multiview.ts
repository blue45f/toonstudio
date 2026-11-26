/**
 * 데이터 지향(DOD) SoA 씬 그래프 · 비차단 셰이더 파이프라인 컴파일러 ·
 * 제로카피 멀티 뷰포트 코디네이터.
 *
 * - `DodSoaSceneGraph`: 연속 `Float32Array` 로컬/월드 4×4 행렬, 바운딩 스피어,
 *   더티 비트셋 및 위상 정렬 배열로 10,000+ 노드를 프레임당 힙 할당 없이 갱신한다.
 * - `AsyncShaderPipelineCompiler`: 우선순위 큐와 유휴 시간 예산으로 WGSL/WebGL2
 *   파이프라인을 비차단 컴파일하고, 결정론적 해시 캐시로 웜 히트 히치를 제거한다.
 * - `MultiViewportZeroCopyCoordinator`: 단일 공유 씬 버퍼(`SharedArrayBuffer`/`ArrayBuffer`)를
 *   메인 캔버스·미니맵·3D 레퍼런스·팝아웃 모니터에 복사 없이 바인딩하고
 *   더티 뷰포트 및 프러스텀 컬링을 수행한다.
 */

export const DEFAULT_DOD_SCENE_CAPACITY = 16384;
export const DEFAULT_SHADER_IDLE_BUDGET_MS = 2.5;
export const MATRIX4_FLOATS = 16;
export const BOUNDS_FLOATS = 4;
export const FRUSTUM_PLANE_FLOATS = 24;

export interface DodSceneGraphOptions {
  readonly initialCapacity?: number;
  readonly now?: () => number;
}

export interface DodSceneUpdateReport {
  readonly frameNumber: number; readonly sceneVersion: number;
  readonly nodeCount: number; readonly updatedNodes: number; readonly skippedNodes: number;
  readonly topoRebuilt: boolean; readonly elapsedMs: number;
}

function defaultNowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function nextPowerOfTwoCapacity(minCapacity: number): number {
  let cap = 64;
  while (cap < minCapacity) cap *= 2;
  return cap;
}

function writeIdentityMatrix4(arr: Float32Array, o: number): void {
  arr.fill(0, o, o + MATRIX4_FLOATS);
  arr[o] = 1; arr[o + 5] = 1; arr[o + 10] = 1; arr[o + 15] = 1;
}

/** 열 우선(column-major) 4×4 행렬 곱셈 `out = a * b` (객체 할당 없음). */
export function multiplyMatrix4Into(
  a: Float32Array, aOff: number,
  b: Float32Array, bOff: number,
  out: Float32Array, outOff: number,
): void {
  const a00 = a[aOff], a10 = a[aOff + 1], a20 = a[aOff + 2], a30 = a[aOff + 3];
  const a01 = a[aOff + 4], a11 = a[aOff + 5], a21 = a[aOff + 6], a31 = a[aOff + 7];
  const a02 = a[aOff + 8], a12 = a[aOff + 9], a22 = a[aOff + 10], a32 = a[aOff + 11];
  const a03 = a[aOff + 12], a13 = a[aOff + 13], a23 = a[aOff + 14], a33 = a[aOff + 15];

  for (let col = 0; col < 4; col += 1) {
    const bo = bOff + col * 4;
    const b0 = b[bo], b1 = b[bo + 1], b2 = b[bo + 2], b3 = b[bo + 3];
    const oo = outOff + col * 4;
    out[oo] = a00 * b0 + a01 * b1 + a02 * b2 + a03 * b3;
    out[oo + 1] = a10 * b0 + a11 * b1 + a12 * b2 + a13 * b3;
    out[oo + 2] = a20 * b0 + a21 * b1 + a22 * b2 + a23 * b3;
    out[oo + 3] = a30 * b0 + a31 * b1 + a32 * b2 + a33 * b3;
  }
}

function transformBoundingSphereInto(
  wm: Float32Array, mOff: number, lb: Float32Array, wb: Float32Array, bOff: number,
): void {
  const cx = lb[bOff], cy = lb[bOff + 1], cz = lb[bOff + 2], r = lb[bOff + 3];
  const m0 = wm[mOff], m1 = wm[mOff + 1], m2 = wm[mOff + 2];
  const m4 = wm[mOff + 4], m5 = wm[mOff + 5], m6 = wm[mOff + 6];
  const m8 = wm[mOff + 8], m9 = wm[mOff + 9], m10 = wm[mOff + 10];

  wb[bOff] = m0 * cx + m4 * cy + m8 * cz + wm[mOff + 12];
  wb[bOff + 1] = m1 * cx + m5 * cy + m9 * cz + wm[mOff + 13];
  wb[bOff + 2] = m2 * cx + m6 * cy + m10 * cz + wm[mOff + 14];

  const sxSq = m0 * m0 + m1 * m1 + m2 * m2;
  const sySq = m4 * m4 + m5 * m5 + m6 * m6;
  const szSq = m8 * m8 + m9 * m9 + m10 * m10;
  wb[bOff + 3] = r * Math.sqrt(Math.max(sxSq, sySq, szSq));
}

/** 연속 메모리(SoA) 기반 데이터 지향 씬 그래프. 프레임 갱신 시 노드별 객체를 할당하지 않는다. */
export class DodSoaSceneGraph {
  private capacity: number;
  private count = 0;
  private frameNumber = 0;
  private sceneVersion = 0;
  private dirtyCount = 0;
  private topoDirty = false;
  private topoIsIdentity = true;
  private readonly now: () => number;

  private localMatrices: Float32Array;
  private worldMatrices: Float32Array;
  private localBounds: Float32Array;
  private worldBounds: Float32Array;
  private parents: Int32Array;
  private dirtyBits: Uint32Array;
  private worldDirtyBits: Uint32Array;
  private topoOrder: Int32Array;
  private firstChild: Int32Array;
  private nextSibling: Int32Array;
  private bfsQueue: Int32Array;

  constructor(options: DodSceneGraphOptions = {}) {
    this.capacity = nextPowerOfTwoCapacity(
      Math.max(64, Math.floor(options.initialCapacity ?? DEFAULT_DOD_SCENE_CAPACITY)),
    );
    this.now = options.now ?? defaultNowMs;
    const words = Math.ceil(this.capacity / 32);
    this.localMatrices = new Float32Array(this.capacity * MATRIX4_FLOATS);
    this.worldMatrices = new Float32Array(this.capacity * MATRIX4_FLOATS);
    this.localBounds = new Float32Array(this.capacity * BOUNDS_FLOATS);
    this.worldBounds = new Float32Array(this.capacity * BOUNDS_FLOATS);
    this.parents = new Int32Array(this.capacity).fill(-1);
    this.dirtyBits = new Uint32Array(words);
    this.worldDirtyBits = new Uint32Array(words);
    this.topoOrder = new Int32Array(this.capacity);
    this.firstChild = new Int32Array(this.capacity).fill(-1);
    this.nextSibling = new Int32Array(this.capacity).fill(-1);
    this.bfsQueue = new Int32Array(this.capacity);
  }

  get nodeCount(): number { return this.count; }
  get currentCapacity(): number { return this.capacity; }
  get version(): number { return this.sceneVersion; }
  getWorldMatricesView(): Float32Array { return this.worldMatrices; }
  getWorldBoundsView(): Float32Array { return this.worldBounds; }
  getWorldDirtyBitsView(): Uint32Array { return this.worldDirtyBits; }

  getParentIndex(nodeIndex: number): number {
    this.assertValidNode(nodeIndex);
    return this.parents[nodeIndex];
  }

  createNode(parentIndex = -1): number {
    if (parentIndex !== -1) this.assertValidNode(parentIndex);
    if (this.count >= this.capacity) this.growCapacity(this.capacity * 2);
    const idx = this.count++;
    this.parents[idx] = parentIndex;
    const mOff = idx * MATRIX4_FLOATS;
    writeIdentityMatrix4(this.localMatrices, mOff);
    writeIdentityMatrix4(this.worldMatrices, mOff);
    const bOff = idx * BOUNDS_FLOATS;
    this.localBounds.fill(0, bOff, bOff + 3); this.localBounds[bOff + 3] = 1;
    this.worldBounds.fill(0, bOff, bOff + 3); this.worldBounds[bOff + 3] = 1;
    if (parentIndex >= idx) { this.topoDirty = true; this.topoIsIdentity = false; }
    else if (this.topoIsIdentity) { this.topoOrder[idx] = idx; }
    else { this.topoDirty = true; }
    this.markDirty(idx);
    return idx;
  }

  setParent(nodeIndex: number, parentIndex: number): void {
    this.assertValidNode(nodeIndex);
    if (parentIndex !== -1) {
      this.assertValidNode(parentIndex);
      for (let cursor = parentIndex; cursor !== -1; cursor = this.parents[cursor]) {
        if (cursor === nodeIndex) throw new Error(`씬 그래프 순환 참조가 감지되었습니다: ${nodeIndex} -> ${parentIndex}`);
      }
    }
    if (this.parents[nodeIndex] === parentIndex) return;
    this.parents[nodeIndex] = parentIndex;
    this.topoDirty = true;
    this.topoIsIdentity = false;
    this.markDirty(nodeIndex);
  }

  setLocalMatrix(nodeIndex: number, matrix: ArrayLike<number>): void {
    this.assertValidNode(nodeIndex);
    if (matrix.length < MATRIX4_FLOATS) throw new Error("4×4 행렬은 16개 원소가 필요합니다.");
    const mOff = nodeIndex * MATRIX4_FLOATS;
    for (let i = 0; i < MATRIX4_FLOATS; i += 1) this.localMatrices[mOff + i] = matrix[i];
    this.markDirty(nodeIndex);
  }

  setLocalTranslation(nodeIndex: number, tx: number, ty: number, tz: number): void {
    this.assertValidNode(nodeIndex);
    const mOff = nodeIndex * MATRIX4_FLOATS;
    this.localMatrices[mOff + 12] = tx; this.localMatrices[mOff + 13] = ty; this.localMatrices[mOff + 14] = tz;
    this.markDirty(nodeIndex);
  }

  setLocalTrs(
    nodeIndex: number, tx: number, ty: number, tz: number,
    qx: number, qy: number, qz: number, qw: number, sx: number, sy: number, sz: number,
  ): void {
    this.assertValidNode(nodeIndex);
    const len = Math.hypot(qx, qy, qz, qw) || 1;
    const x = qx / len, y = qy / len, z = qz / len, w = qw / len;
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const o = nodeIndex * MATRIX4_FLOATS, m = this.localMatrices;
    m[o] = (1 - (yy + zz)) * sx; m[o + 1] = (xy + wz) * sx; m[o + 2] = (xz - wy) * sx; m[o + 3] = 0;
    m[o + 4] = (xy - wz) * sy; m[o + 5] = (1 - (xx + zz)) * sy; m[o + 6] = (yz + wx) * sy; m[o + 7] = 0;
    m[o + 8] = (xz + wy) * sz; m[o + 9] = (yz - wx) * sz; m[o + 10] = (1 - (xx + yy)) * sz; m[o + 11] = 0;
    m[o + 12] = tx; m[o + 13] = ty; m[o + 14] = tz; m[o + 15] = 1;
    this.markDirty(nodeIndex);
  }

  setLocalBounds(nodeIndex: number, cx: number, cy: number, cz: number, radius: number): void {
    this.assertValidNode(nodeIndex);
    const bOff = nodeIndex * BOUNDS_FLOATS;
    this.localBounds[bOff] = cx; this.localBounds[bOff + 1] = cy;
    this.localBounds[bOff + 2] = cz; this.localBounds[bOff + 3] = Math.max(0, radius);
    this.markDirty(nodeIndex);
  }

  markDirty(nodeIndex: number): void {
    this.assertValidNode(nodeIndex);
    const word = nodeIndex >>> 5;
    const mask = 1 << (nodeIndex & 31);
    if ((this.dirtyBits[word] & mask) === 0) {
      this.dirtyBits[word] |= mask;
      this.dirtyCount += 1;
    }
  }

  isDirty(nodeIndex: number): boolean {
    this.assertValidNode(nodeIndex);
    return (this.dirtyBits[nodeIndex >>> 5] & (1 << (nodeIndex & 31))) !== 0;
  }

  readWorldMatrix(nodeIndex: number, out: Float32Array): Float32Array {
    this.assertValidNode(nodeIndex);
    const o = nodeIndex * MATRIX4_FLOATS;
    for (let i = 0; i < MATRIX4_FLOATS; i += 1) out[i] = this.worldMatrices[o + i];
    return out;
  }

  readWorldBounds(nodeIndex: number, out: Float32Array): Float32Array {
    this.assertValidNode(nodeIndex);
    const o = nodeIndex * BOUNDS_FLOATS;
    out[0] = this.worldBounds[o]; out[1] = this.worldBounds[o + 1];
    out[2] = this.worldBounds[o + 2]; out[3] = this.worldBounds[o + 3];
    return out;
  }

  updateWorldTransforms(): DodSceneUpdateReport {
    const startMs = this.now();
    this.frameNumber += 1;
    const n = this.count;

    if (n === 0 || (this.dirtyCount === 0 && !this.topoDirty)) {
      this.worldDirtyBits.fill(0, 0, Math.ceil(n / 32));
      return {
        frameNumber: this.frameNumber, sceneVersion: this.sceneVersion,
        nodeCount: n, updatedNodes: 0, skippedNodes: n, topoRebuilt: false,
        elapsedMs: Math.max(0, this.now() - startMs),
      };
    }

    let topoRebuilt = false;
    if (this.topoDirty) {
      this.rebuildTopologyOrder();
      topoRebuilt = true;
    }

    this.worldDirtyBits.fill(0, 0, Math.ceil(n / 32));
    let updatedNodes = 0;
    const { localMatrices, worldMatrices, localBounds, worldBounds, parents, dirtyBits, worldDirtyBits, topoOrder, topoIsIdentity } = this;

    for (let i = 0; i < n; i += 1) {
      const idx = topoIsIdentity ? i : topoOrder[i];
      const word = idx >>> 5;
      const mask = 1 << (idx & 31);
      const parent = parents[idx];
      const selfDirty = (dirtyBits[word] & mask) !== 0;
      const parentDirty = parent >= 0 && (worldDirtyBits[parent >>> 5] & (1 << (parent & 31))) !== 0;
      if (!selfDirty && !parentDirty) continue;

      const mOff = idx * MATRIX4_FLOATS;
      if (parent < 0) {
        for (let k = 0; k < MATRIX4_FLOATS; k += 1) worldMatrices[mOff + k] = localMatrices[mOff + k];
      } else {
        multiplyMatrix4Into(worldMatrices, parent * MATRIX4_FLOATS, localMatrices, mOff, worldMatrices, mOff);
      }

      transformBoundingSphereInto(worldMatrices, mOff, localBounds, worldBounds, idx * BOUNDS_FLOATS);
      worldDirtyBits[word] |= mask;
      if (selfDirty) dirtyBits[word] &= ~mask;
      updatedNodes += 1;
    }

    this.dirtyCount = 0;
    if (updatedNodes > 0) this.sceneVersion += 1;
    return {
      frameNumber: this.frameNumber, sceneVersion: this.sceneVersion,
      nodeCount: n, updatedNodes, skippedNodes: n - updatedNodes, topoRebuilt,
      elapsedMs: Math.max(0, this.now() - startMs),
    };
  }

  private rebuildTopologyOrder(): void {
    const n = this.count;
    this.firstChild.fill(-1, 0, n);
    this.nextSibling.fill(-1, 0, n);
    let qTail = 0;
    for (let i = 0; i < n; i += 1) {
      const p = this.parents[i];
      if (p < 0) { this.bfsQueue[qTail++] = i; }
      else { this.nextSibling[i] = this.firstChild[p]; this.firstChild[p] = i; }
    }
    let qHead = 0, outIdx = 0, isIdentity = true;
    while (qHead < qTail) {
      const node = this.bfsQueue[qHead++];
      this.topoOrder[outIdx] = node;
      if (node !== outIdx) isIdentity = false;
      outIdx += 1;
      for (let c = this.firstChild[node]; c !== -1; c = this.nextSibling[c]) {
        this.bfsQueue[qTail++] = c;
      }
    }
    this.topoDirty = false;
    this.topoIsIdentity = isIdentity;
  }

  private growCapacity(newCapacity: number): void {
    const nextCap = nextPowerOfTwoCapacity(newCapacity);
    const nextWords = Math.ceil(nextCap / 32);
    const growF32 = (s: Float32Array, stride: number): Float32Array => { const d = new Float32Array(nextCap * stride); d.set(s); return d; };
    const growI32 = (s: Int32Array, fill: number): Int32Array => { const d = new Int32Array(nextCap).fill(fill); d.set(s); return d; };
    const growU32 = (s: Uint32Array): Uint32Array => { const d = new Uint32Array(nextWords); d.set(s); return d; };

    this.localMatrices = growF32(this.localMatrices, MATRIX4_FLOATS);
    this.worldMatrices = growF32(this.worldMatrices, MATRIX4_FLOATS);
    this.localBounds = growF32(this.localBounds, BOUNDS_FLOATS);
    this.worldBounds = growF32(this.worldBounds, BOUNDS_FLOATS);
    this.parents = growI32(this.parents, -1);
    this.dirtyBits = growU32(this.dirtyBits);
    this.worldDirtyBits = growU32(this.worldDirtyBits);
    this.topoOrder = growI32(this.topoOrder, 0);
    this.firstChild = growI32(this.firstChild, -1);
    this.nextSibling = growI32(this.nextSibling, -1);
    this.bfsQueue = growI32(this.bfsQueue, 0);
    this.capacity = nextCap;
  }

  private assertValidNode(nodeIndex: number): void {
    if (!Number.isInteger(nodeIndex) || nodeIndex < 0 || nodeIndex >= this.count) {
      throw new RangeError(`유효하지 않은 씬 노드 인덱스입니다: ${nodeIndex} (count=${this.count})`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Async Non-Blocking Shader Pipeline Compiler                             */
/* -------------------------------------------------------------------------- */

export type ShaderBackendKind = "wgsl" | "webgl2";
export type ShaderCompilePriority = "critical" | "high" | "normal" | "background";

const SHADER_PRIORITY_RANK: Readonly<Record<ShaderCompilePriority, number>> = {
  critical: 0, high: 1, normal: 2, background: 3,
};

export interface ShaderPipelineDescriptor {
  readonly id: string; readonly backend: ShaderBackendKind; readonly source: string;
  readonly entryPoint?: string;
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
  readonly priority?: ShaderCompilePriority;
}

export interface CompiledShaderPipeline<TPipeline = unknown> {
  readonly hash: string; readonly id: string; readonly backend: ShaderBackendKind;
  readonly pipeline: TPipeline; readonly compileMs: number;
  readonly fromCache: boolean; readonly compiledAtMs: number;
}

export interface ShaderCompilerStats {
  readonly cacheSize: number; readonly warmHits: number; readonly coldCompiles: number;
  readonly deduplicatedInFlight: number; readonly queuedCount: number;
  readonly slicesExecuted: number; readonly yieldCount: number; readonly overBudgetSlices: number;
  readonly maxBudgetMs: number; readonly peakSliceMs: number; readonly warmHitRatePct: number;
}

export interface AsyncShaderPipelineCompilerOptions<TPipeline = unknown> {
  readonly compilePipeline: (descriptor: ShaderPipelineDescriptor, hash: string) => Promise<TPipeline> | TPipeline;
  readonly maxBudgetMs?: number;
  readonly maxCacheEntries?: number;
  readonly now?: () => number;
  readonly yieldToIdle?: (remainingQueue: number, sliceMs: number) => Promise<void>;
}

interface PendingShaderJob<TPipeline> {
  readonly hash: string; readonly descriptor: ShaderPipelineDescriptor;
  priority: ShaderCompilePriority; readonly seq: number;
  readonly promise: Promise<CompiledShaderPipeline<TPipeline>>;
  readonly resolve: (value: CompiledShaderPipeline<TPipeline>) => void;
  readonly reject: (reason: unknown) => void;
}

/** 셰이더 백엔드·진입점·정렬된 매크로·소스를 결합한 결정론적 64비트 이중-레인 해시. */
export function computeShaderPipelineHash(descriptor: ShaderPipelineDescriptor): string {
  const entry = descriptor.entryPoint ?? "main";
  const defines = descriptor.defines
    ? Object.keys(descriptor.defines).sort().map((k) => `${k}=${String(descriptor.defines?.[k])}`).join(";")
    : "";
  const canonical = `${descriptor.backend}|${entry}|${defines}|${descriptor.source}`;
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < canonical.length; i += 1) {
    const ch = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ (ch & 0xff), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((ch >>> 8) ^ (ch & 0xff) ^ (i & 0xff)), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function defaultYieldToIdle(): Promise<void> {
  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  if (typeof g.requestIdleCallback === "function") {
    return new Promise<void>((resolve) => { g.requestIdleCallback?.(() => resolve(), { timeout: 16 }); });
  }
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

export class AsyncShaderPipelineCompiler<TPipeline = unknown> {
  private readonly compilePipeline: AsyncShaderPipelineCompilerOptions<TPipeline>["compilePipeline"];
  private readonly maxBudgetMs: number;
  private readonly maxCacheEntries: number;
  private readonly now: () => number;
  private readonly yieldToIdle: (remainingQueue: number, sliceMs: number) => Promise<void>;

  private readonly cache = new Map<string, CompiledShaderPipeline<TPipeline>>();
  private readonly inFlight = new Map<string, PendingShaderJob<TPipeline>>();
  private readonly queue: PendingShaderJob<TPipeline>[] = [];
  private seqCounter = 0;
  private pumping = false;
  private warmHits = 0;
  private coldCompiles = 0;
  private deduplicatedInFlight = 0;
  private slicesExecuted = 0;
  private yieldCount = 0;
  private overBudgetSlices = 0;
  private peakSliceMs = 0;

  constructor(options: AsyncShaderPipelineCompilerOptions<TPipeline>) {
    this.compilePipeline = options.compilePipeline;
    this.maxBudgetMs = Math.max(0.25, options.maxBudgetMs ?? DEFAULT_SHADER_IDLE_BUDGET_MS);
    this.maxCacheEntries = Math.max(16, Math.floor(options.maxCacheEntries ?? 512));
    this.now = options.now ?? defaultNowMs;
    this.yieldToIdle = options.yieldToIdle ?? (() => defaultYieldToIdle());
  }

  /** 동기식 웜 캐시 조회(제로 히치 핫패스). */
  getCached(descriptor: ShaderPipelineDescriptor): CompiledShaderPipeline<TPipeline> | null {
    const hash = computeShaderPipelineHash(descriptor);
    const hit = this.cache.get(hash);
    if (!hit) return null;
    this.warmHits += 1;
    this.cache.delete(hash);
    this.cache.set(hash, hit);
    return { ...hit, id: descriptor.id, compileMs: 0, fromCache: true };
  }

  compile(descriptor: ShaderPipelineDescriptor): Promise<CompiledShaderPipeline<TPipeline>> {
    const cached = this.getCached(descriptor);
    if (cached) return Promise.resolve(cached);

    const hash = computeShaderPipelineHash(descriptor);
    const priority = descriptor.priority ?? "normal";
    const existing = this.inFlight.get(hash);
    if (existing) {
      this.deduplicatedInFlight += 1;
      if (SHADER_PRIORITY_RANK[priority] < SHADER_PRIORITY_RANK[existing.priority]) {
        existing.priority = priority;
      }
      return existing.promise;
    }

    let resolveFn: (value: CompiledShaderPipeline<TPipeline>) => void = () => {};
    let rejectFn: (reason: unknown) => void = () => {};
    const promise = new Promise<CompiledShaderPipeline<TPipeline>>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });
    const job: PendingShaderJob<TPipeline> = {
      hash, descriptor, priority, seq: this.seqCounter++, promise, resolve: resolveFn, reject: rejectFn,
    };
    this.inFlight.set(hash, job);
    this.queue.push(job);
    this.schedulePump();
    return promise;
  }

  prewarmBatch(descriptors: readonly ShaderPipelineDescriptor[]): Promise<readonly CompiledShaderPipeline<TPipeline>[]> {
    return Promise.all(descriptors.map((desc) => this.compile(desc)));
  }

  invalidate(hash: string): boolean { return this.cache.delete(hash); }
  clearCache(): void { this.cache.clear(); }

  getStats(): ShaderCompilerStats {
    const total = this.warmHits + this.coldCompiles;
    return {
      cacheSize: this.cache.size, warmHits: this.warmHits, coldCompiles: this.coldCompiles,
      deduplicatedInFlight: this.deduplicatedInFlight, queuedCount: this.queue.length,
      slicesExecuted: this.slicesExecuted, yieldCount: this.yieldCount,
      overBudgetSlices: this.overBudgetSlices, maxBudgetMs: this.maxBudgetMs,
      peakSliceMs: this.peakSliceMs, warmHitRatePct: total === 0 ? 0 : (this.warmHits / total) * 100,
    };
  }

  private schedulePump(): void {
    if (this.pumping) return;
    this.pumping = true;
    void this.pumpLoop();
  }

  private popHighestPriority(): PendingShaderJob<TPipeline> | undefined {
    if (this.queue.length === 0) return undefined;
    let bestIdx = 0;
    for (let i = 1; i < this.queue.length; i += 1) {
      const a = this.queue[i], b = this.queue[bestIdx];
      const pa = SHADER_PRIORITY_RANK[a.priority], pb = SHADER_PRIORITY_RANK[b.priority];
      if (pa < pb || (pa === pb && a.seq < b.seq)) bestIdx = i;
    }
    return this.queue.splice(bestIdx, 1)[0];
  }

  private async pumpLoop(): Promise<void> {
    try {
      await Promise.resolve();
      while (this.queue.length > 0) {
        const sliceStart = this.now();
        this.slicesExecuted += 1;
        let compiledInSlice = 0;
        while (this.queue.length > 0) {
          if (compiledInSlice > 0 && this.now() - sliceStart >= this.maxBudgetMs) break;
          const job = this.popHighestPriority();
          if (!job) break;
          const t0 = this.now();
          try {
            const pipeline = await this.compilePipeline(job.descriptor, job.hash);
            const record: CompiledShaderPipeline<TPipeline> = {
              hash: job.hash, id: job.descriptor.id, backend: job.descriptor.backend,
              pipeline, compileMs: Math.max(0, this.now() - t0),
              fromCache: false, compiledAtMs: this.now(),
            };
            this.putCache(job.hash, record);
            this.coldCompiles += 1;
            this.inFlight.delete(job.hash);
            job.resolve(record);
          } catch (error) {
            this.inFlight.delete(job.hash);
            job.reject(error);
          }
          compiledInSlice += 1;
        }
        const sliceDur = Math.max(0, this.now() - sliceStart);
        if (sliceDur > this.peakSliceMs) this.peakSliceMs = sliceDur;
        if (sliceDur > this.maxBudgetMs) this.overBudgetSlices += 1;
        if (this.queue.length > 0) {
          this.yieldCount += 1;
          await this.yieldToIdle(this.queue.length, sliceDur);
        }
      }
    } finally {
      this.pumping = false;
      if (this.queue.length > 0) this.schedulePump();
    }
  }

  private putCache(hash: string, record: CompiledShaderPipeline<TPipeline>): void {
    if (this.cache.has(hash)) this.cache.delete(hash);
    this.cache.set(hash, record);
    while (this.cache.size > this.maxCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 3. Zero-Copy Multi-Viewport Coordinator                                    */
/* -------------------------------------------------------------------------- */

export type StudioViewportRole = "main-canvas" | "minimap" | "reference-3d" | "popout-monitor";

export interface ViewportRegistration {
  readonly id: string; readonly role: StudioViewportRole;
  readonly width: number; readonly height: number; readonly dpr?: number;
  readonly viewMatrix?: ArrayLike<number>; readonly projectionMatrix?: ArrayLike<number>;
}

export interface ViewportRenderPass {
  readonly viewportId: string; readonly role: StudioViewportRole;
  readonly width: number; readonly height: number; readonly dpr: number;
  readonly sharedBuffer: SharedArrayBuffer | ArrayBuffer;
  readonly byteOffset: number; readonly byteLength: number;
  readonly viewProjectionMatrix: Float32Array;
  readonly visibleNodeIndices: Uint32Array;
  readonly visibleCount: number; readonly culledNodeCount: number;
}

export interface MultiViewportFramePlan {
  readonly frameNumber: number; readonly sceneVersion: number;
  readonly sharedBufferByteLength: number; readonly zeroCopyVerified: boolean;
  readonly totalViewports: number;
  readonly activeViewportIds: readonly string[];
  readonly culledViewportIds: readonly string[];
  readonly passes: readonly ViewportRenderPass[];
}

interface InternalViewportState {
  readonly id: string; readonly role: StudioViewportRole;
  width: number; height: number; dpr: number;
  readonly viewMatrix: Float32Array; readonly projectionMatrix: Float32Array;
  readonly viewProjectionMatrix: Float32Array; readonly frustumPlanes: Float32Array;
  visibleIndices: Uint32Array; dirty: boolean;
  lastRenderedSceneVersion: number;
  lastBoundBuffer: SharedArrayBuffer | ArrayBuffer | null;
}

/** 열 우선 `viewProjectionMatrix`에서 정규화된 6개 프러스텀 평면(Gribb-Hartmann)을 추출한다. */
export function extractFrustumPlanesInto(vp: Float32Array, out: Float32Array): void {
  const m0 = vp[0], m1 = vp[1], m2 = vp[2], m3 = vp[3];
  const m4 = vp[4], m5 = vp[5], m6 = vp[6], m7 = vp[7];
  const m8 = vp[8], m9 = vp[9], m10 = vp[10], m11 = vp[11];
  const m12 = vp[12], m13 = vp[13], m14 = vp[14], m15 = vp[15];

  const writePlane = (idx: number, a: number, b: number, c: number, d: number): void => {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    const o = idx * 4;
    out[o] = a * inv; out[o + 1] = b * inv; out[o + 2] = c * inv; out[o + 3] = d * inv;
  };
  writePlane(0, m3 + m0, m7 + m4, m11 + m8, m15 + m12);
  writePlane(1, m3 - m0, m7 - m4, m11 - m8, m15 - m12);
  writePlane(2, m3 + m1, m7 + m5, m11 + m9, m15 + m13);
  writePlane(3, m3 - m1, m7 - m5, m11 - m9, m15 - m13);
  writePlane(4, m3 + m2, m7 + m6, m11 + m10, m15 + m14);
  writePlane(5, m3 - m2, m7 - m6, m11 - m10, m15 - m14);
}

function sphereIntersectsFrustum(
  planes: Float32Array, cx: number, cy: number, cz: number, radius: number,
): boolean {
  for (let p = 0; p < 6; p += 1) {
    const o = p * 4;
    if (planes[o] * cx + planes[o + 1] * cy + planes[o + 2] * cz + planes[o + 3] < -radius) return false;
  }
  return true;
}

/** 단일 공유 씬/SAB 버퍼를 다중 뷰포트에 복사 없이 공유하며 더티 뷰포트 컬링을 수행한다. */
export class MultiViewportZeroCopyCoordinator {
  private readonly viewports = new Map<string, InternalViewportState>();
  private sharedBuffer: SharedArrayBuffer | ArrayBuffer | null = null;
  private sharedByteOffset = 0;
  private sharedByteLength = 0;
  private frameNumber = 0;

  bindSharedSceneBuffer(
    buffer: SharedArrayBuffer | ArrayBuffer,
    byteOffset = 0,
    byteLength = buffer.byteLength - byteOffset,
  ): void {
    if (byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > buffer.byteLength) {
      throw new RangeError("공유 씬 버퍼 바이트 범위가 버퍼 크기를 벗어났습니다.");
    }
    this.sharedBuffer = buffer;
    this.sharedByteOffset = byteOffset;
    this.sharedByteLength = byteLength;
    for (const vp of this.viewports.values()) {
      vp.lastBoundBuffer = buffer;
      vp.dirty = true;
    }
  }

  attachSceneGraph(scene: DodSoaSceneGraph): void {
    const view = scene.getWorldMatricesView();
    this.bindSharedSceneBuffer(view.buffer, view.byteOffset, view.byteLength);
  }

  registerViewport(config: ViewportRegistration): void {
    const viewMatrix = new Float32Array(MATRIX4_FLOATS);
    const projectionMatrix = new Float32Array(MATRIX4_FLOATS);
    const viewProjectionMatrix = new Float32Array(MATRIX4_FLOATS);
    const frustumPlanes = new Float32Array(FRUSTUM_PLANE_FLOATS);
    writeIdentityMatrix4(viewMatrix, 0);
    writeIdentityMatrix4(projectionMatrix, 0);
    if (config.viewMatrix) for (let i = 0; i < MATRIX4_FLOATS; i += 1) viewMatrix[i] = config.viewMatrix[i];
    if (config.projectionMatrix) for (let i = 0; i < MATRIX4_FLOATS; i += 1) projectionMatrix[i] = config.projectionMatrix[i];
    multiplyMatrix4Into(projectionMatrix, 0, viewMatrix, 0, viewProjectionMatrix, 0);
    extractFrustumPlanesInto(viewProjectionMatrix, frustumPlanes);
    this.viewports.set(config.id, {
      id: config.id, role: config.role,
      width: Math.max(1, Math.floor(config.width)), height: Math.max(1, Math.floor(config.height)),
      dpr: Math.max(0.5, config.dpr ?? 1),
      viewMatrix, projectionMatrix, viewProjectionMatrix, frustumPlanes,
      visibleIndices: new Uint32Array(256), dirty: true,
      lastRenderedSceneVersion: -1, lastBoundBuffer: this.sharedBuffer,
    });
  }

  unregisterViewport(viewportId: string): boolean { return this.viewports.delete(viewportId); }

  updateViewportCamera(viewportId: string, viewMatrix: ArrayLike<number>, projectionMatrix?: ArrayLike<number>): void {
    const vp = this.requireViewport(viewportId);
    for (let i = 0; i < MATRIX4_FLOATS; i += 1) vp.viewMatrix[i] = viewMatrix[i];
    if (projectionMatrix) for (let i = 0; i < MATRIX4_FLOATS; i += 1) vp.projectionMatrix[i] = projectionMatrix[i];
    multiplyMatrix4Into(vp.projectionMatrix, 0, vp.viewMatrix, 0, vp.viewProjectionMatrix, 0);
    extractFrustumPlanesInto(vp.viewProjectionMatrix, vp.frustumPlanes);
    vp.dirty = true;
  }

  resizeViewport(viewportId: string, width: number, height: number, dpr?: number): void {
    const vp = this.requireViewport(viewportId);
    vp.width = Math.max(1, Math.floor(width));
    vp.height = Math.max(1, Math.floor(height));
    if (dpr !== undefined) vp.dpr = Math.max(0.5, dpr);
    vp.dirty = true;
  }

  markViewportDirty(viewportId: string): void { this.requireViewport(viewportId).dirty = true; }

  private requireViewport(viewportId: string): InternalViewportState {
    const vp = this.viewports.get(viewportId);
    if (!vp) throw new Error(`등록되지 않은 뷰포트입니다: ${viewportId}`);
    return vp;
  }

  prepareFrame(sceneVersion: number, worldBounds: Float32Array, nodeCount: number): MultiViewportFramePlan {
    if (!this.sharedBuffer) {
      throw new Error("멀티 뷰포트 프레임을 준비하기 전에 공유 씬 버퍼를 바인딩해야 합니다.");
    }
    this.frameNumber += 1;
    const activeViewportIds: string[] = [];
    const culledViewportIds: string[] = [];
    const passes: ViewportRenderPass[] = [];
    let zeroCopyVerified = true;

    for (const vp of this.viewports.values()) {
      if (!vp.dirty && vp.lastRenderedSceneVersion === sceneVersion) {
        culledViewportIds.push(vp.id);
        continue;
      }
      if (vp.visibleIndices.length < nodeCount) {
        vp.visibleIndices = new Uint32Array(nextPowerOfTwoCapacity(nodeCount));
      }
      let visibleCount = 0;
      const planes = vp.frustumPlanes;
      for (let i = 0; i < nodeCount; i += 1) {
        const b = i * BOUNDS_FLOATS;
        if (sphereIntersectsFrustum(planes, worldBounds[b], worldBounds[b + 1], worldBounds[b + 2], worldBounds[b + 3])) {
          vp.visibleIndices[visibleCount++] = i;
        }
      }
      vp.lastBoundBuffer = this.sharedBuffer;
      if (vp.lastBoundBuffer !== this.sharedBuffer) zeroCopyVerified = false;
      vp.dirty = false;
      vp.lastRenderedSceneVersion = sceneVersion;
      activeViewportIds.push(vp.id);
      passes.push({
        viewportId: vp.id, role: vp.role, width: vp.width, height: vp.height, dpr: vp.dpr,
        sharedBuffer: this.sharedBuffer, byteOffset: this.sharedByteOffset, byteLength: this.sharedByteLength,
        viewProjectionMatrix: vp.viewProjectionMatrix,
        visibleNodeIndices: vp.visibleIndices.subarray(0, visibleCount),
        visibleCount, culledNodeCount: Math.max(0, nodeCount - visibleCount),
      });
    }

    return {
      frameNumber: this.frameNumber, sceneVersion, sharedBufferByteLength: this.sharedByteLength,
      zeroCopyVerified, totalViewports: this.viewports.size,
      activeViewportIds, culledViewportIds, passes,
    };
  }
}
