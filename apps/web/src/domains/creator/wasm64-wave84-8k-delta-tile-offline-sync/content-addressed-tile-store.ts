/**
 * Wave 84 — 256×256 콘텐츠 주소 지정(Content-Addressed) 타일 머클 저장소.
 *
 * - 외부 무의존 순수 동기 FIPS 180-4 SHA-256 (`sha256Bytes`, `sha256TileHex`)
 * - 결정론적 PackBits + XOR 델타 타일 무손실 압축/복원 (`compressTileDelta`, `decompressTileDelta`)
 * - 8K 캔버스(`8192×8192`, `32×32 = 1024` 타일) 희소 매니페스트 및 빈 타일 단일 해시 중복 제거
 * - 모든 타일 읽기·쓰기 경로에서 SHA-256 무결성을 검증해 1바이트 변조도 즉시 차단(fail-closed)
 */

export const DEFAULT_CANVAS_WIDTH_PX = 8192;
export const DEFAULT_CANVAS_HEIGHT_PX = 8192;
export const DEFAULT_TILE_SIZE_PX = 256;
export const BYTES_PER_PIXEL_RGBA = 4;

const DELTA_MAGIC = [0x54, 0x38, 0x34, 0x44] as const; // "T84D"
const DELTA_FORMAT_VERSION = 1;
const DELTA_HEADER_BYTES = 12;
const FLAG_XOR_BASE = 0x01;
const PACKBITS_EXTENDED_RUN_OPCODE = 0x80;

const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

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

export type TileIntegrityErrorCode =
  | "PAYLOAD_HASH_MISMATCH" | "BASE_HASH_MISMATCH" | "BASE_TILE_MISSING" | "TARGET_HASH_MISMATCH"
  | "CORRUPT_PACKBITS_STREAM" | "INVALID_TILE_LENGTH" | "TILE_OUT_OF_BOUNDS" | "BLOB_MISSING";

export interface TileCoord { readonly layerId: string; readonly tileX: number; readonly tileY: number; }

export interface CompressedTileDeltaBlob {
  readonly encoding: "packbits-xor-v1";
  readonly rawByteLength: number;
  readonly baseTileHash: string | null;
  readonly targetTileHash: string;
  readonly payloadHash: string;
  readonly compressedBytes: Uint8Array;
}

export interface TileIntegrityFailure { readonly ok: false; readonly code: TileIntegrityErrorCode; readonly message: string; }
export type TileDecompressionResult = { readonly ok: true; readonly tileBytes: Uint8Array } | TileIntegrityFailure;
export type TileReadResult = { readonly ok: true; readonly tileHash: string; readonly pixels: Uint8Array } | TileIntegrityFailure;

export interface TileCanvasStoreOptions {
  readonly canvasId?: string;
  readonly width?: number;
  readonly height?: number;
  readonly tileSize?: number;
  readonly layerIds?: readonly string[];
  /** 영속 저장소(OPFS 등) 또는 무결성 감사 주입용 외부 블롭 맵. */
  readonly backingBlobs?: Map<string, CompressedTileDeltaBlob>;
}

export interface TileCanvasManifest {
  readonly canvasId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly blankTileHash: string;
  readonly layerIds: readonly string[];
  readonly nonBlankTiles: Readonly<Record<string, string>>;
  readonly totalTileSlots: number;
  readonly nonBlankTileCount: number;
  readonly uniqueBlobCount: number;
  readonly merkleRoot: string;
}

export interface TileWriteReceipt {
  readonly coord: TileCoord;
  readonly tileKey: string;
  readonly previousHash: string;
  readonly nextHash: string;
  readonly changed: boolean;
  readonly rawTileBytes: number;
  readonly compressedDeltaBytes: number;
  readonly deltaBlob: CompressedTileDeltaBlob;
}

export interface BrushStrokeTileResult {
  readonly touchedTiles: readonly TileWriteReceipt[];
  readonly merkleRoot: string;
  readonly totalDeltaWireBytes: number;
}

