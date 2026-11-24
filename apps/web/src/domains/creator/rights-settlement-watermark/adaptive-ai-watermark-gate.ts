/**
 * 캔버스 출고 프리플라이트(Rights BOM 연동) 통합 적응형 동적 수위 비가시 AI 워터마킹 엔진.
 *
 * - 8×8 정규직교 2D DCT 중주파 8계수 + 왜곡 보상 양자화 인덱스 변조(DC-QIM, Chen-Wornell)와
 *   32×64 px 공간 매크로 타일(256비트) 반복 부호화 · IRLS 공간 변조 마스크 · Chase-2 CRC-16 복호화를 결합한다.
 * - 영역별 엔트로피 기반 동적 수위: 단색 피부/셀(`flat-skin-cel`) PSNR >= 38 dB 보존, 고주파(`high-freq-hair-bg`) 강인도 강화.
 */

import { sha256Hex, type RightsSettlementLedgerVerification } from "./c2pa-rights-settlement-ledger";

// === 1. 상수 · 8×8 2D DCT 기저 · JPEG 표준 양자화 테이블 ===

export const INVISIBLE_PSNR_FLOOR_DB = 38 as const;
export const WATERMARK_FRAME_BYTES = 32 as const;
export const WATERMARK_FRAME_BITS = 256 as const;
const MAGIC_BYTE_0 = 0x54; const MAGIC_BYTE_1 = 0x53;
const MACRO_TILE_COLS = 4; const MACRO_TILE_ROWS = 8; const QIM_STEP = 13.5;
const DEFAULT_WATERMARK_TIMESTAMP_ISO = "2026-11-24T00:00:00Z";
const MID_FREQ_SLOTS: readonly (readonly [number, number])[] = Object.freeze([[2, 0], [0, 2], [1, 1], [1, 2], [2, 1], [3, 0], [0, 3], [2, 2]]);

/** ITU-T T.81 Annex K 표준 휘도 양자화 테이블(Q=50 기준). */
const JPEG_LUMA_Q50: readonly number[] = Object.freeze([
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]);

const DCT_MATRIX: readonly Float64Array[] = (() => {
  const rows: Float64Array[] = [];
  for (let u = 0; u < 8; u += 1) {
    const row = new Float64Array(8);
    const alpha = u === 0 ? Math.SQRT1_2 * 0.5 : 0.5;
    for (let x = 0; x < 8; x += 1) row[x] = alpha * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
    rows.push(row);
  }
  return Object.freeze(rows);
})();

// === 2. 공개 타입 ===

export type TextureRegionClass = "flat-skin-cel" | "mid-structure" | "high-freq-hair-bg";
export type WatermarkVerificationVerdict = "VERIFIED_INTACT" | "SURVIVED_WITH_DEGRADATION" | "TAMPER_DETECTED" | "NOT_FOUND";
export type WatermarkAttackKind = "none-clean" | "crop-20pct" | "recompress-jpeg-q70" | "ai-inpaint-tamper";

export interface WatermarkPayloadInput { readonly authorId: string; readonly workId: string; readonly timestampIso?: string }
export interface DecodedWatermarkPayload {
  readonly magicValid: boolean; readonly crcValid: boolean; readonly authorId: string; readonly workId: string;
  readonly timestampSec: number; readonly timestampIso: string; readonly payloadTagHex: string;
}
export interface AdaptiveWatermarkEmbedOptions extends WatermarkPayloadInput { readonly strength?: number }
export interface RegionAdaptiveMetrics {
  readonly region: TextureRegionClass; readonly blockCount: number; readonly meanEntropy: number;
  readonly meanAdaptiveMargin: number; readonly psnrDb: number;
}
export interface AdaptiveWatermarkEmbedResult {
  readonly pixels: Uint8ClampedArray; readonly width: number; readonly height: number; readonly strength: number;
  readonly authorId: string; readonly workId: string; readonly timestampSec: number; readonly timestampIso: string;
  readonly payloadDigestSha256: string; readonly payloadTagHex: string;
  readonly overallPsnrDb: number; readonly flatRegionPsnrDb: number; readonly midRegionPsnrDb: number;
  readonly highFreqRegionPsnrDb: number; readonly psnrPass: boolean;
  readonly totalBlocks: number; readonly macroTileCopies: number; readonly regionMetrics: readonly RegionAdaptiveMetrics[];
}
export interface AdaptiveWatermarkExtractOptions {
  readonly expectedAuthorId?: string; readonly expectedWorkId?: string;
  readonly expectedTimestampIso?: string; readonly enablePhaseResync?: boolean;
}
export interface AdaptiveWatermarkExtractResult {
  readonly detected: boolean; readonly crcValid: boolean; readonly payloadMatchedExpected: boolean | null;
  readonly extractedAuthorId: string; readonly extractedWorkId: string; readonly extractedTimestampSec: number;
  readonly extractedTimestampIso: string; readonly payloadTagHex: string;
  readonly bitAccuracy: number; readonly detectionConfidence: number; readonly tamperDetected: boolean;
  readonly tamperedBlockRatio: number; readonly suspectBlockCount: number; readonly evaluatedBlocks: number;
  readonly alignedPhase: { readonly pixelShiftX: number; readonly pixelShiftY: number; readonly tileShiftX: number; readonly tileShiftY: number };
  readonly verdict: WatermarkVerificationVerdict;
}
export interface WatermarkAttackSimulationReport {
  readonly attackKind: WatermarkAttackKind; readonly labelKo: string; readonly labelEn: string;
  readonly outputWidth: number; readonly outputHeight: number;
  readonly extraction: AdaptiveWatermarkExtractResult; readonly summaryKo: string; readonly summaryEn: string;
}
export interface ExportRightsBomItem {
  readonly assetId: string; readonly assetName: string;
  readonly kind: "font" | "3d-bg" | "brush" | "texture" | "human-artwork" | "ai-reference";
  readonly licenseName: string; readonly commercialUseAllowed: boolean; readonly aiTrainingAllowed: boolean;
  readonly attributionRequired: boolean; readonly attributionIncluded: boolean; readonly expiresAtIso?: string;
}
export interface ExportPreflightCheckItem {
  readonly id: string; readonly category: "rights-bom" | "watermark-quality" | "watermark-extract" | "c2pa-ledger";
  readonly status: "pass" | "warn" | "block"; readonly titleKo: string; readonly titleEn: string;
  readonly detailKo: string; readonly detailEn: string;
}
export interface WatermarkExportPreflightReport {
  readonly status: "PASS" | "WARN" | "BLOCK"; readonly exportAllowed: boolean;
  readonly targetChannel: "commercial-webtoon" | "global-distribution" | "print-book" | "portfolio-noncommercial";
  readonly checks: readonly ExportPreflightCheckItem[];
  readonly blockedReasonsKo: readonly string[]; readonly blockedReasonsEn: readonly string[];
  readonly watermarkDigestSha256: string;
}

// === 3. 유틸리티 · CRC-16 · 페이로드 프레임(32B / 256bit) 부호화/복호화 ===

const clamp = (v: number, lo: number, hi: number): number => (!Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v)));
const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const roundTo = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

