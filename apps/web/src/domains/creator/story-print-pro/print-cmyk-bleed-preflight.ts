/**
 * 단행본·크라우드펀딩 인쇄용 RGB→CMYK 소프트 프루핑 · 3mm 도련(Bleed)·재단선·안전여백 · 책등 두께 산출 엔진.
 *
 * 100% 브라우저 로컬(₩0) 결정적 인쇄 프리플라이트:
 * - Demichel–Neugebauer 16-원색 잉크 오버프린트 모델 + CIE Lab(D65) ΔE76 색역 이탈(Out-of-Gamut) 검출
 * - GCR/UCR 기반 CMYK 분판 및 잉크 총량(TAC) 한도 자동 제한·경고
 * - 신국판·A5·B6·4×6판·B5 단행본 규격, 3mm 도련·재단선(Crop Mark)·제본 여백, 페이지 수/평량 기반 책등(mm) 산출
 */

import type { RgbColor8 } from "./script-mood-lighting-engine";

export type PrintIccProfileId = "japan-color-2001-coated" | "fogra39-coated" | "swop-v2-coated" | "uncoated-book";
export type PrintTrimFormatId = "shin-gukpan" | "a5" | "b6" | "4x6" | "b5" | "custom";
export type PaperStockKind = "white-uncoated" | "cream-novel" | "art-coated" | "snow-coated" | "matte-bulk";
export type BookBindingKind = "perfect-bound" | "pur-bound" | "hardcover" | "saddle-stitch";

export interface CmykColorPercent {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly tacPercent: number;
}

export interface PrintIccProfileSpec {
  readonly id: PrintIccProfileId;
  readonly labelKo: string;
  readonly maxTacPercent: number;
  readonly dotGainFactor: number;
  readonly gcrStrength: number;
  readonly gamutDeltaEThreshold: number;
}

export interface SoftProofColorResult {
  readonly profileId: PrintIccProfileId;
  readonly inputRgb: RgbColor8;
  readonly inputHex: string;
  readonly cmyk: CmykColorPercent;
  readonly rawTacPercent: number;
  readonly isTacExceeded: boolean;
  readonly softProofRgb: RgbColor8;
  readonly softProofHex: string;
  readonly deltaE76: number;
  readonly isOutOfGamut: boolean;
  readonly warningKo: string | null;
}

export interface ColorGamutBatchReport {
  readonly profileId: PrintIccProfileId;
  readonly totalSamples: number;
  readonly outOfGamutCount: number;
  readonly outOfGamutRatio: number;
  readonly tacExceededCount: number;
  readonly maxDeltaE76: number;
  readonly meanDeltaE76: number;
  readonly samples: readonly SoftProofColorResult[];
}

export interface PrintTrimPreset {
  readonly id: Exclude<PrintTrimFormatId, "custom">;
  readonly labelKo: string;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
}

export interface RectMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

export interface CropMarkSegmentMm {
  readonly corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  readonly orientation: "horizontal" | "vertical";
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
}

export interface PrintPageGeometry {
  readonly formatId: PrintTrimFormatId;
  readonly dpi: number;
  readonly bleedMm: number;
  readonly outerSafeMarginMm: number;
  readonly gutterSafeMarginMm: number;
  readonly trimBoxMm: RectMm;
  readonly bleedBoxMm: RectMm;
  readonly safeBoxMm: RectMm;
  readonly bleedWidthPx: number;
  readonly bleedHeightPx: number;
  readonly trimWidthPx: number;
  readonly trimHeightPx: number;
  readonly cropMarksMm: readonly CropMarkSegmentMm[];
}

export interface BookSpineInput {
  readonly interiorPageCount: number;
  readonly paperStock: PaperStockKind;
  readonly interiorGsm: number;
  readonly bindingType: BookBindingKind;
  readonly coverGsm?: number;
  readonly caliperMicronPerSheet?: number;
  readonly trimWidthMm?: number;
  readonly trimHeightMm?: number;
  readonly bleedMm?: number;
  readonly wingWidthMm?: number;
}