export interface StoreIntegrityAuditReport {
  readonly ok: boolean;
  readonly verifiedBlobCount: number;
  readonly corruptedHashes: readonly string[];
  readonly missingReferencedHashes: readonly string[];
}

function failIntegrity(code: TileIntegrityErrorCode, message: string): TileIntegrityFailure {
  return { ok: false, code, message };
}

function utf8Encode(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
        i += 1;
      }
    }
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 0x3f), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(bytes);
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  return hex;
}

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** FIPS 180-4 SHA-256 해시를 순수 동기로 계산해 32바이트 Uint8Array를 반환한다. */
export function sha256Bytes(input: Uint8Array | string): Uint8Array {
  const data = typeof input === "string" ? utf8Encode(input) : input;
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = SHA256_H0[0] ?? 0; let h1 = SHA256_H0[1] ?? 0; let h2 = SHA256_H0[2] ?? 0; let h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0; let h5 = SHA256_H0[5] ?? 0; let h6 = SHA256_H0[6] ?? 0; let h7 = SHA256_H0[7] ?? 0;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0; const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const bigS1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + bigS1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const bigS0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (bigS0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const outView = new DataView(digest.buffer);
  outView.setUint32(0, h0, false); outView.setUint32(4, h1, false); outView.setUint32(8, h2, false); outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false); outView.setUint32(20, h5, false); outView.setUint32(24, h6, false); outView.setUint32(28, h7, false);
  return digest;
}

/** 타일 바이트 배열 또는 문자열의 64자리 소문자 SHA-256 해시를 반환한다. */
export function sha256TileHex(input: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(input));
}

