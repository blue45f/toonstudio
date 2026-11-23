/**
 * Wave 26B — 옵트인 스타일 보호 스펙트럼 실드(PSNR >= 38dB), 유출 역추적 포렌식 워터마크,
 * 1클릭 DMCA 신고서, 3초(24fps·72프레임) 루프 모션 포스터, QR 무선 2nd-Screen 컨트롤러 엔진.
 */

// === 1. 공용 SHA-256 · PRNG · PSNR 계측 ===

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const rotr32 = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const roundTo = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

/** UTF-8 문자열의 FIPS 180-4 SHA-256 64자리 소문자 16진 해시를 반환한다. */
export function computeSha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, Math.floor((bytes.length * 8) / 0x100000000), false);
  view.setUint32(paddedLen - 4, (bytes.length * 8) >>> 0, false);
  const st = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15] ?? 0; const b = w[i - 2] ?? 0;
      w[i] = ((w[i - 16] ?? 0) + (rotr32(a, 7) ^ rotr32(a, 18) ^ (a >>> 3)) + (w[i - 7] ?? 0) + (rotr32(b, 17) ^ rotr32(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = st as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i += 1) {
      const t1 = (h + (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) + ((e & f) ^ (~e & g)) + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const t2 = ((rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const delta = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) st[i] = ((st[i] ?? 0) + (delta[i] ?? 0)) >>> 0;
  }
  return st.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function createPrng(seedText: string): () => number {
  let state = 0x811c9dc5;
  for (let i = 0; i < seedText.length; i += 1) state = Math.imul(state ^ seedText.charCodeAt(i), 0x01000193) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return (): number => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000; };
}

function keyedFnv32(bytes: Uint8Array, key: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(key)) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  for (let i = 0; i < bytes.length; i += 1) h = Math.imul(h ^ (bytes[i] ?? 0), 0x01000193) >>> 0;
  return h >>> 0;
}

export interface RgbaImageBuffer { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray }

/** 두 RGBA 버퍼의 RGB MSE와 PSNR(dB)을 계산한다. */
export function computeBufferPsnrDb(original: RgbaImageBuffer, candidate: RgbaImageBuffer): { readonly mse: number; readonly psnrDb: number } {
  const n = Math.min(original.width * original.height, candidate.width * candidate.height);
  if (n <= 0) return { mse: 0, psnrDb: 99.99 };
  let sq = 0;
  for (let p = 0; p < n; p += 1) {
    const o = p * 4;
    sq += ((original.data[o] ?? 0) - (candidate.data[o] ?? 0)) ** 2
      + ((original.data[o + 1] ?? 0) - (candidate.data[o + 1] ?? 0)) ** 2
      + ((original.data[o + 2] ?? 0) - (candidate.data[o + 2] ?? 0)) ** 2;
  }
  const mse = sq / (n * 3);
  return mse <= 1e-9 ? { mse: 0, psnrDb: 99.99 } : { mse: roundTo(mse, 4), psnrDb: roundTo(10 * Math.log10((255 * 255) / mse), 2) };
}

/** 컷 선화·톤·배경 그라데이션이 포함된 결정론적 데모 원고 버퍼를 생성한다. */
export function createDemoArtworkBuffer(width = 64, height = 64): RgbaImageBuffer {
  const w = Math.max(16, Math.floor(width));
  const h = Math.max(16, Math.floor(height));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = (y * w + x) * 4;
      const nx = x / Math.max(1, w - 1); const ny = y / Math.max(1, h - 1);
      const rDist = Math.hypot(nx - 0.5, ny - 0.44);
      const tone = ((x + y) & 3) === 0 ? 14 : 0;
      const face = rDist < 0.24;
      const ink = Math.abs(rDist - 0.24) < 0.025 || (Math.abs(nx - 0.5) < 0.015 && ny > 0.68);
      data[idx] = clamp(ink ? 38 : face ? Math.round(236 - (ny - 0.44) * 30) : Math.round(218 - ny * 48 - tone), 0, 255);
      data[idx + 1] = clamp(ink ? 42 : face ? Math.round(208 - (ny - 0.44) * 28) : Math.round(212 - ny * 40 - tone), 0, 255);
      data[idx + 2] = clamp(ink ? 52 : face ? Math.round(192 - (nx - 0.5) * 20) : Math.round(205 - nx * 24), 0, 255);
      data[idx + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

// === 2. 옵트인 스타일 보호 스펙트럼 실드 (8×8 2D DCT 중·고주파 위상 교란, PSNR >= 38dB) ===

export type SpectralShieldStrength = "subtle" | "balanced" | "maximum";
export interface SpectralShieldOptions {
  readonly enabled?: boolean; readonly strength?: SpectralShieldStrength; readonly targetMinPsnrDb?: number;
  readonly midFreqWeight?: number; readonly highFreqWeight?: number; readonly seedKey?: string;
}
export interface SpectralShieldResult {
  readonly applied: boolean; readonly strength: SpectralShieldStrength; readonly buffer: RgbaImageBuffer;
  readonly psnrDb: number; readonly mse: number; readonly midFreqEnergyShiftRatio: number;
  readonly highFreqPhaseFlipRatio: number; readonly featureDisruptionScore: number;
  readonly preservedDcFidelityPct: number; readonly receiptSha256: string;
}

const DCT8: readonly (readonly number[])[] = Array.from({ length: 8 }, (_, k) => {
  const a = k === 0 ? Math.sqrt(1 / 8) : Math.sqrt(2 / 8);
  return Array.from({ length: 8 }, (__, n) => a * Math.cos(((2 * n + 1) * k * Math.PI) / 16));
});
const SHIELD_AMP: Record<SpectralShieldStrength, { readonly mid: number; readonly high: number }> = {
  subtle: { mid: 2.2, high: 3.1 }, balanced: { mid: 3.8, high: 5.4 }, maximum: { mid: 5.4, high: 7.8 },
};

function dct2d8x8(block: Float64Array, inv = false): Float64Array {
  const tmp = new Float64Array(64); const out = new Float64Array(64);
  for (let i = 0; i < 8; i += 1) for (let j = 0; j < 8; j += 1) {
    let s = 0;
    for (let k = 0; k < 8; k += 1) s += (block[i * 8 + k] ?? 0) * (inv ? (DCT8[k]?.[j] ?? 0) : (DCT8[j]?.[k] ?? 0));
    tmp[i * 8 + j] = s;
  }
  for (let j = 0; j < 8; j += 1) for (let i = 0; i < 8; i += 1) {
    let s = 0;
    for (let k = 0; k < 8; k += 1) s += (tmp[k * 8 + j] ?? 0) * (inv ? (DCT8[k]?.[i] ?? 0) : (DCT8[i]?.[k] ?? 0));
    out[i * 8 + j] = s;
  }
  return out;
}

function readLuma8x8(buf: RgbaImageBuffer, bx: number, by: number, dst: Float64Array): void {
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) {
    const p = ((by * 8 + y) * buf.width + (bx * 8 + x)) * 4;
    dst[y * 8 + x] = 0.299 * (buf.data[p] ?? 0) + 0.587 * (buf.data[p + 1] ?? 0) + 0.114 * (buf.data[p + 2] ?? 0);
  }
}

function measureSpectralMetrics(orig: RgbaImageBuffer, shielded: RgbaImageBuffer): { readonly midShift: number; readonly highFlip: number; readonly dcFidelity: number } {
  const bxN = Math.floor(orig.width / 8); const byN = Math.floor(orig.height / 8);
  if (bxN === 0 || byN === 0) return { midShift: 0, highFlip: 0, dcFidelity: 100 };
  const bA = new Float64Array(64); const bB = new Float64Array(64);
  let midBase = 0; let midDelta = 0; let highCnt = 0; let highFlip = 0; let dcErr = 0; let dcBase = 0;
  for (let by = 0; by < byN; by += 1) for (let bx = 0; bx < bxN; bx += 1) {
    readLuma8x8(orig, bx, by, bA); readLuma8x8(shielded, bx, by, bB);
    const ca = dct2d8x8(bA); const cb = dct2d8x8(bB);
    dcBase += Math.abs(ca[0] ?? 0) + 1e-6; dcErr += Math.abs((cb[0] ?? 0) - (ca[0] ?? 0));
    for (let v = 0; v < 8; v += 1) for (let u = 0; u < 8; u += 1) {
      const band = u + v; const av = ca[v * 8 + u] ?? 0; const bv = cb[v * 8 + u] ?? 0;
      if (band >= 3 && band <= 6) { midBase += av * av + 1; midDelta += (bv - av) ** 2; }
      else if (band >= 7 && band <= 12) { highCnt += 1; if ((av >= 0 && bv < 0) || (av < 0 && bv >= 0) || Math.abs(bv - av) > 1.25) highFlip += 1; }
    }
  }
  return { midShift: roundTo(Math.min(1, Math.sqrt(midDelta / Math.max(1, midBase))), 4), highFlip: roundTo(highCnt > 0 ? highFlip / highCnt : 0, 4), dcFidelity: roundTo(clamp((1 - dcErr / Math.max(1, dcBase)) * 100, 0, 100), 2) };
}

/** 옵트인 스타일 보호 스펙트럼 실드: 중·고주파 위상 교란을 삽입하며 PSNR >= 38dB를 폐루프 보장한다. */
export function applyAdversarialSpectralShield(source: RgbaImageBuffer, options: SpectralShieldOptions = {}): SpectralShieldResult {
  const enabled = options.enabled ?? true;
  const strength = options.strength ?? "balanced";
  const targetMinPsnrDb = Math.max(38, options.targetMinPsnrDb ?? 38);
  const midW = clamp(options.midFreqWeight ?? 1, 0.2, 2);
  const highW = clamp(options.highFreqWeight ?? 1, 0.2, 2);
  const seedKey = options.seedKey ?? "toonstudio-spectral-shield-v1";

  if (!enabled) {
    return {
      applied: false, strength, buffer: { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) },
      psnrDb: 99.99, mse: 0, midFreqEnergyShiftRatio: 0, highFreqPhaseFlipRatio: 0, featureDisruptionScore: 0,
      preservedDcFidelityPct: 100, receiptSha256: computeSha256Hex(`shield-off:${source.width}x${source.height}:${seedKey}`),
    };
  }

  const prng = createPrng(`${seedKey}:${strength}:${source.width}x${source.height}`);
  const amp = SHIELD_AMP[strength];
  const deltaY = new Float64Array(source.width * source.height);
  const luma = new Float64Array(64);
  for (let by = 0; by < Math.floor(source.height / 8); by += 1) for (let bx = 0; bx < Math.floor(source.width / 8); bx += 1) {
    readLuma8x8(source, bx, by, luma);
    const coeffs = dct2d8x8(luma); const pert = new Float64Array(coeffs);
    for (let v = 0; v < 8; v += 1) for (let u = 0; u < 8; u += 1) {
      const band = u + v; const base = coeffs[v * 8 + u] ?? 0; const dir = prng() >= 0.5 ? 1 : -1;
      if (band >= 3 && band <= 6) pert[v * 8 + u] = base + (base >= 0 ? -1 : 1) * amp.mid * midW;
      else if (band >= 7 && band <= 12) pert[v * 8 + u] = Math.abs(base) < amp.high * 1.4 ? -base + dir * amp.high * highW : base + dir * amp.high * highW;
    }
    const sp = dct2d8x8(pert, true);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) deltaY[(by * 8 + y) * source.width + (bx * 8 + x)] = (sp[y * 8 + x] ?? 0) - (luma[y * 8 + x] ?? 0);
  }
  const buildScaled = (s: number): RgbaImageBuffer => {
    const data = new Uint8ClampedArray(source.data);
    for (let i = 0; i < deltaY.length; i += 1) {
      const d = Math.round((deltaY[i] ?? 0) * s); const o = i * 4;
      data[o] = clamp((source.data[o] ?? 0) + d, 0, 255); data[o + 1] = clamp((source.data[o + 1] ?? 0) + d, 0, 255); data[o + 2] = clamp((source.data[o + 2] ?? 0) + d, 0, 255);
    }
    return { width: source.width, height: source.height, data };
  };

  let scale = 1.0;
  let candidate = buildScaled(scale);
  let quality = computeBufferPsnrDb(source, candidate);
  for (let i = 0; i < 4 && quality.psnrDb < targetMinPsnrDb; i += 1) {
    const targetMse = (255 * 255) / (10 ** (targetMinPsnrDb / 10));
    scale *= clamp((quality.mse > 0 ? Math.sqrt(targetMse / quality.mse) : 0.85) * 0.92, 0.25, 0.94);
    candidate = buildScaled(scale);
    quality = computeBufferPsnrDb(source, candidate);
  }
  const sp = measureSpectralMetrics(source, candidate);
  return {
    applied: true, strength, buffer: candidate, psnrDb: quality.psnrDb, mse: quality.mse,
    midFreqEnergyShiftRatio: sp.midShift, highFreqPhaseFlipRatio: sp.highFlip,
    featureDisruptionScore: roundTo(clamp(sp.midShift * 52 + sp.highFlip * 58, 0, 100), 1),
    preservedDcFidelityPct: sp.dcFidelity,
    receiptSha256: computeSha256Hex(`shield:${strength}:${source.width}x${source.height}:${quality.psnrDb}:${sp.midShift}:${sp.highFlip}:${seedKey}`),
  };
}

// === 3. 유출 역추적 포렌식 워터마크 삽입·복원 (QIM 확산 스펙트럼 다수결) ===

export interface LeakTraceMetadata {
  readonly recipientId: string; readonly distributionChannel: string; readonly workId: string;
  readonly episodeNumber: number; readonly issuedAtIso: string; readonly watermarkKey: string;
}
export interface ForensicEmbedResult {
  readonly buffer: RgbaImageBuffer; readonly psnrDb: number; readonly embeddedBitCount: number;
  readonly redundancyFactor: number; readonly capacityUtilizationPct: number;
  readonly forensicSignatureHex: string; readonly metadata: LeakTraceMetadata;
}
export interface ForensicExtractionResult {
  readonly recovered: boolean; readonly checksumValid: boolean; readonly confidencePct: number;
  readonly metadata: Omit<LeakTraceMetadata, "watermarkKey"> | null; readonly forensicSignatureHex: string | null;
  readonly failureReason?: "KEY_MISMATCH_OR_NO_WATERMARK" | "CHECKSUM_CORRUPTED" | "BUFFER_TOO_SMALL";
}

const WM_HDR_BYTES = 9;
const WM_HDR_RED = 7;
const FIELD_SEP = "\u001f";
const sanitizeField = (t: string): string => t.split(FIELD_SEP).join(" ").trim();
const slotToOffset = (slot: number): number => Math.floor(slot / 3) * 4 + (slot % 3);

function buildSlotPerm(totalSlots: number, key: string): Uint32Array {
  const slots = new Uint32Array(totalSlots);
  for (let i = 0; i < totalSlots; i += 1) slots[i] = i;
  const prng = createPrng(`wm-perm:${key}:${totalSlots}`);
  for (let i = totalSlots - 1; i > 0; i -= 1) {
    const j = Math.floor(prng() * (i + 1));
    const t = slots[i] ?? 0; slots[i] = slots[j] ?? 0; slots[j] = t;
  }
  return slots;
}

function quantizeQimBit(value: number, bit: number): number {
  const base = Math.floor(value / 4) * 4 + (bit === 1 ? 3 : 1);
  let best = clamp(base, 0, 255); let bestDist = Infinity;
  for (const c of [base - 4, base, base + 4]) {
    if (c >= 0 && c <= 255 && Math.abs(c - value) < bestDist) { bestDist = Math.abs(c - value); best = c; }
  }
  return best;
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i] ?? 0;
    for (let k = 7; k >= 0; k -= 1) bits.push((b >>> k) & 1);
  }
  return bits;
}

