/**
 * 무서버(₩0) P2P 자동 암호화 백업·복구 볼트(`P2pEncryptedBackupVault`).
 *
 * - 프로젝트 스냅샷을 콘텐츠 주소 청크로 분할 → 이진 Merkle 트리 구축(`./merkle-tree-verifier`) →
 *   클라이언트 WebCrypto AES-256-GCM 암호화(청크별 IV + AAD 바인딩) →
 *   `k`개 데이터 샤드 + `1`개 XOR 패리티 샤드로 P2P 피어 분산 저장(서버 스토리지 `0B`)
 * - 임의 피어 1대 유실 또는 사일런트 비트 변조 시 XOR 패리티 복원 + Merkle 루트 검증으로 100% 비트-동일 복구
 */

import {
  BACKUP_DEFAULT_CHUNK_BYTES,
  buildMerkleTree,
  computeContentDigestHex,
  getMerkleProof,
  getSubtleCrypto,
  splitIntoContentChunks,
  toStrictArrayBuffer,
  verifyMerkleProof,
  type MerkleHashAlgorithm,
  type MerkleInclusionProof,
} from "./merkle-tree-verifier";

export {
  BACKUP_DEFAULT_CHUNK_BYTES,
  buildMerkleTree,
  computeContentDigestHex,
  computeFnv1a128Hex,
  getMerkleProof,
  splitIntoContentChunks,
  verifyMerkleProof,
  type MerkleHashAlgorithm,
  type MerkleInclusionProof,
  type MerkleProofSibling,
  type MerkleTree,
  type MerkleVerificationResult,
} from "./merkle-tree-verifier";

export const BACKUP_BUNDLE_MAGIC = 0x54534231 as const; // "TSB1"
export const BACKUP_DEFAULT_DATA_SHARDS = 4 as const;

export interface P2pPeerNetworkAdapter {
  readonly peerIds: readonly string[];
  putShard(peerId: string, shardKey: string, data: Uint8Array): Promise<void>;
  getShard(peerId: string, shardKey: string): Promise<Uint8Array | null>;
  deleteShard(peerId: string, shardKey: string): Promise<void>;
}

export interface InMemoryP2pPeerNetwork extends P2pPeerNetworkAdapter {
  setPeerOffline(peerId: string, offline: boolean): void;
  corruptPeerShard(peerId: string, shardKey: string, byteOffset?: number): boolean;
  inspectRawShard(peerId: string, shardKey: string): Uint8Array | null;
  getStoredShardCount(peerId: string): number;
}

export interface P2pShardAssignment {
  readonly shardIndex: number;
  readonly kind: "data" | "parity";
  readonly peerId: string;
  readonly shardKey: string;
  readonly shardDigestHex: string;
  readonly byteLength: number;
}

export interface P2pBackupManifest {
  readonly snapshotId: string;
  readonly createdAtIso: string;
  readonly hashAlgorithm: MerkleHashAlgorithm;
  readonly merkleRootHex: string;
  readonly totalPlaintextBytes: number;
  readonly chunkSizeBytes: number;
  readonly chunkCount: number;
  readonly dataShardCount: number;
  readonly parityShardCount: 1;
  readonly shardByteLength: number;
  readonly shards: readonly P2pShardAssignment[];
  readonly chunkProofs: readonly MerkleInclusionProof[];
  readonly serverStorageBytes: 0;
}

export interface P2pBackupOptions {
  readonly snapshotId: string;
  readonly chunkSizeBytes?: number;
  readonly dataShardCount?: number;
  readonly hashAlgorithm?: MerkleHashAlgorithm;
  readonly deterministicIvSeed?: Uint8Array;
  readonly createdAtIso?: string;
}

