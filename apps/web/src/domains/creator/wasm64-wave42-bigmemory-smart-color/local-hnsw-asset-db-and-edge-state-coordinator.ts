/**
 * Wave 42: 온디바이스 `HNSW + SQ8` 에셋 벡터 DB 및 엣지 분산 상태 조율 프로토콜
 * (`local-hnsw-asset-db-and-edge-state-coordinator`).
 * 8비트 스칼라 양자화 소세계 그래프 유사도 탐색과 인과 `HLVC`·머클 타일 차분·무손실 수렴 병합을 수행한다.
 */

export const DEFAULT_HNSW_M = 12 as const;
export const DEFAULT_HNSW_EF_CONSTRUCTION = 48 as const;
export const DEFAULT_HNSW_EF_SEARCH = 32 as const;
export const MERKLE_RADIX_BUCKET_COUNT = 16 as const;

export type HnswAssetKind = "brush" | "proxy-texture" | "style-preset";
export type CausalOrderRelation = "after" | "before" | "concurrent" | "equal";

export interface Sq8QuantizedVector { readonly dimension: number; readonly minVal: number; readonly scale: number; readonly codes: Uint8Array }

export interface HnswAssetDocument {
  readonly assetId: string; readonly titleKo: string; readonly kind: HnswAssetKind;
  readonly tags: readonly string[]; readonly vector: readonly number[] | Float32Array;
}

export interface HnswIndexConfig {
  readonly dimension: number; readonly maxConnectionsM?: number;
  readonly efConstruction?: number; readonly normalizeVectors?: boolean;
}

export interface HnswAssetSearchOptions {
  readonly efSearch?: number; readonly filterKind?: HnswAssetKind; readonly requiredTags?: readonly string[];
}

export interface HnswAssetSearchHit {
  readonly assetId: string; readonly titleKo: string; readonly kind: HnswAssetKind;
  readonly tags: readonly string[]; readonly sq8DistanceL2: number; readonly similarityScore: number;
}

export interface HnswAssetSearchReport {
  readonly hits: readonly HnswAssetSearchHit[]; readonly visitedNodeCount: number;
  readonly totalIndexedCount: number; readonly maxLayerIndex: number; readonly memoryCompressionRatio: number;
}

export interface HybridVectorClock {
  readonly logicalWallTick: number; readonly logicalCounter: number;
  readonly nodeId: string; readonly vector: Readonly<Record<string, number>>;
}

export interface EdgeTileMutationOp {
  readonly opId: string; readonly tileKey: string; readonly entityId: string;
  readonly authorNodeId: string; readonly hlvc: HybridVectorClock;
  readonly payloadBytes: Uint8Array; readonly deleted?: boolean;
}

export interface EdgeTileEntityRecord {
  readonly entityId: string; readonly winningOpId: string; readonly authorNodeId: string;
  readonly hlvc: HybridVectorClock; readonly payloadBytes: Uint8Array; readonly deleted: boolean;
}

export interface SceneMerkleSummary {
  readonly nodeId: string; readonly clock: HybridVectorClock; readonly rootDigest: string;
  readonly bucketDigests: readonly string[]; readonly tileDigests: Readonly<Record<string, string>>;
}

export interface MerkleTileDiffResult {
  readonly inSync: boolean; readonly mismatchedBucketIndices: readonly number[]; readonly divergentTileKeys: readonly string[];
}

export interface EdgeReplicaSnapshot {
  readonly nodeId: string; readonly clock: HybridVectorClock; readonly operations: readonly EdgeTileMutationOp[];
}

export interface EdgeSyncReconciliationReport {
  readonly appliedRemoteOpCount: number; readonly skippedKnownOrSupersededCount: number;
  readonly divergentTileCountBefore: number; readonly postMergeRootDigest: string;
}

function hashFnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

