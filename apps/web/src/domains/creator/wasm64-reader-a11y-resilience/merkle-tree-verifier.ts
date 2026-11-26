/**
 * 암호학적 이진 Merkle 트리 · 콘텐츠 주소 청킹 · 포함 증명(Inclusion Proof) 검증 모듈.
 *
 * - 도메인 분리(`0x00` 리프 / `0x01` 내부 노드)로 2차 역상 공격(Second-Preimage Attack)을 차단한다.
 * - WebCrypto `SHA-256`과 결정적 동기 `FNV-1a-128` 다이제스트를 모두 지원한다.
 */

export const BACKUP_DEFAULT_CHUNK_BYTES = 16384 as const;

export type MerkleHashAlgorithm = "sha-256" | "fnv1a-128";

export interface MerkleTree {
  readonly algorithm: MerkleHashAlgorithm;
  readonly chunkCount: number;
  readonly rootHex: string;
  readonly leafDigests: readonly string[];
  readonly levels: readonly (readonly string[])[];
}

export interface MerkleProofSibling {
  readonly position: "left" | "right";
  readonly digestHex: string;
}

export interface MerkleInclusionProof {
  readonly algorithm: MerkleHashAlgorithm;
  readonly leafIndex: number;
  readonly leafDigestHex: string;
  readonly rootHex: string;
  readonly siblings: readonly MerkleProofSibling[];
}

export interface MerkleVerificationResult {
  readonly valid: boolean;
  readonly algorithm: MerkleHashAlgorithm;
  readonly expectedRootHex: string;
  readonly computedRootHex: string;
  readonly leafDigestHex: string;
}

export function toStrictArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    out += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 0 ? hex : `0${hex}`;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16) || 0;
  }
  return out;
}

/**
 * 결정적 동기식 128비트 다중 시드 FNV-1a 다이제스트(32자리 16진 문자열)를 계산한다.
 */
export function computeFnv1a128Hex(bytes: Uint8Array): string {
  const seeds: readonly [number, number, number, number] = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const primes: readonly [number, number, number, number] = [0x01000193, 0x27d4eb2d, 0x165667b1, 0x01000193];
  const lanes = [seeds[0], seeds[1], seeds[2], seeds[3]];

  for (let i = 0; i < bytes.byteLength; i += 1) {
    const b = bytes[i] ?? 0;
    for (let lane = 0; lane < 4; lane += 1) {
      const mixed = ((lanes[lane] ?? 0) ^ ((b + lane * 31 + (i & 255)) & 255)) >>> 0;
      lanes[lane] = Math.imul(mixed, primes[lane] ?? 0x01000193) >>> 0;
    }
  }
  for (let round = 0; round < 3; round += 1) {
    for (let lane = 0; lane < 4; lane += 1) {
      const next = lanes[(lane + 1) % 4] ?? 0;
      const cur = ((lanes[lane] ?? 0) ^ (next >>> 13) ^ (next << 7)) >>> 0;
      lanes[lane] = Math.imul(cur, primes[lane] ?? 0x01000193) >>> 0;
    }
  }

  return lanes.map((v) => (v >>> 0).toString(16).padStart(8, "0")).join("");
}

export function getSubtleCrypto(): SubtleCrypto | null {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle) {
    return globalThis.crypto.subtle;
  }
  return null;
}

/**
 * 콘텐츠 바이트에 대해 SHA-256(WebCrypto) 또는 FNV-1a-128 다이제스트(hex)를 계산한다.
 */
export async function computeContentDigestHex(
  bytes: Uint8Array,
  algorithm: MerkleHashAlgorithm = "sha-256",
): Promise<string> {
  if (algorithm === "sha-256") {
    const subtle = getSubtleCrypto();
    if (subtle) {
      const digest = await subtle.digest("SHA-256", toStrictArrayBuffer(bytes));
      return bytesToHex(new Uint8Array(digest));
    }
  }
  return computeFnv1a128Hex(bytes);
}

async function hashMerkleLeaf(chunkBytes: Uint8Array, algorithm: MerkleHashAlgorithm): Promise<string> {
  const prefixed = new Uint8Array(1 + chunkBytes.byteLength);
  prefixed[0] = 0x00;
  prefixed.set(chunkBytes, 1);
  return computeContentDigestHex(prefixed, algorithm);
}

