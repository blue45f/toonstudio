/**
 * Wave 78 — LAN 직결 암호화 페어링 및 32바이트 바이너리 펜·촉각 다이얼 코덱.
 *
 * - 사설망(RFC 1918, 루프백, `.local`, USB 링크로컬)만 허용하는 fail-closed 호스트 검증
 * - 외부 암호 라이브러리 무의존 순수 동기 FIPS 180-4 SHA-256 / RFC 2104 HMAC-SHA256 상호 인증,
 *   6자리 임시 PIN + QR URI (`toonstudio-lan://pair?...`) 및 리플레이 논스 윈도우 가드
 * - 240Hz/480Hz 펜 샘플(32B / 배치) 및 촉각 다이얼·혼색 팔레트 바이너리 코덱 + IEEE CRC-32 (`0xEDB88320`)
 */

export const WIRE_MAGIC_BYTE_0 = 0x54;
export const WIRE_MAGIC_BYTE_1 = 0x53;
export const WIRE_PROTOCOL_VERSION = 1;
export const PACKET_KIND_PEN_SAMPLE = 0x01;
export const PACKET_KIND_PEN_BATCH = 0x02;
export const PACKET_KIND_TACTILE_DIAL = 0x03;
export const PEN_SAMPLE_PACKET_BYTES = 32;
export const PEN_SAMPLE_RECORD_BYTES = 24;
export const PEN_BATCH_HEADER_BYTES = 8;
export const PEN_BATCH_MAX_SAMPLES = 64;
export const TACTILE_DIAL_PACKET_BYTES = 32;
export const WIRE_CRC_TRAILER_BYTES = 4;

export const PEN_FLAG_DOWN = 0x0001;
export const PEN_FLAG_HOVER = 0x0002;
export const PEN_FLAG_ERASER = 0x0004;
export const PEN_FLAG_BARREL_BTN = 0x0008;
export const PEN_FLAG_PALM_REJECT = 0x0010;
export const PEN_FLAG_PREDICTED = 0x0020;

export const DIAL_FLAG_COMMIT = 0x01;
export const DIAL_FLAG_HAPTIC_DETENT = 0x02;
export const DIAL_FLAG_FINE_PRECISION = 0x04;

const DEFAULT_PAIRING_TTL_MS = 60_000;
const MIN_PAIRING_TTL_MS = 5_000;
const MAX_PAIRING_TTL_MS = 300_000;
const DEFAULT_CLOCK_SKEW_MS = 5_000;
const DEFAULT_REPLAY_WINDOW_MS = 300_000;
const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const U16_MAX = 65535;
const I16_SCALE = 32767;

export type LanHostScope = "loopback" | "rfc1918-10" | "rfc1918-172" | "rfc1918-192" | "usb-link-local" | "mdns-local";
export type LanTransportHint = "usb-tether-loopback" | "lan-direct";
export type PairingErrorCode = "PUBLIC_HOST_REJECTED" | "INVALID_PORT" | "INVALID_PIN_FORMAT" | "INVALID_NONCE_FORMAT" | "CHALLENGE_EXPIRED" | "NONCE_REPLAYED" | "INVALID_PIN_OR_PROOF" | "INVALID_HOST_ACK";
export type TactileDialKind = "brush-size" | "opacity" | "canvas-rotation" | "undo-scrub" | "wet-paint-mixer-swatch";
export type WireDecodeErrorCode = "INVALID_LENGTH" | "INVALID_MAGIC" | "UNSUPPORTED_VERSION" | "UNEXPECTED_PACKET_KIND" | "CRC_MISMATCH" | "INVALID_BATCH_COUNT" | "UNKNOWN_DIAL_KIND";

export interface LanHostValidationResult {
  readonly allowed: boolean; readonly normalizedHost: string;
  readonly scope: LanHostScope | null; readonly transportHint: LanTransportHint | null; readonly reason: string;
}

export interface CompanionPairingChallengeRequest {
  readonly host: string; readonly port: number; readonly hostDeviceId: string;
  readonly issuedAtMs: number; readonly ttlMs?: number; readonly pin?: string; readonly entropySeed?: string;
}

export interface CompanionPairingChallenge {
  readonly protocolVersion: number; readonly challengeId: string; readonly host: string; readonly port: number;
  readonly hostScope: LanHostScope; readonly transportHint: LanTransportHint; readonly hostDeviceId: string;
  readonly hostNonceHex: string; readonly pin: string; readonly pairingFingerprint: string;
  readonly qrUri: string; readonly issuedAtMs: number; readonly expiresAtMs: number;
}

export type CompanionPairingChallengeResult =
  | { readonly ok: true; readonly challenge: CompanionPairingChallenge }
  | { readonly ok: false; readonly errorCode: PairingErrorCode; readonly reason: string };