function hashBytesAndTextHex(parts: readonly (string | Uint8Array)[]): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (const part of parts) {
    if (typeof part === "string") {
      for (let i = 0; i < part.length; i += 1) {
        const c = part.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ ((c << 3) | (c >>> 5)), 0x85ebca6b) >>> 0;
      }
    } else {
      for (let i = 0; i < part.byteLength; i += 1) {
        const b = part[i];
        h1 = Math.imul(h1 ^ b, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ ((b << 1) | (b >>> 7)), 0xc2b2ae35) >>> 0;
      }
    }
    h1 = Math.imul(h1 ^ 0xff, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ 0xa5, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function toNormalizedFloat32(vec: readonly number[] | Float32Array, normalize: boolean): Float32Array {
  const out = new Float32Array(vec.length);
  let normSq = 0;
  for (let i = 0; i < vec.length; i += 1) {
    const v = Number.isFinite(vec[i]) ? vec[i] : 0;
    out[i] = v;
    normSq += v * v;
  }
  if (normalize && normSq > 1e-12) {
    const inv = 1 / Math.sqrt(normSq);
    for (let i = 0; i < out.length; i += 1) out[i] *= inv;
  }
  return out;
}

/** 부동소수점 임베딩을 `8-bit` 스칼라 양자화(`SQ8`) 코드로 압축한다. */
export function quantizeVectorSq8(vector: readonly number[] | Float32Array): Sq8QuantizedVector {
  const dim = vector.length;
  let minVal = Number.POSITIVE_INFINITY;
  let maxVal = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < dim; i += 1) {
    const v = Number.isFinite(vector[i]) ? vector[i] : 0;
    if (v < minVal) minVal = v;
    if (v > maxVal) maxVal = v;
  }
  if (!Number.isFinite(minVal)) {
    minVal = 0;
    maxVal = 0;
  }
  const scale = maxVal - minVal > 1e-9 ? (maxVal - minVal) / 255 : 0;
  const invScale = scale > 0 ? 1 / scale : 0;
  const codes = new Uint8Array(dim);
  for (let i = 0; i < dim; i += 1) {
    const v = Number.isFinite(vector[i]) ? vector[i] : minVal;
    codes[i] = scale > 0 ? Math.min(255, Math.max(0, Math.round((v - minVal) * invScale))) : 0;
  }
  return { dimension: dim, minVal, scale, codes };
}

/** `SQ8` 양자화 벡터를 근사 `Float32Array`로 역양자화한다. */
export function dequantizeVectorSq8(sq8: Sq8QuantizedVector): Float32Array {
  const out = new Float32Array(sq8.dimension);
  for (let i = 0; i < sq8.dimension; i += 1) out[i] = sq8.minVal + sq8.codes[i] * sq8.scale;
  return out;
}

/** 정밀 질의 벡터(`Float32Array`)와 `SQ8` 후보 간 비대칭 제곱 L2 거리를 계산한다. */
export function computeSq8AsymmetricL2Distance(query: Float32Array, candidate: Sq8QuantizedVector): number {
  const dim = Math.min(query.length, candidate.dimension);
  let sumSq = 0;
  for (let i = 0; i < dim; i += 1) sumSq += (query[i] - (candidate.minVal + candidate.codes[i] * candidate.scale)) ** 2;
  return sumSq;
}

function computeSq8SymmetricL2Distance(a: Sq8QuantizedVector, b: Sq8QuantizedVector): number {
  const dim = Math.min(a.dimension, b.dimension);
  let sumSq = 0;
  for (let i = 0; i < dim; i += 1) sumSq += ((a.minVal + a.codes[i] * a.scale) - (b.minVal + b.codes[i] * b.scale)) ** 2;
  return sumSq;
}

interface InternalHnswNode {
  readonly index: number; readonly assetId: string; readonly titleKo: string;
  readonly kind: HnswAssetKind; readonly tags: readonly string[];
  readonly level: number; readonly sq8: Sq8QuantizedVector; readonly neighborsByLayer: number[][];
}

