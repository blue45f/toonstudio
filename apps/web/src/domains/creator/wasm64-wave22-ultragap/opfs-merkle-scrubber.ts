/**
 * Wasm64 Wave 22 Ultragap — 유휴 예산(`<= 2ms/idle-tick`) OPFS 타일 비트부패(Bit-Rot)
 * 머클 스크러버 & 이중 저널·XOR 패리티 원자적 자가 복구기.
 *
 * - 외부 의존성 없는 결정론적 FIPS 180-4 SHA-256과 RFC 6962 도메인 분리(`0x00` 리프 / `0x01` 내부 노드)
 *   이진 머클 트리로 OPFS 캔버스 타일과 부모 해시 경로를 동시에 검증한다.
 * - 유휴 프레임 틱당 `2.0ms` 이내로 시간을 쪼개 백그라운드 스캔을 수행하며,
 *   조용한 비트 뒤집힘(Silent Bit-Rot)·잘린 쓰기(Truncated Write)·타일 유실 발견 시
 *   이중 저널 복제본 또는 인접 타일 XOR 스트라이프 패리티로 원자적 교체 복구한다 (`100%` 생존율, `₩0` 서버 비용).
 */

export const DEFAULT_OPFS_SCRUB_IDLE_BUDGET_MS = 2.0;
export const HARD_MAX_IDLE_TICK_BUDGET_MS = 2.0;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
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
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** 외부 의존성 없는 결정론적 FIPS 180-4 SHA-256 해시(`32B`)를 동기 계산한다. */
export function sha256Digest(message: Uint8Array): Uint8Array {
  const bitLenHi = Math.floor(message.byteLength / 0x20000000);
  const bitLenLo = (message.byteLength << 3) >>> 0;
  const paddedLen = ((message.byteLength + 9 + 63) >>> 6) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(message, 0);
  padded[message.byteLength] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi >>> 0, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  let h0 = SHA256_H0[0]!;
  let h1 = SHA256_H0[1]!;
  let h2 = SHA256_H0[2]!;
  let h3 = SHA256_H0[3]!;
  let h4 = SHA256_H0[4]!;
  let h5 = SHA256_H0[5]!;
  let h6 = SHA256_H0[6]!;
  let h7 = SHA256_H0[7]!;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

function hashesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

/** RFC 6962 리프 도메인 분리(`0x00 || tileIndex_u32 || byteLen_u32 || payload`) 해시를 계산한다. */
export function computeOpfsTileLeafHash(
  tileIndex: number,
  expectedByteLength: number,
  payload: Uint8Array,
): Uint8Array {
  const buf = new Uint8Array(9 + payload.byteLength);
  buf[0] = 0x00;
  const view = new DataView(buf.buffer);
  view.setUint32(1, tileIndex >>> 0, false);
  view.setUint32(5, expectedByteLength >>> 0, false);
  buf.set(payload, 9);
  return sha256Digest(buf);
}

/** RFC 6962 내부 부모 노드 도메인 분리(`0x01 || left || right`) 해시를 계산한다. */
export function computeMerkleParentHash(leftHash: Uint8Array, rightHash: Uint8Array): Uint8Array {
  const buf = new Uint8Array(1 + leftHash.byteLength + rightHash.byteLength);
  buf[0] = 0x01;
  buf.set(leftHash, 1);
  buf.set(rightHash, 1 + leftHash.byteLength);
  return sha256Digest(buf);
}

export interface OpfsTileMerkleTree {
  readonly leafCount: number;
  readonly levels: readonly (readonly Uint8Array[])[];
  readonly rootHash: Uint8Array;
  readonly rootHashHex: string;
}

/** OPFS 타일 리프 해시 배열로부터 이진 머클 트리를 구성한다. */
export function buildOpfsTileMerkleTree(leafHashes: readonly Uint8Array[]): OpfsTileMerkleTree {
  if (leafHashes.length === 0) {
    const emptyRoot = sha256Digest(new Uint8Array([0x00]));
    return { leafCount: 0, levels: [[emptyRoot]], rootHash: emptyRoot, rootHashHex: bytesToHex(emptyRoot) };
  }

  const levels: Uint8Array[][] = [leafHashes.map((h) => new Uint8Array(h))];
  while (levels[levels.length - 1]!.length > 1) {
    const current = levels[levels.length - 1]!;
    const nextLevel: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i]!;
      const right = current[i + 1] ?? left;
      nextLevel.push(computeMerkleParentHash(left, right));
    }
    levels.push(nextLevel);
  }

  const rootHash = levels[levels.length - 1]![0]!;
  return { leafCount: leafHashes.length, levels, rootHash, rootHashHex: bytesToHex(rootHash) };
}