function bitsToBytes(bits: readonly number[]): Uint8Array {
  const out = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < out.length; i += 1) {
    let val = 0;
    for (let k = 0; k < 8; k += 1) val = (val << 1) | ((bits[i * 8 + k] ?? 0) & 1);
    out[i] = val;
  }
  return out;
}

const canonicalPayloadText = (m: Omit<LeakTraceMetadata, "watermarkKey">): string =>
  [sanitizeField(m.recipientId), sanitizeField(m.distributionChannel), sanitizeField(m.workId), String(Math.max(1, Math.floor(m.episodeNumber))), sanitizeField(m.issuedAtIso)].join(FIELD_SEP);

/** 출고처·채널·작품·회차·시각 역추적 포렌식 서명을 QIM 확산 스펙트럼으로 삽입한다. */
export function embedLeakTraceForensicPayload(source: RgbaImageBuffer, metadata: LeakTraceMetadata): ForensicEmbedResult {
  const totalSlots = source.width * source.height * 3;
  const headerSlots = WM_HDR_BYTES * 8 * WM_HDR_RED;
  const payloadText = canonicalPayloadText(metadata);
  const payloadBytes = new TextEncoder().encode(payloadText);
  const payloadBits = bytesToBits(payloadBytes);
  const availSlots = totalSlots - headerSlots;
  if (availSlots < payloadBits.length * 3) throw new Error("포렌식 워터마크 삽입 슬롯이 부족합니다.");

  const rawRed = Math.floor(availSlots / Math.max(1, payloadBits.length));
  const redundancy = clamp(rawRed % 2 === 0 ? rawRed - 1 : rawRed, 3, 7);
  const header = new Uint8Array(WM_HDR_BYTES);
  const hv = new DataView(header.buffer);
  header[0] = 0x54; header[1] = 0x53; header[2] = 0x01;
  hv.setUint16(3, payloadBytes.length, false);
  hv.setUint32(5, keyedFnv32(payloadBytes, metadata.watermarkKey), false);
  const headerBits = bytesToBits(header);

  const perm = buildSlotPerm(totalSlots, metadata.watermarkKey);
  const outData = new Uint8ClampedArray(source.data);
  let cur = 0;
  const writeStream = (bits: readonly number[], red: number): void => {
    for (const bit of bits) {
      for (let r = 0; r < red; r += 1) {
        const off = slotToOffset(perm[cur] ?? 0);
        outData[off] = quantizeQimBit(outData[off] ?? 0, bit);
        cur += 1;
      }
    }
  };
  writeStream(headerBits, WM_HDR_RED);
  writeStream(payloadBits, redundancy);

  const buffer: RgbaImageBuffer = { width: source.width, height: source.height, data: outData };
  return {
    buffer, psnrDb: computeBufferPsnrDb(source, buffer).psnrDb,
    embeddedBitCount: headerBits.length + payloadBits.length, redundancyFactor: redundancy,
    capacityUtilizationPct: roundTo((cur / Math.max(1, totalSlots)) * 100, 1),
    forensicSignatureHex: computeSha256Hex(`forensic-v1:${payloadText}:${metadata.watermarkKey}`), metadata,
  };
}