export interface BookSpineCalculation {
  readonly interiorPageCount: number;
  readonly leafCount: number;
  readonly sheetThicknessMm: number;
  readonly textBlockThicknessMm: number;
  readonly coverContributionMm: number;
  readonly bindingAllowanceMm: number;
  readonly spineWidthMm: number;
  readonly spineTypographySafe: boolean;
  readonly fullCoverSpreadWidthMm: number;
  readonly fullCoverSpreadHeightMm: number;
  readonly signatureMultipleOf4: boolean;
  readonly signatureMultipleOf16: boolean;
}

export interface PrintCriticalElementBox {
  readonly id: string;
  readonly label: string;
  readonly boxMm: RectMm;
}

export interface PrintPreflightIssue {
  readonly code:
    | "LOW_DPI" | "INSUFFICIENT_BLEED" | "OUT_OF_GAMUT_COLORS"
    | "TAC_OVERFLOW" | "SAFE_MARGIN_VIOLATION" | "PAGE_SIGNATURE_MISMATCH" | "NARROW_SPINE_TEXT";
  readonly severity: "BLOCK" | "WARN";
  readonly messageKo: string;
  readonly elementId?: string;
}

export interface PrintPreflightInput {
  readonly formatId: PrintTrimFormatId;
  readonly customTrimWidthMm?: number;
  readonly customTrimHeightMm?: number;
  readonly bleedMm?: number;
  readonly outerSafeMarginMm?: number;
  readonly gutterSafeMarginMm?: number;
  readonly dpi: number;
  readonly profileId: PrintIccProfileId;
  readonly colorSamples: readonly RgbColor8[];
  readonly criticalElements?: readonly PrintCriticalElementBox[];
  readonly spineInput?: BookSpineInput;
}

export interface PrintPreflightReport {
  readonly verdict: "PASS" | "WARN" | "BLOCK";
  readonly profile: PrintIccProfileSpec;
  readonly geometry: PrintPageGeometry;
  readonly gamutReport: ColorGamutBatchReport;
  readonly spine: BookSpineCalculation | null;
  readonly issues: readonly PrintPreflightIssue[];
}

export const DEFAULT_PRINT_BLEED_MM = 3.0;
export const MIN_RECOMMENDED_BLEED_MM = 3.0;
export const MIN_RECOMMENDED_PRINT_DPI = 300;
export const DEFAULT_OUTER_SAFE_MARGIN_MM = 8.0;
export const DEFAULT_GUTTER_SAFE_MARGIN_MM = 12.0;

export const PRINT_TRIM_PRESETS: Readonly<Record<Exclude<PrintTrimFormatId, "custom">, PrintTrimPreset>> = {
  "shin-gukpan": { id: "shin-gukpan", labelKo: "신국판 (152×225mm)", trimWidthMm: 152, trimHeightMm: 225 },
  a5: { id: "a5", labelKo: "A5 국판 (148×210mm)", trimWidthMm: 148, trimHeightMm: 210 },
  b6: { id: "b6", labelKo: "B6 단행본 (128×182mm)", trimWidthMm: 128, trimHeightMm: 182 },
  "4x6": { id: "4x6", labelKo: "4×6판 (128×188mm)", trimWidthMm: 128, trimHeightMm: 188 },
  b5: { id: "b5", labelKo: "B5 화보집 (182×257mm)", trimWidthMm: 182, trimHeightMm: 257 },
};

