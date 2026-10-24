/**
 * studio-intermediate-color.ts
 *
 * Mathematical bilinear color interpolation engine for Clip Studio Paint
 * Intermediate Color Palette (중간색 팔레트).
 *
 * Given 4 corner anchor colors (Top-Left, Top-Right, Bottom-Left, Bottom-Right),
 * computes an interactive 2D NxN grid of subtle transitional shades:
 *   C(u, v) = (1-u)(1-v)C00 + u(1-v)C10 + (1-u)v C01 + uv C11
 */

export interface StudioIntermediateColorCorners {
  readonly c00: string; // Top-Left (e.g. highlight)
  readonly c10: string; // Top-Right (e.g. base tone)
  readonly c01: string; // Bottom-Left (e.g. shadow 1)
  readonly c11: string; // Bottom-Right (e.g. ambient shadow 2)
}

export interface StudioIntermediateColorPreset {
  readonly id: string;
  readonly name: string;
  readonly corners: StudioIntermediateColorCorners;
}

export type StudioIntermediateGridSize = 4 | 6 | 8 | 12;

export type StudioIntermediateInterpolationSpace = "srgb" | "oklab";

export const STUDIO_INTERMEDIATE_COLOR_PRESETS: readonly StudioIntermediateColorPreset[] =
  Object.freeze([
    {
      id: "korean-webtoon-skin",
      name: "웹툰 피부톤",
      corners: {
        c00: "#fff0e6", // 밝은 하이라이트
        c10: "#fcd5b5", // 기본 살구빛 피부
        c01: "#e59882", // 1차 따뜻한 음영
        c11: "#8c5357", // 2차 딥 모브 그림자
      },
    },
    {
      id: "anime-golden-hair",
      name: "골든 헤어",
      corners: {
        c00: "#fffbeb", // 엔젤링 하이라이트
        c10: "#fde047", // 기본 골드 옐로
        c01: "#ca8a04", // 앰버 중간음영
        c11: "#713f12", // 딥 브라운 암부
      },
    },
    {
      id: "cool-night-shadow",
      name: "쿨 나이트 섀도우",
      corners: {
        c00: "#f1f5f9", // 창백한 달빛
        c10: "#94a3b8", // 슬레이트 중간톤
        c01: "#334155", // 짙은 남회색
        c11: "#090d16", // 딥 네이비 암부
      },
    },
    {
      id: "sunset-lighting",
      name: "노을 석양 무드",
      corners: {
        c00: "#fed7aa", // 피치 하이라이트
        c10: "#fb7185", // 로즈 마젠타
        c01: "#c084fc", // 라벤더 황혼
        c11: "#1e1b4b", // 미드나잇 인디고
      },
    },
  ]);

export const DEFAULT_INTERMEDIATE_CORNERS: StudioIntermediateColorCorners =
  STUDIO_INTERMEDIATE_COLOR_PRESETS[0]!.corners;