/** 온디바이스 브러시·프록시 질감·스타일 프리셋 검색용 결정론적 `HNSW + SQ8` 인덱스. */
export class LocalHnswSq8AssetIndex {
  private readonly dimension: number;
  private readonly m: number;
  private readonly mMax0: number;
  private readonly efConstruction: number;
  private readonly normalizeVectors: boolean;
  private readonly levelMult: number;
  private readonly nodes: InternalHnswNode[] = [];
  private entryNodeIndex = -1;
  private maxLayer = -1;

  constructor(config: HnswIndexConfig) {
    this.dimension = Math.max(1, Math.trunc(config.dimension));
    this.m = Math.max(4, Math.trunc(config.maxConnectionsM ?? DEFAULT_HNSW_M));
    this.mMax0 = this.m * 2;
    this.efConstruction = Math.max(this.m, Math.trunc(config.efConstruction ?? DEFAULT_HNSW_EF_CONSTRUCTION));
    this.normalizeVectors = config.normalizeVectors ?? true;
    this.levelMult = 1 / Math.log(this.m);
  }

  upsertAsset(doc: HnswAssetDocument): void {
    if (doc.vector.length !== this.dimension) throw new Error(`차원 불일치(${doc.vector.length})`);
    const normalized = toNormalizedFloat32(doc.vector, this.normalizeVectors);
    const sq8 = quantizeVectorSq8(normalized);
    const u = ((hashFnv1a32(doc.assetId) % 999_983) + 1) / 999_984;
    const level = Math.min(6, Math.floor(-Math.log(u) * this.levelMult));
    const nodeIdx = this.nodes.length;
    const newNode: InternalHnswNode = {
      index: nodeIdx, assetId: doc.assetId, titleKo: doc.titleKo, kind: doc.kind,
      tags: [...doc.tags], level, sq8, neighborsByLayer: Array.from({ length: level + 1 }, () => [] as number[]),
    };
    this.nodes.push(newNode);
    if (this.entryNodeIndex < 0) {
      this.entryNodeIndex = nodeIdx;
      this.maxLayer = level;
      return;
    }

    let currObj = this.entryNodeIndex;
    let currDist = computeSq8AsymmetricL2Distance(normalized, this.nodes[currObj].sq8);
    for (let lc = this.maxLayer; lc > level; lc -= 1) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const nb of this.nodes[currObj].neighborsByLayer[lc] ?? []) {
          const d = computeSq8AsymmetricL2Distance(normalized, this.nodes[nb].sq8);
          if (d < currDist) {
            currDist = d;
            currObj = nb;
            improved = true;
          }
        }
      }
    }

    let entryPoints = [currObj];
    for (let lc = Math.min(level, this.maxLayer); lc >= 0; lc -= 1) {
      const { candidates } = this.searchLayer(normalized, entryPoints, this.efConstruction, lc);
      const maxLinks = lc === 0 ? this.mMax0 : this.m;
      const selected = candidates.slice(0, maxLinks).map((item) => item.nodeIndex);
      newNode.neighborsByLayer[lc] = selected;
      for (const peerIdx of selected) {
        const peerLinks = this.nodes[peerIdx].neighborsByLayer[lc];
        if (!peerLinks.includes(nodeIdx)) {
          peerLinks.push(nodeIdx);
          if (peerLinks.length > maxLinks) {
            const peerSq8 = this.nodes[peerIdx].sq8;
            peerLinks.sort((a, b) => computeSq8SymmetricL2Distance(peerSq8, this.nodes[a].sq8) - computeSq8SymmetricL2Distance(peerSq8, this.nodes[b].sq8));
            peerLinks.length = maxLinks;
          }
        }
      }
      if (selected.length > 0) entryPoints = selected;
    }
    if (level > this.maxLayer) {
      this.maxLayer = level;
      this.entryNodeIndex = nodeIdx;
    }
  }

  searchTopK(queryVector: readonly number[] | Float32Array, k: number, options: HnswAssetSearchOptions = {}): HnswAssetSearchReport {
    if (queryVector.length !== this.dimension) throw new Error(`질의 차원 불일치(${queryVector.length})`);
    const compression = (this.dimension * 4) / (this.dimension + 8);
    if (this.nodes.length === 0 || k <= 0) {
      return { hits: [], visitedNodeCount: 0, totalIndexedCount: this.nodes.length, maxLayerIndex: this.maxLayer, memoryCompressionRatio: compression };
    }
    const queryNorm = toNormalizedFloat32(queryVector, this.normalizeVectors);
    const hasFilter = Boolean(options.filterKind || (options.requiredTags && options.requiredTags.length > 0));
    const ef = Math.max(k * (hasFilter ? 4 : 1), Math.trunc(options.efSearch ?? DEFAULT_HNSW_EF_SEARCH));
    const globalVisited = new Set<number>([this.entryNodeIndex]);

    let currObj = this.entryNodeIndex;
    let currDist = computeSq8AsymmetricL2Distance(queryNorm, this.nodes[currObj].sq8);
    for (let lc = this.maxLayer; lc >= 1; lc -= 1) {
      let improved = true;
      while (improved) {
        improved = false;
        for (const nb of this.nodes[currObj].neighborsByLayer[lc] ?? []) {
          globalVisited.add(nb);
          const d = computeSq8AsymmetricL2Distance(queryNorm, this.nodes[nb].sq8);
          if (d < currDist) {
            currDist = d;
            currObj = nb;
            improved = true;
          }
        }
      }
    }

    const layer0 = this.searchLayer(queryNorm, [currObj], ef, 0);
    for (const v of layer0.visited) globalVisited.add(v);
    const matchesFilter = (node: InternalHnswNode): boolean =>
      (!options.filterKind || node.kind === options.filterKind)
      && (!options.requiredTags || options.requiredTags.every((tag) => node.tags.includes(tag)));

    let filtered = layer0.candidates.filter((item) => matchesFilter(this.nodes[item.nodeIndex]));
    if (hasFilter && filtered.length < k) {
      const seen = new Set(filtered.map((item) => item.nodeIndex));
      for (const node of this.nodes) {
        if (seen.has(node.index) || !matchesFilter(node)) continue;
        globalVisited.add(node.index);
        filtered.push({ nodeIndex: node.index, distance: computeSq8AsymmetricL2Distance(queryNorm, node.sq8) });
      }
      filtered = filtered.sort((a, b) => a.distance - b.distance);
    }

    const hits: HnswAssetSearchHit[] = filtered.slice(0, k).map((item) => {
      const node = this.nodes[item.nodeIndex];
      return {
        assetId: node.assetId, titleKo: node.titleKo, kind: node.kind, tags: node.tags,
        sq8DistanceL2: item.distance, similarityScore: Math.max(0, 1 - item.distance * 0.5),
      };
    });
    return { hits, visitedNodeCount: globalVisited.size, totalIndexedCount: this.nodes.length, maxLayerIndex: this.maxLayer, memoryCompressionRatio: compression };
  }

  private searchLayer(query: Float32Array, entryIndices: readonly number[], ef: number, layer: number) {
    const visited = new Set<number>();
    const pool: { nodeIndex: number; distance: number; explored: boolean }[] = [];
    for (const idx of entryIndices) {
      if (visited.has(idx)) continue;
      visited.add(idx);
      pool.push({ nodeIndex: idx, distance: computeSq8AsymmetricL2Distance(query, this.nodes[idx].sq8), explored: false });
    }
    pool.sort((a, b) => a.distance - b.distance);
    while (true) {
      const next = pool.find((item) => !item.explored);
      if (!next || (pool.length >= ef && next.distance > pool[Math.min(ef - 1, pool.length - 1)].distance)) break;
      next.explored = true;
      for (const nb of this.nodes[next.nodeIndex].neighborsByLayer[layer] ?? []) {
        if (visited.has(nb)) continue;
        visited.add(nb);
        const dist = computeSq8AsymmetricL2Distance(query, this.nodes[nb].sq8);
        if (pool.length < ef || dist < pool[pool.length - 1].distance) {
          pool.push({ nodeIndex: nb, distance: dist, explored: false });
          pool.sort((a, b) => a.distance - b.distance);
          if (pool.length > ef * 2) pool.length = ef * 2;
        }
      }
    }
    return { candidates: pool.slice(0, ef).map(({ nodeIndex, distance }) => ({ nodeIndex, distance })), visited };
  }
}

