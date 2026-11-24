/**
 * OPFS(`navigator.storage.getDirectory`) 어댑터 + 메모리 VFS 폴백 기반
 * 콘텐츠 주소 지정(FNV-1a / SHA-256 청크 중복제거) Git형 프로젝트 스냅샷 버전 관리 엔진.
 *
 * - 레이어 바이너리를 고정 크기 청크로 분할해 내용 해시(`objects/chunks/<hash>`)로 저장하므로
 *   수정되지 않은 레이어·청크는 커밋·브랜치 간 100% 재사용된다.
 * - 브랜치 분기·체크아웃·레이어 델타 Diff·원클릭 무손실 롤백·무결성 검증을 제공한다.
 */

import {
  InMemoryVfsAdapter,
  computeContentAddressHash,
  type OpfsVfsAdapter,
  type VcsHashAlgorithm,
  type VfsBackendKind,
} from "./opfs-vfs-adapter";

export {
  BrowserOpfsVfsAdapter,
  InMemoryVfsAdapter,
  computeContentAddressHash,
  createOpfsVfsAdapter,
  hashBytesFnv1a64Hex,
  hashBytesSha256PureHex,
  normalizeVfsRelPath,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
  type OpfsVfsAdapter,
  type OpfsWritableLike,
  type VcsHashAlgorithm,
  type VfsBackendKind,
} from "./opfs-vfs-adapter";

export type VcsLayerKind = "raster" | "vector" | "balloon" | "camera" | "fx";
export type LayerDeltaStatus = "added" | "removed" | "modified" | "unchanged";

export interface VcsLayerEntry {
  readonly layerId: string;
  readonly name: string;
  readonly kind: VcsLayerKind;
  readonly opacity: number;
  readonly visible: boolean;
  readonly blendMode: string;
  readonly payload: Uint8Array;
  readonly meta?: Readonly<Record<string, string | number | boolean>>;
}

export interface VcsProjectSnapshot {
  readonly projectId: string;
  readonly title: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly layers: readonly VcsLayerEntry[];
}

export interface VcsLayerManifestEntry {
  readonly layerId: string;
  readonly name: string;
  readonly kind: VcsLayerKind;
  readonly opacity: number;
  readonly visible: boolean;
  readonly blendMode: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly chunkIds: readonly string[];
  readonly meta?: Readonly<Record<string, string | number | boolean>>;
}

export interface VcsCommitStats {
  readonly totalChunks: number;
  readonly newChunksWritten: number;
  readonly reusedChunks: number;
  readonly logicalBytes: number;
  readonly newPhysicalBytes: number;
}

export interface VcsCommitObject {
  readonly id: string;
  readonly parentId: string | null;
  readonly branchName: string;
  readonly message: string;
  readonly author: string;
  readonly timestampIso: string;
  readonly treeHash: string;
  readonly projectId: string;
  readonly title: string;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly layerManifest: readonly VcsLayerManifestEntry[];
  readonly stats: VcsCommitStats;
}

export interface VcsBranchSummary {
  readonly name: string;
  readonly headCommitId: string | null;
  readonly isCurrent: boolean;
  readonly commitCount: number;
}

export interface LayerDeltaEntry {
  readonly layerId: string;
  readonly name: string;
  readonly status: LayerDeltaStatus;
  readonly prevHash: string | null;
  readonly nextHash: string | null;
  readonly prevBytes: number;
  readonly nextBytes: number;
  readonly byteDelta: number;
  readonly metadataChangedFields: readonly string[];
  readonly reusedChunkCount: number;
  readonly changedChunkCount: number;
}

export interface SnapshotDeltaDiff {
  readonly fromCommitId: string | null;
  readonly toCommitId: string;
  readonly addedCount: number;
  readonly removedCount: number;
  readonly modifiedCount: number;
  readonly unchangedCount: number;
  readonly totalByteDelta: number;
  readonly entries: readonly LayerDeltaEntry[];
}