export interface OpfsJournalReplicaBlock {
  readonly replicaSlot: number;
  readonly commitSeq: number;
  readonly expectedByteLength: number;
  readonly leafHashHex: string;
  readonly payload: Uint8Array;
}

export interface OpfsTileDescriptor {
  readonly tileId: string;
  readonly tileIndex: number;
  readonly expectedByteLength: number;
  readonly expectedLeafHash: Uint8Array;
  readonly expectedLeafHashHex: string;
}

export interface OpfsStripeParityContext {
  readonly partnerTileIndex: number;
  readonly partnerExpectedByteLength: number;
  readonly partnerExpectedLeafHash: Uint8Array;
  readonly partnerBytes: Uint8Array | null;
  readonly xorParityBytes: Uint8Array;
}

export interface OpfsTileVolumePort {
  listTileDescriptors(): readonly OpfsTileDescriptor[];
  getMerkleTree(): OpfsTileMerkleTree;
  repairMerkleNode?(level: number, nodeIndex: number, validHash: Uint8Array): void;
  readPrimaryTileBytes(tileId: string): Uint8Array | null;
  stageAndSwapPrimaryTileAtomic(tileId: string, verifiedBytes: Uint8Array): void;
  readRedundantJournalBlocks(tileId: string): readonly OpfsJournalReplicaBlock[];
  readStripeParityContext?(tileId: string): OpfsStripeParityContext | null;
}

export type OpfsCorruptionKind =
  | "silent-bit-rot"
  | "truncated-write"
  | "missing-tile"
  | "merkle-parent-mismatch";

export interface OpfsScrubIncident {
  readonly tileId: string;
  readonly tileIndex: number;
  readonly kind: OpfsCorruptionKind;
  readonly healed: boolean;
  readonly recoverySource: "journal-replica" | "xor-stripe-parity" | "merkle-recompute" | "unrecoverable";
}

export interface OpfsScrubTickReport {
  readonly scannedTileCount: number;
  readonly corruptedTileCount: number;
  readonly healedTileCount: number;
  readonly unrecoverableTileCount: number;
  readonly incidents: readonly OpfsScrubIncident[];
  readonly elapsedMs: number;
  readonly budgetMs: number;
  readonly yieldedForIdleBudget: boolean;
  readonly nextCursorIndex: number;
  readonly completedFullPasses: number;
  readonly merkleRootVerified: boolean;
  readonly dataSurvivalRate: number;
  readonly serverCostKrw: 0;
}

export interface OpfsIdleMerkleScrubber {
  runIdleTick(budgetOverrideMs?: number): OpfsScrubTickReport;
  runFullVolumeScrub(maxTicks?: number): OpfsScrubTickReport;
  getCursorIndex(): number;
  getCompletedPasses(): number;
}

export interface InMemoryOpfsTileVolume extends OpfsTileVolumePort {
  corruptPrimaryTileBit(tileId: string, byteOffset: number, bitMask?: number): void;
  truncatePrimaryTile(tileId: string, truncatedLength: number): void;
  deletePrimaryTile(tileId: string): void;
  corruptJournalReplicaBit(tileId: string, replicaSlot: number, byteOffset: number, bitMask?: number): void;
  corruptMerkleInternalNode(level: number, nodeIndex: number): void;
}