export interface CompanionPairingResponse {
  readonly challengeId: string; readonly tabletDeviceId: string;
  readonly tabletNonceHex: string; readonly tabletProofHex: string; readonly respondedAtMs: number;
}

export interface BuildPairingResponseParams {
  readonly challengeId: string; readonly host: string; readonly port: number; readonly hostNonceHex: string;
  readonly pin: string; readonly tabletDeviceId: string; readonly tabletNonceHex: string; readonly respondedAtMs: number;
}

export interface VerifyPairingResponseParams {
  readonly challenge: CompanionPairingChallenge; readonly response: CompanionPairingResponse;
  readonly nowMs: number; readonly replayGuard?: PairingReplayNonceGuard; readonly clockSkewToleranceMs?: number;
}

export interface VerifiedCompanionPairingSession {
  readonly sessionId: string; readonly challengeId: string; readonly host: string; readonly port: number;
  readonly hostScope: LanHostScope; readonly transportHint: LanTransportHint; readonly hostDeviceId: string;
  readonly tabletDeviceId: string; readonly hostAckHex: string; readonly sessionKeyHex: string; readonly establishedAtMs: number;
}

export type CompanionPairingVerificationResult =
  | { readonly ok: true; readonly session: VerifiedCompanionPairingSession }
  | { readonly ok: false; readonly errorCode: PairingErrorCode; readonly reason: string };

export interface PenSampleFlags {
  readonly penDown: boolean; readonly hover: boolean; readonly eraser: boolean;
  readonly barrelBtn: boolean; readonly palmReject: boolean; readonly predicted?: boolean;
}

export interface PenSample {
  readonly sequence: number; readonly timestampUs: number; readonly xNorm: number; readonly yNorm: number;
  readonly pressure: number; readonly altitudeRad: number; readonly azimuthRad: number;
  readonly barrelRoll: number; readonly hoverHeight: number; readonly flags: PenSampleFlags;
}

export interface PenBatchPacket { readonly sampleRateHz: number; readonly samples: readonly PenSample[]; }
export interface SwatchRgba { readonly r: number; readonly g: number; readonly b: number; readonly a: number; }

export interface TactileDialEvent {
  readonly sequence: number; readonly timestampUs: number; readonly kind: TactileDialKind;
  readonly stepDelta: number; readonly normalizedValue: number; readonly isCommit: boolean;
  readonly hapticDetent: boolean; readonly finePrecision: boolean;
  readonly swatchRgba?: SwatchRgba; readonly wetness?: number; readonly swatchSlotIndex?: number;
}

export type WireDecodeResult<T> =
  | { readonly ok: true; readonly value: T; readonly crc32: number }
  | { readonly ok: false; readonly errorCode: WireDecodeErrorCode; readonly reason: string };

const SHA256_H0 = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
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

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) c = (c & 1) !== 0 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

/** IEEE 802.3 CRC-32 (`0xEDB88320`) 체크섬을 계산한다. */
export function computeCrc32(bytes: Uint8Array, byteOffset = 0, byteLength = bytes.length - byteOffset): number {
  let crc = 0xffffffff;
  const end = Math.min(bytes.length, byteOffset + Math.max(0, byteLength));
  for (let i = Math.max(0, byteOffset); i < end; i += 1) {
    crc = ((CRC32_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
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

/** FIPS 180-4 SHA-256 해시를 순수 동기로 계산해 32바이트 배열을 반환한다. */
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
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3;
    let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false); outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false); outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false); outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false); outView.setUint32(28, h7, false);
  return out;
}

/** FIPS 180-4 SHA-256 16진수 문자열(64자)을 반환한다. */
export function sha256Hex(input: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(input));
}

/** RFC 2104 HMAC-SHA256을 순수 동기로 계산해 32바이트 배열을 반환한다. */
export function hmacSha256Bytes(key: Uint8Array | string, message: Uint8Array | string): Uint8Array {
  const rawKey = typeof key === "string" ? utf8Encode(key) : key;
  const msgBytes = typeof message === "string" ? utf8Encode(message) : message;
  const keyBlock = new Uint8Array(64);
  if (rawKey.length > 64) keyBlock.set(sha256Bytes(rawKey));
  else keyBlock.set(rawKey);
  const innerInput = new Uint8Array(64 + msgBytes.length);
  const outerPad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    const kb = keyBlock[i] ?? 0;
    innerInput[i] = kb ^ 0x36;
    outerPad[i] = kb ^ 0x5c;
  }
  innerInput.set(msgBytes, 64);
  const innerHash = sha256Bytes(innerInput);
  const outerInput = new Uint8Array(64 + innerHash.length);
  outerInput.set(outerPad, 0);
  outerInput.set(innerHash, 64);
  return sha256Bytes(outerInput);
}

