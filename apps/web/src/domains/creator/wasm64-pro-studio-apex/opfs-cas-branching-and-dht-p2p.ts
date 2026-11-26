/**
 * OPFS 콘텐츠 주소 지정 스토리지(CAS) 버전화 쿼드트리 · Git 스타일 분기 타임라인 ·
 * Kademlia XOR DHT 피어 탐색 및 P2P 델타 복구 라우터.
 *
 * - `OpfsCasBranchTimeline`: 64비트 FNV-1a 콘텐츠 주소 지정 타일 저장소와 구조 공유
 *   버전화 쿼드트리를 결합해, 변경되지 않은 타일을 복제하지 않고 A/B 콘티 브랜치 생성·
 *   비교(diff)·체크아웃·스냅샷 즉시 복원을 수행한다.
 * - `KademliaP2pPeerRouter`: 64비트 XOR 거리 k-버킷, RTT·신뢰도 기반 피어 건강도 순위,
 *   최근접 k 피어 탐색 및 누락 타일 델타 복구 계획을 중앙 릴레이 비용 ₩0으로 수립한다.
 */

export const DEFAULT_CAS_GRID_SIZE = 16;
export const DEFAULT_KADEMLIA_K = 8;
export const EMPTY_TILE_SENTINEL_HASH = "0000000000000000";

const TEXT_ENCODER = new TextEncoder();

/** 표준 64비트 FNV-1a 해시(16자리 소문자 hex). 16비트 림 연산으로 BigInt 할당을 제거한다. */
export function fnv1a64Hex(bytes: Uint8Array): string {
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  for (let i = 0; i < bytes.length; i += 1) {
    h0 ^= bytes[i];
    const p0 = h0 * 0x1b3;
    const p1 = h1 * 0x1b3 + (p0 >>> 16);
    const p2 = h2 * 0x1b3 + ((h0 & 0xff) << 8) + (p1 >>> 16);
    const p3 = h3 * 0x1b3 + (h0 >>> 8) + ((h1 & 0xff) << 8) + (p2 >>> 16);
    h0 = p0 & 0xffff; h1 = p1 & 0xffff; h2 = p2 & 0xffff; h3 = p3 & 0xffff;
  }
  return (
    h3.toString(16).padStart(4, "0") +
    h2.toString(16).padStart(4, "0") +
    h1.toString(16).padStart(4, "0") +
    h0.toString(16).padStart(4, "0")
  );
}

export function fnv1a64StringHex(input: string): string {
  return fnv1a64Hex(TEXT_ENCODER.encode(input));
}

/* -------------------------------------------------------------------------- */
/* 1. OPFS CAS Backing Store & Versioned Quadtree Branch Timeline             */
/* -------------------------------------------------------------------------- */

export interface CasBlobStore {
  has(hash: string): Promise<boolean>;
  put(hash: string, bytes: Uint8Array): Promise<boolean>;
  get(hash: string): Promise<Uint8Array | null>;
  listHashes(): Promise<readonly string[]>;
  getStoredByteLength(): number;
  getBlobCount(): number;
}

export interface OpfsWritableLike { write(data: Uint8Array): Promise<void>; close(): Promise<void>; }
export interface OpfsFileLike { arrayBuffer(): Promise<ArrayBuffer>; }
export interface OpfsFileHandleLike { getFile(): Promise<OpfsFileLike>; createWritable(): Promise<OpfsWritableLike>; }
export interface OpfsDirectoryHandleLike {
  getFileHandle(name: string, options?: { create?: boolean }): Promise<OpfsFileHandleLike>;
}

/** 테스트 및 OPFS 미지원 환경용 인메모리 CAS 블롭 저장소. */
export class InMemoryCasBlobStore implements CasBlobStore {
  private readonly blobs = new Map<string, Uint8Array>();
  private totalBytes = 0;

  async has(hash: string): Promise<boolean> { return this.blobs.has(hash); }
  async put(hash: string, bytes: Uint8Array): Promise<boolean> {
    if (this.blobs.has(hash)) return false;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    this.blobs.set(hash, copy);
    this.totalBytes += copy.byteLength;
    return true;
  }
  async get(hash: string): Promise<Uint8Array | null> {
    const found = this.blobs.get(hash);
    if (!found) return null;
    const copy = new Uint8Array(found.byteLength);
    copy.set(found);
    return copy;
  }
  async listHashes(): Promise<readonly string[]> { return Array.from(this.blobs.keys()); }
  getStoredByteLength(): number { return this.totalBytes; }
  getBlobCount(): number { return this.blobs.size; }
}

/** 브라우저 OPFS 디렉터리 핸들에 콘텐츠 해시별 타일 파일을 영속화하는 CAS 어댑터. */
export class OpfsDirectoryCasBlobStore implements CasBlobStore {
  private readonly dir: OpfsDirectoryHandleLike;
  private readonly knownSizes = new Map<string, number>();
  private totalBytes = 0;