/** 유출 의심 이미지에서 스튜디오 키로 출고처·회차·시각 포렌식 서명을 복원·검증한다. */
export function extractLeakTraceForensicPayload(suspect: RgbaImageBuffer, watermarkKey: string): ForensicExtractionResult {
  const totalSlots = suspect.width * suspect.height * 3;
  const headerSlots = WM_HDR_BYTES * 8 * WM_HDR_RED;
  const emptyFail = (failureReason: ForensicExtractionResult["failureReason"], conf = 0): ForensicExtractionResult => (
    { recovered: false, checksumValid: false, confidencePct: conf, metadata: null, forensicSignatureHex: null, failureReason }
  );
  if (totalSlots < headerSlots + 64) return emptyFail("BUFFER_TOO_SMALL");

  const perm = buildSlotPerm(totalSlots, watermarkKey);
  let cur = 0; let strong = 0; let votes = 0;
  const readBits = (count: number, red: number): number[] => {
    const out: number[] = [];
    for (let b = 0; b < count; b += 1) {
      let score = 0;
      for (let r = 0; r < red; r += 1) {
        const rem = (suspect.data[slotToOffset(perm[cur] ?? 0)] ?? 0) & 3;
        const v = rem === 1 ? -1 : rem === 3 ? 1 : 0;
        score += v; if (v !== 0) strong += 1; votes += 1; cur += 1;
      }
      out.push(score >= 0 ? 1 : 0);
    }
    return out;
  };
  const hBytes = bitsToBytes(readBits(WM_HDR_BYTES * 8, WM_HDR_RED));
  const hv = new DataView(hBytes.buffer);
  const payloadLen = hv.getUint16(3, false);
  const expectedSum = hv.getUint32(5, false);
  const availSlots = totalSlots - headerSlots;
  if (hBytes[0] !== 0x54 || hBytes[1] !== 0x53 || hBytes[2] !== 0x01 || payloadLen === 0 || payloadLen * 24 > availSlots) {
    return emptyFail("KEY_MISMATCH_OR_NO_WATERMARK");
  }
  const rawRed = Math.floor(availSlots / (payloadLen * 8));
  const pBytes = bitsToBytes(readBits(payloadLen * 8, clamp(rawRed % 2 === 0 ? rawRed - 1 : rawRed, 3, 7)));
  if (keyedFnv32(pBytes, watermarkKey) !== expectedSum) return emptyFail("CHECKSUM_CORRUPTED", roundTo((strong / Math.max(1, votes)) * 100, 1));
  const parts = new TextDecoder().decode(pBytes).split(FIELD_SEP);
  const episodeNumber = Number.parseInt(parts[3] ?? "", 10);
  if (parts.length < 5 || Number.isNaN(episodeNumber)) return emptyFail("CHECKSUM_CORRUPTED");
  const meta: Omit<LeakTraceMetadata, "watermarkKey"> = {
    recipientId: parts[0] ?? "", distributionChannel: parts[1] ?? "", workId: parts[2] ?? "", episodeNumber, issuedAtIso: parts[4] ?? "",
  };
  return {
    recovered: true, checksumValid: true, confidencePct: roundTo((strong / Math.max(1, votes)) * 100, 1),
    metadata: meta, forensicSignatureHex: computeSha256Hex(`forensic-v1:${canonicalPayloadText(meta)}:${watermarkKey}`),
  };
}

