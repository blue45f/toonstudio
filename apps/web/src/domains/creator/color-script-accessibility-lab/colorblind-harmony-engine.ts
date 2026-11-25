/**
 * Wave 41D — 회차 4막 OKLCH 감정 컬러 스크립트 · LMS 근사 계산 4종 색각이상 시뮬레이터 ·
 * 다크/라이트 양면 모바일 뷰어 경계·할로 가독성 규칙 계산 예제.
 *
 * - IEC 61966-2-1 sRGB ↔ Linear RGB ↔ CIE XYZ(D65) ↔ CIE L*a*b*(CIEDE2000) / OKLab / OKLCH 정밀 변환.
 * - Viénot(1999) 단일 투영면(적색맹·녹색맹) + Brettel(1997) 이중 반평면(청황색맹) + 전색맹 선형 LMS 시뮬레이션.
 * - OKLCH 4막(기·승·전·결) 감정 긴장도 곡선 기반 보색/분할보색/유사색/삼원색 하모니 컬러 스크립트 아크 생성.
 * - 모바일 다크모드(#0B0D12) vs 라이트모드(#FFFFFF) 양면 컷 테두리 소실(border vanish) · 흰 여백 할로(halo bleed) 자동 검사.
 */

import { assertArc, assertDualViewer, assertRgb, choice, finite, unit } from "./color-input-contract";

export interface RgbColor { readonly r: number; readonly g: number; readonly b: number; }
export interface LmsColor { readonly l: number; readonly m: number; readonly s: number; }
export interface OklabColor { readonly L: number; readonly a: number; readonly b: number; }
export interface OklchColor { readonly L: number; readonly C: number; readonly h: number; }
export interface LabColor { readonly L: number; readonly a: number; readonly b: number; }

export type ColorVisionDeficiencyType = "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia";
export type HarmonyRuleId = "complementary" | "split-complementary" | "analogous" | "triadic";
export type EpisodeActId = "intro" | "development" | "climax" | "resolution";
export type EmotionArcPresetId = "noir-thriller" | "campus-romance" | "action-awakening" | "healing-slice";
export type DiscriminabilityStatus = "safe" | "caution" | "collision";
export type RiskSeverity = "safe" | "warning" | "critical";
export type DualViewerGrade = "pass" | "caution" | "fail";

export interface ColorSwatchSpec {
  readonly role: "backdrop" | "environment" | "keyLight" | "accent" | "shadowInk";
  readonly labelKo: string; readonly labelEn: string;
  readonly rgb: RgbColor; readonly hex: string;
  readonly oklch: OklchColor; readonly oklchCss: string; readonly luminance: number;
}
export interface EpisodeActScript {
  readonly actId: EpisodeActId; readonly order: 1 | 2 | 3 | 4;
  readonly labelKo: string; readonly labelEn: string; readonly tension: number;
  readonly harmonyAnglesDeg: readonly number[]; readonly swatches: readonly ColorSwatchSpec[];
  readonly averageLightness: number; readonly peakChroma: number; readonly luminanceSpan: number;
  readonly directorNoteKo: string; readonly directorNoteEn: string;
}
export interface EpisodeColorScriptInput {
  readonly baseHueDeg: number; readonly harmonyRule: HarmonyRuleId;
  readonly tensionCurve?: readonly [number, number, number, number];
  readonly baseLightness?: number; readonly baseChroma?: number; readonly presetId?: EmotionArcPresetId;
}
export interface EpisodeColorScriptArc {
  readonly baseHueDeg: number; readonly harmonyRule: HarmonyRuleId;
  readonly harmonyOffsetsDeg: readonly number[]; readonly acts: readonly EpisodeActScript[];
  readonly climaxActId: EpisodeActId; readonly chromaDynamicRange: number;
  readonly lightnessDynamicRange: number; readonly climaxContrastAudit: ColorPairAccessibilityReport;
}
export interface EmotionArcPreset {
  readonly id: EmotionArcPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly baseHueDeg: number; readonly harmonyRule: HarmonyRuleId;
  readonly baseLightness: number; readonly baseChroma: number;
  readonly tensionCurve: readonly [number, number, number, number];
}
export interface CvdSimulationResult {
  readonly scope: "model-calculation"; readonly humanMeasured: false;
  readonly type: ColorVisionDeficiencyType; readonly severity: number;
  readonly originalRgb: RgbColor; readonly originalHex: string;
  readonly simulatedRgb: RgbColor; readonly simulatedHex: string;
  readonly simulatedOklch: OklchColor; readonly simulatedOklchCss: string;
  readonly lmsBefore: LmsColor; readonly lmsAfter: LmsColor; readonly deltaE00FromOriginal: number;
}
export interface ColorPairAuditInput {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly roleAKo: string; readonly roleAEn: string; readonly roleBKo: string; readonly roleBEn: string;
  readonly colorA: RgbColor; readonly colorB: RgbColor;
}
export interface SingleCvdPairCheck {
  readonly type: ColorVisionDeficiencyType; readonly labelKo: string; readonly labelEn: string;
  readonly simulatedA: RgbColor; readonly simulatedAHex: string;
  readonly simulatedB: RgbColor; readonly simulatedBHex: string;
  readonly deltaE00: number; readonly deltaEOk: number; readonly luminanceDiff: number;
  readonly contrastRatio: number; readonly status: DiscriminabilityStatus;
}
export interface SafeAlternativeSuggestion {
  readonly originalBHex: string; readonly suggestedColorB: RgbColor; readonly suggestedHex: string;
  readonly suggestedOklch: OklchColor; readonly suggestedOklchCss: string;
  readonly beforeMinDeltaE00: number; readonly afterMinDeltaE00: number;
  readonly afterMinLuminanceDiff: number; readonly driftFromOriginalDeltaE00: number;
  readonly reasonKo: string; readonly reasonEn: string;
}
export interface ColorPairAccessibilityReport {
  readonly scope: "model-calculation"; readonly humanMeasured: false;
  readonly pairId: string; readonly colorAHex: string; readonly colorBHex: string;
  readonly normalDeltaE00: number; readonly normalDeltaEOk: number;
  readonly normalLuminanceDiff: number; readonly normalContrastRatio: number;
  readonly checks: readonly SingleCvdPairCheck[]; readonly worstDeficiency: ColorVisionDeficiencyType;
  readonly minDeltaE00: number; readonly minLuminanceDiff: number;
  readonly overallStatus: DiscriminabilityStatus; readonly suggestion: SafeAlternativeSuggestion | null;
}
export interface DualViewerPanelInput {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly panelFill: RgbColor; readonly borderColor: RgbColor; readonly borderWidthPx: number;
  readonly gutterEdgeColor: RgbColor; readonly outerHaloWidthPx: number; readonly hasTransparentOutside: boolean;
}
export interface SingleViewerSurfaceAudit {
  readonly mode: "dark" | "light"; readonly viewerBgHex: string;
  readonly borderVsBgContrast: number; readonly panelVsBgContrast: number;
  readonly borderVsPanelContrast: number; readonly borderDeltaE00: number;
  readonly borderVanishRisk: RiskSeverity; readonly haloBleedScore: number; readonly haloBleedRisk: RiskSeverity;
  readonly issuesKo: readonly string[]; readonly issuesEn: readonly string[];
}
export interface DualViewerRepairSuggestion {
  readonly recommendedBorderColor: RgbColor; readonly recommendedBorderHex: string;
  readonly recommendedBorderWidthPx: number; readonly recommendedGutterEdgeColor: RgbColor;
  readonly recommendedGutterEdgeHex: string; readonly recommendedOuterHaloWidthPx: number;
  readonly repairedScore: number; readonly guidanceKo: string; readonly guidanceEn: string;
}
export interface DualViewerReadabilityReport {
  readonly scope: "model-calculation"; readonly humanMeasured: false;
  readonly inputId: string; readonly panelFillHex: string; readonly borderHex: string; readonly gutterEdgeHex: string;
  readonly darkViewer: SingleViewerSurfaceAudit; readonly lightViewer: SingleViewerSurfaceAudit;
  readonly overallScore: number; readonly grade: DualViewerGrade;
  readonly repairSuggestion: DualViewerRepairSuggestion;
}

