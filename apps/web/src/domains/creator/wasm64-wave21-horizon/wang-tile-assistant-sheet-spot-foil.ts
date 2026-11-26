/**
 * 비주기 2색·4방향 왕 타일(Wang-Tile) 심리스 원단·패턴 합성기,
 * 어시스턴트 채색 인계용 컬러키·광원 지정서 생성기 및
 * 단행본 특별판 별색 박(`Spot-Gold`·`Spot-Silver`)·부분 유광(`UV-Gloss`)·CMYK 분판기.
 *
 * - 외부 서버 호출 없이 로컬 메모리에서 결정론적으로 즉시 실행된다(`₩0`).
 * - 4변 색상 일치 왕 타일 덱과 비주기 공간 해시를 결합해 격자 반복 이음새(`0건`) 없이
 *   기모노·체크(타탄)·벽돌·수풀 패턴을 무한 합성한다.
 * - 캐릭터 부위별 HEX·OKLCH 본색·명암 쌍, 선화 잠금 규칙, 주광원 방위각·고도각 화살표를
 *   단일 구조화 지정서로 묶어 채색 어시스턴트 인계 편차를 없앤다.
 * - `300/600 DPI` 기준 `±0.1mm` 초크(Choke)·스프레드(Spread) 정밀 유클리드 거리변환 트래핑으로
 *   단색 별색판(`Spot-Gold`, `Spot-Silver`, `UV-Gloss`)과 녹아웃 적용 CMYK 4원색판을 분리한다.
 */

export type WangEdgeColor = 0 | 1;
export type WangPatternPreset = "kimono" | "plaid" | "brick" | "foliage";
export type RgbTuple = readonly [number, number, number];
export type MaterialSurfaceFinish = "matte" | "skin" | "hair-aniso" | "cloth" | "metal";
export type ShadingLayerBlendMode = "multiply" | "normal" | "screen" | "overlay";
export type SpotPlateKind = "Spot-Gold" | "Spot-Silver" | "UV-Gloss";

export const SPOT_PLATE_KINDS: readonly SpotPlateKind[] = Object.freeze(["Spot-Gold", "Spot-Silver", "UV-Gloss"]);

export interface OklchColor { readonly l: number; readonly c: number; readonly hDeg: number }
export interface Point2DVec { readonly x: number; readonly y: number }

export interface WangTileSynthInput {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly tileSizePx?: number;
  readonly preset?: WangPatternPreset;
  readonly seed?: number;
  readonly primaryHex?: string;
  readonly secondaryHex?: string;
  readonly accentHex?: string;
  readonly seedTile0Rgba?: Uint8Array | Uint8ClampedArray;
  readonly seedTile1Rgba?: Uint8Array | Uint8ClampedArray;
  readonly seedTileSizePx?: number;
}

export interface WangTileSynthResult {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly tileSizePx: number;
  readonly gridCols: number;
  readonly gridRows: number;
  readonly preset: WangPatternPreset;
  readonly rgba: Uint8ClampedArray;
  readonly tileGridIds: Uint8Array;
  readonly seamEdgeMismatchCount: number;
  readonly maxSeamPixelDelta: number;
  readonly aperiodicDiversityRatio: number;
  readonly serverCostKrw: 0;
}

export interface CharacterRegionColorInput {
  readonly regionId: string;
  readonly regionLabelKo: string;
  readonly baseHex: string;
  readonly shadowHex?: string;
  readonly highlightHex?: string;
  readonly materialFinish?: MaterialSurfaceFinish;
  readonly shadingBlendMode?: ShadingLayerBlendMode;
}

export interface CharacterColorKeyInput {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly regions: readonly CharacterRegionColorInput[];
}

export interface LockedInkLayerRule {
  readonly layerRole: "vector-main-ink" | "color-hold-ink" | "base-flat-mask" | "cel-shadow-1" | "rim-highlight" | string;
  readonly layerLabelKo: string;
  readonly locked: boolean;
  readonly alphaLock: boolean;
  readonly clipToFlatMask: boolean;
  readonly antiAliasing: "binary-aliased" | "smooth";
  readonly instructionKo: string;
}

export interface PrimaryLightSpecInput {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorTempKelvin?: number;
  readonly intensity?: number;
}

export interface AssistantHandoffSpecInput {
  readonly projectId: string;
  readonly episodeNumber: number;
  readonly sceneTitleKo: string;
  readonly primaryLight: PrimaryLightSpecInput;
  readonly characters: readonly CharacterColorKeyInput[];
  readonly customInkRules?: readonly LockedInkLayerRule[];
}

export interface RegionSwatchEntry {
  readonly regionId: string;
  readonly regionLabelKo: string;
  readonly materialFinish: MaterialSurfaceFinish;
  readonly shadingBlendMode: ShadingLayerBlendMode;
  readonly baseHex: string;
  readonly baseOklch: OklchColor;
  readonly shadowHex: string;
  readonly shadowOklch: OklchColor;
  readonly shadowDeltaL: number;
  readonly highlightHex: string;
  readonly highlightOklch: OklchColor;
  readonly highlightDeltaL: number;
}

export interface CharacterHandoffPalette {
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly regions: readonly RegionSwatchEntry[];
}

export interface PrimaryLightArrowSpec {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly colorTempKelvin: number;
  readonly intensity: number;
  readonly lightUnitVector3D: { readonly x: number; readonly y: number; readonly z: number };
  readonly compassArrow2D: {
    readonly origin: Point2DVec;
    readonly tip: Point2DVec;
    readonly wingLeft: Point2DVec;
    readonly wingRight: Point2DVec;
    readonly shadowCastVector: Point2DVec;
  };
  readonly directionSummaryKo: string;
}