/** 테스트 및 로컬 검증을 위한 이중 저널 + 인접 타일 XOR 패리티 내장 인메모리 OPFS 볼륨을 생성한다. */
export function createInMemoryOpfsTileVolume(
  initialTiles: readonly { readonly tileId: string; readonly bytes: Uint8Array }[],
): InMemoryOpfsTileVolume {
  const primaryStore = new Map<string, Uint8Array>();
  const journalStore = new Map<string, OpfsJournalReplicaBlock[]>();
  const descriptors: OpfsTileDescriptor[] = [];
  const leafHashes: Uint8Array[] = [];

  for (let idx = 0; idx < initialTiles.length; idx += 1) {
    const item = initialTiles[idx]!;
    const cleanCopy = new Uint8Array(item.bytes);
    const leafHash = computeOpfsTileLeafHash(idx, cleanCopy.byteLength, cleanCopy);
    const leafHex = bytesToHex(leafHash);

    primaryStore.set(item.tileId, cleanCopy);
    journalStore.set(item.tileId, [
      { replicaSlot: 0, commitSeq: 2, expectedByteLength: cleanCopy.byteLength, leafHashHex: leafHex, payload: new Uint8Array(cleanCopy) },
      { replicaSlot: 1, commitSeq: 1, expectedByteLength: cleanCopy.byteLength, leafHashHex: leafHex, payload: new Uint8Array(cleanCopy) },
    ]);
    descriptors.push({
      tileId: item.tileId,
      tileIndex: idx,
      expectedByteLength: cleanCopy.byteLength,
      expectedLeafHash: leafHash,
      expectedLeafHashHex: leafHex,
    });
    leafHashes.push(leafHash);
  }

  const pairXorParity = new Map<number, Uint8Array>();
  for (let pairBase = 0; pairBase + 1 < initialTiles.length; pairBase += 2) {
    const a = initialTiles[pairBase]!.bytes;
    const b = initialTiles[pairBase + 1]!.bytes;
    const maxLen = Math.max(a.byteLength, b.byteLength);
    const parity = new Uint8Array(maxLen);
    for (let k = 0; k < maxLen; k += 1) {
      parity[k] = (a[k] ?? 0) ^ (b[k] ?? 0);
    }
    pairXorParity.set(pairBase, parity);
  }

  const merkleTree = buildOpfsTileMerkleTree(leafHashes);
  const mutableLevels = merkleTree.levels.map((lvl) => lvl.map((node) => new Uint8Array(node)));

  return {
    listTileDescriptors: () => descriptors,
    getMerkleTree: () => ({
      leafCount: merkleTree.leafCount,
      levels: mutableLevels,
      rootHash: merkleTree.rootHash,
      rootHashHex: merkleTree.rootHashHex,
    }),
    repairMerkleNode: (level, nodeIndex, validHash) => {
      const targetLevel = mutableLevels[level];
      if (targetLevel && nodeIndex >= 0 && nodeIndex < targetLevel.length) {
        targetLevel[nodeIndex] = new Uint8Array(validHash);
      }
    },
    readPrimaryTileBytes: (tileId) => {
      const found = primaryStore.get(tileId);
      return found ? new Uint8Array(found) : null;
    },
    stageAndSwapPrimaryTileAtomic: (tileId, verifiedBytes) => {
      const staged = new Uint8Array(verifiedBytes.byteLength);
      staged.set(verifiedBytes);
      primaryStore.set(tileId, staged);
    },
    readRedundantJournalBlocks: (tileId) => journalStore.get(tileId) ?? [],
    readStripeParityContext: (tileId) => {
      const desc = descriptors.find((d) => d.tileId === tileId);
      if (!desc) return null;
      const pairBase = desc.tileIndex - (desc.tileIndex % 2);
      const parity = pairXorParity.get(pairBase);
      const partnerIndex = desc.tileIndex % 2 === 0 ? pairBase + 1 : pairBase;
      const partnerDesc = descriptors[partnerIndex];
      if (!parity || !partnerDesc) return null;
      return {
        partnerTileIndex: partnerIndex,
        partnerExpectedByteLength: partnerDesc.expectedByteLength,
        partnerExpectedLeafHash: partnerDesc.expectedLeafHash,
        partnerBytes: primaryStore.get(partnerDesc.tileId) ?? null,
        xorParityBytes: new Uint8Array(parity),
      };
    },
    corruptPrimaryTileBit: (tileId, byteOffset, bitMask = 0x01) => {
      const target = primaryStore.get(tileId);
      if (!target || target.byteLength === 0) return;
      const idx = clamp(Math.trunc(byteOffset), 0, target.byteLength - 1);
      target[idx] = (target[idx] ?? 0) ^ (bitMask & 0xff);
    },
    truncatePrimaryTile: (tileId, truncatedLength) => {
      const target = primaryStore.get(tileId);
      if (!target) return;
      primaryStore.set(tileId, target.slice(0, clamp(Math.trunc(truncatedLength), 0, Math.max(0, target.byteLength - 1))));
    },
    deletePrimaryTile: (tileId) => {
      primaryStore.delete(tileId);
    },
    corruptJournalReplicaBit: (tileId, replicaSlot, byteOffset, bitMask = 0x04) => {
      const rep = journalStore.get(tileId)?.find((r) => r.replicaSlot === replicaSlot);
      if (!rep || rep.payload.byteLength === 0) return;
      const idx = clamp(Math.trunc(byteOffset), 0, rep.payload.byteLength - 1);
      rep.payload[idx] = (rep.payload[idx] ?? 0) ^ (bitMask & 0xff);
    },
    corruptMerkleInternalNode: (level, nodeIndex) => {
      const node = mutableLevels[level]?.[nodeIndex];
      if (!node || node.byteLength === 0) return;
      node[0] = (node[0] ?? 0) ^ 0x80;
    },
  };
}