/** RFC 2104 HMAC-SHA256 16진수 문자열(64자)을 반환한다. */
export function hmacSha256Hex(key: Uint8Array | string, message: Uint8Array | string): string {
  return bytesToHex(hmacSha256Bytes(key, message));
}

/** 타이밍 부채널 누출을 막기 위한 상수 시간 16진수 문자열 비교. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    diff |= (i < a.length ? a.charCodeAt(i) : 0) ^ (i < b.length ? b.charCodeAt(i) : 0);
  }
  return diff === 0;
}

function parseStrictIpv4Octets(host: string): readonly [number, number, number, number] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const part = parts[i] ?? "";
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(part)) return null;
    const value = Number(part);
    if (!Number.isInteger(value) || value < 0 || value > 255) return null;
    octets.push(value);
  }
  return [octets[0] ?? 0, octets[1] ?? 0, octets[2] ?? 0, octets[3] ?? 0];
}

function isValidMdnsLocalHost(host: string): boolean {
  if (!host.endsWith(".local") || host.length <= 6 || host.length > 253) return false;
  const labels = host.slice(0, -6).split(".");
  if (labels.length === 0 || labels.every((label) => /^[0-9]+$/.test(label))) return false;
  return labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function rejectHost(normalizedHost: string, reason: string): LanHostValidationResult {
  return { allowed: false, normalizedHost, scope: null, transportHint: null, reason };
}

/**
 * 데스크톱 호스트 주소가 사설 LAN·루프백·`.local` mDNS 범위인지 엄격하게 판정한다.
 * 공인 WAN IP, 스킴이 섞인 URL, 자격증명·경로 포함 문자열은 fail-closed로 거부한다.
 */
export function validatePrivateLanHost(rawHost: string): LanHostValidationResult {
  const trimmed = rawHost.trim().toLowerCase();
  if (trimmed.length === 0) return rejectHost("", "호스트 주소가 비어 있습니다.");
  if (/[/?#@\s]/.test(trimmed) || trimmed.indexOf("://") !== -1) {
    return rejectHost(trimmed, "URL 스킴·경로·사용자 정보가 섞인 호스트는 사설 LAN 대상으로 허용하지 않습니다.");
  }
  if (trimmed === "localhost" || trimmed === "::1" || trimmed === "[::1]") {
    return {
      allowed: true,
      normalizedHost: trimmed === "[::1]" ? "::1" : trimmed,
      scope: "loopback",
      transportHint: "usb-tether-loopback",
      reason: "로컬 루프백 직결 경로가 확인되었습니다.",
    };
  }
  const ipv4 = parseStrictIpv4Octets(trimmed);
  if (ipv4 !== null) {
    const [a, b] = ipv4;
    if (a === 127) return { allowed: true, normalizedHost: trimmed, scope: "loopback", transportHint: "usb-tether-loopback", reason: "IPv4 루프백 대역(127.0.0.0/8)입니다." };
    if (a === 10) return { allowed: true, normalizedHost: trimmed, scope: "rfc1918-10", transportHint: "lan-direct", reason: "RFC 1918 사설 LAN 대역(10.0.0.0/8)입니다." };
    if (a === 172 && b >= 16 && b <= 31) return { allowed: true, normalizedHost: trimmed, scope: "rfc1918-172", transportHint: "lan-direct", reason: "RFC 1918 사설 LAN 대역(172.16.0.0/12)입니다." };
    if (a === 192 && b === 168) return { allowed: true, normalizedHost: trimmed, scope: "rfc1918-192", transportHint: "lan-direct", reason: "RFC 1918 사설 LAN 대역(192.168.0.0/16)입니다." };
    if (a === 169 && b === 254) return { allowed: true, normalizedHost: trimmed, scope: "usb-link-local", transportHint: "usb-tether-loopback", reason: "USB 테더링 링크로컬 대역(169.254.0.0/16)입니다." };
    return rejectHost(trimmed, `공인 또는 비허용 IPv4 주소(${trimmed})는 외부 중계 유출 방지를 위해 차단됩니다.`);
  }
  if (isValidMdnsLocalHost(trimmed)) {
    return { allowed: true, normalizedHost: trimmed, scope: "mdns-local", transportHint: "lan-direct", reason: "로컬 네트워크 mDNS(`.local`) 호스트입니다." };
  }
  return rejectHost(trimmed, `비사설 도메인 또는 잘못된 호스트(${trimmed})는 사설 LAN 정책으로 거부됩니다.`);
}

/** 재전송 공격을 차단하는 슬라이딩 시간 윈도우 기반 논스 가드. */
export class PairingReplayNonceGuard {
  private readonly seenNonces = new Map<string, number>();
  private readonly windowMs: number;
  private readonly maxEntries: number;

  public constructor(windowMs = DEFAULT_REPLAY_WINDOW_MS, maxEntries = 2048) {
    this.windowMs = Math.max(10_000, windowMs);
    this.maxEntries = Math.max(64, maxEntries);
  }

  public prune(nowMs: number): void {
    const cutoff = nowMs - this.windowMs;
    this.seenNonces.forEach((recordedAt, key) => {
      if (recordedAt < cutoff) this.seenNonces.delete(key);
    });
  }

  public hasSeen(nonceKey: string, nowMs: number): boolean {
    this.prune(nowMs);
    return this.seenNonces.has(nonceKey);
  }

  public record(nonceKey: string, nowMs: number): void {
    this.prune(nowMs);
    if (this.seenNonces.size >= this.maxEntries) {
      const oldestKey = this.seenNonces.keys().next().value;
      if (typeof oldestKey === "string") this.seenNonces.delete(oldestKey);
    }
    this.seenNonces.set(nonceKey, nowMs);
  }

  public get size(): number {
    return this.seenNonces.size;
  }
}

function derivePairingPsk(pin: string, challengeId: string, host: string, port: number): Uint8Array {
  return sha256Bytes(`toonstudio-lan-psk-v1|${pin}|${challengeId}|${host}:${port}`);
}

function generateEphemeralSeed(request: CompanionPairingChallengeRequest): string {
  if (typeof request.entropySeed === "string" && request.entropySeed.length > 0) return request.entropySeed;
  const buf = new Uint8Array(16);
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(buf);
  } else {
    buf.set(sha256Bytes(`${request.hostDeviceId}|${request.host}|${request.port}|${request.issuedAtMs}`).subarray(0, 16));
  }
  return bytesToHex(buf);
}