function crc16Ccitt(bytes: Uint8Array, length: number): number {
  let crc = 0xffff;
  for (let i = 0; i < length; i += 1) {
    crc ^= (bytes[i] ?? 0) << 8;
    for (let b = 0; b < 8; b += 1) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function encodeFixedUtf8Field(input: string, maxBytes: number): Uint8Array {
  const out = new Uint8Array(maxBytes);
  const raw = new TextEncoder().encode(input.trim());
  for (let i = 0; i < Math.min(raw.length, maxBytes); i += 1) out[i] = raw[i] ?? 0;
  return out;
}

function decodeFixedUtf8Field(bytes: Uint8Array, start: number, length: number): string {
  let end = start + length;
  while (end > start && bytes[end - 1] === 0) end -= 1;
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(start, end)).replace(/\0/gu, "");
}

function parseTimestampSec(timestampIso?: string): { readonly sec: number; readonly iso: string } {
  const parsed = Date.parse(timestampIso?.trim() || DEFAULT_WATERMARK_TIMESTAMP_ISO);
  const safeMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : Date.parse(DEFAULT_WATERMARK_TIMESTAMP_ISO);
  const sec = Math.floor(safeMs / 1000) >>> 0;
  return { sec, iso: new Date(sec * 1000).toISOString() };
}

/** 32바이트(256비트) 워터마크 페이로드 프레임(Magic + Timestamp + Author + Work + SHA-256 Tag + CRC-16)을 생성한다. */
export function encodeWatermarkPayloadBits(input: WatermarkPayloadInput): {
  readonly bits: Uint8Array; readonly bytes: Uint8Array; readonly timestampSec: number;
  readonly timestampIso: string; readonly payloadTagHex: string; readonly payloadDigestSha256: string;
} {
  const authorId = input.authorId.trim() || "unknown";
  const workId = input.workId.trim() || "untitled";
  const { sec: timestampSec, iso: timestampIso } = parseTimestampSec(input.timestampIso);
  const payloadDigestSha256 = sha256Hex(`ts-adaptive-wm-v2|${authorId}|${workId}|${timestampSec}`);
  const bytes = new Uint8Array(WATERMARK_FRAME_BYTES);
  bytes[0] = MAGIC_BYTE_0; bytes[1] = MAGIC_BYTE_1;
  bytes[2] = (timestampSec >>> 24) & 0xff; bytes[3] = (timestampSec >>> 16) & 0xff;
  bytes[4] = (timestampSec >>> 8) & 0xff; bytes[5] = timestampSec & 0xff;
  bytes.set(encodeFixedUtf8Field(authorId, 11), 6);
  bytes.set(encodeFixedUtf8Field(workId, 11), 17);
  bytes[28] = Number.parseInt(payloadDigestSha256.slice(0, 2), 16) & 0xff;
  bytes[29] = Number.parseInt(payloadDigestSha256.slice(2, 4), 16) & 0xff;
  const crc = crc16Ccitt(bytes, 30);
  bytes[30] = (crc >>> 8) & 0xff; bytes[31] = crc & 0xff;

  const bits = new Uint8Array(WATERMARK_FRAME_BITS);
  for (let b = 0; b < WATERMARK_FRAME_BYTES; b += 1) {
    const val = bytes[b] ?? 0;
    for (let k = 0; k < 8; k += 1) bits[b * 8 + k] = (val >>> (7 - k)) & 1;
  }
  return { bits, bytes, timestampSec, timestampIso, payloadTagHex: payloadDigestSha256.slice(0, 4), payloadDigestSha256 };
}

/** 256비트 배열을 페이로드 구조체와 CRC-16 무결성 결과로 복호화한다. */
export function decodeWatermarkPayloadBits(bits: Uint8Array): DecodedWatermarkPayload {
  const bytes = new Uint8Array(WATERMARK_FRAME_BYTES);
  for (let b = 0; b < WATERMARK_FRAME_BYTES; b += 1) {
    let val = 0;
    for (let k = 0; k < 8; k += 1) val = (val << 1) | ((bits[b * 8 + k] ?? 0) & 1);
    bytes[b] = val;
  }
  const magicValid = bytes[0] === MAGIC_BYTE_0 && bytes[1] === MAGIC_BYTE_1;
  const crcValid = magicValid && crc16Ccitt(bytes, 30) === (((bytes[30] ?? 0) << 8) | (bytes[31] ?? 0));
  const timestampSec = (((bytes[2] ?? 0) << 24) | ((bytes[3] ?? 0) << 16) | ((bytes[4] ?? 0) << 8) | (bytes[5] ?? 0)) >>> 0;
  return {
    magicValid, crcValid, authorId: decodeFixedUtf8Field(bytes, 6, 11), workId: decodeFixedUtf8Field(bytes, 17, 11),
    timestampSec, timestampIso: new Date(timestampSec * 1000).toISOString(),
    payloadTagHex: `${(bytes[28] ?? 0).toString(16).padStart(2, "0")}${(bytes[29] ?? 0).toString(16).padStart(2, "0")}`,
  };
}

/** 신뢰도가 가장 낮은 소수 비트(1~3비트)에 한해 Chase-2 연성 판정 CRC-16 오류 정정을 수행한다. */
function decodeWithChase2(votes: Float64Array, hardBits: Uint8Array): { readonly decoded: DecodedWatermarkPayload; readonly bits: Uint8Array } {
  const direct = decodeWatermarkPayloadBits(hardBits);
  if (direct.crcValid) return { decoded: direct, bits: new Uint8Array(hardBits) };
  const ranked = Array.from({ length: WATERMARK_FRAME_BITS }, (_, idx) => ({ idx, mag: Math.abs(votes[idx] ?? 0) }))
    .sort((a, b) => a.mag - b.mag).slice(0, 8).map((e) => e.idx);
  const trial = new Uint8Array(hardBits);
  const flipTry = (ids: readonly number[]): DecodedWatermarkPayload | null => {
    for (const i of ids) trial[i] = (trial[i] ?? 0) ^ 1;
    const dec = decodeWatermarkPayloadBits(trial);
    if (dec.crcValid) return dec;
    for (const i of ids) trial[i] = (trial[i] ?? 0) ^ 1;
    return null;
  };
  for (let i = 0; i < ranked.length; i += 1) {
    const r = flipTry([ranked[i] ?? 0]);
    if (r) return { decoded: r, bits: new Uint8Array(trial) };
  }
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      const r = flipTry([ranked[i] ?? 0, ranked[j] ?? 0]);
      if (r) return { decoded: r, bits: new Uint8Array(trial) };
    }
  }
  const lim = Math.min(6, ranked.length);
  for (let i = 0; i < lim; i += 1) {
    for (let j = i + 1; j < lim; j += 1) {
      for (let k = j + 1; k < lim; k += 1) {
        const r = flipTry([ranked[i] ?? 0, ranked[j] ?? 0, ranked[k] ?? 0]);
        if (r) return { decoded: r, bits: new Uint8Array(trial) };
      }
    }
  }
  return { decoded: direct, bits: new Uint8Array(hardBits) };
}

