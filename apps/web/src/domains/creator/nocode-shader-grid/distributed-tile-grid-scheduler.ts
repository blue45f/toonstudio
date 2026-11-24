/**
 * 콘텐츠 주소화(FNV-1a 64 / SHA-256) 분산 타일 캐시 + 멀티 워커 그리드 워크스틸링 스케줄러 (Wave 33 Track C).
 *
 * - 3D NPR / 무거운 필터 캔버스를 고정 타일로 분할하고, 각 타일의 입력·레시피·좌표를
 *   콘텐츠 주소화 해시 키로 정규화해 중복 연산을 제거한다.
 * - 이기종 부하(중앙 캐릭터·복잡 3D 타일 편중)를 멀티 워커 로컬 데크와 테일 워크스틸링으로 분산하고,
 *   장애 노드 발생 시 중단·대기 타일을 건강한 피어 노드로 즉시 재할당해 100% 완결성과 비트 동일성을 보장한다.
 */

export type TileHashAlgorithm = "fnv1a-64" | "sha-256";
export type TileWorkloadKind = "3d-npr-pass" | "heavy-wgsl-filter" | "impasto-normal" | "ao-bake";
export type WorkerNodeStatus = "healthy" | "failed";

export interface TileContentDescriptor {
  readonly tileX: number; readonly tileY: number; readonly width: number; readonly height: number;
  readonly workloadKind: TileWorkloadKind; readonly recipeDigest: string;
  readonly qualityTier: "draft" | "studio" | "master"; readonly sceneRevision: number;
}
export interface CachedTileEntry {
  readonly key: string; readonly pixels: Uint8ClampedArray; readonly checksumHex: string;
  readonly originNodeId: string; readonly byteLength: number; readonly storedAtTick: number;
}
export interface DistributedTileCacheStats {
  readonly algorithm: TileHashAlgorithm; readonly hits: number; readonly misses: number;
  readonly hitRate: number; readonly puts: number; readonly evictions: number;
  readonly entryCount: number; readonly bytesUsed: number; readonly maxBytes: number; readonly maxEntries: number;
}
export interface WorkerNodeConfig {
  readonly nodeId: string; readonly speedFactor?: number;
  readonly simulateFailure?: boolean; readonly failAfterTiles?: number;
}
export interface DistributedTileGridInput {
  readonly canvasWidth?: number; readonly canvasHeight?: number; readonly tileSize?: number;
  readonly workloadKind?: TileWorkloadKind; readonly recipeDigest?: string;
  readonly qualityTier?: "draft" | "studio" | "master"; readonly sceneRevision?: number;
  readonly hashAlgorithm?: TileHashAlgorithm; readonly workerCount?: number;
  readonly workers?: readonly WorkerNodeConfig[]; readonly faultyNodeIds?: readonly string[];
  readonly failAfterTiles?: number; readonly skewedWorkload?: boolean;
  readonly cache?: DistributedTileCache; readonly pixelSampleStride?: number;
}
export interface WorkStealEvent {
  readonly tileId: string; readonly thiefNodeId: string; readonly victimNodeId: string; readonly stolenAtMs: number;
}
export interface NodeFailoverEvent {
  readonly tileId: string; readonly failedNodeId: string; readonly reassignedToNodeId: string | null;
  readonly attempt: number; readonly failedAtMs: number; readonly recovered: boolean;
}
export interface TileExecutionResult {
  readonly tileId: string; readonly tileX: number; readonly tileY: number;
  readonly width: number; readonly height: number; readonly contentKey: string;
  readonly source: "cache" | "computed" | "failed"; readonly executedByNodeId: string | null;
  readonly wasStolen: boolean; readonly wasReassigned: boolean;
  readonly computeCostMs: number; readonly checksumHex: string;
}
export interface WorkerNodeSummary {
  readonly nodeId: string; readonly status: WorkerNodeStatus; readonly speedFactor: number;
  readonly processedTiles: number; readonly cacheHitTiles: number; readonly stolenTiles: number;
  readonly donatedTiles: number; readonly failedAttempts: number; readonly busyMs: number;
}
export interface TileGridExecutionReport {
  readonly canvasWidth: number; readonly canvasHeight: number; readonly tileSize: number;
  readonly cols: number; readonly rows: number; readonly totalTiles: number;
  readonly completedTiles: number; readonly failedTiles: number; readonly hashAlgorithm: TileHashAlgorithm;
  readonly cacheHits: number; readonly cacheMisses: number; readonly cacheHitRate: number;
  readonly serialComputeMs: number; readonly parallelMakespanMs: number; readonly parallelSpeedup: number;
  readonly loadBalanceEfficiency: number; readonly workStealCount: number;
  readonly workStealEvents: readonly WorkStealEvent[]; readonly failoverCount: number;
  readonly failoverEvents: readonly NodeFailoverEvent[]; readonly failedNodeIds: readonly string[];
  readonly allTilesRecovered: boolean; readonly stitchedDigestHex: string;
  readonly workerSummaries: readonly WorkerNodeSummary[]; readonly tileResults: readonly TileExecutionResult[];
  readonly cacheStats: DistributedTileCacheStats;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const TEXT_ENCODER = new TextEncoder();

const roundTo = (value: number, digits = 2): number => Math.round(value * (10 ** digits)) / (10 ** digits);
const rotr32 = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

const FNV64_OFFSET = BigInt("0xcbf29ce484222325");
const FNV64_PRIME = BigInt("0x100000001b3");
const FNV64_MASK = BigInt("0xffffffffffffffff");

/** 64비트 FNV-1a 해시를 16자리 16진 문자열로 산출한다. */
export function computeFnv1a64Hex(input: Uint8Array | Uint8ClampedArray | string): string {
  const bytes = typeof input === "string" ? TEXT_ENCODER.encode(input) : input;
  let hash = FNV64_OFFSET;
  for (let i = 0; i < bytes.length; i += 1) {
    hash = ((hash ^ BigInt(bytes[i] ?? 0)) * FNV64_PRIME) & FNV64_MASK;
  }
  return hash.toString(16).padStart(16, "0");
}

/** 동기식 순수 TypeScript FIPS 180-4 SHA-256 해시(64자리 16진 문자열). */
export function computeSha256SyncHex(input: Uint8Array | Uint8ClampedArray | string): string {
  const bytes = typeof input === "string" ? TEXT_ENCODER.encode(input) : input;
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let [h0, h1, h2, h3, h4, h5, h6, h7] = [
    SHA256_H0[0] ?? 0, SHA256_H0[1] ?? 0, SHA256_H0[2] ?? 0, SHA256_H0[3] ?? 0,
    SHA256_H0[4] ?? 0, SHA256_H0[5] ?? 0, SHA256_H0[6] ?? 0, SHA256_H0[7] ?? 0,
  ];
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3);
      const s1 = rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7].map((word) => word.toString(16).padStart(8, "0")).join("");
}

