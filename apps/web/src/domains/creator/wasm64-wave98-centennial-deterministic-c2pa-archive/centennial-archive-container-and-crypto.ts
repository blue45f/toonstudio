/**
 * Wave 98 — 100년 보존형 결정론적 아카이브 컨테이너(`TSVA` v1) 코덱 및 암호·Merkle 파사드.
 *
 * - 빅엔디안 고정 64바이트 헤더 + 콘텐츠 주소 지정 청크 TOC + 32바이트 Merkle 루트
 * - 1바이트 비트 반전, 절단, 꼬리 바이트, 필수 보존 에셋 누락, 외부 URL 혼입을 모두 fail-closed 차단
 */

import {
  CentennialArchiveError,
  buildCentennialMerkleTree,
  bytesToHexCentennial,
  constantTimeEqualHex,
  crc32Centennial,
  decodeUtf8Centennial,
  encodeUtf8Centennial,
  hexToBytesCentennial,
  sha256CentennialBytes,
  sha256CentennialHex,
  type CentennialMerkleTree,
} from "./centennial-crypto-primitives";

export {
  CentennialArchiveError,
  buildCentennialMerkleTree,
  bytesToHexCentennial,
  canonicalSerializeCentennial,
  constantTimeEqualHex,
  crc32Centennial,
  decodeUtf8Centennial,
  encodeUtf8Centennial,
  generateCentennialMerkleProof,
  hexToBytesCentennial,
  hmacSha256CentennialBytes,
  hmacSha256CentennialHex,
  sha256CentennialBytes,
  sha256CentennialHex,
  verifyCentennialMerkleProof,
  type CentennialArchiveErrorCode,
  type CentennialMerkleProof,
  type CentennialMerkleProofStep,
  type CentennialMerkleTree,
} from "./centennial-crypto-primitives";

export const TSVA_MAGIC_ASCII = "TSVA";
export const TSVA_FORMAT_VERSION = 1;
export const TSVA_HEADER_LENGTH = 64;
export const TSVA_FLAG_HAS_PARITY_ECC = 1;

export type CentennialChunkKind =
  | "panel-master-layer"
  | "embedded-font-subset"
  | "icc-color-profile"
  | "wasm-renderer-pin"
  | "rights-bom-snapshot"
  | "c2pa-provenance-ledger"
  | "parity-ecc-block";

export type CentennialChunkEncoding = "raw-binary" | "canonical-json-utf8" | "utf8-text";

export const MANDATORY_PRESERVATION_CHUNK_KINDS: readonly CentennialChunkKind[] = [
  "embedded-font-subset",
  "icc-color-profile",
  "wasm-renderer-pin",
];

const CHUNK_KIND_TO_CODE: Readonly<Record<CentennialChunkKind, number>> = {
  "panel-master-layer": 1,
  "embedded-font-subset": 2,
  "icc-color-profile": 3,
  "wasm-renderer-pin": 4,
  "rights-bom-snapshot": 5,
  "c2pa-provenance-ledger": 6,
  "parity-ecc-block": 7,
};

const CODE_TO_CHUNK_KIND: Readonly<Record<number, CentennialChunkKind>> = {
  1: "panel-master-layer",
  2: "embedded-font-subset",
  3: "icc-color-profile",
  4: "wasm-renderer-pin",
  5: "rights-bom-snapshot",
  6: "c2pa-provenance-ledger",
  7: "parity-ecc-block",
};

const ENCODING_TO_CODE: Readonly<Record<CentennialChunkEncoding, number>> = {
  "raw-binary": 0,
  "canonical-json-utf8": 1,
  "utf8-text": 2,
};

const CODE_TO_ENCODING: Readonly<Record<number, CentennialChunkEncoding>> = {
  0: "raw-binary",
  1: "canonical-json-utf8",
  2: "utf8-text",
};

export interface CentennialArchiveChunkInput {
  readonly kind: CentennialChunkKind;
  readonly chunkId: string;
  readonly mediaType: string;
  readonly encoding: CentennialChunkEncoding;
  readonly payload: Uint8Array;
}

export interface DecodedCentennialChunk {
  readonly index: number;
  readonly kind: CentennialChunkKind;
  readonly chunkId: string;
  readonly mediaType: string;
  readonly encoding: CentennialChunkEncoding;
  readonly payloadOffset: number;
  readonly payloadLength: number;
  readonly contentSha256Hex: string;
  readonly payload: Uint8Array;
}