const macroSlotToBitBase = (tileBx: number, tileBy: number): number =>
  (((((tileBy & 7) << 2) | (tileBx & 3)) * 11 + 3) & 31) * 8;

// === 4. 8×8 2D DCT/IDCT & 텍스처 엔트로피 · DC-QIM 계수 변조 ===

function loadLumaBlock8x8(pixels: Uint8ClampedArray, width: number, baseX: number, baseY: number, out: Float64Array): void {
  for (let py = 0; py < 8; py += 1) {
    for (let px = 0; px < 8; px += 1) {
      const i = ((baseY + py) * width + (baseX + px)) * 4;
      out[py * 8 + px] = 0.299 * (pixels[i] ?? 0) + 0.587 * (pixels[i + 1] ?? 0) + 0.114 * (pixels[i + 2] ?? 0);
    }
  }
}

function forwardDct8x8(block: Float64Array, out: Float64Array): void {
  const tmp = new Float64Array(64);
  for (let y = 0; y < 8; y += 1) {
    for (let u = 0; u < 8; u += 1) {
      let s = 0;
      for (let x = 0; x < 8; x += 1) s += (block[y * 8 + x] ?? 0) * (DCT_MATRIX[u]?.[x] ?? 0);
      tmp[y * 8 + u] = s;
    }
  }
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let s = 0;
      for (let y = 0; y < 8; y += 1) s += (DCT_MATRIX[v]?.[y] ?? 0) * (tmp[y * 8 + u] ?? 0);
      out[v * 8 + u] = s;
    }
  }
}

function inverseDct8x8(coeff: Float64Array, out: Float64Array): void {
  const tmp = new Float64Array(64);
  for (let v = 0; v < 8; v += 1) {
    for (let x = 0; x < 8; x += 1) {
      let s = 0;
      for (let u = 0; u < 8; u += 1) s += (coeff[v * 8 + u] ?? 0) * (DCT_MATRIX[u]?.[x] ?? 0);
      tmp[v * 8 + x] = s;
    }
  }
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      let s = 0;
      for (let v = 0; v < 8; v += 1) s += (DCT_MATRIX[v]?.[y] ?? 0) * (tmp[v * 8 + x] ?? 0);
      out[y * 8 + x] = s;
    }
  }
}

/** 8×8 휘도 블록의 샤논 엔트로피·공간 그래디언트·AC 에너지를 측정해 영역을 분류한다. */
export function analyzeBlockTextureEntropy(lumaBlock: Float64Array, dctBlock: Float64Array): {
  readonly shannonEntropyBits: number; readonly textureComplexity: number; readonly region: TextureRegionClass;
} {
  const hist = new Uint16Array(32);
  for (let i = 0; i < 64; i += 1) {
    const bin = Math.min(31, Math.max(0, Math.floor((lumaBlock[i] ?? 0) / 8)));
    hist[bin] = (hist[bin] ?? 0) + 1;
  }
  let entropy = 0;
  for (let k = 0; k < 32; k += 1) {
    const cnt = hist[k] ?? 0;
    if (cnt > 0) { const p = cnt / 64; entropy -= p * Math.log2(p); }
  }
  let gradSum = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const cur = lumaBlock[y * 8 + x] ?? 0;
      if (x < 7) gradSum += Math.abs(cur - (lumaBlock[y * 8 + x + 1] ?? 0));
      if (y < 7) gradSum += Math.abs(cur - (lumaBlock[(y + 1) * 8 + x] ?? 0));
    }
  }
  let acSum = 0; let acCnt = 0;
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) if (u + v >= 3) { acSum += Math.abs(dctBlock[v * 8 + u] ?? 0); acCnt += 1; }
  }
  const complexity = clamp(
    0.45 * clamp(entropy / 4.2, 0, 1) + 0.35 * clamp(gradSum / 112 / 24, 0, 1) + 0.2 * clamp((acCnt > 0 ? acSum / acCnt : 0) / 16, 0, 1),
    0, 1,
  );
  const region: TextureRegionClass = complexity < 0.28 ? "flat-skin-cel" : complexity < 0.56 ? "mid-structure" : "high-freq-hair-bg";
  return { shannonEntropyBits: roundTo(entropy, 3), textureComplexity: roundTo(complexity, 4), region };
}

const resolveDcQimAlpha = (region: TextureRegionClass, strength: number): number =>
  region === "flat-skin-cel" ? clamp(0.56 + strength * 0.028, 0.58, 0.72)
    : region === "mid-structure" ? clamp(0.72 + strength * 0.036, 0.75, 0.92)
      : clamp(0.88 + strength * 0.024, 0.9, 1.0);

function quantizeDcQimCoeff(c: number, bit: number, alpha: number): number {
  const twoQ = QIM_STEP * 2;
  const qTarget = bit === 0 ? Math.round(c / twoQ) * twoQ : (Math.round((c - QIM_STEP) / twoQ) * 2 + 1) * QIM_STEP;
  return c + alpha * (qTarget - c);
}

function scoreDcQimCoeff(c: number): number {
  const phase = (((c / QIM_STEP) % 2) + 2) % 2;
  return Math.min(phase, 2 - phase) - Math.abs(phase - 1);
}

const computePsnrFromSse = (sse: number, samples: number): number =>
  samples <= 0 || sse <= 0 ? 99.99 : sse / samples <= 1e-9 ? 99.99 : roundTo(10 * Math.log10((255 * 255) / (sse / samples)), 2);

// === 5. 적응형 동적 수위 워터마크 삽입 및 블라인드 역추출 ===