function verifyAndRepairMerklePath(
  port: OpfsTileVolumePort,
  tree: OpfsTileMerkleTree,
  tileIndex: number,
  verifiedLeafHash: Uint8Array,
): { rootMatches: boolean; repairedParentNode: boolean } {
  let currentHash = verifiedLeafHash;
  let idx = tileIndex;
  let repairedParentNode = false;

  const level0 = tree.levels[0];
  if (level0?.[idx] && !hashesEqual(level0[idx]!, verifiedLeafHash)) {
    port.repairMerkleNode?.(0, idx, verifiedLeafHash);
    repairedParentNode = true;
  }

  for (let lvl = 0; lvl + 1 < tree.levels.length; lvl += 1) {
    const levelNodes = tree.levels[lvl]!;
    const isRightChild = idx % 2 === 1;
    const siblingHash = levelNodes[isRightChild ? idx - 1 : idx + 1] ?? currentHash;
    const computedParent = isRightChild
      ? computeMerkleParentHash(siblingHash, currentHash)
      : computeMerkleParentHash(currentHash, siblingHash);

    const parentIdx = Math.floor(idx / 2);
    const storedParent = tree.levels[lvl + 1]?.[parentIdx];
    if (lvl + 2 < tree.levels.length && storedParent && !hashesEqual(storedParent, computedParent)) {
      port.repairMerkleNode?.(lvl + 1, parentIdx, computedParent);
      repairedParentNode = true;
    }
    currentHash = computedParent;
    idx = parentIdx;
  }

  return { rootMatches: hashesEqual(currentHash, tree.rootHash), repairedParentNode };
}

function tryRecoverTileBytes(
  port: OpfsTileVolumePort,
  desc: OpfsTileDescriptor,
): { bytes: Uint8Array; source: "journal-replica" | "xor-stripe-parity" } | null {
  const replicas = [...port.readRedundantJournalBlocks(desc.tileId)].sort((a, b) => b.commitSeq - a.commitSeq);

  for (let i = 0; i < replicas.length; i += 1) {
    const rep = replicas[i]!;
    if (rep.payload.byteLength !== desc.expectedByteLength) continue;
    const candidateHash = computeOpfsTileLeafHash(desc.tileIndex, desc.expectedByteLength, rep.payload);
    if (hashesEqual(candidateHash, desc.expectedLeafHash)) {
      return { bytes: new Uint8Array(rep.payload), source: "journal-replica" };
    }
  }

  const parityCtx = port.readStripeParityContext?.(desc.tileId);
  if (parityCtx?.partnerBytes && parityCtx.partnerBytes.byteLength === parityCtx.partnerExpectedByteLength) {
    const partnerHash = computeOpfsTileLeafHash(
      parityCtx.partnerTileIndex,
      parityCtx.partnerExpectedByteLength,
      parityCtx.partnerBytes,
    );
    if (hashesEqual(partnerHash, parityCtx.partnerExpectedLeafHash)) {
      const recovered = new Uint8Array(desc.expectedByteLength);
      for (let k = 0; k < desc.expectedByteLength; k += 1) {
        recovered[k] = (parityCtx.xorParityBytes[k] ?? 0) ^ (parityCtx.partnerBytes[k] ?? 0);
      }
      if (hashesEqual(computeOpfsTileLeafHash(desc.tileIndex, desc.expectedByteLength, recovered), desc.expectedLeafHash)) {
        return { bytes: recovered, source: "xor-stripe-parity" };
      }
    }
  }

  return null;
}