/** Converts hex (#rgb, #rrggbb) string to [r, g, b] numbers (0..255) */
export function hexToRgb(hex: string): readonly [number, number, number] {
  let cleaned = hex.trim().replace(/^#/u, "");
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (cleaned.length !== 6) {
    return [128, 128, 128];
  }
  const num = parseInt(cleaned, 16);
  if (Number.isNaN(num)) return [128, 128, 128];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/** Converts [r, g, b] (0..255) numbers to standard #rrggbb lowercase hex */
export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function srgbChannelToLinear(channel255: number): number {
  const c = Math.max(0, Math.min(255, channel255)) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearChannelToSrgb255(linear: number): number {
  const c = Math.max(0, Math.min(1, linear));
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(encoded * 255)));
}

/**
 * Converts 8-bit sRGB [0..255] to Björn Ottosson's perceptual OKLab [L, a, b].
 */
export function srgbToOklab(
  r255: number,
  g255: number,
  b255: number,
): readonly [number, number, number] {
  const r = srgbChannelToLinear(r255);
  const g = srgbChannelToLinear(g255);
  const b = srgbChannelToLinear(b255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/**
 * Converts OKLab [L, a, b] back to 8-bit sRGB [0..255].
 */
export function oklabToSrgb(
  L: number,
  a: number,
  bLab: number,
): readonly [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * bLab;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * bLab;
  const s_ = L - 0.0894841775 * a - 1.291485548 * bLab;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [
    linearChannelToSrgb255(rLin),
    linearChannelToSrgb255(gLin),
    linearChannelToSrgb255(bLin),
  ];
}

/**
 * Computes WCAG 2.1 relative luminance in [0..1] for contrast-aware UI badges/indicators.
 */
export function computeColorRelativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/**
 * Bilinear interpolation between 4 colors:
 * u in [0..1] (horizontal factor from left to right)
 * v in [0..1] (vertical factor from top to bottom)
 * space: "srgb" (classic CSP linear RGB mix) or "oklab" (perceptually uniform chroma-preserving mix)
 */
export function interpolateBilinearColor(
  c00: string,
  c10: string,
  c01: string,
  c11: string,
  u: number,
  v: number,
  space: StudioIntermediateInterpolationSpace = "srgb",
): string {
  const [r00, g00, b00] = hexToRgb(c00);
  const [r10, g10, b10] = hexToRgb(c10);
  const [r01, g01, b01] = hexToRgb(c01);
  const [r11, g11, b11] = hexToRgb(c11);

  const safeU = Math.max(0, Math.min(1, u));
  const safeV = Math.max(0, Math.min(1, v));

  const w00 = (1 - safeU) * (1 - safeV);
  const w10 = safeU * (1 - safeV);
  const w01 = (1 - safeU) * safeV;
  const w11 = safeU * safeV;

  if (space === "oklab") {
    if (safeU === 0 && safeV === 0) return rgbToHex(r00, g00, b00);
    if (safeU === 1 && safeV === 0) return rgbToHex(r10, g10, b10);
    if (safeU === 0 && safeV === 1) return rgbToHex(c01 ? r01 : 0, g01, b01);
    if (safeU === 1 && safeV === 1) return rgbToHex(r11, g11, b11);

    const [L00, a00, bLab00] = srgbToOklab(r00, g00, b00);
    const [L10, a10, bLab10] = srgbToOklab(r10, g10, b10);
    const [L01, a01, bLab01] = srgbToOklab(r01, g01, b01);
    const [L11, a11, bLab11] = srgbToOklab(r11, g11, b11);

    const L = w00 * L00 + w10 * L10 + w01 * L01 + w11 * L11;
    const a = w00 * a00 + w10 * a10 + w01 * a01 + w11 * a11;
    const bLab = w00 * bLab00 + w10 * bLab10 + w01 * bLab01 + w11 * bLab11;
    const [r, g, b] = oklabToSrgb(L, a, bLab);
    return rgbToHex(r, g, b);
  }

  const r = w00 * r00 + w10 * r10 + w01 * r01 + w11 * r11;
  const g = w00 * g00 + w10 * g10 + w01 * g01 + w11 * g11;
  const b = w00 * b00 + w10 * b10 + w01 * b01 + w11 * b11;

  return rgbToHex(r, g, b);
}

/** Generates a 2D matrix of intermediate colors with dimension gridSize x gridSize */
export function generateIntermediateColorGrid(
  corners: StudioIntermediateColorCorners,
  gridSize: StudioIntermediateGridSize,
  space: StudioIntermediateInterpolationSpace = "srgb",
): readonly (readonly string[])[] {
  const size = Math.max(2, gridSize);
  const grid: (readonly string[])[] = [];

  for (let row = 0; row < size; row++) {
    const v = size > 1 ? row / (size - 1) : 0;
    const currentRow: string[] = [];
    for (let col = 0; col < size; col++) {
      const u = size > 1 ? col / (size - 1) : 0;
      currentRow.push(
        interpolateBilinearColor(
          corners.c00,
          corners.c10,
          corners.c01,
          corners.c11,
          u,
          v,
          space,
        ),
      );
    }
    grid.push(Object.freeze(currentRow));
  }

  return Object.freeze(grid);
}