/** 영역별 엔트로피 기반 적응형 동적 수위 DCT(DC-QIM) 비가시 워터마크를 삽입한다. */
export function embedAdaptiveAiWatermark(
  sourcePixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: AdaptiveWatermarkEmbedOptions,
): AdaptiveWatermarkEmbedResult {
  const safeW = Math.max(8, Math.trunc(width));
  const safeH = Math.max(8, Math.trunc(height));
  const strength = clamp(Math.round(options.strength ?? 3), 1, 5);
  const encoded = encodeWatermarkPayloadBits(options);
  const output = new Uint8ClampedArray(sourcePixels);
  const blocksX = Math.floor(safeW / 8);
  const blocksY = Math.floor(safeH / 8);
  const lumaIn = new Float64Array(64);
  const dct = new Float64Array(64);
  const lumaOut = new Float64Array(64);
  const stats: Record<TextureRegionClass, { blocks: number; entropySum: number; marginSum: number; sse: number; samples: number }> = {
    "flat-skin-cel": { blocks: 0, entropySum: 0, marginSum: 0, sse: 0, samples: 0 },
    "mid-structure": { blocks: 0, entropySum: 0, marginSum: 0, sse: 0, samples: 0 },
    "high-freq-hair-bg": { blocks: 0, entropySum: 0, marginSum: 0, sse: 0, samples: 0 },
  };
  let totalSse = 0; let totalSamples = 0;

  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      const baseY = by * 8; const baseX = bx * 8;
      loadLumaBlock8x8(sourcePixels, safeW, baseX, baseY, lumaIn);
      forwardDct8x8(lumaIn, dct);
      const tex = analyzeBlockTextureEntropy(lumaIn, dct);
      const alpha = resolveDcQimAlpha(tex.region, strength);
      const bitBase = macroSlotToBitBase(bx % MACRO_TILE_COLS, by % MACRO_TILE_ROWS);
      for (let p = 0; p < MID_FREQ_SLOTS.length; p += 1) {
        const slot = MID_FREQ_SLOTS[p];
        if (!slot) continue;
        const idx = slot[1] * 8 + slot[0];
        dct[idx] = quantizeDcQimCoeff(dct[idx] ?? 0, encoded.bits[bitBase + p] ?? 0, alpha);
      }
      inverseDct8x8(dct, lumaOut);
      let blockSse = 0;
      for (let py = 0; py < 8; py += 1) {
        for (let px = 0; px < 8; px += 1) {
          const i = ((baseY + py) * safeW + (baseX + px)) * 4;
          const dY = (lumaOut[py * 8 + px] ?? 0) - (lumaIn[py * 8 + px] ?? 0);
          const sr = sourcePixels[i] ?? 0; const sg = sourcePixels[i + 1] ?? 0; const sb = sourcePixels[i + 2] ?? 0;
          const nr = clampByte(sr + dY); const ng = clampByte(sg + dY); const nb = clampByte(sb + dY);
          output[i] = nr; output[i + 1] = ng; output[i + 2] = nb; output[i + 3] = sourcePixels[i + 3] ?? 255;
          blockSse += (nr - sr) ** 2 + (ng - sg) ** 2 + (nb - sb) ** 2;
        }
      }
      const s = stats[tex.region];
      s.blocks += 1; s.entropySum += tex.shannonEntropyBits; s.marginSum += alpha * QIM_STEP; s.sse += blockSse; s.samples += 192;
      totalSse += blockSse; totalSamples += 192;
    }
  }

  const overallPsnrDb = computePsnrFromSse(totalSse, totalSamples);
  const flatRegionPsnrDb = computePsnrFromSse(stats["flat-skin-cel"].sse, stats["flat-skin-cel"].samples);
  const midRegionPsnrDb = computePsnrFromSse(stats["mid-structure"].sse, stats["mid-structure"].samples);
  const highFreqRegionPsnrDb = computePsnrFromSse(stats["high-freq-hair-bg"].sse, stats["high-freq-hair-bg"].samples);
  const regionMetrics: RegionAdaptiveMetrics[] = (["flat-skin-cel", "mid-structure", "high-freq-hair-bg"] as const).map((region) => {
    const s = stats[region];
    return {
      region, blockCount: s.blocks, meanEntropy: s.blocks > 0 ? roundTo(s.entropySum / s.blocks, 3) : 0,
      meanAdaptiveMargin: s.blocks > 0 ? roundTo(s.marginSum / s.blocks, 2) : 0, psnrDb: computePsnrFromSse(s.sse, s.samples),
    };
  });
  const totalBlocks = blocksX * blocksY;
  return {
    pixels: output, width: safeW, height: safeH, strength, authorId: options.authorId.trim() || "unknown",
    workId: options.workId.trim() || "untitled", timestampSec: encoded.timestampSec, timestampIso: encoded.timestampIso,
    payloadDigestSha256: encoded.payloadDigestSha256, payloadTagHex: encoded.payloadTagHex,
    overallPsnrDb, flatRegionPsnrDb, midRegionPsnrDb, highFreqRegionPsnrDb,
    psnrPass: overallPsnrDb >= INVISIBLE_PSNR_FLOOR_DB && flatRegionPsnrDb >= INVISIBLE_PSNR_FLOOR_DB,
    totalBlocks, macroTileCopies: roundTo(totalBlocks / (MACRO_TILE_COLS * MACRO_TILE_ROWS), 2), regionMetrics,
  };
}

interface PhaseCandidate {
  readonly decoded: DecodedWatermarkPayload; readonly bits: Uint8Array; readonly bitAgreement: number;
  readonly pixelShiftX: number; readonly pixelShiftY: number; readonly tileShiftX: number; readonly tileShiftY: number;
  readonly blockScores: Float64Array; readonly blocksX: number; readonly blocksY: number;
}

function computeBlockAgreeRates(
  blockScores: Float64Array, blocksX: number, blocksY: number, tileShiftX: number, tileShiftY: number, bits: Uint8Array,
): { readonly rates: Float64Array; readonly meanAgreement: number } {
  const slots = MID_FREQ_SLOTS.length;
  const totalBlocks = blocksX * blocksY;
  const rates = new Float64Array(totalBlocks);
  let totalOk = 0;
  for (let by = 0; by < blocksY; by += 1) {
    const ty = (by + tileShiftY) & 7;
    for (let bx = 0; bx < blocksX; bx += 1) {
      const bitBase = macroSlotToBitBase((bx + tileShiftX) & 3, ty);
      const bIdx = by * blocksX + bx;
      let ok = 0;
      for (let p = 0; p < slots; p += 1) {
        if (((blockScores[bIdx * slots + p] ?? 0) >= 0 ? 1 : 0) === (bits[bitBase + p] ?? 0)) ok += 1;
      }
      rates[bIdx] = ok / slots;
      totalOk += ok;
    }
  }
  return { rates, meanAgreement: totalBlocks > 0 ? totalOk / (totalBlocks * slots) : 0 };
}

function computeNeighborMeanRates(rates: Float64Array, blocksX: number, blocksY: number, excludeSelf = false): Float64Array {
  const out = new Float64Array(blocksX * blocksY);
  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      let s = 0; let c = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (excludeSelf && dx === 0 && dy === 0) continue;
          const ny = by + dy; const nx = bx + dx;
          if (ny >= 0 && ny < blocksY && nx >= 0 && nx < blocksX) { s += rates[ny * blocksX + nx] ?? 0; c += 1; }
        }
      }
      out[by * blocksX + bx] = c > 0 ? s / c : 0;
    }
  }
  return out;
}