/** 타일 좌표·작업 종류·레시피 다이제스트를 정규화한 콘텐츠 주소화 해시 키 생성. */
export function createTileContentKey(descriptor: TileContentDescriptor, algorithm: TileHashAlgorithm = "sha-256"): string {
  const canonical = [
    "toonstudio.tile.v1", descriptor.workloadKind, descriptor.qualityTier,
    `rev=${descriptor.sceneRevision}`, `xy=${descriptor.tileX},${descriptor.tileY}`,
    `wh=${descriptor.width}x${descriptor.height}`, `recipe=${descriptor.recipeDigest}`,
  ].join("|");
  return algorithm === "fnv1a-64"
    ? `fnv1a64:${computeFnv1a64Hex(canonical)}`
    : `sha256:${computeSha256SyncHex(canonical)}`;
}

/** LRU 예산 제어와 무결성 검증을 지원하는 콘텐츠 주소화 분산 타일 캐시. */
export class DistributedTileCache {
  private readonly entries = new Map<string, CachedTileEntry>();
  private readonly maxBytes: number;
  private readonly maxEntries: number;
  private readonly algorithm: TileHashAlgorithm;
  private bytesUsed = 0;
  private hits = 0;
  private misses = 0;
  private puts = 0;
  private evictions = 0;
  private tick = 0;

  constructor(options: { readonly maxBytes?: number; readonly maxEntries?: number; readonly algorithm?: TileHashAlgorithm } = {}) {
    this.maxBytes = Math.max(256, Math.trunc(options.maxBytes ?? 16 * 1024 * 1024));
    this.maxEntries = Math.max(2, Math.trunc(options.maxEntries ?? 512));
    this.algorithm = options.algorithm ?? "sha-256";
  }

