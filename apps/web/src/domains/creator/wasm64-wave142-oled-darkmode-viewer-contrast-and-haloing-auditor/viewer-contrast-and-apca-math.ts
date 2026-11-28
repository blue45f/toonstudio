/**
 * Wave 142 — 독자 뷰어 테마 모델 & 정밀 광도·대비(IEC 61966-2-1 · WCAG 2.1 · APCA-W3 · OKLab) 계산기.
 *
 * - 4종 독자 뷰어 배경 프로파일(`light-paper`, `sepia-night`, `dark-slate`, `oled-true-black`)
 * - IEC 61966-2-1 sRGB <-> 선형광도 변환 및 WCAG 2.1 상대휘도 대비비 (`1.0..21.0`)
 * - 지각 극성 인지 대비 APCA-W3 0.0.98G-4g Lc (`+BoW` / `-WoB`)
 * - Björn Ottosson OKLab / OKLCH 색공간 변환 및 유클리드 지각 색차 ΔE
 * - 투명/반투명 요소 알파 합성기 (`srgb` 및 `linear` 블렌딩 지원)
 */

export type ViewerThemeId =
  | "light-paper"
  | "sepia-night"
  | "dark-slate"
  | "oled-true-black";

export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface SrgbaColor extends SrgbColor {
  readonly a: number;
}

export interface OklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type ContrastPolarity = "dark-on-light" | "light-on-dark" | "neutral";
export type AlphaBlendSpace = "srgb" | "linear";

export interface ViewerThemeProfile {
  readonly id: ViewerThemeId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly isDark: boolean;
  readonly isOledTrueBlack: boolean;
  readonly backgroundSrgb: SrgbColor;
  readonly relativeLuminance: number;
  readonly oklch: OklchColor;
  readonly oklchCss: string;
}

export interface ThemeContrastMeasurement {
  readonly foregroundLuminance: number;
  readonly backgroundLuminance: number;
  readonly wcagRatio: number;
  readonly apcaLc: number;
  readonly apcaAbsLc: number;
  readonly polarity: ContrastPolarity;
  readonly oklabDeltaE: number;
}

// APCA-W3 0.0.98G-4g 공식 상수
const APCA_MAIN_TRC = 2.4;
const APCA_R_COEFF = 0.2126729;
const APCA_G_COEFF = 0.7151522;
const APCA_B_COEFF = 0.072175;
const APCA_BLK_THRS = 0.022;
const APCA_BLK_CLMP = 1.414;
const APCA_DELTA_Y_MIN = 0.0005;
const APCA_NORM_BG = 0.56;
const APCA_NORM_TXT = 0.57;
const APCA_REV_BG = 0.65;
const APCA_REV_TXT = 0.62;
const APCA_SCALE_BOW = 1.14;
const APCA_SCALE_WOB = 1.14;
const APCA_LO_BOW_OFFSET = 0.027;
const APCA_LO_WOB_OFFSET = 0.027;
const APCA_LO_CLIP = 0.1;

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 0..255 범위의 안전한 sRGB 색상을 정규화한다. */
export function normalizeSrgbColor(color: SrgbColor): SrgbColor {
  return {
    r: clampFinite(color.r, 0, 255, 0),
    g: clampFinite(color.g, 0, 255, 0),
    b: clampFinite(color.b, 0, 255, 0),
  };
}

/** 0..255 sRGB + 0..1 알파 채널을 정규화한다. */
export function normalizeSrgbaColor(color: SrgbaColor): SrgbaColor {
  return {
    r: clampFinite(color.r, 0, 255, 0),
    g: clampFinite(color.g, 0, 255, 0),
    b: clampFinite(color.b, 0, 255, 0),
    a: clampFinite(color.a, 0, 1, 1),
  };
}