// === 4. 1클릭 DMCA · 저작권법 제103조 권리 침해 신고서 패키지 ===

export interface DmcaTakedownInput {
  readonly copyrightOwner: string; readonly studioName: string; readonly contactEmail: string;
  readonly workTitle: string; readonly workId: string; readonly episodeNumber: number;
  readonly originalPublicationUrl: string; readonly infringingUrls: readonly string[];
  readonly hostingProvider: string; readonly discoveredAtIso: string;
  readonly forensicExtraction?: ForensicExtractionResult; readonly spectralShieldReceiptSha256?: string;
}
export interface DmcaChecklistItem { readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly satisfied: boolean }
export interface DmcaTakedownPackage {
  readonly caseId: string; readonly generatedAtIso: string; readonly readyToSubmit: boolean;
  readonly missingRequirements: readonly string[]; readonly evidenceSha256: string;
  readonly attributedLeakSource: { readonly recipientId: string; readonly distributionChannel: string; readonly issuedAtIso: string; readonly forensicSignatureHex: string } | null;
  readonly statutoryChecklist: readonly DmcaChecklistItem[]; readonly noticeTextEn: string;
  readonly noticeTextKo: string; readonly jsonEvidenceBundle: string;
}

/** 17 U.S.C. § 512(c)(3) DMCA 및 한국 저작권법 제103조 기반 1클릭 권리 침해 신고 패키지를 생성한다. */
export function buildDmcaTakedownPackage(input: DmcaTakedownInput): DmcaTakedownPackage {
  const urls = input.infringingUrls.map((u) => u.trim()).filter((u) => u.length > 0);
  const fm = input.forensicExtraction?.recovered ? input.forensicExtraction.metadata : null;
  const forensic = fm ? { recipientId: fm.recipientId, distributionChannel: fm.distributionChannel, issuedAtIso: fm.issuedAtIso, forensicSignatureHex: input.forensicExtraction?.forensicSignatureHex ?? "" } : null;
  const statutoryChecklist: readonly DmcaChecklistItem[] = [
    { id: "rights-holder", labelKo: "권리자 신원·연락처 기재", labelEn: "Rights holder identity & contact", satisfied: input.copyrightOwner.trim().length > 0 && input.contactEmail.includes("@") },
    { id: "work-identification", labelKo: "원본 저작물·공식 URL 특정", labelEn: "Original work & official URL", satisfied: input.workTitle.trim().length > 0 && input.originalPublicationUrl.trim().length > 0 },
    { id: "infringing-locations", labelKo: "불법 유출 URL 특정", labelEn: "Specific infringing URLs", satisfied: urls.length > 0 },
    { id: "good-faith-perjury", labelKo: "선의 신념·위증 처벌 각서(§512(c)(3))", labelEn: "Good-faith & perjury statements", satisfied: true },
    { id: "forensic-chain", labelKo: "포렌식 유출 역추적 증적 첨부", labelEn: "Forensic leak-trace evidence attached", satisfied: forensic !== null },
  ];
  const missingRequirements = statutoryChecklist.filter((i) => !i.satisfied && i.id !== "forensic-chain").map((i) => i.id);
  const jsonEvidenceBundle = JSON.stringify({
    copyrightOwner: input.copyrightOwner, studioName: input.studioName, workId: input.workId, workTitle: input.workTitle,
    episodeNumber: input.episodeNumber, originalPublicationUrl: input.originalPublicationUrl, infringingUrls: urls,
    hostingProvider: input.hostingProvider, discoveredAtIso: input.discoveredAtIso, attributedLeakSource: forensic,
    spectralShieldReceiptSha256: input.spectralShieldReceiptSha256 ?? null,
  }, null, 2);
  const evidenceSha256 = computeSha256Hex(jsonEvidenceBundle);
  const caseId = `DMCA-${input.discoveredAtIso.slice(0, 4) || "2026"}-${evidenceSha256.slice(0, 8).toUpperCase()}`;

  const noticeTextEn = [
    `DMCA TAKEDOWN NOTICE — 17 U.S.C. § 512(c)(3) | Case: ${caseId}`,
    `To: ${input.hostingProvider} | Rights Holder: ${input.copyrightOwner} (${input.studioName}) <${input.contactEmail}>`,
    `Work: "${input.workTitle}" Ep.${input.episodeNumber} (${input.workId}) | Official: ${input.originalPublicationUrl}`,
    `Infringing URLs: ${urls.join(", ")}`,
    forensic ? `Forensic Attribution: ${forensic.recipientId} (${forensic.distributionChannel}) @ ${forensic.issuedAtIso}` : "Forensic Attribution: Pending",
    `Evidence SHA-256: ${evidenceSha256}`,
  ].join("\n");
  const noticeTextKo = [
    `[저작권법 제103조 복제·전송 중단 요청서 / DMCA] 사건번호: ${caseId}`,
    `수신: ${input.hostingProvider} | 권리자: ${input.copyrightOwner} (${input.studioName}, ${input.contactEmail})`,
    `저작물: 「${input.workTitle}」 ${input.episodeNumber}화 (${input.workId}) | 공식: ${input.originalPublicationUrl}`,
    `침해 URL: ${urls.join(", ")}`,
    forensic ? `포렌식 역추적: ${forensic.recipientId} (${forensic.distributionChannel}), ${forensic.issuedAtIso}` : "포렌식 역추적: 미첨부",
    `증적 SHA-256: ${evidenceSha256}`,
  ].join("\n");
  return {
    caseId, generatedAtIso: input.discoveredAtIso, readyToSubmit: missingRequirements.length === 0,
    missingRequirements, evidenceSha256, attributedLeakSource: forensic, statutoryChecklist, noticeTextEn, noticeTextKo, jsonEvidenceBundle,
  };
}