  constructor(dir: OpfsDirectoryHandleLike) { this.dir = dir; }

  async has(hash: string): Promise<boolean> {
    if (this.knownSizes.has(hash)) return true;
    try {
      const handle = await this.dir.getFileHandle(`${hash}.tile`, { create: false });
      const buf = await (await handle.getFile()).arrayBuffer();
      this.knownSizes.set(hash, buf.byteLength);
      this.totalBytes += buf.byteLength;
      return true;
    } catch { return false; }
  }

  async put(hash: string, bytes: Uint8Array): Promise<boolean> {
    if (await this.has(hash)) return false;
    const handle = await this.dir.getFileHandle(`${hash}.tile`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    this.knownSizes.set(hash, bytes.byteLength);
    this.totalBytes += bytes.byteLength;
    return true;
  }

  async get(hash: string): Promise<Uint8Array | null> {
    try {
      const handle = await this.dir.getFileHandle(`${hash}.tile`, { create: false });
      return new Uint8Array(await (await handle.getFile()).arrayBuffer());
    } catch { return null; }
  }

  async listHashes(): Promise<readonly string[]> { return Array.from(this.knownSizes.keys()); }
  getStoredByteLength(): number { return this.totalBytes; }
  getBlobCount(): number { return this.knownSizes.size; }
}

export interface TileWriteInput {
  readonly x: number; readonly y: number;
  /** `null`이면 해당 좌표 타일을 삭제(빈 타일)한다. */
  readonly bytes: Uint8Array | null;
}

export interface CasCommitRecord {
  readonly commitId: string; readonly parentCommitId: string | null;
  readonly branchName: string; readonly rootNodeHash: string;
  readonly message: string; readonly timestampMs: number;
  readonly writtenNewBlobs: number; readonly reusedExistingBlobs: number;
  readonly nonEmptyTileCount: number;
}

export interface CasBranchRef {
  readonly name: string; readonly headCommitId: string; readonly createdAtMs: number;
}

export interface CasTileDiffEntry {
  readonly x: number; readonly y: number;
  readonly beforeHash: string | null; readonly afterHash: string | null;
  readonly change: "added" | "modified" | "removed";
}

export interface CasBranchDiff {
  readonly fromCommitId: string; readonly toCommitId: string;
  readonly entries: readonly CasTileDiffEntry[]; readonly unchangedSubtreesPruned: number;
}

export interface CasStorageStats {
  readonly uniqueBlobs: number; readonly storedBytes: number;
  readonly logicalTileRefsAcrossCommits: number; readonly logicalBytesAcrossCommits: number;
  readonly deduplicationRatio: number; readonly branchCount: number;
  readonly commitCount: number; readonly quadtreeNodeCount: number;
}

export interface OpfsCasBranchTimelineOptions {
  readonly gridSize?: number; readonly store?: CasBlobStore;
  readonly defaultBranch?: string; readonly now?: () => number;
}

interface QuadtreeLeafNode {
  readonly kind: "leaf"; readonly hash: string; readonly tileHash: string;
  readonly byteLength: number; readonly nonEmptyCount: number;
}

interface QuadtreeInternalNode {
  readonly kind: "internal"; readonly hash: string;
  readonly children: readonly [string, string, string, string];
  readonly nonEmptyCount: number; readonly logicalBytes: number;
}

type QuadtreeNode = QuadtreeLeafNode | QuadtreeInternalNode;

function isPowerOfTwo(n: number): boolean { return n >= 1 && (n & (n - 1)) === 0; }

/** OPFS CAS 버전화 쿼드트리 및 Git 스타일 A/B 스토리보드 브랜치 타임라인. */
export class OpfsCasBranchTimeline {
  readonly gridSize: number;
  private readonly store: CasBlobStore;
  private readonly now: () => number;

  private readonly quadNodes = new Map<string, QuadtreeNode>();
  private readonly commits = new Map<string, CasCommitRecord>();
  private readonly branches = new Map<string, CasBranchRef>();
  private readonly emptySubtreeHashes = new Map<number, string>();
  private activeBranchName: string;
  private commitSeq = 0;

