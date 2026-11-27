/**
 * Wave 37: 스포일러 안전 부분 블러 마스킹·명암 적응형 작가 서명 및 Rights BOM 저작자 표시 스탬퍼.
 *
 * - `applySpoilerSafeRegionBlur`: 대사 말풍선이나 반전 연출 영역 내부에만 인셋 페더(Hermite smoothstep)와
 *   3패스 가우시안 근사 박스/모자이크 블러를 적용하고, 지정 영역 바깥 원화는 1픽셀도 훼손하지 않고 선명하게 유지한다.
 * - `stampCreatorSignatureAndRightsFooter`: 코너 배경 패치의 상대 휘도(WCAG sRGB Luminance)를 측정해
 *   밝은 원고 위에는 짙은 먹색, 어두운 밤 장면 위에는 밝은 상아색 잉크로 작가 핸들 서명을 자동 반전 스탬핑하며,
 *   `CC-BY` 계열 또는 출처 표기 필수 에셋이 포함된 경우 하단에 간결한 Rights BOM 출처 표시줄을 함께 부착한다.
 */

import type { PixelRect, RgbaColor } from "./before-after-process-card-composer";

/** 작가 서명·출처 텍스트가 배경과 확보해야 하는 최소 WCAG 명암비(`4.5:1`). */
export const MIN_WATERMARK_WCAG_CONTRAST = 4.5 as const;
/** 서명 잉크 색상을 어두운 잉크/밝은 잉크로 자동 전환하는 배경 상대 휘도 기준점(`0.42`). */
export const SIGNATURE_LUMINANCE_INVERSION_PIVOT = 0.42 as const;
/** 스포일러 영역 기본 가우시안 근사 블러 반경(`10px`). */
export const DEFAULT_SPOILER_BLUR_RADIUS_PX = 10 as const;

export type SpoilerMaskKind = "dialogue-balloon" | "plot-twist" | "character-reveal";
export type SpoilerBlurMode = "gaussian-box" | "mosaic-gaussian";
export type SignatureCorner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type WatermarkInkScheme = "dark-on-light" | "light-on-dark";
export type RightsFooterPlacement = "overlay-bottom" | "extend-canvas";

export interface SpoilerMaskRegion extends PixelRect {
  readonly regionId: string;
  readonly kind: SpoilerMaskKind;
  readonly blurMode?: SpoilerBlurMode;
  readonly blurRadiusPx?: number;
  readonly mosaicBlockPx?: number;
  /** 영역 경계 안쪽에서 부드럽게 감쇠할 인셋 페더 폭(`px`, 기본 `6`). */
  readonly featherPx?: number;
}

export interface SpoilerRegionBlurMetric {
  readonly regionId: string;
  readonly kind: SpoilerMaskKind;
  readonly clampedRect: PixelRect;
  readonly originalLuminanceStdDev: number;
  readonly blurredLuminanceStdDev: number;
  readonly detailReductionRatio: number;
}

export interface SpoilerSafeBlurInput {
  readonly width: number;
  readonly height: number;
  readonly sourceRgba: Uint8Array | Uint8ClampedArray;
  readonly spoilerRegions: readonly SpoilerMaskRegion[];
}

export interface SpoilerSafeBlurResult {
  readonly outputRgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly blurredRegionCount: number;
  readonly modifiedPixelCount: number;
  readonly untouchedOutsidePixelCount: number;
  readonly regionMetrics: readonly SpoilerRegionBlurMetric[];
}

export interface RightsBomAssetCreditInput {
  readonly assetId: string;
  readonly title: string;
  readonly creatorName?: string;
  readonly licenseId: string;
  readonly attributionText?: string;
  readonly attributionRequired?: boolean;
}

export interface SignatureAndRightsStampInput {
  readonly width: number;
  readonly height: number;
  readonly sourceRgba: Uint8Array | Uint8ClampedArray;
  readonly creatorHandle: string;
  readonly corner?: SignatureCorner;
  /** 서명 불투명도(`0.35..1.0`, 기본 `0.85`). */
  readonly signatureOpacity?: number;
  readonly rightsBomAssets?: readonly RightsBomAssetCreditInput[];
  readonly footerPlacement?: RightsFooterPlacement;
  readonly maxAttributionChars?: number;
}