/** 상수 시간 문자열 비교로 SHA-256 다이제스트 일치 여부를 검사한다. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function makeTileKey(layerId: string, tileX: number, tileY: number): string {
  return `${layerId}:${tileX}:${tileY}`;
}

export function parseTileKey(tileKey: string): TileCoord | null {
  const lastColon = tileKey.lastIndexOf(":");
  const prevColon = lastColon > 0 ? tileKey.lastIndexOf(":", lastColon - 1) : -1;
  if (prevColon <= 0) return null;
  const tileX = Number(tileKey.slice(prevColon + 1, lastColon));
  const tileY = Number(tileKey.slice(lastColon + 1));
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY) || tileX < 0 || tileY < 0) return null;
  return { layerId: tileKey.slice(0, prevColon), tileX, tileY };
}

function encodePackBitsWithExtendedRuns(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  const len = data.length;
  let i = 0;
  while (i < len) {
    const current = data[i] ?? 0;
    let runLen = 1;
    while (i + runLen < len && runLen < 65536 && (data[i + runLen] ?? 0) === current) runLen += 1;
    if (runLen >= 3) {
      if (runLen <= 128) out.push(257 - runLen, current);
      else out.push(PACKBITS_EXTENDED_RUN_OPCODE, ((runLen - 1) >>> 8) & 0xff, (runLen - 1) & 0xff, current);
      i += runLen;
      continue;
    }
    const start = i;
    let lit = 0;
    while (i < len && lit < 128) {
      const cur = data[i] ?? 0;
      if (i + 2 < len && (data[i + 1] ?? 0) === cur && (data[i + 2] ?? 0) === cur) break;
      i += 1; lit += 1;
    }
    out.push(lit - 1);
    for (let k = 0; k < lit; k += 1) out.push(data[start + k] ?? 0);
  }
  return new Uint8Array(out);
}

function decodePackBitsWithExtendedRuns(encoded: Uint8Array, startOffset: number, expectedLength: number): Uint8Array | null {
  const out = new Uint8Array(expectedLength);
  let src = startOffset;
  let dst = 0;
  while (src < encoded.length) {
    const control = encoded[src++] ?? 0;
    if (control <= 127) {
      const count = control + 1;
      if (src + count > encoded.length || dst + count > expectedLength) return null;
      out.set(encoded.subarray(src, src + count), dst);
      src += count; dst += count;
    } else if (control === PACKBITS_EXTENDED_RUN_OPCODE) {
      if (src + 3 > encoded.length) return null;
      const count = (((encoded[src] ?? 0) << 8) | (encoded[src + 1] ?? 0)) + 1;
      const val = encoded[src + 2] ?? 0;
      src += 3;
      if (dst + count > expectedLength) return null;
      out.fill(val, dst, dst + count); dst += count;
    } else {
      if (src >= encoded.length) return null;
      const count = 257 - control;
      const val = encoded[src++] ?? 0;
      if (dst + count > expectedLength) return null;
      out.fill(val, dst, dst + count); dst += count;
    }
  }
  return dst === expectedLength ? out : null;
}

/** 기준 타일(`baseTileBytes`) 대비 현재 타일(`targetTileBytes`)을 XOR + 확장 PackBits로 무손실 압축한다. */
export function compressTileDelta(targetTileBytes: Uint8Array, baseTileBytes: Uint8Array | null = null): CompressedTileDeltaBlob {
  if (baseTileBytes !== null && baseTileBytes.length !== targetTileBytes.length) {
    throw new Error(`기준 타일 길이(${baseTileBytes.length})와 대상 타일 길이(${targetTileBytes.length})가 다릅니다.`);
  }
  const rawLen = targetTileBytes.length;
  const deltaBuf = new Uint8Array(rawLen);
  if (baseTileBytes !== null) {
    for (let i = 0; i < rawLen; i += 1) deltaBuf[i] = (targetTileBytes[i] ?? 0) ^ (baseTileBytes[i] ?? 0);
  } else {
    deltaBuf.set(targetTileBytes);
  }
  const packed = encodePackBitsWithExtendedRuns(deltaBuf);
  const compressedBytes = new Uint8Array(DELTA_HEADER_BYTES + packed.length);
  compressedBytes[0] = DELTA_MAGIC[0]; compressedBytes[1] = DELTA_MAGIC[1];
  compressedBytes[2] = DELTA_MAGIC[2]; compressedBytes[3] = DELTA_MAGIC[3];
  compressedBytes[4] = DELTA_FORMAT_VERSION;
  compressedBytes[5] = baseTileBytes !== null ? FLAG_XOR_BASE : 0;
  new DataView(compressedBytes.buffer).setUint32(6, rawLen >>> 0, false);
  compressedBytes.set(packed, DELTA_HEADER_BYTES);

  return {
    encoding: "packbits-xor-v1",
    rawByteLength: rawLen,
    baseTileHash: baseTileBytes !== null ? sha256TileHex(baseTileBytes) : null,
    targetTileHash: sha256TileHex(targetTileBytes),
    payloadHash: sha256TileHex(compressedBytes),
    compressedBytes,
  };
}