export interface VcsStorageStats {
  readonly backendKind: VfsBackendKind;
  readonly hashAlgorithm: VcsHashAlgorithm;
  readonly activeBranch: string;
  readonly branchCount: number;
  readonly commitCount: number;
  readonly uniqueChunkCount: number;
  readonly logicalBytes: number;
  readonly physicalStoredBytes: number;
  readonly deduplicationRatio: number;
  readonly deduplicationPercent: number;
}

export interface VcsRollbackResult {
  readonly targetCommitId: string;
  readonly restoredSnapshot: VcsProjectSnapshot;
  readonly rollbackCommit: VcsCommitObject | null;
  readonly verifiedIntegrity: boolean;
}

export interface VcsIntegrityReport {
  readonly valid: boolean;
  readonly checkedChunks: number;
  readonly corruptedChunks: readonly string[];
}

export interface OpfsVcsEngineOptions {
  readonly adapter?: OpfsVfsAdapter;
  readonly chunkSizeBytes?: number;
  readonly hashAlgorithm?: VcsHashAlgorithm;
}

const DEFAULT_CHUNK_SIZE_BYTES = 16_384;
const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function encodeJsonBytes(value: unknown): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify(value));
}

function decodeJsonBytes<T>(bytes: Uint8Array): T {
  return JSON.parse(TEXT_DECODER.decode(bytes)) as T;
}

function validateBranchName(name: string): string {
  const trimmed = name.trim();
  if (!/^[a-zA-Z0-9가-힣._-]{1,48}$/u.test(trimmed)) {
    throw new Error(`유효하지 않은 브랜치 이름입니다: "${name}"`);
  }
  return trimmed;
}

/** 콘텐츠 주소 지정 청크 중복제거 기반 Git형 프로젝트 스냅샷 VCS 엔진. */
export class OpfsSnapshotVcsEngine {
  private readonly vfs: OpfsVfsAdapter;
  private readonly chunkSizeBytes: number;
  private readonly hashAlgorithm: VcsHashAlgorithm;
  private activeBranch = "main";
  private readonly branchHeads = new Map<string, string | null>();
  private readonly commitCatalog = new Map<string, VcsCommitObject>();
  private readonly chunkByteLengths = new Map<string, number>();
  private initialized = false;

  constructor(options: OpfsVcsEngineOptions = {}) {
    this.vfs = options.adapter ?? new InMemoryVfsAdapter();
    this.chunkSizeBytes = Math.max(256, Math.floor(options.chunkSizeBytes ?? DEFAULT_CHUNK_SIZE_BYTES));
    this.hashAlgorithm = options.hashAlgorithm ?? "sha-256";
  }

  get backendKind(): VfsBackendKind {
    return this.vfs.backendKind;
  }

  get currentBranch(): string {
    return this.activeBranch;
  }

  get currentHeadCommitId(): string | null {
    return this.branchHeads.get(this.activeBranch) ?? null;
  }

  async init(initialBranch = "main"): Promise<void> {
    const branch = validateBranchName(initialBranch);
    const headBytes = await this.vfs.readFile("HEAD");
    if (headBytes) {
      const parsed = TEXT_DECODER.decode(headBytes).trim();
      if (parsed.length > 0) this.activeBranch = parsed;
    } else {
      this.activeBranch = branch;
      await this.vfs.writeFile("HEAD", TEXT_ENCODER.encode(branch));
    }

    const refFiles = await this.vfs.listFiles("refs/heads");
    for (const refName of refFiles) {
      const bytes = await this.vfs.readFile(`refs/heads/${refName}`);
      const commitId = bytes ? TEXT_DECODER.decode(bytes).trim() : "";
      this.branchHeads.set(refName, commitId.length > 0 ? commitId : null);
    }
    if (!this.branchHeads.has(this.activeBranch)) {
      this.branchHeads.set(this.activeBranch, null);
      await this.vfs.writeFile(`refs/heads/${this.activeBranch}`, new Uint8Array(0));
    }

    const commitFiles = await this.vfs.listFiles("objects/commits");
    for (const fileName of commitFiles) {
      const bytes = await this.vfs.readFile(`objects/commits/${fileName}`);
      if (!bytes) continue;
      const commit = decodeJsonBytes<VcsCommitObject>(bytes);
      this.commitCatalog.set(commit.id, commit);
    }

    const chunkFiles = await this.vfs.listFiles("objects/chunks");
    for (const chunkId of chunkFiles) {
      const bytes = await this.vfs.readFile(`objects/chunks/${chunkId}`);
      if (bytes) this.chunkByteLengths.set(chunkId, bytes.byteLength);
    }
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.init(this.activeBranch);
  }