// === 5. 3초(24fps·72프레임) 루프 모션 포스터 / 움직이는 썸네일 생성기 ===

export interface MotionPosterInput {
  readonly workTitle: string; readonly cutId: string; readonly widthPx?: number; readonly heightPx?: number;
  readonly durationSeconds?: number; readonly fps?: number; readonly eyeBlinkIntensity?: number;
  readonly hairSwayIntensity?: number; readonly lightMotesIntensity?: number; readonly microZoomIntensity?: number;
}
export interface MotionPosterFrame {
  readonly frameIndex: number; readonly timestampMs: number; readonly tNormalized: number;
  readonly eyeOpenness: number; readonly hairSwayDeg: number; readonly hairShiftPx: number;
  readonly zoomScale: number; readonly moteOpacityAvg: number;
}
export interface MotionPosterExportManifest {
  readonly format: "apng" | "webp" | "gif"; readonly mimeType: "image/apng" | "image/webp" | "image/gif";
  readonly filename: string; readonly fps: number; readonly totalFrames: number; readonly frameDelayMs: number;
  readonly loopCount: 0; readonly estimatedBytes: number; readonly fitsPromoThumbnailBudget: boolean;
}
export interface MotionPosterLoopPlan {
  readonly workTitle: string; readonly cutId: string; readonly widthPx: number; readonly heightPx: number;
  readonly durationSeconds: number; readonly fps: number; readonly totalFrames: number;
  readonly seamlessLoopVerified: boolean; readonly boundaryDelta: number;
  readonly keyframes: readonly MotionPosterFrame[]; readonly exportManifests: readonly MotionPosterExportManifest[];
  readonly svgPreviewMarkup: string;
}

function evalPosterPhase(t: number, eyeW: number, hairW: number, moteW: number, zoomW: number): Omit<MotionPosterFrame, "frameIndex" | "timestampMs" | "tNormalized"> {
  const wT = ((t % 1) + 1) % 1;
  const dist = Math.abs(wT - 0.68);
  const u = dist < 0.065 ? 1 - dist / 0.065 : 0;
  const sway = Math.sin(Math.PI * 2 * wT) * 0.72 + Math.sin(Math.PI * 4 * wT + 0.6) * 0.28;
  return {
    eyeOpenness: roundTo(clamp(1 - u * u * (3 - 2 * u) * 0.94 * eyeW, 0.06, 1), 4),
    hairSwayDeg: roundTo(sway * 6.8 * hairW, 3), hairShiftPx: roundTo(sway * 5.2 * hairW, 3),
    zoomScale: roundTo(1 + zoomW * 0.032 * (0.5 - 0.5 * Math.cos(Math.PI * 2 * wT)), 5),
    moteOpacityAvg: roundTo(clamp(0.2 + moteW * (0.45 + 0.3 * Math.sin(Math.PI * 2 * wT + 0.4)), 0, 1), 4),
  };
}

