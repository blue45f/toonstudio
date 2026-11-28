/**
 * Wave-88: `.tstudio-live` 리액티브 웹툰 바이너리 컨테이너 코덱 (`TSLV` v1).
 *
 * 컷 간 반복되는 하늘·배경·캐릭터 스프라이트를 SHA-256 콘텐츠 해시로 단일 저장하고,
 * 양자화 깊이 평면·재질 마스크·반응형 파티클 방출기·오디오 큐·정적 폴백을 결정적 바이너리로 묶는다.
 * 헤더 CRC-32([0..31]), 바디 CRC-32([72..end)), 청크별 CRC-32, 전체 FIPS 180-4 SHA-256을
 * 외부 의존성 없이 검증하며 1바이트라도 변조되면 fail-closed로 거부한다.
 */

export const TSTUDIO_LIVE_MAGIC = "TSLV" as const;
export const TSTUDIO_LIVE_FORMAT_VERSION = 1 as const;
export const TSTUDIO_LIVE_HEADER_BYTE_LENGTH = 72 as const;
export const TSTUDIO_LIVE_CHUNK_ENTRY_BYTE_LENGTH = 20 as const;
export const TSTUDIO_LIVE_MIME_TYPE = "application/vnd.toonstudio.live+binary" as const;
export const TSTUDIO_LIVE_FILE_EXTENSION = ".tstudio-live" as const;

export const TSTUDIO_LIVE_FLAG_DEDUP_ASSETS = 1 << 0;
export const TSTUDIO_LIVE_FLAG_STATIC_FALLBACK = 1 << 1;
export const TSTUDIO_LIVE_FLAG_HAS_AUDIO_CUES = 1 << 2;
export const TSTUDIO_LIVE_FLAG_HAS_REACTIVE_FX = 1 << 3;
export const TSTUDIO_LIVE_FLAG_QUANTIZED_DEPTH = 1 << 4;

export type TstudioLiveChunkFourCc = "META" | "ATAB" | "ABLB" | "PANL" | "AUDI" | "FALL";
export type TstudioLiveAssetEncoding = "webp" | "avif" | "png" | "ktx2" | "raw-alpha";
export type TstudioLiveLayerRole = "sky" | "backdrop" | "midground" | "character" | "foreground-fx" | "speech-balloon" | "poster";
export type ReactiveEmitterKind = "rain" | "embers" | "smoke" | "ripples" | "petals";
export type StaticFallbackRenderMode = "vertical-strip-jpeg-compat" | "paged-print-safe";
export type TstudioLiveCodecErrorCode =
  | "INVALID_MAGIC" | "UNSUPPORTED_VERSION" | "TRUNCATED_CONTAINER" | "LENGTH_MISMATCH"
  | "HEADER_CRC_MISMATCH" | "BODY_CRC_MISMATCH" | "CHUNK_CRC_MISMATCH" | "SHA256_MISMATCH"
  | "MALFORMED_CHUNK_TABLE" | "MISSING_REQUIRED_CHUNK" | "MISSING_STATIC_FALLBACK"
  | "INVALID_ASSET_REFERENCE" | "INVALID_INPUT";

/** `.tstudio-live` 인코딩·복호화 실패 시 발생하는 구조화 예외. */
export class TstudioLiveCodecError extends Error {
  public readonly code: TstudioLiveCodecErrorCode;
  public constructor(code: TstudioLiveCodecErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = "TstudioLiveCodecError";
    this.code = code;
  }
}

/** 광택·금속성·거칠기 재질 및 8비트 마스크 명세. */
export interface TstudioLiveMaterialSpec {
  readonly metallic: number; readonly roughness: number; readonly specularStrength: number;
  readonly specularTintLinearRgb: readonly [number, number, number];
  readonly maskGridWidth: number; readonly maskGridHeight: number;
  readonly metallicMaskBytes?: Uint8Array; readonly roughnessMaskBytes?: Uint8Array;
}

/** 컷 내 날씨·환경 반응형 파티클 방출기 명세. */
export interface ReactiveEmitterSpec {
  readonly id: string; readonly kind: ReactiveEmitterKind;
  readonly particleCount: number; readonly reducedMotionStaticCount: number;
  readonly baseSpeedPxPerSec: number; readonly gravityPxPerSec2: number; readonly windDriftPxPerSec: number;
  readonly tiltCoupling: number; readonly scrollVelocityCoupling: number; readonly turbulence: number;
  readonly depthMeters: number;
  readonly region: { readonly xRatio: number; readonly yRatio: number; readonly widthRatio: number; readonly heightRatio: number };
}

/** 인코딩 전 단일 레이어 입력 명세. */
export interface TstudioLiveLayerInput {
  readonly id: string; readonly name: string; readonly role: TstudioLiveLayerRole;
  readonly encoding: TstudioLiveAssetEncoding; readonly widthPx: number; readonly heightPx: number;
  readonly payloadBytes: Uint8Array; readonly depthMeters: number;
  readonly fullBleed: boolean; readonly overscanMarginPx: number; readonly lockToViewportFrame?: boolean;
  readonly baseOffsetXPx?: number; readonly baseOffsetYPx?: number; readonly opacity?: number;
  readonly material?: Partial<TstudioLiveMaterialSpec>;
}