  /** 스냅샷을 청크 분할·중복제거 저장 후 현재 브랜치에 커밋한다. */
  async commit(
    snapshot: VcsProjectSnapshot,
    options: { readonly message: string; readonly author?: string; readonly timestampIso?: string },
  ): Promise<VcsCommitObject> {
    await this.ensureInitialized();
    const parentId = this.branchHeads.get(this.activeBranch) ?? null;
    const layerManifest: VcsLayerManifestEntry[] = [];

    let totalChunks = 0;
    let newChunksWritten = 0;
    let reusedChunks = 0;
    let logicalBytes = 0;
    let newPhysicalBytes = 0;

    for (const layer of snapshot.layers) {
      const payload = layer.payload;
      logicalBytes += payload.byteLength;
      const contentHash = await computeContentAddressHash(payload, this.hashAlgorithm);
      const chunkIds: string[] = [];

      const slices: Uint8Array[] = [];
      if (payload.byteLength === 0) {
        slices.push(new Uint8Array(0));
      } else {
        for (let offset = 0; offset < payload.byteLength; offset += this.chunkSizeBytes) {
          slices.push(payload.subarray(offset, Math.min(payload.byteLength, offset + this.chunkSizeBytes)));
        }
      }

      for (const slice of slices) {
        const chunkId = await computeContentAddressHash(slice, this.hashAlgorithm);
        chunkIds.push(chunkId);
        totalChunks += 1;
        if (this.chunkByteLengths.has(chunkId) || (await this.vfs.exists(`objects/chunks/${chunkId}`))) {
          reusedChunks += 1;
          if (!this.chunkByteLengths.has(chunkId)) this.chunkByteLengths.set(chunkId, slice.byteLength);
        } else {
          await this.vfs.writeFile(`objects/chunks/${chunkId}`, slice);
          this.chunkByteLengths.set(chunkId, slice.byteLength);
          newChunksWritten += 1;
          newPhysicalBytes += slice.byteLength;
        }
      }

      layerManifest.push({
        layerId: layer.layerId,
        name: layer.name,
        kind: layer.kind,
        opacity: layer.opacity,
        visible: layer.visible,
        blendMode: layer.blendMode,
        byteLength: payload.byteLength,
        contentHash,
        chunkIds,
        ...(layer.meta ? { meta: { ...layer.meta } } : {}),
      });
    }

    const timestampIso = options.timestampIso ?? new Date().toISOString();
    const author = options.author ?? "studio-creator";
    const treeHash = await computeContentAddressHash(encodeJsonBytes(layerManifest), this.hashAlgorithm);
    const fullCommitHash = await computeContentAddressHash(
      encodeJsonBytes({
        parentId,
        branchName: this.activeBranch,
        message: options.message,
        author,
        timestampIso,
        treeHash,
        seq: this.commitCatalog.size,
      }),
      this.hashAlgorithm,
    );
    const shortId = fullCommitHash.replace(/^(sha256|fnv1a64)-/, "").slice(0, 12);

    const commitObj: VcsCommitObject = {
      id: shortId,
      parentId,
      branchName: this.activeBranch,
      message: options.message,
      author,
      timestampIso,
      treeHash,
      projectId: snapshot.projectId,
      title: snapshot.title,
      canvasWidth: snapshot.canvasWidth,
      canvasHeight: snapshot.canvasHeight,
      layerManifest,
      stats: { totalChunks, newChunksWritten, reusedChunks, logicalBytes, newPhysicalBytes },
    };

    await this.vfs.writeFile(`objects/commits/${commitObj.id}.json`, encodeJsonBytes(commitObj));
    await this.vfs.writeFile(`refs/heads/${this.activeBranch}`, TEXT_ENCODER.encode(commitObj.id));
    this.commitCatalog.set(commitObj.id, commitObj);
    this.branchHeads.set(this.activeBranch, commitObj.id);
    return commitObj;
  }