export interface P2pRecoveryReport {
  readonly snapshotId: string;
  readonly merkleRootHex: string;
  readonly recoveredFromParity: boolean;
  readonly reconstructedShardIndex: number | null;
  readonly healthyShardCount: number;
  readonly lostOrCorruptedPeerIds: readonly string[];
  readonly verifiedChunkCount: number;
  readonly totalPlaintextBytes: number;
  readonly serverStorageBytes: 0;
}

export type P2pRecoveryResult =
  | {
      readonly ok: true;
      readonly data: Uint8Array;
      readonly report: P2pRecoveryReport;
    }
  | {
      readonly ok: false;
      readonly error:
        | "insufficient-shards-for-recovery"
        | "corrupted-bundle-format"
        | "decryption-failed"
        | "merkle-verification-failed";
      readonly lostOrCorruptedPeerIds: readonly string[];
      readonly detail: string;
    };

function concatUint8Arrays(parts: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const part of parts) total += part.byteLength;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }
  return out;
}

/**
 * WebCrypto AES-256-GCM 클라이언트 전용 백업 암호화 키를 새로 발급한다.
 */
export async function generateVaultKey(): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  if (!subtle) throw new Error("WebCrypto SubtleCrypto API를 사용할 수 없는 런타임입니다.");
  return subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/**
 * 호출자가 제공한 32바이트 원시 키를 AES-256-GCM `CryptoKey`로 임포트한다.
 */