/** 노드의 초기 인과 하이브리드 논리·벡터 클럭(`HLVC`)을 생성한다. */
export function createInitialHybridVectorClock(nodeId: string, wallTick = 0): HybridVectorClock {
  return { logicalWallTick: Math.max(0, Math.trunc(wallTick)), logicalCounter: 0, nodeId, vector: { [nodeId]: 0 } };
}

/** 로컬 이벤트 발생 시 `HLVC` 논리 벽시계와 로컬 벡터 시퀀스를 단조 증가시킨다. */
export function advanceHybridVectorClock(current: HybridVectorClock, observedWallTick: number): HybridVectorClock {
  const wall = Math.max(0, Math.trunc(observedWallTick));
  const nextWall = Math.max(current.logicalWallTick, wall);
  return {
    logicalWallTick: nextWall,
    logicalCounter: nextWall === current.logicalWallTick ? current.logicalCounter + 1 : 0,
    nodeId: current.nodeId,
    vector: { ...current.vector, [current.nodeId]: (current.vector[current.nodeId] ?? 0) + 1 },
  };
}

/** 원격 메시지 수신 시 두 `HLVC`의 인과 벡터 최대값과 하이브리드 벽시계를 병합한다. */
export function mergeHybridVectorClocks(local: HybridVectorClock, remote: HybridVectorClock, observedWallTick = local.logicalWallTick): HybridVectorClock {
  const nextWall = Math.max(local.logicalWallTick, remote.logicalWallTick, Math.max(0, Math.trunc(observedWallTick)));
  const nextCounter = nextWall === local.logicalWallTick && nextWall === remote.logicalWallTick
    ? Math.max(local.logicalCounter, remote.logicalCounter) + 1
    : nextWall === local.logicalWallTick ? local.logicalCounter + 1 : nextWall === remote.logicalWallTick ? remote.logicalCounter + 1 : 0;
  const mergedVec: Record<string, number> = { ...local.vector };
  for (const [peer, seq] of Object.entries(remote.vector)) mergedVec[peer] = Math.max(mergedVec[peer] ?? 0, seq);
  mergedVec[local.nodeId] = (mergedVec[local.nodeId] ?? 0) + 1;
  return { logicalWallTick: nextWall, logicalCounter: nextCounter, nodeId: local.nodeId, vector: mergedVec };
}