function scanPhaseAtPixelOffset(pixels: Uint8ClampedArray, width: number, height: number, pixelShiftX: number, pixelShiftY: number): PhaseCandidate | null {
  const blocksX = Math.floor((width - pixelShiftX) / 8);
  const blocksY = Math.floor((height - pixelShiftY) / 8);
  const totalBlocks = blocksX * blocksY;
  if (totalBlocks < 16) return null;

  const slots = MID_FREQ_SLOTS.length;
  const blockScores = new Float64Array(totalBlocks * slots);
  const blockWeights = new Float64Array(totalBlocks);
  const lumaIn = new Float64Array(64);
  const dct = new Float64Array(64);
  for (let by = 0; by < blocksY; by += 1) {
    for (let bx = 0; bx < blocksX; bx += 1) {
      loadLumaBlock8x8(pixels, width, pixelShiftX + bx * 8, pixelShiftY + by * 8, lumaIn);
      forwardDct8x8(lumaIn, dct);
      const tex = analyzeBlockTextureEntropy(lumaIn, dct);
      const bIdx = by * blocksX + bx;
      blockWeights[bIdx] = 0.85 + tex.textureComplexity * 0.3;
      for (let p = 0; p < slots; p += 1) {
        const slot = MID_FREQ_SLOTS[p];
        if (slot) blockScores[bIdx * slots + p] = scoreDcQimCoeff(dct[slot[1] * 8 + slot[0]] ?? 0);
      }
    }
  }

  let best: PhaseCandidate | null = null;
  const votes = new Float64Array(WATERMARK_FRAME_BITS);
  const bits = new Uint8Array(WATERMARK_FRAME_BITS);
  for (let tileShiftY = 0; tileShiftY < MACRO_TILE_ROWS; tileShiftY += 1) {
    for (let tileShiftX = 0; tileShiftX < MACRO_TILE_COLS; tileShiftX += 1) {
      votes.fill(0);
      for (let by = 0; by < blocksY; by += 1) {
        const ty = (by + tileShiftY) & 7;
        for (let bx = 0; bx < blocksX; bx += 1) {
          const bitBase = macroSlotToBitBase((bx + tileShiftX) & 3, ty);
          const bIdx = by * blocksX + bx;
          const w = blockWeights[bIdx] ?? 1;
          for (let p = 0; p < slots; p += 1) {
            votes[bitBase + p] = (votes[bitBase + p] ?? 0) + w * clamp((blockScores[bIdx * slots + p] ?? 0) / 0.25, -1, 1);
          }
        }
      }
      for (let k = 0; k < WATERMARK_FRAME_BITS; k += 1) bits[k] = (votes[k] ?? 0) >= 0 ? 1 : 0;

      const pass1 = computeBlockAgreeRates(blockScores, blocksX, blocksY, tileShiftX, tileShiftY, bits);
      let bitAgreement = pass1.meanAgreement;
      let res = bitAgreement >= 0.6 ? decodeWithChase2(votes, bits) : { decoded: decodeWatermarkPayloadBits(bits), bits: new Uint8Array(bits) };
      // Pass 2 (IRLS 3×3 이웃 기반 변조 마스크 재투표): 자기 블록을 제외한 주변 8이웃 무결성으로 변조 패치를 억제해 CRC-16 복원
      if (!res.decoded.crcValid && bitAgreement >= 0.6) {
        const nbMeans = computeNeighborMeanRates(pass1.rates, blocksX, blocksY, true);
        votes.fill(0);
        for (let by = 0; by < blocksY; by += 1) {
          const ty = (by + tileShiftY) & 7;
          for (let bx = 0; bx < blocksX; bx += 1) {
            const bIdx = by * blocksX + bx;
            const w = (blockWeights[bIdx] ?? 1) * ((nbMeans[bIdx] ?? 0) >= 0.78 ? 1 : 0.005);
            const bitBase = macroSlotToBitBase((bx + tileShiftX) & 3, ty);
            for (let p = 0; p < slots; p += 1) {
              votes[bitBase + p] = (votes[bitBase + p] ?? 0) + w * clamp((blockScores[bIdx * slots + p] ?? 0) / 0.25, -1, 1);
            }
          }
        }
        for (let k = 0; k < WATERMARK_FRAME_BITS; k += 1) bits[k] = (votes[k] ?? 0) >= 0 ? 1 : 0;
        res = decodeWithChase2(votes, bits);
        bitAgreement = computeBlockAgreeRates(blockScores, blocksX, blocksY, tileShiftX, tileShiftY, res.bits).meanAgreement;
      }
      const score = (res.decoded.crcValid ? 2 : res.decoded.magicValid ? 1 : 0) + bitAgreement;
      const bestScore = best ? (best.decoded.crcValid ? 2 : best.decoded.magicValid ? 1 : 0) + best.bitAgreement : -1;
      if (score > bestScore) {
        best = { decoded: res.decoded, bits: res.bits, bitAgreement, pixelShiftX, pixelShiftY, tileShiftX, tileShiftY, blockScores, blocksX, blocksY };
      }
    }
  }
  return best;
}

/** 워터마크가 삽입된 캔버스에서 페이로드를 블라인드 역추출하고 국소 변조 블록 비율을 산출한다. */
export function extractAdaptiveAiWatermark(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: AdaptiveWatermarkExtractOptions = {},
): AdaptiveWatermarkExtractResult {
  const safeW = Math.max(8, Math.trunc(width));
  const safeH = Math.max(8, Math.trunc(height));
  let best = scanPhaseAtPixelOffset(pixels, safeW, safeH, 0, 0);

  if ((options.enablePhaseResync ?? true) && (!best || !best.decoded.crcValid)) {
    outer: for (let py = 0; py < 8; py += 1) {
      for (let px = 0; px < 8; px += 1) {
        if (px === 0 && py === 0) continue;
        const cand = scanPhaseAtPixelOffset(pixels, safeW, safeH, px, py);
        if (!cand) continue;
        const cScore = (cand.decoded.crcValid ? 2 : cand.decoded.magicValid ? 1 : 0) + cand.bitAgreement;
        const bScore = best ? (best.decoded.crcValid ? 2 : best.decoded.magicValid ? 1 : 0) + best.bitAgreement : -1;
        if (cScore > bScore) best = cand;
        if (cand.decoded.crcValid) break outer;
      }
    }
  }

  if (!best) {
    return {
      detected: false, crcValid: false, payloadMatchedExpected: options.expectedAuthorId || options.expectedWorkId ? false : null,
      extractedAuthorId: "", extractedWorkId: "", extractedTimestampSec: 0, extractedTimestampIso: DEFAULT_WATERMARK_TIMESTAMP_ISO,
      payloadTagHex: "0000", bitAccuracy: 0, detectionConfidence: 0, tamperDetected: false, tamperedBlockRatio: 0,
      suspectBlockCount: 0, evaluatedBlocks: 0, alignedPhase: { pixelShiftX: 0, pixelShiftY: 0, tileShiftX: 0, tileShiftY: 0 }, verdict: "NOT_FOUND",
    };
  }

  let referenceBits = best.bits;
  let payloadMatchedExpected: boolean | null = null;
  let frameBitAccuracy = best.bitAgreement;
  if (options.expectedAuthorId && options.expectedWorkId) {
    const expected = encodeWatermarkPayloadBits({
      authorId: options.expectedAuthorId, workId: options.expectedWorkId, timestampIso: options.expectedTimestampIso ?? best.decoded.timestampIso,
    });
    let match = 0;
    for (let k = 0; k < WATERMARK_FRAME_BITS; k += 1) if ((best.bits[k] ?? 0) === (expected.bits[k] ?? 0)) match += 1;
    frameBitAccuracy = match / WATERMARK_FRAME_BITS;
    payloadMatchedExpected = best.decoded.crcValid && best.decoded.payloadTagHex === expected.payloadTagHex
      && best.decoded.authorId === decodeFixedUtf8Field(expected.bytes, 6, 11)
      && best.decoded.workId === decodeFixedUtf8Field(expected.bytes, 17, 11);
    if (best.decoded.crcValid && payloadMatchedExpected) referenceBits = expected.bits;
  }

  const totalBlocks = best.blocksX * best.blocksY;
  const { rates: blockRates } = computeBlockAgreeRates(best.blockScores, best.blocksX, best.blocksY, best.tileShiftX, best.tileShiftY, referenceBits);
  const nbMeans = computeNeighborMeanRates(blockRates, best.blocksX, best.blocksY);

  let suspectBlockCount = 0;
  for (let i = 0; i < totalBlocks; i += 1) {
    if ((blockRates[i] ?? 0) <= 0.625 && (nbMeans[i] ?? 0) < 0.78) suspectBlockCount += 1;
  }

  const tamperedBlockRatio = totalBlocks > 0 ? roundTo(suspectBlockCount / totalBlocks, 4) : 0;
  const detected = best.decoded.crcValid && best.bitAgreement >= 0.56;
  const tamperDetected = detected && tamperedBlockRatio >= 0.08;
  const detectionConfidence = roundTo(
    best.decoded.crcValid ? clamp((best.bitAgreement - 0.5) * 2 * 0.65 + frameBitAccuracy * 0.35, 0, 1) : clamp((best.bitAgreement - 0.5) * 1.1, 0, 0.45),
    4,
  );
  const verdict: WatermarkVerificationVerdict = !detected ? "NOT_FOUND" : tamperDetected ? "TAMPER_DETECTED" : best.bitAgreement >= 0.85 ? "VERIFIED_INTACT" : "SURVIVED_WITH_DEGRADATION";

  return {
    detected, crcValid: best.decoded.crcValid, payloadMatchedExpected, extractedAuthorId: best.decoded.authorId,
    extractedWorkId: best.decoded.workId, extractedTimestampSec: best.decoded.timestampSec, extractedTimestampIso: best.decoded.timestampIso,
    payloadTagHex: best.decoded.payloadTagHex, bitAccuracy: roundTo(frameBitAccuracy, 4), detectionConfidence,
    tamperDetected, tamperedBlockRatio, suspectBlockCount, evaluatedBlocks: totalBlocks,
    alignedPhase: { pixelShiftX: best.pixelShiftX, pixelShiftY: best.pixelShiftY, tileShiftX: best.tileShiftX, tileShiftY: best.tileShiftY }, verdict,
  };
}