export async function importRawVaultKey(rawKeyBytes: Uint8Array): Promise<CryptoKey> {
  if (rawKeyBytes.byteLength !== 32) {
    throw new RangeError(`AES-256-GCM 키는 정확히 32바이트여야 합니다(현재 ${rawKeyBytes.byteLength}바이트).`);
  }
  const subtle = getSubtleCrypto();
  if (!subtle) throw new Error("WebCrypto SubtleCrypto API를 사용할 수 없는 런타임입니다.");
  return subtle.importKey("raw", toStrictArrayBuffer(rawKeyBytes), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

function buildChunkIv(chunkIndex: number, deterministicSeed?: Uint8Array): Uint8Array {
  const iv = new Uint8Array(12);
  if (deterministicSeed && deterministicSeed.byteLength >= 12) {
    iv.set(deterministicSeed.subarray(0, 12));
    const view = new DataView(iv.buffer);
    const mixed = (view.getUint32(8, false) ^ ((chunkIndex + 1) * 0x9e3779b1)) >>> 0;
    view.setUint32(8, mixed, false);
    return iv;
  }
  globalThis.crypto.getRandomValues(iv);
  return iv;
}

function buildChunkAad(snapshotId: string, chunkIndex: number, leafDigestHex: string): Uint8Array {
  return new TextEncoder().encode(`${snapshotId}|${chunkIndex}|${leafDigestHex}`);
}

interface EncryptedChunkEnvelope {
  readonly chunkIndex: number;
  readonly iv: Uint8Array;
  readonly ciphertext: Uint8Array;
}

function encodeEncryptedBundle(envelopes: readonly EncryptedChunkEnvelope[]): Uint8Array {
  let totalBytes = 8;
  for (const env of envelopes) totalBytes += 8 + env.iv.byteLength + env.ciphertext.byteLength;
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);
  view.setUint32(0, BACKUP_BUNDLE_MAGIC, true);
  view.setUint32(4, envelopes.length, true);

  let cursor = 8;
  for (const env of envelopes) {
    view.setUint32(cursor, env.chunkIndex, true);
    view.setUint32(cursor + 4, env.ciphertext.byteLength, true);
    cursor += 8;
    out.set(env.iv, cursor);
    cursor += 12;
    out.set(env.ciphertext, cursor);
    cursor += env.ciphertext.byteLength;
  }
  return out;
}

function decodeEncryptedBundle(bytes: Uint8Array): readonly EncryptedChunkEnvelope[] | null {
  if (bytes.byteLength < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== BACKUP_BUNDLE_MAGIC) return null;
  const count = view.getUint32(4, true);

  const envelopes: EncryptedChunkEnvelope[] = [];
  let cursor = 8;
  for (let i = 0; i < count; i += 1) {
    if (cursor + 20 > bytes.byteLength) return null;
    const chunkIndex = view.getUint32(cursor, true);
    const cipherLen = view.getUint32(cursor + 4, true);
    cursor += 8;
    if (cursor + 12 + cipherLen > bytes.byteLength) return null;
    const iv = bytes.slice(cursor, cursor + 12);
    cursor += 12;
    const ciphertext = bytes.slice(cursor, cursor + cipherLen);
    cursor += cipherLen;
    envelopes.push({ chunkIndex, iv, ciphertext });
  }
  return cursor === bytes.byteLength ? envelopes : null;
}

/**
 * 바이트 스트림을 `k`개의 동등 크기 데이터 샤드 + `1`개의 XOR 패리티 샤드로 분할한다.
 */
export function encodeXorRedundantShards(
  payload: Uint8Array,
  dataShardCount: number,
): { readonly dataShards: readonly Uint8Array[]; readonly parityShard: Uint8Array; readonly shardByteLength: number } {
  const k = Math.max(2, Math.floor(dataShardCount));
  const framed = new Uint8Array(8 + payload.byteLength);
  const view = new DataView(framed.buffer);
  view.setUint32(0, payload.byteLength, true);
  view.setUint32(4, k, true);
  framed.set(payload, 8);

  const shardByteLength = Math.ceil(framed.byteLength / k);
  const dataShards: Uint8Array[] = [];
  const parityShard = new Uint8Array(shardByteLength);

  for (let s = 0; s < k; s += 1) {
    const shard = new Uint8Array(shardByteLength);
    const start = s * shardByteLength;
    const end = Math.min(framed.byteLength, start + shardByteLength);
    if (start < end) shard.set(framed.subarray(start, end), 0);
    for (let i = 0; i < shardByteLength; i += 1) {
      parityShard[i] = (parityShard[i] ?? 0) ^ (shard[i] ?? 0);
    }
    dataShards.push(shard);
  }

  return { dataShards, parityShard, shardByteLength };
}

/**
 * 최대 1개의 데이터 샤드가 유실된 경우에도 남은 `k - 1`개 데이터 샤드와 `1`개 XOR 패리티 샤드로
 * 원본 바이트 스트림을 100% 비트-동일하게 복원한다.
 */
export function reconstructFromXorRedundantShards(
  dataShards: readonly (Uint8Array | null)[],
  parityShard: Uint8Array | null,
  shardByteLength: number,
):
  | { readonly ok: true; readonly payload: Uint8Array; readonly reconstructedShardIndex: number | null }
  | { readonly ok: false } {
  const k = dataShards.length;
  const missingIndices: number[] = [];
  for (let i = 0; i < k; i += 1) {
    const shard = dataShards[i];
    if (!shard || shard.byteLength !== shardByteLength) missingIndices.push(i);
  }
  if (missingIndices.length > 1) return { ok: false };

  const resolved: Uint8Array[] = [];
  let reconstructedShardIndex: number | null = null;

  if (missingIndices.length === 1) {
    if (!parityShard || parityShard.byteLength !== shardByteLength) return { ok: false };
    const missingIdx = missingIndices[0] ?? 0;
    const recovered = new Uint8Array(parityShard);
    for (let i = 0; i < k; i += 1) {
      if (i === missingIdx) continue;
      const peerShard = dataShards[i];
      if (!peerShard) return { ok: false };
      for (let b = 0; b < shardByteLength; b += 1) {
        recovered[b] = (recovered[b] ?? 0) ^ (peerShard[b] ?? 0);
      }
    }
    reconstructedShardIndex = missingIdx;
    for (let i = 0; i < k; i += 1) {
      const piece = i === missingIdx ? recovered : dataShards[i];
      if (!piece) return { ok: false };
      resolved.push(piece);
    }
  } else {
    for (let i = 0; i < k; i += 1) {
      const piece = dataShards[i];
      if (!piece) return { ok: false };
      resolved.push(piece);
    }
  }

  const framed = concatUint8Arrays(resolved);
  if (framed.byteLength < 8) return { ok: false };
  const view = new DataView(framed.buffer, framed.byteOffset, framed.byteLength);
  const payloadLength = view.getUint32(0, true);
  const encodedK = view.getUint32(4, true);
  if (encodedK !== k || 8 + payloadLength > framed.byteLength) return { ok: false };

  return { ok: true, payload: framed.slice(8, 8 + payloadLength), reconstructedShardIndex };
}

/**
 * 피어 장애·샤드 손상 시나리오 검증을 지원하는 메모리 P2P 피어 네트워크 어댑터를 생성한다.
 */
export function createInMemoryP2pPeerNetwork(peerIds: readonly string[]): InMemoryP2pPeerNetwork {
  const stores = new Map<string, Map<string, Uint8Array>>();
  const offlinePeers = new Set<string>();
  for (const id of peerIds) stores.set(id, new Map<string, Uint8Array>());

  return {
    peerIds: [...peerIds],
    async putShard(peerId: string, shardKey: string, data: Uint8Array): Promise<void> {
      if (offlinePeers.has(peerId)) throw new Error(`오프라인 P2P 피어에 쓸 수 없습니다: ${peerId}`);
      const bucket = stores.get(peerId);
      if (!bucket) throw new Error(`알 수 없는 P2P 피어: ${peerId}`);
      bucket.set(shardKey, new Uint8Array(data));
    },
    async getShard(peerId: string, shardKey: string): Promise<Uint8Array | null> {
      if (offlinePeers.has(peerId)) return null;
      const found = stores.get(peerId)?.get(shardKey);
      return found ? new Uint8Array(found) : null;
    },
    async deleteShard(peerId: string, shardKey: string): Promise<void> {
      stores.get(peerId)?.delete(shardKey);
    },
    setPeerOffline(peerId: string, offline: boolean): void {
      if (offline) offlinePeers.add(peerId);
      else offlinePeers.delete(peerId);
    },
    corruptPeerShard(peerId: string, shardKey: string, byteOffset = 0): boolean {
      const shard = stores.get(peerId)?.get(shardKey);
      if (!shard || shard.byteLength === 0) return false;
      const idx = Math.max(0, Math.min(shard.byteLength - 1, Math.floor(byteOffset)));
      shard[idx] = (shard[idx] ?? 0) ^ 0xff;
      return true;
    },
    inspectRawShard(peerId: string, shardKey: string): Uint8Array | null {
      const found = stores.get(peerId)?.get(shardKey);
      return found ? new Uint8Array(found) : null;
    },
    getStoredShardCount(peerId: string): number {
      return stores.get(peerId)?.size ?? 0;
    },
  };
}

/**
 * 무서버(₩0) 종단간 암호화 P2P 자동 백업·복구 및 Merkle 자산 무결성 검증 볼트.
 */
export class P2pEncryptedBackupVault {
  private readonly network: P2pPeerNetworkAdapter;

  constructor(network: P2pPeerNetworkAdapter) {
    this.network = network;
  }

  async backupSnapshot(
    snapshotBytes: Uint8Array,
    key: CryptoKey,
    options: P2pBackupOptions,
  ): Promise<P2pBackupManifest> {
    const subtle = getSubtleCrypto();
    if (!subtle) throw new Error("WebCrypto SubtleCrypto API가 필요합니다.");

    const chunkSizeBytes = Math.max(64, Math.floor(options.chunkSizeBytes ?? BACKUP_DEFAULT_CHUNK_BYTES));
    const dataShardCount = Math.max(2, Math.floor(options.dataShardCount ?? BACKUP_DEFAULT_DATA_SHARDS));
    const requiredPeers = dataShardCount + 1;
    if (this.network.peerIds.length < requiredPeers) {
      throw new RangeError(
        `P2P 피어 수 부족: k+1(${requiredPeers})개 피어가 필요하지만 현재 ${this.network.peerIds.length}개입니다.`,
      );
    }

    const hashAlgorithm: MerkleHashAlgorithm = options.hashAlgorithm ?? "sha-256";
    const chunks = splitIntoContentChunks(snapshotBytes, chunkSizeBytes);
    const merkleTree = await buildMerkleTree(chunks, hashAlgorithm);
    const chunkProofs = chunks.map((_, idx) => getMerkleProof(merkleTree, idx));

    const envelopes: EncryptedChunkEnvelope[] = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const plainChunk = chunks[i] ?? new Uint8Array(0);
      const leafDigest = merkleTree.leafDigests[i] ?? "";
      const iv = buildChunkIv(i, options.deterministicIvSeed);
      const aad = buildChunkAad(options.snapshotId, i, leafDigest);
      const encryptedBuf = await subtle.encrypt(
        { name: "AES-GCM", iv: toStrictArrayBuffer(iv), additionalData: toStrictArrayBuffer(aad) },
        key,
        toStrictArrayBuffer(plainChunk),
      );
      envelopes.push({ chunkIndex: i, iv, ciphertext: new Uint8Array(encryptedBuf) });
    }

    const bundleBytes = encodeEncryptedBundle(envelopes);
    const { dataShards, parityShard, shardByteLength } = encodeXorRedundantShards(bundleBytes, dataShardCount);
    const allShards: { readonly kind: "data" | "parity"; readonly bytes: Uint8Array }[] = [
      ...dataShards.map((bytes) => ({ kind: "data" as const, bytes })),
      { kind: "parity" as const, bytes: parityShard },
    ];

    const assignments: P2pShardAssignment[] = [];
    for (let i = 0; i < allShards.length; i += 1) {
      const shardEntry = allShards[i];
      const peerId = this.network.peerIds[i];
      if (!shardEntry || !peerId) continue;
      const shardKey = `${options.snapshotId}:shard:${shardEntry.kind}:${i}`;
      const shardDigestHex = await computeContentDigestHex(shardEntry.bytes, hashAlgorithm);
      await this.network.putShard(peerId, shardKey, shardEntry.bytes);
      assignments.push({
        shardIndex: i,
        kind: shardEntry.kind,
        peerId,
        shardKey,
        shardDigestHex,
        byteLength: shardEntry.bytes.byteLength,
      });
    }

    return {
      snapshotId: options.snapshotId,
      createdAtIso: options.createdAtIso ?? new Date().toISOString(),
      hashAlgorithm,
      merkleRootHex: merkleTree.rootHex,
      totalPlaintextBytes: snapshotBytes.byteLength,
      chunkSizeBytes,
      chunkCount: chunks.length,
      dataShardCount,
      parityShardCount: 1,
      shardByteLength,
      shards: assignments,
      chunkProofs,
      serverStorageBytes: 0,
    };
  }

  async recoverSnapshot(manifest: P2pBackupManifest, key: CryptoKey): Promise<P2pRecoveryResult> {
    const subtle = getSubtleCrypto();
    if (!subtle) {
      return {
        ok: false,
        error: "decryption-failed",
        lostOrCorruptedPeerIds: [],
        detail: "WebCrypto SubtleCrypto API를 사용할 수 없습니다.",
      };
    }

    const dataShards: (Uint8Array | null)[] = new Array<Uint8Array | null>(manifest.dataShardCount).fill(null);
    let parityShard: Uint8Array | null = null;
    const lostOrCorruptedPeerIds: string[] = [];
    let healthyShardCount = 0;

    for (const assignment of manifest.shards) {
      let fetched: Uint8Array | null;
      try {
        fetched = await this.network.getShard(assignment.peerId, assignment.shardKey);
      } catch {
        // 피어의 전송 실패도 유실 샤드로 기록하고 나머지 피어와 패리티로 복구를 시도한다.
        lostOrCorruptedPeerIds.push(assignment.peerId);
        continue;
      }
      if (!fetched || fetched.byteLength !== assignment.byteLength) {
        lostOrCorruptedPeerIds.push(assignment.peerId);
        continue;
      }
      const actualDigest = await computeContentDigestHex(fetched, manifest.hashAlgorithm);
      if (actualDigest !== assignment.shardDigestHex) {
        lostOrCorruptedPeerIds.push(assignment.peerId);
        continue;
      }
      healthyShardCount += 1;
      if (assignment.kind === "parity") parityShard = fetched;
      else if (assignment.shardIndex >= 0 && assignment.shardIndex < manifest.dataShardCount) {
        dataShards[assignment.shardIndex] = fetched;
      }
    }

    const reconstructed = reconstructFromXorRedundantShards(dataShards, parityShard, manifest.shardByteLength);
    if (!reconstructed.ok) {
      return {
        ok: false,
        error: "insufficient-shards-for-recovery",
        lostOrCorruptedPeerIds,
        detail: `가용 샤드 부족: 정상 ${healthyShardCount}개 / 최소 ${manifest.dataShardCount}개 필요`,
      };
    }

    const envelopes = decodeEncryptedBundle(reconstructed.payload);
    if (!envelopes || envelopes.length !== manifest.chunkCount) {
      return {
        ok: false,
        error: "corrupted-bundle-format",
        lostOrCorruptedPeerIds,
        detail: "복원된 암호화 번들 포맷 또는 청크 수가 매니페스트와 일치하지 않습니다.",
      };
    }

    const decryptedChunks: Uint8Array[] = [];
    for (let i = 0; i < envelopes.length; i += 1) {
      const env = envelopes[i];
      const proof = manifest.chunkProofs[i];
      if (!env || !proof || env.chunkIndex !== i) {
        return {
          ok: false,
          error: "corrupted-bundle-format",
          lostOrCorruptedPeerIds,
          detail: `청크 인덱스 불일치: #${i}`,
        };
      }

      const aad = buildChunkAad(manifest.snapshotId, i, proof.leafDigestHex);
      let plainBuf: ArrayBuffer;
      try {
        plainBuf = await subtle.decrypt(
          { name: "AES-GCM", iv: toStrictArrayBuffer(env.iv), additionalData: toStrictArrayBuffer(aad) },
          key,
          toStrictArrayBuffer(env.ciphertext),
        );
      } catch {
        return {
          ok: false,
          error: "decryption-failed",
          lostOrCorruptedPeerIds,
          detail: `청크 #${i} AES-256-GCM 복호화 또는 인증 태그 검증 실패`,
        };
      }

      const plainBytes = new Uint8Array(plainBuf);
      const merkleCheck = await verifyMerkleProof(plainBytes, proof);
      if (!merkleCheck.valid || merkleCheck.computedRootHex !== manifest.merkleRootHex) {
        return {
          ok: false,
          error: "merkle-verification-failed",
          lostOrCorruptedPeerIds,
          detail: `청크 #${i} Merkle 루트 무결성 검증 실패`,
        };
      }
      decryptedChunks.push(plainBytes);
    }

    const combined = concatUint8Arrays(decryptedChunks).slice(0, manifest.totalPlaintextBytes);
    return {
      ok: true,
      data: combined,
      report: {
        snapshotId: manifest.snapshotId,
        merkleRootHex: manifest.merkleRootHex,
        recoveredFromParity: reconstructed.reconstructedShardIndex !== null,
        reconstructedShardIndex: reconstructed.reconstructedShardIndex,
        healthyShardCount,
        lostOrCorruptedPeerIds,
        verifiedChunkCount: decryptedChunks.length,
        totalPlaintextBytes: combined.byteLength,
        serverStorageBytes: 0,
      },
    };
  }
}