export interface AssistantHandoffSpecSheet {
  readonly projectId: string;
  readonly episodeNumber: number;
  readonly sceneTitleKo: string;
  readonly characterSwatches: readonly CharacterHandoffPalette[];
  readonly lockedInkLayerRules: readonly LockedInkLayerRule[];
  readonly primaryLightArrow: PrimaryLightArrowSpec;
  readonly specDigestHex: string;
  readonly handoffMarkdownKo: string;
  readonly serverCostKrw: 0;
}

export interface SpotPlateTrapConfig {
  readonly trapMm?: number;
  readonly thresholdByte?: number;
  readonly knockoutCmykUnderPlate?: boolean;
}

export interface SpotPlateSeparationInput {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly dpi?: 300 | 600 | number;
  readonly defaultFoilTrapMm?: number;
  readonly defaultUvTrapMm?: number;
  readonly maxTacPercent?: number;
  readonly spotMasks?: Partial<Record<SpotPlateKind, Uint8Array | Uint8ClampedArray>>;
  readonly plateConfigs?: Partial<Record<SpotPlateKind, SpotPlateTrapConfig>>;
}

export interface SeparatedSpotPlate {
  readonly plateName: SpotPlateKind;
  readonly labelKo: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dpi: number;
  readonly trapMm: number;
  readonly trapRadiusPx: number;
  readonly trapMode: "spread" | "choke" | "exact";
  readonly overprint: boolean;
  readonly monochromeMask: Uint8Array;
  readonly activePixelCount: number;
  readonly coverageRatio: number;
}

export interface CmykProcessPlates {
  readonly cyan: Uint8Array;
  readonly magenta: Uint8Array;
  readonly yellow: Uint8Array;
  readonly black: Uint8Array;
  readonly maxObservedTacPercent: number;
}

export interface SpotPlateSeparationReport {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dpi: number;
  readonly cmykPlates: CmykProcessPlates;
  readonly spotPlates: readonly SeparatedSpotPlate[];
  readonly serverCostKrw: 0;
}

