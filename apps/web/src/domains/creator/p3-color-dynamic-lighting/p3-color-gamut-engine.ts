/**
 * Wave 40B — Display-P3 광색역 컬러 매니지먼트 · CMYK 소프트프루핑 · 말풍선 WCAG/APCA 대비율 엔진.
 *
 * - IEC 61966-2-1 sRGB, SMPTE EG 432-1 Display-P3(D65), CIE 1931 XYZ(D65), OKLab/OKLCH 정밀 가역 변환(< 1e-4).
 * - Display-P3 → sRGB 색상(Hue) 보존 Soft-Knee 채도 압축(`softMapP3ToSrgb`).
 * - FOGRA39 / JapanColor2001 인쇄용 CMYK 소프트프루핑 + 총잉크량(TAC) 경고 + 말풍선 WCAG 2.1/APCA 대비율 검사기.
 */

export interface RgbTuple { readonly r: number; readonly g: number; readonly b: number; }
export interface XyzTuple { readonly x: number; readonly y: number; readonly z: number; }
export interface OklabColor { readonly L: number; readonly a: number; readonly b: number; }
export interface OklchColor { readonly L: number; readonly C: number; readonly h: number; }
export interface CmykColor { readonly c: number; readonly m: number; readonly y: number; readonly k: number; }

export type GamutSpaceId = "srgb" | "display-p3";
export type PrintProfileId = "FOGRA39" | "JapanColor2001";
export type TacAlertLevel = "safe" | "warning" | "exceeded";
export type ApcaBalloonGrade = "excellent-body" | "pass-balloon" | "large-sfx-only" | "fail";

type Mat3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];
type Vec3 = readonly [number, number, number];

export interface SoftMapP3Options {
  /** 채도 압축이 시작되는 sRGB 경계 대비 비율 (기본 0.80, 범위 0.50~0.98). */
  readonly kneeRatio?: number;
}

export interface SoftMapP3Result {
  readonly inputP3: RgbTuple;
  readonly rawSrgb: RgbTuple;
  readonly mappedSrgb: RgbTuple;
  readonly inSrgbGamut: boolean;
  readonly chromaCompressed: boolean;
  readonly gamutOverflow: number;
  readonly originalOklch: OklchColor;
  readonly mappedOklch: OklchColor;
  readonly boundaryChroma: number;
  readonly hueShiftDeg: number;
  readonly chromaCompressionRatio: number;
  readonly deltaEok: number;
  readonly p3Css: string;
  readonly mappedSrgbOklchCss: string;
}

export interface PrintProfileSpec {
  readonly id: PrintProfileId;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly standardCode: string;
  readonly tacWarnPercent: number;
  readonly tacLimitPercent: number;
  readonly defaultGcr: number;
  readonly blackMax: number;
  readonly dotGain: number;
  readonly paperWhiteSrgb: RgbTuple;
  readonly cyanPurityBias: number;
  readonly magentaWarmthBias: number;
  readonly inkDensityGain: number;
}

export interface SoftProofOptions {
  readonly gcrStrength?: number;
  readonly richBlackBoost?: number;
}