async function hashMerkleNode(leftHex: string, rightHex: string, algorithm: MerkleHashAlgorithm): Promise<string> {
  const left = hexToBytes(leftHex);
  const right = hexToBytes(rightHex);
  const combined = new Uint8Array(1 + left.byteLength + right.byteLength);
  combined[0] = 0x01;
  combined.set(left, 1);
  combined.set(right, 1 + left.byteLength);
  return computeContentDigestHex(combined, algorithm);
}

/**
 * 프로젝트 스냅샷 바이트를 고정 크기 콘텐츠 주소 청크 배열로 분할한다.
 */
export function splitIntoContentChunks(
  data: Uint8Array,
  chunkSizeBytes: number = BACKUP_DEFAULT_CHUNK_BYTES,
): readonly Uint8Array[] {
  const size = Math.max(64, Math.floor(chunkSizeBytes));
  if (data.byteLength === 0) return [new Uint8Array(0)];
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += size) {
    chunks.push(data.slice(offset, Math.min(data.byteLength, offset + size)));
  }
  return chunks;
}

/**
 * 청크 배열로부터 도메인 분리 이진 Merkle 트리를 구축한다.
 */
export async function buildMerkleTree(
  chunks: readonly Uint8Array[],
  algorithm: MerkleHashAlgorithm = "sha-256",
): Promise<MerkleTree> {
  const effectiveChunks = chunks.length > 0 ? chunks : [new Uint8Array(0)];
  const leafDigests = await Promise.all(effectiveChunks.map((chunk) => hashMerkleLeaf(chunk, algorithm)));
  const levels: string[][] = [leafDigests];

  let currentLevel = leafDigests;
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i] ?? "";
      const right = currentLevel[i + 1] ?? left;
      nextLevel.push(await hashMerkleNode(left, right, algorithm));
    }
    levels.push(nextLevel);
    currentLevel = nextLevel;
  }

  return {
    algorithm,
    chunkCount: effectiveChunks.length,
    rootHex: currentLevel[0] ?? "",
    leafDigests,
    levels,
  };
}

/**
 * 지정 청크 인덱스의 Merkle 포함 증명(형제 노드 경로)을 생성한다.
 */
export function getMerkleProof(tree: MerkleTree, leafIndex: number): MerkleInclusionProof {
  if (!Number.isInteger(leafIndex) || leafIndex < 0 || leafIndex >= tree.chunkCount) {
    throw new RangeError(`유효하지 않은 Merkle 리프 인덱스: ${leafIndex} (총 ${tree.chunkCount})`);
  }

  const siblings: MerkleProofSibling[] = [];
  let idx = leafIndex;
  for (let levelIdx = 0; levelIdx < tree.levels.length - 1; levelIdx += 1) {
    const level = tree.levels[levelIdx] ?? [];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : Math.min(idx + 1, level.length - 1);
    siblings.push({
      position: isRight ? "left" : "right",
      digestHex: level[siblingIdx] ?? "",
    });
    idx = Math.floor(idx / 2);
  }

  return {
    algorithm: tree.algorithm,
    leafIndex,
    leafDigestHex: tree.leafDigests[leafIndex] ?? "",
    rootHex: tree.rootHex,
    siblings,
  };
}

/**
 * 청크 바이트가 Merkle 포함 증명과 루트 해시에 비트 단위로 일치하는지 검증한다.
 */
export async function verifyMerkleProof(
  chunkBytes: Uint8Array,
  proof: MerkleInclusionProof,
): Promise<MerkleVerificationResult> {
  const leafDigestHex = await hashMerkleLeaf(chunkBytes, proof.algorithm);
  let computed = leafDigestHex;

  for (const sibling of proof.siblings) {
    computed =
      sibling.position === "left"
        ? await hashMerkleNode(sibling.digestHex, computed, proof.algorithm)
        : await hashMerkleNode(computed, sibling.digestHex, proof.algorithm);
  }

  return {
    valid: computed === proof.rootHex && leafDigestHex === proof.leafDigestHex,
    algorithm: proof.algorithm,
    expectedRootHex: proof.rootHex,
    computedRootHex: computed,
    leafDigestHex,
  };
}