  constructor(options: OpfsCasBranchTimelineOptions = {}) {
    const requestedSize = Math.floor(options.gridSize ?? DEFAULT_CAS_GRID_SIZE);
    if (!isPowerOfTwo(requestedSize) || requestedSize > 1024) {
      throw new RangeError(`쿼드트리 gridSize는 1..1024 범위의 2의 거듭제곱이어야 합니다: ${requestedSize}`);
    }
    this.gridSize = requestedSize;
    this.store = options.store ?? new InMemoryCasBlobStore();
    this.now = options.now ?? (() => Date.now());
    this.activeBranchName = options.defaultBranch ?? "main";

    const emptyRootHash = this.ensureEmptySubtree(this.gridSize);
    const genesisCommitId = fnv1a64StringHex(`COMMIT|genesis|${emptyRootHash}|0`);
    const ts = this.now();
    this.commits.set(genesisCommitId, {
      commitId: genesisCommitId, parentCommitId: null, branchName: this.activeBranchName,
      rootNodeHash: emptyRootHash, message: "초기 빈 캔버스 스냅샷", timestampMs: ts,
      writtenNewBlobs: 0, reusedExistingBlobs: 0, nonEmptyTileCount: 0,
    });
    this.branches.set(this.activeBranchName, { name: this.activeBranchName, headCommitId: genesisCommitId, createdAtMs: ts });
  }

  get currentBranch(): string { return this.activeBranchName; }
  listBranches(): readonly CasBranchRef[] { return Array.from(this.branches.values()); }
  getCommit(commitId: string): CasCommitRecord | undefined { return this.commits.get(commitId); }

  getHeadCommit(branchName = this.activeBranchName): CasCommitRecord {
    const branch = this.branches.get(branchName);
    if (!branch) throw new Error(`존재하지 않는 브랜치입니다: ${branchName}`);
    const commit = this.commits.get(branch.headCommitId);
    if (!commit) throw new Error(`커밋 레코드를 찾을 수 없습니다: ${branch.headCommitId}`);
    return commit;
  }

  createBranch(name: string, fromCommitId?: string): CasBranchRef {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("브랜치 이름은 비어 있을 수 없습니다.");
    if (this.branches.has(trimmed)) throw new Error(`이미 존재하는 브랜치입니다: ${trimmed}`);
    const baseCommitId = fromCommitId ?? this.getHeadCommit().commitId;
    if (!this.commits.has(baseCommitId)) throw new Error(`기준 커밋을 찾을 수 없습니다: ${baseCommitId}`);
    const ref: CasBranchRef = { name: trimmed, headCommitId: baseCommitId, createdAtMs: this.now() };
    this.branches.set(trimmed, ref);
    return ref;
  }

  checkoutBranch(name: string): CasBranchRef {
    const branch = this.branches.get(name);
    if (!branch) throw new Error(`존재하지 않는 브랜치입니다: ${name}`);
    this.activeBranchName = branch.name;
    return branch;
  }

  /** 타일 바이트 복제 없이 지정 커밋의 쿼드트리 루트를 즉시 복원하는 커밋을 생성한다. */
  restoreToCommit(targetCommitId: string, message?: string): CasCommitRecord {
    const target = this.commits.get(targetCommitId);
    if (!target) throw new Error(`복원 대상 커밋을 찾을 수 없습니다: ${targetCommitId}`);
    const head = this.getHeadCommit();
    this.commitSeq += 1;
    const ts = this.now();
    const commitId = fnv1a64StringHex(`COMMIT|${head.commitId}|${target.rootNodeHash}|restore|${this.commitSeq}`);
    const record: CasCommitRecord = {
      commitId, parentCommitId: head.commitId, branchName: this.activeBranchName,
      rootNodeHash: target.rootNodeHash, message: message ?? `스냅샷 복원 (${targetCommitId.slice(0, 8)})`,
      timestampMs: ts, writtenNewBlobs: 0, reusedExistingBlobs: target.nonEmptyTileCount,
      nonEmptyTileCount: target.nonEmptyTileCount,
    };
    this.commits.set(commitId, record);
    this.branches.set(this.activeBranchName, {
      name: this.activeBranchName, headCommitId: commitId,
      createdAtMs: this.branches.get(this.activeBranchName)?.createdAtMs ?? ts,
    });
    return record;
  }

  async commitTiles(updates: readonly TileWriteInput[], message: string): Promise<CasCommitRecord> {
    const head = this.getHeadCommit();
    let nextRootHash = head.rootNodeHash;
    let writtenNewBlobs = 0, reusedExistingBlobs = 0;

    for (const update of updates) {
      this.assertTileCoord(update.x, update.y);
      if (update.bytes === null) {
        nextRootHash = this.setLeafAt(nextRootHash, 0, 0, this.gridSize, update.x, update.y, EMPTY_TILE_SENTINEL_HASH, 0);
      } else {
        const hash = fnv1a64Hex(update.bytes);
        if (await this.store.put(hash, update.bytes)) writtenNewBlobs += 1;
        else reusedExistingBlobs += 1;
        nextRootHash = this.setLeafAt(nextRootHash, 0, 0, this.gridSize, update.x, update.y, hash, update.bytes.byteLength);
      }
    }

    const rootNode = this.quadNodes.get(nextRootHash);
    this.commitSeq += 1;
    const ts = this.now();
    const commitId = fnv1a64StringHex(`COMMIT|${head.commitId}|${nextRootHash}|${message}|${this.commitSeq}`);
    const record: CasCommitRecord = {
      commitId, parentCommitId: head.commitId, branchName: this.activeBranchName,
      rootNodeHash: nextRootHash, message, timestampMs: ts,
      writtenNewBlobs, reusedExistingBlobs, nonEmptyTileCount: rootNode ? rootNode.nonEmptyCount : 0,
    };
    this.commits.set(commitId, record);
    this.branches.set(this.activeBranchName, {
      name: this.activeBranchName, headCommitId: commitId,
      createdAtMs: this.branches.get(this.activeBranchName)?.createdAtMs ?? ts,
    });
    return record;
  }