/** IEC 61966-2-1 sRGB 채널(0..255)을 선형광도(0..1)로 변환한다. */
export function srgbChannelToLinear(channel255: number): number {
  const c = clampFinite(channel255, 0, 255, 0) / 255;
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 선형광도(0..1)를 IEC 61966-2-1 sRGB 채널(0..255)로 역변환한다. */
export function linearToSrgbChannel(linear: number): number {
  const l = clampFinite(linear, 0, 1, 0);
  const encoded = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return clampFinite(encoded, 0, 1, 0) * 255;
}

/** WCAG 2.1 상대휘도 Y(0..1)를 계산한다. */
export function computeWcagRelativeLuminance(color: SrgbColor): number {
  const safe = normalizeSrgbColor(color);
  const rLin = srgbChannelToLinear(safe.r);
  const gLin = srgbChannelToLinear(safe.g);
  const bLin = srgbChannelToLinear(safe.b);
  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/** WCAG 2.1 대비비(1.0..21.0)를 계산한다. */
export function computeWcagContrastRatio(foreground: SrgbColor, background: SrgbColor): number {
  const yFg = computeWcagRelativeLuminance(foreground);
  const yBg = computeWcagRelativeLuminance(background);
  const lighter = Math.max(yFg, yBg);
  const darker = Math.min(yFg, yBg);
  return (lighter + 0.05) / (darker + 0.05);
}

function computeApcaScreenLuminance(color: SrgbColor): number {
  const safe = normalizeSrgbColor(color);
  const y =
    APCA_R_COEFF * Math.pow(safe.r / 255, APCA_MAIN_TRC) +
    APCA_G_COEFF * Math.pow(safe.g / 255, APCA_MAIN_TRC) +
    APCA_B_COEFF * Math.pow(safe.b / 255, APCA_MAIN_TRC);
  if (y < APCA_BLK_THRS) {
    return y + Math.pow(APCA_BLK_THRS - y, APCA_BLK_CLMP);
  }
  return y;
}

/**
 * 지각 극성 인지 대비 APCA-W3 Lc를 계산한다.
 * - 양수(+): 밝은 배경 위 어두운 전경 (Dark-on-Light / BoW)
 * - 음수(-): 어두운 배경 위 밝은 전경 (Light-on-Dark / WoB)
 * - 0: 동일 색이거나 지각 임계치 미만
 */
export function computeApcaContrastLc(foreground: SrgbColor, background: SrgbColor): number {
  const yTxt = computeApcaScreenLuminance(foreground);
  const yBg = computeApcaScreenLuminance(background);

  if (Math.abs(yBg - yTxt) < APCA_DELTA_Y_MIN) {
    return 0;
  }

  if (yBg > yTxt) {
    const sapc = (Math.pow(yBg, APCA_NORM_BG) - Math.pow(yTxt, APCA_NORM_TXT)) * APCA_SCALE_BOW;
    if (sapc < APCA_LO_CLIP) return 0;
    return (sapc - APCA_LO_BOW_OFFSET) * 100;
  }

  const sapc = (Math.pow(yBg, APCA_REV_BG) - Math.pow(yTxt, APCA_REV_TXT)) * APCA_SCALE_WOB;
  if (sapc > -APCA_LO_CLIP) return 0;
  return (sapc + APCA_LO_WOB_OFFSET) * 100;
}

/** Björn Ottosson OKLab 색좌표로 sRGB를 변환한다. */
export function srgbToOklab(color: SrgbColor): OklabColor {
  const safe = normalizeSrgbColor(color);
  const r = srgbChannelToLinear(safe.r);
  const g = srgbChannelToLinear(safe.g);
  const b = srgbChannelToLinear(safe.b);

  const lCone = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const mCone = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const sCone = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lPrime = Math.cbrt(Math.max(0, lCone));
  const mPrime = Math.cbrt(Math.max(0, mCone));
  const sPrime = Math.cbrt(Math.max(0, sCone));

  return {
    l: 0.2104542553 * lPrime + 0.793617785 * mPrime - 0.0040720468 * sPrime,
    a: 1.9779984951 * lPrime - 2.428592205 * mPrime + 0.4505937099 * sPrime,
    b: 0.0259040371 * lPrime + 0.7827717662 * mPrime - 0.808675766 * sPrime,
  };
}

/** sRGB를 OKLCH 극좌표(`L: 0..1`, `C >= 0`, `H: 0..360`)로 변환한다. */
export function srgbToOklch(color: SrgbColor): OklchColor {
  const lab = srgbToOklab(color);
  const c = Math.hypot(lab.a, lab.b);
  let h = 0;
  if (c >= 1e-7) {
    h = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  }
  return {
    l: clampFinite(lab.l, 0, 1, 0),
    c: Math.max(0, c),
    h,
  };
}

/** OKLCH 극좌표를 sRGB(0..255 클램프)로 역변환한다. */
export function oklchToSrgb(color: OklchColor): SrgbColor {
  const l = clampFinite(color.l, 0, 1, 0);
  const c = Math.max(0, Number.isFinite(color.c) ? color.c : 0);
  const hRad = ((Number.isFinite(color.h) ? color.h : 0) * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;

  const lCone = lPrime * lPrime * lPrime;
  const mCone = mPrime * mPrime * mPrime;
  const sCone = sPrime * sPrime * sPrime;

  const rLin = 4.0767416621 * lCone - 3.3077115913 * mCone + 0.2309699292 * sCone;
  const gLin = -1.2684380046 * lCone + 2.6097574011 * mCone - 0.3413193965 * sCone;
  const bLin = -0.0041960863 * lCone - 0.7034186147 * mCone + 1.707614701 * sCone;

  return {
    r: linearToSrgbChannel(rLin),
    g: linearToSrgbChannel(gLin),
    b: linearToSrgbChannel(bLin),
  };
}

/** 순수 CSS `oklch(...)` 문자열을 생성한다 (원시 hex/rgb/hsl 금지 준수). */
export function formatOklchCss(color: OklchColor, alpha?: number): string {
  const l = clampFinite(color.l, 0, 1, 0);
  const c = Math.max(0, Number.isFinite(color.c) ? color.c : 0);
  const h = Number.isFinite(color.h) ? ((color.h % 360) + 360) % 360 : 0;
  if (alpha !== undefined) {
    const safeAlpha = clampFinite(alpha, 0, 1, 1);
    return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(1)} / ${safeAlpha.toFixed(3)})`;
  }
  return `oklch(${l.toFixed(4)} ${c.toFixed(4)} ${h.toFixed(1)})`;
}

/** sRGB 색상을 순수 CSS `oklch(...)` 문자열로 직접 변환한다. */
export function srgbToOklchCss(color: SrgbColor, alpha?: number): string {
  return formatOklchCss(srgbToOklch(color), alpha);
}

/** 두 sRGB 색상 사이의 Björn Ottosson OKLab 유클리드 지각 색차 ΔE를 계산한다. */
export function computeOklabDeltaE(colorA: SrgbColor, colorB: SrgbColor): number {
  const labA = srgbToOklab(colorA);
  const labB = srgbToOklab(colorB);
  const dl = labA.l - labB.l;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

/**
 * 반투명/투명 배경 위 전경 요소를 독자 뷰어 배경색 위에 합성(Porter-Duff source-over)한다.
 * 기본값은 모바일 웹툰 뷰어(Skia/WebView)와 동일한 sRGB 합성(`blendSpace: "srgb"`)이다.
 */
export function compositeSrgbOverBackground(
  foreground: SrgbaColor,
  background: SrgbColor,
  blendSpace: AlphaBlendSpace = "srgb",
): SrgbColor {
  const fg = normalizeSrgbaColor(foreground);
  const bg = normalizeSrgbColor(background);
  const alpha = fg.a;
  const invAlpha = 1 - alpha;

  if (blendSpace === "linear") {
    const rLin = srgbChannelToLinear(fg.r) * alpha + srgbChannelToLinear(bg.r) * invAlpha;
    const gLin = srgbChannelToLinear(fg.g) * alpha + srgbChannelToLinear(bg.g) * invAlpha;
    const bLin = srgbChannelToLinear(fg.b) * alpha + srgbChannelToLinear(bg.b) * invAlpha;
    return {
      r: linearToSrgbChannel(rLin),
      g: linearToSrgbChannel(gLin),
      b: linearToSrgbChannel(bLin),
    };
  }

  return {
    r: fg.r * alpha + bg.r * invAlpha,
    g: fg.g * alpha + bg.g * invAlpha,
    b: fg.b * alpha + bg.b * invAlpha,
  };
}

/** 전경/배경 색상 쌍에 대한 WCAG 2.1, APCA-W3 Lc, 극성, OKLab ΔE를 통합 평가한다. */
export function evaluateColorPairContrast(
  foreground: SrgbColor,
  background: SrgbColor,
): ThemeContrastMeasurement {
  const fgLum = computeWcagRelativeLuminance(foreground);
  const bgLum = computeWcagRelativeLuminance(background);
  const wcagRatio = computeWcagContrastRatio(foreground, background);
  const apcaLc = computeApcaContrastLc(foreground, background);
  const polarity: ContrastPolarity =
    apcaLc > 0 ? "dark-on-light" : apcaLc < 0 ? "light-on-dark" : "neutral";
  const oklabDeltaE = computeOklabDeltaE(foreground, background);

  return {
    foregroundLuminance: fgLum,
    backgroundLuminance: bgLum,
    wcagRatio,
    apcaLc,
    apcaAbsLc: Math.abs(apcaLc),
    polarity,
    oklabDeltaE,
  };
}

function buildViewerThemeProfile(
  id: ViewerThemeId,
  labelKo: string,
  descriptionKo: string,
  isDark: boolean,
  isOledTrueBlack: boolean,
  backgroundSrgb: SrgbColor,
): ViewerThemeProfile {
  const oklch = srgbToOklch(backgroundSrgb);
  return {
    id,
    labelKo,
    descriptionKo,
    isDark,
    isOledTrueBlack,
    backgroundSrgb,
    relativeLuminance: computeWcagRelativeLuminance(backgroundSrgb),
    oklch,
    oklchCss: formatOklchCss(oklch),
  };
}

/** 웹툰 독자 모바일/태블릿 뷰어 4종 표준 배경 프로파일. */
export const VIEWER_THEME_PROFILES: Readonly<Record<ViewerThemeId, ViewerThemeProfile>> = {
  "light-paper": buildViewerThemeProfile(
    "light-paper",
    "라이트 페이퍼",
    "주간 기본 흰 종이 배경 (네이버·카카오·WEBTOON 기본 모드)",
    false,
    false,
    { r: 255, g: 255, b: 255 },
  ),
  "sepia-night": buildViewerThemeProfile(
    "sepia-night",
    "세피아 페이퍼",
    "저블루라이트 따뜻한 미색 눈보호 뷰어 배경",
    false,
    false,
    { r: 244, g: 236, b: 216 },
  ),
  "dark-slate": buildViewerThemeProfile(
    "dark-slate",
    "다크 슬레이트",
    "표준 다크모드 저휘도 짙은 회색 뷰어 배경",
    true,
    false,
    { r: 18, g: 18, b: 22 },
  ),
  "oled-true-black": buildViewerThemeProfile(
    "oled-true-black",
    "OLED 트루블랙",
    "야간 모바일 OLED 픽셀 소등 완전 검정 뷰어 배경",
    true,
    true,
    { r: 0, g: 0, b: 0 },
  ),
};

/** 4종 뷰어 테마의 결정론적 표준 열거 순서. */
export const ALL_VIEWER_THEME_IDS: readonly ViewerThemeId[] = [
  "light-paper",
  "sepia-night",
  "dark-slate",
  "oled-true-black",
];

/** 테마 ID로 뷰어 프로파일을 조회한다. */
export function getViewerThemeProfile(themeId: ViewerThemeId): ViewerThemeProfile {
  return VIEWER_THEME_PROFILES[themeId];
}