export const PRINT_ICC_PROFILES: Readonly<Record<PrintIccProfileId, PrintIccProfileSpec>> = {
  "japan-color-2001-coated": {
    id: "japan-color-2001-coated", labelKo: "Japan Color 2001 Coated (국내·일본 단행본 코팅)",
    maxTacPercent: 320, dotGainFactor: 0.14, gcrStrength: 0.72, gamutDeltaEThreshold: 11.5,
  },
  "fogra39-coated": {
    id: "fogra39-coated", labelKo: "ISO Coated v2 / FOGRA39 (유럽·글로벌 표준)",
    maxTacPercent: 300, dotGainFactor: 0.15, gcrStrength: 0.75, gamutDeltaEThreshold: 11.5,
  },
  "swop-v2-coated": {
    id: "swop-v2-coated", labelKo: "US Web Coated SWOP v2 (북미 표준)",
    maxTacPercent: 300, dotGainFactor: 0.17, gcrStrength: 0.76, gamutDeltaEThreshold: 12.0,
  },
  "uncoated-book": {
    id: "uncoated-book", labelKo: "Uncoated Book (모조지·미색지 비코팅 내지)",
    maxTacPercent: 260, dotGainFactor: 0.24, gcrStrength: 0.82, gamutDeltaEThreshold: 10.5,
  },
};

/** 용지 종류별 1gsm 당 두께 계수(µm/gsm). 예: 100gsm 모조지(1.15) ≈ 0.115mm/장. */
const PAPER_BULK_FACTOR: Readonly<Record<PaperStockKind, number>> = {
  "white-uncoated": 1.15, "cream-novel": 1.24, "art-coated": 0.86, "snow-coated": 0.92, "matte-bulk": 1.38,
};

type Triplet = readonly [number, number, number];
interface NeugebauerPrimaries {
  readonly w: Triplet; readonly c: Triplet; readonly m: Triplet; readonly y: Triplet; readonly k: Triplet;
  readonly cm: Triplet; readonly cy: Triplet; readonly my: Triplet; readonly cmy: Triplet;
  readonly ck: Triplet; readonly mk: Triplet; readonly yk: Triplet;
  readonly cmk: Triplet; readonly cyk: Triplet; readonly myk: Triplet; readonly cmyk: Triplet;
}

const COATED_PRIMARIES: NeugebauerPrimaries = {
  w: [0.985, 0.982, 0.968], c: [0.02, 0.61, 0.85], m: [0.85, 0.12, 0.48], y: [0.97, 0.91, 0.08],
  k: [0.13, 0.125, 0.13], cm: [0.17, 0.21, 0.56], cy: [0.04, 0.56, 0.27], my: [0.86, 0.18, 0.14],
  cmy: [0.22, 0.2, 0.21], ck: [0.07, 0.14, 0.19], mk: [0.21, 0.08, 0.14], yk: [0.22, 0.2, 0.08],
  cmk: [0.08, 0.09, 0.16], cyk: [0.06, 0.14, 0.1], myk: [0.22, 0.09, 0.08], cmyk: [0.06, 0.06, 0.065],
};