/** 데스크톱 호스트가 6자리 임시 PIN과 QR 페어링 URI를 발급한다(공인 호스트 즉시 거부). */
export function createCompanionPairingChallenge(
  request: CompanionPairingChallengeRequest,
): CompanionPairingChallengeResult {
  const hostCheck = validatePrivateLanHost(request.host);
  if (!hostCheck.allowed || hostCheck.scope === null || hostCheck.transportHint === null) {
    return { ok: false, errorCode: "PUBLIC_HOST_REJECTED", reason: hostCheck.reason };
  }
  if (!Number.isInteger(request.port) || request.port < 1 || request.port > 65535) {
    return { ok: false, errorCode: "INVALID_PORT", reason: "포트 번호는 1~65535 범위의 정수여야 합니다." };
  }
  if (request.pin !== undefined && !/^[0-9]{6}$/.test(request.pin)) {
    return { ok: false, errorCode: "INVALID_PIN_FORMAT", reason: "페어링 PIN은 정확히 6자리 숫자여야 합니다." };
  }

  const ttlMs = Math.min(MAX_PAIRING_TTL_MS, Math.max(MIN_PAIRING_TTL_MS, request.ttlMs ?? DEFAULT_PAIRING_TTL_MS));
  const expiresAtMs = request.issuedAtMs + ttlMs;
  const material = `${generateEphemeralSeed(request)}|${hostCheck.normalizedHost}|${request.port}|${request.hostDeviceId}|${request.issuedAtMs}`;
  const challengeId = `lan-${sha256Hex(`cid|${material}`).slice(0, 16)}`;
  const hostNonceHex = sha256Hex(`nonce|${material}`).slice(0, 32);
  const pinDigest = sha256Bytes(`toonstudio-lan-pin-v1|${material}`);
  const pin = request.pin ?? String(new DataView(pinDigest.buffer).getUint32(0, false) % 1_000_000).padStart(6, "0");
  const pairingFingerprint = sha256Hex(`toonstudio-lan-v1|${hostCheck.normalizedHost}|${request.port}|${challengeId}|${hostNonceHex}`);
  const qrUri =
    `toonstudio-lan://pair?v=${WIRE_PROTOCOL_VERSION}&host=${encodeURIComponent(hostCheck.normalizedHost)}` +
    `&port=${request.port}&cid=${encodeURIComponent(challengeId)}&nonce=${hostNonceHex}&fp=${pairingFingerprint.slice(0, 16)}&exp=${expiresAtMs}`;

  return {
    ok: true,
    challenge: {
      protocolVersion: WIRE_PROTOCOL_VERSION,
      challengeId,
      host: hostCheck.normalizedHost,
      port: request.port,
      hostScope: hostCheck.scope,
      transportHint: hostCheck.transportHint,
      hostDeviceId: request.hostDeviceId,
      hostNonceHex,
      pin,
      pairingFingerprint,
      qrUri,
      issuedAtMs: request.issuedAtMs,
      expiresAtMs,
    },
  };
}