/** 두 `HybridVectorClock`의 벡터 성분으로 인과 선후·동시성(`concurrent`)을 판정한다. */
export function compareHybridVectorClocks(clockA: HybridVectorClock, clockB: HybridVectorClock): CausalOrderRelation {
  let aLess = false;
  let bLess = false;
  for (const peer of new Set([...Object.keys(clockA.vector), ...Object.keys(clockB.vector)])) {
    const va = clockA.vector[peer] ?? 0;
    const vb = clockB.vector[peer] ?? 0;
    if (va < vb) aLess = true;
    if (vb < va) bLess = true;
  }
  return !aLess && !bLess ? "equal" : aLess && !bLess ? "before" : bLess && !aLess ? "after" : "concurrent";
}

function compareOpLwwOrder(a: EdgeTileMutationOp, b: EdgeTileMutationOp): number {
  if (a.hlvc.logicalWallTick !== b.hlvc.logicalWallTick) return a.hlvc.logicalWallTick - b.hlvc.logicalWallTick;
  if (a.hlvc.logicalCounter !== b.hlvc.logicalCounter) return a.hlvc.logicalCounter - b.hlvc.logicalCounter;
  return a.authorNodeId !== b.authorNodeId ? a.authorNodeId.localeCompare(b.authorNodeId, "en") : a.opId.localeCompare(b.opId, "en");
}