const UNCOATED_PRIMARIES: NeugebauerPrimaries = {
  w: [0.955, 0.946, 0.918], c: [0.14, 0.58, 0.77], m: [0.79, 0.22, 0.48], y: [0.92, 0.84, 0.2],
  k: [0.22, 0.215, 0.22], cm: [0.25, 0.27, 0.52], cy: [0.16, 0.52, 0.32], my: [0.79, 0.27, 0.22],
  cmy: [0.3, 0.28, 0.29], ck: [0.15, 0.21, 0.25], mk: [0.28, 0.17, 0.22], yk: [0.29, 0.27, 0.16],
  cmk: [0.16, 0.17, 0.22], cyk: [0.15, 0.21, 0.17], myk: [0.28, 0.18, 0.16], cmyk: [0.14, 0.14, 0.145],
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const roundTo2 = (value: number): number => Math.round(value * 100) / 100;
const clampByte = (value: number): number => Math.round(clamp(value, 0, 255));
const formatHex = (rgb: RgbColor8): string =>
  `#${clampByte(rgb.r).toString(16).padStart(2, "0")}${clampByte(rgb.g).toString(16).padStart(2, "0")}${clampByte(rgb.b).toString(16).padStart(2, "0")}`;
const srgbToLinear = (c01: number): number => (c01 <= 0.04045 ? c01 / 12.92 : Math.pow((c01 + 0.055) / 1.055, 2.4));

function rgbToLabD65(rgb: RgbColor8): Triplet {
  const r = srgbToLinear(clamp(rgb.r, 0, 255) / 255);
  const g = srgbToLinear(clamp(rgb.g, 0, 255) / 255);
  const b = srgbToLinear(clamp(rgb.b, 0, 255) / 255);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047);
  const fy = f(r * 0.2126729 + g * 0.7151522 + b * 0.072175);
  const fz = f((r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function computeDeltaE76(a: RgbColor8, b: RgbColor8): number {
  const [l1, a1, b1] = rgbToLabD65(a);
  const [l2, a2, b2] = rgbToLabD65(b);
  return roundTo2(Math.hypot(l1 - l2, a1 - a2, b1 - b2));
}

function applyDotGain(ink01: number, dotGainFactor: number): number {
  const v = clamp(ink01, 0, 1);
  return clamp(v + dotGainFactor * v * (1 - v) * 2.2, 0, 1);
}

function simulateCmykOverprintRgb(cmyk: CmykColorPercent, profile: PrintIccProfileSpec): RgbColor8 {
  const p = profile.id === "uncoated-book" ? UNCOATED_PRIMARIES : COATED_PRIMARIES;
  const c = applyDotGain(cmyk.c / 100, profile.dotGainFactor);
  const m = applyDotGain(cmyk.m / 100, profile.dotGainFactor);
  const y = applyDotGain(cmyk.y / 100, profile.dotGainFactor);
  const k = applyDotGain(cmyk.k / 100, profile.dotGainFactor * 0.85);
  const ic = 1 - c;
  const im = 1 - m;
  const iy = 1 - y;
  const ik = 1 - k;

  const terms: readonly [number, Triplet][] = [
    [ic * im * iy * ik, p.w], [c * im * iy * ik, p.c], [ic * m * iy * ik, p.m], [ic * im * y * ik, p.y],
    [ic * im * iy * k, p.k], [c * m * iy * ik, p.cm], [c * im * y * ik, p.cy], [ic * m * y * ik, p.my],
    [c * m * y * ik, p.cmy], [c * im * iy * k, p.ck], [ic * m * iy * k, p.mk], [ic * im * y * k, p.yk],
    [c * m * iy * k, p.cmk], [c * im * y * k, p.cyk], [ic * m * y * k, p.myk], [c * m * y * k, p.cmyk],
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  for (const [w, primary] of terms) {
    r += w * primary[0];
    g += w * primary[1];
    b += w * primary[2];
  }
  return { r: clampByte(r * 255), g: clampByte(g * 255), b: clampByte(b * 255) };
}

/**
 * 단일 sRGB 색상을 인쇄용 CMYK로 분판하고, 색역 이탈(Out-of-Gamut) 및 TAC 잉크 총량을 소프트 프루핑한다.
 */
export function rgbToCmykSoftProof(
  inputRgb: RgbColor8,
  profileId: PrintIccProfileId = "japan-color-2001-coated",
): SoftProofColorResult {
  const profile = PRINT_ICC_PROFILES[profileId];
  const rgb: RgbColor8 = { r: clampByte(inputRgb.r), g: clampByte(inputRgb.g), b: clampByte(inputRgb.b) };

  const rawC = 1 - rgb.r / 255;
  const rawM = 1 - rgb.g / 255;
  const rawY = 1 - rgb.b / 255;
  const k01 = clamp(Math.min(rawC, rawM, rawY) * profile.gcrStrength, 0, 1);
  const denom = Math.max(0.0001, 1 - k01);

  let cPct = k01 >= 0.999 ? 0 : clamp(((rawC - k01) / denom) * 100, 0, 100);
  let mPct = k01 >= 0.999 ? 0 : clamp(((rawM - k01) / denom) * 100, 0, 100);
  let yPct = k01 >= 0.999 ? 0 : clamp(((rawY - k01) / denom) * 100, 0, 100);
  const kPct = clamp(k01 * 100, 0, 100);

  const rawTacPercent = roundTo2(Math.max(cPct + mPct + yPct + kPct, (rawC + rawM + rawY) * 100));
  let isTacExceeded = rawTacPercent > profile.maxTacPercent;

  const currentTac = cPct + mPct + yPct + kPct;
  if (currentTac > profile.maxTacPercent) {
    isTacExceeded = true;
    const cmyCurrent = cPct + mPct + yPct;
    const scale = cmyCurrent > 0 ? Math.max(0, profile.maxTacPercent - kPct) / cmyCurrent : 0;
    cPct *= scale;
    mPct *= scale;
    yPct *= scale;
  }

  const cmyk: CmykColorPercent = {
    c: roundTo2(cPct), m: roundTo2(mPct), y: roundTo2(yPct), k: roundTo2(kPct),
    tacPercent: roundTo2(cPct + mPct + yPct + kPct),
  };
  const softProofRgb = simulateCmykOverprintRgb(cmyk, profile);
  const deltaE76 = computeDeltaE76(rgb, softProofRgb);
  const isOutOfGamut = deltaE76 > profile.gamutDeltaEThreshold;

  const warningKo = isOutOfGamut
    ? `CMYK 색역 이탈(ΔE ${deltaE76.toFixed(1)}): 인쇄 시 채도가 낮아져 ${formatHex(softProofRgb)} 계열로 표현됩니다.`
    : isTacExceeded
      ? `잉크 총량(TAC)이 ${profile.maxTacPercent}% 한도를 초과해 GCR 감량 보정이 적용되었습니다.`
      : null;

  return {
    profileId, inputRgb: rgb, inputHex: formatHex(rgb), cmyk, rawTacPercent,
    isTacExceeded, softProofRgb, softProofHex: formatHex(softProofRgb), deltaE76, isOutOfGamut, warningKo,
  };
}

export function evaluateColorGamutBatch(
  samples: readonly RgbColor8[],
  profileId: PrintIccProfileId = "japan-color-2001-coated",
): ColorGamutBatchReport {
  const results = samples.map((sample) => rgbToCmykSoftProof(sample, profileId));
  const totalSamples = results.length;
  const outOfGamutCount = results.filter((entry) => entry.isOutOfGamut).length;
  const tacExceededCount = results.filter((entry) => entry.isTacExceeded).length;
  return {
    profileId,
    totalSamples,
    outOfGamutCount,
    outOfGamutRatio: totalSamples > 0 ? roundTo2(outOfGamutCount / totalSamples) : 0,
    tacExceededCount,
    maxDeltaE76: totalSamples > 0 ? roundTo2(results.reduce((max, entry) => Math.max(max, entry.deltaE76), 0)) : 0,
    meanDeltaE76: totalSamples > 0 ? roundTo2(results.reduce((sum, entry) => sum + entry.deltaE76, 0) / totalSamples) : 0,
    samples: results,
  };
}

export function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / 25.4) * dpi);
}

/**
 * 3mm 도련(Bleed)·재단선(Trim/Crop Marks)·안전여백 기하를 mm 및 지정 DPI 픽셀 단위로 산출한다.
 */
export function computePrintPageGeometry(options: {
  readonly formatId: PrintTrimFormatId;
  readonly customTrimWidthMm?: number;
  readonly customTrimHeightMm?: number;
  readonly bleedMm?: number;
  readonly outerSafeMarginMm?: number;
  readonly gutterSafeMarginMm?: number;
  readonly dpi?: number;
}): PrintPageGeometry {
  const dpi = Math.max(72, Math.round(options.dpi ?? MIN_RECOMMENDED_PRINT_DPI));
  const bleedMm = roundTo2(Math.max(0, options.bleedMm ?? DEFAULT_PRINT_BLEED_MM));
  const outerSafeMarginMm = roundTo2(Math.max(2, options.outerSafeMarginMm ?? DEFAULT_OUTER_SAFE_MARGIN_MM));
  const gutterSafeMarginMm = roundTo2(Math.max(outerSafeMarginMm, options.gutterSafeMarginMm ?? DEFAULT_GUTTER_SAFE_MARGIN_MM));

  const preset = options.formatId === "custom" ? null : PRINT_TRIM_PRESETS[options.formatId];
  const trimWidthMm = roundTo2(Math.max(50, preset ? preset.trimWidthMm : (options.customTrimWidthMm ?? 148)));
  const trimHeightMm = roundTo2(Math.max(50, preset ? preset.trimHeightMm : (options.customTrimHeightMm ?? 210)));
  const bleedWidthMm = roundTo2(trimWidthMm + bleedMm * 2);
  const bleedHeightMm = roundTo2(trimHeightMm + bleedMm * 2);

  const trimBoxMm: RectMm = { xMm: bleedMm, yMm: bleedMm, widthMm: trimWidthMm, heightMm: trimHeightMm };
  const bleedBoxMm: RectMm = { xMm: 0, yMm: 0, widthMm: bleedWidthMm, heightMm: bleedHeightMm };
  const safeBoxMm: RectMm = {
    xMm: roundTo2(bleedMm + gutterSafeMarginMm),
    yMm: roundTo2(bleedMm + outerSafeMarginMm),
    widthMm: roundTo2(Math.max(10, trimWidthMm - gutterSafeMarginMm - outerSafeMarginMm)),
    heightMm: roundTo2(Math.max(10, trimHeightMm - outerSafeMarginMm * 2)),
  };

  const markLen = Math.max(3, bleedMm);
  const left = trimBoxMm.xMm;
  const right = roundTo2(left + trimWidthMm);
  const top = trimBoxMm.yMm;
  const bottom = roundTo2(top + trimHeightMm);

  const cropMarksMm: CropMarkSegmentMm[] = [
    { corner: "top-left", orientation: "horizontal", x1Mm: roundTo2(left - markLen), y1Mm: top, x2Mm: left, y2Mm: top },
    { corner: "top-left", orientation: "vertical", x1Mm: left, y1Mm: roundTo2(top - markLen), x2Mm: left, y2Mm: top },
    { corner: "top-right", orientation: "horizontal", x1Mm: right, y1Mm: top, x2Mm: roundTo2(right + markLen), y2Mm: top },
    { corner: "top-right", orientation: "vertical", x1Mm: right, y1Mm: roundTo2(top - markLen), x2Mm: right, y2Mm: top },
    { corner: "bottom-left", orientation: "horizontal", x1Mm: roundTo2(left - markLen), y1Mm: bottom, x2Mm: left, y2Mm: bottom },
    { corner: "bottom-left", orientation: "vertical", x1Mm: left, y1Mm: bottom, x2Mm: left, y2Mm: roundTo2(bottom + markLen) },
    { corner: "bottom-right", orientation: "horizontal", x1Mm: right, y1Mm: bottom, x2Mm: roundTo2(right + markLen), y2Mm: bottom },
    { corner: "bottom-right", orientation: "vertical", x1Mm: right, y1Mm: bottom, x2Mm: right, y2Mm: roundTo2(bottom + markLen) },
  ];

  return {
    formatId: options.formatId, dpi, bleedMm, outerSafeMarginMm, gutterSafeMarginMm,
    trimBoxMm, bleedBoxMm, safeBoxMm,
    bleedWidthPx: mmToPx(bleedWidthMm, dpi), bleedHeightPx: mmToPx(bleedHeightMm, dpi),
    trimWidthPx: mmToPx(trimWidthMm, dpi), trimHeightPx: mmToPx(trimHeightMm, dpi),
    cropMarksMm,
  };
}

/**
 * 페이지 수·용지 평량(gsm)·제본 방식을 기반으로 단행본 책등 두께(mm)와 표지 전개도 치수를 산출한다.
 */
export function calculateBookSpineThicknessMm(input: BookSpineInput): BookSpineCalculation {
  const interiorPageCount = Math.max(4, Math.trunc(input.interiorPageCount));
  const leafCount = Math.ceil(interiorPageCount / 2);
  const interiorGsm = clamp(input.interiorGsm, 45, 300);
  const coverGsm = clamp(input.coverGsm ?? 250, 120, 450);

  const caliperMicron = input.caliperMicronPerSheet !== undefined
    ? clamp(input.caliperMicronPerSheet, 40, 400)
    : interiorGsm * PAPER_BULK_FACTOR[input.paperStock];
  const sheetThicknessMm = caliperMicron / 1000;
  const textBlockThicknessMm = leafCount * sheetThicknessMm;

  const [coverContributionMm, bindingAllowanceMm] =
    input.bindingType === "saddle-stitch"
      ? [(coverGsm * 1.02) / 1000, 0]
      : input.bindingType === "hardcover"
        ? [4.2, 1.2]
        : input.bindingType === "pur-bound"
          ? [((coverGsm * 1.05) / 1000) * 2, 0.35]
          : [((coverGsm * 1.05) / 1000) * 2, 0.45];

  const spineWidthMm = roundTo2(textBlockThicknessMm + coverContributionMm + bindingAllowanceMm);
  const trimWidthMm = input.trimWidthMm ?? PRINT_TRIM_PRESETS["shin-gukpan"].trimWidthMm;
  const trimHeightMm = input.trimHeightMm ?? PRINT_TRIM_PRESETS["shin-gukpan"].trimHeightMm;
  const bleedMm = Math.max(0, input.bleedMm ?? DEFAULT_PRINT_BLEED_MM);
  const wingWidthMm = Math.max(0, input.wingWidthMm ?? 0);

  return {
    interiorPageCount,
    leafCount,
    sheetThicknessMm: roundTo2(sheetThicknessMm),
    textBlockThicknessMm: roundTo2(textBlockThicknessMm),
    coverContributionMm: roundTo2(coverContributionMm),
    bindingAllowanceMm: roundTo2(bindingAllowanceMm),
    spineWidthMm,
    spineTypographySafe: spineWidthMm >= 6.0 && input.bindingType !== "saddle-stitch",
    fullCoverSpreadWidthMm: roundTo2(bleedMm * 2 + wingWidthMm * 2 + trimWidthMm * 2 + spineWidthMm),
    fullCoverSpreadHeightMm: roundTo2(trimHeightMm + bleedMm * 2),
    signatureMultipleOf4: interiorPageCount % 4 === 0,
    signatureMultipleOf16: interiorPageCount % 16 === 0,
  };
}

function isBoxInsideRect(inner: RectMm, outer: RectMm): boolean {
  const eps = 0.01;
  return (
    inner.xMm >= outer.xMm - eps
    && inner.yMm >= outer.yMm - eps
    && inner.xMm + inner.widthMm <= outer.xMm + outer.widthMm + eps
    && inner.yMm + inner.heightMm <= outer.yMm + outer.heightMm + eps
  );
}

/**
 * 단행본·크라우드펀딩 인쇄 출고 전 통합 CMYK·도련·안전여백·책등 프리플라이트 검수를 실행한다.
 */
export function runPrintCmykBleedPreflight(input: PrintPreflightInput): PrintPreflightReport {
  const profile = PRINT_ICC_PROFILES[input.profileId];
  const geometry = computePrintPageGeometry({
    formatId: input.formatId,
    customTrimWidthMm: input.customTrimWidthMm,
    customTrimHeightMm: input.customTrimHeightMm,
    bleedMm: input.bleedMm,
    outerSafeMarginMm: input.outerSafeMarginMm,
    gutterSafeMarginMm: input.gutterSafeMarginMm,
    dpi: input.dpi,
  });
  const gamutReport = evaluateColorGamutBatch(input.colorSamples, input.profileId);
  const spine = input.spineInput
    ? calculateBookSpineThicknessMm({
        ...input.spineInput,
        trimWidthMm: input.spineInput.trimWidthMm ?? geometry.trimBoxMm.widthMm,
        trimHeightMm: input.spineInput.trimHeightMm ?? geometry.trimBoxMm.heightMm,
        bleedMm: input.spineInput.bleedMm ?? geometry.bleedMm,
      })
    : null;

  const issues: PrintPreflightIssue[] = [];

  if (geometry.dpi < MIN_RECOMMENDED_PRINT_DPI) {
    issues.push({
      code: "LOW_DPI", severity: "BLOCK",
      messageKo: `해상도가 ${geometry.dpi} DPI입니다. 단행본 오프셋 인쇄는 최소 ${MIN_RECOMMENDED_PRINT_DPI} DPI 이상이어야 합니다.`,
    });
  }
  if (geometry.bleedMm < MIN_RECOMMENDED_BLEED_MM) {
    issues.push({
      code: "INSUFFICIENT_BLEED", severity: "BLOCK",
      messageKo: `도련(Bleed)이 ${geometry.bleedMm}mm로 부족합니다. 재단 흰 선 방지를 위해 최소 ${MIN_RECOMMENDED_BLEED_MM}mm를 확보하세요.`,
    });
  }
  if (gamutReport.outOfGamutCount > 0) {
    issues.push({
      code: "OUT_OF_GAMUT_COLORS",
      severity: gamutReport.outOfGamutRatio >= 0.35 ? "BLOCK" : "WARN",
      messageKo: `샘플 ${gamutReport.totalSamples}색 중 ${gamutReport.outOfGamutCount}색이 ${profile.id} CMYK 색역을 벗어났습니다(최대 ΔE ${gamutReport.maxDeltaE76.toFixed(1)}).`,
    });
  }
  if (gamutReport.tacExceededCount > 0) {
    issues.push({
      code: "TAC_OVERFLOW", severity: "WARN",
      messageKo: `${gamutReport.tacExceededCount}개 영역이 최대 잉크 총량(${profile.maxTacPercent}%)을 초과해 GCR 자동 감량이 필요합니다.`,
    });
  }
  for (const element of input.criticalElements ?? []) {
    if (!isBoxInsideRect(element.boxMm, geometry.safeBoxMm)) {
      issues.push({
        code: "SAFE_MARGIN_VIOLATION",
        severity: isBoxInsideRect(element.boxMm, geometry.trimBoxMm) ? "WARN" : "BLOCK",
        elementId: element.id,
        messageKo: `핵심 요소 '${element.label}'가 안전여백 밖으로 벗어나 재단 또는 제본 시 잘릴 위험이 있습니다.`,
      });
    }
  }
  if (spine && !spine.signatureMultipleOf4) {
    issues.push({
      code: "PAGE_SIGNATURE_MISMATCH", severity: "BLOCK",
      messageKo: `내지 ${spine.interiorPageCount}쪽은 4의 배수가 아니어서 인쇄 대수(Signature) 제본이 불가능합니다.`,
    });
  }
  if (spine && !spine.spineTypographySafe) {
    issues.push({
      code: "NARROW_SPINE_TEXT", severity: "WARN",
      messageKo: `책등 두께가 ${spine.spineWidthMm}mm로 얇아 책등 제목 인쇄 시 틀어짐 위험이 있습니다(6mm 이상 권장).`,
    });
  }

  const verdict = issues.some((i) => i.severity === "BLOCK")
    ? "BLOCK"
    : issues.some((i) => i.severity === "WARN") ? "WARN" : "PASS";

  return { verdict, profile, geometry, gamutReport, spine, issues };
}