  async createBranch(branchName: string, fromCommitId?: string | null): Promise<VcsBranchSummary> {
    await this.ensureInitialized();
    const safeName = validateBranchName(branchName);
    if (this.branchHeads.has(safeName)) {
      throw new Error(`이미 존재하는 브랜치입니다: "${safeName}"`);
    }
    const baseCommitId = fromCommitId === undefined ? this.currentHeadCommitId : fromCommitId;
    if (baseCommitId !== null && !this.commitCatalog.has(baseCommitId)) {
      throw new Error(`기준 커밋을 찾을 수 없습니다: "${baseCommitId}"`);
    }
    this.branchHeads.set(safeName, baseCommitId);
    await this.vfs.writeFile(`refs/heads/${safeName}`, TEXT_ENCODER.encode(baseCommitId ?? ""));
    return {
      name: safeName,
      headCommitId: baseCommitId,
      isCurrent: safeName === this.activeBranch,
      commitCount: this.getCommitHistory(safeName).length,
    };
  }

  async checkoutBranch(branchName: string): Promise<VcsProjectSnapshot | null> {
    await this.ensureInitialized();
    const safeName = validateBranchName(branchName);
    if (!this.branchHeads.has(safeName)) {
      throw new Error(`존재하지 않는 브랜치입니다: "${safeName}"`);
    }
    this.activeBranch = safeName;
    await this.vfs.writeFile("HEAD", TEXT_ENCODER.encode(safeName));
    const headId = this.branchHeads.get(safeName) ?? null;
    return headId ? this.restoreCommit(headId) : null;
  }

  /** 지정 커밋의 모든 레이어 바이너리를 청크 저장소에서 무손실 재조립한다. */
  async restoreCommit(commitId: string): Promise<VcsProjectSnapshot> {
    await this.ensureInitialized();
    const commit = this.commitCatalog.get(commitId);
    if (!commit) throw new Error(`커밋을 찾을 수 없습니다: "${commitId}"`);

    const layers: VcsLayerEntry[] = [];
    for (const entry of commit.layerManifest) {
      const assembled = new Uint8Array(entry.byteLength);
      let cursor = 0;
      for (const chunkId of entry.chunkIds) {
        const chunkBytes = await this.vfs.readFile(`objects/chunks/${chunkId}`);
        if (!chunkBytes) throw new Error(`청크가 누락되었습니다: ${chunkId}`);
        assembled.set(chunkBytes, cursor);
        cursor += chunkBytes.byteLength;
      }
      layers.push({
        layerId: entry.layerId,
        name: entry.name,
        kind: entry.kind,
        opacity: entry.opacity,
        visible: entry.visible,
        blendMode: entry.blendMode,
        payload: assembled,
        ...(entry.meta ? { meta: { ...entry.meta } } : {}),
      });
    }

    return {
      projectId: commit.projectId,
      title: commit.title,
      canvasWidth: commit.canvasWidth,
      canvasHeight: commit.canvasHeight,
      layers,
    };
  }