export interface SignatureAndRightsStampResult {
  readonly outputRgba: Uint8ClampedArray;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly normalizedHandle: string;
  readonly signatureRect: PixelRect;
  readonly sampledBgLuminance: number;
  readonly inkScheme: WatermarkInkScheme;
  readonly inkContrastRatio: number;
  readonly signaturePixelCount: number;
  readonly footerAttached: boolean;
  readonly attributionAssetCount: number;
  readonly attributionLine: string | null;
  readonly footerRect: PixelRect | null;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

const MINI_FONT_5X7: Readonly<Record<string, readonly number[]>> = Object.freeze({
  "@": [14, 17, 23, 21, 23, 16, 14], A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 18, 18, 12], K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31], M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17], Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31], "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 6, 8, 16, 31], "3": [30, 1, 1, 14, 1, 1, 30], "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14], "6": [14, 16, 30, 17, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8], "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 1, 14], "-": [0, 0, 0, 31, 0, 0, 0], "_": [0, 0, 0, 0, 0, 0, 31], ".": [0, 0, 0, 0, 0, 12, 12],
  ":": [0, 12, 12, 0, 12, 12, 0], ",": [0, 0, 0, 0, 12, 4, 8], "(": [2, 4, 8, 8, 8, 4, 2], ")": [8, 4, 2, 2, 2, 4, 8],
  "+": [0, 4, 4, 31, 4, 4, 0], "/": [1, 2, 2, 4, 8, 8, 16], " ": [0, 0, 0, 0, 0, 0, 0],
});

function glyphRowsForChar(ch: string): readonly number[] {
  const upper = ch.toUpperCase();
  if (MINI_FONT_5X7[upper] !== undefined) return MINI_FONT_5X7[upper];
  if (ch === "·") return [0, 0, 0, 4, 0, 0, 0];
  const code = ch.codePointAt(0) ?? 63;
  return [31, 17 | ((code & 3) << 1), 16 | ((code >> 2) & 15), 31, 16 | ((code >> 6) & 15), 17 | ((code >> 10) & 14), 31];
}

function srgb8ToLinear(channel8: number): number {
  const v = clamp(channel8, 0, 255) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** sRGB 8비트 픽셀의 WCAG 2.1 상대 휘도(`0..1`)를 계산한다. */
export function computePixelRelativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgb8ToLinear(r) + 0.7152 * srgb8ToLinear(g) + 0.0722 * srgb8ToLinear(b);
}

/** 두 상대 휘도 값 사이의 WCAG 명암비(`1..21`)를 계산한다. */
export function computeWcagContrastRatio(lumA: number, lumB: number): number {
  return (Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05);
}

function blendRgbaOver(buf: Uint8ClampedArray, offset: number, fg: RgbaColor): void {
  const alpha = clamp(fg.a, 0, 255) / 255;
  if (alpha <= 0) return;
  const dstA = (buf[offset + 3] ?? 255) / 255;
  const outA = alpha + dstA * (1 - alpha);
  const inv = 1 - alpha;
  buf[offset] = Math.round((fg.r * alpha + (buf[offset] ?? 0) * dstA * inv) / Math.max(1e-6, outA));
  buf[offset + 1] = Math.round((fg.g * alpha + (buf[offset + 1] ?? 0) * dstA * inv) / Math.max(1e-6, outA));
  buf[offset + 2] = Math.round((fg.b * alpha + (buf[offset + 2] ?? 0) * dstA * inv) / Math.max(1e-6, outA));
  buf[offset + 3] = Math.round(outA * 255);
}

function boxBlurSubBuffer1D(src: Float32Array, dst: Float32Array, w: number, h: number, radius: number, horizontal: boolean): void {
  const diam = radius * 2 + 1;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sx = horizontal ? clamp(x + k, 0, w - 1) : x;
        const sy = horizontal ? y : clamp(y + k, 0, h - 1);
        const idx = (sy * w + sx) * 4;
        sr += src[idx] ?? 0;
        sg += src[idx + 1] ?? 0;
        sb += src[idx + 2] ?? 0;
        sa += src[idx + 3] ?? 255;
      }
      const outIdx = (y * w + x) * 4;
      dst[outIdx] = sr / diam;
      dst[outIdx + 1] = sg / diam;
      dst[outIdx + 2] = sb / diam;
      dst[outIdx + 3] = sa / diam;
    }
  }
}