  get(key: string): CachedTileEntry | null {
    const found = this.entries.get(key);
    if (!found) {
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    this.entries.delete(key);
    this.entries.set(key, found);
    return { ...found, pixels: new Uint8ClampedArray(found.pixels) };
  }

  set(key: string, pixels: Uint8ClampedArray, originNodeId: string): CachedTileEntry {
    const copy = new Uint8ClampedArray(pixels);
    const byteLength = copy.byteLength;
    const existing = this.entries.get(key);
    if (existing) {
      this.bytesUsed -= existing.byteLength;
      this.entries.delete(key);
    }
    while (this.entries.size > 0 && (this.bytesUsed + byteLength > this.maxBytes || this.entries.size >= this.maxEntries)) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      const oldest = this.entries.get(oldestKey);
      if (oldest) this.bytesUsed -= oldest.byteLength;
      this.entries.delete(oldestKey);
      this.evictions += 1;
    }
    this.tick += 1;
    this.puts += 1;
    const entry: CachedTileEntry = {
      key, pixels: copy, checksumHex: computeFnv1a64Hex(copy), originNodeId, byteLength, storedAtTick: this.tick,
    };
    this.entries.set(key, entry);
    this.bytesUsed += byteLength;
    return { ...entry, pixels: new Uint8ClampedArray(entry.pixels) };
  }

  has(key: string): boolean { return this.entries.has(key); }

  verifyEntryIntegrity(key: string): boolean {
    const found = this.entries.get(key);
    return found ? computeFnv1a64Hex(found.pixels) === found.checksumHex : false;
  }

  getStats(): DistributedTileCacheStats {
    const total = this.hits + this.misses;
    return {
      algorithm: this.algorithm, hits: this.hits, misses: this.misses,
      hitRate: total > 0 ? roundTo(this.hits / total, 4) : 0,
      puts: this.puts, evictions: this.evictions, entryCount: this.entries.size,
      bytesUsed: this.bytesUsed, maxBytes: this.maxBytes, maxEntries: this.maxEntries,
    };
  }

  clear(): void {
    this.entries.clear();
    this.bytesUsed = 0; this.hits = 0; this.misses = 0; this.puts = 0; this.evictions = 0; this.tick = 0;
  }
}

interface InternalTileTask {
  readonly tileId: string; readonly tileX: number; readonly tileY: number;
  readonly width: number; readonly height: number; readonly contentKey: string;
  readonly computeCostMs: number; readonly seedNumber: number;
  wasStolen: boolean; wasReassigned: boolean; attempts: number;
}
interface InternalWorkerState {
  readonly nodeId: string; readonly speedFactor: number;
  readonly simulateFailure: boolean; readonly failAfterTiles: number;
  status: WorkerNodeStatus; deque: InternalTileTask[];
  availableAtMs: number; busyMs: number; processedTiles: number; cacheHitTiles: number;
  stolenTiles: number; donatedTiles: number; failedAttempts: number;
}

const BASE_COST_MS: Readonly<Record<TileWorkloadKind, number>> = {
  "3d-npr-pass": 18, "heavy-wgsl-filter": 15, "impasto-normal": 14, "ao-bake": 22,
};

function estimateTileComputeCostMs(
  tileX: number, tileY: number, cols: number, rows: number,
  workloadKind: TileWorkloadKind, qualityTier: "draft" | "studio" | "master", skewedWorkload: boolean,
): number {
  const tierMul = qualityTier === "master" ? 1.45 : qualityTier === "studio" ? 1.0 : 0.65;
  const base = BASE_COST_MS[workloadKind] * tierMul;
  if (!skewedWorkload) return roundTo(base, 2);
  const dist = Math.hypot((tileX + 0.5) / Math.max(1, cols) - 0.5, (tileY + 0.5) / Math.max(1, rows) - 0.42);
  return roundTo(base * Math.max(0.55, 3.6 - dist * 4.4), 2);
}