// === 6. 공격·변조 시뮬레이터 (크롭 · JPEG Q70 재압축 · AI 국소 인페인팅) ===

/** 이미지 가장자리를 지정 비율만큼 잘라내는 크롭 공격을 시뮬레이션한다. */
export function simulateCropAttack(pixels: Uint8ClampedArray, width: number, height: number, cropRatio = 0.2, offsetPx = 11): {
  readonly pixels: Uint8ClampedArray; readonly width: number; readonly height: number;
} {
  const outW = Math.max(64, Math.floor(width * (1 - clamp(cropRatio, 0.05, 0.45))));
  const outH = Math.max(64, Math.floor(height * (1 - clamp(cropRatio, 0.05, 0.45))));
  const startX = Math.min(width - outW, Math.max(0, Math.trunc(offsetPx)));
  const startY = Math.min(height - outH, Math.max(0, Math.trunc(offsetPx)));
  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y += 1) {
    for (let x = 0; x < outW; x += 1) {
      const s = ((startY + y) * width + (startX + x)) * 4;
      const d = (y * outW + x) * 4;
      out[d] = pixels[s] ?? 0; out[d + 1] = pixels[s + 1] ?? 0; out[d + 2] = pixels[s + 2] ?? 0; out[d + 3] = pixels[s + 3] ?? 255;
    }
  }
  return { pixels: out, width: outW, height: outH };
}

/** JPEG Annex K 8×8 DCT 양자화·역양자화 기반 손실 재압축을 시뮬레이션한다. */
export function simulateRecompressionAttack(pixels: Uint8ClampedArray, width: number, height: number, quality = 70): Uint8ClampedArray {
  const q = clamp(Math.round(quality), 25, 95);
  const scale = q < 50 ? 5000 / q : 200 - 2 * q;
  const qTable = new Float64Array(64);
  for (let i = 0; i < 64; i += 1) qTable[i] = Math.max(1, Math.floor(((JPEG_LUMA_Q50[i] ?? 16) * scale + 50) / 100));
  const out = new Uint8ClampedArray(pixels);
  const lumaIn = new Float64Array(64); const dct = new Float64Array(64); const lumaOut = new Float64Array(64);
  for (let by = 0; by < Math.floor(height / 8); by += 1) {
    for (let bx = 0; bx < Math.floor(width / 8); bx += 1) {
      const baseY = by * 8; const baseX = bx * 8;
      loadLumaBlock8x8(pixels, width, baseX, baseY, lumaIn);
      forwardDct8x8(lumaIn, dct);
      for (let i = 0; i < 64; i += 1) { const step = qTable[i] ?? 1; dct[i] = Math.round((dct[i] ?? 0) / step) * step; }
      inverseDct8x8(dct, lumaOut);
      for (let py = 0; py < 8; py += 1) {
        for (let px = 0; px < 8; px += 1) {
          const i = ((baseY + py) * width + (baseX + px)) * 4;
          const dY = (lumaOut[py * 8 + px] ?? 0) - (lumaIn[py * 8 + px] ?? 0);
          out[i] = clampByte((pixels[i] ?? 0) + dY); out[i + 1] = clampByte((pixels[i + 1] ?? 0) + dY); out[i + 2] = clampByte((pixels[i + 2] ?? 0) + dY);
        }
      }
    }
  }
  return out;
}

/** AI 국소 인페인팅·확산 재생성 변조(중앙 패치 합성 패턴 덮어쓰기)를 시뮬레이션한다. */
export function simulateAiInpaintTamperAttack(pixels: Uint8ClampedArray, width: number, height: number, tamperAreaFraction = 0.32): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels);
  const sideRatio = Math.sqrt(clamp(tamperAreaFraction, 0.12, 0.55));
  const patchW = Math.floor(width * sideRatio); const patchH = Math.floor(height * sideRatio);
  const startX = Math.floor((width - patchW) / 2); const startY = Math.floor((height - patchH) / 2);
  for (let y = startY; y < startY + patchH; y += 1) {
    for (let x = startX; x < startX + patchW; x += 1) {
      const wave = Math.sin(x * 0.27 + y * 0.19) * 28 + Math.cos(x * 0.13 - y * 0.31) * 22;
      const grain = ((((x * 374761393 + y * 668265263) ^ 0x5bf03635) >>> 0) % 29) - 14;
      const i = (y * width + x) * 4;
      out[i] = clampByte(138 + wave + grain); out[i + 1] = clampByte(126 + wave * 0.8 - grain); out[i + 2] = clampByte(144 - wave * 0.6 + grain); out[i + 3] = 255;
    }
  }
  return out;
}