/** 압축된 타일 델타 블롭을 복원하면서 페이로드·기준 타일·복원 픽셀의 SHA-256 무결성을 모두 검증한다. */
export function decompressTileDelta(blob: CompressedTileDeltaBlob, baseTileBytes: Uint8Array | null = null): TileDecompressionResult {
  if (!constantTimeEqualHex(sha256TileHex(blob.compressedBytes), blob.payloadHash)) {
    return failIntegrity("PAYLOAD_HASH_MISMATCH", "압축 타일 페이로드의 SHA-256 해시가 일치하지 않아 복원을 차단했습니다.");
  }
  if (
    blob.compressedBytes.length < DELTA_HEADER_BYTES ||
    blob.compressedBytes[0] !== DELTA_MAGIC[0] || blob.compressedBytes[1] !== DELTA_MAGIC[1] ||
    blob.compressedBytes[2] !== DELTA_MAGIC[2] || blob.compressedBytes[3] !== DELTA_MAGIC[3] ||
    blob.compressedBytes[4] !== DELTA_FORMAT_VERSION
  ) {
    return failIntegrity("CORRUPT_PACKBITS_STREAM", "타일 델타 헤더 매직 또는 형식이 손상되었습니다.");
  }
  const view = new DataView(blob.compressedBytes.buffer, blob.compressedBytes.byteOffset, blob.compressedBytes.byteLength);
  if (view.getUint32(6, false) !== blob.rawByteLength) {
    return failIntegrity("CORRUPT_PACKBITS_STREAM", "헤더의 원본 바이트 길이와 메타데이터가 어긋납니다.");
  }
  const usesXorBase = ((blob.compressedBytes[5] ?? 0) & FLAG_XOR_BASE) !== 0;
  if (usesXorBase || blob.baseTileHash !== null) {
    if (baseTileBytes === null) return failIntegrity("BASE_TILE_MISSING", "XOR 델타 복원에 필요한 기준 타일이 없습니다.");
    if (baseTileBytes.length !== blob.rawByteLength) return failIntegrity("INVALID_TILE_LENGTH", "기준 타일 바이트 길이가 복원 대상과 다릅니다.");
    if (blob.baseTileHash !== null && !constantTimeEqualHex(sha256TileHex(baseTileBytes), blob.baseTileHash)) {
      return failIntegrity("BASE_HASH_MISMATCH", "기준 타일의 SHA-256 해시가 예상값과 다릅니다.");
    }
  }
  const decoded = decodePackBitsWithExtendedRuns(blob.compressedBytes, DELTA_HEADER_BYTES, blob.rawByteLength);
  if (decoded === null) return failIntegrity("CORRUPT_PACKBITS_STREAM", "PackBits 스트림 구조가 손상되어 타일을 복원할 수 없습니다.");
  if (usesXorBase && baseTileBytes !== null) {
    for (let i = 0; i < decoded.length; i += 1) decoded[i] = (decoded[i] ?? 0) ^ (baseTileBytes[i] ?? 0);
  }
  if (!constantTimeEqualHex(sha256TileHex(decoded), blob.targetTileHash)) {
    return failIntegrity("TARGET_HASH_MISMATCH", "복원된 타일 픽셀의 SHA-256 해시가 기대값과 다릅니다.");
  }
  return { ok: true, tileBytes: decoded };
}

export function cloneDeltaBlob(blob: CompressedTileDeltaBlob): CompressedTileDeltaBlob {
  return { ...blob, compressedBytes: new Uint8Array(blob.compressedBytes) };
}

/** 희소 타일 매니페스트의 결정론적 이진 머클 루트 SHA-256 다이제스트를 계산한다. */
export function computeTileManifestMerkleRoot(params: {
  readonly canvasId: string;
  readonly width: number;
  readonly height: number;
  readonly tileSize: number;
  readonly blankTileHash: string;
  readonly layerIds: readonly string[];
  readonly nonBlankTiles: Readonly<Record<string, string>>;
}): string {
  const sortedLayers = params.layerIds.slice().sort();
  const metaLeaf = sha256TileHex(
    `wave84:manifest-meta:${params.canvasId}:${params.width}x${params.height}:${params.tileSize}:${params.blankTileHash}:${sortedLayers.join(",")}`,
  );
  const leaves: string[] = [metaLeaf];
  const sortedKeys = Object.keys(params.nonBlankTiles).sort();
  for (let i = 0; i < sortedKeys.length; i += 1) {
    const key = sortedKeys[i] ?? "";
    const hash = params.nonBlankTiles[key];
    if (hash && !constantTimeEqualHex(hash, params.blankTileHash)) leaves.push(sha256TileHex(`wave84:tile-leaf:${key}=${hash}`));
  }
  let level = leaves;
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] ?? "";
      nextLevel.push(sha256TileHex(`wave84:merkle-node:${left}:${level[i + 1] ?? left}`));
    }
    level = nextLevel;
  }
  return level[0] ?? metaLeaf;
}

/** 콘텐츠 주소 지정(CAS) 256×256 타일 머클 캔버스 저장소. */
export class ContentAddressedTileCanvasStore {
  public readonly canvasId: string;
  public readonly width: number;
  public readonly height: number;
  public readonly tileSize: number;
  public readonly tilesX: number;
  public readonly tilesY: number;
  public readonly tileByteLength: number;
  public readonly blankTileHash: string;