/** 타일 단위 결정론적 픽셀 커널(캐시 미스 시 실제 RGBA 샘플 버퍼 생성). */
function computeTileRgbaSample(task: InternalTileTask, sampleStride: number): Uint8ClampedArray {
  const step = Math.max(1, Math.min(16, Math.trunc(sampleStride)));
  const sw = Math.max(4, Math.ceil(task.width / step));
  const sh = Math.max(4, Math.ceil(task.height / step));
  const out = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y += 1) {
    const gy = task.tileY * task.height + y * step;
    for (let x = 0; x < sw; x += 1) {
      const gx = task.tileX * task.width + x * step;
      const shade = Math.max(0, Math.min(1, 0.5 + 0.45 * Math.sin(gx * 0.045 + task.seedNumber * 0.013) * Math.cos(gy * 0.041 - task.seedNumber * 0.011)));
      const idx = (y * sw + x) * 4;
      out[idx] = Math.round((0.28 + 0.68 * shade) * 255);
      out[idx + 1] = Math.round((0.32 + 0.56 * (1 - shade * 0.4)) * 255);
      out[idx + 2] = Math.round((0.42 + 0.5 * shade) * 255);
      out[idx + 3] = 255;
    }
  }
  return out;
}

function buildWorkers(input: DistributedTileGridInput): InternalWorkerState[] {
  const faultySet = new Set(input.faultyNodeIds ?? []);
  const defaultFailAfter = Math.max(0, Math.trunc(input.failAfterTiles ?? 1));
  const createState = (nodeId: string, speedFactor: number, simulateFailure: boolean, failAfterTiles: number): InternalWorkerState => ({
    nodeId, speedFactor: Math.max(0.25, Math.min(4, speedFactor)), simulateFailure,
    failAfterTiles: Math.max(0, Math.trunc(failAfterTiles)), status: "healthy",
    deque: [], availableAtMs: 0, busyMs: 0, processedTiles: 0, cacheHitTiles: 0,
    stolenTiles: 0, donatedTiles: 0, failedAttempts: 0,
  });

  if (input.workers && input.workers.length > 0) {
    return input.workers.map((w) => createState(w.nodeId, w.speedFactor ?? 1, w.simulateFailure ?? faultySet.has(w.nodeId), w.failAfterTiles ?? defaultFailAfter));
  }
  const count = Math.max(1, Math.min(16, Math.trunc(input.workerCount ?? 4)));
  return Array.from({ length: count }, (_, i) => {
    const nodeId = `worker-${i + 1}`;
    return createState(nodeId, 1.0, faultySet.has(nodeId), defaultFailAfter);
  });
}

function makeFailedResult(task: InternalTileTask): TileExecutionResult {
  return {
    tileId: task.tileId, tileX: task.tileX, tileY: task.tileY, width: task.width, height: task.height,
    contentKey: task.contentKey, source: "failed", executedByNodeId: null,
    wasStolen: task.wasStolen, wasReassigned: false, computeCostMs: 0, checksumHex: "0000000000000000",
  };
}