function computePatchLuminanceStdDev(buf: Uint8Array | Uint8ClampedArray, strideW: number, rect: PixelRect): number {
  const count = rect.width * rect.height;
  if (count <= 1) return 0;
  let sum = 0;
  const lums = new Float32Array(count);
  let i = 0;
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const off = (y * strideW + x) * 4;
      const lum = computePixelRelativeLuminance(buf[off] ?? 0, buf[off + 1] ?? 0, buf[off + 2] ?? 0);
      lums[i] = lum;
      sum += lum;
      i += 1;
    }
  }
  const mean = sum / count;
  let sq = 0;
  for (let idx = 0; idx < count; idx += 1) {
    const diff = (lums[idx] ?? 0) - mean;
    sq += diff * diff;
  }
  return Math.sqrt(sq / count);
}

/**
 * 스포일러 말풍선·반전 영역 내부만 선택적으로 인셋 페더 블러/모자이크 처리하고 외부 원화를 100% 보존한다.
 */
export function applySpoilerSafeRegionBlur(input: SpoilerSafeBlurInput): SpoilerSafeBlurResult {
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1) {
    throw new RangeError("캔버스 크기(width, height)는 1px 이상의 정수여야 합니다.");
  }
  const expectedBytes = input.width * input.height * 4;
  if (input.sourceRgba.length < expectedBytes) {
    throw new RangeError(`원본 RGBA 버퍼 길이가 부족합니다(필요: ${expectedBytes}바이트).`);
  }

  const { width, height, sourceRgba } = input;
  const outputRgba = new Uint8ClampedArray(expectedBytes);
  outputRgba.set(sourceRgba.subarray(0, expectedBytes));
  const insideMask = new Uint8Array(width * height);
  const regionMetrics: SpoilerRegionBlurMetric[] = [];

  for (const region of input.spoilerRegions) {
    const x0 = clamp(Math.floor(region.x), 0, width);
    const y0 = clamp(Math.floor(region.y), 0, height);
    const x1 = clamp(Math.ceil(region.x + region.width), 0, width);
    const y1 = clamp(Math.ceil(region.y + region.height), 0, height);
    const subW = x1 - x0;
    const subH = y1 - y0;
    if (subW < 2 || subH < 2) continue;

    const clampedRect: PixelRect = { x: x0, y: y0, width: subW, height: subH };
    const maxSafeFeather = Math.max(0, Math.floor(Math.min(subW, subH) * 0.35));
    const featherPx = clamp(Math.round(region.featherPx ?? 6), 0, maxSafeFeather);
    const coreRect: PixelRect = {
      x: x0 + featherPx,
      y: y0 + featherPx,
      width: Math.max(1, subW - featherPx * 2),
      height: Math.max(1, subH - featherPx * 2),
    };
    const origStdDev = computePatchLuminanceStdDev(outputRgba, width, coreRect);
    const bufA = new Float32Array(subW * subH * 4);
    const bufB = new Float32Array(subW * subH * 4);

    for (let ly = 0; ly < subH; ly += 1) {
      for (let lx = 0; lx < subW; lx += 1) {
        const srcOff = ((y0 + ly) * width + (x0 + lx)) * 4;
        const dstOff = (ly * subW + lx) * 4;
        bufA[dstOff] = outputRgba[srcOff] ?? 0;
        bufA[dstOff + 1] = outputRgba[srcOff + 1] ?? 0;
        bufA[dstOff + 2] = outputRgba[srcOff + 2] ?? 0;
        bufA[dstOff + 3] = outputRgba[srcOff + 3] ?? 255;
      }
    }

    const mode = region.blurMode ?? "gaussian-box";
    const blockPx = mode === "mosaic-gaussian" ? clamp(Math.round(region.mosaicBlockPx ?? 8), 2, 32) : 1;
    if (blockPx > 1) {
      for (let by = 0; by < subH; by += blockPx) {
        for (let bx = 0; bx < subW; bx += blockPx) {
          const bw = Math.min(blockPx, subW - bx);
          const bh = Math.min(blockPx, subH - by);
          let sr = 0;
          let sg = 0;
          let sb = 0;
          let sa = 0;
          for (let yy = 0; yy < bh; yy += 1) {
            for (let xx = 0; xx < bw; xx += 1) {
              const off = ((by + yy) * subW + (bx + xx)) * 4;
              sr += bufA[off] ?? 0;
              sg += bufA[off + 1] ?? 0;
              sb += bufA[off + 2] ?? 0;
              sa += bufA[off + 3] ?? 255;
            }
          }
          const area = bw * bh;
          for (let yy = 0; yy < bh; yy += 1) {
            for (let xx = 0; xx < bw; xx += 1) {
              const off = ((by + yy) * subW + (bx + xx)) * 4;
              bufA[off] = sr / area;
              bufA[off + 1] = sg / area;
              bufA[off + 2] = sb / area;
              bufA[off + 3] = sa / area;
            }
          }
        }
      }
    }

    const radius = clamp(Math.round(region.blurRadiusPx ?? DEFAULT_SPOILER_BLUR_RADIUS_PX), 2, 48);
    for (let pass = 0; pass < 3; pass += 1) {
      boxBlurSubBuffer1D(bufA, bufB, subW, subH, radius, true);
      boxBlurSubBuffer1D(bufB, bufA, subW, subH, radius, false);
    }

    for (let ly = 0; ly < subH; ly += 1) {
      for (let lx = 0; lx < subW; lx += 1) {
        const edgeDist = Math.min(lx, subW - 1 - lx, ly, subH - 1 - ly);
        const t = featherPx <= 0 || edgeDist >= featherPx ? 1 : (edgeDist + 1) / (featherPx + 1);
        const weight = t * t * (3 - 2 * t);
        const canvasIdx = (y0 + ly) * width + (x0 + lx);
        insideMask[canvasIdx] = 1;
        const dstOff = canvasIdx * 4;
        const blurOff = (ly * subW + lx) * 4;
        outputRgba[dstOff] = Math.round((outputRgba[dstOff] ?? 0) * (1 - weight) + (bufA[blurOff] ?? 0) * weight);
        outputRgba[dstOff + 1] = Math.round((outputRgba[dstOff + 1] ?? 0) * (1 - weight) + (bufA[blurOff + 1] ?? 0) * weight);
        outputRgba[dstOff + 2] = Math.round((outputRgba[dstOff + 2] ?? 0) * (1 - weight) + (bufA[blurOff + 2] ?? 0) * weight);
        outputRgba[dstOff + 3] = Math.round((outputRgba[dstOff + 3] ?? 255) * (1 - weight) + (bufA[blurOff + 3] ?? 255) * weight);
      }
    }

    const blurredStdDev = computePatchLuminanceStdDev(outputRgba, width, coreRect);
    const reduction = origStdDev > 1e-6 ? clamp(1 - blurredStdDev / origStdDev, 0, 1) : 0;
    regionMetrics.push({
      regionId: region.regionId,
      kind: region.kind,
      clampedRect,
      originalLuminanceStdDev: Math.round(origStdDev * 10_000) / 10_000,
      blurredLuminanceStdDev: Math.round(blurredStdDev * 10_000) / 10_000,
      detailReductionRatio: Math.round(reduction * 10_000) / 10_000,
    });
  }

  let modifiedPixelCount = 0;
  let untouchedOutsidePixelCount = 0;
  for (let idx = 0; idx < width * height; idx += 1) {
    const off = idx * 4;
    const changed =
      outputRgba[off] !== sourceRgba[off]
      || outputRgba[off + 1] !== sourceRgba[off + 1]
      || outputRgba[off + 2] !== sourceRgba[off + 2]
      || outputRgba[off + 3] !== sourceRgba[off + 3];
    if (changed) modifiedPixelCount += 1;
    if (insideMask[idx] === 0 && !changed) untouchedOutsidePixelCount += 1;
  }

  return {
    outputRgba,
    width,
    height,
    blurredRegionCount: regionMetrics.length,
    modifiedPixelCount,
    untouchedOutsidePixelCount,
    regionMetrics,
  };
}