/** 태블릿 측에서 6자리 PIN과 챌린지 정보로 상호 인증 HMAC-SHA256 응답을 생성한다. */
export function buildCompanionPairingResponse(params: BuildPairingResponseParams): CompanionPairingResponse {
  const psk = derivePairingPsk(params.pin, params.challengeId, params.host.trim().toLowerCase(), params.port);
  const msg = `client-proof|${params.challengeId}|${params.hostNonceHex}|${params.tabletNonceHex}|${params.tabletDeviceId}`;
  return {
    challengeId: params.challengeId,
    tabletDeviceId: params.tabletDeviceId,
    tabletNonceHex: params.tabletNonceHex,
    tabletProofHex: hmacSha256Hex(psk, msg),
    respondedAtMs: params.respondedAtMs,
  };
}

/** 데스크톱 호스트가 태블릿 페어링 응답을 검증하고 상호 확인 태그(`hostAckHex`)와 세션 키를 발급한다. */
export function verifyCompanionPairingResponse(params: VerifyPairingResponseParams): CompanionPairingVerificationResult {
  const { challenge, response, nowMs, replayGuard } = params;
  const skewMs = Math.max(0, params.clockSkewToleranceMs ?? DEFAULT_CLOCK_SKEW_MS);
  const hostCheck = validatePrivateLanHost(challenge.host);
  if (!hostCheck.allowed || hostCheck.scope === null || hostCheck.transportHint === null) {
    return { ok: false, errorCode: "PUBLIC_HOST_REJECTED", reason: hostCheck.reason };
  }
  if (response.challengeId !== challenge.challengeId) {
    return { ok: false, errorCode: "INVALID_PIN_OR_PROOF", reason: "챌린지 식별자가 일치하지 않습니다." };
  }
  if (nowMs > challenge.expiresAtMs || nowMs < challenge.issuedAtMs - skewMs) {
    return { ok: false, errorCode: "CHALLENGE_EXPIRED", reason: "페어링 챌린지 유효 시간이 만료되었습니다." };
  }
  if (!/^[0-9a-fA-F]{16,128}$/.test(response.tabletNonceHex)) {
    return { ok: false, errorCode: "INVALID_NONCE_FORMAT", reason: "태블릿 논스는 16자 이상의 16진수여야 합니다." };
  }
  const nonceKey = `${challenge.challengeId}:${response.tabletNonceHex.toLowerCase()}`;
  if (replayGuard && replayGuard.hasSeen(nonceKey, nowMs)) {
    return { ok: false, errorCode: "NONCE_REPLAYED", reason: "이미 사용된 페어링 논스 재전송이 차단되었습니다." };
  }

  const psk = derivePairingPsk(challenge.pin, challenge.challengeId, hostCheck.normalizedHost, challenge.port);
  const suffix = `${challenge.challengeId}|${challenge.hostNonceHex}|${response.tabletNonceHex}|${response.tabletDeviceId}`;
  const expectedProof = hmacSha256Hex(psk, `client-proof|${suffix}`);
  if (!constantTimeEqualHex(expectedProof, response.tabletProofHex.toLowerCase())) {
    return { ok: false, errorCode: "INVALID_PIN_OR_PROOF", reason: "PIN 또는 HMAC 인증 증명이 일치하지 않습니다." };
  }
  if (replayGuard) replayGuard.record(nonceKey, nowMs);

  const hostAckHex = hmacSha256Hex(psk, `host-ack|${suffix}`);
  const sessionKeyHex = hmacSha256Hex(psk, `session-key|${suffix}`);
  return {
    ok: true,
    session: {
      sessionId: `sess-${sha256Hex(`sid|${sessionKeyHex}|${nowMs}`).slice(0, 16)}`,
      challengeId: challenge.challengeId,
      host: hostCheck.normalizedHost,
      port: challenge.port,
      hostScope: hostCheck.scope,
      transportHint: hostCheck.transportHint,
      hostDeviceId: challenge.hostDeviceId,
      tabletDeviceId: response.tabletDeviceId,
      hostAckHex,
      sessionKeyHex,
      establishedAtMs: nowMs,
    },
  };
}