export interface TacEvaluation {
  readonly profileId: PrintProfileId;
  readonly totalInkPercent: number;
  readonly warnPercent: number;
  readonly limitPercent: number;
  readonly level: TacAlertLevel;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface CmykSoftProofResult {
  readonly profile: PrintProfileSpec;
  readonly inputSpace: GamutSpaceId;
  readonly inputColor: RgbTuple;
  readonly cmyk: CmykColor;
  readonly cmykPercent: CmykColor;
  readonly tac: TacEvaluation;
  readonly proofedSrgb: RgbTuple;
  readonly proofedOklch: OklchColor;
  readonly proofedOklchCss: string;
  readonly referenceOklchCss: string;
  readonly deltaEPrint: number;
  readonly gamutShiftedForPrint: boolean;
}

export interface BalloonContrastResult {
  readonly foregroundSpace: GamutSpaceId;
  readonly backgroundSpace: GamutSpaceId;
  readonly foregroundLuminance: number;
  readonly backgroundLuminance: number;
  readonly wcagRatio: number;
  readonly wcagAALarge: boolean;
  readonly wcagAANormal: boolean;
  readonly wcagAAA: boolean;
  readonly apcaLc: number;
  readonly apcaAbsLc: number;
  readonly polarity: "dark-on-light" | "light-on-dark";
  readonly balloonGrade: ApcaBalloonGrade;
  readonly foregroundOklchCss: string;
  readonly backgroundOklchCss: string;
  readonly guidanceKo: string;
  readonly guidanceEn: string;
}

export interface DemoWideGamutSwatch {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly p3: RgbTuple;
  readonly noteKo: string;
  readonly noteEn: string;
}

export interface DemoBalloonContrastPreset {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly sampleLineKo: string;
  readonly sampleLineEn: string;
  readonly foregroundP3: RgbTuple;
  readonly backgroundP3: RgbTuple;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
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
  const c00 = e * i - f * h;
  const c01 = -(d * i - f * g);
  const c02 = d * h - e * g;
  const c10 = -(b * i - c * h);
  const c11 = a * i - c * g;
  const c12 = -(a * h - b * g);
  const c20 = b * f - c * e;
  const c21 = -(a * f - c * d);
  const c22 = a * e - b * d;
  const det = a * c00 + b * c01 + c * c02;
  const inv = Math.abs(det) > 1e-18 ? 1 / det : 1;
  return [
    [c00 * inv, c10 * inv, c20 * inv],
    [c01 * inv, c11 * inv, c21 * inv],
    [c02 * inv, c12 * inv, c22 * inv],
  ];
}

function buildRgbToXyzMatrix(
  rx: number, ry: number, gx: number, gy: number, bx: number, by: number, wx: number, wy: number,
): Mat3 {
  const ch: Mat3 = [
    [rx / ry, gx / gy, bx / by],
    [1, 1, 1],
    [(1 - rx - ry) / ry, (1 - gx - gy) / gy, (1 - bx - by) / by],
  ];
  const s = mulMat3Vec3(invertMat3(ch), [wx / wy, 1, (1 - wx - wy) / wy]);
  return [
    [ch[0][0] * s[0], ch[0][1] * s[1], ch[0][2] * s[2]],
    [ch[1][0] * s[0], ch[1][1] * s[1], ch[1][2] * s[2]],
    [ch[2][0] * s[0], ch[2][1] * s[1], ch[2][2] * s[2]],
  ];
}

// D65 표준 백색점 (IEC 61966-2-1 / SMPTE EG 432-1 / CSS Color 4)
const D65_WX = 0.3127;
const D65_WY = 0.329;
export const D65_WHITE_XYZ: XyzTuple = {
  x: D65_WX / D65_WY,
  y: 1,
  z: (1 - D65_WX - D65_WY) / D65_WY,
};

const LINEAR_SRGB_TO_XYZ = buildRgbToXyzMatrix(0.64, 0.33, 0.3, 0.6, 0.15, 0.06, D65_WX, D65_WY);
const XYZ_TO_LINEAR_SRGB = invertMat3(LINEAR_SRGB_TO_XYZ);

const LINEAR_P3_TO_XYZ = buildRgbToXyzMatrix(0.68, 0.32, 0.265, 0.69, 0.15, 0.06, D65_WX, D65_WY);
const XYZ_TO_LINEAR_P3 = invertMat3(LINEAR_P3_TO_XYZ);

// Björn Ottosson OKLab M1(D65 백색 정규화) · M2 및 정확 역행렬
const RAW_OKLAB_M1: Mat3 = [
  [0.8189330101, 0.3618667424, -0.1288597137],
  [0.0329845436, 0.9293118715, 0.0361456387],
  [0.0482003018, 0.2643662691, 0.633851707],
];
const WHITE_LMS = mulMat3Vec3(RAW_OKLAB_M1, [D65_WHITE_XYZ.x, D65_WHITE_XYZ.y, D65_WHITE_XYZ.z]);
const XYZ_TO_OKLAB_LMS: Mat3 = [
  [RAW_OKLAB_M1[0][0] / WHITE_LMS[0], RAW_OKLAB_M1[0][1] / WHITE_LMS[0], RAW_OKLAB_M1[0][2] / WHITE_LMS[0]],
  [RAW_OKLAB_M1[1][0] / WHITE_LMS[1], RAW_OKLAB_M1[1][1] / WHITE_LMS[1], RAW_OKLAB_M1[1][2] / WHITE_LMS[1]],
  [RAW_OKLAB_M1[2][0] / WHITE_LMS[2], RAW_OKLAB_M1[2][1] / WHITE_LMS[2], RAW_OKLAB_M1[2][2] / WHITE_LMS[2]],
];
const OKLAB_LMS_TO_XYZ = invertMat3(XYZ_TO_OKLAB_LMS);

const OKLAB_LMS_PRIME_TO_LAB: Mat3 = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const OKLAB_LAB_TO_LMS_PRIME = invertMat3(OKLAB_LMS_PRIME_TO_LAB);

/** IEC 61966-2-1 부호 보존 EOTF (sRGB / Display-P3 공용). */
export function srgbChannelToLinear(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return abs <= 0.04045 ? sign * (abs / 12.92) : sign * Math.pow((abs + 0.055) / 1.055, 2.4);
}

/** IEC 61966-2-1 부호 보존 OETF (선형 → sRGB / Display-P3). */
export function linearChannelToSrgb(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return abs <= 0.0031308 ? sign * (12.92 * abs) : sign * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
}

export function srgbToLinear(c: RgbTuple): RgbTuple {
  return { r: srgbChannelToLinear(c.r), g: srgbChannelToLinear(c.g), b: srgbChannelToLinear(c.b) };
}

export function linearToSrgb(c: RgbTuple): RgbTuple {
  return { r: linearChannelToSrgb(c.r), g: linearChannelToSrgb(c.g), b: linearChannelToSrgb(c.b) };
}

export function srgbToXyzD65(c: RgbTuple): XyzTuple {
  const lin = srgbToLinear(c);
  const [x, y, z] = mulMat3Vec3(LINEAR_SRGB_TO_XYZ, [lin.r, lin.g, lin.b]);
  return { x, y, z };
}

export function xyzD65ToSrgb(xyz: XyzTuple): RgbTuple {
  const [r, g, b] = mulMat3Vec3(XYZ_TO_LINEAR_SRGB, [xyz.x, xyz.y, xyz.z]);
  return linearToSrgb({ r, g, b });
}

export function displayP3ToXyzD65(c: RgbTuple): XyzTuple {
  const lin = srgbToLinear(c);
  const [x, y, z] = mulMat3Vec3(LINEAR_P3_TO_XYZ, [lin.r, lin.g, lin.b]);
  return { x, y, z };
}

export function xyzD65ToDisplayP3(xyz: XyzTuple): RgbTuple {
  const [r, g, b] = mulMat3Vec3(XYZ_TO_LINEAR_P3, [xyz.x, xyz.y, xyz.z]);
  return linearToSrgb({ r, g, b });
}

export function srgbToDisplayP3(c: RgbTuple): RgbTuple {
  return xyzD65ToDisplayP3(srgbToXyzD65(c));
}

export function displayP3ToSrgbRaw(c: RgbTuple): RgbTuple {
  return xyzD65ToSrgb(displayP3ToXyzD65(c));
}

export function xyzD65ToOklab(xyz: XyzTuple): OklabColor {
  const [l, m, s] = mulMat3Vec3(XYZ_TO_OKLAB_LMS, [xyz.x, xyz.y, xyz.z]);
  const [L, a, b] = mulMat3Vec3(OKLAB_LMS_PRIME_TO_LAB, [Math.cbrt(l), Math.cbrt(m), Math.cbrt(s)]);
  return { L, a, b };
}

export function oklabToXyzD65(lab: OklabColor): XyzTuple {
  const [lp, mp, sp] = mulMat3Vec3(OKLAB_LAB_TO_LMS_PRIME, [lab.L, lab.a, lab.b]);
  const [x, y, z] = mulMat3Vec3(OKLAB_LMS_TO_XYZ, [lp * lp * lp, mp * mp * mp, sp * sp * sp]);
  return { x, y, z };
}

export function oklabToOklch(lab: OklabColor): OklchColor {
  const C = Math.hypot(lab.a, lab.b);
  const h = C < 1e-8 ? 0 : ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { L: lab.L, C, h };
}

export function oklchToOklab(lch: OklchColor): OklabColor {
  const rad = (lch.h * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(rad), b: lch.C * Math.sin(rad) };
}

export function srgbToOklch(c: RgbTuple): OklchColor {
  return oklabToOklch(xyzD65ToOklab(srgbToXyzD65(c)));
}

export function oklchToSrgb(lch: OklchColor): RgbTuple {
  return xyzD65ToSrgb(oklabToXyzD65(oklchToOklab(lch)));
}

export function displayP3ToOklch(c: RgbTuple): OklchColor {
  return oklabToOklch(xyzD65ToOklab(displayP3ToXyzD65(c)));
}

export function oklchToDisplayP3(lch: OklchColor): RgbTuple {
  return xyzD65ToDisplayP3(oklabToXyzD65(oklchToOklab(lch)));
}

export function formatOklchCss(lch: OklchColor): string {
  const L = clamp(lch.L, 0, 1).toFixed(4);
  const C = Math.max(0, lch.C).toFixed(4);
  const h = (((lch.h % 360) + 360) % 360).toFixed(2);
  return `oklch(${L} ${C} ${h})`;
}

export function formatDisplayP3Css(p3: RgbTuple): string {
  return `color(display-p3 ${clamp(p3.r, 0, 1).toFixed(4)} ${clamp(p3.g, 0, 1).toFixed(4)} ${clamp(p3.b, 0, 1).toFixed(4)})`;
}

export function isInsideUnitGamut(c: RgbTuple, tolerance = 1e-5): boolean {
  return (
    c.r >= -tolerance && c.r <= 1 + tolerance &&
    c.g >= -tolerance && c.g <= 1 + tolerance &&
    c.b >= -tolerance && c.b <= 1 + tolerance
  );
}

function clampUnitRgb(c: RgbTuple): RgbTuple {
  return { r: clamp(c.r, 0, 1), g: clamp(c.g, 0, 1), b: clamp(c.b, 0, 1) };
}

function angularDiffDeg(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180);
}