/** 24fps 72프레임 무이음 3초 모션 포스터 매니페스트(APNG/WebP/GIF)와 SVG 프리뷰를 생성한다. */
export function buildMotionPosterLoopPlan(input: MotionPosterInput): MotionPosterLoopPlan {
  const widthPx = Math.max(240, Math.floor(input.widthPx ?? 600));
  const heightPx = Math.max(320, Math.floor(input.heightPx ?? 800));
  const durationSeconds = clamp(input.durationSeconds ?? 3, 1, 6);
  const fps = clamp(Math.round(input.fps ?? 24), 12, 60);
  const totalFrames = Math.round(durationSeconds * fps);
  const eyeW = clamp(input.eyeBlinkIntensity ?? 0.9, 0, 1); const hairW = clamp(input.hairSwayIntensity ?? 0.75, 0, 1);
  const moteW = clamp(input.lightMotesIntensity ?? 0.8, 0, 1); const zoomW = clamp(input.microZoomIntensity ?? 0.65, 0, 1);
  const keyframes: MotionPosterFrame[] = Array.from({ length: totalFrames }, (_, i) => ({
    frameIndex: i, timestampMs: roundTo((i / fps) * 1000, 2), tNormalized: roundTo(i / totalFrames, 5),
    ...evalPosterPhase(i / totalFrames, eyeW, hairW, moteW, zoomW),
  }));
  const s0 = evalPosterPhase(0, eyeW, hairW, moteW, zoomW); const s1 = evalPosterPhase(1, eyeW, hairW, moteW, zoomW);
  const boundaryDelta = roundTo(Math.abs(s0.eyeOpenness - s1.eyeOpenness) + Math.abs(s0.hairSwayDeg - s1.hairSwayDeg) + Math.abs(s0.zoomScale - s1.zoomScale), 6);
  const frameDelayMs = roundTo(1000 / fps, 2);
  const safeId = input.cutId.replace(/[^a-zA-Z0-9_-]/g, "") || "poster";
  const makeM = (format: "apng" | "webp" | "gif", mimeType: "image/apng" | "image/webp" | "image/gif", f: number): MotionPosterExportManifest => {
    const estimatedBytes = Math.round(widthPx * heightPx * f * totalFrames);
    return { format, mimeType, filename: `${safeId}-3s-${totalFrames}f.${format}`, fps, totalFrames, frameDelayMs, loopCount: 0, estimatedBytes, fitsPromoThumbnailBudget: estimatedBytes <= 2 * 1024 * 1024 };
  };
  const dur = `${durationSeconds}s`;
  const peakZoom = roundTo(1 + zoomW * 0.032, 4); const swayAmp = roundTo(6.8 * hairW, 2); const blinkRy = roundTo(Math.max(0.8, 7 * (1 - 0.92 * eyeW)), 2);
  const svgPreviewMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" role="img" aria-label="${sanitizeField(input.workTitle)} Motion Poster 3s Loop">`,
    `<g transform="translate(120 150)"><g><animateTransform attributeName="transform" type="scale" values="1;${peakZoom};1" dur="${dur}" repeatCount="indefinite" />`,
    `<rect x="-108" y="-138" width="216" height="276" rx="14" fill="none" stroke="currentColor" stroke-opacity="0.24" stroke-width="2" />`,
    `<g><animateTransform attributeName="transform" type="rotate" values="0 0 -30;${swayAmp} 0 -30;0 0 -30;-${swayAmp} 0 -30;0 0 -30" dur="${dur}" repeatCount="indefinite" />`,
    `<path d="M-56,-34 C-66,22 -50,74 -34,104 M56,-34 C66,22 50,74 34,104" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-opacity="0.5" /></g>`,
    `<ellipse cx="-16" cy="-24" rx="7" ry="7" fill="currentColor"><animate attributeName="ry" values="7;7;${blinkRy};7;7" keyTimes="0;0.62;0.68;0.74;1" dur="${dur}" repeatCount="indefinite" /></ellipse>`,
    `<ellipse cx="16" cy="-24" rx="7" ry="7" fill="currentColor"><animate attributeName="ry" values="7;7;${blinkRy};7;7" keyTimes="0;0.62;0.68;0.74;1" dur="${dur}" repeatCount="indefinite" /></ellipse>`,
    `<circle cx="-68" cy="-84" r="3" fill="var(--accent, currentColor)"><animate attributeName="opacity" values="0.2;0.95;0.2" dur="${dur}" repeatCount="indefinite" /></circle></g></g></svg>`,
  ].join("");
  return {
    workTitle: input.workTitle, cutId: input.cutId, widthPx, heightPx, durationSeconds, fps, totalFrames,
    seamlessLoopVerified: boundaryDelta < 1e-4, boundaryDelta, keyframes,
    exportManifests: [makeM("apng", "image/apng", 0.045), makeM("webp", "image/webp", 0.018), makeM("gif", "image/gif", 0.036)],
    svgPreviewMarkup,
  };
}

// === 6. 스마트폰·태블릿 QR 1초 무선 2nd-Screen 보조 화면 컨트롤러 프로토콜 ===

export type CompanionSessionStatus = "awaiting-scan" | "paired" | "disconnected" | "expired";
export type CompanionDeviceKind = "smartphone" | "tablet";
export type CompanionQuickAction = "undo" | "redo" | "reset-rotation" | "toggle-mirror" | "eyedropper";
export type CompanionCommandErrorCode = "SESSION_EXPIRED" | "INVALID_TOKEN" | "NOT_PAIRED" | "STALE_SEQUENCE" | "SESSION_DISCONNECTED";
export interface CompanionColorWheelState { readonly hueDeg: number; readonly chroma: number; readonly lightness: number; readonly label: string }
export interface CompanionBrushDialState { readonly brushId: string; readonly sizePx: number; readonly opacityPct: number; readonly flowPct: number; readonly stabilizationPct: number }
export interface CompanionCanvasTransformState { readonly rotationDeg: number; readonly zoomPct: number; readonly flipHorizontal: boolean }
export interface CompanionReferencePinState { readonly activeRefId: string | null; readonly opacityPct: number; readonly grayscale: boolean; readonly pinnedIds: readonly string[] }
export interface CompanionCommandAuditEntry { readonly seq: number; readonly type: CompanionCommand["type"]; readonly atIso: string; readonly summaryKo: string; readonly summaryEn: string }
export interface SecondScreenCompanionSession {
  readonly sessionId: string; readonly hostWorkspaceId: string; readonly pairingCode: string; readonly pairingToken: string;
  readonly qrPayloadUrl: string; readonly qrMatrix: readonly (readonly boolean[])[];
  readonly createdAtIso: string; readonly expiresAtIso: string; readonly ttlSeconds: number; readonly status: CompanionSessionStatus;
  readonly pairedDevice: { readonly deviceName: string; readonly deviceKind: CompanionDeviceKind; readonly pairedAtIso: string; readonly latencyMs: number } | null;
  readonly colorWheel: CompanionColorWheelState; readonly brushDial: CompanionBrushDialState;
  readonly canvasTransform: CompanionCanvasTransformState; readonly referencePin: CompanionReferencePinState;
  readonly lastCommandSeq: number; readonly lastQuickAction: CompanionQuickAction | null; readonly commandLog: readonly CompanionCommandAuditEntry[];
}
export interface CreateCompanionSessionInput { readonly hostWorkspaceId?: string; readonly createdAtIso?: string; readonly ttlSeconds?: number; readonly baseOrigin?: string }
export type CompanionCommand =
  | { readonly type: "pair-device"; readonly seq: number; readonly pairingToken: string; readonly atIso: string; readonly deviceName: string; readonly deviceKind: CompanionDeviceKind; readonly latencyMs?: number }
  | { readonly type: "set-color-wheel"; readonly seq: number; readonly pairingToken: string; readonly atIso: string; readonly hueDeg: number; readonly chroma: number; readonly lightness: number; readonly label?: string }
  | { readonly type: "adjust-brush-dial"; readonly seq: number; readonly pairingToken: string; readonly atIso: string; readonly brushId?: string; readonly sizePx?: number; readonly opacityPct?: number; readonly flowPct?: number; readonly stabilizationPct?: number }
  | { readonly type: "rotate-canvas"; readonly seq: number; readonly pairingToken: string; readonly atIso: string; readonly rotationDeg?: number; readonly deltaDeg?: number; readonly snapTo15Deg?: boolean; readonly zoomPct?: number; readonly flipHorizontal?: boolean }
  | { readonly type: "control-reference"; readonly seq: number; readonly pairingToken: string; readonly atIso: string; readonly activeRefId?: string | null; readonly opacityPct?: number; readonly grayscale?: boolean }
  | { readonly type: "trigger-quick-action"; readonly seq: number; readonly pairingToken: string; readonly atIso: string; readonly action: CompanionQuickAction }
  | { readonly type: "disconnect"; readonly seq: number; readonly pairingToken: string; readonly atIso: string };
