/**
 * 어시스턴트 제로-트러스트 영역·레이어별 암호화 체크아웃 및 원자적 체크인 엔진 (Wave 79).
 *
 * - 외부 암호 패키지 무의존 순수 동기 FIPS 180-4 SHA-256 + RFC 2104 HMAC-SHA256 +
 *   SHA-256-CTR(Encrypt-then-MAC) 구현
 * - 메인 작가가 지정한 `(cutIds, allowedLayerRoles)`만 암호화해 배포하고, 미배정 컷·보호 레이어는
 *   0바이트 익명 스텁으로만 남겨 평문이 1바이트도 포함되지 않도록 보장(`unassignedLayerBytesExposed === 0`)
 * - 체크인 시 리스 봉인, 어시스턴트 HMAC, 암호문 무결성, 만료 시각, 컷·레이어 쓰기 ACL,
 *   기준 다이제스트(`baseSliceDigests`) 충돌을 전수 검사해 위반 시 원자적 거부(fail-closed)
 */

// ---------------------------------------------------------------------------
// 1. 순수 동기 FIPS 180-4 SHA-256 / RFC 2104 HMAC-SHA256 / SHA-256-CTR 유틸리티
// ---------------------------------------------------------------------------

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

/** UTF-8 문자열을 바이트 배열로 인코딩한다. */
export function utf8Encode(text: string): Uint8Array {
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

/** UTF-8 바이트 배열을 문자열로 디코딩한다. */
export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0;
    if (b0 < 0x80) out += String.fromCharCode(b0);
    else if ((b0 & 0xe0) === 0xc0) out += String.fromCharCode(((b0 & 0x1f) << 6) | ((bytes[i++] ?? 0) & 0x3f));
    else if ((b0 & 0xf0) === 0xe0) {
      const b1 = bytes[i++] ?? 0;
      const b2 = bytes[i++] ?? 0;
      out += String.fromCharCode(((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f));
    } else {
      const b1 = bytes[i++] ?? 0;
      const b2 = bytes[i++] ?? 0;
      const b3 = bytes[i++] ?? 0;
      const cp = (((b0 & 0x07) << 18) | ((b1 & 0x3f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >>> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

/** 바이트 배열을 소문자 16진수 문자열로 변환한다. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  return hex;
}

/** 16진수 문자열을 바이트 배열로 복원한다. 형식이 틀리면 `null`을 반환한다. */
export function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function rotr32(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** FIPS 180-4 SHA-256 다이제스트(32바이트)를 순수 동기로 계산한다. */
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

  let h0 = SHA256_H0[0] ?? 0; let h1 = SHA256_H0[1] ?? 0;
  let h2 = SHA256_H0[2] ?? 0; let h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0; let h5 = SHA256_H0[5] ?? 0;
  let h6 = SHA256_H0[6] ?? 0; let h7 = SHA256_H0[7] ?? 0;
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
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const outView = new DataView(digest.buffer);
  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  for (let i = 0; i < 8; i += 1) outView.setUint32(i * 4, words[i] ?? 0, false);
  return digest;
}

/** FIPS 180-4 SHA-256 64자리 소문자 16진수 다이제스트를 반환한다. */
export function sha256Hex(input: Uint8Array | string): string {
  return bytesToHex(sha256Bytes(input));
}

/** RFC 2104 HMAC-SHA256 64자리 소문자 16진수 MAC을 계산한다. */
export function hmacSha256Hex(key: Uint8Array | string, message: Uint8Array | string): string {
  const keyRaw = typeof key === "string" ? utf8Encode(key) : key;
  const msgBytes = typeof message === "string" ? utf8Encode(message) : message;
  const blockKey = new Uint8Array(64);
  blockKey.set(keyRaw.length > 64 ? sha256Bytes(keyRaw) : keyRaw);
  const oKeyPad = new Uint8Array(96);
  const iKeyPad = new Uint8Array(64 + msgBytes.length);
  for (let i = 0; i < 64; i += 1) {
    const kb = blockKey[i] ?? 0;
    oKeyPad[i] = kb ^ 0x5c;
    iKeyPad[i] = kb ^ 0x36;
  }
  iKeyPad.set(msgBytes, 64);
  oKeyPad.set(sha256Bytes(iKeyPad), 64);
  return bytesToHex(sha256Bytes(oKeyPad));
}

/** SHA-256-CTR 키스트림 XOR 변환(Encrypt-then-MAC 봉투 내부 스트림 암호화용). */
export function sha256CtrXor(keyBytes: Uint8Array, nonceHex: string, input: Uint8Array): Uint8Array {
  const out = new Uint8Array(input.length);
  const nonceBytes = utf8Encode(nonceHex);
  let counter = 0;
  for (let offset = 0; offset < input.length; offset += 32) {
    const blockInput = new Uint8Array(keyBytes.length + nonceBytes.length + 4);
    blockInput.set(keyBytes, 0);
    blockInput.set(nonceBytes, keyBytes.length);
    new DataView(blockInput.buffer).setUint32(keyBytes.length + nonceBytes.length, counter, false);
    const keystream = sha256Bytes(blockInput);
    const limit = Math.min(32, input.length - offset);
    for (let i = 0; i < limit; i += 1) out[offset + i] = (input[offset + i] ?? 0) ^ (keystream[i] ?? 0);
    counter += 1;
  }
  return out;
}

/** 타이밍 측채널 노출을 줄이는 상수 시간 문자열 비교. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 객체 키를 재귀적으로 사전순 정렬한 결정론적 정규 JSON 직렬화 문자열을 생성한다. */
export function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalSerialize(item)).join(",")}]`;
  if (ArrayBuffer.isView(value)) {
    const arr = Array.from(value as Uint8Array | Int8Array | Float32Array);
    return `[${arr.map((n) => JSON.stringify(n)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item !== undefined) entries.push(`${JSON.stringify(key)}:${canonicalSerialize(item)}`);
  }
  return `{${entries.join(",")}}`;
}

// ---------------------------------------------------------------------------
// 2. 제로-트러스트 컷·레이어 스코프 체크아웃 도메인 계약
// ---------------------------------------------------------------------------

export type AssistantLayerRole = "lineart" | "flat-color" | "shading" | "background" | "lettering-sfx";
export type ProtectedLayerRole = "rough-script" | "master-character-sheet" | "director-notes" | "unreleased-finale" | "rights-metadata";
export type EpisodeLayerRole = AssistantLayerRole | ProtectedLayerRole;
export type ScopedCheckoutDenialCode =
  | "SCOPE_CUT_DENIED" | "SCOPE_LAYER_DENIED" | "LEASE_EXPIRED"
  | "SIGNATURE_INVALID" | "PAYLOAD_TAMPERED" | "BASE_DIGEST_CONFLICT";

export const ASSISTANT_LAYER_ROLES: readonly AssistantLayerRole[] = [
  "lineart", "flat-color", "shading", "background", "lettering-sfx",
];
const ASSISTANT_ROLE_SET = new Set<string>(ASSISTANT_LAYER_ROLES);

export interface EpisodeLayerSlice {
  readonly layerId: string; readonly role: EpisodeLayerRole; readonly label: string;
  readonly content: string; readonly version: number; readonly updatedBy: string; readonly updatedAtIso: string;
}
export interface EpisodeCutRecord {
  readonly cutId: string; readonly sequenceIndex: number; readonly title: string;
  readonly unreleased?: boolean; readonly layers: readonly EpisodeLayerSlice[];
}
export interface MasterEpisodeManuscript {
  readonly episodeId: string; readonly projectId: string; readonly title: string;
  readonly authorId: string; readonly revision: number; readonly cuts: readonly EpisodeCutRecord[];
}
export interface RedactedStubRecord {
  readonly cutId: string; readonly layerId?: string;
  readonly status: "redacted-unassigned-cut" | "redacted-protected-layer";
  readonly redactedDigestHex: string; readonly byteLengthExposed: 0;
}
export interface ForensicWatermarkTag {
  readonly watermarkId: string; readonly assistantId: string; readonly packageId: string;
  readonly episodeId: string; readonly seedHex: string; readonly invisiblePixelSpreadVector: readonly number[];
}
export interface ScopedCheckoutHeader {
  readonly schemaVersion: "wave79-scoped-checkout/v1";
  readonly packageId: string; readonly episodeId: string; readonly projectId: string;
  readonly authorId: string; readonly assistantId: string;
  readonly allowedCutIds: readonly string[]; readonly allowedLayerRoles: readonly AssistantLayerRole[];
  readonly issuedAtIso: string; readonly expiresAtIso: string; readonly nonceHex: string;
  readonly baseRevision: number; readonly baseSliceDigests: Readonly<Record<string, string>>;
  readonly forensicWatermark: ForensicWatermarkTag; readonly redactedStubs: readonly RedactedStubRecord[];
  readonly unassignedLayerBytesExposed: 0; readonly omittedCutCount: number; readonly omittedLayerCount: number;
  readonly ciphertextDigestHex: string;
}
export interface ScopedAssistantCheckoutPackage {
  readonly header: ScopedCheckoutHeader; readonly ciphertextHex: string;
  readonly authTagHex: string; readonly authorLeaseSealHex: string;
}
export type AssignedCutWorkspace = Omit<EpisodeCutRecord, "unreleased">;
export interface DecryptedCheckoutWorkspace {
  readonly packageId: string; readonly episodeId: string; readonly assistantId: string;
  readonly baseRevision: number; readonly allowedCutIds: readonly string[];
  readonly allowedLayerRoles: readonly AssistantLayerRole[];
  readonly forensicWatermark: ForensicWatermarkTag; readonly cuts: readonly AssignedCutWorkspace[];
  readonly baseSliceDigests: Readonly<Record<string, string>>;
}
export interface CreateScopedCheckoutParams {
  readonly manuscript: MasterEpisodeManuscript; readonly packageId: string; readonly assistantId: string;
  readonly allowedCutIds: readonly string[]; readonly allowedLayerRoles: readonly AssistantLayerRole[];
  readonly issuedAtIso: string; readonly expiresAtIso: string;
  readonly authorMasterSecret: string; readonly assistantKey: string; readonly nonceHex?: string;
}
export interface OpenScopedCheckoutParams {
  readonly assistantId: string; readonly assistantKey: string; readonly nowIso: string; readonly authorMasterSecret?: string;
}
export type OpenScopedCheckoutResult =
  | { readonly ok: true; readonly denialCode: null; readonly reason: null; readonly workspace: DecryptedCheckoutWorkspace }
  | { readonly ok: false; readonly denialCode: ScopedCheckoutDenialCode; readonly reason: string; readonly workspace: null };

export interface AssistantEditedLayerSlice {
  readonly cutId: string; readonly layerId: string; readonly role: EpisodeLayerRole;
  readonly label?: string; readonly content: string; readonly baseDigestHex: string | null;
}
export interface SubmitAssistantWorkSliceParams {
  readonly checkoutPackage: ScopedAssistantCheckoutPackage; readonly submissionId: string;
  readonly assistantId: string; readonly assistantKey: string; readonly submittedAtIso: string;
  readonly editedSlices: readonly AssistantEditedLayerSlice[]; readonly nonceHex?: string;
}
export interface AssistantSubmissionHeader {
  readonly schemaVersion: "wave79-scoped-checkin/v1";
  readonly submissionId: string; readonly packageId: string; readonly episodeId: string;
  readonly assistantId: string; readonly submittedAtIso: string; readonly nonceHex: string;
  readonly forensicWatermarkId: string; readonly sliceCount: number; readonly ciphertextDigestHex: string;
}
export interface AssistantWorkSliceSubmission {
  readonly header: AssistantSubmissionHeader; readonly ciphertextHex: string; readonly assistantMacHex: string;
}
export interface MergeVerifiedWorkSliceParams {
  readonly manuscript: MasterEpisodeManuscript; readonly checkoutPackage: ScopedAssistantCheckoutPackage;
  readonly submission: AssistantWorkSliceSubmission; readonly authorMasterSecret: string;
  readonly assistantKey: string; readonly nowIso: string;
}
export interface MergeVerifiedWorkSliceResult {
  readonly accepted: boolean; readonly denialCode: ScopedCheckoutDenialCode | null; readonly reason: string | null;
  readonly offendingCutId?: string; readonly offendingLayerId?: string;
  readonly updatedManuscript: MasterEpisodeManuscript; readonly mergedSliceKeys: readonly string[];
  readonly appliedRevision: number; readonly auditCheckInDigestHex: string | null; readonly forensicWatermarkId: string;
}
interface EncryptedCheckoutPayload {
  readonly cuts: readonly AssignedCutWorkspace[]; readonly watermarkSeedHex: string; readonly payloadSha256Hex: string;
}
interface EncryptedSubmissionPayload {
  readonly editedSlices: readonly AssistantEditedLayerSlice[]; readonly watermarkSeedHex: string; readonly payloadSha256Hex: string;
}

// ---------------------------------------------------------------------------
// 3. 내부 키 파생·워터마크·다이제스트 헬퍼
// ---------------------------------------------------------------------------

function makeSliceKey(cutId: string, layerId: string): string {
  return `${cutId}::${layerId}`;
}

/** 개별 레이어 스냅샷의 낙관적 동시성 기준 SHA-256 다이제스트를 계산한다. */
export function computeLayerSliceDigest(cutId: string, layer: EpisodeLayerSlice): string {
  return sha256Hex(
    `wave79-slice-digest:v1:${canonicalSerialize({
      cutId, layerId: layer.layerId, role: layer.role, label: layer.label, content: layer.content, version: layer.version,
    })}`,
  );
}

function parseIsoTimestampMs(iso: string): number | null {
  if (!iso || typeof iso !== "string") return null;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

function deriveScopedKeys(
  sharedKey: string, purpose: "checkout" | "checkin", packageId: string, assistantId: string, nonceHex: string,
): { readonly encKeyBytes: Uint8Array; readonly macKeyHex: string } {
  const ctx = `wave79-${purpose}-kdf:v1:${packageId}:${assistantId}:${nonceHex}`;
  return {
    encKeyBytes: sha256Bytes(`enc:${hmacSha256Hex(sharedKey, `${ctx}:enc`)}`),
    macKeyHex: hmacSha256Hex(sharedKey, `${ctx}:mac`),
  };
}

function deriveForensicWatermark(
  authorMasterSecret: string, packageId: string, assistantId: string, episodeId: string,
): ForensicWatermarkTag {
  const seedHex = hmacSha256Hex(authorMasterSecret, `wave79-forensic-wm:v1:${packageId}:${assistantId}:${episodeId}`);
  const seedBytes = sha256Bytes(`wm-spread:${seedHex}`);
  const spread: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    const val = (seedBytes[i] ?? 0) % 3;
    spread.push(val === 0 ? -1 : val === 1 ? 0 : 1);
  }
  return {
    watermarkId: `wm-${seedHex.slice(0, 16)}`,
    assistantId, packageId, episodeId, seedHex,
    invisiblePixelSpreadVector: spread,
  };
}

function computeCheckoutAuthTag(macKeyHex: string, header: ScopedCheckoutHeader, ciphertextHex: string): string {
  return hmacSha256Hex(macKeyHex, `wave79-checkout-etm:v1:${canonicalSerialize(header)}:${ciphertextHex}`);
}

function computeAuthorLeaseSeal(
  authorMasterSecret: string, header: ScopedCheckoutHeader, ciphertextHex: string, authTagHex: string,
): string {
  return hmacSha256Hex(authorMasterSecret, `wave79-author-lease-seal:v1:${canonicalSerialize(header)}:${ciphertextHex}:${authTagHex}`);
}

function computeSubmissionMac(macKeyHex: string, header: AssistantSubmissionHeader, ciphertextHex: string): string {
  return hmacSha256Hex(macKeyHex, `wave79-checkin-etm:v1:${canonicalSerialize(header)}:${ciphertextHex}`);
}

function failOpen(denialCode: ScopedCheckoutDenialCode, reason: string): OpenScopedCheckoutResult {
  return { ok: false, denialCode, reason, workspace: null };
}

function rejectMerge(
  manuscript: MasterEpisodeManuscript, watermarkId: string, denialCode: ScopedCheckoutDenialCode,
  reason: string, offendingCutId?: string, offendingLayerId?: string,
): MergeVerifiedWorkSliceResult {
  return {
    accepted: false, denialCode, reason,
    ...(offendingCutId !== undefined ? { offendingCutId } : {}),
    ...(offendingLayerId !== undefined ? { offendingLayerId } : {}),
    updatedManuscript: manuscript, mergedSliceKeys: [], appliedRevision: manuscript.revision,
    auditCheckInDigestHex: null, forensicWatermarkId: watermarkId,
  };
}

// ---------------------------------------------------------------------------
// 4. 제로-트러스트 영역·레이어 체크아웃 생성 및 복호화
// ---------------------------------------------------------------------------

/**
 * 메인 작가가 배정한 컷·레이어 역할만 추려 Encrypt-then-MAC으로 봉인한 어시스턴트 체크아웃 패키지를 만든다.
 * 미배정 컷과 보호 레이어는 평문·암호문 어디에도 포함하지 않고 0바이트 익명 스텁만 기록한다.
 */
export function createScopedAssistantCheckoutPackage(
  params: CreateScopedCheckoutParams,
): ScopedAssistantCheckoutPackage {
  if (!params.packageId.trim() || !params.assistantId.trim()) {
    throw new Error("packageId와 assistantId는 비어 있을 수 없습니다.");
  }
  if (!params.authorMasterSecret || !params.assistantKey) {
    throw new Error("authorMasterSecret과 assistantKey가 모두 필요합니다.");
  }
  const issuedMs = parseIsoTimestampMs(params.issuedAtIso);
  const expiresMs = parseIsoTimestampMs(params.expiresAtIso);
  if (issuedMs === null || expiresMs === null || expiresMs <= issuedMs) {
    throw new Error("유효한 issuedAtIso 및 만료 시각(expiresAtIso > issuedAtIso)을 지정해야 합니다.");
  }

  const uniqueCuts = Array.from(new Set(params.allowedCutIds.map((id) => id.trim()).filter(Boolean))).sort();
  if (uniqueCuts.length === 0) throw new Error("최소 1개 이상의 배정 컷(allowedCutIds)이 필요합니다.");

  const uniqueRoles = Array.from(new Set(params.allowedLayerRoles)).sort() as AssistantLayerRole[];
  if (uniqueRoles.length === 0) throw new Error("최소 1개 이상의 허용 레이어 역할이 필요합니다.");
  for (const role of uniqueRoles) {
    if (!ASSISTANT_ROLE_SET.has(role)) throw new Error(`보호 레이어 역할(${role})은 체크아웃에 배정할 수 없습니다.`);
  }

  const allowedCutSet = new Set<string>(uniqueCuts);
  const allowedRoleSet = new Set<string>(uniqueRoles);
  const assignedCuts: AssignedCutWorkspace[] = [];
  const baseSliceDigests: Record<string, string> = {};
  const redactedStubs: RedactedStubRecord[] = [];
  let omittedCutCount = 0;
  let omittedLayerCount = 0;

  for (const cut of params.manuscript.cuts) {
    if (!allowedCutSet.has(cut.cutId)) {
      omittedCutCount += 1;
      omittedLayerCount += cut.layers.length;
      redactedStubs.push({
        cutId: cut.cutId, status: "redacted-unassigned-cut",
        redactedDigestHex: sha256Hex(`redacted-cut:v1:${params.packageId}:${cut.cutId}`), byteLengthExposed: 0,
      });
      continue;
    }
    const scopedLayers: EpisodeLayerSlice[] = [];
    for (const layer of cut.layers) {
      if (allowedRoleSet.has(layer.role)) {
        scopedLayers.push({ ...layer });
        baseSliceDigests[makeSliceKey(cut.cutId, layer.layerId)] = computeLayerSliceDigest(cut.cutId, layer);
      } else {
        omittedLayerCount += 1;
        redactedStubs.push({
          cutId: cut.cutId, layerId: layer.layerId, status: "redacted-protected-layer",
          redactedDigestHex: sha256Hex(`redacted-layer:v1:${params.packageId}:${cut.cutId}:${layer.layerId}`),
          byteLengthExposed: 0,
        });
      }
    }
    assignedCuts.push({ cutId: cut.cutId, sequenceIndex: cut.sequenceIndex, title: cut.title, layers: scopedLayers });
  }

  const nonceHex = params.nonceHex ?? sha256Hex(
    `wave79-checkout-nonce:v1:${params.packageId}:${params.assistantId}:${params.issuedAtIso}:${params.manuscript.revision}`,
  ).slice(0, 32);

  const forensicWatermark = deriveForensicWatermark(
    params.authorMasterSecret, params.packageId, params.assistantId, params.manuscript.episodeId,
  );
  const encryptedPayload: EncryptedCheckoutPayload = {
    cuts: assignedCuts,
    watermarkSeedHex: forensicWatermark.seedHex,
    payloadSha256Hex: sha256Hex(`wave79-checkout-payload:v1:${canonicalSerialize({ cuts: assignedCuts, watermarkSeedHex: forensicWatermark.seedHex })}`),
  };

  const { encKeyBytes, macKeyHex } = deriveScopedKeys(
    params.assistantKey, "checkout", params.packageId, params.assistantId, nonceHex,
  );
  const ciphertextHex = bytesToHex(sha256CtrXor(encKeyBytes, nonceHex, utf8Encode(canonicalSerialize(encryptedPayload))));

  const header: ScopedCheckoutHeader = {
    schemaVersion: "wave79-scoped-checkout/v1",
    packageId: params.packageId, episodeId: params.manuscript.episodeId, projectId: params.manuscript.projectId,
    authorId: params.manuscript.authorId, assistantId: params.assistantId,
    allowedCutIds: uniqueCuts, allowedLayerRoles: uniqueRoles,
    issuedAtIso: params.issuedAtIso, expiresAtIso: params.expiresAtIso, nonceHex,
    baseRevision: params.manuscript.revision, baseSliceDigests, forensicWatermark, redactedStubs,
    unassignedLayerBytesExposed: 0, omittedCutCount, omittedLayerCount,
    ciphertextDigestHex: sha256Hex(ciphertextHex),
  };

  const authTagHex = computeCheckoutAuthTag(macKeyHex, header, ciphertextHex);
  const authorLeaseSealHex = computeAuthorLeaseSeal(params.authorMasterSecret, header, ciphertextHex, authTagHex);
  return { header, ciphertextHex, authTagHex, authorLeaseSealHex };
}

/**
 * 어시스턴트가 전달받은 스코프 체크아웃 패키지를 검증·복호화한다.
 * 키 불일치·타인 ID·리스 만료·1바이트 변조는 복호화 전에 fail-closed 거부한다.
 */
export function openScopedAssistantCheckoutPackage(
  pkg: ScopedAssistantCheckoutPackage, params: OpenScopedCheckoutParams,
): OpenScopedCheckoutResult {
  if (params.assistantId !== pkg.header.assistantId) {
    return failOpen("SIGNATURE_INVALID", "체크아웃 패키지에 지정된 어시스턴트 ID와 요청자가 일치하지 않습니다.");
  }
  if (params.authorMasterSecret !== undefined) {
    const expectedSeal = computeAuthorLeaseSeal(params.authorMasterSecret, pkg.header, pkg.ciphertextHex, pkg.authTagHex);
    if (!constantTimeEqualHex(expectedSeal, pkg.authorLeaseSealHex)) {
      return failOpen("SIGNATURE_INVALID", "메인 작가 리스 봉인 서명이 유효하지 않습니다.");
    }
  }
  const cipherBytes = hexToBytes(pkg.ciphertextHex);
  if (cipherBytes === null || !constantTimeEqualHex(sha256Hex(pkg.ciphertextHex), pkg.header.ciphertextDigestHex)) {
    return failOpen("PAYLOAD_TAMPERED", "체크아웃 암호문 다이제스트가 일치하지 않아 변조가 감지되었습니다.");
  }

  const { encKeyBytes, macKeyHex } = deriveScopedKeys(
    params.assistantKey, "checkout", pkg.header.packageId, pkg.header.assistantId, pkg.header.nonceHex,
  );
  if (!constantTimeEqualHex(computeCheckoutAuthTag(macKeyHex, pkg.header, pkg.ciphertextHex), pkg.authTagHex)) {
    return failOpen("SIGNATURE_INVALID", "어시스턴트 인증 키 또는 HMAC 태그 검증에 실패했습니다.");
  }

  const nowMs = parseIsoTimestampMs(params.nowIso);
  const expiresMs = parseIsoTimestampMs(pkg.header.expiresAtIso);
  if (nowMs === null || expiresMs === null || nowMs > expiresMs) {
    return failOpen("LEASE_EXPIRED", `체크아웃 리스가 만료되었습니다(만료 시각: ${pkg.header.expiresAtIso}).`);
  }

  let parsed: EncryptedCheckoutPayload;
  try {
    parsed = JSON.parse(utf8Decode(sha256CtrXor(encKeyBytes, pkg.header.nonceHex, cipherBytes))) as EncryptedCheckoutPayload;
  } catch {
    return failOpen("PAYLOAD_TAMPERED", "복호화된 체크아웃 페이로드를 파싱할 수 없습니다.");
  }

  const expectedPayloadSha = sha256Hex(
    `wave79-checkout-payload:v1:${canonicalSerialize({ cuts: parsed.cuts, watermarkSeedHex: parsed.watermarkSeedHex })}`,
  );
  if (
    !constantTimeEqualHex(expectedPayloadSha, parsed.payloadSha256Hex ?? "") ||
    !constantTimeEqualHex(parsed.watermarkSeedHex ?? "", pkg.header.forensicWatermark.seedHex)
  ) {
    return failOpen("PAYLOAD_TAMPERED", "복호화 내부 무결성 해시 또는 포렌식 워터마크 시드가 일치하지 않습니다.");
  }

  return {
    ok: true, denialCode: null, reason: null,
    workspace: {
      packageId: pkg.header.packageId, episodeId: pkg.header.episodeId, assistantId: pkg.header.assistantId,
      baseRevision: pkg.header.baseRevision, allowedCutIds: pkg.header.allowedCutIds,
      allowedLayerRoles: pkg.header.allowedLayerRoles, forensicWatermark: pkg.header.forensicWatermark,
      cuts: parsed.cuts, baseSliceDigests: pkg.header.baseSliceDigests,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. 어시스턴트 작업물 암호화 체크인 제출 및 원자적 검증 병합
// ---------------------------------------------------------------------------

/** 어시스턴트가 편집한 슬라이스를 Encrypt-then-MAC 봉투로 포장해 체크인 제출물을 만든다. */
export function submitAssistantWorkSlice(params: SubmitAssistantWorkSliceParams): AssistantWorkSliceSubmission {
  if (!params.submissionId.trim()) throw new Error("submissionId는 비어 있을 수 없습니다.");
  if (params.editedSlices.length === 0) throw new Error("체크인할 편집 슬라이스가 최소 1개 필요합니다.");

  const pkgHeader = params.checkoutPackage.header;
  const nonceHex = params.nonceHex ?? sha256Hex(
    `wave79-checkin-nonce:v1:${params.submissionId}:${pkgHeader.packageId}:${params.assistantId}:${params.submittedAtIso}`,
  ).slice(0, 32);

  const payload: EncryptedSubmissionPayload = {
    editedSlices: params.editedSlices,
    watermarkSeedHex: pkgHeader.forensicWatermark.seedHex,
    payloadSha256Hex: sha256Hex(
      `wave79-checkin-payload:v1:${canonicalSerialize({ editedSlices: params.editedSlices, watermarkSeedHex: pkgHeader.forensicWatermark.seedHex })}`,
    ),
  };
  const { encKeyBytes, macKeyHex } = deriveScopedKeys(
    params.assistantKey, "checkin", pkgHeader.packageId, params.assistantId, nonceHex,
  );
  const ciphertextHex = bytesToHex(sha256CtrXor(encKeyBytes, nonceHex, utf8Encode(canonicalSerialize(payload))));

  const header: AssistantSubmissionHeader = {
    schemaVersion: "wave79-scoped-checkin/v1",
    submissionId: params.submissionId, packageId: pkgHeader.packageId, episodeId: pkgHeader.episodeId,
    assistantId: params.assistantId, submittedAtIso: params.submittedAtIso, nonceHex,
    forensicWatermarkId: pkgHeader.forensicWatermark.watermarkId,
    sliceCount: params.editedSlices.length, ciphertextDigestHex: sha256Hex(ciphertextHex),
  };
  return { header, ciphertextHex, assistantMacHex: computeSubmissionMac(macKeyHex, header, ciphertextHex) };
}

/**
 * 어시스턴트 체크인 제출물을 전 항목 검증한 뒤 마스터 원고에 원자적으로 병합한다.
 * 단 하나의 컷/레이어라도 권한·만료·서명·무결성·기준 다이제스트를 위반하면 전체 병합을 거부한다.
 */
export function mergeVerifiedAssistantWorkSlice(params: MergeVerifiedWorkSliceParams): MergeVerifiedWorkSliceResult {
  const { manuscript, checkoutPackage, submission, authorMasterSecret, assistantKey, nowIso } = params;
  const pkgHeader = checkoutPackage.header;
  const watermarkId = pkgHeader.forensicWatermark.watermarkId;

  const expectedSeal = computeAuthorLeaseSeal(authorMasterSecret, pkgHeader, checkoutPackage.ciphertextHex, checkoutPackage.authTagHex);
  if (!constantTimeEqualHex(expectedSeal, checkoutPackage.authorLeaseSealHex)) {
    return rejectMerge(manuscript, watermarkId, "SIGNATURE_INVALID", "체크아웃 패키지의 메인 작가 리스 봉인 서명이 위조되었거나 손상되었습니다.");
  }
  if (
    submission.header.packageId !== pkgHeader.packageId ||
    submission.header.episodeId !== manuscript.episodeId ||
    pkgHeader.episodeId !== manuscript.episodeId ||
    submission.header.assistantId !== pkgHeader.assistantId
  ) {
    return rejectMerge(manuscript, watermarkId, "SIGNATURE_INVALID", "체크인 제출물의 패키지·회차·어시스턴트 식별자가 리스와 일치하지 않습니다.");
  }

  const cipherBytes = hexToBytes(submission.ciphertextHex);
  if (cipherBytes === null || !constantTimeEqualHex(sha256Hex(submission.ciphertextHex), submission.header.ciphertextDigestHex)) {
    return rejectMerge(manuscript, watermarkId, "PAYLOAD_TAMPERED", "체크인 암호문 다이제스트 불일치로 전송 중 변조가 감지되었습니다.");
  }

  const { encKeyBytes, macKeyHex } = deriveScopedKeys(
    assistantKey, "checkin", pkgHeader.packageId, pkgHeader.assistantId, submission.header.nonceHex,
  );
  if (!constantTimeEqualHex(computeSubmissionMac(macKeyHex, submission.header, submission.ciphertextHex), submission.assistantMacHex)) {
    return rejectMerge(manuscript, watermarkId, "SIGNATURE_INVALID", "어시스턴트 체크인 HMAC 서명이 유효하지 않습니다.");
  }

  const nowMs = parseIsoTimestampMs(nowIso);
  const submittedMs = parseIsoTimestampMs(submission.header.submittedAtIso);
  const expiresMs = parseIsoTimestampMs(pkgHeader.expiresAtIso);
  if (nowMs === null || submittedMs === null || expiresMs === null || nowMs > expiresMs || submittedMs > expiresMs) {
    return rejectMerge(manuscript, watermarkId, "LEASE_EXPIRED", `체크아웃 리스 기한(${pkgHeader.expiresAtIso})이 만료되어 체크인을 거부했습니다.`);
  }

  let parsed: EncryptedSubmissionPayload;
  try {
    parsed = JSON.parse(utf8Decode(sha256CtrXor(encKeyBytes, submission.header.nonceHex, cipherBytes))) as EncryptedSubmissionPayload;
  } catch {
    return rejectMerge(manuscript, watermarkId, "PAYLOAD_TAMPERED", "체크인 암호문 복호화 페이로드를 해석할 수 없습니다.");
  }

  const expectedInnerSha = sha256Hex(
    `wave79-checkin-payload:v1:${canonicalSerialize({ editedSlices: parsed.editedSlices, watermarkSeedHex: parsed.watermarkSeedHex })}`,
  );
  if (
    !Array.isArray(parsed.editedSlices) ||
    parsed.editedSlices.length !== submission.header.sliceCount ||
    !constantTimeEqualHex(expectedInnerSha, parsed.payloadSha256Hex ?? "") ||
    !constantTimeEqualHex(parsed.watermarkSeedHex ?? "", pkgHeader.forensicWatermark.seedHex)
  ) {
    return rejectMerge(manuscript, watermarkId, "PAYLOAD_TAMPERED", "체크인 내부 다이제스트 또는 포렌식 워터마크가 일치하지 않습니다.");
  }

  // 쓰기 범위 ACL + 낙관적 동시성 기준 다이제스트 전수 검사 (원자성 보장)
  const allowedCutSet = new Set<string>(pkgHeader.allowedCutIds);
  const allowedRoleSet = new Set<string>(pkgHeader.allowedLayerRoles);
  const cutById = new Map<string, EpisodeCutRecord>(manuscript.cuts.map((c) => [c.cutId, c]));
  const pendingUpdates = new Map<string, AssistantEditedLayerSlice>();

  for (const slice of parsed.editedSlices) {
    const targetCut = cutById.get(slice.cutId);
    if (!allowedCutSet.has(slice.cutId) || targetCut === undefined) {
      return rejectMerge(manuscript, watermarkId, "SCOPE_CUT_DENIED", `배정되지 않은 컷(${slice.cutId}) 쓰기 시도를 차단했습니다.`, slice.cutId, slice.layerId);
    }
    const existingLayer = targetCut.layers.find((layer) => layer.layerId === slice.layerId);
    if (!allowedRoleSet.has(slice.role) || (existingLayer !== undefined && !allowedRoleSet.has(existingLayer.role))) {
      return rejectMerge(manuscript, watermarkId, "SCOPE_LAYER_DENIED", `허용되지 않은 레이어 역할(${existingLayer?.role ?? slice.role}) 수정 시도를 차단했습니다.`, slice.cutId, slice.layerId);
    }

    const sliceKey = makeSliceKey(slice.cutId, slice.layerId);
    const checkoutBaseDigest = pkgHeader.baseSliceDigests[sliceKey] ?? null;
    if (existingLayer !== undefined) {
      const liveDigest = computeLayerSliceDigest(slice.cutId, existingLayer);
      if (
        checkoutBaseDigest === null || slice.baseDigestHex === null ||
        !constantTimeEqualHex(liveDigest, checkoutBaseDigest) || !constantTimeEqualHex(liveDigest, slice.baseDigestHex)
      ) {
        return rejectMerge(manuscript, watermarkId, "BASE_DIGEST_CONFLICT", `동일 슬라이스(${sliceKey})가 체크아웃 이후 다른 병합으로 변경되어 충돌했습니다.`, slice.cutId, slice.layerId);
      }
    } else if (checkoutBaseDigest !== null || slice.baseDigestHex !== null) {
      return rejectMerge(manuscript, watermarkId, "BASE_DIGEST_CONFLICT", `대상 레이어(${sliceKey})가 삭제되었거나 기준 다이제스트가 일치하지 않습니다.`, slice.cutId, slice.layerId);
    }
    pendingUpdates.set(sliceKey, slice);
  }

  // 검증 통과 — 불변 마스터 원고에 원자적 반영
  const mergedSliceKeys: string[] = [];
  const nextCuts: EpisodeCutRecord[] = manuscript.cuts.map((cut) => {
    let cutChanged = false;
    const updatedLayers: EpisodeLayerSlice[] = cut.layers.map((layer) => {
      const key = makeSliceKey(cut.cutId, layer.layerId);
      const edit = pendingUpdates.get(key);
      if (edit === undefined) return layer;
      cutChanged = true;
      mergedSliceKeys.push(key);
      pendingUpdates.delete(key);
      return {
        layerId: layer.layerId, role: edit.role, label: edit.label ?? layer.label,
        content: edit.content, version: layer.version + 1, updatedBy: pkgHeader.assistantId, updatedAtIso: nowIso,
      };
    });
    for (const [key, edit] of Array.from(pendingUpdates.entries())) {
      if (edit.cutId !== cut.cutId) continue;
      cutChanged = true;
      mergedSliceKeys.push(key);
      pendingUpdates.delete(key);
      updatedLayers.push({
        layerId: edit.layerId, role: edit.role, label: edit.label ?? `${edit.role}-${edit.layerId}`,
        content: edit.content, version: 1, updatedBy: pkgHeader.assistantId, updatedAtIso: nowIso,
      });
    }
    return cutChanged ? { ...cut, layers: updatedLayers } : cut;
  });

  const appliedRevision = manuscript.revision + 1;
  mergedSliceKeys.sort();
  const auditCheckInDigestHex = sha256Hex(
    `wave79-merged-checkin:v1:${canonicalSerialize({
      submissionId: submission.header.submissionId, packageId: pkgHeader.packageId, episodeId: manuscript.episodeId,
      assistantId: pkgHeader.assistantId, appliedRevision, mergedSliceKeys,
      ciphertextDigestHex: submission.header.ciphertextDigestHex,
    })}`,
  );

  return {
    accepted: true, denialCode: null, reason: null,
    updatedManuscript: { ...manuscript, revision: appliedRevision, cuts: nextCuts },
    mergedSliceKeys, appliedRevision, auditCheckInDigestHex, forensicWatermarkId: watermarkId,
  };
}