const HASH_PREFIX = String.fromCharCode(35);
const LINE_FEED = String.fromCharCode(10);

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function roundTo(v: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

function hexNibble(code: number): number {
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 55;
  if (code >= 97 && code <= 102) return code - 87;
  return -1;
}

/** 정규식 없이 문자 코드만으로 `#RGB`·`#RRGGBB` 색상 문자열을 파싱한다. */
export function parseHexColorToRgb(rawHex: string, fallback: RgbTuple = [128, 128, 128]): RgbTuple {
  const trimmed = rawHex.trim();
  const start = trimmed.charCodeAt(0) === 35 ? 1 : 0;
  const len = trimmed.length - start;
  if (len === 3) {
    const r = hexNibble(trimmed.charCodeAt(start)), g = hexNibble(trimmed.charCodeAt(start + 1)), b = hexNibble(trimmed.charCodeAt(start + 2));
    return (r >= 0 && g >= 0 && b >= 0) ? [r * 17, g * 17, b * 17] : fallback;
  }
  if (len === 6) {
    const r1 = hexNibble(trimmed.charCodeAt(start)), r0 = hexNibble(trimmed.charCodeAt(start + 1));
    const g1 = hexNibble(trimmed.charCodeAt(start + 2)), g0 = hexNibble(trimmed.charCodeAt(start + 3));
    const b1 = hexNibble(trimmed.charCodeAt(start + 4)), b0 = hexNibble(trimmed.charCodeAt(start + 5));
    if (r1 >= 0 && r0 >= 0 && g1 >= 0 && g0 >= 0 && b1 >= 0 && b0 >= 0) return [(r1 << 4) | r0, (g1 << 4) | g0, (b1 << 4) | b0];
  }
  return fallback;
}

/** RGB 바이트 값을 대문자 `#RRGGBB` 문자열로 직렬화한다. */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0").toUpperCase();
  return `${HASH_PREFIX}${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function srgbToLinear(byteVal: number): number {
  const c = clamp(byteVal, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(lin: number): number {
  const c = clamp(lin, 0, 1);
  const enc = c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
  return Math.round(clamp(enc * 255, 0, 255));
}

/** sRGB 바이트 색상을 지각 균일 색공간 OKLCH(`L`, `C`, `hDeg`)로 변환한다. */
export function rgbToOklch(r: number, g: number, b: number): OklchColor {
  const rl = srgbToLinear(r), gl = srgbToLinear(g), bl = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
  const m = Math.cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
  const okL = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const okA = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const okB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const chroma = Math.hypot(okA, okB);
  const hueRaw = (Math.atan2(okB, okA) * 180) / Math.PI;
  return { l: roundTo(clamp(okL, 0, 1), 4), c: roundTo(chroma, 4), hDeg: roundTo(chroma < 1e-4 ? 0 : (hueRaw + 360) % 360, 2) };
}

/** OKLCH 색상을 sRGB 색역 안으로 안전하게 투영해 RGB 바이트 튜플로 변환한다. */
export function oklchToRgb(lTarget: number, cTarget: number, hDeg: number): RgbTuple {
  const okL = clamp(lTarget, 0, 1);
  const rad = (((hDeg % 360) + 360) % 360) * (Math.PI / 180);
  let curC = Math.max(0, cTarget);
  for (let step = 0; step < 6; step += 1) {
    const okA = curC * Math.cos(rad), okB = curC * Math.sin(rad);
    const l_ = okL + 0.3963377774 * okA + 0.2158037573 * okB;
    const m_ = okL - 0.1055613458 * okA - 0.0638541728 * okB;
    const s_ = okL - 0.0894841775 * okA - 1.2914855480 * okB;
    const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    const rl = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    if ((rl >= -1e-3 && rl <= 1.001 && gl >= -1e-3 && gl <= 1.001 && bl >= -1e-3 && bl <= 1.001) || step === 5) {
      return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
    }
    curC *= 0.82;
  }
  return [128, 128, 128];
}

function hashGrid32(seed: number, x: number, y: number, salt: number): number {
  let h = (seed ^ Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0x7f4a7c15, 0xc2b2ae35) ^ salt) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

function mixRgb(a: RgbTuple, b: RgbTuple, t: number): RgbTuple {
  const u = clamp(t, 0, 1);
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

const DEFAULT_PRESET_PALETTES: Readonly<Record<WangPatternPreset, readonly [RgbTuple, RgbTuple, RgbTuple]>> = {
  kimono: [[158, 42, 59], [244, 232, 216], [214, 168, 79]],
  plaid: [[31, 64, 96], [228, 224, 212], [182, 54, 48]],
  brick: [[166, 78, 56], [216, 208, 196], [118, 52, 38]],
  foliage: [[42, 98, 61], [198, 218, 182], [112, 164, 84]],
};

function sampleCanonicalWangEdge(preset: WangPatternPreset, edgeColor: WangEdgeColor, t: number, pal: readonly [RgbTuple, RgbTuple, RgbTuple]): RgbTuple {
  const cornerPin = mixRgb(pal[0], pal[1], 0.5);
  const env = Math.sin(Math.PI * clamp(t, 0, 1)) ** 2;
  let wave: number;
  if (preset === "kimono") wave = 0.5 + 0.5 * Math.cos(t * Math.PI * (edgeColor === 0 ? 4 : 6));
  else if (preset === "plaid") wave = Math.abs(t - 0.5) < (edgeColor === 0 ? 0.18 : 0.32) ? 0.85 : 0.15;
  else if (preset === "brick") wave = Math.abs(t - 0.5) < 0.08 ? 0.95 : (edgeColor === 0 ? 0.2 : 0.35);
  else wave = 0.5 + 0.45 * Math.sin(t * Math.PI * (edgeColor === 0 ? 3 : 5));
  const midTarget = edgeColor === 0 ? mixRgb(pal[0], pal[2], wave * 0.55) : mixRgb(pal[1], pal[2], wave * 0.45);
  return mixRgb(cornerPin, midTarget, env);
}

function sampleInteriorMotif(
  preset: WangPatternPreset, tileId: number, u: number, v: number, cellHash: number,
  pal: readonly [RgbTuple, RgbTuple, RgbTuple], seed0?: Uint8Array | Uint8ClampedArray, seed1?: Uint8Array | Uint8ClampedArray, seedSize = 0,
): RgbTuple {
  if (seedSize > 0 && (seed0 || seed1)) {
    const activeSeed = ((tileId + (cellHash & 1)) & 1) === 0 ? (seed0 ?? seed1) : (seed1 ?? seed0);
    if (activeSeed) {
      const idx = (clamp(Math.floor(v * seedSize), 0, seedSize - 1) * seedSize + clamp(Math.floor(u * seedSize), 0, seedSize - 1)) * 4;
      return [activeSeed[idx] ?? 128, activeSeed[idx + 1] ?? 128, activeSeed[idx + 2] ?? 128];
    }
  }
  const cx = u - 0.5 + (((cellHash >>> 8) & 255) / 255 - 0.5) * 0.14;
  const cy = v - 0.5 + (((cellHash >>> 16) & 255) / 255 - 0.5) * 0.14;

  if (preset === "kimono") {
    const r = Math.hypot(cx, cy);
    const petal = Math.abs(Math.cos((Math.atan2(cy, cx) + (tileId & 3) * (Math.PI / 6)) * 3)) * 0.34;
    if (r < 0.08) return pal[2];
    return r < petal ? mixRgb(pal[2], pal[1], r / Math.max(0.05, petal)) : mixRgb(pal[0], pal[1], (tileId & 1) * 0.22);
  }
  if (preset === "plaid") {
    const bandU = Math.abs(u - 0.5) < (tileId & 2 ? 0.22 : 0.12);
    const bandV = Math.abs(v - 0.5) < (tileId & 4 ? 0.22 : 0.12);
    const twill = ((Math.floor((u + v) * 16) + tileId) & 1) === 0 ? 0.12 : -0.08;
    if (bandU && bandV) return pal[2];
    return bandU || bandV ? mixRgb(pal[0], pal[2], clamp(0.45 + twill, 0, 1)) : mixRgb(pal[0], pal[1], clamp(0.72 + twill, 0, 1));
  }
  if (preset === "brick") {
    const row = v < 0.5 ? 0 : 1;
    const localU = (u + ((row + (tileId & 1)) & 1) * 0.45) % 1;
    if (Math.abs(v - 0.5) < 0.055 || v < 0.04 || v > 0.96 || localU < 0.06 || localU > 0.94) return pal[1];
    return mixRgb(pal[0], pal[2], ((tileId * 3 + row * 5 + (cellHash & 7)) % 11) / 14);
  }
  const leafDist1 = Math.hypot(cx * 1.3 + cy * 0.5, cy * 1.3 - cx * 0.5);
  if (leafDist1 < 0.24) return mixRgb(pal[2], pal[1], leafDist1 * 2.2);
  return Math.hypot(cx - 0.16, cy + 0.14) < 0.18 ? pal[2] : mixRgb(pal[0], pal[1], 0.18 + ((tileId & 3) * 0.08));
}

function maxRgbPixelDiff(rgba: Uint8ClampedArray, i0: number, i1: number): number {
  return Math.max(Math.abs((rgba[i0] ?? 0) - (rgba[i1] ?? 0)), Math.abs((rgba[i0 + 1] ?? 0) - (rgba[i1 + 1] ?? 0)), Math.abs((rgba[i0 + 2] ?? 0) - (rgba[i1 + 2] ?? 0)));
}

/** 비주기 2색·4변 왕 타일(Wang-Tile) 원단·패턴 이미지를 이음새 불일치 `0건`으로 합성한다. */
export function synthesizeWangTilePattern(input: WangTileSynthInput): WangTileSynthResult {
  const widthPx = Math.max(8, Math.floor(input.widthPx));
  const heightPx = Math.max(8, Math.floor(input.heightPx));
  const tileSizePx = Math.max(8, Math.floor(input.tileSizePx ?? 32));
  const preset: WangPatternPreset = input.preset ?? "kimono";
  const seed = (input.seed ?? 20261127) >>> 0;
  const defaults = DEFAULT_PRESET_PALETTES[preset];
  const pal: readonly [RgbTuple, RgbTuple, RgbTuple] = [
    input.primaryHex ? parseHexColorToRgb(input.primaryHex, defaults[0]) : defaults[0],
    input.secondaryHex ? parseHexColorToRgb(input.secondaryHex, defaults[1]) : defaults[1],
    input.accentHex ? parseHexColorToRgb(input.accentHex, defaults[2]) : defaults[2],
  ];

  const gridCols = Math.max(1, Math.ceil(widthPx / tileSizePx));
  const gridRows = Math.max(1, Math.ceil(heightPx / tileSizePx));
  const northArr = new Uint8Array(gridCols * gridRows), eastArr = new Uint8Array(gridCols * gridRows);
  const southArr = new Uint8Array(gridCols * gridRows), westArr = new Uint8Array(gridCols * gridRows);
  const tileGridIds = new Uint8Array(gridCols * gridRows);

  for (let gy = 0; gy < gridRows; gy += 1) {
    for (let gx = 0; gx < gridCols; gx += 1) {
      const idx = gy * gridCols + gx;
      const n = (gy > 0 ? (southArr[(gy - 1) * gridCols + gx] ?? 0) : (hashGrid32(seed, gx, 0, 0x11) & 1)) as WangEdgeColor;
      const w = (gx > 0 ? (eastArr[gy * gridCols + (gx - 1)] ?? 0) : (hashGrid32(seed, 0, gy, 0x23) & 1)) as WangEdgeColor;
      const e = (hashGrid32(seed, gx, gy, 0x37) & 1) as WangEdgeColor;
      const s = (hashGrid32(seed, gx, gy, 0x59) & 1) as WangEdgeColor;
      northArr[idx] = n; eastArr[idx] = e; southArr[idx] = s; westArr[idx] = w;
      tileGridIds[idx] = (n << 3) | (e << 2) | (s << 1) | w;
    }
  }

  const rgba = new Uint8ClampedArray(widthPx * heightPx * 4);
  const denom = Math.max(1, tileSizePx - 1);
  const seedSize = Math.max(0, Math.floor(input.seedTileSizePx ?? 0));

  for (let py = 0; py < heightPx; py += 1) {
    const gy = Math.floor(py / tileSizePx), ly = py - gy * tileSizePx, v = ly / denom;
    for (let px = 0; px < widthPx; px += 1) {
      const gx = Math.floor(px / tileSizePx), lx = px - gx * tileSizePx, u = lx / denom;
      const gIdx = gy * gridCols + gx;
      const n = (northArr[gIdx] ?? 0) as WangEdgeColor, e = (eastArr[gIdx] ?? 0) as WangEdgeColor;
      const s = (southArr[gIdx] ?? 0) as WangEdgeColor, w = (westArr[gIdx] ?? 0) as WangEdgeColor;
      const tileId = tileGridIds[gIdx] ?? 0;

      let rgb: RgbTuple;
      const dBorder = Math.min(u, 1 - u, v, 1 - v);
      if (dBorder <= 1e-6) {
        if (ly === 0) rgb = sampleCanonicalWangEdge(preset, n, u, pal);
        else if (ly === tileSizePx - 1) rgb = sampleCanonicalWangEdge(preset, s, u, pal);
        else if (lx === 0) rgb = sampleCanonicalWangEdge(preset, w, v, pal);
        else rgb = sampleCanonicalWangEdge(preset, e, v, pal);
      } else {
        const wn = 1 / Math.max(1e-4, v), ws = 1 / Math.max(1e-4, 1 - v);
        const ww = 1 / Math.max(1e-4, u), we = 1 / Math.max(1e-4, 1 - u);
        const wSum = wn + ws + ww + we;
        const cn = sampleCanonicalWangEdge(preset, n, u, pal), cs = sampleCanonicalWangEdge(preset, s, u, pal);
        const cw = sampleCanonicalWangEdge(preset, w, v, pal), ce = sampleCanonicalWangEdge(preset, e, v, pal);
        const edgeField: RgbTuple = [
          (cn[0] * wn + cs[0] * ws + cw[0] * ww + ce[0] * we) / wSum,
          (cn[1] * wn + cs[1] * ws + cw[1] * ww + ce[1] * we) / wSum,
          (cn[2] * wn + cs[2] * ws + cw[2] * ww + ce[2] * we) / wSum,
        ];
        const interior = sampleInteriorMotif(preset, tileId, u, v, hashGrid32(seed, gx, gy, 0x91), pal, input.seedTile0Rgba, input.seedTile1Rgba, seedSize);
        const sT = clamp(dBorder / 0.30, 0, 1);
        rgb = mixRgb(edgeField, interior, sT * sT * (3 - 2 * sT));
      }

      const outIdx = (py * widthPx + px) * 4;
      rgba[outIdx] = Math.round(clamp(rgb[0], 0, 255));
      rgba[outIdx + 1] = Math.round(clamp(rgb[1], 0, 255));
      rgba[outIdx + 2] = Math.round(clamp(rgb[2], 0, 255));
      rgba[outIdx + 3] = 255;
    }
  }

  let seamEdgeMismatchCount = 0, maxSeamPixelDelta = 0, nonIdenticalNeighbors = 0, neighborPairs = 0;
  for (let gy = 0; gy < gridRows; gy += 1) {
    for (let gx = 0; gx < gridCols; gx += 1) {
      const cur = gy * gridCols + gx, curId = tileGridIds[cur];
      if (gx + 1 < gridCols) {
        neighborPairs += 1;
        if (eastArr[cur] !== westArr[cur + 1]) seamEdgeMismatchCount += 1;
        if (curId !== tileGridIds[cur + 1]) nonIdenticalNeighbors += 1;
      }
      if (gy + 1 < gridRows) {
        neighborPairs += 1;
        if (southArr[cur] !== northArr[(gy + 1) * gridCols + gx]) seamEdgeMismatchCount += 1;
        if (curId !== tileGridIds[(gy + 1) * gridCols + gx]) nonIdenticalNeighbors += 1;
      }
    }
  }
  for (let gx = 1; gx * tileSizePx < widthPx; gx += 1) {
    const xRight = gx * tileSizePx - 1, xLeft = gx * tileSizePx;
    for (let py = 0; py < heightPx; py += 1) {
      const d = maxRgbPixelDiff(rgba, (py * widthPx + xRight) * 4, (py * widthPx + xLeft) * 4);
      if (d > maxSeamPixelDelta) maxSeamPixelDelta = d;
    }
  }
  for (let gy = 1; gy * tileSizePx < heightPx; gy += 1) {
    const yBot = gy * tileSizePx - 1, yTop = gy * tileSizePx;
    for (let px = 0; px < widthPx; px += 1) {
      const d = maxRgbPixelDiff(rgba, (yBot * widthPx + px) * 4, (yTop * widthPx + px) * 4);
      if (d > maxSeamPixelDelta) maxSeamPixelDelta = d;
    }
  }

  return {
    widthPx, heightPx, tileSizePx, gridCols, gridRows, preset, rgba, tileGridIds,
    seamEdgeMismatchCount, maxSeamPixelDelta,
    aperiodicDiversityRatio: neighborPairs > 0 ? roundTo(nonIdenticalNeighbors / neighborPairs, 4) : 1,
    serverCostKrw: 0,
  };
}

const DEFAULT_LOCKED_INK_RULES: readonly LockedInkLayerRule[] = Object.freeze([
  { layerRole: "vector-main-ink", layerLabelKo: "주선화 벡터 레이어", locked: true, alphaLock: true, clipToFlatMask: false, antiAliasing: "binary-aliased", instructionKo: "주선화 원본 수정·지우개 금지. 선 색 변경은 색선(Color-Hold) 클리핑 레이어에서만 수행." },
  { layerRole: "color-hold-ink", layerLabelKo: "색선(Color-Hold) 레이어", locked: false, alphaLock: true, clipToFlatMask: false, antiAliasing: "smooth", instructionKo: "주선화 상단 클리핑 상태 유지. 역광 경계와 속눈썹·머리카락 끝단만 지정 색으로 칠함." },
  { layerRole: "base-flat-mask", layerLabelKo: "밑색 분리 마스크", locked: true, alphaLock: true, clipToFlatMask: false, antiAliasing: "binary-aliased", instructionKo: "안티앨리어싱 없는 칼분리 밑색 유지. 틈새 빈 픽셀 0건 확인 후 잠금 유지." },
  { layerRole: "cel-shadow-1", layerLabelKo: "1단 셀 명암 레이어", locked: false, alphaLock: false, clipToFlatMask: true, antiAliasing: "smooth", instructionKo: "밑색 마스크 클리핑 필수. 주광원 화살표 반대 방향으로 1단 그림자 스와치 적용." },
  { layerRole: "rim-highlight", layerLabelKo: "하이라이트·림라이트 레이어", locked: false, alphaLock: false, clipToFlatMask: true, antiAliasing: "smooth", instructionKo: "주광원 입사 모서리에만 제한적으로 하이라이트 스와치 배치." },
]);

function describeAzimuthKo(azimuthDeg: number): string {
  const a = ((azimuthDeg % 360) + 360) % 360;
  const dirs = ["상단 정면", "우상단", "우측면", "우하단", "하단 역광", "좌하단", "좌측면", "좌상단"];
  return dirs[Math.floor(((a + 22.5) % 360) / 45)] ?? "상단 정면";
}

/** 채색 어시스턴트 인계용 부위별 컬러키(HEX+OKLCH+명암 쌍)·선화 잠금 규칙·주광원 지정서를 생성한다. */
export function generateAssistantHandoffSpecSheet(input: AssistantHandoffSpecInput): AssistantHandoffSpecSheet {
  const azimuthDeg = roundTo(((input.primaryLight.azimuthDeg % 360) + 360) % 360, 2);
  const elevationDeg = roundTo(clamp(input.primaryLight.elevationDeg, 0, 90), 2);
  const colorTempKelvin = Math.round(clamp(input.primaryLight.colorTempKelvin ?? 5600, 2000, 12000));
  const intensity = roundTo(clamp(input.primaryLight.intensity ?? 1.0, 0.1, 2.5), 2);

  const azRad = (azimuthDeg * Math.PI) / 180, elRad = (elevationDeg * Math.PI) / 180;
  const cosEl = Math.cos(elRad);
  const lx = roundTo(Math.sin(azRad) * cosEl, 4), ly = roundTo(-Math.cos(azRad) * cosEl, 4), lz = roundTo(Math.sin(elRad), 4);

  const arrowLen = Math.max(12, 38 * cosEl);
  const dirX = -Math.sin(azRad), dirY = Math.cos(azRad);
  const origin: Point2DVec = { x: roundTo(50 - dirX * arrowLen * 0.5, 2), y: roundTo(50 - dirY * arrowLen * 0.5, 2) };
  const tip: Point2DVec = { x: roundTo(50 + dirX * arrowLen * 0.5, 2), y: roundTo(50 + dirY * arrowLen * 0.5, 2) };
  const wingLeft: Point2DVec = { x: roundTo(tip.x - dirX * 7 - dirY * 4.5, 2), y: roundTo(tip.y - dirY * 7 + dirX * 4.5, 2) };
  const wingRight: Point2DVec = { x: roundTo(tip.x - dirX * 7 + dirY * 4.5, 2), y: roundTo(tip.y - dirY * 7 - dirX * 4.5, 2) };
  const shadowCastVector: Point2DVec = { x: roundTo(dirX, 4), y: roundTo(dirY, 4) };
  const directionSummaryKo = `${describeAzimuthKo(azimuthDeg)} 주광 (방위각 ${azimuthDeg}°, 고도각 ${elevationDeg}°, ${colorTempKelvin}K)`;

  const warmBias = clamp((5600 - colorTempKelvin) / 3600, -1, 1);
  const characterSwatches: CharacterHandoffPalette[] = input.characters.map((ch) => ({
    characterId: ch.characterId,
    characterNameKo: ch.characterNameKo,
    regions: ch.regions.map((reg) => {
      const finish: MaterialSurfaceFinish = reg.materialFinish ?? "matte";
      const blend: ShadingLayerBlendMode = reg.shadingBlendMode ?? "multiply";
      const baseRgb = parseHexColorToRgb(reg.baseHex);
      const baseHex = rgbToHex(baseRgb[0], baseRgb[1], baseRgb[2]);
      const baseOklch = rgbToOklch(baseRgb[0], baseRgb[1], baseRgb[2]);

      const shDrop = finish === "metal" ? 0.24 : finish === "skin" ? 0.14 : 0.18;
      const hiLift = (finish === "metal" || finish === "hair-aniso" ? 0.20 : 0.13) * clamp(intensity, 0.6, 1.4);
      const shRgb = reg.shadowHex
        ? parseHexColorToRgb(reg.shadowHex, baseRgb)
        : oklchToRgb(clamp(baseOklch.l - shDrop, 0.06, 0.92), clamp(baseOklch.c * 1.08 + 0.012, 0, 0.32), baseOklch.hDeg + (warmBias >= 0 ? -14 : 10));
      const hiRgb = reg.highlightHex
        ? parseHexColorToRgb(reg.highlightHex, baseRgb)
        : oklchToRgb(clamp(baseOklch.l + hiLift, 0.12, 0.98), clamp(baseOklch.c * 0.85, 0, 0.30), baseOklch.hDeg + (warmBias >= 0 ? 8 : -8));

      const shadowHex = rgbToHex(shRgb[0], shRgb[1], shRgb[2]), shadowOklch = rgbToOklch(shRgb[0], shRgb[1], shRgb[2]);
      const highlightHex = rgbToHex(hiRgb[0], hiRgb[1], hiRgb[2]), highlightOklch = rgbToOklch(hiRgb[0], hiRgb[1], hiRgb[2]);
      return {
        regionId: reg.regionId, regionLabelKo: reg.regionLabelKo, materialFinish: finish, shadingBlendMode: blend,
        baseHex, baseOklch, shadowHex, shadowOklch, shadowDeltaL: roundTo(shadowOklch.l - baseOklch.l, 4),
        highlightHex, highlightOklch, highlightDeltaL: roundTo(highlightOklch.l - baseOklch.l, 4),
      };
    }),
  }));

  const ruleMap = new Map<string, LockedInkLayerRule>();
  for (const r of DEFAULT_LOCKED_INK_RULES) ruleMap.set(r.layerRole, r);
  for (const r of input.customInkRules ?? []) ruleMap.set(r.layerRole, r);
  const lockedInkLayerRules = [...ruleMap.values()];

  const specDigestHex = fnv1aHex(JSON.stringify({
    p: input.projectId, ep: input.episodeNumber, sc: input.sceneTitleKo,
    lt: [azimuthDeg, elevationDeg, colorTempKelvin, intensity],
    ch: characterSwatches.map((c) => [c.characterId, c.regions.map((r) => [r.regionId, r.baseHex, r.shadowHex, r.highlightHex])]),
    rl: lockedInkLayerRules.map((r) => [r.layerRole, r.locked, r.alphaLock, r.clipToFlatMask]),
  }));

  const lines: string[] = [
    `[${input.projectId}] ${input.episodeNumber}화 채색 인계 지정서 — ${input.sceneTitleKo}`,
    `- 주광원: ${directionSummaryKo}`,
    `- 무결성 요약 해시: ${specDigestHex}`,
  ];
  for (const ch of characterSwatches) {
    lines.push(`[캐릭터] ${ch.characterNameKo} (${ch.characterId})`);
    for (const r of ch.regions) lines.push(`- ${r.regionLabelKo}: 본색 ${r.baseHex} (OKLCH ${r.baseOklch.l}/${r.baseOklch.c}/${r.baseOklch.hDeg}°) | 그림자 ${r.shadowHex} | 하이라이트 ${r.highlightHex}`);
  }
  lines.push("[선화·마스크 잠금 수칙]");
  for (const r of lockedInkLayerRules) lines.push(`- [${r.locked ? "잠금" : "편집가능"}] ${r.layerLabelKo}: ${r.instructionKo}`);

  return {
    projectId: input.projectId, episodeNumber: input.episodeNumber, sceneTitleKo: input.sceneTitleKo,
    characterSwatches, lockedInkLayerRules,
    primaryLightArrow: { azimuthDeg, elevationDeg, colorTempKelvin, intensity, lightUnitVector3D: { x: lx, y: ly, z: lz }, compassArrow2D: { origin, tip, wingLeft, wingRight, shadowCastVector }, directionSummaryKo },
    specDigestHex, handoffMarkdownKo: lines.join(LINE_FEED), serverCostKrw: 0,
  };
}

/** 밀리미터(`mm`) 단위 트래핑 폭을 지정 해상도(`DPI`) 기준 정밀 픽셀 반경으로 환산한다. */
export function convertTrapMmToPixels(trapMm: number, dpi: number): number {
  return (trapMm / 25.4) * Math.max(72, dpi);
}

function edt1D(f: Float32Array, n: number, d: Float32Array, v: Int32Array, z: Float32Array): void {
  let k = 0;
  v[0] = 0; z[0] = -1e20; z[1] = +1e20;
  for (let q = 1; q < n; q += 1) {
    const fq = f[q] ?? 0;
    let s = 0;
    while (k >= 0) {
      const vk = v[k] ?? 0;
      s = ((fq + q * q) - ((f[vk] ?? 0) + vk * vk)) / (2 * q - 2 * vk);
      if (s > (z[k] ?? -1e20)) break;
      k -= 1;
    }
    k += 1; v[k] = q; z[k] = s; z[k + 1] = +1e20;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while ((z[k + 1] ?? 1e20) < q) k += 1;
    const vk = v[k] ?? 0, dx = q - vk;
    d[q] = dx * dx + (f[vk] ?? 0);
  }
}

function computeSquaredEdt2D(targetZeroMask: Uint8Array, w: number, h: number): Float32Array {
  const inf = 1e12, grid = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) grid[i] = (targetZeroMask[i] ?? 0) !== 0 ? 0 : inf;
  const maxDim = Math.max(w, h);
  const f = new Float32Array(maxDim), d = new Float32Array(maxDim), v = new Int32Array(maxDim), z = new Float32Array(maxDim + 1);
  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) f[y] = grid[y * w + x] ?? inf;
    edt1D(f, h, d, v, z);
    for (let y = 0; y < h; y += 1) grid[y * w + x] = d[y] ?? inf;
  }
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) f[x] = grid[row + x] ?? inf;
    edt1D(f, w, d, v, z);
    for (let x = 0; x < w; x += 1) grid[row + x] = d[x] ?? inf;
  }
  return grid;
}

function applyEuclideanTrap(binaryFg: Uint8Array, w: number, h: number, signedTrapPx: number): Uint8Array {
  const r = Math.abs(signedTrapPx), out = new Uint8Array(w * h);
  if (r < 1e-4) {
    for (let i = 0; i < w * h; i += 1) out[i] = (binaryFg[i] ?? 0) !== 0 ? 255 : 0;
    return out;
  }
  const rSq = r * r;
  if (signedTrapPx > 0) {
    let anyFg = false;
    for (let i = 0; i < w * h; i += 1) if ((binaryFg[i] ?? 0) !== 0) { anyFg = true; break; }
    if (!anyFg) return out;
    const distSq = computeSquaredEdt2D(binaryFg, w, h);
    for (let i = 0; i < w * h; i += 1) out[i] = (distSq[i] ?? 1e12) <= rSq ? 255 : 0;
    return out;
  }
  const pw = w + 2, ph = h + 2, invBg = new Uint8Array(pw * ph);
  invBg.fill(1);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) if ((binaryFg[y * w + x] ?? 0) !== 0) invBg[(y + 1) * pw + (x + 1)] = 0;
  }
  const distToBgSq = computeSquaredEdt2D(invBg, pw, ph);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) out[y * w + x] = (distToBgSq[(y + 1) * pw + (x + 1)] ?? 0) > rSq ? 255 : 0;
  }
  return out;
}

const SPOT_PLATE_LABELS_KO: Readonly<Record<SpotPlateKind, string>> = {
  "Spot-Gold": "별색 금박 판 (Spot-Gold)",
  "Spot-Silver": "별색 은박 판 (Spot-Silver)",
  "UV-Gloss": "부분 유광 에폭시 판 (UV-Gloss)",
};

/** 단행본 특별판용 별색 박(`Spot-Gold`·`Spot-Silver`)·부분 UV(`UV-Gloss`) 단색판과 트래핑 녹아웃 CMYK 판을 분리한다. */
export function separateSpecialEditionSpotPlates(input: SpotPlateSeparationInput): SpotPlateSeparationReport {
  const widthPx = Math.max(1, Math.floor(input.widthPx)), heightPx = Math.max(1, Math.floor(input.heightPx));
  const dpi = Math.max(72, Math.round(input.dpi ?? 300));
  const defaultFoilTrapMm = input.defaultFoilTrapMm ?? 0.1, defaultUvTrapMm = input.defaultUvTrapMm ?? -0.1;
  const maxTacPercent = clamp(input.maxTacPercent ?? 300, 180, 400);
  const pixelCount = widthPx * heightPx;

  const spotPlates: SeparatedSpotPlate[] = [];
  const knockoutMask = new Uint8Array(pixelCount);

  for (const kind of SPOT_PLATE_KINDS) {
    const cfg = input.plateConfigs?.[kind];
    const isUv = kind === "UV-Gloss";
    const trapMm = cfg?.trapMm ?? (isUv ? defaultUvTrapMm : defaultFoilTrapMm);
    const threshold = clamp(cfg?.thresholdByte ?? 128, 1, 255);
    const knockoutCmyk = cfg?.knockoutCmykUnderPlate ?? !isUv;
    const rawSource = input.spotMasks?.[kind];
    const rawBinary = new Uint8Array(pixelCount);
    if (rawSource) for (let i = 0; i < pixelCount; i += 1) rawBinary[i] = (rawSource[i] ?? 0) >= threshold ? 1 : 0;

    const signedPx = convertTrapMmToPixels(trapMm, dpi);
    const trapped = applyEuclideanTrap(rawBinary, widthPx, heightPx, signedPx);
    let activePixelCount = 0;
    for (let i = 0; i < pixelCount; i += 1) if ((trapped[i] ?? 0) > 0) activePixelCount += 1;

    if (knockoutCmyk && activePixelCount > 0) {
      const coreChokePx = -Math.max(Math.abs(signedPx), convertTrapMmToPixels(0.1, dpi));
      const koCore = signedPx > 0 ? rawBinary : applyEuclideanTrap(rawBinary, widthPx, heightPx, coreChokePx);
      for (let i = 0; i < pixelCount; i += 1) if ((koCore[i] ?? 0) !== 0) knockoutMask[i] = 1;
    }

    spotPlates.push({
      plateName: kind, labelKo: SPOT_PLATE_LABELS_KO[kind], widthPx, heightPx, dpi,
      trapMm: roundTo(trapMm, 4), trapRadiusPx: roundTo(Math.abs(signedPx), 4),
      trapMode: Math.abs(trapMm) < 1e-5 ? "exact" : trapMm > 0 ? "spread" : "choke",
      overprint: !knockoutCmyk, monochromeMask: trapped, activePixelCount,
      coverageRatio: roundTo(activePixelCount / pixelCount, 5),
    });
  }

  const cyan = new Uint8Array(pixelCount), magenta = new Uint8Array(pixelCount);
  const yellow = new Uint8Array(pixelCount), black = new Uint8Array(pixelCount);
  let maxObservedTacPercent = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    if ((knockoutMask[i] ?? 0) !== 0) continue;
    const idx = i * 4, alpha = (input.rgba[idx + 3] ?? 255) / 255;
    const rn = ((input.rgba[idx] ?? 255) / 255) * alpha + (1 - alpha);
    const gn = ((input.rgba[idx + 1] ?? 255) / 255) * alpha + (1 - alpha);
    const bn = ((input.rgba[idx + 2] ?? 255) / 255) * alpha + (1 - alpha);

    const kRaw = 1 - Math.max(rn, gn, bn);
    let c = 0, m = 0, y = 0, k = kRaw * 0.92;
    if (kRaw < 0.9999) {
      const denom = 1 - k;
      c = clamp((1 - rn - k) / denom, 0, 1);
      m = clamp((1 - gn - k) / denom, 0, 1);
      y = clamp((1 - bn - k) / denom, 0, 1);
    } else {
      k = 1;
    }

    const cmySum = (c + m + y) * 100, kPct = k * 100;
    if (cmySum + kPct > maxTacPercent && cmySum > 1e-4) {
      const scale = Math.max(0, maxTacPercent - kPct) / cmySum;
      c *= scale; m *= scale; y *= scale;
    }

    const cb = Math.round(clamp(c * 255, 0, 255)), mb = Math.round(clamp(m * 255, 0, 255));
    const yb = Math.round(clamp(y * 255, 0, 255)), kb = Math.round(clamp(k * 255, 0, 255));
    cyan[i] = cb; magenta[i] = mb; yellow[i] = yb; black[i] = kb;
    const tac = ((cb + mb + yb + kb) / 255) * 100;
    if (tac > maxObservedTacPercent) maxObservedTacPercent = tac;
  }

  return {
    widthPx, heightPx, dpi,
    cmykPlates: { cyan, magenta, yellow, black, maxObservedTacPercent: roundTo(maxObservedTacPercent, 2) },
    spotPlates, serverCostKrw: 0,
  };
}