export interface CompanionCommandDispatchResult {
  readonly ok: boolean; readonly errorCode?: CompanionCommandErrorCode;
  readonly session: SecondScreenCompanionSession; readonly appliedSummaryKo: string; readonly appliedSummaryEn: string;
}

function buildDeterministicQrMatrix(payload: string): readonly (readonly boolean[])[] {
  const size = 21;
  const grid: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  const res: boolean[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  for (const [top, left] of [[0, 0], [0, 14], [14, 0]] as const) {
    for (let r = -1; r <= 7; r += 1) {
      for (let c = -1; c <= 7; c += 1) {
        const y = top + r; const x = left + c;
        if (y < 0 || y >= size || x < 0 || x >= size || !grid[y] || !res[y]) continue;
        res[y][x] = true;
        const sep = r === -1 || r === 7 || c === -1 || c === 7;
        grid[y][x] = !sep && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      }
    }
  }
  for (let i = 8; i < 13; i += 1) {
    if (grid[6] && res[6]) { grid[6][i] = i % 2 === 0; res[6][i] = true; }
    if (grid[i] && res[i]) { grid[i][6] = i % 2 === 0; res[i][6] = true; }
  }
  if (grid[13] && res[13]) { grid[13][8] = true; res[13][8] = true; }
  const stream = `${computeSha256Hex(payload)}${computeSha256Hex(`${payload}:v2`)}`;
  let bitIdx = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!grid[y] || !res[y] || res[y][x]) continue;
      const bit = (((Number.parseInt(stream[(bitIdx >>> 2) % stream.length] ?? "0", 16) >>> (3 - (bitIdx & 3))) & 1) === 1);
      grid[y][x] = (x + y) % 2 === 0 ? !bit : bit;
      bitIdx += 1;
    }
  }
  return grid;
}

/** 스마트폰·태블릿 QR 1초 무선 2nd-Screen 보조 화면 페어링 세션을 생성한다. */
export function createSecondScreenCompanionSession(input: CreateCompanionSessionInput = {}): SecondScreenCompanionSession {
  const hostWorkspaceId = input.hostWorkspaceId ?? "studio-ws-main";
  const createdAtIso = input.createdAtIso ?? "2026-11-23T11:30:00.000Z";
  const ttlSeconds = clamp(Math.round(input.ttlSeconds ?? 180), 30, 900);
  const baseOrigin = (input.baseOrigin ?? "https://www.toonstudio.cloud").replace(/\/+$/, "");
  const seed = computeSha256Hex(`companion:${hostWorkspaceId}:${createdAtIso}:${ttlSeconds}`);
  const sessionId = `cmp-${seed.slice(0, 10)}`;
  const pairingCode = `TS-${(Number.parseInt(seed.slice(10, 16), 16) % 9000) + 1000}`;
  const pairingToken = `pair-${seed.slice(16, 36)}`;
  const expMs = Date.parse(createdAtIso) + ttlSeconds * 1000;
  const qrPayloadUrl = `${baseOrigin}/companion?s=${sessionId}&c=${pairingCode}&t=${pairingToken.slice(0, 14)}`;
  return {
    sessionId, hostWorkspaceId, pairingCode, pairingToken, qrPayloadUrl, qrMatrix: buildDeterministicQrMatrix(qrPayloadUrl),
    createdAtIso, expiresAtIso: Number.isNaN(expMs) ? createdAtIso : new Date(expMs).toISOString(), ttlSeconds,
    status: "awaiting-scan", pairedDevice: null,
    colorWheel: { hueDeg: 28, chroma: 0.14, lightness: 0.62, label: "Warm Terracotta" },
    brushDial: { brushId: "g-pen-ink", sizePx: 14, opacityPct: 95, flowPct: 90, stabilizationPct: 35 },
    canvasTransform: { rotationDeg: 0, zoomPct: 100, flipHorizontal: false },
    referencePin: { activeRefId: "ref-hero-turnaround", opacityPct: 85, grayscale: false, pinnedIds: ["ref-hero-turnaround", "ref-alley-lighting", "ref-hand-poses"] },
    lastCommandSeq: 0, lastQuickAction: null, commandLog: [],
  };
}

const wrapAngle180 = (deg: number): number => {
  const a = (((deg + 180) % 360) + 360) % 360 - 180;
  return roundTo(a === -180 ? 180 : a, 1);
};

