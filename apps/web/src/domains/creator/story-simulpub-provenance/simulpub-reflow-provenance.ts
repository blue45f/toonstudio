/**
 * 5개국 동시 연재 말풍선 리플로우 · 로컬 HMAC 무결성 예제 · 크롭 내성 비가시 워터마크 엔진 (Wave 39D).
 *
 * - 5개국(`ko`, `en`, `ja`, `es`, `id`) 텍스트 팽창 계수(영어 +25%, 스페인어 +32%, 일본어 세로쓰기 tategaki) 반영
 * - 인물 얼굴·눈 안전 영역(`faceSafeBoxes`) 0px 겹침 보장 재배치 솔버
 * - SHA-256 / HMAC-SHA256 기반 로컬 무결성 예제(C2PA 서명·신원 검증 아님) (BigInt 리터럴 미사용)
 * - 16×16 주기 타일 차동 체커보드 QIM 비가시 워터마크 (임의 홀수 좌표 크롭·밝기 변화 내성)
 */

import { bytesToHex, computeDeterministicSha256Bytes } from "./local-integrity-demo";

export {
  computeDeterministicHmacSha256Hex, computeDeterministicSha256Bytes, computeDeterministicSha256Hex,
  createDemoCreatorIdentity, createLocalIntegrityManifest, verifyLocalIntegrityManifest,
  createCreatorDidIdentity, createC2paProvenanceManifest, verifyC2paProvenanceManifest,
  type DemoCreatorIdentity, type LocalIntegrityManifestInput, type LocalIntegrityClaimPayload,
  type LocalIntegrityManifest, type LocalIntegrityVerificationResult,
  type CreatorDidIdentity, type C2paManifestInput, type C2paCreationClaimPayload,
  type C2paCreationManifest, type C2paVerificationResult,
} from "./local-integrity-demo";

export type SimulpubLocale = "ko" | "en" | "ja" | "es" | "id";
export type WritingDirection = "horizontal-tb" | "vertical-rl";

export interface LocaleReflowProfile {
  readonly locale: SimulpubLocale; readonly labelKo: string; readonly labelEn: string; readonly nativeName: string;
  readonly expansionFactor: number; readonly writingMode: WritingDirection;
  readonly avgCharWidthEm: number; readonly lineHeightRatio: number;
}

export const LOCALE_EXPANSION_PROFILES: Readonly<Record<SimulpubLocale, LocaleReflowProfile>> = {
  ko: { locale: "ko", labelKo: "한국어 (원본)", labelEn: "Korean (Base)", nativeName: "한국어", expansionFactor: 1.0, writingMode: "horizontal-tb", avgCharWidthEm: 0.96, lineHeightRatio: 1.44 },
  en: { locale: "en", labelKo: "영어 (+25%)", labelEn: "English (+25%)", nativeName: "English", expansionFactor: 1.25, writingMode: "horizontal-tb", avgCharWidthEm: 0.58, lineHeightRatio: 1.34 },
  ja: { locale: "ja", labelKo: "일본어 (세로쓰기)", labelEn: "Japanese (Tategaki)", nativeName: "日本語 (縦書き)", expansionFactor: 1.08, writingMode: "vertical-rl", avgCharWidthEm: 1.0, lineHeightRatio: 1.52 },
  es: { locale: "es", labelKo: "스페인어 (+32%)", labelEn: "Spanish (+32%)", nativeName: "Español", expansionFactor: 1.32, writingMode: "horizontal-tb", avgCharWidthEm: 0.6, lineHeightRatio: 1.38 },
  id: { locale: "id", labelKo: "인도네시아어 (+28%)", labelEn: "Indonesian (+28%)", nativeName: "Bahasa Indonesia", expansionFactor: 1.28, writingMode: "horizontal-tb", avgCharWidthEm: 0.59, lineHeightRatio: 1.36 },
};

export const SIMULPUB_LOCALES: readonly SimulpubLocale[] = ["ko", "en", "ja", "es", "id"];