  /** 원클릭 무손실 롤백: 무결성 검증 후 대상 커밋 상태를 복원하고 이력 보존 롤백 커밋을 남긴다. */
  async rollbackToCommit(
    targetCommitId: string,
    options?: { readonly createRollbackCommit?: boolean; readonly message?: string },
  ): Promise<VcsRollbackResult> {
    await this.ensureInitialized();
    const integrity = await this.verifyIntegrity(targetCommitId);
    if (!integrity.valid) {
      throw new Error(`청크 무결성 검증 실패(${integrity.corruptedChunks.join(", ")})`);
    }
    const restoredSnapshot = await this.restoreCommit(targetCommitId);
    const shouldCreateCommit = options?.createRollbackCommit ?? true;

    if (!shouldCreateCommit) {
      this.branchHeads.set(this.activeBranch, targetCommitId);
      await this.vfs.writeFile(`refs/heads/${this.activeBranch}`, TEXT_ENCODER.encode(targetCommitId));
      return { targetCommitId, restoredSnapshot, rollbackCommit: null, verifiedIntegrity: true };
    }

    const targetMeta = this.commitCatalog.get(targetCommitId);
    const rollbackCommit = await this.commit(restoredSnapshot, {
      message: options?.message ?? `원클릭 롤백 -> ${targetCommitId} (${targetMeta?.message ?? "이전 스냅샷"})`,
    });
    return { targetCommitId, restoredSnapshot, rollbackCommit, verifiedIntegrity: true };
  }

  /** 두 커밋 간 레이어별 추가·수정·삭제·청크 재사용 델타를 계산한다. */
  diffCommits(fromCommitId: string | null, toCommitId: string): SnapshotDeltaDiff {
    const toCommit = this.commitCatalog.get(toCommitId);
    if (!toCommit) throw new Error(`대상 커밋을 찾을 수 없습니다: "${toCommitId}"`);
    const fromCommit = fromCommitId ? (this.commitCatalog.get(fromCommitId) ?? null) : null;

    const prevById = new Map<string, VcsLayerManifestEntry>();
    for (const layer of fromCommit?.layerManifest ?? []) prevById.set(layer.layerId, layer);
    const nextById = new Map<string, VcsLayerManifestEntry>();
    for (const layer of toCommit.layerManifest) nextById.set(layer.layerId, layer);

    const orderedIds = Array.from(new Set([...prevById.keys(), ...nextById.keys()]));
    const entries: LayerDeltaEntry[] = [];
    let addedCount = 0;
    let removedCount = 0;
    let modifiedCount = 0;
    let unchangedCount = 0;
    let totalByteDelta = 0;

    for (const layerId of orderedIds) {
      const prev = prevById.get(layerId);
      const next = nextById.get(layerId);

      if (!prev && next) {
        addedCount += 1;
        totalByteDelta += next.byteLength;
        entries.push({
          layerId,
          name: next.name,
          status: "added",
          prevHash: null,
          nextHash: next.contentHash,
          prevBytes: 0,
          nextBytes: next.byteLength,
          byteDelta: next.byteLength,
          metadataChangedFields: [],
          reusedChunkCount: 0,
          changedChunkCount: next.chunkIds.length,
        });
        continue;
      }
      if (prev && !next) {
        removedCount += 1;
        totalByteDelta -= prev.byteLength;
        entries.push({
          layerId,
          name: prev.name,
          status: "removed",
          prevHash: prev.contentHash,
          nextHash: null,
          prevBytes: prev.byteLength,
          nextBytes: 0,
          byteDelta: -prev.byteLength,
          metadataChangedFields: [],
          reusedChunkCount: 0,
          changedChunkCount: prev.chunkIds.length,
        });
        continue;
      }
      if (prev && next) {
        const metaChanges: string[] = [];
        if (prev.name !== next.name) metaChanges.push("name");
        if (prev.opacity !== next.opacity) metaChanges.push("opacity");
        if (prev.visible !== next.visible) metaChanges.push("visible");
        if (prev.blendMode !== next.blendMode) metaChanges.push("blendMode");
        if (prev.kind !== next.kind) metaChanges.push("kind");

        const prevChunkSet = new Set(prev.chunkIds);
        let reusedChunkCount = 0;
        let changedChunkCount = 0;
        for (const cid of next.chunkIds) {
          if (prevChunkSet.has(cid)) reusedChunkCount += 1;
          else changedChunkCount += 1;
        }
        const status: LayerDeltaStatus =
          prev.contentHash !== next.contentHash || metaChanges.length > 0 ? "modified" : "unchanged";
        if (status === "modified") modifiedCount += 1;
        else unchangedCount += 1;

        const byteDelta = next.byteLength - prev.byteLength;
        totalByteDelta += byteDelta;
        entries.push({
          layerId,
          name: next.name,
          status,
          prevHash: prev.contentHash,
          nextHash: next.contentHash,
          prevBytes: prev.byteLength,
          nextBytes: next.byteLength,
          byteDelta,
          metadataChangedFields: metaChanges,
          reusedChunkCount,
          changedChunkCount,
        });
      }
    }

    return {
      fromCommitId,
      toCommitId,
      addedCount,
      removedCount,
      modifiedCount,
      unchangedCount,
      totalByteDelta,
      entries,
    };
  }