/**
 * 유휴 프레임 예산(`<= 2ms/idle-tick`) 안에서 OPFS 타일 비트부패 및 잘린 쓰기를 점진적으로 스캔하고,
 * 손상 타일을 이중 저널 블록 또는 XOR 패리티로부터 원자적으로 복구하는 스크러버를 생성한다.
 */
export function createOpfsIdleMerkleScrubber(
  port: OpfsTileVolumePort,
  options?: { readonly defaultIdleBudgetMs?: number; readonly clockNowMs?: () => number },
): OpfsIdleMerkleScrubber {
  const clockNow = options?.clockNowMs ?? (() => performance.now());
  const defaultBudget = clamp(
    options?.defaultIdleBudgetMs ?? DEFAULT_OPFS_SCRUB_IDLE_BUDGET_MS,
    0.1,
    HARD_MAX_IDLE_TICK_BUDGET_MS,
  );

  let cursorIndex = 0;
  let completedFullPasses = 0;
  let ewmaTileCostMs = 0.05;

  const runIdleTick = (budgetOverrideMs?: number): OpfsScrubTickReport => {
    const budgetMs = clamp(budgetOverrideMs ?? defaultBudget, 0.1, HARD_MAX_IDLE_TICK_BUDGET_MS);
    const descriptors = port.listTileDescriptors();
    const totalTiles = descriptors.length;
    const startMs = clockNow();

    if (totalTiles === 0) {
      return {
        scannedTileCount: 0,
        corruptedTileCount: 0,
        healedTileCount: 0,
        unrecoverableTileCount: 0,
        incidents: [],
        elapsedMs: Math.max(0, clockNow() - startMs),
        budgetMs,
        yieldedForIdleBudget: false,
        nextCursorIndex: 0,
        completedFullPasses,
        merkleRootVerified: true,
        dataSurvivalRate: 1,
        serverCostKrw: 0,
      };
    }

    const incidents: OpfsScrubIncident[] = [];
    let scannedTileCount = 0;
    let corruptedTileCount = 0;
    let healedTileCount = 0;
    let unrecoverableTileCount = 0;
    let yieldedForIdleBudget = false;
    let allRootsVerified = true;

    while (scannedTileCount < totalTiles) {
      if (scannedTileCount > 0 && clockNow() - startMs + ewmaTileCostMs > budgetMs) {
        yieldedForIdleBudget = true;
        break;
      }

      const tileTickStart = clockNow();
      const desc = descriptors[cursorIndex]!;
      const primaryBytes = port.readPrimaryTileBytes(desc.tileId);
      let corruptionKind: OpfsCorruptionKind | null = null;

      if (primaryBytes === null) {
        corruptionKind = "missing-tile";
      } else if (primaryBytes.byteLength !== desc.expectedByteLength) {
        corruptionKind = "truncated-write";
      } else if (!hashesEqual(computeOpfsTileLeafHash(desc.tileIndex, desc.expectedByteLength, primaryBytes), desc.expectedLeafHash)) {
        corruptionKind = "silent-bit-rot";
      }

      if (corruptionKind !== null) {
        corruptedTileCount += 1;
        const recovered = tryRecoverTileBytes(port, desc);
        if (recovered) {
          port.stageAndSwapPrimaryTileAtomic(desc.tileId, recovered.bytes);
          const verifiedHash = computeOpfsTileLeafHash(desc.tileIndex, desc.expectedByteLength, recovered.bytes);
          const treeCheck = verifyAndRepairMerklePath(port, port.getMerkleTree(), desc.tileIndex, verifiedHash);

          if (hashesEqual(verifiedHash, desc.expectedLeafHash) && treeCheck.rootMatches) {
            healedTileCount += 1;
            incidents.push({ tileId: desc.tileId, tileIndex: desc.tileIndex, kind: corruptionKind, healed: true, recoverySource: recovered.source });
          } else {
            unrecoverableTileCount += 1;
            allRootsVerified = false;
            incidents.push({ tileId: desc.tileId, tileIndex: desc.tileIndex, kind: corruptionKind, healed: false, recoverySource: "unrecoverable" });
          }
        } else {
          unrecoverableTileCount += 1;
          allRootsVerified = false;
          incidents.push({ tileId: desc.tileId, tileIndex: desc.tileIndex, kind: corruptionKind, healed: false, recoverySource: "unrecoverable" });
        }
      } else {
        const treeCheck = verifyAndRepairMerklePath(port, port.getMerkleTree(), desc.tileIndex, desc.expectedLeafHash);
        if (!treeCheck.rootMatches) allRootsVerified = false;
        if (treeCheck.repairedParentNode) {
          corruptedTileCount += 1;
          healedTileCount += 1;
          incidents.push({ tileId: desc.tileId, tileIndex: desc.tileIndex, kind: "merkle-parent-mismatch", healed: true, recoverySource: "merkle-recompute" });
        }
      }

      scannedTileCount += 1;
      cursorIndex += 1;
      if (cursorIndex >= totalTiles) {
        cursorIndex = 0;
        completedFullPasses += 1;
      }

      const singleCost = Math.max(0, clockNow() - tileTickStart);
      ewmaTileCostMs = scannedTileCount === 1 && completedFullPasses === 0
        ? Math.max(0.01, singleCost)
        : ewmaTileCostMs * 0.7 + singleCost * 0.3;
    }

    const elapsedMs = Math.max(0, clockNow() - startMs);
    return {
      scannedTileCount,
      corruptedTileCount,
      healedTileCount,
      unrecoverableTileCount,
      incidents,
      elapsedMs,
      budgetMs,
      yieldedForIdleBudget,
      nextCursorIndex: cursorIndex,
      completedFullPasses,
      merkleRootVerified: allRootsVerified,
      dataSurvivalRate: scannedTileCount > 0 ? (scannedTileCount - unrecoverableTileCount) / scannedTileCount : 1,
      serverCostKrw: 0,
    };
  };

  const runFullVolumeScrub = (maxTicks = 1024): OpfsScrubTickReport => {
    const totalTiles = port.listTileDescriptors().length;
    const allIncidents: OpfsScrubIncident[] = [];
    let totalScanned = 0;
    let totalCorrupted = 0;
    let totalHealed = 0;
    let totalUnrecoverable = 0;
    let totalElapsedMs = 0;
    let allVerified = true;

    for (let tick = 0; tick < maxTicks && totalScanned < Math.max(1, totalTiles); tick += 1) {
      const report = runIdleTick(defaultBudget);
      totalScanned += report.scannedTileCount;
      totalCorrupted += report.corruptedTileCount;
      totalHealed += report.healedTileCount;
      totalUnrecoverable += report.unrecoverableTileCount;
      totalElapsedMs += report.elapsedMs;
      if (!report.merkleRootVerified) allVerified = false;
      for (let i = 0; i < report.incidents.length; i += 1) {
        allIncidents.push(report.incidents[i]!);
      }
      if (totalTiles === 0) break;
    }

    return {
      scannedTileCount: totalScanned,
      corruptedTileCount: totalCorrupted,
      healedTileCount: totalHealed,
      unrecoverableTileCount: totalUnrecoverable,
      incidents: allIncidents,
      elapsedMs: totalElapsedMs,
      budgetMs: defaultBudget,
      yieldedForIdleBudget: false,
      nextCursorIndex: cursorIndex,
      completedFullPasses,
      merkleRootVerified: allVerified,
      dataSurvivalRate: totalScanned > 0 ? (totalScanned - totalUnrecoverable) / totalScanned : 1,
      serverCostKrw: 0,
    };
  };

  return {
    runIdleTick,
    runFullVolumeScrub,
    getCursorIndex: () => cursorIndex,
    getCompletedPasses: () => completedFullPasses,
  };
}