export interface RectBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface FaceSafeBox extends RectBox {
  readonly id: string; readonly characterName: string; readonly kind: "face" | "eyes"; readonly paddingPx?: number;
}
export interface SourceSpeechBalloon {
  readonly balloonId: string; readonly speaker: string; readonly baseBox: RectBox; readonly fontSizePx: number;
  readonly translations: Readonly<Record<SimulpubLocale, string>>;
  readonly tailAnchor?: { readonly x: number; readonly y: number };
}
export interface SimulpubPanelLayoutInput {
  readonly panelId: string; readonly titleKo: string; readonly titleEn: string;
  readonly canvasWidth: number; readonly canvasHeight: number; readonly marginPx?: number;
  readonly faceSafeBoxes: readonly FaceSafeBox[]; readonly balloons: readonly SourceSpeechBalloon[];
}
export interface ReflowedBalloonResult {
  readonly textOverflow: boolean;
  readonly balloonId: string; readonly speaker: string; readonly locale: SimulpubLocale; readonly text: string;
  readonly writingMode: WritingDirection; readonly expansionFactor: number;
  readonly originalBox: RectBox; readonly reflowedBox: RectBox; readonly effectiveFontSizePx: number;
  readonly displacementPx: number; readonly faceOverlapAreaPx: number; readonly siblingOverlapAreaPx: number;
  readonly relocatedToAvoidFace: boolean; readonly areaRatio: number;
}
export interface LocaleReflowSummary {
  readonly hasTextOverflow: boolean;
  readonly locale: SimulpubLocale; readonly writingMode: WritingDirection; readonly expansionFactor: number;
  readonly balloons: readonly ReflowedBalloonResult[]; readonly maxFaceOverlapAreaPx: number;
  readonly zeroFaceOverlapGuaranteed: boolean; readonly relocatedCount: number; readonly avgDisplacementPx: number;
}
export interface SimulpubReflowReport {
  readonly panelId: string; readonly canvasWidth: number; readonly canvasHeight: number;
  readonly locales: Readonly<Record<SimulpubLocale, LocaleReflowSummary>>;
  readonly allLocalesZeroFaceOverlap: boolean; readonly totalBalloonsPerLocale: number;
}

/** 두 사각형의 겹침 면적(px^2)을 계산한다. 경계만 맞닿으면 0이다. */
export function computeRectOverlapArea(a: RectBox, b: RectBox): number {
  const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return overlapW <= 0 || overlapH <= 0 ? 0 : overlapW * overlapH;
}

function inflateRect(box: RectBox, pad: number): RectBox {
  return { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 };
}