export interface DecodedCentennialArchive {
  readonly magic: typeof TSVA_MAGIC_ASCII;
  readonly version: number;
  readonly headerLength: number;
  readonly totalLength: number;
  readonly chunkCount: number;
  readonly flags: number;
  readonly tocLength: number;
  readonly merkleRootHex: string;
  readonly bodyCrc32: number;
  readonly headerCrc32: number;
  readonly chunks: readonly DecodedCentennialChunk[];
  readonly merkleTree: CentennialMerkleTree;
}

/** 아카이브 바이트 내부에서 외부 네트워크 URL(`http://`, `https://`) 탐지. */
export function detectExternalNetworkUrls(bytes: Uint8Array): readonly string[] {
  let ascii = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : " ";
  }
  const matches = ascii.match(/https?:\/\/[^\s"'<>)\]}]+/gi);
  return matches ? Array.from(new Set(matches)) : [];
}

/** 청크 메타데이터와 페이로드 SHA-256을 결합한 결정론적 Merkle 리프 페이로드 생성. */
export function buildCentennialChunkMerkleLeaf(chunk: {
  readonly kind: CentennialChunkKind;
  readonly chunkId: string;
  readonly mediaType: string;
  readonly encoding: CentennialChunkEncoding;
  readonly contentSha256Hex: string;
  readonly payloadLength: number;
}): Uint8Array {
  const prefix = encodeUtf8Centennial(
    `${chunk.kind}\u0000${chunk.chunkId}\u0000${chunk.mediaType}\u0000${chunk.encoding}\u0000`,
  );
  const hashBytes = hexToBytesCentennial(chunk.contentSha256Hex);
  const leaf = new Uint8Array(prefix.length + 36);
  leaf.set(prefix, 0);
  leaf.set(hashBytes, prefix.length);
  new DataView(leaf.buffer).setUint32(prefix.length + 32, chunk.payloadLength >>> 0, false);
  return leaf;
}

/** 데이터 청크 집합에 대한 바이트 단위 XOR 패리티 ECC 블록 계산. */
export function computeXorParityEccBlock(payloads: readonly Uint8Array[]): Uint8Array {
  let maxLen = 0;
  for (let i = 0; i < payloads.length; i += 1) {
    if (payloads[i].length > maxLen) {
      maxLen = payloads[i].length;
    }
  }
  const parity = new Uint8Array(maxLen);
  for (let i = 0; i < payloads.length; i += 1) {
    const src = payloads[i];
    for (let j = 0; j < src.length; j += 1) {
      parity[j] ^= src[j];
    }
  }
  return parity;
}

function assertMandatoryAssetsPresent(kinds: ReadonlySet<CentennialChunkKind>): void {
  for (let i = 0; i < MANDATORY_PRESERVATION_CHUNK_KINDS.length; i += 1) {
    const requiredKind = MANDATORY_PRESERVATION_CHUNK_KINDS[i];
    if (!kinds.has(requiredKind)) {
      throw new CentennialArchiveError(
        "MISSING_MANDATORY_ASSET",
        `100년 보존 필수 에셋 청크가 누락되었습니다: ${requiredKind}`,
      );
    }
  }
}

function assertNoExternalUrls(
  chunkId: string,
  mediaType: string,
  payload: Uint8Array,
  offset?: number,
): void {
  const idUrls = detectExternalNetworkUrls(encodeUtf8Centennial(`${chunkId} ${mediaType}`));
  if (idUrls.length > 0) {
    throw new CentennialArchiveError(
      "EXTERNAL_URL_FORBIDDEN",
      `청크 메타데이터에 외부 URL이 포함되었습니다: ${idUrls[0]}`,
      offset,
    );
  }
  const bodyUrls = detectExternalNetworkUrls(payload);
  if (bodyUrls.length > 0) {
    throw new CentennialArchiveError(
      "EXTERNAL_URL_FORBIDDEN",
      `청크 '${chunkId}' 내부에 미내장 외부 URL이 발견되었습니다: ${bodyUrls[0]}`,
      offset,
    );
  }
}

/** 자체 서술 결정론적 `TSVA` v1 바이너리 아카이브 인코딩(입력 순서 무관 비트 동일 출력). */
export function encodeCentennialArchive(chunks: readonly CentennialArchiveChunkInput[]): Uint8Array {
  if (chunks.length === 0) {
    throw new CentennialArchiveError("EMPTY_ARCHIVE", "인코딩할 아카이브 청크가 비어 있습니다.");
  }

  const normalized = chunks.slice().sort((a, b) => {
    const codeDiff = CHUNK_KIND_TO_CODE[a.kind] - CHUNK_KIND_TO_CODE[b.kind];
    if (codeDiff !== 0) {
      return codeDiff;
    }
    return a.chunkId < b.chunkId ? -1 : a.chunkId > b.chunkId ? 1 : 0;
  });

  const seenKeys = new Set<string>();
  const seenKinds = new Set<CentennialChunkKind>();
  let hasParityEcc = false;

  const prepared: {
    readonly input: CentennialArchiveChunkInput;
    readonly idBytes: Uint8Array;
    readonly mediaTypeBytes: Uint8Array;
    readonly sha256Bytes: Uint8Array;
    readonly merkleLeaf: Uint8Array;
  }[] = [];
  let tocLength = 0;
  let totalPayloadLength = 0;

  for (let i = 0; i < normalized.length; i += 1) {
    const chunk = normalized[i];
    const dedupeKey = `${chunk.kind}::${chunk.chunkId}`;
    if (seenKeys.has(dedupeKey)) {
      throw new CentennialArchiveError("DUPLICATE_CHUNK_ID", `중복 청크 식별자: ${dedupeKey}`);
    }
    seenKeys.add(dedupeKey);
    seenKinds.add(chunk.kind);
    if (chunk.kind === "parity-ecc-block") {
      hasParityEcc = true;
    }
    assertNoExternalUrls(chunk.chunkId, chunk.mediaType, chunk.payload);

    const idBytes = encodeUtf8Centennial(chunk.chunkId);
    const mediaTypeBytes = encodeUtf8Centennial(chunk.mediaType);
    const sha256Bytes = sha256CentennialBytes(chunk.payload);
    const merkleLeaf = buildCentennialChunkMerkleLeaf({
      kind: chunk.kind,
      chunkId: chunk.chunkId,
      mediaType: chunk.mediaType,
      encoding: chunk.encoding,
      contentSha256Hex: bytesToHexCentennial(sha256Bytes),
      payloadLength: chunk.payload.length,
    });
    tocLength += 46 + idBytes.length + mediaTypeBytes.length;
    totalPayloadLength += chunk.payload.length;
    prepared.push({ input: chunk, idBytes, mediaTypeBytes, sha256Bytes, merkleLeaf });
  }

  assertMandatoryAssetsPresent(seenKinds);

  const merkleTree = buildCentennialMerkleTree(prepared.map((p) => p.merkleLeaf));
  const totalLength = TSVA_HEADER_LENGTH + tocLength + totalPayloadLength;
  const archive = new Uint8Array(totalLength);
  const view = new DataView(archive.buffer);

  let tocCursor = TSVA_HEADER_LENGTH;
  let payloadCursor = TSVA_HEADER_LENGTH + tocLength;
  for (let i = 0; i < prepared.length; i += 1) {
    const item = prepared[i];
    archive[tocCursor] = CHUNK_KIND_TO_CODE[item.input.kind];
    archive[tocCursor + 1] = ENCODING_TO_CODE[item.input.encoding];
    view.setUint16(tocCursor + 2, item.idBytes.length, false);
    view.setUint16(tocCursor + 4, item.mediaTypeBytes.length, false);
    view.setUint32(tocCursor + 6, payloadCursor >>> 0, false);
    view.setUint32(tocCursor + 10, item.input.payload.length >>> 0, false);
    archive.set(item.sha256Bytes, tocCursor + 14);
    archive.set(item.idBytes, tocCursor + 46);
    archive.set(item.mediaTypeBytes, tocCursor + 46 + item.idBytes.length);
    archive.set(item.input.payload, payloadCursor);
    tocCursor += 46 + item.idBytes.length + item.mediaTypeBytes.length;
    payloadCursor += item.input.payload.length;
  }

  const bodyCrc32 = crc32Centennial(archive.subarray(TSVA_HEADER_LENGTH));
  archive[0] = 0x54;
  archive[1] = 0x53;
  archive[2] = 0x56;
  archive[3] = 0x41;
  view.setUint16(4, TSVA_FORMAT_VERSION, false);
  view.setUint16(6, TSVA_HEADER_LENGTH, false);
  view.setUint32(8, totalLength >>> 0, false);
  view.setUint32(12, prepared.length >>> 0, false);
  archive.set(merkleTree.rootBytes, 16);
  view.setUint32(48, hasParityEcc ? TSVA_FLAG_HAS_PARITY_ECC : 0, false);
  view.setUint32(52, tocLength >>> 0, false);
  view.setUint32(56, bodyCrc32 >>> 0, false);
  view.setUint32(60, crc32Centennial(archive.subarray(0, 60)) >>> 0, false);
  return archive;
}

/** `TSVA` v1 바이너리 아카이브 fail-closed 디코딩 및 무결성 전수 검증. */
export function decodeCentennialArchive(bytes: Uint8Array): DecodedCentennialArchive {
  if (bytes.length < TSVA_HEADER_LENGTH) {
    throw new CentennialArchiveError("TRUNCATED_ARCHIVE", `최소 헤더(${TSVA_HEADER_LENGTH}B) 미달`, bytes.length);
  }
  if (bytes[0] !== 0x54 || bytes[1] !== 0x53 || bytes[2] !== 0x56 || bytes[3] !== 0x41) {
    throw new CentennialArchiveError("INVALID_MAGIC", "TSVA v1 매직 바이트가 일치하지 않습니다.", 0);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const expectedHeaderCrc = view.getUint32(60, false);
  if (crc32Centennial(bytes.subarray(0, 60)) !== expectedHeaderCrc) {
    throw new CentennialArchiveError("HEADER_CRC_MISMATCH", "헤더 CRC-32 검증 실패", 60);
  }

  const version = view.getUint16(4, false);
  if (version !== TSVA_FORMAT_VERSION) {
    throw new CentennialArchiveError("UNSUPPORTED_VERSION", `지원하지 않는 TSVA 버전: ${version}`, 4);
  }
  const headerLength = view.getUint16(6, false);
  if (headerLength !== TSVA_HEADER_LENGTH) {
    throw new CentennialArchiveError("HEADER_CRC_MISMATCH", `비정상 헤더 길이: ${headerLength}`, 6);
  }
  const totalLength = view.getUint32(8, false);
  if (bytes.length < totalLength) {
    throw new CentennialArchiveError("TRUNCATED_ARCHIVE", `아카이브 절단(기대 ${totalLength}B, 실제 ${bytes.length}B)`, bytes.length);
  }
  if (bytes.length > totalLength) {
    throw new CentennialArchiveError("TRAILING_BYTES", `허가되지 않은 꼬리 바이트 감지(${bytes.length - totalLength}B)`, totalLength);
  }

  const chunkCount = view.getUint32(12, false);
  if (chunkCount === 0) {
    throw new CentennialArchiveError("EMPTY_ARCHIVE", "청크 개수가 0입니다.", 12);
  }
  const headerMerkleRootHex = bytesToHexCentennial(bytes.subarray(16, 48));
  const flags = view.getUint32(48, false);
  const tocLength = view.getUint32(52, false);
  const expectedBodyCrc = view.getUint32(56, false);
  if (headerLength + tocLength > totalLength) {
    throw new CentennialArchiveError("TRUNCATED_ARCHIVE", "TOC 길이가 전체 길이를 초과합니다.", 52);
  }
  if (crc32Centennial(bytes.subarray(headerLength)) !== expectedBodyCrc) {
    throw new CentennialArchiveError("BODY_CRC_MISMATCH", "본문 CRC-32 무결성 검증 실패", headerLength);
  }

  let tocCursor = headerLength;
  const tocEnd = headerLength + tocLength;
  let expectedPayloadOffset = tocEnd;
  const chunks: DecodedCentennialChunk[] = [];
  const merkleLeaves: Uint8Array[] = [];
  const seenKeys = new Set<string>();
  const seenKinds = new Set<CentennialChunkKind>();

  for (let i = 0; i < chunkCount; i += 1) {
    if (tocCursor + 46 > tocEnd) {
      throw new CentennialArchiveError("TRUNCATED_ARCHIVE", "청크 TOC 헤더가 절단되었습니다.", tocCursor);
    }
    const kind = CODE_TO_CHUNK_KIND[bytes[tocCursor]];
    if (!kind) {
      throw new CentennialArchiveError("INVALID_CHUNK_KIND", `알 수 없는 청크 코드: ${bytes[tocCursor]}`, tocCursor);
    }
    const encoding = CODE_TO_ENCODING[bytes[tocCursor + 1]];
    if (!encoding) {
      throw new CentennialArchiveError("INVALID_CHUNK_ENCODING", `알 수 없는 인코딩 코드: ${bytes[tocCursor + 1]}`, tocCursor + 1);
    }
    const idLen = view.getUint16(tocCursor + 2, false);
    const mediaLen = view.getUint16(tocCursor + 4, false);
    const payloadOffset = view.getUint32(tocCursor + 6, false);
    const payloadLength = view.getUint32(tocCursor + 10, false);
    const expectedShaHex = bytesToHexCentennial(bytes.subarray(tocCursor + 14, tocCursor + 46));
    const entryEnd = tocCursor + 46 + idLen + mediaLen;
    if (entryEnd > tocEnd) {
      throw new CentennialArchiveError("TRUNCATED_ARCHIVE", "청크 TOC 문자열이 절단되었습니다.", tocCursor);
    }

    const chunkId = decodeUtf8Centennial(bytes.subarray(tocCursor + 46, tocCursor + 46 + idLen));
    const mediaType = decodeUtf8Centennial(bytes.subarray(tocCursor + 46 + idLen, entryEnd));
    const dedupeKey = `${kind}::${chunkId}`;
    if (seenKeys.has(dedupeKey)) {
      throw new CentennialArchiveError("DUPLICATE_CHUNK_ID", `중복 청크 식별자: ${dedupeKey}`, tocCursor);
    }
    seenKeys.add(dedupeKey);
    seenKinds.add(kind);

    if (payloadOffset !== expectedPayloadOffset || payloadOffset + payloadLength > totalLength) {
      throw new CentennialArchiveError("INVALID_CHUNK_OFFSET", `청크 '${chunkId}' 오프셋 규칙 위반`, tocCursor + 6);
    }
    const payload = bytes.slice(payloadOffset, payloadOffset + payloadLength);
    const actualShaHex = sha256CentennialHex(payload);
    if (!constantTimeEqualHex(actualShaHex, expectedShaHex)) {
      throw new CentennialArchiveError("CHUNK_HASH_MISMATCH", `청크 '${chunkId}' SHA-256 불일치`, payloadOffset);
    }
    assertNoExternalUrls(chunkId, mediaType, payload, payloadOffset);

    merkleLeaves.push(
      buildCentennialChunkMerkleLeaf({ kind, chunkId, mediaType, encoding, contentSha256Hex: actualShaHex, payloadLength }),
    );
    chunks.push({ index: i, kind, chunkId, mediaType, encoding, payloadOffset, payloadLength, contentSha256Hex: actualShaHex, payload });
    tocCursor = entryEnd;
    expectedPayloadOffset += payloadLength;
  }

  if (tocCursor !== tocEnd || expectedPayloadOffset !== totalLength) {
    throw new CentennialArchiveError("TRAILING_BYTES", "TOC 또는 페이로드 끝에 미사용 바이트가 있습니다.", expectedPayloadOffset);
  }
  assertMandatoryAssetsPresent(seenKinds);

  const merkleTree = buildCentennialMerkleTree(merkleLeaves);
  if (!constantTimeEqualHex(merkleTree.rootHex, headerMerkleRootHex)) {
    throw new CentennialArchiveError("MERKLE_ROOT_MISMATCH", "헤더 Merkle 루트가 일치하지 않습니다.", 16);
  }

  return {
    magic: TSVA_MAGIC_ASCII,
    version,
    headerLength,
    totalLength,
    chunkCount,
    flags,
    tocLength,
    merkleRootHex: headerMerkleRootHex,
    bodyCrc32: expectedBodyCrc,
    headerCrc32: expectedHeaderCrc,
    chunks,
    merkleTree,
  };
}