/** 인코딩 전 단일 패널(컷) 입력 명세. */
export interface TstudioLivePanelInput {
  readonly id: string; readonly yPx: number; readonly heightPx: number;
  readonly layers: readonly TstudioLiveLayerInput[];
  readonly emitters?: readonly ReactiveEmitterSpec[];
  readonly altText: string; readonly captionText?: string;
}

/** 스크롤 구간 기반 오디오 큐 트랙 명세. */
export interface TstudioLiveAudioTrackSpec {
  readonly trackId: string; readonly title: string; readonly loop: boolean; readonly baseGain: number;
  readonly startYPx: number; readonly endYPx: number; readonly crossfadeMarginPx: number;
  readonly spatialPanBias: number; readonly resourceUri: string;
}

/** 정적 뷰어·저사양 기기·인쇄용 단일 컷 폴백 입력. */
export interface TstudioLivePanelFallbackInput {
  readonly panelId: string; readonly readingOrder: number;
  readonly altText: string; readonly captionText?: string;
  readonly compositeEncoding: TstudioLiveAssetEncoding; readonly widthPx: number; readonly heightPx: number;
  readonly compositeBytes: Uint8Array;
}

/** 정적 폴백 보장 패키지 입력(필수). */
export interface TstudioLiveStaticFallbackInput {
  readonly renderMode: StaticFallbackRenderMode; readonly posterAltText: string;
  readonly posterEncoding: TstudioLiveAssetEncoding; readonly posterWidthPx: number; readonly posterHeightPx: number;
  readonly posterBytes: Uint8Array;
  readonly panelFallbacks: readonly TstudioLivePanelFallbackInput[];
}

/** 에피소드 메타데이터. */
export interface TstudioLiveEpisodeMetadata {
  readonly episodeId: string; readonly seriesId: string; readonly title: string;
  readonly author: string; readonly locale: string; readonly createdAtIso: string;
  readonly canvasWidthPx: number; readonly totalHeightPx: number; readonly targetFps: number;
}

/** `.tstudio-live` 인코더 최상위 입력 명세. */
export interface TstudioLiveEpisodeInput {
  readonly episode: TstudioLiveEpisodeMetadata;
  readonly panels: readonly TstudioLivePanelInput[];
  readonly audioTracks?: readonly TstudioLiveAudioTrackSpec[];
  readonly staticFallback: TstudioLiveStaticFallbackInput;
}

/** 중복 제거된 콘텐츠 주소 에셋 레코드. */
export interface TstudioLiveAssetRecord {
  readonly assetIndex: number; readonly contentHashHex: string;
  readonly encoding: TstudioLiveAssetEncoding; readonly widthPx: number; readonly heightPx: number;
  readonly semanticRole: TstudioLiveLayerRole;
  readonly byteOffset: number; readonly byteLength: number; readonly referenceCount: number;
  readonly payloadBytes: Uint8Array;
}

/** 복호화된 양자화 레이어 레코드. */
export interface DecodedTstudioLiveLayer {
  readonly id: string; readonly name: string; readonly role: TstudioLiveLayerRole;
  readonly assetIndex: number; readonly depthQ16: number; readonly depthMeters: number;
  readonly fullBleed: boolean; readonly overscanMarginPx: number; readonly lockToViewportFrame: boolean;
  readonly baseOffsetXPx: number; readonly baseOffsetYPx: number; readonly opacity: number;
  readonly material: TstudioLiveMaterialSpec;
}

/** 복호화된 패널 레코드. */
export interface DecodedTstudioLivePanel {
  readonly id: string; readonly yPx: number; readonly heightPx: number;
  readonly layers: readonly DecodedTstudioLiveLayer[];
  readonly emitters: readonly ReactiveEmitterSpec[];
  readonly altText: string; readonly captionText: string;
}

/** 복호화된 정적 폴백 패널 항목. */
export interface DecodedStaticFallbackPanel {
  readonly panelId: string; readonly readingOrder: number; readonly yPx: number; readonly heightPx: number;
  readonly compositeAssetIndex: number; readonly altText: string; readonly captionText: string;
}

/** 복호화된 정적 폴백 보증 서술자. */
export interface DecodedStaticFallbackDescriptor {
  readonly schemaVersion: 1; readonly renderMode: StaticFallbackRenderMode;
  readonly posterAssetIndex: number; readonly posterAltText: string;
  readonly panelFallbacks: readonly DecodedStaticFallbackPanel[];
}

/** 복호화된 헤더 정보. */
export interface TstudioLiveContainerHeader {
  readonly magic: typeof TSTUDIO_LIVE_MAGIC; readonly version: typeof TSTUDIO_LIVE_FORMAT_VERSION;
  readonly flags: number; readonly headerLength: number; readonly totalLength: number;
  readonly chunkCount: number; readonly chunkTableOffset: number; readonly payloadOffset: number;
  readonly schemaRevision: number; readonly headerCrc32: number; readonly bodyCrc32: number;
  readonly contentSha256Hex: string;
}