type Vec3 = readonly [number, number, number];
type Mat3 = readonly [Vec3, Vec3, Vec3];

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function normalizeHueDeg(h: number): number {
  if (!Number.isFinite(h)) return 0;
  const mod = h % 360;
  return mod < 0 ? mod + 360 : mod;
}

function mulMat3Vec3(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function invertMat3(m: Mat3): Mat3 {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const c00 = e * i - f * h, c01 = -(d * i - f * g), c02 = d * h - e * g;
  const c10 = -(b * i - c * h), c11 = a * i - c * g, c12 = -(a * h - b * g);
  const c20 = b * f - c * e, c21 = -(a * f - c * d), c22 = a * e - b * d;
  const det = a * c00 + b * c01 + c * c02;
  const inv = Math.abs(det) > 1e-18 ? 1 / det : 1;
  return [
    [c00 * inv, c10 * inv, c20 * inv],
    [c01 * inv, c11 * inv, c21 * inv],
    [c02 * inv, c12 * inv, c22 * inv],
  ];
}

// ============================================================================
// 1. sRGB · Linear RGB · CIE Lab(CIEDE2000) · OKLab / OKLCH
// ============================================================================

export function srgbChannelToLinear(c: number): number {
  finite([c]);
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function linearChannelToSrgb(c: number): number {
  finite([c]);
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

export function srgbToLinear(rgb: RgbColor): RgbColor {
  assertRgb(rgb);
  return { r: srgbChannelToLinear(rgb.r), g: srgbChannelToLinear(rgb.g), b: srgbChannelToLinear(rgb.b) };
}

export function linearToSrgb(lin: RgbColor): RgbColor {
  return { r: linearChannelToSrgb(lin.r), g: linearChannelToSrgb(lin.g), b: linearChannelToSrgb(lin.b) };
}

export function srgbToHex(rgb: RgbColor): string {
  assertRgb(rgb);
  const hexByte = (v: number): string => Math.round(clamp(v, 0, 1) * 255).toString(16).toUpperCase().padStart(2, "0");
  return `#${hexByte(rgb.r)}${hexByte(rgb.g)}${hexByte(rgb.b)}`;
}

export function parseHexToSrgb(hex: string): RgbColor {
  const cleaned = hex.trim().replace(/^#/u, "");
  if (/^[0-9a-fA-F]{6}$/u.test(cleaned)) {
    return {
      r: parseInt(cleaned.slice(0, 2), 16) / 255,
      g: parseInt(cleaned.slice(2, 4), 16) / 255,
      b: parseInt(cleaned.slice(4, 6), 16) / 255,
    };
  }
  if (/^[0-9a-fA-F]{3}$/u.test(cleaned)) {
    return {
      r: parseInt(cleaned[0]! + cleaned[0]!, 16) / 255,
      g: parseInt(cleaned[1]! + cleaned[1]!, 16) / 255,
      b: parseInt(cleaned[2]! + cleaned[2]!, 16) / 255,
    };
  }
  throw new RangeError("색 문자열은 3자리 또는 6자리 hex여야 합니다.");
}

export function computeRelativeLuminance(rgb: RgbColor): number {
  const lin = srgbToLinear(rgb);
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

export function computeWcagContrastRatio(a: RgbColor, b: RgbColor): number {
  const la = computeRelativeLuminance(a);
  const lb = computeRelativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function srgbToOklab(rgb: RgbColor): OklabColor {
  const { r, g, b } = srgbToLinear(rgb);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearSrgbRaw(lab: OklabColor): RgbColor {
  const l_ = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const m_ = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const s_ = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

function isInUnitGamut(lin: RgbColor, eps = 1e-6): boolean {
  return lin.r >= -eps && lin.r <= 1 + eps && lin.g >= -eps && lin.g <= 1 + eps && lin.b >= -eps && lin.b <= 1 + eps;
}

export function oklabToOklch(lab: OklabColor): OklchColor {
  const C = Math.hypot(lab.a, lab.b);
  return { L: lab.L, C, h: C < 1e-7 ? 0 : normalizeHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI) };
}

export function oklchToOklab(lch: OklchColor): OklabColor {
  const rad = (normalizeHueDeg(lch.h) * Math.PI) / 180;
  const c = Math.max(0, lch.C);
  return { L: clamp(lch.L, 0, 1), a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

export function srgbToOklch(rgb: RgbColor): OklchColor {
  return oklabToOklch(srgbToOklab(rgb));
}

/** OKLCH 색을 명도(L)·색상각(h)을 보존하며 sRGB 단위 게멋 내부로 이진 탐색 매핑한다. */
export function oklchToSrgb(lch: OklchColor): RgbColor {
  const L = clamp(lch.L, 0, 1), C = Math.max(0, lch.C), h = normalizeHueDeg(lch.h);
  const direct = oklabToLinearSrgbRaw(oklchToOklab({ L, C, h }));
  if (isInUnitGamut(direct)) return linearToSrgb(direct);
  let lo = 0, hi = C;
  for (let i = 0; i < 18; i += 1) {
    const mid = (lo + hi) * 0.5;
    if (isInUnitGamut(oklabToLinearSrgbRaw(oklchToOklab({ L, C: mid, h })))) lo = mid;
    else hi = mid;
  }
  return linearToSrgb(oklabToLinearSrgbRaw(oklchToOklab({ L, C: lo, h })));
}

export function formatOklchCss(lch: OklchColor): string {
  return `oklch(${clamp(lch.L, 0, 1).toFixed(4)} ${Math.max(0, lch.C).toFixed(4)} ${normalizeHueDeg(lch.h).toFixed(2)})`;
}

export function computeDeltaEOk(a: RgbColor, b: RgbColor): number {
  const la = srgbToOklab(a), lb = srgbToOklab(b);
  return Math.hypot(la.L - lb.L, la.a - lb.a, la.b - lb.b);
}

export function srgbToCieLab(rgb: RgbColor): LabColor {
  const lin = srgbToLinear(rgb);
  const x = (0.4124564 * lin.r + 0.3575761 * lin.g + 0.1804375 * lin.b) / 0.95047;
  const y = 0.2126729 * lin.r + 0.7151522 * lin.g + 0.072175 * lin.b;
  const z = (0.0193339 * lin.r + 0.119192 * lin.g + 0.9503041 * lin.b) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Sharma-Wu-Dalal (2005) 표준 CIEDE2000(ΔE00) 지각 색차 계산. */
export function computeCiede2000(rgb1: RgbColor, rgb2: RgbColor): number {
  const c1 = srgbToCieLab(rgb1), c2 = srgbToCieLab(rgb2);
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const Cbar = (Math.hypot(c1.a, c1.b) + Math.hypot(c2.a, c2.b)) * 0.5;
  const Cbar7 = Cbar ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * c1.a, a2p = (1 + G) * c2.a;
  const C1p = Math.hypot(a1p, c1.b), C2p = Math.hypot(a2p, c2.b);
  const h1p = C1p < 1e-10 ? 0 : normalizeHueDeg(Math.atan2(c1.b, a1p) * deg);
  const h2p = C2p < 1e-10 ? 0 : normalizeHueDeg(Math.atan2(c2.b, a2p) * deg);
  const dLp = c2.L - c1.L, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p > 1e-10) {
    const diff = h2p - h1p;
    dhp = Math.abs(diff) <= 180 ? diff : diff > 180 ? diff - 360 : diff + 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * 0.5 * rad);
  const Lbarp = (c1.L + c2.L) * 0.5, Cbarp = (C1p + C2p) * 0.5;
  let Hbarp = h1p + h2p;
  if (C1p * C2p > 1e-10) {
    Hbarp = Math.abs(h1p - h2p) <= 180 ? (h1p + h2p) * 0.5 : h1p + h2p < 360 ? (h1p + h2p + 360) * 0.5 : (h1p + h2p - 360) * 0.5;
  }
  const T = 1 - 0.17 * Math.cos((Hbarp - 30) * rad) + 0.24 * Math.cos(2 * Hbarp * rad) + 0.32 * Math.cos((3 * Hbarp + 6) * rad) - 0.2 * Math.cos((4 * Hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((Hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const RC = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const L50sq = (Lbarp - 50) ** 2;
  const SL = 1 + (0.015 * L50sq) / Math.sqrt(20 + L50sq);
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  const tL = dLp / SL, tC = dCp / SC, tH = dHp / SH;
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}

// ============================================================================
// 2. Viénot(1999) / Brettel(1997) 정밀 선형 LMS 4종 색각이상 시뮬레이터
// ============================================================================

/** D65 백색점 정규화(행 합 = 1.00000000) Smith-Pokorny / Viénot(1999) 선형 sRGB → LMS 행렬. */
const LINEAR_SRGB_TO_LMS: Mat3 = [
  [0.31399, 0.63951249, 0.04649751],
  [0.15537734, 0.75791849, 0.08670417],
  [0.01775659, 0.10946796, 0.87277545],
];
const LMS_TO_LINEAR_SRGB: Mat3 = invertMat3(LINEAR_SRGB_TO_LMS);

const BLUE_LMS = mulMat3Vec3(LINEAR_SRGB_TO_LMS, [0, 0, 1]);
const RED_LMS = mulMat3Vec3(LINEAR_SRGB_TO_LMS, [1, 0, 0]);
const CYAN_LMS = mulMat3Vec3(LINEAR_SRGB_TO_LMS, [0, 1, 1]);

// Viénot(1999) Protanopia/Deuteranopia 계수 + Brettel(1997) Tritanopia 이중 반평면 계수
const PROTAN_M = (BLUE_LMS[2] - BLUE_LMS[0]) / (BLUE_LMS[2] - BLUE_LMS[1]);
const PROTAN_S = 1 - PROTAN_M;
const DEUTAN_L = (BLUE_LMS[2] - BLUE_LMS[1]) / (BLUE_LMS[2] - BLUE_LMS[0]);
const DEUTAN_S = 1 - DEUTAN_L;
const TRITAN_P1_L = -(RED_LMS[2] - RED_LMS[1]) / (RED_LMS[1] - RED_LMS[0]);
const TRITAN_P1_M = -(RED_LMS[0] - RED_LMS[2]) / (RED_LMS[1] - RED_LMS[0]);
const TRITAN_P2_L = -(CYAN_LMS[2] - CYAN_LMS[1]) / (CYAN_LMS[1] - CYAN_LMS[0]);
const TRITAN_P2_M = -(CYAN_LMS[0] - CYAN_LMS[2]) / (CYAN_LMS[1] - CYAN_LMS[0]);

export const CVD_TYPE_METADATA: readonly {
  readonly id: ColorVisionDeficiencyType;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly coneNoteKo: string;
  readonly coneNoteEn: string;
  readonly modelTag: string;
}[] = [
  { id: "protanopia", labelKo: "적색맹 (Protanopia)", labelEn: "Protanopia (L-Cone)", coneNoteKo: "L-원추세포 결손 · 적색 밝기 급감 및 적-녹 혼동", coneNoteEn: "Missing L-cone · red darkening & red-green confusion", modelTag: "Viénot 1999 Linear LMS" },
  { id: "deuteranopia", labelKo: "녹색맹 (Deuteranopia)", labelEn: "Deuteranopia (M-Cone)", coneNoteKo: "M-원추세포 결손 · 적-녹-황토 축 변별력 저하", coneNoteEn: "Missing M-cone · red-green-ochre axis collapse", modelTag: "Viénot 1999 Linear LMS" },
  { id: "tritanopia", labelKo: "청황색맹 (Tritanopia)", labelEn: "Tritanopia (S-Cone)", coneNoteKo: "S-원추세포 결손 · 청-청록 및 황-분홍 혼동", coneNoteEn: "Missing S-cone · blue-teal & yellow-pink shift", modelTag: "Brettel 1997 Dual-Plane LMS" },
  { id: "achromatopsia", labelKo: "전색맹 (Achromatopsia)", labelEn: "Achromatopsia (Monochromacy)", coneNoteKo: "색상 정보 소실 · 순수 명도(휘도 Y) 대비로만 구분", coneNoteEn: "No hue perception · pure luminance contrast only", modelTag: "CIE Y Linear Luminance" },
];

export function linearSrgbToLms(lin: RgbColor): LmsColor {
  const [l, m, s] = mulMat3Vec3(LINEAR_SRGB_TO_LMS, [lin.r, lin.g, lin.b]);
  return { l, m, s };
}

export function lmsToLinearSrgb(lms: LmsColor): RgbColor {
  const [r, g, b] = mulMat3Vec3(LMS_TO_LINEAR_SRGB, [lms.l, lms.m, lms.s]);
  return { r, g, b };
}

/** Viénot(1999)/Brettel(1997) 정밀 선형 LMS 행렬로 4종 색각이상을 시뮬레이션한다. */
export function simulateColorVisionDeficiency(
  color: RgbColor,
  type: ColorVisionDeficiencyType,
  severity = 1,
): CvdSimulationResult {
  assertRgb(color);
  unit([severity]);
  choice(type, ["protanopia", "deuteranopia", "tritanopia", "achromatopsia"]);
  const sev = clamp(severity, 0, 1);
  const orig: RgbColor = { r: clamp(color.r, 0, 1), g: clamp(color.g, 0, 1), b: clamp(color.b, 0, 1) };
  const lin = srgbToLinear(orig);
  const lmsBefore = linearSrgbToLms(lin);

  let targetLin: RgbColor;
  let lmsAfter: LmsColor;

  if (type === "achromatopsia") {
    const lum = 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
    targetLin = { r: lin.r + (lum - lin.r) * sev, g: lin.g + (lum - lin.g) * sev, b: lin.b + (lum - lin.b) * sev };
    lmsAfter = linearSrgbToLms(targetLin);
  } else {
    let projL = lmsBefore.l, projM = lmsBefore.m, projS = lmsBefore.s;
    if (type === "protanopia") projL = PROTAN_M * lmsBefore.m + PROTAN_S * lmsBefore.s;
    else if (type === "deuteranopia") projM = DEUTAN_L * lmsBefore.l + DEUTAN_S * lmsBefore.s;
    else projS = lmsBefore.l >= lmsBefore.m ? TRITAN_P1_L * lmsBefore.l + TRITAN_P1_M * lmsBefore.m : TRITAN_P2_L * lmsBefore.l + TRITAN_P2_M * lmsBefore.m;

    lmsAfter = {
      l: lmsBefore.l + (projL - lmsBefore.l) * sev,
      m: lmsBefore.m + (projM - lmsBefore.m) * sev,
      s: lmsBefore.s + (projS - lmsBefore.s) * sev,
    };
    targetLin = lmsToLinearSrgb(lmsAfter);
  }

  const simulatedRgb = linearToSrgb(targetLin);
  const simulatedOklch = srgbToOklch(simulatedRgb);
  return {
    scope: "model-calculation", humanMeasured: false,
    type,
    severity: sev,
    originalRgb: orig,
    originalHex: srgbToHex(orig),
    simulatedRgb,
    simulatedHex: srgbToHex(simulatedRgb),
    simulatedOklch,
    simulatedOklchCss: formatOklchCss(simulatedOklch),
    lmsBefore,
    lmsAfter,
    deltaE00FromOriginal: computeCiede2000(orig, simulatedRgb),
  };
}

function classifySingleCvdStatus(type: ColorVisionDeficiencyType, deltaE00: number, luminanceDiff: number): DiscriminabilityStatus {
  if (type === "achromatopsia") {
    if (luminanceDiff < 0.1 && deltaE00 < 12) return "collision";
    if (luminanceDiff < 0.2 && deltaE00 < 20) return "caution";
    return "safe";
  }
  if (deltaE00 < 11 && luminanceDiff < 0.14) return "collision";
  if (deltaE00 < 18 || (deltaE00 < 24 && luminanceDiff < 0.12)) return "caution";
  return "safe";
}

function evaluatePairAcrossAllCvd(colorA: RgbColor, colorB: RgbColor, severity: number): readonly SingleCvdPairCheck[] {
  return CVD_TYPE_METADATA.map((meta) => {
    const simA = simulateColorVisionDeficiency(colorA, meta.id, severity);
    const simB = simulateColorVisionDeficiency(colorB, meta.id, severity);
    const deltaE00 = computeCiede2000(simA.simulatedRgb, simB.simulatedRgb);
    const luminanceDiff = Math.abs(computeRelativeLuminance(simA.simulatedRgb) - computeRelativeLuminance(simB.simulatedRgb));
    return {
      type: meta.id,
      labelKo: meta.labelKo,
      labelEn: meta.labelEn,
      simulatedA: simA.simulatedRgb,
      simulatedAHex: simA.simulatedHex,
      simulatedB: simB.simulatedRgb,
      simulatedBHex: simB.simulatedHex,
      deltaE00,
      deltaEOk: computeDeltaEOk(simA.simulatedRgb, simB.simulatedRgb),
      luminanceDiff,
      contrastRatio: computeWcagContrastRatio(simA.simulatedRgb, simB.simulatedRgb),
      status: classifySingleCvdStatus(meta.id, deltaE00, luminanceDiff),
    };
  });
}

/** OKLCH 후보를 제한된 모델 기준으로 탐색한다. 실제 사용자 구분 가능성을 보증하지 않는다. */
export function suggestSafeAlternativeColor(anchorA: RgbColor, targetB: RgbColor, severity = 1): SafeAlternativeSuggestion {
  const baseline = evaluatePairAcrossAllCvd(anchorA, targetB, severity);
  const beforeMinDeltaE00 = Math.min(...baseline.map((c) => c.deltaE00));
  const targetLch = srgbToOklch(targetB);
  const lightnessGrid = [targetLch.L, 0.86, 0.78, 0.68, 0.52, 0.36, 0.24];
  const hueCandidates = [
    targetLch.h, normalizeHueDeg(targetLch.h + 30), normalizeHueDeg(targetLch.h - 30),
    normalizeHueDeg(targetLch.h + 65), normalizeHueDeg(targetLch.h - 65),
    normalizeHueDeg(targetLch.h + 115), normalizeHueDeg(targetLch.h - 115),
    normalizeHueDeg(targetLch.h + 165), 248, 78, 210, 38, 305,
  ];
  const chromaGrid = [clamp(Math.max(targetLch.C, 0.12), 0.1, 0.22), 0.17];

  let bestSafe: { readonly rgb: RgbColor; readonly drift: number; readonly minDe: number; readonly minLum: number } | null = null;
  let bestFallback: { readonly rgb: RgbColor; readonly score: number; readonly drift: number; readonly minDe: number; readonly minLum: number } | null = null;

  for (const L of lightnessGrid) {
    for (const h of hueCandidates) {
      for (const C of chromaGrid) {
        const cand = oklchToSrgb({ L: clamp(L, 0.18, 0.92), C, h });
        const checks = evaluatePairAcrossAllCvd(anchorA, cand, severity);
        const minDe = Math.min(...checks.map((c) => c.deltaE00));
        const minLum = Math.min(...checks.map((c) => c.luminanceDiff));
        const drift = computeCiede2000(targetB, cand);
        if (checks.every((c) => c.status === "safe") && minDe >= 18 && minLum >= 0.16) {
          if (!bestSafe || drift < bestSafe.drift) bestSafe = { rgb: cand, drift, minDe, minLum };
        }
        const score = minDe + minLum * 90 - drift * 0.12;
        if (!bestFallback || score > bestFallback.score) bestFallback = { rgb: cand, score, drift, minDe, minLum };
      }
    }
  }

  const chosen = bestSafe ?? bestFallback ?? {
    rgb: oklchToSrgb({ L: targetLch.L > 0.55 ? 0.26 : 0.84, C: 0.14, h: 245 }),
    drift: 40, minDe: 25, minLum: 0.3,
  };
  const suggestedOklch = srgbToOklch(chosen.rgb);
  const suggestedHex = srgbToHex(chosen.rgb);
  return {
    originalBHex: srgbToHex(targetB), suggestedColorB: chosen.rgb, suggestedHex,
    suggestedOklch, suggestedOklchCss: formatOklchCss(suggestedOklch),
    beforeMinDeltaE00, afterMinDeltaE00: chosen.minDe, afterMinLuminanceDiff: chosen.minLum,
    driftFromOriginalDeltaE00: chosen.drift,
    reasonKo: `4종 색각이상 최저 ΔE00 ${beforeMinDeltaE00.toFixed(1)} → ${chosen.minDe.toFixed(1)}, 휘도차 ${(chosen.minLum * 100).toFixed(0)}%로 명도·청황 축을 동시 분리했습니다.`,
    reasonEn: `Raised worst-case ΔE00 from ${beforeMinDeltaE00.toFixed(1)} to ${chosen.minDe.toFixed(1)} with ${(chosen.minLum * 100).toFixed(0)}% luminance separation.`,
  };
}

export function evaluateColorPairAccessibility(pair: ColorPairAuditInput, severity = 1): ColorPairAccessibilityReport {
  const checks = evaluatePairAcrossAllCvd(pair.colorA, pair.colorB, severity);
  const worst = checks.reduce((acc, cur) => (cur.deltaE00 < acc.deltaE00 ? cur : acc), checks[0]!);
  const minDeltaE00 = Math.min(...checks.map((c) => c.deltaE00));
  const minLuminanceDiff = Math.min(...checks.map((c) => c.luminanceDiff));
  const overallStatus: DiscriminabilityStatus = checks.some((c) => c.status === "collision")
    ? "collision" : checks.some((c) => c.status === "caution") ? "caution" : "safe";

  return {
    scope: "model-calculation", humanMeasured: false,
    pairId: pair.id, colorAHex: srgbToHex(pair.colorA), colorBHex: srgbToHex(pair.colorB),
    normalDeltaE00: computeCiede2000(pair.colorA, pair.colorB),
    normalDeltaEOk: computeDeltaEOk(pair.colorA, pair.colorB),
    normalLuminanceDiff: Math.abs(computeRelativeLuminance(pair.colorA) - computeRelativeLuminance(pair.colorB)),
    normalContrastRatio: computeWcagContrastRatio(pair.colorA, pair.colorB),
    checks, worstDeficiency: worst.type, minDeltaE00, minLuminanceDiff, overallStatus,
    suggestion: overallStatus === "safe" ? null : suggestSafeAlternativeColor(pair.colorA, pair.colorB, severity),
  };
}

export { WEBTOON_CVD_AUDIT_PAIRS } from "./color-script-demo-presets";

// ============================================================================
// 3. OKLCH 4막(기·승·전·결) 감정 컬러 스크립트 아크 생성기
// ============================================================================

export const HARMONY_RULES: readonly {
  readonly id: HarmonyRuleId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly offsetsDeg: readonly number[];
  readonly noteKo: string;
  readonly noteEn: string;
}[] = [
  { id: "complementary", labelKo: "보색 (Complementary)", labelEn: "Complementary", offsetsDeg: [0, 180], noteKo: "정반대 180° 대비로 갈등·각성 클라이맥스 극대화", noteEn: "Opposite 180° contrast for dramatic climax" },
  { id: "split-complementary", labelKo: "분할보색 (Split-Comp)", labelEn: "Split-Complementary", offsetsDeg: [0, 150, 210], noteKo: "직접 보색 피로도를 낮추며 로맨스·드라마 긴장 균형 유지", noteEn: "Balanced ±30° split around complement" },
  { id: "analogous", labelKo: "유사색 (Analogous)", labelEn: "Analogous", offsetsDeg: [0, -30, 30], noteKo: "인접 30° 스펙트럼으로 일상·회상·서정적 몰입감 연출", noteEn: "Adjacent ±30° hues for cohesive mood" },
  { id: "triadic", labelKo: "삼원색 (Triadic)", labelEn: "Triadic", offsetsDeg: [0, 120, 240], noteKo: "120° 삼각 균형으로 판타지·액션 다인물 구도 분리", noteEn: "120° triad for multi-character clarity" },
];

export { EPISODE_EMOTION_ARC_PRESETS } from "./color-script-demo-presets";

const ACT_DEFINITIONS: readonly {
  readonly actId: EpisodeActId;
  readonly order: 1 | 2 | 3 | 4;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hueDriftDeg: number;
  readonly noteKo: string;
  readonly noteEn: string;
}[] = [
  { actId: "intro", order: 1, labelKo: "1막 · 기 (도입)", labelEn: "Act 1 · Intro", hueDriftDeg: 0, noteKo: "중·고명도 안정 배경으로 독자 시선을 공간에 안착시키고 주조색을 각인합니다.", noteEn: "Anchor world mood with calm lightness and restrained key chroma." },
  { actId: "development", order: 2, labelKo: "2막 · 승 (전개)", labelEn: "Act 2 · Development", hueDriftDeg: 12, noteKo: "배경 명도를 서서히 낮추고 보조 하모니 색상을 투입해 갈등의 전조를 쌓습니다.", noteEn: "Deepen backdrop value and weave secondary harmony cues as stakes rise." },
  { actId: "climax", order: 3, labelKo: "3막 · 전 (절정)", labelEn: "Act 3 · Climax", hueDriftDeg: 0, noteKo: "최대 채도와 최대 명암 폭으로 하모니 대비색을 터뜨려 스크롤 정지 컷을 만듭니다.", noteEn: "Peak chroma and luminance span drive full contrast on the payoff panel." },
  { actId: "resolution", order: 4, labelKo: "4막 · 결 (여운)", labelEn: "Act 4 · Resolution", hueDriftDeg: -10, noteKo: "채도를 거두고 명도를 회복해 다음 화 예고까지 잔상이 이어지는 여백을 남깁니다.", noteEn: "Release chroma tension and lift tone for emotional breath." },
];

function createSwatch(role: ColorSwatchSpec["role"], labelKo: string, labelEn: string, lch: OklchColor): ColorSwatchSpec {
  const rgb = oklchToSrgb(lch);
  const resolvedOklch = srgbToOklch(rgb);
  return { role, labelKo, labelEn, rgb, hex: srgbToHex(rgb), oklch: resolvedOklch, oklchCss: formatOklchCss(resolvedOklch), luminance: computeRelativeLuminance(rgb) };
}

/** OKLCH 4막(기·승·전·결) 감정 컬러 스크립트 아크를 생성한다. */
export function buildEpisodeColorScriptArc(input: EpisodeColorScriptInput): EpisodeColorScriptArc {
  assertArc(input);
  const baseHue = normalizeHueDeg(input.baseHueDeg);
  const ruleSpec = HARMONY_RULES.find((r) => r.id === input.harmonyRule) ?? HARMONY_RULES[0]!;
  const baseL = clamp(input.baseLightness ?? 0.62, 0.35, 0.78);
  const baseC = clamp(input.baseChroma ?? 0.14, 0.05, 0.24);
  const curve = input.tensionCurve ?? [0.22, 0.55, 0.96, 0.28];

  const primaryOffset = ruleSpec.offsetsDeg[0] ?? 0;
  const secondaryOffset = ruleSpec.offsetsDeg[1] ?? 180;
  const tertiaryOffset = ruleSpec.offsetsDeg[2] ?? secondaryOffset;

  const acts: EpisodeActScript[] = ACT_DEFINITIONS.map((def, idx) => {
    const t = clamp(curve[idx] ?? 0.5, 0, 1);
    const primaryHue = normalizeHueDeg(baseHue + primaryOffset + def.hueDriftDeg);
    const secondaryHue = normalizeHueDeg(baseHue + secondaryOffset);
    const tertiaryHue = normalizeHueDeg(baseHue + tertiaryOffset);

    // 긴장도가 높을수록 배경은 깊어지고, 주조·강조 채도는 sRGB 최대 채도 대역(L≈0.62~0.68)에서 뚜렷하게 상승한다.
    const backdropL = clamp(0.88 - 0.6 * t, 0.18, 0.9);
    const backdropC = clamp(baseC * (0.24 + 0.24 * t), 0.02, 0.09);
    const envL = clamp(0.76 - 0.38 * t, 0.3, 0.8);
    const envC = clamp(baseC * (0.4 + 0.45 * t), 0.04, 0.15);
    const keyL = clamp(baseL + (t >= 0.7 ? 0.04 : -0.04 * t), 0.44, 0.76);
    const keyC = clamp(baseC * (0.46 + 0.9 * t), 0.05, 0.24);
    const accentL = backdropL < 0.48 ? clamp(0.64 + 0.06 * t, 0.6, 0.72) : clamp(0.54 - 0.06 * t, 0.44, 0.58);
    const accentC = clamp(baseC * (0.5 + 1.15 * t), 0.06, 0.27);
    const shadowL = clamp(0.24 - 0.07 * t, 0.14, 0.26);
    const shadowC = clamp(baseC * 0.3, 0.02, 0.07);

    const swatches: readonly ColorSwatchSpec[] = [
      createSwatch("backdrop", "배경 톤", "Backdrop", { L: backdropL, C: backdropC, h: primaryHue }),
      createSwatch("environment", "공간 중경", "Environment", { L: envL, C: envC, h: idx === 2 ? tertiaryHue : normalizeHueDeg(primaryHue + 14) }),
      createSwatch("keyLight", "감정 주조", "Key Mood", { L: keyL, C: keyC, h: primaryHue }),
      createSwatch("accent", "하모니 강조", "Harmony Accent", { L: accentL, C: accentC, h: idx === 1 && ruleSpec.offsetsDeg.length > 2 ? tertiaryHue : secondaryHue }),
      createSwatch("shadowInk", "암부 라인", "Shadow Ink", { L: shadowL, C: shadowC, h: normalizeHueDeg(primaryHue + 18) }),
    ];

    const lums = swatches.map((s) => s.luminance);
    return {
      actId: def.actId, order: def.order, labelKo: def.labelKo, labelEn: def.labelEn, tension: t,
      harmonyAnglesDeg: ruleSpec.offsetsDeg.map((off) => normalizeHueDeg(baseHue + off)),
      swatches,
      averageLightness: swatches.reduce((sum, s) => sum + s.oklch.L, 0) / swatches.length,
      peakChroma: Math.max(...swatches.map((s) => s.oklch.C)),
      luminanceSpan: Math.max(...lums) - Math.min(...lums),
      directorNoteKo: def.noteKo, directorNoteEn: def.noteEn,
    };
  });

  const climaxAct = acts.reduce((best, cur) => (cur.tension > best.tension ? cur : best), acts[0]!);
  const chromas = acts.map((a) => a.peakChroma);
  const avgLights = acts.map((a) => a.averageLightness);
  const climaxKey = climaxAct.swatches.find((s) => s.role === "keyLight")!;
  const climaxAccent = climaxAct.swatches.find((s) => s.role === "accent")!;

  return {
    baseHueDeg: baseHue, harmonyRule: ruleSpec.id, harmonyOffsetsDeg: ruleSpec.offsetsDeg,
    acts, climaxActId: climaxAct.actId,
    chromaDynamicRange: Math.max(...chromas) - Math.min(...chromas),
    lightnessDynamicRange: Math.max(...avgLights) - Math.min(...avgLights),
    climaxContrastAudit: evaluateColorPairAccessibility({
      id: `climax-${climaxAct.actId}`, labelKo: "3막 주조색 vs 하모니 강조색", labelEn: "Climax Key Mood vs Harmony Accent",
      roleAKo: "감정 주조", roleAEn: "Key Mood", roleBKo: "하모니 강조", roleBEn: "Harmony Accent",
      colorA: climaxKey.rgb, colorB: climaxAccent.rgb,
    }),
  };
}

// ============================================================================
// 4. 모바일 다크모드(#0B0D12) vs 라이트모드(#FFFFFF) 양면 뷰어 경계·할로 감사기
// ============================================================================

export const MOBILE_DARK_VIEWER_BG_RGB: RgbColor = { r: 11 / 255, g: 13 / 255, b: 18 / 255 };
export const MOBILE_LIGHT_VIEWER_BG_RGB: RgbColor = { r: 1, g: 1, b: 1 };
export const MOBILE_DARK_VIEWER_BG_HEX: string = srgbToHex(MOBILE_DARK_VIEWER_BG_RGB);
export const MOBILE_LIGHT_VIEWER_BG_HEX: string = srgbToHex(MOBILE_LIGHT_VIEWER_BG_RGB);

export { DUAL_VIEWER_PANEL_PRESETS } from "./color-script-demo-presets";

function auditSingleViewerSurface(input: DualViewerPanelInput, mode: "dark" | "light"): SingleViewerSurfaceAudit {
  const viewerBg = mode === "dark" ? MOBILE_DARK_VIEWER_BG_RGB : MOBILE_LIGHT_VIEWER_BG_RGB;
  const viewerBgHex = mode === "dark" ? MOBILE_DARK_VIEWER_BG_HEX : MOBILE_LIGHT_VIEWER_BG_HEX;
  const borderVsBgContrast = computeWcagContrastRatio(input.borderColor, viewerBg);
  const panelVsBgContrast = computeWcagContrastRatio(input.panelFill, viewerBg);
  const borderVsPanelContrast = computeWcagContrastRatio(input.borderColor, input.panelFill);
  const borderDeltaE00 = computeCiede2000(input.borderColor, viewerBg);
  const issuesKo: string[] = [];
  const issuesEn: string[] = [];

  let borderVanishRisk: RiskSeverity = "safe";
  if (input.borderWidthPx <= 0.1) {
    if (panelVsBgContrast < 1.35) {
      borderVanishRisk = "critical";
      issuesKo.push(`${mode === "dark" ? "다크모드(#0B0D12)" : "라이트모드(#FFFFFF)"}에서 무테두리 컷 대비가 ${panelVsBgContrast.toFixed(2)}:1로 컷 경계가 사라집니다.`);
      issuesEn.push(`Borderless cut blends into ${mode} viewer (${panelVsBgContrast.toFixed(2)}:1).`);
    } else if (panelVsBgContrast < 1.8) {
      borderVanishRisk = "warning";
      issuesKo.push(`무테두리 컷 외곽 대비(${panelVsBgContrast.toFixed(2)}:1)가 낮아 여백 경계가 흐려집니다.`);
      issuesEn.push(`Low borderless contrast (${panelVsBgContrast.toFixed(2)}:1).`);
    }
  } else if (borderVsBgContrast < 1.35 && (panelVsBgContrast < 1.65 || borderDeltaE00 < 12)) {
    borderVanishRisk = "critical";
    issuesKo.push(`${mode === "dark" ? "다크모드(#0B0D12)" : "라이트모드(#FFFFFF)"} 테두리 대비가 ${borderVsBgContrast.toFixed(2)}:1(ΔE00 ${borderDeltaE00.toFixed(1)})에 불과해 테두리가 소실됩니다.`);
    issuesEn.push(`Cut border vanishes on ${mode} viewer (${borderVsBgContrast.toFixed(2)}:1, ΔE00 ${borderDeltaE00.toFixed(1)}).`);
  } else if (borderVsBgContrast < 1.75 || borderVsPanelContrast < 1.35) {
    borderVanishRisk = "warning";
    issuesKo.push(`${mode === "dark" ? "다크" : "라이트"} 뷰어 테두리 시인성(배경 ${borderVsBgContrast.toFixed(2)}:1 · 내부 ${borderVsPanelContrast.toFixed(2)}:1)이 약합니다.`);
    issuesEn.push(`Weak border legibility on ${mode} viewer (bg ${borderVsBgContrast.toFixed(2)}:1).`);
  }

  const gutterLum = computeRelativeLuminance(input.gutterEdgeColor);
  const fillLum = computeRelativeLuminance(input.panelFill);
  const gutterVsBgContrast = computeWcagContrastRatio(input.gutterEdgeColor, viewerBg);
  let haloBleedScore = 0;

  if (mode === "dark") {
    const matteFactor = input.hasTransparentOutside ? 0.55 : 1;
    const widthFactor = clamp(input.outerHaloWidthPx / 2.5, 0, 1.35);
    if (input.outerHaloWidthPx > 0.25 && gutterLum > 0.55 && gutterVsBgContrast > 4.5) {
      const lumJump = Math.max(0.25, gutterLum - Math.min(fillLum, 0.55));
      haloBleedScore = clamp(Math.round((gutterVsBgContrast / 18) * 58 * widthFactor * matteFactor + lumJump * 38), 0, 100);
    } else if (!input.hasTransparentOutside && gutterLum > 0.85 && fillLum < 0.35) {
      haloBleedScore = 48;
    }
  } else if (input.outerHaloWidthPx > 0.25 && gutterLum < 0.28 && gutterVsBgContrast > 5 && fillLum > 0.55) {
    haloBleedScore = clamp(Math.round((gutterVsBgContrast / 18) * 55 * clamp(input.outerHaloWidthPx / 2.5, 0, 1.3) + 20), 0, 100);
  }

  let haloBleedRisk: RiskSeverity = "safe";
  if (haloBleedScore >= 60) {
    haloBleedRisk = "critical";
    issuesKo.push(mode === "dark"
      ? `다크모드 흰 여백 할로 위험(${haloBleedScore}/100): 흰 매트 잔여 픽셀(${input.outerHaloWidthPx.toFixed(1)}px)이 #0B0D12 위에서 번져 보입니다.`
      : `라이트모드 외곽 암부 띠 위험(${haloBleedScore}/100): 어두운 잔여 픽셀이 #FFFFFF 여백을 오염시킵니다.`);
    issuesEn.push(mode === "dark" ? `Critical white halo bleed (${haloBleedScore}/100) on #0B0D12.` : `Critical dark outer smudge (${haloBleedScore}/100) on #FFFFFF.`);
  } else if (haloBleedScore >= 28) {
    haloBleedRisk = "warning";
    issuesKo.push(`외곽 할로 주의(${haloBleedScore}/100): 프리멀티플라이 알파 매트 정리를 권장합니다.`);
    issuesEn.push(`Moderate outer halo risk (${haloBleedScore}/100) on ${mode} viewer.`);
  }

  return { mode, viewerBgHex, borderVsBgContrast, panelVsBgContrast, borderVsPanelContrast, borderDeltaE00, borderVanishRisk, haloBleedScore, haloBleedRisk, issuesKo, issuesEn };
}

function computeDualViewerScore(dark: SingleViewerSurfaceAudit, light: SingleViewerSurfaceAudit): number {
  const pen = (r: RiskSeverity, crit: number, warn: number): number => (r === "critical" ? crit : r === "warning" ? warn : 0);
  return clamp(Math.round(100 - pen(dark.borderVanishRisk, 32, 14) - pen(light.borderVanishRisk, 32, 14) - pen(dark.haloBleedRisk, 30, 14) - pen(light.haloBleedRisk, 22, 10)), 0, 100);
}

/** 모바일 다크모드(#0B0D12)와 라이트모드(#FFFFFF) 양면에서 컷 테두리 소실·할로 위험을 검사한다. */
export function auditDualViewerReadability(input: DualViewerPanelInput): DualViewerReadabilityReport {
  assertDualViewer(input);
  const darkViewer = auditSingleViewerSurface(input, "dark");
  const lightViewer = auditSingleViewerSurface(input, "light");
  const overallScore = computeDualViewerScore(darkViewer, lightViewer);
  const hasCritical = [darkViewer.borderVanishRisk, lightViewer.borderVanishRisk, darkViewer.haloBleedRisk, lightViewer.haloBleedRisk].includes("critical");
  const grade: DualViewerGrade = hasCritical || overallScore < 65 ? "fail" : overallScore < 88 ? "caution" : "pass";

  const fillLch = srgbToOklch(input.panelFill);
  const recommendedBorderColor = oklchToSrgb({ L: fillLch.L < 0.45 ? 0.62 : 0.56, C: clamp(fillLch.C * 0.25, 0.015, 0.045), h: fillLch.h });
  const recommendedBorderWidthPx = Math.max(2, clamp(input.borderWidthPx, 2, 4));
  const repairedInput: DualViewerPanelInput = {
    ...input,
    borderColor: recommendedBorderColor,
    borderWidthPx: recommendedBorderWidthPx,
    gutterEdgeColor: recommendedBorderColor,
    outerHaloWidthPx: 0,
    hasTransparentOutside: true,
  };
  const repairedScore = computeDualViewerScore(auditSingleViewerSurface(repairedInput, "dark"), auditSingleViewerSurface(repairedInput, "light"));
  const recommendedBorderHex = srgbToHex(recommendedBorderColor);

  return {
    scope: "model-calculation", humanMeasured: false,
    inputId: input.id,
    panelFillHex: srgbToHex(input.panelFill),
    borderHex: srgbToHex(input.borderColor),
    gutterEdgeHex: srgbToHex(input.gutterEdgeColor),
    darkViewer,
    lightViewer,
    overallScore,
    grade,
    repairSuggestion: {
      recommendedBorderColor, recommendedBorderHex, recommendedBorderWidthPx,
      recommendedGutterEdgeColor: recommendedBorderColor, recommendedGutterEdgeHex: recommendedBorderHex,
      recommendedOuterHaloWidthPx: 0, repairedScore,
      guidanceKo: `중명도 경계(${recommendedBorderHex}, ${recommendedBorderWidthPx.toFixed(1)}px)와 투명 외곽 매트(할로 0px) 적용 시 양면 점수가 ${overallScore}점 → ${repairedScore}점으로 회복됩니다.`,
      guidanceEn: `Switch to mid-tone border (${recommendedBorderHex}, ${recommendedBorderWidthPx.toFixed(1)}px) with transparent matte (0px halo) to lift score from ${overallScore} to ${repairedScore}.`,
    },
  };
}