/** CC-BY 계열 라이선스이거나 출처 표기가 명시적으로 요구되는 에셋인지 판정한다. */
export function isAttributionRequiredAsset(asset: RightsBomAssetCreditInput): boolean {
  if (asset.attributionRequired === true) return true;
  if (asset.attributionRequired === false) return false;
  return /^cc-by(\b|-)/iu.test(asset.licenseId.trim());
}

/** Rights BOM 목록에서 출처 표기 대상 에셋만 추려 한 줄 요약 문구를 생성한다. */
export function formatRightsBomAttributionLine(
  assets: readonly RightsBomAssetCreditInput[],
  maxChars = 96,
): { readonly line: string | null; readonly count: number } {
  const seen = new Set<string>();
  const required: RightsBomAssetCreditInput[] = [];
  for (const asset of assets) {
    if (!isAttributionRequiredAsset(asset) || seen.has(asset.assetId)) continue;
    seen.add(asset.assetId);
    required.push(asset);
  }
  if (required.length === 0) return { line: null, count: 0 };

  const credits = required.map((a) => {
    const custom = a.attributionText?.trim();
    if (custom) return custom;
    const creator = a.creatorName?.trim();
    return creator ? `${a.title.trim()} (${creator})` : a.title.trim();
  });

  const prefix = "Rights BOM · CC-BY: ";
  const full = `${prefix}${credits.join(", ")}`;
  if (full.length <= maxChars) return { line: full, count: required.length };

  let acc = `${prefix}${credits[0] ?? "Asset"}`;
  let included = 1;
  for (let i = 1; i < credits.length; i += 1) {
    const candidate = `${acc}, ${credits[i]}`;
    const suffix = ` +${credits.length - (i + 1)}`;
    if (candidate.length + suffix.length > maxChars) break;
    acc = candidate;
    included += 1;
  }
  const remaining = credits.length - included;
  const compact = remaining > 0 ? `${acc} +${remaining}` : acc;
  return { line: compact.slice(0, Math.max(24, maxChars)), count: required.length };
}