/** 타일별 엔티티 맵으로부터 2단계 기수 버킷(`16`개) 및 루트 머클 다이제스트 요약을 생성한다. */
export function buildSceneMerkleSummary(
  nodeId: string, clock: HybridVectorClock, tiles: ReadonlyMap<string, ReadonlyMap<string, EdgeTileEntityRecord>>,
): SceneMerkleSummary {
  const tileDigests: Record<string, string> = {};
  const bucketItems: string[][] = Array.from({ length: MERKLE_RADIX_BUCKET_COUNT }, () => []);
  for (const tileKey of [...tiles.keys()].sort((a, b) => a.localeCompare(b, "en"))) {
    const entityMap = tiles.get(tileKey);
    if (!entityMap || entityMap.size === 0) continue;
    const parts: (string | Uint8Array)[] = [tileKey];
    for (const ent of [...entityMap.values()].sort((a, b) => a.entityId.localeCompare(b.entityId, "en"))) {
      parts.push(`${ent.entityId}:${ent.winningOpId}:${ent.deleted ? "1" : "0"}:${ent.hlvc.logicalWallTick}:${ent.hlvc.logicalCounter}`);
      parts.push(ent.payloadBytes);
    }
    const digest = hashBytesAndTextHex(parts);
    tileDigests[tileKey] = digest;
    bucketItems[hashFnv1a32(tileKey) % MERKLE_RADIX_BUCKET_COUNT].push(`${tileKey}=${digest}`);
  }
  const bucketDigests = bucketItems.map((entries, idx) => (entries.length === 0 ? `empty-${idx.toString(16)}` : hashBytesAndTextHex(entries)));
  return { nodeId, clock, rootDigest: hashBytesAndTextHex(bucketDigests), bucketDigests, tileDigests };
}

/** 두 피어의 머클 요약을 비교하여 불일치 타일 키만 정확히 추출한다. */
export function computeMerkleTileDiff(localSummary: SceneMerkleSummary, remoteSummary: SceneMerkleSummary): MerkleTileDiffResult {
  if (localSummary.rootDigest === remoteSummary.rootDigest) return { inSync: true, mismatchedBucketIndices: [], divergentTileKeys: [] };
  const mismatchedBuckets = new Set<number>();
  for (let b = 0; b < MERKLE_RADIX_BUCKET_COUNT; b += 1) {
    if (localSummary.bucketDigests[b] !== remoteSummary.bucketDigests[b]) mismatchedBuckets.add(b);
  }
  const divergentTileKeys: string[] = [];
  for (const tileKey of new Set([...Object.keys(localSummary.tileDigests), ...Object.keys(remoteSummary.tileDigests)])) {
    if (!mismatchedBuckets.has(hashFnv1a32(tileKey) % MERKLE_RADIX_BUCKET_COUNT)) continue;
    if (localSummary.tileDigests[tileKey] !== remoteSummary.tileDigests[tileKey]) divergentTileKeys.push(tileKey);
  }
  divergentTileKeys.sort((a, b) => a.localeCompare(b, "en"));
  return { inSync: divergentTileKeys.length === 0, mismatchedBucketIndices: [...mismatchedBuckets].sort((a, b) => a - b), divergentTileKeys };
}

/** 오프라인 단절 후에도 교환법칙·결합법칙·멱등성을 보장하며 수렴하는 엣지 상태 조율 노드. */
export class EdgeStateCoordinatorNode {
  readonly nodeId: string;
  private clock: HybridVectorClock;
  private readonly tiles = new Map<string, Map<string, EdgeTileEntityRecord>>();
  private readonly opLog = new Map<string, EdgeTileMutationOp>();

  constructor(nodeId: string, initialWallTick = 0) {
    this.nodeId = nodeId;
    this.clock = createInitialHybridVectorClock(nodeId, initialWallTick);
  }