/** 지정된 공격 시나리오를 실행하고 워터마크 생존·변조 탐지 리포트를 생성한다. */
export function evaluateWatermarkAttackScenario(embedded: AdaptiveWatermarkEmbedResult, attackKind: WatermarkAttackKind): WatermarkAttackSimulationReport {
  let targetPixels = embedded.pixels; let targetW = embedded.width; let targetH = embedded.height;
  let labelKo = "원본 무손실"; let labelEn = "Clean Original";
  if (attackKind === "crop-20pct") {
    const cropped = simulateCropAttack(embedded.pixels, embedded.width, embedded.height, 0.2, 11);
    targetPixels = cropped.pixels; targetW = cropped.width; targetH = cropped.height;
    labelKo = "크롭 20% (비정렬 11px 시프트)"; labelEn = "20% Crop (Unaligned 11px Shift)";
  } else if (attackKind === "recompress-jpeg-q70") {
    targetPixels = simulateRecompressionAttack(embedded.pixels, embedded.width, embedded.height, 70);
    labelKo = "JPEG Q70 재압축"; labelEn = "JPEG Q70 Recompression";
  } else if (attackKind === "ai-inpaint-tamper") {
    targetPixels = simulateAiInpaintTamperAttack(embedded.pixels, embedded.width, embedded.height, 0.32);
    labelKo = "AI 국소 인페인팅 변조 (32%)"; labelEn = "AI Localized Inpaint Tamper (32%)";
  }

  const extraction = extractAdaptiveAiWatermark(targetPixels, targetW, targetH, {
    expectedAuthorId: embedded.authorId, expectedWorkId: embedded.workId, expectedTimestampIso: embedded.timestampIso, enablePhaseResync: true,
  });
  const confPct = Math.round(extraction.detectionConfidence * 100);
  const tamperPct = Math.round(extraction.tamperedBlockRatio * 100);
  const summaryKo = extraction.verdict === "VERIFIED_INTACT"
    ? `${labelKo}: 작성자(${extraction.extractedAuthorId})·작품(${extraction.extractedWorkId}) CRC-16 무결 검증 통과 (신뢰도 ${confPct}%).`
    : extraction.verdict === "TAMPER_DETECTED"
      ? `${labelKo}: 원본 서명(${extraction.extractedAuthorId}) 생존 확인 및 국소 변조 영역 ${tamperPct}% 탐지 (신뢰도 ${confPct}%).`
      : extraction.verdict === "SURVIVED_WITH_DEGRADATION"
        ? `${labelKo}: 열화 환경에서 원본 서명(${extraction.extractedAuthorId}) 복원 완료 (신뢰도 ${confPct}%).`
        : `${labelKo}: 유효한 워터마크 페이로드를 복원하지 못했습니다 (신뢰도 ${confPct}%).`;
  const summaryEn = extraction.verdict === "VERIFIED_INTACT"
    ? `${labelEn}: Author (${extraction.extractedAuthorId}) & work (${extraction.extractedWorkId}) verified intact via CRC-16 (${confPct}% confidence).`
    : extraction.verdict === "TAMPER_DETECTED"
      ? `${labelEn}: Original signature (${extraction.extractedAuthorId}) survived; localized tamper flagged on ${tamperPct}% of blocks (${confPct}% confidence).`
      : extraction.verdict === "SURVIVED_WITH_DEGRADATION"
        ? `${labelEn}: Original signature (${extraction.extractedAuthorId}) recovered under degradation (${confPct}% confidence).`
        : `${labelEn}: Failed to recover valid watermark payload (${confPct}% confidence).`;

  return { attackKind, labelKo, labelEn, outputWidth: targetW, outputHeight: targetH, extraction, summaryKo, summaryEn };
}

// === 7. Rights BOM + C2PA + 적응형 워터마크 통합 출고 프리플라이트 게이트 ===