/** 주어진 OKLCH (L, h)에서 sRGB 단위 게멋의 최대 허용 채도 C_max를 이분 탐색으로 정밀 계산한다. */
export function findSrgbBoundaryChroma(L: number, h: number): number {
  const clampedL = clamp(L, 0, 1);
  if (clampedL <= 1e-6 || clampedL >= 1 - 1e-6) return 0;
  let lo = 0;
  let hi = 0.45;
  for (let step = 0; step < 28; step += 1) {
    const mid = (lo + hi) * 0.5;
    if (isInsideUnitGamut(oklchToSrgb({ L: clampedL, C: mid, h }), 0)) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** Display-P3 광색역 색상을 sRGB 출력 시 색상(Hue) 틀어짐 없이 채도(Chroma)만 부드럽게 압축한다. */
export function softMapP3ToSrgb(inputP3: RgbTuple, options?: SoftMapP3Options): SoftMapP3Result {
  const sanitizedP3 = clampUnitRgb(inputP3);
  const kneeRatio = clamp(options?.kneeRatio ?? 0.8, 0.5, 0.98);
  const xyz = displayP3ToXyzD65(sanitizedP3);
  const rawSrgb = xyzD65ToSrgb(xyz);
  const originalLab = xyzD65ToOklab(xyz);
  const originalOklch = oklabToOklch(originalLab);

  const overflow = Math.max(0, -rawSrgb.r, rawSrgb.r - 1, -rawSrgb.g, rawSrgb.g - 1, -rawSrgb.b, rawSrgb.b - 1);
  const inSrgbGamut = overflow <= 1e-5;
  const boundaryChroma = findSrgbBoundaryChroma(originalOklch.L, originalOklch.h);
  const knee = boundaryChroma * kneeRatio;

  let mappedSrgb: RgbTuple;
  let chromaCompressed = false;

  if (originalOklch.C <= knee && inSrgbGamut) {
    mappedSrgb = clampUnitRgb(rawSrgb);
  } else if (boundaryChroma <= 1e-6) {
    const gray = linearChannelToSrgb(clamp(oklabToXyzD65({ L: originalOklch.L, a: 0, b: 0 }).y, 0, 1));
    mappedSrgb = { r: gray, g: gray, b: gray };
    chromaCompressed = originalOklch.C > 1e-6;
  } else {
    const span = Math.max(1e-7, boundaryChroma - knee);
    const excess = Math.max(0, originalOklch.C - knee) / span;
    const mappedC = Math.min(boundaryChroma * 0.9995, knee + span * Math.tanh(excess));
    mappedSrgb = clampUnitRgb(oklchToSrgb({ L: originalOklch.L, C: mappedC, h: originalOklch.h }));
    chromaCompressed = true;
  }

  const mappedLab = xyzD65ToOklab(srgbToXyzD65(mappedSrgb));
  const mappedOklch = oklabToOklch(mappedLab);
  const hueShiftDeg =
    originalOklch.C < 1e-4 || mappedOklch.C < 1e-4 ? 0 : angularDiffDeg(originalOklch.h, mappedOklch.h);

  return {
    inputP3: sanitizedP3,
    rawSrgb,
    mappedSrgb,
    inSrgbGamut,
    chromaCompressed,
    gamutOverflow: overflow,
    originalOklch,
    mappedOklch,
    boundaryChroma,
    hueShiftDeg,
    chromaCompressionRatio: originalOklch.C > 1e-6 ? mappedOklch.C / originalOklch.C : 1,
    deltaEok: Math.hypot(originalLab.L - mappedLab.L, originalLab.a - mappedLab.a, originalLab.b - mappedLab.b),
    p3Css: formatDisplayP3Css(sanitizedP3),
    mappedSrgbOklchCss: formatOklchCss(mappedOklch),
  };
}

/** 유럽/한국·일본 단행본 인쇄 표준 CMYK 소프트프루핑 프로파일 명세. */
export const PRINT_PROFILES: Readonly<Record<PrintProfileId, PrintProfileSpec>> = {
  FOGRA39: {
    id: "FOGRA39",
    nameKo: "FOGRA39 (유럽 코팅 아트지 · ISO 12647-2)",
    nameEn: "FOGRA39 (ISO Coated v2 · 330% TAC)",
    standardCode: "ISO 12647-2 FOGRA39",
    tacWarnPercent: 300,
    tacLimitPercent: 330,
    defaultGcr: 0.65,
    blackMax: 0.95,
    dotGain: 0.14,
    paperWhiteSrgb: { r: 0.964, g: 0.957, b: 0.936 },
    cyanPurityBias: 0.11,
    magentaWarmthBias: 0.08,
    inkDensityGain: 0.94,
  },
  JapanColor2001: {
    id: "JapanColor2001",
    nameKo: "JapanColor2001 (한·일 단행본 코팅지)",
    nameEn: "JapanColor2001 Coated (300% TAC)",
    standardCode: "ISO 12647-2 JapanColor2001",
    tacWarnPercent: 280,
    tacLimitPercent: 300,
    defaultGcr: 0.72,
    blackMax: 0.92,
    dotGain: 0.12,
    paperWhiteSrgb: { r: 0.972, g: 0.97, b: 0.961 },
    cyanPurityBias: 0.085,
    magentaWarmthBias: 0.06,
    inkDensityGain: 0.96,
  },
};

/** CMYK 잉크 배합에 대한 총잉크량(TAC) 경고 및 인쇄 안전도를 판정한다. */
export function evaluateCmykTac(cmyk: CmykColor, profileId: PrintProfileId): TacEvaluation {
  const profile = PRINT_PROFILES[profileId];
  const totalInkPercent =
    (clamp(cmyk.c, 0, 1) + clamp(cmyk.m, 0, 1) + clamp(cmyk.y, 0, 1) + clamp(cmyk.k, 0, 1)) * 100;

  if (totalInkPercent > profile.tacLimitPercent) {
    return {
      profileId,
      totalInkPercent,
      warnPercent: profile.tacWarnPercent,
      limitPercent: profile.tacLimitPercent,
      level: "exceeded",
      messageKo: `총잉크량 ${totalInkPercent.toFixed(1)}%로 한도(${profile.tacLimitPercent}%) 초과 — 뒷묻음·번짐 위험, GCR 상향 필요`,
      messageEn: `TAC ${totalInkPercent.toFixed(1)}% exceeds ${profile.tacLimitPercent}% limit — raise GCR to prevent smudging`,
    };
  }
  if (totalInkPercent >= profile.tacWarnPercent) {
    return {
      profileId,
      totalInkPercent,
      warnPercent: profile.tacWarnPercent,
      limitPercent: profile.tacLimitPercent,
      level: "warning",
      messageKo: `총잉크량 ${totalInkPercent.toFixed(1)}%로 주의 구간(${profile.tacWarnPercent}% 이상) — 암부 건조 여유 점검 권장`,
      messageEn: `TAC ${totalInkPercent.toFixed(1)}% is in warning band (>= ${profile.tacWarnPercent}%) — verify shadow drying margin`,
    };
  }
  return {
    profileId,
    totalInkPercent,
    warnPercent: profile.tacWarnPercent,
    limitPercent: profile.tacLimitPercent,
    level: "safe",
    messageKo: `총잉크량 ${totalInkPercent.toFixed(1)}% — ${profile.id} 단행본 인쇄 안전 범위`,
    messageEn: `TAC ${totalInkPercent.toFixed(1)}% — within ${profile.id} print-safe envelope`,
  };
}

function applyDotGain(ink: number, dotGain: number): number {
  const v = clamp(ink, 0, 1);
  return clamp(v + dotGain * 2 * v * (1 - v), 0, 1);
}

/** Display-P3/sRGB 색상을 FOGRA39 / JapanColor2001 CMYK로 분판하고 코팅지 소프트프루핑 결과를 생성한다. */
export function softProofToCmyk(
  inputColor: RgbTuple,
  space: GamutSpaceId,
  profileId: PrintProfileId,
  options?: SoftProofOptions,
): CmykSoftProofResult {
  const profile = PRINT_PROFILES[profileId];
  const gcr = clamp(options?.gcrStrength ?? profile.defaultGcr, 0, 1);
  const richBlackBoost = clamp(options?.richBlackBoost ?? 0.14, 0, 0.35);

  const mapped =
    space === "display-p3"
      ? softMapP3ToSrgb(inputColor)
      : { mappedSrgb: clampUnitRgb(inputColor), originalOklch: srgbToOklch(clampUnitRgb(inputColor)) };

  const srgb = mapped.mappedSrgb;
  const origLab = oklchToOklab(mapped.originalOklch);

  const rawC = clamp(1 - srgb.r, 0, 1);
  const rawM = clamp(1 - srgb.g, 0, 1);
  const rawY = clamp(1 - srgb.b, 0, 1);
  const minCmy = Math.min(rawC, rawM, rawY);

  const k = clamp(minCmy * gcr + Math.max(0, minCmy - 0.35) * (1 - gcr) * (0.75 + richBlackBoost), 0, profile.blackMax);
  const ucr = minCmy * gcr * 0.88;
  const c = clamp(rawC - ucr + rawM * profile.cyanPurityBias * 0.18, 0, 1);
  const m = clamp(rawM - ucr + rawC * profile.magentaWarmthBias * 0.14, 0, 1);
  const y = clamp(rawY - ucr + rawM * profile.magentaWarmthBias * 0.2, 0, 1);

  const cmyk: CmykColor = { c, m, y, k };
  const tac = evaluateCmykTac(cmyk, profileId);

  const cEff = applyDotGain(c, profile.dotGain);
  const mEff = applyDotGain(m, profile.dotGain);
  const yEff = applyDotGain(y, profile.dotGain);
  const kEff = applyDotGain(k, profile.dotGain * 0.85);

  const inkR = (1 - cEff * 0.86 * profile.inkDensityGain) * (1 - mEff * (0.14 + profile.magentaWarmthBias * 0.4)) * (1 - yEff * 0.03) * (1 - kEff * 0.91);
  const inkG = (1 - cEff * (0.24 + profile.cyanPurityBias)) * (1 - mEff * 0.82 * profile.inkDensityGain) * (1 - yEff * 0.09) * (1 - kEff * 0.92);
  const inkB = (1 - cEff * 0.12) * (1 - mEff * (0.28 + profile.magentaWarmthBias)) * (1 - yEff * 0.84 * profile.inkDensityGain) * (1 - kEff * 0.93);

  const proofedSrgb: RgbTuple = {
    r: clamp(profile.paperWhiteSrgb.r * inkR, 0.035, 1),
    g: clamp(profile.paperWhiteSrgb.g * inkG, 0.035, 1),
    b: clamp(profile.paperWhiteSrgb.b * inkB, 0.038, 1),
  };
  const proofedLab = xyzD65ToOklab(srgbToXyzD65(proofedSrgb));
  const proofedOklch = oklabToOklch(proofedLab);
  const deltaEPrint = Math.hypot(origLab.L - proofedLab.L, origLab.a - proofedLab.a, origLab.b - proofedLab.b);

  return {
    profile,
    inputSpace: space,
    inputColor: clampUnitRgb(inputColor),
    cmyk,
    cmykPercent: {
      c: Number((c * 100).toFixed(1)),
      m: Number((m * 100).toFixed(1)),
      y: Number((y * 100).toFixed(1)),
      k: Number((k * 100).toFixed(1)),
    },
    tac,
    proofedSrgb,
    proofedOklch,
    proofedOklchCss: formatOklchCss(proofedOklch),
    referenceOklchCss: formatOklchCss(mapped.originalOklch),
    deltaEPrint,
    gamutShiftedForPrint: deltaEPrint > 0.045,
  };
}

/** 색공간(sRGB 또는 Display-P3)의 CIE 상대 휘도 Y를 계산한다. */
export function computeRelativeLuminance(color: RgbTuple, space: GamutSpaceId = "srgb"): number {
  const sanitized = clampUnitRgb(color);
  return clamp((space === "display-p3" ? displayP3ToXyzD65(sanitized) : srgbToXyzD65(sanitized)).y, 0, 1);
}

/** APCA W3 0.0.98G-4g 극성 인식 대비(Lc) 계산. */
function computeApcaLc(txtYRaw: number, bgYRaw: number): number {
  const txtY = txtYRaw > 0.022 ? txtYRaw : txtYRaw + Math.pow(0.022 - txtYRaw, 1.414);
  const bgY = bgYRaw > 0.022 ? bgYRaw : bgYRaw + Math.pow(0.022 - bgYRaw, 1.414);
  if (Math.abs(bgY - txtY) < 0.0005) return 0;
  if (bgY > txtY) {
    const sapc = (Math.pow(bgY, 0.56) - Math.pow(txtY, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : (sapc - 0.027) * 100;
  }
  const sapc = (Math.pow(bgY, 0.65) - Math.pow(txtY, 0.62)) * 1.14;
  return sapc > -0.1 ? 0 : (sapc + 0.027) * 100;
}

/** 웹툰 말풍선 텍스트와 배경 사이의 WCAG 2.1 및 APCA(Lc) 가독성 대비를 검사한다. */
export function evaluateBalloonContrast(
  foreground: RgbTuple,
  background: RgbTuple,
  space: GamutSpaceId = "srgb",
): BalloonContrastResult {
  const fg = clampUnitRgb(foreground);
  const bg = clampUnitRgb(background);
  const fgY = computeRelativeLuminance(fg, space);
  const bgY = computeRelativeLuminance(bg, space);
  const wcagRatio = (Math.max(fgY, bgY) + 0.05) / (Math.min(fgY, bgY) + 0.05);
  const apcaLc = computeApcaLc(fgY, bgY);
  const apcaAbsLc = Math.abs(apcaLc);
  const polarity: "dark-on-light" | "light-on-dark" = bgY >= fgY ? "dark-on-light" : "light-on-dark";

  let balloonGrade: ApcaBalloonGrade = "fail";
  let guidanceKo = "가독성 부족 — 말풍선 외곽선 추가 또는 글자 명도 대폭 보정 필요";
  let guidanceEn = "Insufficient legibility — add outline stroke or boost contrast";

  if (apcaAbsLc >= 75 && wcagRatio >= 7) {
    balloonGrade = "excellent-body";
    guidanceKo = "모바일 세로 스크롤 본문 대사에 최상급 가독성";
    guidanceEn = "Optimal legibility for mobile vertical-scroll dialogue";
  } else if (apcaAbsLc >= 60 && wcagRatio >= 4.5) {
    balloonGrade = "pass-balloon";
    guidanceKo = "표준 웹툰 말풍선 본문 기준(WCAG AA · APCA 60+) 통과";
    guidanceEn = "Passes standard balloon dialogue bar (WCAG AA & APCA 60+)";
  } else if (apcaAbsLc >= 45 && wcagRatio >= 3) {
    balloonGrade = "large-sfx-only";
    guidanceKo = "대형 효과음·굵은 강조 대사 전용 — 소형 대사는 명도 차 확대 권장";
    guidanceEn = "Large SFX / bold shout only — widen luminance delta for small text";
  }

  return {
    foregroundSpace: space,
    backgroundSpace: space,
    foregroundLuminance: fgY,
    backgroundLuminance: bgY,
    wcagRatio,
    wcagAALarge: wcagRatio >= 3,
    wcagAANormal: wcagRatio >= 4.5,
    wcagAAA: wcagRatio >= 7,
    apcaLc,
    apcaAbsLc,
    polarity,
    balloonGrade,
    foregroundOklchCss: formatOklchCss(space === "display-p3" ? displayP3ToOklch(fg) : srgbToOklch(fg)),
    backgroundOklchCss: formatOklchCss(space === "display-p3" ? displayP3ToOklch(bg) : srgbToOklch(bg)),
    guidanceKo,
    guidanceEn,
  };
}

/** Display-P3 광색역 웹툰 스와치 프리셋 6종. */
export const DEMO_P3_WEBTOON_SWATCHES: readonly DemoWideGamutSwatch[] = [
  { id: "neon-cyber-magenta", labelKo: "네온 사이버 마젠타 P3", labelEn: "Neon Cyber Magenta P3", p3: { r: 0.98, g: 0.08, b: 0.64 }, noteKo: "sRGB 외곽을 강하게 돌파하는 광색역 네온 효과음", noteEn: "Wide-gamut cyberpunk neon SFX far beyond sRGB" },
  { id: "seoul-persimmon-sunset", labelKo: "서울 감빛 노을 주홍 P3", labelEn: "Seoul Persimmon Sunset P3", p3: { r: 0.99, g: 0.34, b: 0.06 }, noteKo: "황금 노을 역광과 감정선 강조용 고채도 주홍", noteEn: "High-chroma persimmon for golden sunset highlights" },
  { id: "arcane-emerald-cyan", labelKo: "마법 에메랄드 시안 P3", labelEn: "Arcane Emerald Cyan P3", p3: { r: 0.04, g: 0.94, b: 0.66 }, noteKo: "판타지 마법진 전용 — CMYK 인쇄 시 채도 변화 체감", noteEn: "Fantasy magic circle — dramatic print gamut delta" },
  { id: "midnight-royal-indigo", labelKo: "심야 로열 인디고", labelEn: "Midnight Royal Indigo", p3: { r: 0.09, g: 0.11, b: 0.24 }, noteKo: "어두운 밤하늘 배경 — 낮은 GCR에서 TAC 경고 검증용", noteEn: "Deep night background — checks TAC limits at low GCR" },
  { id: "sakura-silk-pink", labelKo: "벚꽃 실크 하이라이트", labelEn: "Sakura Silk Highlight", p3: { r: 0.95, g: 0.72, b: 0.8 }, noteKo: "sRGB 범위 내 로맨스 톤 — 무손실 통과 검증", noteEn: "In-gamut romance pastel — verifies lossless passthrough" },
  { id: "deep-ink-shadow", labelKo: "딥 잉크 먹 그림자", labelEn: "Deep Ink Shadow", p3: { r: 0.05, g: 0.04, b: 0.06 }, noteKo: "리치 블랙 암부 톤 — 단행본 총잉크량 제어 대상", noteEn: "Rich-black shadow tone — prime print TAC check target" },
];

/** 말풍선 가독성 대비 검사기 프리셋 4종. */
export const DEMO_BALLOON_CONTRAST_PRESETS: readonly DemoBalloonContrastPreset[] = [
  { id: "classic-white-balloon", labelKo: "표준 흰 말풍선 (먹글씨)", labelEn: "Classic White Balloon", sampleLineKo: "오늘 노을 아래서 마지막 장면을 완성하자.", sampleLineEn: "Let us finish the final scene under today's sunset.", foregroundP3: { r: 0.1, g: 0.1, b: 0.12 }, backgroundP3: { r: 0.98, g: 0.97, b: 0.95 } },
  { id: "dark-monologue-box", labelKo: "심리 독백 다크 박스", labelEn: "Dark Monologue Box", sampleLineKo: "빗소리 너머로 발걸음이 가까워지고 있었다.", sampleLineEn: "Footsteps drew closer beyond the sound of rain.", foregroundP3: { r: 0.95, g: 0.94, b: 0.9 }, backgroundP3: { r: 0.11, g: 0.12, b: 0.16 } },
  { id: "sunset-emotion-shout", labelKo: "노을 강조 외침 (대형 전용)", labelEn: "Sunset Shout (Large Only)", sampleLineKo: "지금 바로 뛰어!", sampleLineEn: "Jump right now!", foregroundP3: { r: 0.86, g: 0.28, b: 0.1 }, backgroundP3: { r: 0.98, g: 0.92, b: 0.84 } },
  { id: "neon-low-contrast-warn", labelKo: "저대비 네온 경고 예시", labelEn: "Low-Contrast Neon Warning", sampleLineKo: "보이지 않는 속삭임...", sampleLineEn: "Barely legible whisper...", foregroundP3: { r: 0.72, g: 0.56, b: 0.86 }, backgroundP3: { r: 0.88, g: 0.8, b: 0.94 } },
];