  mutateTileEntity(params: {
    readonly tileKey: string; readonly entityId: string; readonly payloadBytes: Uint8Array;
    readonly observedWallTick: number; readonly deleted?: boolean;
  }): EdgeTileMutationOp {
    this.clock = advanceHybridVectorClock(this.clock, params.observedWallTick);
    const op: EdgeTileMutationOp = {
      opId: `${this.nodeId}#${this.clock.vector[this.nodeId] ?? 1}`, tileKey: params.tileKey, entityId: params.entityId,
      authorNodeId: this.nodeId, hlvc: this.clock, payloadBytes: params.payloadBytes.slice(), deleted: params.deleted ?? false,
    };
    this.applyOperationInternal(op);
    return op;
  }

  exportMerkleSummary(): SceneMerkleSummary { return buildSceneMerkleSummary(this.nodeId, this.clock, this.tiles); }

  exportOperationsForTiles(tileKeys?: readonly string[]): EdgeReplicaSnapshot {
    const filterSet = tileKeys ? new Set(tileKeys) : null;
    const operations = [...this.opLog.values()].filter((op) => !filterSet || filterSet.has(op.tileKey)).sort(compareOpLwwOrder);
    return { nodeId: this.nodeId, clock: this.clock, operations };
  }

  mergeRemoteSnapshot(snapshot: EdgeReplicaSnapshot, divergentTileCountBefore = 0): EdgeSyncReconciliationReport {
    this.clock = mergeHybridVectorClocks(this.clock, snapshot.clock, this.clock.logicalWallTick);
    let appliedRemoteOpCount = 0;
    let skippedKnownOrSupersededCount = 0;
    for (const op of snapshot.operations) {
      if (this.applyOperationInternal(op)) appliedRemoteOpCount += 1;
      else skippedKnownOrSupersededCount += 1;
    }
    return { appliedRemoteOpCount, skippedKnownOrSupersededCount, divergentTileCountBefore, postMergeRootDigest: this.exportMerkleSummary().rootDigest };
  }

  readLiveTileEntity(tileKey: string, entityId: string): Uint8Array | null {
    const record = this.tiles.get(tileKey)?.get(entityId);
    return !record || record.deleted ? null : record.payloadBytes.slice();
  }

  private applyOperationInternal(op: EdgeTileMutationOp): boolean {
    if (!this.opLog.has(op.opId)) this.opLog.set(op.opId, { ...op, payloadBytes: op.payloadBytes.slice() });
    let tileMap = this.tiles.get(op.tileKey);
    if (!tileMap) {
      tileMap = new Map();
      this.tiles.set(op.tileKey, tileMap);
    }
    const existing = tileMap.get(op.entityId);
    if (existing) {
      const existingOp: EdgeTileMutationOp = {
        opId: existing.winningOpId, tileKey: op.tileKey, entityId: existing.entityId,
        authorNodeId: existing.authorNodeId, hlvc: existing.hlvc, payloadBytes: existing.payloadBytes, deleted: existing.deleted,
      };
      if (compareOpLwwOrder(op, existingOp) <= 0) return false;
    }
    tileMap.set(op.entityId, {
      entityId: op.entityId, winningOpId: op.opId, authorNodeId: op.authorNodeId,
      hlvc: op.hlvc, payloadBytes: op.payloadBytes.slice(), deleted: Boolean(op.deleted),
    });
    return true;
  }
}

/** 두 엣지 노드가 머클 타일 차분만 교환하여 양방향으로 무손실 동기화한다. */
export function reconcileEdgeReplicaPair(nodeA: EdgeStateCoordinatorNode, nodeB: EdgeStateCoordinatorNode) {
  const diffBefore = computeMerkleTileDiff(nodeA.exportMerkleSummary(), nodeB.exportMerkleSummary());
  const deltaFromA = nodeA.exportOperationsForTiles(diffBefore.divergentTileKeys);
  const deltaFromB = nodeB.exportOperationsForTiles(diffBefore.divergentTileKeys);
  const reportA = nodeA.mergeRemoteSnapshot(deltaFromB, diffBefore.divergentTileKeys.length);
  const reportB = nodeB.mergeRemoteSnapshot(deltaFromA, diffBefore.divergentTileKeys.length);
  return { diffBefore, reportA, reportB };
}