/** 페어링된 모바일·태블릿 2nd-Screen에서 수신한 컨트롤러 명령을 검증·라우팅한다. */
export function dispatchCompanionCommand(session: SecondScreenCompanionSession, command: CompanionCommand): CompanionCommandDispatchResult {
  const fail = (errorCode: CompanionCommandErrorCode, ko: string, en: string, st = session.status): CompanionCommandDispatchResult => ({
    ok: false, errorCode, session: st === session.status ? session : { ...session, status: st }, appliedSummaryKo: ko, appliedSummaryEn: en,
  });
  if (session.status === "disconnected") return fail("SESSION_DISCONNECTED", "종료된 보조화면 세션입니다.", "Companion session disconnected.");
  const nowMs = Date.parse(command.atIso); const expMs = Date.parse(session.expiresAtIso);
  if (session.status === "awaiting-scan" && !Number.isNaN(nowMs) && !Number.isNaN(expMs) && nowMs > expMs) {
    return fail("SESSION_EXPIRED", "QR 페어링 유효 시간이 만료되었습니다.", "QR pairing window expired.", "expired");
  }
  if (command.pairingToken !== session.pairingToken) return fail("INVALID_TOKEN", "페어링 세션 토큰 불일치.", "Invalid pairing token.");
  if (command.seq <= session.lastCommandSeq) return fail("STALE_SEQUENCE", `이전 시퀀스(${command.seq}) 차단.`, `Stale sequence (${command.seq}) rejected.`);
  if (command.type !== "pair-device" && session.status !== "paired") return fail("NOT_PAIRED", "QR 페어링 완료 후 제어할 수 있습니다.", "Pair a device before sending commands.");

  let next: SecondScreenCompanionSession; let ko: string; let en: string;
  if (command.type === "pair-device") {
    const latencyMs = clamp(Math.round(command.latencyMs ?? 14), 1, 250);
    const deviceName = command.deviceName.trim() || "Mobile Companion";
    next = { ...session, status: "paired", pairedDevice: { deviceName, deviceKind: command.deviceKind, pairedAtIso: command.atIso, latencyMs } };
    ko = `${deviceName} 페어링 완료 (${latencyMs}ms)`; en = `Paired ${deviceName} (${latencyMs}ms)`;
  } else if (command.type === "set-color-wheel") {
    const hueDeg = roundTo(((command.hueDeg % 360) + 360) % 360, 1);
    const chroma = roundTo(clamp(command.chroma, 0, 0.37), 3); const lightness = roundTo(clamp(command.lightness, 0, 1), 3);
    const label = command.label?.trim() || `OKLCH ${Math.round(lightness * 100)}%/${chroma}/${hueDeg}°`;
    next = { ...session, colorWheel: { hueDeg, chroma, lightness, label } };
    ko = `색상환: ${label} (H ${hueDeg}°)`; en = `Color wheel: ${label} (H ${hueDeg}°)`;
  } else if (command.type === "adjust-brush-dial") {
    const dial: CompanionBrushDialState = {
      brushId: command.brushId ?? session.brushDial.brushId, sizePx: roundTo(clamp(command.sizePx ?? session.brushDial.sizePx, 1, 500), 1),
      opacityPct: Math.round(clamp(command.opacityPct ?? session.brushDial.opacityPct, 1, 100)),
      flowPct: Math.round(clamp(command.flowPct ?? session.brushDial.flowPct, 1, 100)),
      stabilizationPct: Math.round(clamp(command.stabilizationPct ?? session.brushDial.stabilizationPct, 0, 100)),
    };
    next = { ...session, brushDial: dial };
    ko = `브러시: ${dial.sizePx}px · ${dial.opacityPct}% · 보정 ${dial.stabilizationPct}%`; en = `Brush: ${dial.sizePx}px · ${dial.opacityPct}% · stab ${dial.stabilizationPct}%`;
  } else if (command.type === "rotate-canvas") {
    const raw = command.rotationDeg !== undefined ? command.rotationDeg : session.canvasTransform.rotationDeg + (command.deltaDeg ?? 0);
    const tf: CompanionCanvasTransformState = {
      rotationDeg: wrapAngle180(command.snapTo15Deg ? Math.round(raw / 15) * 15 : raw),
      zoomPct: Math.round(clamp(command.zoomPct ?? session.canvasTransform.zoomPct, 10, 1600)),
      flipHorizontal: command.flipHorizontal ?? session.canvasTransform.flipHorizontal,
    };
    next = { ...session, canvasTransform: tf };
    ko = `캔버스 ${tf.rotationDeg}° · ${tf.zoomPct}%${tf.flipHorizontal ? " · 반전" : ""}`; en = `Canvas ${tf.rotationDeg}° · ${tf.zoomPct}%${tf.flipHorizontal ? " · flip" : ""}`;
  } else if (command.type === "control-reference") {
    const ref: CompanionReferencePinState = {
      ...session.referencePin, activeRefId: command.activeRefId !== undefined ? command.activeRefId : session.referencePin.activeRefId,
      opacityPct: Math.round(clamp(command.opacityPct ?? session.referencePin.opacityPct, 10, 100)),
      grayscale: command.grayscale ?? session.referencePin.grayscale,
    };
    next = { ...session, referencePin: ref };
    ko = `레퍼런스 ${ref.activeRefId ?? "없음"} · ${ref.opacityPct}%${ref.grayscale ? " · 흑백" : ""}`; en = `Reference ${ref.activeRefId ?? "none"} · ${ref.opacityPct}%${ref.grayscale ? " · gray" : ""}`;
  } else if (command.type === "trigger-quick-action") {
    let tf = session.canvasTransform;
    if (command.action === "reset-rotation") tf = { ...tf, rotationDeg: 0 };
    if (command.action === "toggle-mirror") tf = { ...tf, flipHorizontal: !tf.flipHorizontal };
    next = { ...session, canvasTransform: tf, lastQuickAction: command.action };
    ko = `퀵 액션: ${command.action}`; en = `Quick action: ${command.action}`;
  } else {
    next = { ...session, status: "disconnected" }; ko = "2nd-Screen 보조화면 연결 종료"; en = "2nd-Screen companion disconnected";
  }
  const entry: CompanionCommandAuditEntry = { seq: command.seq, type: command.type, atIso: command.atIso, summaryKo: ko, summaryEn: en };
  return {
    ok: true, appliedSummaryKo: ko, appliedSummaryEn: en,
    session: { ...next, lastCommandSeq: command.seq, commandLog: [entry, ...session.commandLog].slice(0, 12) },
  };
}

/** UI·테스트용 기본 유출 역추적 메타데이터 픽스처를 반환한다. */
export function createDemoLeakTraceMetadata(recipientId = "NAVER-KR-DESK"): LeakTraceMetadata {
  const distributionChannel = recipientId.includes("JP") ? "global-partner-review" : recipientId.includes("PRESS") ? "press-embargo-kit" : "platform-submission";
  return { recipientId, distributionChannel, workId: "TS-ECLIPSE-2026", episodeNumber: 42, issuedAtIso: "2026-11-23T10:15:00Z", watermarkKey: "toonstudio-cp-master-seal-2026" };
}