/** 태블릿 측에서 데스크톱 호스트의 `hostAckHex` 상호 인증 응답을 검증한다. */
export function verifyCompanionHostAck(params: {
  readonly challengeId: string;
  readonly host: string;
  readonly port: number;
  readonly hostNonceHex: string;
  readonly pin: string;
  readonly tabletDeviceId: string;
  readonly tabletNonceHex: string;
  readonly hostAckHex: string;
}): boolean {
  const psk = derivePairingPsk(params.pin, params.challengeId, params.host.trim().toLowerCase(), params.port);
  const expectedAck = hmacSha256Hex(
    psk,
    `host-ack|${params.challengeId}|${params.hostNonceHex}|${params.tabletNonceHex}|${params.tabletDeviceId}`,
  );
  return constantTimeEqualHex(expectedAck, params.hostAckHex.toLowerCase());
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function normalizeAzimuth(rad: number): number {
  if (!Number.isFinite(rad)) return 0;
  const wrapped = rad % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

function packPenFlags(flags: PenSampleFlags): number {
  return (
    (flags.penDown ? PEN_FLAG_DOWN : 0) |
    (flags.hover ? PEN_FLAG_HOVER : 0) |
    (flags.eraser ? PEN_FLAG_ERASER : 0) |
    (flags.barrelBtn ? PEN_FLAG_BARREL_BTN : 0) |
    (flags.palmReject ? PEN_FLAG_PALM_REJECT : 0) |
    (flags.predicted ? PEN_FLAG_PREDICTED : 0)
  );
}

function unpackPenFlags(bits: number): PenSampleFlags {
  return {
    penDown: (bits & PEN_FLAG_DOWN) !== 0,
    hover: (bits & PEN_FLAG_HOVER) !== 0,
    eraser: (bits & PEN_FLAG_ERASER) !== 0,
    barrelBtn: (bits & PEN_FLAG_BARREL_BTN) !== 0,
    palmReject: (bits & PEN_FLAG_PALM_REJECT) !== 0,
    predicted: (bits & PEN_FLAG_PREDICTED) !== 0,
  };
}

function writePenRecord(view: DataView, offset: number, sample: PenSample): void {
  view.setUint32(offset + 0, sample.sequence >>> 0, true);
  view.setUint32(offset + 4, sample.timestampUs >>> 0, true);
  view.setUint16(offset + 8, Math.round(clamp(sample.xNorm, 0, 1) * U16_MAX), true);
  view.setUint16(offset + 10, Math.round(clamp(sample.yNorm, 0, 1) * U16_MAX), true);
  view.setUint16(offset + 12, Math.round(clamp(sample.pressure, 0, 1) * U16_MAX), true);
  view.setInt16(offset + 14, Math.round((clamp(sample.altitudeRad, -HALF_PI, HALF_PI) / HALF_PI) * I16_SCALE), true);
  view.setUint16(offset + 16, Math.round((normalizeAzimuth(sample.azimuthRad) / TWO_PI) * U16_MAX) & 0xffff, true);
  view.setInt16(offset + 18, Math.round((clamp(sample.barrelRoll, -Math.PI, Math.PI) / Math.PI) * I16_SCALE), true);
  view.setUint16(offset + 20, Math.round(clamp(sample.hoverHeight, 0, 1) * U16_MAX), true);
  view.setUint16(offset + 22, packPenFlags(sample.flags), true);
}

function readPenRecord(view: DataView, offset: number): PenSample {
  return {
    sequence: view.getUint32(offset + 0, true),
    timestampUs: view.getUint32(offset + 4, true),
    xNorm: view.getUint16(offset + 8, true) / U16_MAX,
    yNorm: view.getUint16(offset + 10, true) / U16_MAX,
    pressure: view.getUint16(offset + 12, true) / U16_MAX,
    altitudeRad: (view.getInt16(offset + 14, true) / I16_SCALE) * HALF_PI,
    azimuthRad: (view.getUint16(offset + 16, true) / U16_MAX) * TWO_PI,
    barrelRoll: (view.getInt16(offset + 18, true) / I16_SCALE) * Math.PI,
    hoverHeight: view.getUint16(offset + 20, true) / U16_MAX,
    flags: unpackPenFlags(view.getUint16(offset + 22, true)),
  };
}

function validateHeaderAndCrc(
  packet: Uint8Array,
  expectedKind: number,
): { readonly ok: true; readonly crc32: number } | { readonly ok: false; readonly errorCode: WireDecodeErrorCode; readonly reason: string } {
  if (packet.length < 8) return { ok: false, errorCode: "INVALID_LENGTH", reason: "패킷 길이가 최소 헤더 크기보다 작습니다." };
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const payloadEnd = packet.byteLength - WIRE_CRC_TRAILER_BYTES;
  const actualCrc = computeCrc32(packet, 0, payloadEnd);
  if (actualCrc !== view.getUint32(payloadEnd, true)) {
    return { ok: false, errorCode: "CRC_MISMATCH", reason: "IEEE CRC-32 체크섬 불일치로 손상 패킷을 폐기했습니다." };
  }
  if (packet[0] !== WIRE_MAGIC_BYTE_0 || packet[1] !== WIRE_MAGIC_BYTE_1) {
    return { ok: false, errorCode: "INVALID_MAGIC", reason: "바이너리 프레임 매직 바이트가 일치하지 않습니다." };
  }
  if (packet[2] !== WIRE_PROTOCOL_VERSION) {
    return { ok: false, errorCode: "UNSUPPORTED_VERSION", reason: `지원하지 않는 프로토콜 버전(${packet[2] ?? 0})입니다.` };
  }
  if (packet[3] !== expectedKind) {
    return { ok: false, errorCode: "UNEXPECTED_PACKET_KIND", reason: `예상과 다른 패킷 종류(${packet[3] ?? 0})입니다.` };
  }
  return { ok: true, crc32: actualCrc };
}

/** 단일 펜 샘플을 정확히 32바이트 리틀엔디언 바이너리 프레임(+CRC-32)으로 인코딩한다. */
export function encodePenSamplePacket(sample: PenSample): Uint8Array {
  const buf = new Uint8Array(PEN_SAMPLE_PACKET_BYTES);
  buf[0] = WIRE_MAGIC_BYTE_0; buf[1] = WIRE_MAGIC_BYTE_1;
  buf[2] = WIRE_PROTOCOL_VERSION; buf[3] = PACKET_KIND_PEN_SAMPLE;
  const view = new DataView(buf.buffer);
  writePenRecord(view, 4, sample);
  view.setUint32(28, computeCrc32(buf, 0, 28), true);
  return buf;
}

/** 32바이트 바이너리 펜 샘플 프레임을 검증·디코딩한다(1비트 손상도 fail-closed 거부). */
export function decodePenSamplePacket(packet: Uint8Array): WireDecodeResult<PenSample> {
  if (packet.byteLength !== PEN_SAMPLE_PACKET_BYTES) {
    return { ok: false, errorCode: "INVALID_LENGTH", reason: `단일 펜 패킷은 ${PEN_SAMPLE_PACKET_BYTES}바이트여야 합니다.` };
  }
  const check = validateHeaderAndCrc(packet, PACKET_KIND_PEN_SAMPLE);
  if (!check.ok) return check;
  return { ok: true, value: readPenRecord(new DataView(packet.buffer, packet.byteOffset, packet.byteLength), 4), crc32: check.crc32 };
}

/** 240Hz/480Hz 다중 펜 샘플 배치를 단일 LAN MTU 안의 바이너리 프레임으로 인코딩한다. */
export function encodePenBatchPacket(batch: PenBatchPacket): Uint8Array {
  const count = batch.samples.length;
  if (count < 1 || count > PEN_BATCH_MAX_SAMPLES) {
    throw new RangeError(`펜 배치 샘플 수는 1~${PEN_BATCH_MAX_SAMPLES}개 범위여야 합니다.`);
  }
  const totalBytes = PEN_BATCH_HEADER_BYTES + count * PEN_SAMPLE_RECORD_BYTES + WIRE_CRC_TRAILER_BYTES;
  const buf = new Uint8Array(totalBytes);
  buf[0] = WIRE_MAGIC_BYTE_0; buf[1] = WIRE_MAGIC_BYTE_1;
  buf[2] = WIRE_PROTOCOL_VERSION; buf[3] = PACKET_KIND_PEN_BATCH;
  const view = new DataView(buf.buffer);
  view.setUint16(4, count, true);
  view.setUint16(6, Math.round(clamp(batch.sampleRateHz, 60, 2000)), true);
  for (let i = 0; i < count; i += 1) {
    const sample = batch.samples[i];
    if (sample) writePenRecord(view, PEN_BATCH_HEADER_BYTES + i * PEN_SAMPLE_RECORD_BYTES, sample);
  }
  view.setUint32(totalBytes - WIRE_CRC_TRAILER_BYTES, computeCrc32(buf, 0, totalBytes - WIRE_CRC_TRAILER_BYTES), true);
  return buf;
}

/** 다중 펜 샘플 배치 바이너리 프레임을 무결성 검증 후 디코딩한다. */
export function decodePenBatchPacket(packet: Uint8Array): WireDecodeResult<PenBatchPacket> {
  const minBytes = PEN_BATCH_HEADER_BYTES + PEN_SAMPLE_RECORD_BYTES + WIRE_CRC_TRAILER_BYTES;
  if (packet.byteLength < minBytes) {
    return { ok: false, errorCode: "INVALID_LENGTH", reason: "펜 배치 패킷 길이가 최소 크기보다 작습니다." };
  }
  const check = validateHeaderAndCrc(packet, PACKET_KIND_PEN_BATCH);
  if (!check.ok) return check;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const count = view.getUint16(4, true);
  const sampleRateHz = view.getUint16(6, true);
  if (count < 1 || count > PEN_BATCH_MAX_SAMPLES || packet.byteLength !== PEN_BATCH_HEADER_BYTES + count * PEN_SAMPLE_RECORD_BYTES + WIRE_CRC_TRAILER_BYTES) {
    return { ok: false, errorCode: "INVALID_BATCH_COUNT", reason: "배치 샘플 수와 패킷 바이트 길이가 일치하지 않습니다." };
  }
  const samples: PenSample[] = [];
  for (let i = 0; i < count; i += 1) samples.push(readPenRecord(view, PEN_BATCH_HEADER_BYTES + i * PEN_SAMPLE_RECORD_BYTES));
  return { ok: true, value: { sampleRateHz, samples }, crc32: check.crc32 };
}

const DIAL_KIND_TO_CODE: Record<TactileDialKind, number> = {
  "brush-size": 1, "opacity": 2, "canvas-rotation": 3, "undo-scrub": 4, "wet-paint-mixer-swatch": 5,
};
const CODE_TO_DIAL_KIND: Record<number, TactileDialKind | undefined> = {
  1: "brush-size", 2: "opacity", 3: "canvas-rotation", 4: "undo-scrub", 5: "wet-paint-mixer-swatch",
};

/** 촉각 다이얼·휠·원형 단축 팔레트 이벤트를 32바이트 바이너리 프레임으로 인코딩한다. */
export function encodeTactileDialEvent(event: TactileDialEvent): Uint8Array {
  const buf = new Uint8Array(TACTILE_DIAL_PACKET_BYTES);
  buf[0] = WIRE_MAGIC_BYTE_0; buf[1] = WIRE_MAGIC_BYTE_1;
  buf[2] = WIRE_PROTOCOL_VERSION; buf[3] = PACKET_KIND_TACTILE_DIAL;
  const view = new DataView(buf.buffer);
  view.setUint32(4, event.sequence >>> 0, true);
  view.setUint32(8, event.timestampUs >>> 0, true);
  buf[12] = DIAL_KIND_TO_CODE[event.kind];
  buf[13] = (event.isCommit ? DIAL_FLAG_COMMIT : 0) | (event.hapticDetent ? DIAL_FLAG_HAPTIC_DETENT : 0) | (event.finePrecision ? DIAL_FLAG_FINE_PRECISION : 0);
  view.setInt16(14, Math.round(clamp(event.stepDelta, -32768, 32767)), true);
  view.setFloat32(16, Number.isFinite(event.normalizedValue) ? event.normalizedValue : 0, true);
  const rgba = event.swatchRgba ?? { r: 0, g: 0, b: 0, a: 255 };
  buf[20] = Math.round(clamp(rgba.r, 0, 255)); buf[21] = Math.round(clamp(rgba.g, 0, 255));
  buf[22] = Math.round(clamp(rgba.b, 0, 255)); buf[23] = Math.round(clamp(rgba.a, 0, 255));
  view.setUint16(24, Math.round(clamp(event.wetness ?? 0, 0, 1) * U16_MAX), true);
  view.setUint16(26, Math.round(clamp(event.swatchSlotIndex ?? 0, 0, U16_MAX)), true);
  view.setUint32(28, computeCrc32(buf, 0, 28), true);
  return buf;
}

/** 32바이트 촉각 다이얼·팔레트 바이너리 프레임을 무결성 검증 후 디코딩한다. */
export function decodeTactileDialEvent(packet: Uint8Array): WireDecodeResult<TactileDialEvent> {
  if (packet.byteLength !== TACTILE_DIAL_PACKET_BYTES) {
    return { ok: false, errorCode: "INVALID_LENGTH", reason: `촉각 다이얼 패킷은 ${TACTILE_DIAL_PACKET_BYTES}바이트여야 합니다.` };
  }
  const check = validateHeaderAndCrc(packet, PACKET_KIND_TACTILE_DIAL);
  if (!check.ok) return check;
  const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
  const kind = CODE_TO_DIAL_KIND[packet[12] ?? 0];
  if (!kind) return { ok: false, errorCode: "UNKNOWN_DIAL_KIND", reason: `알 수 없는 촉각 다이얼 코드(${packet[12] ?? 0})입니다.` };
  const flags = packet[13] ?? 0;
  return {
    ok: true,
    crc32: check.crc32,
    value: {
      sequence: view.getUint32(4, true),
      timestampUs: view.getUint32(8, true),
      kind,
      stepDelta: view.getInt16(14, true),
      normalizedValue: view.getFloat32(16, true),
      isCommit: (flags & DIAL_FLAG_COMMIT) !== 0,
      hapticDetent: (flags & DIAL_FLAG_HAPTIC_DETENT) !== 0,
      finePrecision: (flags & DIAL_FLAG_FINE_PRECISION) !== 0,
      swatchRgba: { r: packet[20] ?? 0, g: packet[21] ?? 0, b: packet[22] ?? 0, a: packet[23] ?? 0 },
      wetness: view.getUint16(24, true) / U16_MAX,
      swatchSlotIndex: view.getUint16(26, true),
    },
  };
}