/** 콘텐츠 주소 중복 제거 통계. */
export interface TstudioLiveDeduplicationStats {
  readonly uniqueAssetCount: number; readonly totalAssetReferenceCount: number;
  readonly deduplicatedReferenceCount: number; readonly rawUncompressedReferenceBytes: number;
  readonly storedUniqueAssetBytes: number; readonly containerByteLength: number;
  readonly deduplicationSavingsBytes: number; readonly deduplicationSavingsRatio: number;
}

/** 복호화 완료 패키지. */
export interface DecodedTstudioLivePackage {
  readonly header: TstudioLiveContainerHeader; readonly episode: TstudioLiveEpisodeMetadata;
  readonly assets: readonly TstudioLiveAssetRecord[]; readonly panels: readonly DecodedTstudioLivePanel[];
  readonly audioTracks: readonly TstudioLiveAudioTrackSpec[];
  readonly staticFallback: DecodedStaticFallbackDescriptor;
  readonly deduplicationStats: TstudioLiveDeduplicationStats;
  readonly integrity: { readonly headerCrc32Hex: string; readonly bodyCrc32Hex: string; readonly contentSha256Hex: string; readonly verified: true };
}

/** 인코딩 결과. */
export interface EncodedTstudioLivePackage {
  readonly bytes: Uint8Array; readonly header: TstudioLiveContainerHeader;
  readonly deduplicationStats: TstudioLiveDeduplicationStats;
}

// --- 순수 동기 CRC-32 (IEEE 802.3), SHA-256 (FIPS 180-4) 및 UTF-8 ---

const CRC32_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

const SHA256_H0 = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
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