  private readonly layerSet: Set<string>;
  private readonly tileIndex = new Map<string, string>();
  private readonly blobStore: Map<string, CompressedTileDeltaBlob>;
  private cachedMerkleRoot: string;

  public constructor(options: TileCanvasStoreOptions = {}) {
    const width = options.width ?? DEFAULT_CANVAS_WIDTH_PX;
    const height = options.height ?? DEFAULT_CANVAS_HEIGHT_PX;
    const tileSize = options.tileSize ?? DEFAULT_TILE_SIZE_PX;
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw new Error("캔버스 너비와 높이는 양의 정수여야 합니다.");
    }
    if (!Number.isInteger(tileSize) || tileSize < 8 || tileSize > 512) {
      throw new Error("타일 크기는 8~512 범위의 정수여야 합니다.");
    }
    this.canvasId = options.canvasId ?? "episode-8k-canvas";
    this.width = width;
    this.height = height;
    this.tileSize = tileSize;
    this.tilesX = Math.ceil(width / tileSize);
    this.tilesY = Math.ceil(height / tileSize);
    this.tileByteLength = tileSize * tileSize * BYTES_PER_PIXEL_RGBA;
    this.layerSet = new Set<string>(options.layerIds && options.layerIds.length > 0 ? options.layerIds : ["ink"]);
    this.blobStore = options.backingBlobs ?? new Map<string, CompressedTileDeltaBlob>();