  getTileHash(x: number, y: number, commitId?: string): string | null {
    this.assertTileCoord(x, y);
    const commit = commitId ? this.commits.get(commitId) : this.getHeadCommit();
    if (!commit) throw new Error(`커밋을 찾을 수 없습니다: ${commitId ?? "HEAD"}`);
    const tileHash = this.lookupLeafHash(commit.rootNodeHash, 0, 0, this.gridSize, x, y);
    return tileHash === EMPTY_TILE_SENTINEL_HASH ? null : tileHash;
  }

  async readTile(x: number, y: number, commitId?: string): Promise<Uint8Array | null> {
    const hash = this.getTileHash(x, y, commitId);
    return hash ? this.store.get(hash) : null;
  }

  diffBranches(branchA: string, branchB: string): CasBranchDiff {
    return this.diffCommits(this.getHeadCommit(branchA).commitId, this.getHeadCommit(branchB).commitId);
  }

  diffCommits(fromCommitId: string, toCommitId: string): CasBranchDiff {
    const commitA = this.commits.get(fromCommitId), commitB = this.commits.get(toCommitId);
    if (!commitA || !commitB) throw new Error(`비교할 커밋을 찾을 수 없습니다: ${fromCommitId} vs ${toCommitId}`);
    const entries: CasTileDiffEntry[] = [];
    let unchangedSubtreesPruned = 0;

    const walk = (hashA: string, hashB: string, ox: number, oy: number, size: number): void => {
      if (hashA === hashB) { unchangedSubtreesPruned += 1; return; }
      const nodeA = this.quadNodes.get(hashA), nodeB = this.quadNodes.get(hashB);
      if (!nodeA || !nodeB) return;
      if (size === 1 || nodeA.kind === "leaf" || nodeB.kind === "leaf") {
        const before = nodeA.kind === "leaf" && nodeA.tileHash !== EMPTY_TILE_SENTINEL_HASH ? nodeA.tileHash : null;
        const after = nodeB.kind === "leaf" && nodeB.tileHash !== EMPTY_TILE_SENTINEL_HASH ? nodeB.tileHash : null;
        if (before !== after) {
          entries.push({ x: ox, y: oy, beforeHash: before, afterHash: after, change: before === null ? "added" : after === null ? "removed" : "modified" });
        }
        return;
      }
      const half = size >>> 1;
      walk(nodeA.children[0], nodeB.children[0], ox, oy, half);
      walk(nodeA.children[1], nodeB.children[1], ox + half, oy, half);
      walk(nodeA.children[2], nodeB.children[2], ox, oy + half, half);
      walk(nodeA.children[3], nodeB.children[3], ox + half, oy + half, half);
    };

    walk(commitA.rootNodeHash, commitB.rootNodeHash, 0, 0, this.gridSize);
    return { fromCommitId, toCommitId, entries, unchangedSubtreesPruned };
  }

  getStorageStats(): CasStorageStats {
    let logicalTileRefs = 0, logicalBytes = 0;
    for (const commit of this.commits.values()) {
      const root = this.quadNodes.get(commit.rootNodeHash);
      if (!root) continue;
      logicalTileRefs += root.nonEmptyCount;
      logicalBytes += root.kind === "leaf" ? root.byteLength : root.logicalBytes;
    }
    const storedBytes = this.store.getStoredByteLength();
    return {
      uniqueBlobs: this.store.getBlobCount(), storedBytes,
      logicalTileRefsAcrossCommits: logicalTileRefs, logicalBytesAcrossCommits: logicalBytes,
      deduplicationRatio: storedBytes === 0 ? 1 : logicalBytes / storedBytes,
      branchCount: this.branches.size, commitCount: this.commits.size, quadtreeNodeCount: this.quadNodes.size,
    };
  }