/** IEEE 802.3 CRC-32 체크섬을 계산한다. */
export function computeCrc32(bytes: Uint8Array, start = 0, end = bytes.length): number {
  let crc = 0xffffffff;
  for (let i = start; i < end; i += 1) crc = ((CRC32_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** 문자열을 UTF-8 바이트 배열로 인코딩한다. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const lo = text.charCodeAt(i + 1);
      if (lo >= 0xdc00 && lo <= 0xdfff) { cp = ((cp - 0xd800) << 10) + (lo - 0xdc00) + 0x10000; i += 1; }
    }
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >>> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >>> 12), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >>> 18), 0x80 | ((cp >>> 12) & 0x3f), 0x80 | ((cp >>> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return new Uint8Array(out);
}

/** UTF-8 바이트 배열을 문자열로 디코딩한다. */
export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b0 = bytes[i++] ?? 0;
    if (b0 < 0x80) out += String.fromCharCode(b0);
    else if ((b0 & 0xe0) === 0xc0) out += String.fromCharCode(((b0 & 0x1f) << 6) | ((bytes[i++] ?? 0) & 0x3f));
    else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i++] ?? 0;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | ((bytes[i++] ?? 0) & 0x3f));
    } else {
      const b1 = bytes[i++] ?? 0, b2 = bytes[i++] ?? 0;
      const cp = (((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | ((bytes[i++] ?? 0) & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >>> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

/** 바이트 배열을 소문자 16진 문자열로 변환한다. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  return hex;
}

/** 32비트 부호 없는 정수를 8자리 16진 문자열로 변환한다. */
export function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) fail("INVALID_INPUT", "마스크 16진 데이터가 손상되었습니다.");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** FIPS 180-4 SHA-256 해시를 순수 동기로 계산해 32바이트 배열을 반환한다. */
export function computeSha256Bytes(input: Uint8Array | string): Uint8Array {
  const data = typeof input === "string" ? utf8Encode(input) : input;
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(data);
  buf[data.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000) >>> 0, false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = SHA256_H0[0] ?? 0, h1 = SHA256_H0[1] ?? 0, h2 = SHA256_H0[2] ?? 0, h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0, h5 = SHA256_H0[5] ?? 0, h6 = SHA256_H0[6] ?? 0, h7 = SHA256_H0[7] ?? 0;
  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0, w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const t1 = (h + s1 + (((e & f) ^ (~e & g)) >>> 0) + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + ((s0 + maj) >>> 0)) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4, h5, h6, h7].forEach((word, i) => ov.setUint32(i * 4, word, false));
  return out;
}

/** FIPS 180-4 SHA-256 16진 다이제스트 문자열을 반환한다. */
export function computeSha256Hex(input: Uint8Array | string): string {
  return bytesToHex(computeSha256Bytes(input));
}

/** 상수 시간 바이트 배열 동등성 비교. */
export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

// --- 양자화 및 직렬화 헬퍼 ---

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
function fail(code: TstudioLiveCodecErrorCode, message: string): never {
  throw new TstudioLiveCodecError(code, message);
}

/** 광학 깊이(m)를 1mm 해상도 16비트 정수(`100..65535`)로 양자화한다. */
export function quantizeDepthMetersToU16(depthMeters: number): number { return Math.round(clamp(depthMeters, 0.1, 65.535) * 1000); }
/** 16비트 양자화 깊이를 미터(m) 단위로 복원한다. */
export function dequantizeDepthU16ToMeters(depthQ16: number): number { return clamp(Math.round(depthQ16), 100, 65535) / 1000; }
/** `0..1` 정규화 스칼라를 `0..10000` 고정소수점으로 양자화한다. */
export function quantizeUnitScalarToU16(value: number): number { return Math.round(clamp(value, 0, 1) * 10000); }
/** `0..10000` 고정소수점을 `0..1` 정규화 스칼라로 복원한다. */
export function dequantizeUnitScalarFromU16(raw: number): number { return clamp(Math.round(raw), 0, 10000) / 10000; }

function encodeFourCc(c: TstudioLiveChunkFourCc): number {
  return (((c.charCodeAt(0) & 0xff) << 24) | ((c.charCodeAt(1) & 0xff) << 16) | ((c.charCodeAt(2) & 0xff) << 8) | (c.charCodeAt(3) & 0xff)) >>> 0;
}
function decodeFourCc(r: number): string {
  return String.fromCharCode((r >>> 24) & 0xff, (r >>> 16) & 0xff, (r >>> 8) & 0xff, r & 0xff);
}
function computeContainerDigest(bytes: Uint8Array): Uint8Array {
  const input = new Uint8Array(bytes.length - 32);
  input.set(bytes.subarray(0, 36), 0);
  input.set(bytes.subarray(68), 36);
  return computeSha256Bytes(input);
}

function buildHeader(
  flags: number, totalLength: number, chunkCount: number, chunkTableOffset: number,
  payloadOffset: number, schemaRevision: number, headerCrc32: number, bodyCrc32: number, contentSha256Hex: string,
): TstudioLiveContainerHeader {
  return {
    magic: TSTUDIO_LIVE_MAGIC, version: TSTUDIO_LIVE_FORMAT_VERSION, flags,
    headerLength: TSTUDIO_LIVE_HEADER_BYTE_LENGTH, totalLength, chunkCount,
    chunkTableOffset, payloadOffset, schemaRevision, headerCrc32, bodyCrc32, contentSha256Hex,
  };
}

function buildDedupStats(uniqueCount: number, totalRefs: number, rawRefBytes: number, storedBytes: number, containerBytes: number): TstudioLiveDeduplicationStats {
  const saved = rawRefBytes - containerBytes;
  return {
    uniqueAssetCount: uniqueCount, totalAssetReferenceCount: totalRefs,
    deduplicatedReferenceCount: Math.max(0, totalRefs - uniqueCount),
    rawUncompressedReferenceBytes: rawRefBytes, storedUniqueAssetBytes: storedBytes,
    containerByteLength: containerBytes, deduplicationSavingsBytes: saved,
    deduplicationSavingsRatio: rawRefBytes > 0 ? saved / rawRefBytes : 0,
  };
}

type SerializedAssetMeta = Omit<TstudioLiveAssetRecord, "payloadBytes">;
interface SerializedLayerRecord {
  readonly id: string; readonly name: string; readonly role: TstudioLiveLayerRole; readonly assetIndex: number;
  readonly depthQ16: number; readonly fullBleed: boolean; readonly overscanMarginPx: number; readonly lockToViewportFrame: boolean;
  readonly baseOffsetXPx: number; readonly baseOffsetYPx: number;
  readonly opacityU16: number; readonly metallicU16: number; readonly roughnessU16: number; readonly specularStrengthU16: number;
  readonly tintU16: readonly [number, number, number];
  readonly maskGridWidth: number; readonly maskGridHeight: number;
  readonly metallicMaskHex?: string; readonly roughnessMaskHex?: string;
}
interface SerializedPanelRecord {
  readonly id: string; readonly yPx: number; readonly heightPx: number;
  readonly layers: readonly SerializedLayerRecord[]; readonly emitters: readonly ReactiveEmitterSpec[];
  readonly altText: string; readonly captionText: string;
}

function serializeLayer(layer: TstudioLiveLayerInput, assetIndex: number): SerializedLayerRecord {
  const tint = layer.material?.specularTintLinearRgb ?? [1, 1, 1];
  return {
    id: layer.id, name: layer.name, role: layer.role, assetIndex,
    depthQ16: quantizeDepthMetersToU16(layer.depthMeters), fullBleed: layer.fullBleed,
    overscanMarginPx: Math.max(0, Math.round(layer.overscanMarginPx)),
    lockToViewportFrame: Boolean(layer.lockToViewportFrame ?? layer.role === "speech-balloon"),
    baseOffsetXPx: Math.round((layer.baseOffsetXPx ?? 0) * 100) / 100,
    baseOffsetYPx: Math.round((layer.baseOffsetYPx ?? 0) * 100) / 100,
    opacityU16: quantizeUnitScalarToU16(layer.opacity ?? 1),
    metallicU16: quantizeUnitScalarToU16(layer.material?.metallic ?? 0),
    roughnessU16: quantizeUnitScalarToU16(layer.material?.roughness ?? 0.65),
    specularStrengthU16: quantizeUnitScalarToU16(layer.material?.specularStrength ?? 0.25),
    tintU16: [quantizeUnitScalarToU16(tint[0]), quantizeUnitScalarToU16(tint[1]), quantizeUnitScalarToU16(tint[2])],
    maskGridWidth: Math.max(0, Math.round(layer.material?.maskGridWidth ?? 0)),
    maskGridHeight: Math.max(0, Math.round(layer.material?.maskGridHeight ?? 0)),
    metallicMaskHex: layer.material?.metallicMaskBytes ? bytesToHex(layer.material.metallicMaskBytes) : undefined,
    roughnessMaskHex: layer.material?.roughnessMaskBytes ? bytesToHex(layer.material.roughnessMaskBytes) : undefined,
  };
}

function deserializeLayer(l: SerializedLayerRecord): DecodedTstudioLiveLayer {
  return {
    id: l.id, name: l.name, role: l.role, assetIndex: l.assetIndex,
    depthQ16: l.depthQ16, depthMeters: dequantizeDepthU16ToMeters(l.depthQ16),
    fullBleed: l.fullBleed, overscanMarginPx: l.overscanMarginPx, lockToViewportFrame: l.lockToViewportFrame,
    baseOffsetXPx: l.baseOffsetXPx, baseOffsetYPx: l.baseOffsetYPx, opacity: dequantizeUnitScalarFromU16(l.opacityU16),
    material: {
      metallic: dequantizeUnitScalarFromU16(l.metallicU16), roughness: dequantizeUnitScalarFromU16(l.roughnessU16),
      specularStrength: dequantizeUnitScalarFromU16(l.specularStrengthU16),
      specularTintLinearRgb: [dequantizeUnitScalarFromU16(l.tintU16[0]), dequantizeUnitScalarFromU16(l.tintU16[1]), dequantizeUnitScalarFromU16(l.tintU16[2])],
      maskGridWidth: l.maskGridWidth, maskGridHeight: l.maskGridHeight,
      metallicMaskBytes: l.metallicMaskHex ? hexToBytes(l.metallicMaskHex) : undefined,
      roughnessMaskBytes: l.roughnessMaskHex ? hexToBytes(l.roughnessMaskHex) : undefined,
    },
  };
}

// --- 인코더: encodeTstudioLivePackage ---

/** 리액티브 웹툰 에피소드를 SHA-256 중복 제거 `.tstudio-live` 바이너리로 인코딩한다. */
export function encodeTstudioLivePackage(input: TstudioLiveEpisodeInput): EncodedTstudioLivePackage {
  if (!input.episode.episodeId.trim() || !input.episode.title.trim()) fail("INVALID_INPUT", "에피소드 ID와 제목이 비어 있습니다.");
  if (input.episode.canvasWidthPx <= 0 || input.episode.totalHeightPx <= 0 || input.panels.length === 0) {
    fail("INVALID_INPUT", "양수 캔버스 크기와 1개 이상의 패널이 필요합니다.");
  }
  if (!input.staticFallback || input.staticFallback.posterBytes.length === 0 || !input.staticFallback.posterAltText.trim()) {
    fail("MISSING_STATIC_FALLBACK", "저사양·인쇄 호환용 정적 폴백 포스터와 대체 텍스트가 필수입니다.");
  }

  const fbMap = new Map<string, TstudioLivePanelFallbackInput>();
  for (const fb of input.staticFallback.panelFallbacks) {
    if (fb.compositeBytes.length === 0 || !fb.altText.trim()) fail("MISSING_STATIC_FALLBACK", `패널(${fb.panelId}) 폴백 데이터가 비어 있습니다.`);
    fbMap.set(fb.panelId, fb);
  }
  for (const p of input.panels) if (!fbMap.has(p.id)) fail("MISSING_STATIC_FALLBACK", `패널(${p.id}) 정적 폴백이 누락되었습니다.`);

  type MutableAsset = Omit<TstudioLiveAssetRecord, "byteOffset" | "byteLength" | "referenceCount"> & { referenceCount: number };
  const dedupMap = new Map<string, MutableAsset>();
  const uniqueAssets: MutableAsset[] = [];
  let totalRefs = 0, rawRefBytes = 0;

  const intern = (payload: Uint8Array, encoding: TstudioLiveAssetEncoding, widthPx: number, heightPx: number, role: TstudioLiveLayerRole): number => {
    if (payload.length === 0) fail("INVALID_INPUT", "에셋 바이트 길이는 0보다 커야 합니다.");
    totalRefs += 1;
    rawRefBytes += payload.length;
    const hash = computeSha256Hex(payload);
    const key = `${hash}|${encoding}|${Math.round(widthPx)}x${Math.round(heightPx)}`;
    const existing = dedupMap.get(key);
    if (existing) { existing.referenceCount += 1; return existing.assetIndex; }
    const entry: MutableAsset = {
      assetIndex: uniqueAssets.length, contentHashHex: hash, encoding,
      widthPx: Math.max(1, Math.round(widthPx)), heightPx: Math.max(1, Math.round(heightPx)),
      semanticRole: role, payloadBytes: new Uint8Array(payload), referenceCount: 1,
    };
    dedupMap.set(key, entry);
    uniqueAssets.push(entry);
    return entry.assetIndex;
  };

  let hasReactiveFx = false;
  const panelGeomById = new Map<string, { yPx: number; heightPx: number }>();
  const serializedPanels: SerializedPanelRecord[] = input.panels.map((panel) => {
    if (panel.heightPx <= 0 || panel.layers.length === 0) fail("INVALID_INPUT", `패널(${panel.id}) 높이와 레이어가 유효하지 않습니다.`);
    panelGeomById.set(panel.id, { yPx: Math.round(panel.yPx), heightPx: Math.round(panel.heightPx) });
    const layers = panel.layers.map((l) => serializeLayer(l, intern(l.payloadBytes, l.encoding, l.widthPx, l.heightPx, l.role)));
    const emitters = (panel.emitters ?? []).map((em) => ({
      ...em,
      particleCount: Math.max(1, Math.min(256, Math.round(em.particleCount))),
      reducedMotionStaticCount: Math.max(0, Math.min(64, Math.round(em.reducedMotionStaticCount))),
      tiltCoupling: clamp(em.tiltCoupling, 0, 1), scrollVelocityCoupling: clamp(em.scrollVelocityCoupling, 0, 1), turbulence: clamp(em.turbulence, 0, 1),
    }));
    if (emitters.length > 0) hasReactiveFx = true;
    return { id: panel.id, yPx: Math.round(panel.yPx), heightPx: Math.round(panel.heightPx), layers, emitters, altText: panel.altText, captionText: panel.captionText ?? "" };
  });

  const posterIdx = intern(input.staticFallback.posterBytes, input.staticFallback.posterEncoding, input.staticFallback.posterWidthPx, input.staticFallback.posterHeightPx, "poster");
  const staticFallbackDesc: DecodedStaticFallbackDescriptor = {
    schemaVersion: 1, renderMode: input.staticFallback.renderMode, posterAssetIndex: posterIdx, posterAltText: input.staticFallback.posterAltText,
    panelFallbacks: input.staticFallback.panelFallbacks.map((fb) => {
      const geom = panelGeomById.get(fb.panelId) ?? { yPx: 0, heightPx: fb.heightPx };
      return {
        panelId: fb.panelId, readingOrder: Math.max(0, Math.round(fb.readingOrder)), yPx: geom.yPx, heightPx: geom.heightPx,
        compositeAssetIndex: intern(fb.compositeBytes, fb.compositeEncoding, fb.widthPx, fb.heightPx, "backdrop"),
        altText: fb.altText, captionText: fb.captionText ?? "",
      };
    }),
  };

  let storedBytes = 0;
  for (const a of uniqueAssets) storedBytes += a.payloadBytes.length;
  const assetBlob = new Uint8Array(storedBytes);
  let blobCursor = 0;
  const assetMetaTable: SerializedAssetMeta[] = uniqueAssets.map((a) => {
    assetBlob.set(a.payloadBytes, blobCursor);
    const meta: SerializedAssetMeta = {
      assetIndex: a.assetIndex, contentHashHex: a.contentHashHex, encoding: a.encoding,
      widthPx: a.widthPx, heightPx: a.heightPx, semanticRole: a.semanticRole,
      byteOffset: blobCursor, byteLength: a.payloadBytes.length, referenceCount: a.referenceCount,
    };
    blobCursor += a.payloadBytes.length;
    return meta;
  });

  const audioTracks: readonly TstudioLiveAudioTrackSpec[] = (input.audioTracks ?? []).map((t) => ({
    ...t, loop: Boolean(t.loop), baseGain: clamp(t.baseGain, 0, 1), startYPx: Math.round(t.startYPx), endYPx: Math.round(t.endYPx),
    crossfadeMarginPx: Math.max(0, Math.round(t.crossfadeMarginPx)), spatialPanBias: clamp(t.spatialPanBias, -1, 1),
  }));
  const normalizedEpisode: TstudioLiveEpisodeMetadata = {
    ...input.episode, locale: input.episode.locale || "ko-KR",
    canvasWidthPx: Math.round(input.episode.canvasWidthPx), totalHeightPx: Math.round(input.episode.totalHeightPx),
    targetFps: Math.max(24, Math.min(120, Math.round(input.episode.targetFps || 60))),
  };

  const chunks: ReadonlyArray<{ readonly fourCc: TstudioLiveChunkFourCc; readonly payload: Uint8Array }> = [
    { fourCc: "META", payload: utf8Encode(JSON.stringify(normalizedEpisode)) },
    { fourCc: "ATAB", payload: utf8Encode(JSON.stringify(assetMetaTable)) },
    { fourCc: "ABLB", payload: assetBlob },
    { fourCc: "PANL", payload: utf8Encode(JSON.stringify(serializedPanels)) },
    { fourCc: "AUDI", payload: utf8Encode(JSON.stringify(audioTracks)) },
    { fourCc: "FALL", payload: utf8Encode(JSON.stringify(staticFallbackDesc)) },
  ];

  const chunkTableOffset = TSTUDIO_LIVE_HEADER_BYTE_LENGTH;
  const payloadOffset = chunkTableOffset + chunks.length * TSTUDIO_LIVE_CHUNK_ENTRY_BYTE_LENGTH;
  let totalLength = payloadOffset;
  for (const ch of chunks) totalLength += ch.payload.length;

  let flags = TSTUDIO_LIVE_FLAG_DEDUP_ASSETS | TSTUDIO_LIVE_FLAG_STATIC_FALLBACK | TSTUDIO_LIVE_FLAG_QUANTIZED_DEPTH;
  if (audioTracks.length > 0) flags |= TSTUDIO_LIVE_FLAG_HAS_AUDIO_CUES;
  if (hasReactiveFx) flags |= TSTUDIO_LIVE_FLAG_HAS_REACTIVE_FX;

  const container = new Uint8Array(totalLength);
  const view = new DataView(container.buffer);
  container.set([0x54, 0x53, 0x4c, 0x56], 0);
  view.setUint16(4, TSTUDIO_LIVE_FORMAT_VERSION, false);
  view.setUint16(6, flags, false);
  view.setUint32(8, TSTUDIO_LIVE_HEADER_BYTE_LENGTH, false);
  view.setUint32(12, totalLength, false);
  view.setUint32(16, chunks.length, false);
  view.setUint32(20, chunkTableOffset, false);
  view.setUint32(24, payloadOffset, false);
  view.setUint32(28, 1, false);

  let writeOffset = payloadOffset;
  chunks.forEach((ch, i) => {
    const entry = chunkTableOffset + i * TSTUDIO_LIVE_CHUNK_ENTRY_BYTE_LENGTH;
    view.setUint32(entry, encodeFourCc(ch.fourCc), false);
    view.setUint32(entry + 4, 0, false);
    view.setUint32(entry + 8, writeOffset, false);
    view.setUint32(entry + 12, ch.payload.length, false);
    view.setUint32(entry + 16, computeCrc32(ch.payload), false);
    container.set(ch.payload, writeOffset);
    writeOffset += ch.payload.length;
  });

  const headerCrc32 = computeCrc32(container, 0, 32);
  const bodyCrc32 = computeCrc32(container, TSTUDIO_LIVE_HEADER_BYTE_LENGTH, totalLength);
  view.setUint32(32, headerCrc32, false);
  view.setUint32(68, bodyCrc32, false);
  const digestBytes = computeContainerDigest(container);
  container.set(digestBytes, 36);

  return {
    bytes: container,
    header: buildHeader(flags, totalLength, chunks.length, chunkTableOffset, payloadOffset, 1, headerCrc32, bodyCrc32, bytesToHex(digestBytes)),
    deduplicationStats: buildDedupStats(uniqueAssets.length, totalRefs, rawRefBytes, storedBytes, totalLength),
  };
}

// --- 디코더: decodeTstudioLivePackage (1바이트 변조 fail-closed 검증) ---

/** `.tstudio-live` 바이너리 컨테이너를 CRC-32 및 SHA-256으로 검증하고 복호화한다. */
export function decodeTstudioLivePackage(bytes: Uint8Array): DecodedTstudioLivePackage {
  if (bytes.byteLength < TSTUDIO_LIVE_HEADER_BYTE_LENGTH) fail("TRUNCATED_CONTAINER", "컨테이너가 최소 헤더 크기보다 짧습니다.");
  const magic = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0, bytes[3] ?? 0);
  if (magic !== TSTUDIO_LIVE_MAGIC) fail("INVALID_MAGIC", `매직("TSLV") 불일치: "${magic}".`);

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, false);
  if (version !== TSTUDIO_LIVE_FORMAT_VERSION) fail("UNSUPPORTED_VERSION", `미지원 버전: v${version}.`);

  const flags = view.getUint16(6, false), headerLength = view.getUint32(8, false), totalLength = view.getUint32(12, false);
  const chunkCount = view.getUint32(16, false), chunkTableOffset = view.getUint32(20, false);
  const payloadOffset = view.getUint32(24, false), schemaRevision = view.getUint32(28, false);
  const storedHeaderCrc32 = view.getUint32(32, false), storedSha256 = bytes.subarray(36, 68), storedBodyCrc32 = view.getUint32(68, false);

  if (headerLength !== TSTUDIO_LIVE_HEADER_BYTE_LENGTH || totalLength !== bytes.byteLength) fail("LENGTH_MISMATCH", "헤더/전체 바이트 길이 불일치.");
  const actualHeaderCrc32 = computeCrc32(bytes, 0, 32);
  if (actualHeaderCrc32 !== storedHeaderCrc32) fail("HEADER_CRC_MISMATCH", "헤더 CRC-32 불일치.");
  const actualBodyCrc32 = computeCrc32(bytes, TSTUDIO_LIVE_HEADER_BYTE_LENGTH, totalLength);
  if (actualBodyCrc32 !== storedBodyCrc32) fail("BODY_CRC_MISMATCH", "바디 CRC-32 불일치.");
  const actualSha256 = computeContainerDigest(bytes);
  if (!constantTimeEqualBytes(actualSha256, storedSha256)) fail("SHA256_MISMATCH", "컨테이너 전체 SHA-256 다이제스트 불일치.");

  const expectedPayloadOffset = chunkTableOffset + chunkCount * TSTUDIO_LIVE_CHUNK_ENTRY_BYTE_LENGTH;
  if (chunkTableOffset !== TSTUDIO_LIVE_HEADER_BYTE_LENGTH || chunkCount === 0 || expectedPayloadOffset !== payloadOffset || payloadOffset > totalLength) {
    fail("MALFORMED_CHUNK_TABLE", "청크 테이블 오프셋 또는 길이가 손상되었습니다.");
  }

  const chunkMap = new Map<string, Uint8Array>();
  let cursor = payloadOffset;
  for (let i = 0; i < chunkCount; i += 1) {
    const entry = chunkTableOffset + i * TSTUDIO_LIVE_CHUNK_ENTRY_BYTE_LENGTH;
    const fourCc = decodeFourCc(view.getUint32(entry, false));
    const offset = view.getUint32(entry + 8, false), length = view.getUint32(entry + 12, false);
    if (offset !== cursor || offset + length > totalLength) fail("MALFORMED_CHUNK_TABLE", `청크(${fourCc}) 경계 오류.`);
    const slice = bytes.subarray(offset, offset + length);
    if (computeCrc32(slice) !== view.getUint32(entry + 16, false)) fail("CHUNK_CRC_MISMATCH", `청크(${fourCc}) CRC-32 불일치.`);
    chunkMap.set(fourCc, slice);
    cursor = offset + length;
  }
  if (cursor !== totalLength) fail("MALFORMED_CHUNK_TABLE", "청크 총합 길이가 컨테이너 끝과 맞지 않습니다.");

  const requireChunk = (code: TstudioLiveChunkFourCc): Uint8Array => {
    const payload = chunkMap.get(code);
    if (!payload) fail("MISSING_REQUIRED_CHUNK", `필수 청크(${code}) 누락.`);
    return payload;
  };

  const episode = JSON.parse(utf8Decode(requireChunk("META"))) as TstudioLiveEpisodeMetadata;
  const assetMetas = JSON.parse(utf8Decode(requireChunk("ATAB"))) as SerializedAssetMeta[];
  const assetBlob = requireChunk("ABLB");
  const serializedPanels = JSON.parse(utf8Decode(requireChunk("PANL"))) as SerializedPanelRecord[];
  const audioTracks = JSON.parse(utf8Decode(requireChunk("AUDI"))) as TstudioLiveAudioTrackSpec[];
  const staticFallback = JSON.parse(utf8Decode(requireChunk("FALL"))) as DecodedStaticFallbackDescriptor;

  let totalRefs = 0, rawRefBytes = 0;
  const assets: TstudioLiveAssetRecord[] = assetMetas.map((meta, i) => {
    if (meta.assetIndex !== i || meta.byteOffset + meta.byteLength > assetBlob.length) fail("INVALID_ASSET_REFERENCE", `에셋(${i}) 범위 손상.`);
    const payloadCopy = new Uint8Array(assetBlob.subarray(meta.byteOffset, meta.byteOffset + meta.byteLength));
    if (computeSha256Hex(payloadCopy) !== meta.contentHashHex) fail("SHA256_MISMATCH", `에셋(${i}) SHA-256 불일치.`);
    totalRefs += meta.referenceCount;
    rawRefBytes += meta.byteLength * meta.referenceCount;
    return { ...meta, payloadBytes: payloadCopy };
  });

  const assertIdx = (idx: number, label: string): void => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= assets.length) fail("INVALID_ASSET_REFERENCE", `${label} 인덱스(${idx}) 범위 초과.`);
  };

  const panels: DecodedTstudioLivePanel[] = serializedPanels.map((p) => ({
    id: p.id, yPx: p.yPx, heightPx: p.heightPx, altText: p.altText, captionText: p.captionText, emitters: p.emitters,
    layers: p.layers.map((l) => { assertIdx(l.assetIndex, `패널(${p.id})/레이어(${l.id})`); return deserializeLayer(l); }),
  }));

  if (!staticFallback || !staticFallback.posterAltText.trim()) fail("MISSING_STATIC_FALLBACK", "정적 폴백 포스터 정보 누락.");
  assertIdx(staticFallback.posterAssetIndex, "정적 폴백 포스터");
  const fbIds = new Set<string>();
  for (const fb of staticFallback.panelFallbacks) { assertIdx(fb.compositeAssetIndex, `폴백(${fb.panelId})`); fbIds.add(fb.panelId); }
  for (const p of panels) if (!fbIds.has(p.id)) fail("MISSING_STATIC_FALLBACK", `패널(${p.id}) 폴백 매핑 누락.`);

  const contentSha256Hex = bytesToHex(actualSha256);
  return {
    header: buildHeader(flags, totalLength, chunkCount, chunkTableOffset, payloadOffset, schemaRevision, actualHeaderCrc32, actualBodyCrc32, contentSha256Hex),
    episode, assets, panels, audioTracks, staticFallback,
    deduplicationStats: buildDedupStats(assets.length, totalRefs, rawRefBytes, assetBlob.length, totalLength),
    integrity: { headerCrc32Hex: uint32ToHex(actualHeaderCrc32), bodyCrc32Hex: uint32ToHex(actualBodyCrc32), contentSha256Hex, verified: true },
  };
}