/** 콘텐츠 주소화 타일 캐시 + 멀티 워커 워크스틸링 + 장애 노드 자동 재할당 스케줄러를 실행한다. */
export function executeDistributedTileGrid(input: DistributedTileGridInput = {}): TileGridExecutionReport {
  const canvasWidth = Math.max(128, Math.min(4096, Math.trunc(input.canvasWidth ?? 512)));
  const canvasHeight = Math.max(128, Math.min(4096, Math.trunc(input.canvasHeight ?? 512)));
  const tileSize = Math.max(64, Math.min(512, Math.trunc(input.tileSize ?? 128)));
  const workloadKind: TileWorkloadKind = input.workloadKind ?? "3d-npr-pass";
  const recipeDigest = input.recipeDigest ?? "shader-default-v1";
  const qualityTier = input.qualityTier ?? "studio";
  const sceneRevision = Math.max(1, Math.trunc(input.sceneRevision ?? 1));
  const hashAlgorithm: TileHashAlgorithm = input.hashAlgorithm ?? "sha-256";
  const skewedWorkload = input.skewedWorkload ?? true;
  const sampleStride = Math.max(4, Math.min(16, Math.trunc(input.pixelSampleStride ?? 16)));
  const cache = input.cache ?? new DistributedTileCache({ algorithm: hashAlgorithm });

  const cols = Math.ceil(canvasWidth / tileSize);
  const rows = Math.ceil(canvasHeight / tileSize);
  const workers = buildWorkers(input);
  const recipeSeed = Number.parseInt(computeFnv1a64Hex(recipeDigest).slice(0, 6), 16) || 17;

  const allTasks: InternalTileTask[] = [];
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      const width = Math.min(tileSize, canvasWidth - tx * tileSize);
      const height = Math.min(tileSize, canvasHeight - ty * tileSize);
      const contentKey = createTileContentKey({ tileX: tx, tileY: ty, width, height, workloadKind, recipeDigest, qualityTier, sceneRevision }, hashAlgorithm);
      allTasks.push({
        tileId: `T-${tx}_${ty}`, tileX: tx, tileY: ty, width, height, contentKey,
        computeCostMs: estimateTileComputeCostMs(tx, ty, cols, rows, workloadKind, qualityTier, skewedWorkload),
        seedNumber: recipeSeed + ty * 31 + tx * 7, wasStolen: false, wasReassigned: false, attempts: 0,
      });
    }
  }

  const chunkSize = Math.max(1, Math.ceil(allTasks.length / workers.length));
  allTasks.forEach((task, i) => {
    workers[Math.min(workers.length - 1, Math.floor(i / chunkSize))]?.deque.push(task);
  });

  const resultsByTileId = new Map<string, TileExecutionResult>();
  const workStealEvents: WorkStealEvent[] = [];
  const failoverEvents: NodeFailoverEvent[] = [];
  let cacheHits = 0;
  let cacheMisses = 0;
  let serialComputeMs = 0;
  const CACHE_LOOKUP_MS = 0.4;

  const findLeastLoadedHealthy = (excludeId?: string): InternalWorkerState | null => {
    let best: InternalWorkerState | null = null;
    for (const w of workers) {
      if (w.status !== "healthy" || w.nodeId === excludeId) continue;
      if (!best || (w.availableAtMs + w.deque.length * 10) < (best.availableAtMs + best.deque.length * 10)) best = w;
    }
    return best;
  };

  let guard = 0;
  const maxSteps = allTasks.length * 16 + 64;
  while (workers.some((w) => w.status === "healthy" && w.deque.length > 0) && guard < maxSteps) {
    guard += 1;
    let chosen: InternalWorkerState | null = null;
    for (const w of workers) {
      if (w.status !== "healthy") continue;
      const canSteal = w.deque.length === 0 && workers.some((p) => p.status === "healthy" && p.nodeId !== w.nodeId && p.deque.length > 0);
      if ((w.deque.length > 0 || canSteal) && (!chosen || w.availableAtMs < chosen.availableAtMs)) chosen = w;
    }
    if (!chosen) break;

    let task = chosen.deque.shift();
    if (!task) {
      let victim: InternalWorkerState | null = null;
      for (const peer of workers) {
        if (peer.status === "healthy" && peer.nodeId !== chosen.nodeId && peer.deque.length > (victim?.deque.length ?? 0)) victim = peer;
      }
      const stolen = victim?.deque.pop();
      if (!victim || !stolen) break;
      stolen.wasStolen = true;
      chosen.stolenTiles += 1;
      victim.donatedTiles += 1;
      workStealEvents.push({ tileId: stolen.tileId, thiefNodeId: chosen.nodeId, victimNodeId: victim.nodeId, stolenAtMs: roundTo(chosen.availableAtMs, 2) });
      task = stolen;
    }

    task.attempts += 1;
    if (chosen.simulateFailure && chosen.processedTiles >= chosen.failAfterTiles) {
      const failDelay = roundTo(Math.min(4.5, task.computeCostMs * 0.2), 2);
      chosen.availableAtMs = roundTo(chosen.availableAtMs + failDelay, 2);
      chosen.busyMs = roundTo(chosen.busyMs + failDelay, 2);
      chosen.failedAttempts += 1;
      chosen.status = "failed";
      const orphaned = [task, ...chosen.deque];
      chosen.deque = [];
      for (const orphan of orphaned) {
        const target = findLeastLoadedHealthy(chosen.nodeId);
        if (target) {
          orphan.wasReassigned = true;
          target.deque.push(orphan);
          failoverEvents.push({ tileId: orphan.tileId, failedNodeId: chosen.nodeId, reassignedToNodeId: target.nodeId, attempt: orphan.attempts, failedAtMs: chosen.availableAtMs, recovered: true });
        } else {
          failoverEvents.push({ tileId: orphan.tileId, failedNodeId: chosen.nodeId, reassignedToNodeId: null, attempt: orphan.attempts, failedAtMs: chosen.availableAtMs, recovered: false });
          resultsByTileId.set(orphan.tileId, makeFailedResult(orphan));
        }
      }
      continue;
    }

    const cached = cache.get(task.contentKey);
    if (cached) {
      const stepMs = CACHE_LOOKUP_MS / chosen.speedFactor;
      chosen.availableAtMs = roundTo(chosen.availableAtMs + stepMs, 2);
      chosen.busyMs = roundTo(chosen.busyMs + stepMs, 2);
      chosen.processedTiles += 1;
      chosen.cacheHitTiles += 1;
      cacheHits += 1;
      serialComputeMs += CACHE_LOOKUP_MS;
      resultsByTileId.set(task.tileId, {
        tileId: task.tileId, tileX: task.tileX, tileY: task.tileY, width: task.width, height: task.height,
        contentKey: task.contentKey, source: "cache", executedByNodeId: chosen.nodeId,
        wasStolen: task.wasStolen, wasReassigned: task.wasReassigned, computeCostMs: roundTo(stepMs, 2), checksumHex: cached.checksumHex,
      });
    } else {
      const stored = cache.set(task.contentKey, computeTileRgbaSample(task, sampleStride), chosen.nodeId);
      const stepMs = task.computeCostMs / chosen.speedFactor;
      chosen.availableAtMs = roundTo(chosen.availableAtMs + stepMs, 2);
      chosen.busyMs = roundTo(chosen.busyMs + stepMs, 2);
      chosen.processedTiles += 1;
      cacheMisses += 1;
      serialComputeMs += task.computeCostMs;
      resultsByTileId.set(task.tileId, {
        tileId: task.tileId, tileX: task.tileX, tileY: task.tileY, width: task.width, height: task.height,
        contentKey: task.contentKey, source: "computed", executedByNodeId: chosen.nodeId,
        wasStolen: task.wasStolen, wasReassigned: task.wasReassigned, computeCostMs: roundTo(stepMs, 2), checksumHex: stored.checksumHex,
      });
    }
  }

  const tileResults = allTasks.map((task) => resultsByTileId.get(task.tileId) ?? makeFailedResult(task));
  const completedTiles = tileResults.filter((t) => t.source !== "failed").length;
  const failedTiles = allTasks.length - completedTiles;
  const parallelMakespanMs = roundTo(Math.max(0.01, ...workers.map((w) => w.availableAtMs)), 2);
  const roundedSerialMs = roundTo(Math.max(0.01, serialComputeMs), 2);
  const activePool = workers.some((w) => w.status === "healthy") ? workers.filter((w) => w.status === "healthy") : workers;
  const meanBusy = activePool.reduce((acc, w) => acc + w.busyMs, 0) / Math.max(1, activePool.length);

  return {
    canvasWidth, canvasHeight, tileSize, cols, rows,
    totalTiles: allTasks.length, completedTiles, failedTiles, hashAlgorithm,
    cacheHits, cacheMisses, cacheHitRate: allTasks.length > 0 ? roundTo(cacheHits / allTasks.length, 4) : 0,
    serialComputeMs: roundedSerialMs, parallelMakespanMs,
    parallelSpeedup: roundTo(roundedSerialMs / parallelMakespanMs, 2),
    loadBalanceEfficiency: roundTo(Math.min(1, meanBusy / Math.max(0.01, parallelMakespanMs)), 3),
    workStealCount: workStealEvents.length, workStealEvents,
    failoverCount: failoverEvents.length, failoverEvents,
    failedNodeIds: workers.filter((w) => w.status === "failed").map((w) => w.nodeId),
    allTilesRecovered: failedTiles === 0 && failoverEvents.every((ev) => ev.recovered),
    stitchedDigestHex: computeFnv1a64Hex(tileResults.map((r) => `${r.tileId}:${r.checksumHex}`).join("|")),
    workerSummaries: workers.map((w) => ({
      nodeId: w.nodeId, status: w.status, speedFactor: w.speedFactor, processedTiles: w.processedTiles,
      cacheHitTiles: w.cacheHitTiles, stolenTiles: w.stolenTiles, donatedTiles: w.donatedTiles,
      failedAttempts: w.failedAttempts, busyMs: roundTo(w.busyMs, 2),
    })),
    tileResults,
    cacheStats: cache.getStats(),
  };
}