  private ensureEmptySubtree(size: number): string {
    const cached = this.emptySubtreeHashes.get(size);
    if (cached) return cached;
    if (size === 1) {
      const leaf = this.internLeaf(EMPTY_TILE_SENTINEL_HASH, 0);
      this.emptySubtreeHashes.set(1, leaf.hash);
      return leaf.hash;
    }
    const childHash = this.ensureEmptySubtree(size >>> 1);
    const node = this.internInternal([childHash, childHash, childHash, childHash]);
    this.emptySubtreeHashes.set(size, node.hash);
    return node.hash;
  }

  private internLeaf(tileHash: string, byteLength: number): QuadtreeLeafNode {
    const hash = fnv1a64StringHex(`LEAF|${tileHash}|${byteLength}`);
    const existing = this.quadNodes.get(hash);
    if (existing && existing.kind === "leaf") return existing;
    const node: QuadtreeLeafNode = { kind: "leaf", hash, tileHash, byteLength, nonEmptyCount: tileHash === EMPTY_TILE_SENTINEL_HASH ? 0 : 1 };
    this.quadNodes.set(hash, node);
    return node;
  }

  private internInternal(children: readonly [string, string, string, string]): QuadtreeInternalNode {
    const hash = fnv1a64StringHex(`QT|${children[0]}|${children[1]}|${children[2]}|${children[3]}`);
    const existing = this.quadNodes.get(hash);
    if (existing && existing.kind === "internal") return existing;
    let nonEmptyCount = 0, logicalBytes = 0;
    for (const cHash of children) {
      const child = this.quadNodes.get(cHash);
      if (!child) continue;
      nonEmptyCount += child.nonEmptyCount;
      logicalBytes += child.kind === "leaf" ? child.byteLength : child.logicalBytes;
    }
    const node: QuadtreeInternalNode = { kind: "internal", hash, children, nonEmptyCount, logicalBytes };
    this.quadNodes.set(hash, node);
    return node;
  }

  private setLeafAt(
    nodeHash: string, ox: number, oy: number, size: number,
    tx: number, ty: number, tileHash: string, byteLength: number,
  ): string {
    if (size === 1) return this.internLeaf(tileHash, byteLength).hash;
    const node = this.quadNodes.get(nodeHash);
    if (!node || node.kind !== "internal") throw new Error(`손상된 쿼드트리 내부 노드입니다: ${nodeHash}`);
    const half = size >>> 1;
    const right = tx >= ox + half ? 1 : 0, bottom = ty >= oy + half ? 1 : 0;
    const quadIdx = bottom * 2 + right;
    const updatedChild = this.setLeafAt(node.children[quadIdx], ox + right * half, oy + bottom * half, half, tx, ty, tileHash, byteLength);
    if (updatedChild === node.children[quadIdx]) return nodeHash;
    const next: [string, string, string, string] = [node.children[0], node.children[1], node.children[2], node.children[3]];
    next[quadIdx] = updatedChild;
    return this.internInternal(next).hash;
  }

  private lookupLeafHash(nodeHash: string, ox: number, oy: number, size: number, tx: number, ty: number): string {
    const node = this.quadNodes.get(nodeHash);
    if (!node) return EMPTY_TILE_SENTINEL_HASH;
    if (size === 1 || node.kind === "leaf") return node.kind === "leaf" ? node.tileHash : EMPTY_TILE_SENTINEL_HASH;
    const half = size >>> 1;
    const right = tx >= ox + half ? 1 : 0, bottom = ty >= oy + half ? 1 : 0;
    return this.lookupLeafHash(node.children[bottom * 2 + right], ox + right * half, oy + bottom * half, half, tx, ty);
  }