  /** 지정 커밋(또는 전체 저장소)의 청크 콘텐츠 해시 무결성을 전수 검사한다. */
  async verifyIntegrity(commitId?: string): Promise<VcsIntegrityReport> {
    await this.ensureInitialized();
    const targets = commitId
      ? [this.commitCatalog.get(commitId)].filter((c): c is VcsCommitObject => c !== undefined)
      : Array.from(this.commitCatalog.values());

    const chunkIds = new Set<string>();
    for (const commit of targets) {
      for (const layer of commit.layerManifest) {
        for (const cid of layer.chunkIds) chunkIds.add(cid);
      }
    }

    const corrupted: string[] = [];
    for (const cid of chunkIds) {
      const bytes = await this.vfs.readFile(`objects/chunks/${cid}`);
      if (!bytes) {
        corrupted.push(cid);
        continue;
      }
      const algo: VcsHashAlgorithm = cid.startsWith("fnv1a64-") ? "fnv1a-64" : "sha-256";
      const recomputed = await computeContentAddressHash(bytes, algo);
      if (recomputed !== cid) corrupted.push(cid);
    }

    return { valid: corrupted.length === 0, checkedChunks: chunkIds.size, corruptedChunks: corrupted };
  }

  getCommit(commitId: string): VcsCommitObject | null {
    return this.commitCatalog.get(commitId) ?? null;
  }

  getCommitHistory(branchName?: string): readonly VcsCommitObject[] {
    const targetBranch = branchName ?? this.activeBranch;
    const result: VcsCommitObject[] = [];
    const visited = new Set<string>();
    let cursor = this.branchHeads.get(targetBranch) ?? null;
    while (cursor && !visited.has(cursor)) {
      visited.add(cursor);
      const obj = this.commitCatalog.get(cursor);
      if (!obj) break;
      result.push(obj);
      cursor = obj.parentId;
    }
    return result;
  }

  getBranchList(): readonly VcsBranchSummary[] {
    return Array.from(this.branchHeads.entries())
      .map(([name, headCommitId]) => ({
        name,
        headCommitId,
        isCurrent: name === this.activeBranch,
        commitCount: this.getCommitHistory(name).length,
      }))
      .sort((a, b) => (a.name === "main" ? -1 : b.name === "main" ? 1 : a.name.localeCompare(b.name)));
  }