/** Rights BOM 라이선스 · 워터마크 화질(PSNR >= 38 dB) · 역추출 · C2PA 원장 무결성을 통합 심사한다. */
export function evaluateWatermarkExportPreflightGate(params: {
  readonly targetChannel: WatermarkExportPreflightReport["targetChannel"];
  readonly nowIso: string; readonly rightsBomItems: readonly ExportRightsBomItem[];
  readonly watermarkEmbed: AdaptiveWatermarkEmbedResult; readonly watermarkExtract: AdaptiveWatermarkExtractResult;
  readonly ledgerVerification?: RightsSettlementLedgerVerification;
}): WatermarkExportPreflightReport {
  const checks: ExportPreflightCheckItem[] = [];
  const blockedReasonsKo: string[] = [];
  const blockedReasonsEn: string[] = [];
  const push = (item: ExportPreflightCheckItem): void => {
    checks.push(item);
    if (item.status === "block") { blockedReasonsKo.push(item.detailKo); blockedReasonsEn.push(item.detailEn); }
  };

  const isCommercial = params.targetChannel !== "portfolio-noncommercial";
  const nowMs = Date.parse(params.nowIso);
  const blockedAssets = [
    ...(isCommercial ? params.rightsBomItems.filter((i) => !i.commercialUseAllowed) : []),
    ...params.rightsBomItems.filter((i) => i.expiresAtIso !== undefined && Number.isFinite(Date.parse(i.expiresAtIso)) && Date.parse(i.expiresAtIso) <= nowMs),
  ];
  const missingAttr = params.rightsBomItems.filter((i) => i.attributionRequired && !i.attributionIncluded);

  if (blockedAssets.length > 0) {
    const names = blockedAssets.map((i) => i.assetName).join(", ");
    push({ id: "rights-bom-clearance", category: "rights-bom", status: "block", titleKo: "Rights BOM 상업 권리·만료 검증", titleEn: "Rights BOM Commercial & Expiry Clearance", detailKo: `출고 차단 에셋(${names}): 비상업 라이선스 또는 만료된 에셋이 포함되었습니다.`, detailEn: `Blocked assets (${names}): non-commercial or expired license detected.` });
  } else if (missingAttr.length > 0) {
    push({ id: "rights-bom-clearance", category: "rights-bom", status: "warn", titleKo: "Rights BOM 출처 표기 권장", titleEn: "Rights BOM Attribution Notice", detailKo: `출처 표기 누락 에셋 ${missingAttr.length}건이 있습니다.`, detailEn: `${missingAttr.length} asset(s) require attribution credit.` });
  } else {
    push({ id: "rights-bom-clearance", category: "rights-bom", status: "pass", titleKo: "Rights BOM 상업 권리·만료 검증", titleEn: "Rights BOM Commercial & Expiry Clearance", detailKo: `등록 에셋 ${params.rightsBomItems.length}건 모두 상업 출고 기준을 충족했습니다.`, detailEn: `All ${params.rightsBomItems.length} Rights BOM assets cleared.` });
  }

  push(params.watermarkEmbed.psnrPass
    ? { id: "watermark-psnr-floor", category: "watermark-quality", status: "pass", titleKo: "적응형 워터마크 비가시 화질(PSNR >= 38 dB)", titleEn: "Adaptive Watermark Visual Quality (PSNR >= 38 dB)", detailKo: `전체 ${params.watermarkEmbed.overallPsnrDb} dB · 피부/셀 ${params.watermarkEmbed.flatRegionPsnrDb} dB · 고주파 ${params.watermarkEmbed.highFreqRegionPsnrDb} dB`, detailEn: `Overall ${params.watermarkEmbed.overallPsnrDb} dB · Flat ${params.watermarkEmbed.flatRegionPsnrDb} dB · High-freq ${params.watermarkEmbed.highFreqRegionPsnrDb} dB` }
    : { id: "watermark-psnr-floor", category: "watermark-quality", status: "block", titleKo: "적응형 워터마크 비가시 화질(PSNR >= 38 dB)", titleEn: "Adaptive Watermark Visual Quality (PSNR >= 38 dB)", detailKo: `화질 기준 미달: 전체 ${params.watermarkEmbed.overallPsnrDb} dB / 피부 ${params.watermarkEmbed.flatRegionPsnrDb} dB (최소 38 dB 필수).`, detailEn: `PSNR below 38 dB floor: overall ${params.watermarkEmbed.overallPsnrDb} dB / flat ${params.watermarkEmbed.flatRegionPsnrDb} dB.` });

  const rtOk = params.watermarkExtract.detected && params.watermarkExtract.crcValid && params.watermarkExtract.payloadMatchedExpected !== false && params.watermarkExtract.detectionConfidence >= 0.75;
  push(rtOk
    ? { id: "watermark-roundtrip-extract", category: "watermark-extract", status: "pass", titleKo: "워터마크 페이로드 역추출(CRC-16)", titleEn: "Watermark Payload Roundtrip Extraction (CRC-16)", detailKo: `작성자(${params.watermarkExtract.extractedAuthorId}) · 작품(${params.watermarkExtract.extractedWorkId}) CRC-16 검증 완료 (${Math.round(params.watermarkExtract.detectionConfidence * 100)}%).`, detailEn: `Author (${params.watermarkExtract.extractedAuthorId}) & work (${params.watermarkExtract.extractedWorkId}) verified via CRC-16 (${Math.round(params.watermarkExtract.detectionConfidence * 100)}%).` }
    : { id: "watermark-roundtrip-extract", category: "watermark-extract", status: "block", titleKo: "워터마크 페이로드 역추출(CRC-16)", titleEn: "Watermark Payload Roundtrip Extraction (CRC-16)", detailKo: `워터마크 역추출 검증 실패(판정: ${params.watermarkExtract.verdict}, 신뢰도 ${Math.round(params.watermarkExtract.detectionConfidence * 100)}%).`, detailEn: `Watermark roundtrip extraction failed (verdict: ${params.watermarkExtract.verdict}, confidence ${Math.round(params.watermarkExtract.detectionConfidence * 100)}%).` });

  if (params.ledgerVerification) {
    push(params.ledgerVerification.valid
      ? { id: "c2pa-ledger-integrity", category: "c2pa-ledger", status: "pass", titleKo: "C2PA v2.1 · 10,000 bps 원장 해시 체인", titleEn: "C2PA v2.1 & 10,000 bps Ledger Hash Chain", detailKo: `${params.ledgerVerification.checkedBlocks}개 블록 해시 체인 및 10,000 bps 지분 정합성 검증 완료.`, detailEn: `${params.ledgerVerification.checkedBlocks} hash-chain blocks and 10,000 bps split verified intact.` }
      : { id: "c2pa-ledger-integrity", category: "c2pa-ledger", status: "block", titleKo: "C2PA v2.1 · 10,000 bps 원장 해시 체인", titleEn: "C2PA v2.1 & 10,000 bps Ledger Hash Chain", detailKo: `C2PA·정산 원장 무결성 오류 ${params.ledgerVerification.issues.length}건이 감지되어 출고를 차단합니다.`, detailEn: `C2PA/settlement ledger failed verification (${params.ledgerVerification.issues.length} issue(s)); export blocked.` });
  }

  const hasBlock = checks.some((c) => c.status === "block");
  const status: WatermarkExportPreflightReport["status"] = hasBlock ? "BLOCK" : checks.some((c) => c.status === "warn") ? "WARN" : "PASS";
  return { status, exportAllowed: !hasBlock, targetChannel: params.targetChannel, checks, blockedReasonsKo, blockedReasonsEn, watermarkDigestSha256: params.watermarkEmbed.payloadDigestSha256 };
}

// === 8. 결정론적 웹툰 데모 캔버스 & Rights BOM 픽스처 ===

/** 단색 피부/셀, 중간 의상 선화, 고주파 머리카락·배경 3개 영역이 공존하는 결정론적 웹툰 컷 픽셀 버퍼를 생성한다. */
export function createDemoWebtoonWatermarkCanvas(width = 128, height = 128): Uint8ClampedArray {
  const safeW = Math.max(64, Math.trunc(width)); const safeH = Math.max(64, Math.trunc(height));
  const pixels = new Uint8ClampedArray(safeW * safeH * 4);
  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const i = (y * safeW + x) * 4; const nx = x / safeW; const ny = y / safeH;
      if (nx < 0.42 && ny < 0.62) {
        pixels[i] = 236; pixels[i + 1] = 204; pixels[i + 2] = 184; pixels[i + 3] = 255;
      } else if (nx < 0.56) {
        const line = (x + y) % 11 === 0 ? -42 : 0; const grad = Math.round(ny * 28);
        pixels[i] = clampByte(118 + grad + line); pixels[i + 1] = clampByte(132 + grad + line); pixels[i + 2] = clampByte(166 + grad + line); pixels[i + 3] = 255;
      } else {
        const strand = Math.sin(x * 1.15 + Math.sin(y * 0.45) * 2.2) * 38;
        const foliage = Math.cos(x * 0.85 - y * 1.25) * 34;
        const grain = ((((x * 2654435761) ^ (y * 2246822519)) >>> 24) - 128) * 0.48;
        pixels[i] = clampByte(112 + strand + grain); pixels[i + 1] = clampByte(118 + foliage - grain * 0.7); pixels[i + 2] = clampByte(136 + (strand - foliage) * 0.6 + grain * 0.5); pixels[i + 3] = 255;
      }
    }
  }
  return pixels;
}

export const DEFAULT_EXPORT_RIGHTS_BOM_ITEMS: readonly ExportRightsBomItem[] = Object.freeze([
  Object.freeze({ assetId: "asset-font-pretendard", assetName: "Pretendard Variable (OFL 1.1)", kind: "font", licenseName: "SIL OFL 1.1 Commercial", commercialUseAllowed: true, aiTrainingAllowed: false, attributionRequired: false, attributionIncluded: true }),
  Object.freeze({ assetId: "asset-bg3d-rooftop", assetName: "서울 옥상 3D 배경 팩 (상업 1인 라이선스)", kind: "3d-bg", licenseName: "Commercial Webtoon License", commercialUseAllowed: true, aiTrainingAllowed: false, attributionRequired: true, attributionIncluded: true, expiresAtIso: "2028-12-31T23:59:59Z" }),
  Object.freeze({ assetId: "asset-brush-ink", assetName: "ToonStudio 정밀 G펜 브러시", kind: "brush", licenseName: "CC0 Public Domain", commercialUseAllowed: true, aiTrainingAllowed: false, attributionRequired: false, attributionIncluded: true }),
]);