function stampBitmapString(
  buf: Uint8ClampedArray,
  strideW: number,
  canvasH: number,
  text: string,
  startX: number,
  startY: number,
  color: RgbaColor,
): number {
  let stamped = 0;
  for (let i = 0; i < text.length; i += 1) {
    const gx = startX + i * 6;
    if (gx + 5 > strideW) break;
    const rows = glyphRowsForChar(text[i] ?? " ");
    for (let ry = 0; ry < 7; ry += 1) {
      const py = startY + ry;
      if (py < 0 || py >= canvasH) continue;
      const mask = rows[ry] ?? 0;
      for (let rx = 0; rx < 5; rx += 1) {
        if ((mask & (1 << (4 - rx))) !== 0) {
          blendRgbaOver(buf, (py * strideW + (gx + rx)) * 4, color);
          stamped += 1;
        }
      }
    }
  }
  return stamped;
}

/**
 * 코너 배경 휘도를 측정해 자동 명암 반전된 작가 서명을 찍고, CC-BY 에셋 존재 시 Rights BOM 푸터를 부착한다.
 */
export function stampCreatorSignatureAndRightsFooter(
  input: SignatureAndRightsStampInput,
): SignatureAndRightsStampResult {
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 16 || input.height < 16) {
    throw new RangeError("워터마크 스탬핑 대상 해상도는 최소 16x16px 이상의 정수여야 합니다.");
  }
  const srcBytes = input.width * input.height * 4;
  if (input.sourceRgba.length < srcBytes) {
    throw new RangeError(`원본 RGBA 버퍼 길이가 부족합니다(필요: ${srcBytes}바이트).`);
  }

  const rawHandle = input.creatorHandle.trim() || "@creator";
  const normalizedHandle = rawHandle.startsWith("@") ? rawHandle : `@${rawHandle}`;
  const { line: attributionLine, count: attributionAssetCount } = formatRightsBomAttributionLine(
    input.rightsBomAssets ?? [],
    input.maxAttributionChars ?? 96,
  );
  const footerAttached = attributionLine !== null;
  const placement = input.footerPlacement ?? "overlay-bottom";
  const footerHeight = footerAttached ? clamp(Math.round(input.height * 0.03), 15, 28) : 0;
  const outputWidth = input.width;
  const outputHeight = footerAttached && placement === "extend-canvas" ? input.height + footerHeight : input.height;

  const outputRgba = new Uint8ClampedArray(outputWidth * outputHeight * 4);
  outputRgba.set(input.sourceRgba.subarray(0, srcBytes));

  let footerRect: PixelRect | null = null;
  if (footerAttached && attributionLine !== null) {
    const fy = outputHeight - footerHeight;
    footerRect = { x: 0, y: fy, width: outputWidth, height: footerHeight };
    const barBg: RgbaColor = { r: 18, g: 22, b: 27, a: placement === "extend-canvas" ? 255 : 228 };
    const barFg: RgbaColor = { r: 246, g: 244, b: 238, a: 255 };
    for (let y = fy; y < outputHeight; y += 1) {
      for (let x = 0; x < outputWidth; x += 1) {
        blendRgbaOver(outputRgba, (y * outputWidth + x) * 4, barBg);
      }
    }
    const textY = fy + Math.max(2, Math.floor((footerHeight - 7) / 2));
    stampBitmapString(outputRgba, outputWidth, outputHeight, attributionLine, 6, textY, barFg);
  }

  const padX = 4;
  const padY = 3;
  const margin = Math.max(4, Math.min(14, Math.floor(Math.min(input.width, input.height) * 0.035)));
  const maxCharsFit = Math.max(2, Math.floor((outputWidth - margin * 2 - padX * 2) / 6));
  const renderedHandle = normalizedHandle.slice(0, maxCharsFit);
  const sigW = Math.min(outputWidth - margin * 2, renderedHandle.length * 6 - 1 + padX * 2);
  const sigH = 7 + padY * 2;
  const corner = input.corner ?? "bottom-right";
  const bottomLimitY = footerRect !== null && placement === "overlay-bottom" ? footerRect.y - margin : outputHeight - margin;
  const sigX = corner.endsWith("right") ? Math.max(0, outputWidth - margin - sigW) : margin;
  const sigY = corner.startsWith("bottom") ? Math.max(0, bottomLimitY - sigH) : margin;
  const signatureRect: PixelRect = { x: sigX, y: sigY, width: sigW, height: sigH };

  let lumSum = 0;
  let lumCount = 0;
  for (let y = sigY; y < sigY + sigH; y += 1) {
    for (let x = sigX; x < sigX + sigW; x += 1) {
      const off = (y * outputWidth + x) * 4;
      lumSum += computePixelRelativeLuminance(outputRgba[off] ?? 0, outputRgba[off + 1] ?? 0, outputRgba[off + 2] ?? 0);
      lumCount += 1;
    }
  }
  const sampledBgLuminance = lumCount > 0 ? lumSum / lumCount : 0.5;
  const inkScheme: WatermarkInkScheme =
    sampledBgLuminance >= SIGNATURE_LUMINANCE_INVERSION_PIVOT ? "dark-on-light" : "light-on-dark";
  const opacity = clamp(input.signatureOpacity ?? 0.88, 0.35, 1);

  const backingColor: RgbaColor =
    inkScheme === "dark-on-light"
      ? { r: 250, g: 248, b: 243, a: Math.round(opacity * 175) }
      : { r: 16, g: 20, b: 25, a: Math.round(opacity * 175) };
  const inkColor: RgbaColor =
    inkScheme === "dark-on-light"
      ? { r: 18, g: 22, b: 26, a: Math.round(opacity * 255) }
      : { r: 248, g: 246, b: 240, a: Math.round(opacity * 255) };

  for (let y = sigY; y < sigY + sigH; y += 1) {
    for (let x = sigX; x < sigX + sigW; x += 1) {
      blendRgbaOver(outputRgba, (y * outputWidth + x) * 4, backingColor);
    }
  }

  const signaturePixelCount = stampBitmapString(
    outputRgba,
    outputWidth,
    outputHeight,
    renderedHandle,
    sigX + padX,
    sigY + padY,
    inkColor,
  );
  const inkLum = computePixelRelativeLuminance(inkColor.r, inkColor.g, inkColor.b);
  const inkContrastRatio = Math.round(computeWcagContrastRatio(inkLum, sampledBgLuminance) * 100) / 100;

  return {
    outputRgba,
    outputWidth,
    outputHeight,
    normalizedHandle,
    signatureRect,
    sampledBgLuminance: Math.round(sampledBgLuminance * 10_000) / 10_000,
    inkScheme,
    inkContrastRatio,
    signaturePixelCount,
    footerAttached,
    attributionAssetCount,
    attributionLine,
    footerRect,
  };
}