  getStorageStats(): VcsStorageStats {
    let logicalBytes = 0;
    for (const commit of this.commitCatalog.values()) logicalBytes += commit.stats.logicalBytes;
    let physicalStoredBytes = 0;
    for (const len of this.chunkByteLengths.values()) physicalStoredBytes += len;
    const ratio = logicalBytes > 0 ? Math.max(0, Math.min(1, 1 - physicalStoredBytes / logicalBytes)) : 0;
    return {
      backendKind: this.vfs.backendKind,
      hashAlgorithm: this.hashAlgorithm,
      activeBranch: this.activeBranch,
      branchCount: this.branchHeads.size,
      commitCount: this.commitCatalog.size,
      uniqueChunkCount: this.chunkByteLengths.size,
      logicalBytes,
      physicalStoredBytes,
      deduplicationRatio: Math.round(ratio * 10_000) / 10_000,
      deduplicationPercent: Math.round(ratio * 10_000) / 100,
    };
  }
}

/** UI·테스트용 결정적 바이너리 레이어 페이로드 생성 헬퍼. */
export function makeDeterministicLayerPayload(byteLength: number, seed: number): Uint8Array {
  const out = new Uint8Array(Math.max(0, byteLength));
  let state = (seed >>> 0) || 1;
  for (let i = 0; i < out.length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (state >>> 24) & 0xff;
  }
  return out;
}

/** 인터랙티브 패널·데모용 3레이어 초기 웹툰 프로젝트 저장소를 시드한다. */
export async function createSeededWebtoonVcs(
  adapter?: OpfsVfsAdapter,
): Promise<{ readonly engine: OpfsSnapshotVcsEngine; readonly latestSnapshot: VcsProjectSnapshot }> {
  const engine = new OpfsSnapshotVcsEngine({ adapter, chunkSizeBytes: 8192, hashAlgorithm: "sha-256" });
  await engine.init("main");

  const bgBytes = makeDeterministicLayerPayload(32_768, 101);
  const lineBytesV1 = makeDeterministicLayerPayload(24_576, 202);
  const balloonBytesV1 = makeDeterministicLayerPayload(8_192, 303);

  const bgLayer: VcsLayerEntry = {
    layerId: "layer-bg",
    name: "배경 야경 3D 렌더",
    kind: "raster",
    opacity: 1,
    visible: true,
    blendMode: "normal",
    payload: bgBytes,
  };
  const lineLayerV1: VcsLayerEntry = {
    layerId: "layer-line",
    name: "주인공 펜선화",
    kind: "vector",
    opacity: 1,
    visible: true,
    blendMode: "normal",
    payload: lineBytesV1,
  };
  const balloonLayerV1: VcsLayerEntry = {
    layerId: "layer-balloon",
    name: "대사 말풍선",
    kind: "balloon",
    opacity: 1,
    visible: true,
    blendMode: "normal",
    payload: balloonBytesV1,
  };

  const snapV1: VcsProjectSnapshot = {
    projectId: "ep01-rooftop-duel",
    title: "1화 옥상 결투 마스터",
    canvasWidth: 1600,
    canvasHeight: 12000,
    layers: [bgLayer, lineLayerV1, balloonLayerV1],
  };
  await engine.commit(snapV1, { message: "v1 기본 배경·러프 선화 커밋", timestampIso: "2026-11-24T09:00:00.000Z" });

  // 배경 레이어는 동일 청크를 100% 재사용하고 선화·조명만 변경
  const snapV2: VcsProjectSnapshot = {
    ...snapV1,
    layers: [
      bgLayer,
      { ...lineLayerV1, payload: makeDeterministicLayerPayload(24_576, 404) },
      balloonLayerV1,
      {
        layerId: "layer-rimlight",
        name: "역광 림라이트 FX",
        kind: "fx",
        opacity: 0.78,
        visible: true,
        blendMode: "screen",
        payload: makeDeterministicLayerPayload(16_384, 505),
      },
    ],
  };
  await engine.commit(snapV2, { message: "v2 펜선화 정리 및 림라이트 FX 추가", timestampIso: "2026-11-24T10:15:00.000Z" });
  return { engine, latestSnapshot: snapV2 };
}