function clampBoxToCanvas(box: RectBox, canvasW: number, canvasH: number, margin: number): RectBox {
  const width = Math.min(box.width, Math.max(40, canvasW - margin * 2));
  const height = Math.min(box.height, Math.max(36, canvasH - margin * 2));
  const x = Math.min(Math.max(margin, box.x), Math.max(margin, canvasW - margin - width));
  const y = Math.min(Math.max(margin, box.y), Math.max(margin, canvasH - margin - height));
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function totalOverlapWith(box: RectBox, obstacles: readonly RectBox[]): number {
  let sum = 0;
  for (const obs of obstacles) sum += computeRectOverlapArea(box, obs);
  return sum;
}

function boxCenterDist(a: RectBox, b: RectBox): number {
  return Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
}

function computeTargetDimensions(
  balloon: SourceSpeechBalloon,
  profile: LocaleReflowProfile,
  fontSizePx: number,
  canvasW: number,
  canvasH: number,
  margin: number,
): { readonly width: number; readonly height: number } {
  const text = balloon.translations[profile.locale] ?? balloon.translations.ko;
  const charCount = Math.max(1, text.trim().length);
  const maxW = Math.max(80, canvasW - margin * 2);
  const maxH = Math.max(72, canvasH - margin * 2);

  if (profile.writingMode === "vertical-rl") {
    const charsPerCol = Math.max(6, Math.min(13, Math.ceil(Math.sqrt(charCount * 1.9))));
    const colCount = Math.max(1, Math.ceil(charCount / charsPerCol));
    const scaleSqrt = Math.sqrt(profile.expansionFactor);
    const width = Math.min(maxW * 0.48, Math.max(72, (colCount * fontSizePx * profile.lineHeightRatio + 24) * scaleSqrt));
    const height = Math.min(maxH * 0.62, Math.max(balloon.baseBox.height * 1.15, (charsPerCol * fontSizePx * 1.06 + 20) * scaleSqrt));
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scaleLinear = Math.sqrt(profile.expansionFactor);
  const expandedW = balloon.baseBox.width * scaleLinear;
  const expandedH = balloon.baseBox.height * scaleLinear;
  const charsPerLine = Math.max(6, Math.floor(Math.max(64, expandedW - 24) / (fontSizePx * profile.avgCharWidthEm)));
  const neededH = Math.max(1, Math.ceil(charCount / charsPerLine)) * fontSizePx * profile.lineHeightRatio + 20;
  return {
    width: Math.round(Math.min(maxW, Math.max(balloon.baseBox.width * Math.min(1.18, scaleLinear), expandedW))),
    height: Math.round(Math.min(maxH, Math.max(expandedH, neededH))),
  };
}

/** 폰트 렌더링 실측이 아닌 보수적인 텍스트 수용량 추정이다. */
function textFitsBox(text: string, box: RectBox, font: number, profile: LocaleReflowProfile): boolean {
  const columns = profile.writingMode === "vertical-rl"
    ? Math.floor(Math.max(0, box.width - 24) / (font * profile.lineHeightRatio))
    : Math.floor(Math.max(0, box.width - 24) / (font * profile.avgCharWidthEm));
  const rows = profile.writingMode === "vertical-rl"
    ? Math.floor(Math.max(0, box.height - 20) / (font * 1.06))
    : Math.floor(Math.max(0, box.height - 20) / (font * profile.lineHeightRatio));
  return Array.from(text.trim()).length <= columns * rows;
}

function searchCollisionFreePlacement(
  desired: RectBox,
  canvasW: number,
  canvasH: number,
  margin: number,
  faceObstacles: readonly RectBox[],
  siblingObstacles: readonly RectBox[],
): RectBox | null {
  const clamped = clampBoxToCanvas(desired, canvasW, canvasH, margin);
  if (totalOverlapWith(clamped, faceObstacles) === 0 && totalOverlapWith(clamped, siblingObstacles) === 0) {
    return clamped;
  }

  const candidates: RectBox[] = [];
  for (const obs of [...faceObstacles, ...siblingObstacles]) {
    const snaps: readonly [number, number][] = [
      [desired.x, obs.y - desired.height], [desired.x, obs.y + obs.height],
      [obs.x - desired.width, desired.y], [obs.x + obs.width, desired.y],
      [obs.x - desired.width, obs.y - desired.height], [obs.x + obs.width, obs.y - desired.height],
      [obs.x - desired.width, obs.y + obs.height], [obs.x + obs.width, obs.y + obs.height],
    ];
    for (const [px, py] of snaps) {
      candidates.push(clampBoxToCanvas({ x: px, y: py, width: desired.width, height: desired.height }, canvasW, canvasH, margin));
    }
  }

  const maxX = Math.max(margin, canvasW - margin - desired.width);
  const maxY = Math.max(margin, canvasH - margin - desired.height);
  const stepX = Math.max(16, Math.round((maxX - margin) / 14) || 24);
  const stepY = Math.max(16, Math.round((maxY - margin) / 18) || 24);

  for (let y = margin; y <= maxY; y += stepY) {
    for (let x = margin; x <= maxX; x += stepX) candidates.push({ x, y, width: desired.width, height: desired.height });
    candidates.push({ x: maxX, y, width: desired.width, height: desired.height });
  }
  for (let x = margin; x <= maxX; x += stepX) candidates.push({ x, y: maxY, width: desired.width, height: desired.height });
  candidates.push({ x: maxX, y: maxY, width: desired.width, height: desired.height });

  let bestZeroAll: { readonly box: RectBox; readonly dist: number } | null = null;
  let bestZeroFace: { readonly box: RectBox; readonly sibOv: number; readonly dist: number } | null = null;

  for (const cand of candidates) {
    if (totalOverlapWith(cand, faceObstacles) > 0) continue;
    const sibOv = totalOverlapWith(cand, siblingObstacles);
    const dist = boxCenterDist(cand, desired);
    if (sibOv === 0) {
      if (!bestZeroAll || dist < bestZeroAll.dist) bestZeroAll = { box: cand, dist };
    } else if (!bestZeroFace || sibOv < bestZeroFace.sibOv || (sibOv === bestZeroFace.sibOv && dist < bestZeroFace.dist)) {
      bestZeroFace = { box: cand, sibOv, dist };
    }
  }
  return bestZeroAll?.box ?? bestZeroFace?.box ?? null;
}

/** 단일 언어에 맞춰 말풍선을 리플로우하고 얼굴/눈 안전 영역과 0px 겹침을 보장한다. */
export function reflowPanelForLocale(input: SimulpubPanelLayoutInput, locale: SimulpubLocale): LocaleReflowSummary {
  const profile = LOCALE_EXPANSION_PROFILES[locale];
  const margin = input.marginPx ?? 16;
  const rawFaces: RectBox[] = input.faceSafeBoxes.map((f) => ({ x: f.x, y: f.y, width: f.width, height: f.height }));
  const paddedFaces: RectBox[] = input.faceSafeBoxes.map((f) => inflateRect(f, f.paddingPx ?? 8));
  const placedSiblings: RectBox[] = [];
  const results: ReflowedBalloonResult[] = [];

  for (const balloon of input.balloons) {
    const text = balloon.translations[locale] ?? balloon.translations.ko;
    let chosenBox: RectBox | null = null;
    let chosenFont = balloon.fontSizePx;

    for (const scale of [1.0, 0.92, 0.85, 0.78, 0.7, 0.62]) {
      const fSize = Math.max(10, Math.round(balloon.fontSizePx * scale * 10) / 10);
      const dims = computeTargetDimensions(balloon, profile, fSize, input.canvasWidth, input.canvasHeight, margin);
      const desired: RectBox = {
        x: Math.round(balloon.baseBox.x + (balloon.baseBox.width - dims.width) / 2),
        y: Math.round(balloon.baseBox.y + (balloon.baseBox.height - dims.height) / 2),
        width: dims.width,
        height: dims.height,
      };
      const found = searchCollisionFreePlacement(desired, input.canvasWidth, input.canvasHeight, margin, paddedFaces, placedSiblings);
      if (found) {
        chosenBox = found; chosenFont = fSize;
        if (textFitsBox(text, found, fSize, profile)) break;
      }
    }

    if (!chosenBox) {
      for (const scale of [0.85, 0.72, 0.6, 0.5]) {
        const fSize = Math.max(9, Math.round(balloon.fontSizePx * scale * 10) / 10);
        const dims = computeTargetDimensions(balloon, profile, fSize, input.canvasWidth, input.canvasHeight, margin);
        const desired: RectBox = {
          x: balloon.baseBox.x, y: balloon.baseBox.y,
          width: Math.max(56, Math.round(dims.width * scale)), height: Math.max(44, Math.round(dims.height * scale)),
        };
        const found = searchCollisionFreePlacement(desired, input.canvasWidth, input.canvasHeight, margin, rawFaces, placedSiblings);
        if (found) {
          chosenBox = found; chosenFont = fSize;
          if (textFitsBox(text, found, fSize, profile)) break;
        }
      }
    }

    const finalBox = chosenBox ?? clampBoxToCanvas(
      { x: margin, y: margin, width: Math.min(120, input.canvasWidth - margin * 2), height: Math.min(56, input.canvasHeight - margin * 2) },
      input.canvasWidth, input.canvasHeight, margin,
    );
    const faceOverlapAreaPx = totalOverlapWith(finalBox, rawFaces);
    const siblingOverlapAreaPx = totalOverlapWith(finalBox, placedSiblings);
    const displacementPx = Math.round(boxCenterDist(finalBox, balloon.baseBox) * 10) / 10;
    const areaRatio = Math.round(((finalBox.width * finalBox.height) / Math.max(1, balloon.baseBox.width * balloon.baseBox.height)) * 100) / 100;

    placedSiblings.push(inflateRect(finalBox, 6));
    results.push({
      balloonId: balloon.balloonId, speaker: balloon.speaker, locale, text,
      textOverflow: !textFitsBox(text, finalBox, chosenFont, profile),
      writingMode: profile.writingMode, expansionFactor: profile.expansionFactor,
      originalBox: balloon.baseBox, reflowedBox: finalBox, effectiveFontSizePx: chosenFont,
      displacementPx, faceOverlapAreaPx, siblingOverlapAreaPx,
      relocatedToAvoidFace: displacementPx > 4, areaRatio,
    });
  }

  const maxFaceOverlapAreaPx = results.reduce((m, r) => Math.max(m, r.faceOverlapAreaPx), 0);
  return {
    locale, writingMode: profile.writingMode, expansionFactor: profile.expansionFactor, balloons: results,
    hasTextOverflow: results.some((result) => result.textOverflow),
    maxFaceOverlapAreaPx, zeroFaceOverlapGuaranteed: maxFaceOverlapAreaPx === 0,
    relocatedCount: results.filter((r) => r.relocatedToAvoidFace).length,
    avgDisplacementPx: results.length === 0 ? 0 : Math.round((results.reduce((s, r) => s + r.displacementPx, 0) / results.length) * 10) / 10,
  };
}

/** 5개국(`ko`, `en`, `ja`, `es`, `id`) 전체 동시 연재 리플로우 리포트를 생성한다. */
export function reflowPanelAllLocales(input: SimulpubPanelLayoutInput): SimulpubReflowReport {
  const locales: Readonly<Record<SimulpubLocale, LocaleReflowSummary>> = {
    ko: reflowPanelForLocale(input, "ko"),
    en: reflowPanelForLocale(input, "en"),
    ja: reflowPanelForLocale(input, "ja"),
    es: reflowPanelForLocale(input, "es"),
    id: reflowPanelForLocale(input, "id"),
  };
  return {
    panelId: input.panelId, canvasWidth: input.canvasWidth, canvasHeight: input.canvasHeight, locales,
    allLocalesZeroFaceOverlap: SIMULPUB_LOCALES.every((loc) => locales[loc].zeroFaceOverlapGuaranteed),
    totalBalloonsPerLocale: input.balloons.length,
  };
}

// ============================================================================
// 크롭 내성 비가시 워터마크 (16×16 타일 차동 체커보드 64-bit 페이로드 + CRC-16)
// ============================================================================

export interface RgbaArtworkBuffer { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray; }
export interface WatermarkEncodeResult {
  readonly embeddingStatus: "embedded" | "unsupported-image";
  readonly watermarked: RgbaArtworkBuffer; readonly payloadHex: string; readonly creatorTagHex: string;
  readonly assetTagHex: string; readonly crc16Hex: string; readonly tileCount: number; readonly psnrDb: number;
}
export interface WatermarkVerifyResult {
  readonly identityVerified: false; readonly assetIntegrityVerified: false;
  readonly detected: boolean; readonly crcValid: boolean;
  readonly creatorTagMatched: boolean | null; readonly assetTagMatched: boolean | null;
  readonly recoveredPayloadHex: string | null; readonly recoveredCreatorTagHex: string | null;
  readonly recoveredAssetTagHex: string | null; readonly detectedPhaseX: number;
  readonly detectedPhaseY: number; readonly tilesSampled: number; readonly confidenceScore: number;
}

const WATERMARK_SYNC_WORD = 0xb49d;

function computeCrc16Ccitt(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc & 0xffff;
}

function twoByteTagHex(bytes: Uint8Array, offset: number): string {
  return (bytes[offset] ?? 0).toString(16).padStart(2, "0") + (bytes[offset + 1] ?? 0).toString(16).padStart(2, "0");
}

function buildWatermarkBits(creatorDid: string, assetDigestHex: string) {
  const cHash = computeDeterministicSha256Bytes(creatorDid);
  const aHash = computeDeterministicSha256Bytes(assetDigestHex);
  const h6 = new Uint8Array([
    (WATERMARK_SYNC_WORD >>> 8) & 0xff, WATERMARK_SYNC_WORD & 0xff,
    cHash[0] ?? 0, cHash[1] ?? 0, aHash[0] ?? 0, aHash[1] ?? 0,
  ]);
  const crc = computeCrc16Ccitt(h6);
  const bytes = new Uint8Array(8);
  bytes.set(h6, 0); bytes[6] = (crc >>> 8) & 0xff; bytes[7] = crc & 0xff;
  const bits = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) bits[i] = ((bytes[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1;
  return { bits, bytes, creatorTagHex: twoByteTagHex(h6, 2), assetTagHex: twoByteTagHex(h6, 4), crc16Hex: crc.toString(16).padStart(4, "0") };
}

/** 두 RGBA 버퍼의 PSNR(dB)을 계산한다(비가시성 품질 지표). */
export function computeRgbaPsnrDb(a: RgbaArtworkBuffer, b: RgbaArtworkBuffer): number {
  const len = Math.min(a.data.length, b.data.length);
  let sumSq = 0; let count = 0;
  for (let i = 0; i < len; i += 4) {
    const dr = (a.data[i] ?? 0) - (b.data[i] ?? 0);
    const dg = (a.data[i + 1] ?? 0) - (b.data[i + 1] ?? 0);
    const db = (a.data[i + 2] ?? 0) - (b.data[i + 2] ?? 0);
    sumSq += dr * dr + dg * dg + db * db;
    count += 3;
  }
  return count === 0 || sumSq === 0 ? 99.9 : Math.round(10 * Math.log10((255 * 255) / (sumSq / count)) * 100) / 100;
}

/** 16×16 주기 타일 차동 체커보드 비가시 워터마크를 RGBA 버퍼에 삽입한다. */
export function encodeCropResistantWatermark(
  source: RgbaArtworkBuffer,
  creatorDid: string,
  assetDigestHex: string,
  strength = 5,
): WatermarkEncodeResult {
  const s = Math.max(2, Math.min(10, Math.round(strength)));
  const out = new Uint8ClampedArray(source.data);
  const { bits, bytes, creatorTagHex, assetTagHex, crc16Hex } = buildWatermarkBits(creatorDid, assetDigestHex);
  const cellsX = Math.floor(source.width / 2);
  const cellsY = Math.floor(source.height / 2);
  const maxStep = Math.min(18, s * 3);

  for (let cy = 0; cy < cellsY; cy += 1) {
    const y = cy * 2; const ty = cy & 7;
    for (let cx = 0; cx < cellsX; cx += 1) {
      const x = cx * 2; const bit = bits[ty * 8 + (cx & 7)] ?? 0;
      const i00 = (y * source.width + x) * 4 + 2;
      const i10 = (y * source.width + x + 1) * 4 + 2;
      const i01 = ((y + 1) * source.width + x) * 4 + 2;
      const i11 = ((y + 1) * source.width + x + 1) * 4 + 2;
      const p00 = out[i00] ?? 0; const p10 = out[i10] ?? 0; const p01 = out[i01] ?? 0; const p11 = out[i11] ?? 0;
      const targetDiff = bit === 1 ? s * 4 : -s * 4;
      const delta = Math.max(-maxStep, Math.min(maxStep, Math.round((targetDiff - (p00 + p11 - (p10 + p01))) / 4)));
      out[i00] = Math.max(0, Math.min(255, p00 + delta));
      out[i11] = Math.max(0, Math.min(255, p11 + delta));
      out[i10] = Math.max(0, Math.min(255, p10 - delta));
      out[i01] = Math.max(0, Math.min(255, p01 - delta));
    }
  }

  const watermarked: RgbaArtworkBuffer = { width: source.width, height: source.height, data: out };
  return {
    watermarked, payloadHex: bytesToHex(bytes), creatorTagHex, assetTagHex, crc16Hex,
    embeddingStatus: verifyCropResistantWatermark(watermarked, creatorDid, assetDigestHex).recoveredPayloadHex === bytesToHex(bytes) ? "embedded" : "unsupported-image",
    tileCount: Math.floor(source.width / 16) * Math.floor(source.height / 16),
    psnrDb: computeRgbaPsnrDb(source, watermarked),
  };
}

function sumTileBitDiff(
  data: Uint8ClampedArray,
  width: number,
  ox: number,
  oy: number,
  tilesX: number,
  tilesY: number,
  bitIdx: number,
): number {
  const ty = bitIdx >>> 3;
  const tx = bitIdx & 7;
  let sum = 0;
  for (let gy = 0; gy < tilesY; gy += 1) {
    const y = oy + gy * 16 + ty * 2;
    const r0 = y * width; const r1 = (y + 1) * width;
    for (let gx = 0; gx < tilesX; gx += 1) {
      const x = ox + gx * 16 + tx * 2;
      sum += (data[(r0 + x) * 4 + 2] ?? 0) + (data[(r1 + x + 1) * 4 + 2] ?? 0) - ((data[(r0 + x + 1) * 4 + 2] ?? 0) + (data[(r1 + x) * 4 + 2] ?? 0));
    }
  }
  return sum;
}

/** 16비트 태그와 CRC를 복원한다. 신원·원본 전체 무결성을 증명하지 않으며 모든 이미지·크롭 성공을 보장하지 않는다. */
export function verifyCropResistantWatermark(
  buffer: RgbaArtworkBuffer,
  expectedCreatorDid?: string,
  expectedAssetDigestHex?: string,
): WatermarkVerifyResult {
  const empty: WatermarkVerifyResult = {
    identityVerified: false, assetIntegrityVerified: false,
    detected: false, crcValid: false,
    creatorTagMatched: expectedCreatorDid ? false : null, assetTagMatched: expectedAssetDigestHex ? false : null,
    recoveredPayloadHex: null, recoveredCreatorTagHex: null, recoveredAssetTagHex: null,
    detectedPhaseX: 0, detectedPhaseY: 0, tilesSampled: 0, confidenceScore: 0,
  };
  if (buffer.width < 16 || buffer.height < 16) return empty;

  const { data, width, height } = buffer;
  const accum = new Float64Array(64);
  let best: { readonly bytes: Uint8Array; readonly ox: number; readonly oy: number; readonly tiles: number; readonly confidence: number } | null = null;

  for (let oy = 0; oy < 16; oy += 1) {
    const tilesY = Math.floor((height - oy) / 16);
    if (tilesY < 1) continue;
    for (let ox = 0; ox < 16; ox += 1) {
      const tilesX = Math.floor((width - ox) / 16);
      if (tilesX < 1) continue;

      let syncOk = true;
      for (let i = 0; i < 16; i += 1) {
        const s = sumTileBitDiff(data, width, ox, oy, tilesX, tilesY, i);
        accum[i] = s;
        if ((s > 0 ? 1 : 0) !== ((WATERMARK_SYNC_WORD >>> (15 - i)) & 1)) { syncOk = false; break; }
      }
      if (!syncOk) continue;

      for (let i = 16; i < 64; i += 1) accum[i] = sumTileBitDiff(data, width, ox, oy, tilesX, tilesY, i);
      const recovered = new Uint8Array(8);
      const tiles = tilesX * tilesY;
      let meanAbs = 0;
      for (let i = 0; i < 64; i += 1) {
        const val = accum[i] ?? 0;
        meanAbs += Math.abs(val) / tiles;
        if (val > 0) recovered[i >>> 3] = (recovered[i >>> 3] ?? 0) | (1 << (7 - (i & 7)));
      }
      if (computeCrc16Ccitt(recovered.subarray(0, 6)) !== (((recovered[6] ?? 0) << 8) | (recovered[7] ?? 0))) continue;
      const confidence = Math.min(100, Math.round(((meanAbs / 64) / 12) * 100));
      if (!best || confidence > best.confidence) best = { bytes: recovered, ox, oy, tiles, confidence };
    }
  }
  if (!best) return empty;

  const recCreator = twoByteTagHex(best.bytes, 2);
  const recAsset = twoByteTagHex(best.bytes, 4);
  return {
    identityVerified: false, assetIntegrityVerified: false,
    detected: true, crcValid: true,
    creatorTagMatched: expectedCreatorDid ? recCreator === twoByteTagHex(computeDeterministicSha256Bytes(expectedCreatorDid), 0) : null,
    assetTagMatched: expectedAssetDigestHex ? recAsset === twoByteTagHex(computeDeterministicSha256Bytes(expectedAssetDigestHex), 0) : null,
    recoveredPayloadHex: bytesToHex(best.bytes), recoveredCreatorTagHex: recCreator, recoveredAssetTagHex: recAsset,
    detectedPhaseX: best.ox, detectedPhaseY: best.oy, tilesSampled: best.tiles, confidenceScore: best.confidence,
  };
}

/** 워터마크 크롭 내성 검증용 RGBA 부분 영역 크롭 유틸리티. */
export function cropRgbaBuffer(source: RgbaArtworkBuffer, cropX: number, cropY: number, cropW: number, cropH: number): RgbaArtworkBuffer {
  const sx = Math.max(0, Math.min(source.width - 1, Math.round(cropX)));
  const sy = Math.max(0, Math.min(source.height - 1, Math.round(cropY)));
  const w = Math.max(1, Math.min(source.width - sx, Math.round(cropW)));
  const h = Math.max(1, Math.min(source.height - sy, Math.round(cropH)));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const start = ((sy + y) * source.width + sx) * 4;
    out.set(source.data.subarray(start, start + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}

/** 결정론적 합성 원화 RGBA 버퍼를 생성한다(스튜디오 프리뷰·검증용). */
export function createSyntheticArtworkRgba(width = 128, height = 128): RgbaArtworkBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const sky = Math.round(90 + (y / Math.max(1, height - 1)) * 110);
      const tone = (x + y) % 19 === 0 ? 20 : 0;
      data[idx] = Math.min(255, sky + tone);
      data[idx + 1] = Math.min(255, Math.round(sky * 0.92) + 18);
      data[idx + 2] = Math.min(255, Math.round(135 + (x / Math.max(1, width - 1)) * 70));
      data[idx + 3] = 255;
    }
  }
  return { width, height, data };
}

/** 5개국 동시 연재 리플로우 기본 데모 컷 (얼굴·눈 안전영역 근접 배치). */
export const DEFAULT_SIMULPUB_PANEL_INPUT: SimulpubPanelLayoutInput = {
  panelId: "ep12-cut-07",
  titleKo: "12화 7컷 · 종탑 대치 장면",
  titleEn: "EP.12 Cut 07 · Clocktower Confrontation",
  canvasWidth: 800, canvasHeight: 1120, marginPx: 20,
  faceSafeBoxes: [
    { id: "face-seojun", characterName: "한서준", kind: "face", x: 245, y: 260, width: 240, height: 265, paddingPx: 12 },
    { id: "eyes-seojun", characterName: "한서준(눈)", kind: "eyes", x: 280, y: 345, width: 170, height: 58, paddingPx: 14 },
    { id: "face-yuna", characterName: "최유나", kind: "face", x: 420, y: 640, width: 215, height: 235, paddingPx: 12 },
  ],
  balloons: [
    {
      balloonId: "b-01", speaker: "한서준", baseBox: { x: 80, y: 120, width: 250, height: 128 }, fontSizePx: 16,
      translations: {
        ko: "종이 열세 번 울리기 전에 금고를 열어야 해.",
        en: "We have to unlock the underground vault before the clock strikes thirteen.",
        ja: "鐘が十三回鳴る前に地下金庫を開けなければ。",
        es: "Tenemos que abrir la bóveda subterránea antes de que suene la decimotercera campanada.",
        id: "Kita harus membuka brankas bawah tanah sebelum lonceng berdentang tiga belas kali.",
      },
      tailAnchor: { x: 310, y: 270 },
    },
    {
      balloonId: "b-02", speaker: "최유나", baseBox: { x: 425, y: 495, width: 235, height: 130 }, fontSizePx: 16,
      translations: {
        ko: "잠깐, 네 왼쪽 눈썹 상처에서 아직 피가 나고 있어!",
        en: "Wait a second, the scar above your left eyebrow is still bleeding right now!",
        ja: "待って、左眉の傷からまだ血が流れているよ！",
        es: "¡Espera un segundo, la cicatriz sobre tu ceja izquierda todavía está sangrando ahora mismo!",
        id: "Tunggu sebentar, bekas luka di atas alis kirimu masih mengeluarkan darah sekarang!",
      },
      tailAnchor: { x: 490, y: 650 },
    },
    {
      balloonId: "b-03", speaker: "한서준", baseBox: { x: 64, y: 865, width: 275, height: 126 }, fontSizePx: 15,
      translations: {
        ko: "괜찮아. 이 시계탑의 진짜 설계자는 바로 여기 있어.",
        en: "I am fine. The real architect behind this black clocktower is already standing right here.",
        ja: "大丈夫。この時計塔の真の設計者はもうここにいる。",
        es: "Estoy bien. El verdadero arquitecto detrás de esta torre del reloj negra ya está aquí mismo.",
        id: "Aku baik-baik saja. Arsitek sebenarnya di balik menara jam hitam ini sudah berdiri tepat di sini.",
      },
      tailAnchor: { x: 260, y: 850 },
    },
  ],
};