  private assertTileCoord(x: number, y: number): void {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.gridSize || y >= this.gridSize) {
      throw new RangeError(`타일 좌표 범위 오류: (${x}, ${y}) / gridSize=${this.gridSize}`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Kademlia-Style 64-Bit XOR DHT Peer Router & Delta Recovery              */
/* -------------------------------------------------------------------------- */

export type Uint64Pair = readonly [number, number];

export interface DhtPeerInput {
  readonly peerId: string; readonly rttMs: number;
  readonly reliability?: number; readonly lastSeenMs?: number;
  readonly bandwidthKbps?: number; readonly availableTileHashes?: readonly string[];
}

export interface DhtPeerRecord {
  readonly peerId: string; readonly idPair: Uint64Pair;
  readonly rttMs: number; readonly reliability: number;
  readonly lastSeenMs: number; readonly bandwidthKbps: number;
  readonly failureCount: number; readonly availableTileHashes: ReadonlySet<string>;
}

export interface DhtRankedPeer {
  readonly peerId: string; readonly distance: Uint64Pair; readonly distanceHex: string;
  readonly bucketIndex: number; readonly rttMs: number;
  readonly reliability: number; readonly healthScore: number; readonly hasTargetTile: boolean;
}

export interface DhtInsertResult {
  readonly inserted: boolean; readonly updated: boolean;
  readonly evictedPeerId: string | null; readonly bucketIndex: number;
}

export interface TileRecoveryAssignment {
  readonly tileHash: string;
  readonly strategy: "direct-peer-fetch" | "dht-closest-lookup" | "unrecoverable";
  readonly selectedPeerIds: readonly string[];
  readonly estimatedRttMs: number;
}

export interface P2pDeltaRecoveryPlan {
  readonly requestedCount: number; readonly directlyRecoverableCount: number;
  readonly dhtLookupFallbackCount: number; readonly unrecoverableCount: number;
  readonly assignments: readonly TileRecoveryAssignment[];
  readonly peerLoadCounts: Readonly<Record<string, number>>;
  readonly estimatedTotalMs: number; readonly centralRelayBytes: 0;
}

export interface DhtRoutingTableStats {
  readonly localPeerId: string; readonly totalPeers: number; readonly nonEmptyBuckets: number;
  readonly kBucketSize: number; readonly averageRttMs: number; readonly averageReliability: number;
}

export interface KademliaP2pPeerRouterOptions {
  readonly localPeerId: string; readonly kBucketSize?: number; readonly now?: () => number;
}

export function normalizeHex64(id: string): string {
  const cleaned = id.trim().toLowerCase().replace(/^0x/, "");
  return /^[0-9a-f]{16}$/.test(cleaned) ? cleaned : fnv1a64StringHex(id);
}

export function parseHex64(hex: string): Uint64Pair {
  const norm = normalizeHex64(hex);
  return [Number.parseInt(norm.slice(0, 8), 16) >>> 0, Number.parseInt(norm.slice(8, 16), 16) >>> 0];
}

export function formatHex64(pair: Uint64Pair): string {
  return `${(pair[0] >>> 0).toString(16).padStart(8, "0")}${(pair[1] >>> 0).toString(16).padStart(8, "0")}`;
}

export function xorDistance64(a: string, b: string): Uint64Pair {
  const [aHi, aLo] = parseHex64(a);
  const [bHi, bLo] = parseHex64(b);
  return [(aHi ^ bHi) >>> 0, (aLo ^ bLo) >>> 0];
}

export function compareDistance64(a: Uint64Pair, b: Uint64Pair): number {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
  return 0;
}

/** 64비트 XOR 거리의 최상위 설정 비트 위치(`0..63`, 동일 노드면 `-1`)를 반환한다. */
export function bucketIndex64(localId: string, remoteId: string): number {
  const [dHi, dLo] = xorDistance64(localId, remoteId);
  if (dHi === 0 && dLo === 0) return -1;
  return dHi !== 0 ? 63 - Math.clz32(dHi) : 31 - Math.clz32(dLo);
}

function clampUnit(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

export function computePeerHealthScore(peer: DhtPeerRecord, nowMs: number): number {
  const rttScore = 1 / (1 + Math.max(1, peer.rttMs) / 80);
  const freshness = Math.exp(-Math.max(0, (nowMs - peer.lastSeenMs) / 1000) / 300);
  const failurePenalty = Math.pow(0.75, peer.failureCount);
  const bwBoost = Math.min(1, peer.bandwidthKbps / 25000);
  return clampUnit((0.45 * peer.reliability + 0.35 * rttScore + 0.12 * freshness + 0.08 * bwBoost) * failurePenalty);
}

interface MutablePeerRecord {
  readonly peerId: string; readonly idPair: Uint64Pair;
  rttMs: number; reliability: number; lastSeenMs: number; bandwidthKbps: number;
  failureCount: number; readonly availableTileHashes: Set<string>;
}

/** 64비트 XOR 거리 k-버킷 기반 Kademlia 스타일 P2P 라우터 및 델타 복구 플래너. */
export class KademliaP2pPeerRouter {
  readonly localPeerId: string;
  readonly kBucketSize: number;
  private readonly now: () => number;
  private readonly buckets: MutablePeerRecord[][];
  private readonly peerIndex = new Map<string, { bucketIndex: number; record: MutablePeerRecord }>();

  constructor(options: KademliaP2pPeerRouterOptions) {
    this.localPeerId = normalizeHex64(options.localPeerId);
    this.kBucketSize = Math.max(2, Math.min(32, Math.floor(options.kBucketSize ?? DEFAULT_KADEMLIA_K)));
    this.now = options.now ?? (() => Date.now());
    this.buckets = Array.from({ length: 64 }, () => []);
  }

  upsertPeer(input: DhtPeerInput): DhtInsertResult {
    const peerId = normalizeHex64(input.peerId);
    const bIdx = bucketIndex64(this.localPeerId, peerId);
    if (bIdx < 0) return { inserted: false, updated: false, evictedPeerId: null, bucketIndex: -1 };
    const nowMs = input.lastSeenMs ?? this.now();
    const existing = this.peerIndex.get(peerId);
    if (existing) {
      existing.record.rttMs = Math.max(1, input.rttMs);
      if (input.reliability !== undefined) existing.record.reliability = clampUnit(input.reliability);
      existing.record.lastSeenMs = nowMs;
      if (input.bandwidthKbps !== undefined) existing.record.bandwidthKbps = Math.max(64, input.bandwidthKbps);
      if (input.availableTileHashes) {
        for (const h of input.availableTileHashes) existing.record.availableTileHashes.add(normalizeHex64(h));
      }
      return { inserted: false, updated: true, evictedPeerId: null, bucketIndex: bIdx };
    }

    const record: MutablePeerRecord = {
      peerId, idPair: parseHex64(peerId), rttMs: Math.max(1, input.rttMs),
      reliability: clampUnit(input.reliability ?? 0.95), lastSeenMs: nowMs,
      bandwidthKbps: Math.max(64, input.bandwidthKbps ?? 10000), failureCount: 0,
      availableTileHashes: new Set((input.availableTileHashes ?? []).map((h) => normalizeHex64(h))),
    };
    const bucket = this.buckets[bIdx];
    if (bucket.length < this.kBucketSize) {
      bucket.push(record);
      this.peerIndex.set(peerId, { bucketIndex: bIdx, record });
      return { inserted: true, updated: false, evictedPeerId: null, bucketIndex: bIdx };
    }

    let weakestIdx = 0;
    let weakestScore = computePeerHealthScore(bucket[0], nowMs);
    for (let i = 1; i < bucket.length; i += 1) {
      const score = computePeerHealthScore(bucket[i], nowMs);
      if (score < weakestScore) { weakestScore = score; weakestIdx = i; }
    }
    if (computePeerHealthScore(record, nowMs) > weakestScore + 0.05) {
      const evicted = bucket[weakestIdx];
      this.peerIndex.delete(evicted.peerId);
      bucket[weakestIdx] = record;
      this.peerIndex.set(peerId, { bucketIndex: bIdx, record });
      return { inserted: true, updated: false, evictedPeerId: evicted.peerId, bucketIndex: bIdx };
    }
    return { inserted: false, updated: false, evictedPeerId: null, bucketIndex: bIdx };
  }

  announcePeerTiles(peerId: string, tileHashes: readonly string[]): boolean {
    const found = this.peerIndex.get(normalizeHex64(peerId));
    if (!found) return false;
    for (const h of tileHashes) found.record.availableTileHashes.add(normalizeHex64(h));
    found.record.lastSeenMs = this.now();
    return true;
  }

  recordPeerRtt(peerId: string, rttMs: number): void {
    const found = this.peerIndex.get(normalizeHex64(peerId));
    if (!found) return;
    found.record.rttMs = Math.max(1, found.record.rttMs * 0.7 + rttMs * 0.3);
    found.record.reliability = clampUnit(found.record.reliability + 0.02);
    found.record.lastSeenMs = this.now();
  }

  markPeerFailure(peerId: string): void {
    const found = this.peerIndex.get(normalizeHex64(peerId));
    if (!found) return;
    found.record.failureCount += 1;
    found.record.reliability = clampUnit(found.record.reliability * 0.65);
  }

  removePeer(peerId: string): boolean {
    const norm = normalizeHex64(peerId);
    const found = this.peerIndex.get(norm);
    if (!found) return false;
    const bucket = this.buckets[found.bucketIndex];
    const idx = bucket.findIndex((p) => p.peerId === norm);
    if (idx >= 0) bucket.splice(idx, 1);
    this.peerIndex.delete(norm);
    return true;
  }

  findClosestPeers(targetId: string, count = this.kBucketSize): readonly DhtRankedPeer[] {
    const normTarget = normalizeHex64(targetId);
    const nowMs = this.now();
    const candidates: DhtRankedPeer[] = [];
    for (const entry of this.peerIndex.values()) {
      const dist = xorDistance64(entry.record.peerId, normTarget);
      candidates.push({
        peerId: entry.record.peerId, distance: dist, distanceHex: formatHex64(dist),
        bucketIndex: entry.bucketIndex, rttMs: entry.record.rttMs,
        reliability: entry.record.reliability,
        healthScore: computePeerHealthScore(entry.record, nowMs),
        hasTargetTile: entry.record.availableTileHashes.has(normTarget),
      });
    }
    candidates.sort((a, b) => compareDistance64(a.distance, b.distance) || b.healthScore - a.healthScore);
    return candidates.slice(0, Math.max(0, count));
  }

  planDeltaRecovery(
    missingTileHashes: readonly string[],
    options: { readonly maxPeersPerTile?: number; readonly maxConcurrentPerPeer?: number } = {},
  ): P2pDeltaRecoveryPlan {
    const maxPeersPerTile = Math.max(1, Math.min(4, Math.floor(options.maxPeersPerTile ?? 2)));
    const maxConcurrentPerPeer = Math.max(1, Math.floor(options.maxConcurrentPerPeer ?? 6));
    const peerLoad = new Map<string, number>();
    const assignments: TileRecoveryAssignment[] = [];
    let directlyRecoverableCount = 0, dhtLookupFallbackCount = 0, unrecoverableCount = 0;

    const pickUnderCap = (pool: readonly DhtRankedPeer[]): DhtRankedPeer[] => {
      const picked: DhtRankedPeer[] = [];
      for (const cand of pool) {
        if (picked.length >= maxPeersPerTile) break;
        if ((peerLoad.get(cand.peerId) ?? 0) >= maxConcurrentPerPeer) continue;
        picked.push(cand);
      }
      if (picked.length === 0 && pool.length > 0) picked.push(pool[0]);
      return picked;
    };

    const nowMs = this.now();
    for (const rawHash of missingTileHashes) {
      const tileHash = normalizeHex64(rawHash);
      const holders: DhtRankedPeer[] = [];
      for (const entry of this.peerIndex.values()) {
        if (!entry.record.availableTileHashes.has(tileHash)) continue;
        const healthScore = computePeerHealthScore(entry.record, nowMs);
        if (healthScore <= 0.15) continue;
        const dist = xorDistance64(entry.record.peerId, tileHash);
        holders.push({
          peerId: entry.record.peerId, distance: dist, distanceHex: formatHex64(dist),
          bucketIndex: entry.bucketIndex, rttMs: entry.record.rttMs,
          reliability: entry.record.reliability, healthScore, hasTargetTile: true,
        });
      }
      holders.sort((a, b) => {
        const sa = a.healthScore - (peerLoad.get(a.peerId) ?? 0) * 0.08 - a.rttMs / 2000;
        const sb = b.healthScore - (peerLoad.get(b.peerId) ?? 0) * 0.08 - b.rttMs / 2000;
        return sb - sa || compareDistance64(a.distance, b.distance);
      });

      if (holders.length > 0) {
        const chosen = pickUnderCap(holders);
        for (const p of chosen) peerLoad.set(p.peerId, (peerLoad.get(p.peerId) ?? 0) + 1);
        directlyRecoverableCount += 1;
        assignments.push({ tileHash, strategy: "direct-peer-fetch", selectedPeerIds: chosen.map((p) => p.peerId), estimatedRttMs: chosen[0]?.rttMs ?? 0 });
      } else {
        const closest = this.findClosestPeers(tileHash, Math.max(this.kBucketSize * 2, 16));
        if (closest.length > 0) {
          const healthyClosest = closest.filter((p) => p.healthScore > 0.1);
          const chosen = pickUnderCap(healthyClosest.length > 0 ? healthyClosest : closest);
          for (const p of chosen) peerLoad.set(p.peerId, (peerLoad.get(p.peerId) ?? 0) + 1);
          dhtLookupFallbackCount += 1;
          assignments.push({ tileHash, strategy: "dht-closest-lookup", selectedPeerIds: chosen.map((p) => p.peerId), estimatedRttMs: (chosen[0]?.rttMs ?? 40) * 1.5 });
        } else {
          unrecoverableCount += 1;
          assignments.push({ tileHash, strategy: "unrecoverable", selectedPeerIds: [], estimatedRttMs: 0 });
        }
      }
    }

    const peerLoadCounts: Record<string, number> = {};
    let maxPeerTimeMs = 0;
    for (const [peerId, count] of peerLoad.entries()) {
      peerLoadCounts[peerId] = count;
      const peerTime = count * (this.peerIndex.get(peerId)?.record.rttMs ?? 30);
      if (peerTime > maxPeerTimeMs) maxPeerTimeMs = peerTime;
    }

    return {
      requestedCount: missingTileHashes.length, directlyRecoverableCount,
      dhtLookupFallbackCount, unrecoverableCount, assignments, peerLoadCounts,
      estimatedTotalMs: maxPeerTimeMs, centralRelayBytes: 0,
    };
  }

  getRoutingTableStats(): DhtRoutingTableStats {
    let nonEmptyBuckets = 0, totalRtt = 0, totalRel = 0;
    for (const bucket of this.buckets) {
      if (bucket.length > 0) nonEmptyBuckets += 1;
      for (const peer of bucket) { totalRtt += peer.rttMs; totalRel += peer.reliability; }
    }
    const totalPeers = this.peerIndex.size;
    return {
      localPeerId: this.localPeerId, totalPeers, nonEmptyBuckets, kBucketSize: this.kBucketSize,
      averageRttMs: totalPeers === 0 ? 0 : totalRtt / totalPeers,
      averageReliability: totalPeers === 0 ? 0 : totalRel / totalPeers,
    };
  }
}