    const blankBlob = compressTileDelta(new Uint8Array(this.tileByteLength), null);
    this.blankTileHash = blankBlob.targetTileHash;
    this.blobStore.set(this.blankTileHash, blankBlob);
    this.cachedMerkleRoot = this.recomputeMerkleRoot();
  }

  public ensureLayer(layerId: string): void {
    if (!this.layerSet.has(layerId)) {
      this.layerSet.add(layerId);
      this.cachedMerkleRoot = this.recomputeMerkleRoot();
    }
  }

  public getLayerIds(): readonly string[] { return Array.from(this.layerSet).sort(); }
  public hasBlob(tileHash: string): boolean { return this.blobStore.has(tileHash); }
  public getUniqueBlobCount(): number { return this.blobStore.size; }
  public getTileHash(coord: TileCoord): string { return this.tileIndex.get(makeTileKey(coord.layerId, coord.tileX, coord.tileY)) ?? this.blankTileHash; }

  public isValidCoord(coord: TileCoord): boolean {
    return Number.isInteger(coord.tileX) && Number.isInteger(coord.tileY) &&
      coord.tileX >= 0 && coord.tileX < this.tilesX && coord.tileY >= 0 && coord.tileY < this.tilesY && coord.layerId.length > 0;
  }

  public getTotalStoredBlobBytes(): number {
    let total = 0;
    this.blobStore.forEach((blob) => { total += blob.compressedBytes.byteLength; });
    return total;
  }

  /** 저장된 타일 블롭을 복원하며 SHA-256 무결성을 매 호출마다 검증한다. */
  public readBlobByHashVerified(tileHash: string): TileReadResult {
    const blob = this.blobStore.get(tileHash);
    if (!blob) return failIntegrity("BLOB_MISSING", `해시(${tileHash.slice(0, 12)}) 타일 블롭이 없습니다.`);
    let basePixels: Uint8Array | null = null;
    if (blob.baseTileHash !== null) {
      const baseRes = this.readBlobByHashVerified(blob.baseTileHash);
      if (!baseRes.ok) return baseRes;
      basePixels = baseRes.pixels;
    }
    const decoded = decompressTileDelta(blob, basePixels);
    if (!decoded.ok) return decoded;
    if (!constantTimeEqualHex(blob.targetTileHash, tileHash)) {
      return failIntegrity("TARGET_HASH_MISMATCH", "저장소 키 해시와 복원된 타일 해시가 다릅니다.");
    }
    return { ok: true, tileHash, pixels: decoded.tileBytes };
  }

  /** 지정 좌표 타일의 RGBA 픽셀을 SHA-256 검증 후 반환한다. */
  public readTilePixelsVerified(coord: TileCoord): TileReadResult {
    if (!this.isValidCoord(coord)) {
      return failIntegrity("TILE_OUT_OF_BOUNDS", `타일 좌표(${coord.layerId}:${coord.tileX}:${coord.tileY})가 범위를 벗어났습니다.`);
    }
    return this.readBlobByHashVerified(this.getTileHash(coord));
  }

  /** 두 타일 해시 간의 전송용 XOR 델타 블롭을 생성한다. */
  public createWireDeltaBlob(targetTileHash: string, baseTileHash: string | null): CompressedTileDeltaBlob | null {
    const targetRes = this.readBlobByHashVerified(targetTileHash);
    if (!targetRes.ok) return null;
    if (baseTileHash !== null && !constantTimeEqualHex(baseTileHash, this.blankTileHash)) {
      const baseRes = this.readBlobByHashVerified(baseTileHash);
      if (baseRes.ok) return compressTileDelta(targetRes.pixels, baseRes.pixels);
    }
    return compressTileDelta(targetRes.pixels, null);
  }

  /** 수신한 델타 블롭을 SHA-256 검증 후 저장소에 반영한다. 1바이트라도 손상되면 즉시 거부한다. */
  public importVerifiedDeltaBlob(deltaBlob: CompressedTileDeltaBlob): TileReadResult {
    if (deltaBlob.rawByteLength !== this.tileByteLength) {
      return failIntegrity("INVALID_TILE_LENGTH", `수신 타일 길이(${deltaBlob.rawByteLength})가 규격(${this.tileByteLength})과 다릅니다.`);
    }
    let basePixels: Uint8Array | null = null;
    if (deltaBlob.baseTileHash !== null) {
      const baseRes = this.readBlobByHashVerified(deltaBlob.baseTileHash);
      if (!baseRes.ok) return failIntegrity(baseRes.code === "BLOB_MISSING" ? "BASE_TILE_MISSING" : baseRes.code, baseRes.message);
      basePixels = baseRes.pixels;
    }
    const decoded = decompressTileDelta(deltaBlob, basePixels);
    if (!decoded.ok) return decoded;
    const targetHash = deltaBlob.targetTileHash;
    if (!this.blobStore.has(targetHash)) {
      this.blobStore.set(targetHash, deltaBlob.baseTileHash === null ? cloneDeltaBlob(deltaBlob) : compressTileDelta(decoded.tileBytes, null));
    }
    return { ok: true, tileHash: targetHash, pixels: decoded.tileBytes };
  }

  /** 특정 타일 좌표를 저장소에 검증·보관된 해시에 바인딩한다. */
  public bindTileToHash(coord: TileCoord, tileHash: string): boolean {
    if (!this.isValidCoord(coord) || !this.blobStore.has(tileHash)) return false;
    this.ensureLayer(coord.layerId);
    const key = makeTileKey(coord.layerId, coord.tileX, coord.tileY);
    if (constantTimeEqualHex(tileHash, this.blankTileHash)) this.tileIndex.delete(key);
    else this.tileIndex.set(key, tileHash);
    this.cachedMerkleRoot = this.recomputeMerkleRoot();
    return true;
  }

  /** 타일 픽셀을 저장소에 기록하고 이전 해시 대비 전송 델타와 새 머클 루트를 반환한다. */
  public putTilePixels(coord: TileCoord, rgbaPixels: Uint8Array): TileWriteReceipt {
    if (!this.isValidCoord(coord)) throw new Error(`유효하지 않은 타일 좌표입니다: ${coord.layerId}:${coord.tileX}:${coord.tileY}`);
    if (rgbaPixels.length !== this.tileByteLength) throw new Error(`타일 픽셀 버퍼 길이(${rgbaPixels.length})가 규격(${this.tileByteLength})과 다릅니다.`);
    this.ensureLayer(coord.layerId);
    const tileKey = makeTileKey(coord.layerId, coord.tileX, coord.tileY);
    const previousHash = this.getTileHash(coord);
    const prevRead = this.readBlobByHashVerified(previousHash);
    if (!prevRead.ok) throw new Error(`기존 타일 무결성 검증 실패: ${prevRead.message}`);

    const selfBlob = compressTileDelta(rgbaPixels, null);
    const nextHash = selfBlob.targetTileHash;
    const wireDeltaBlob = constantTimeEqualHex(previousHash, this.blankTileHash) ? selfBlob : compressTileDelta(rgbaPixels, prevRead.pixels);
    if (!this.blobStore.has(nextHash)) this.blobStore.set(nextHash, selfBlob);
    if (constantTimeEqualHex(nextHash, this.blankTileHash)) this.tileIndex.delete(tileKey);
    else this.tileIndex.set(tileKey, nextHash);
    this.cachedMerkleRoot = this.recomputeMerkleRoot();

    return {
      coord, tileKey, previousHash, nextHash, changed: !constantTimeEqualHex(previousHash, nextHash),
      rawTileBytes: this.tileByteLength, compressedDeltaBytes: wireDeltaBlob.compressedBytes.byteLength, deltaBlob: wireDeltaBlob,
    };
  }

  /** 선분 브러시 획을 교차 타일에만 적용해 최소 타일 해시와 머클 루트만 갱신한다. */
  public applyBrushStrokeToLayer(params: {
    readonly layerId: string; readonly x0: number; readonly y0: number;
    readonly x1: number; readonly y1: number; readonly radiusPx: number;
    readonly rgba: readonly [number, number, number, number];
  }): BrushStrokeTileResult {
    this.ensureLayer(params.layerId);
    const radius = Math.max(1, params.radiusPx);
    const minPxX = Math.max(0, Math.floor(Math.min(params.x0, params.x1) - radius));
    const maxPxX = Math.min(this.width - 1, Math.ceil(Math.max(params.x0, params.x1) + radius));
    const minPxY = Math.max(0, Math.floor(Math.min(params.y0, params.y1) - radius));
    const maxPxY = Math.min(this.height - 1, Math.ceil(Math.max(params.y0, params.y1) + radius));
    const dx = params.x1 - params.x0; const dy = params.y1 - params.y0;
    const segLenSq = dx * dx + dy * dy; const radiusSq = radius * radius;
    const [r, g, b, a] = params.rgba;
    const receipts: TileWriteReceipt[] = [];
    let totalDeltaWireBytes = 0;

    for (let ty = Math.floor(minPxY / this.tileSize); ty <= Math.floor(maxPxY / this.tileSize); ty += 1) {
      for (let tx = Math.floor(minPxX / this.tileSize); tx <= Math.floor(maxPxX / this.tileSize); tx += 1) {
        const coord: TileCoord = { layerId: params.layerId, tileX: tx, tileY: ty };
        const readRes = this.readTilePixelsVerified(coord);
        if (!readRes.ok) throw new Error(`브러시 적용 중 타일 무결성 오류: ${readRes.message}`);
        const buf = new Uint8Array(readRes.pixels);
        const ox = tx * this.tileSize; const oy = ty * this.tileSize;
        let painted = false;

        for (let ly = Math.max(0, minPxY - oy); ly <= Math.min(this.tileSize - 1, maxPxY - oy); ly += 1) {
          const py = oy + ly;
          for (let lx = Math.max(0, minPxX - ox); lx <= Math.min(this.tileSize - 1, maxPxX - ox); lx += 1) {
            const px = ox + lx;
            const t = segLenSq > 0 ? Math.max(0, Math.min(1, ((px - params.x0) * dx + (py - params.y0) * dy) / segLenSq)) : 0;
            const ddx = px - (params.x0 + t * dx); const ddy = py - (params.y0 + t * dy);
            if (ddx * ddx + ddy * ddy <= radiusSq) {
              const off = (ly * this.tileSize + lx) * BYTES_PER_PIXEL_RGBA;
              buf[off] = r & 0xff; buf[off + 1] = g & 0xff; buf[off + 2] = b & 0xff; buf[off + 3] = a & 0xff;
              painted = true;
            }
          }
        }
        if (painted) {
          const receipt = this.putTilePixels(coord, buf);
          receipts.push(receipt);
          totalDeltaWireBytes += receipt.compressedDeltaBytes;
        }
      }
    }
    return { touchedTiles: receipts, merkleRoot: this.cachedMerkleRoot, totalDeltaWireBytes };
  }

  /** 레이어 전체를 평면 RGBA 버퍼로 조합해 비트 일치 검증에 사용한다. */
  public assembleLayerPixelsVerified(layerId: string): Uint8Array {
    const out = new Uint8Array(this.width * this.height * BYTES_PER_PIXEL_RGBA);
    for (let ty = 0; ty < this.tilesY; ty += 1) {
      for (let tx = 0; tx < this.tilesX; tx += 1) {
        const hash = this.getTileHash({ layerId, tileX: tx, tileY: ty });
        if (constantTimeEqualHex(hash, this.blankTileHash)) continue;
        const readRes = this.readBlobByHashVerified(hash);
        if (!readRes.ok) throw new Error(`레이어 조합 중 손상된 타일 감지: ${readRes.message}`);
        const ox = tx * this.tileSize; const oy = ty * this.tileSize;
        const copyW = Math.min(this.tileSize, this.width - ox);
        const copyH = Math.min(this.tileSize, this.height - oy);
        for (let row = 0; row < copyH; row += 1) {
          const src = row * this.tileSize * BYTES_PER_PIXEL_RGBA;
          out.set(readRes.pixels.subarray(src, src + copyW * BYTES_PER_PIXEL_RGBA), ((oy + row) * this.width + ox) * BYTES_PER_PIXEL_RGBA);
        }
      }
    }
    return out;
  }

  /** 저장소 전체 블롭과 매니페스트 참조의 SHA-256 무결성을 전수 감사한다. */
  public verifyStoreIntegrity(): StoreIntegrityAuditReport {
    const corruptedHashes: string[] = [];
    const missingReferencedHashes: string[] = [];
    let verifiedBlobCount = 0;
    this.blobStore.forEach((_b, hash) => {
      if (this.readBlobByHashVerified(hash).ok) verifiedBlobCount += 1;
      else corruptedHashes.push(hash);
    });
    this.tileIndex.forEach((hash) => { if (!this.blobStore.has(hash)) missingReferencedHashes.push(hash); });
    return { ok: corruptedHashes.length === 0 && missingReferencedHashes.length === 0, verifiedBlobCount, corruptedHashes, missingReferencedHashes };
  }

  public getManifest(): TileCanvasManifest {
    const nonBlankTiles = this.buildNonBlankTileMap();
    const layerIds = this.getLayerIds();
    return {
      canvasId: this.canvasId, width: this.width, height: this.height, tileSize: this.tileSize,
      tilesX: this.tilesX, tilesY: this.tilesY, blankTileHash: this.blankTileHash, layerIds, nonBlankTiles,
      totalTileSlots: layerIds.length * this.tilesX * this.tilesY, nonBlankTileCount: Object.keys(nonBlankTiles).length,
      uniqueBlobCount: this.blobStore.size, merkleRoot: this.cachedMerkleRoot,
    };
  }

  private buildNonBlankTileMap(): Record<string, string> {
    const map: Record<string, string> = {};
    const keys = Array.from(this.tileIndex.keys()).sort();
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i] ?? "";
      const h = this.tileIndex.get(k);
      if (h && !constantTimeEqualHex(h, this.blankTileHash)) map[k] = h;
    }
    return map;
  }

  private recomputeMerkleRoot(): string {
    return computeTileManifestMerkleRoot({
      canvasId: this.canvasId, width: this.width, height: this.height, tileSize: this.tileSize,
      blankTileHash: this.blankTileHash, layerIds: this.getLayerIds(), nonBlankTiles: this.buildNonBlankTileMap(),
    });
  }
}
