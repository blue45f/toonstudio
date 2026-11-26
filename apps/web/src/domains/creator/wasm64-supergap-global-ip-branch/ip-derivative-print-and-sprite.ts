/**
 * #35 원클릭 창작자 IP 파생 상품 패키징 스튜디오 — 인쇄 굿즈(CMYK TAC <= 300%) 및 알파 크롭 스프라이트 빌더 (₩0 로컬).
 *
 * (a) 인쇄용 CMYK(TAC <= 300%) 굿즈·아크릴 스탠디 도련(bleed) 및 칼선(die-cut) 규격
 * (b) 투명 알파 크롭 캐릭터 스탠딩 스프라이트 매니페스트(실제 RGBA 버퍼 크롭 포함)
 */

import { canonicalJsonStringify, sha256HexFromBytes, sha256HexFromText } from "./sha256-digest";

export type MerchProductKind =
  | "acrylic-standee"
  | "art-print-a4"
  | "die-cut-sticker"
  | "photocard-55x85";

export interface RgbaBufferInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface CmykColorPercent {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly tacPercent: number;
}

export interface MerchPrintOptions {
  readonly productKind?: MerchProductKind;
  readonly trimWidthMm?: number;
  readonly trimHeightMm?: number;
  readonly bleedMm?: number;
  readonly safeMarginMm?: number;
  readonly dpi?: number;
  readonly maxTacPercent?: number;
  readonly acrylicThicknessMm?: number;
  readonly dieCutOffsetMm?: number;
  readonly iccProfileName?: string;
}

export interface Point2DMm {
  readonly xMm: number;
  readonly yMm: number;
}

export interface PrintMerchSpecArtifact {
  readonly productKind: MerchProductKind;
  readonly iccProfileName: string;
  readonly dpi: number;
  readonly trimWidthMm: number;
  readonly trimHeightMm: number;
  readonly bleedMm: number;
  readonly bleedWidthMm: number;
  readonly bleedHeightMm: number;
  readonly safeMarginMm: number;
  readonly bleedCanvasWidthPx: number;
  readonly bleedCanvasHeightPx: number;
  readonly maxTacPercentLimit: number;
  readonly rawMaxTacPercent: number;
  readonly enforcedMaxTacPercent: number;
  readonly clampedPixelCount: number;
  readonly auditedOpaquePixelCount: number;
  readonly tacCompliant: boolean;
  readonly sampleSwatchesCmyk: readonly CmykColorPercent[];
  readonly acrylicSpec: {
    readonly acrylicThicknessMm: number;
    readonly whiteInkUnderbaseRequired: boolean;
    readonly whiteInkChokeMm: number;
    readonly baseSlotTabWidthMm: number;
    readonly baseSlotTabDepthMm: number;
    readonly slotClearanceToleranceMm: number;
  } | null;
  readonly dieCutOffsetMm: number;
  readonly dieCutPolygonMm: readonly Point2DMm[];
  readonly dieCutSvgPathMm: string;
  readonly artifactSha256: string;
}

export interface CharacterSpriteInput {
  readonly characterId: string;
  readonly characterName: string;
  readonly poseLabel: string;
  readonly image: RgbaBufferInput;
  readonly alphaThreshold?: number;
  readonly paddingPx?: number;
  readonly pivotMode?: "bottom-center" | "center";
}

export interface AlphaCroppedSpriteManifest {
  readonly characterId: string;
  readonly characterName: string;
  readonly poseLabel: string;
  readonly sourceWidthPx: number;
  readonly sourceHeightPx: number;
  readonly tightBoundsPx: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly cropBoundsPx: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly croppedWidthPx: number;
  readonly croppedHeightPx: number;
  readonly paddingPx: number;
  readonly premultipliedAlpha: false;
  readonly pixelFormat: "rgba8-straight-alpha";
  readonly opaquePixelCount: number;
  readonly transparentPixelCount: number;
  readonly transparencyRatio: number;
  readonly trimmedAreaSavingsRatio: number;
  readonly feetBaselineYPx: number;
  readonly normalizedPivot: { readonly x: number; readonly y: number };
  readonly isEmpty: boolean;
  readonly croppedRgba: Uint8Array;
  readonly croppedRgbaSha256: string;
  readonly artifactSha256: string;
}

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * sRGB(0..255)를 FOGRA39 리치 블랙 UCA/GCR 모델로 CMYK(%) 변환하고, TAC <= maxTacPercent 제한을 강제한다.
 */
export function convertSrgbToCmykWithTacLimit(
  r: number,
  g: number,
  b: number,
  maxTacPercent = 300,
): { readonly raw: CmykColorPercent; readonly clamped: CmykColorPercent; readonly wasClamped: boolean } {
  const rn = Math.max(0, Math.min(255, r)) / 255;
  const gn = Math.max(0, Math.min(255, g)) / 255;
  const bn = Math.max(0, Math.min(255, b)) / 255;

  const kRaw = 1 - Math.max(rn, gn, bn);
  let cPct = 0;
  let mPct = 0;
  let yPct = 0;
  const kPct = kRaw * 100;

  if (kRaw < 0.9999) {
    cPct = ((1 - rn - kRaw) / (1 - kRaw)) * 100;
    mPct = ((1 - gn - kRaw) / (1 - kRaw)) * 100;
    yPct = ((1 - bn - kRaw) / (1 - kRaw)) * 100;
  }

  // 깊은 암부(K > 55%)에서 인쇄 리치 블랙 UCA(Under-Color Addition)를 반영해 실제 과잉 잉크 위험을 포착한다.
  if (kPct > 55) {
    const shadowBoost = ((kPct - 55) / 45) * 85;
    cPct = Math.min(100, cPct + shadowBoost);
    mPct = Math.min(100, mPct + shadowBoost * 0.95);
    yPct = Math.min(100, yPct + shadowBoost * 0.9);
  }

  const rawTac = cPct + mPct + yPct + kPct;
  const raw: CmykColorPercent = {
    c: roundTo(cPct, 2),
    m: roundTo(mPct, 2),
    y: roundTo(yPct, 2),
    k: roundTo(kPct, 2),
    tacPercent: roundTo(rawTac, 2),
  };

  if (rawTac <= maxTacPercent) {
    return { raw, clamped: raw, wasClamped: false };
  }

  const clampedK = Math.min(kPct, maxTacPercent);
  const cmySum = cPct + mPct + yPct;
  const cmyBudget = Math.max(0, maxTacPercent - clampedK);
  const scale = cmySum > 1e-6 ? cmyBudget / cmySum : 0;
  const fc = roundTo(cPct * scale, 2);
  const fm = roundTo(mPct * scale, 2);
  const fy = roundTo(yPct * scale, 2);
  const fk = roundTo(clampedK, 2);
  const clampedTac = roundTo(Math.min(maxTacPercent, fc + fm + fy + fk), 2);

  return {
    raw,
    clamped: { c: fc, m: fm, y: fy, k: fk, tacPercent: clampedTac },
    wasClamped: true,
  };
}

/**
 * (a) 인쇄용 CMYK(TAC <= 300%) 굿즈/아크릴 스탠디 도련·칼선 규격을 로컬에서 생성한다.
 */
export function buildPrintMerchSpec(
  artwork: RgbaBufferInput,
  options?: MerchPrintOptions,
): PrintMerchSpecArtifact {
  const productKind: MerchProductKind = options?.productKind ?? "acrylic-standee";
  const defaultDims: Record<MerchProductKind, { readonly w: number; readonly h: number }> = {
    "acrylic-standee": { w: 100, h: 150 },
    "art-print-a4": { w: 210, h: 297 },
    "die-cut-sticker": { w: 70, h: 70 },
    "photocard-55x85": { w: 55, h: 85 },
  };
  const trimWidthMm = options?.trimWidthMm ?? defaultDims[productKind].w;
  const trimHeightMm = options?.trimHeightMm ?? defaultDims[productKind].h;
  const bleedMm = options?.bleedMm ?? 3.0;
  const safeMarginMm = options?.safeMarginMm ?? 3.0;
  const dpi = options?.dpi ?? 300;
  const maxTacPercentLimit = Math.min(300, options?.maxTacPercent ?? 300);
  const dieCutOffsetMm = options?.dieCutOffsetMm ?? (productKind === "acrylic-standee" ? 2.5 : 1.5);
  const iccProfileName = options?.iccProfileName ?? "ISO Coated v2 300% (ECI / FOGRA39)";

  const bleedWidthMm = roundTo(trimWidthMm + bleedMm * 2, 2);
  const bleedHeightMm = roundTo(trimHeightMm + bleedMm * 2, 2);
  const bleedCanvasWidthPx = Math.round((bleedWidthMm / 25.4) * dpi);
  const bleedCanvasHeightPx = Math.round((bleedHeightMm / 25.4) * dpi);

  let rawMaxTac = 0;
  let enforcedMaxTac = 0;
  let clampedPixelCount = 0;
  let auditedOpaquePixelCount = 0;
  const sampleSwatchesCmyk: CmykColorPercent[] = [];

  const totalPixels = artwork.width * artwork.height;
  const swatchStride = Math.max(1, Math.floor(totalPixels / 8));
  for (let i = 0; i < totalPixels; i += 1) {
    const base = i * 4;
    const alpha = artwork.rgba[base + 3] ?? 0;
    if (alpha < 8) {
      continue;
    }
    auditedOpaquePixelCount += 1;
    const converted = convertSrgbToCmykWithTacLimit(
      artwork.rgba[base] ?? 0,
      artwork.rgba[base + 1] ?? 0,
      artwork.rgba[base + 2] ?? 0,
      maxTacPercentLimit,
    );
    if (converted.raw.tacPercent > rawMaxTac) {
      rawMaxTac = converted.raw.tacPercent;
    }
    if (converted.clamped.tacPercent > enforcedMaxTac) {
      enforcedMaxTac = converted.clamped.tacPercent;
    }
    if (converted.wasClamped) {
      clampedPixelCount += 1;
    }
    if (sampleSwatchesCmyk.length < 8 && i % swatchStride === 0) {
      sampleSwatchesCmyk.push(converted.clamped);
    }
  }

  const acrylicThicknessMm = options?.acrylicThicknessMm ?? 3.0;
  const tabWidthMm = roundTo(Math.min(trimWidthMm * 0.42, 42), 2);
  const tabDepthMm = roundTo(acrylicThicknessMm + 1.5, 2);
  const acrylicSpec =
    productKind === "acrylic-standee"
      ? {
          acrylicThicknessMm,
          whiteInkUnderbaseRequired: true,
          whiteInkChokeMm: 0.15,
          baseSlotTabWidthMm: tabWidthMm,
          baseSlotTabDepthMm: tabDepthMm,
          slotClearanceToleranceMm: 0.15,
        }
      : null;

  const leftMm = roundTo(bleedMm - dieCutOffsetMm, 2);
  const rightMm = roundTo(bleedMm + trimWidthMm + dieCutOffsetMm, 2);
  const topMm = roundTo(bleedMm - dieCutOffsetMm, 2);
  const bottomMm = roundTo(bleedMm + trimHeightMm + dieCutOffsetMm, 2);
  const centerXMm = roundTo(bleedWidthMm * 0.5, 2);

  const dieCutPolygonMm: Point2DMm[] = acrylicSpec
    ? [
        { xMm: leftMm, yMm: topMm },
        { xMm: rightMm, yMm: topMm },
        { xMm: rightMm, yMm: bottomMm },
        { xMm: roundTo(centerXMm + tabWidthMm * 0.5, 2), yMm: bottomMm },
        { xMm: roundTo(centerXMm + tabWidthMm * 0.5, 2), yMm: roundTo(bottomMm + tabDepthMm, 2) },
        { xMm: roundTo(centerXMm - tabWidthMm * 0.5, 2), yMm: roundTo(bottomMm + tabDepthMm, 2) },
        { xMm: roundTo(centerXMm - tabWidthMm * 0.5, 2), yMm: bottomMm },
        { xMm: leftMm, yMm: bottomMm },
      ]
    : [
        { xMm: leftMm, yMm: topMm },
        { xMm: rightMm, yMm: topMm },
        { xMm: rightMm, yMm: bottomMm },
        { xMm: leftMm, yMm: bottomMm },
      ];

  const svgParts: string[] = [];
  for (let i = 0; i < dieCutPolygonMm.length; i += 1) {
    const pt = dieCutPolygonMm[i];
    svgParts.push(`${i === 0 ? "M" : "L"}${pt.xMm},${pt.yMm}`);
  }
  svgParts.push("Z");
  const dieCutSvgPathMm = svgParts.join(" ");

  const payload = {
    productKind,
    iccProfileName,
    dpi,
    trimWidthMm,
    trimHeightMm,
    bleedMm,
    bleedWidthMm,
    bleedHeightMm,
    safeMarginMm,
    bleedCanvasWidthPx,
    bleedCanvasHeightPx,
    maxTacPercentLimit,
    rawMaxTacPercent: roundTo(rawMaxTac, 2),
    enforcedMaxTacPercent: roundTo(enforcedMaxTac, 2),
    clampedPixelCount,
    auditedOpaquePixelCount,
    tacCompliant: enforcedMaxTac <= maxTacPercentLimit,
    sampleSwatchesCmyk,
    acrylicSpec,
    dieCutOffsetMm,
    dieCutPolygonMm,
    dieCutSvgPathMm,
  };

  return {
    ...payload,
    artifactSha256: sha256HexFromText(canonicalJsonStringify(payload)),
  };
}

/**
 * (b) 캐릭터 RGBA 버퍼에서 투명 외곽을 정밀 크롭하여 스탠딩 스프라이트 매니페스트를 생성한다.
 */
export function buildAlphaCroppedSpriteManifest(
  input: CharacterSpriteInput,
): AlphaCroppedSpriteManifest {
  const { width, height, rgba } = input.image;
  const alphaThreshold = input.alphaThreshold ?? 8;
  const paddingPx = Math.max(0, input.paddingPx ?? 4);
  const pivotMode = input.pivotMode ?? "bottom-center";

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = rgba[(y * width + x) * 4 + 3] ?? 0;
      if (alpha >= alphaThreshold) {
        opaquePixelCount += 1;
        if (x < minX) {
          minX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y > maxY) {
          maxY = y;
        }
      }
    }
  }

  const totalSourcePixels = Math.max(1, width * height);
  const isEmpty = maxX < minX || maxY < minY;
  const tightBoundsPx = isEmpty
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };

  const cropX = isEmpty ? 0 : Math.max(0, minX - paddingPx);
  const cropY = isEmpty ? 0 : Math.max(0, minY - paddingPx);
  const cropRight = isEmpty ? 0 : Math.min(width, maxX + 1 + paddingPx);
  const cropBottom = isEmpty ? 0 : Math.min(height, maxY + 1 + paddingPx);
  const croppedWidthPx = isEmpty ? 0 : cropRight - cropX;
  const croppedHeightPx = isEmpty ? 0 : cropBottom - cropY;

  const croppedRgba = new Uint8Array(croppedWidthPx * croppedHeightPx * 4);
  for (let row = 0; row < croppedHeightPx; row += 1) {
    const srcStart = ((cropY + row) * width + cropX) * 4;
    const dstStart = row * croppedWidthPx * 4;
    croppedRgba.set(rgba.subarray(srcStart, srcStart + croppedWidthPx * 4), dstStart);
  }

  const croppedRgbaSha256 = sha256HexFromBytes(croppedRgba);
  const croppedPixels = croppedWidthPx * croppedHeightPx;
  const trimmedAreaSavingsRatio = roundTo(1 - croppedPixels / totalSourcePixels, 4);
  const transparencyRatio = roundTo(1 - opaquePixelCount / totalSourcePixels, 4);
  const feetBaselineYPx = isEmpty ? 0 : maxY - cropY;
  const normalizedPivot =
    pivotMode === "bottom-center"
      ? {
          x: 0.5,
          y: croppedHeightPx > 0 ? roundTo((feetBaselineYPx + 1) / croppedHeightPx, 4) : 1.0,
        }
      : { x: 0.5, y: 0.5 };

  const metaForHash = {
    characterId: input.characterId,
    characterName: input.characterName,
    poseLabel: input.poseLabel,
    sourceWidthPx: width,
    sourceHeightPx: height,
    tightBoundsPx,
    cropBoundsPx: { x: cropX, y: cropY, width: croppedWidthPx, height: croppedHeightPx },
    croppedWidthPx,
    croppedHeightPx,
    paddingPx,
    premultipliedAlpha: false as const,
    pixelFormat: "rgba8-straight-alpha" as const,
    opaquePixelCount,
    transparentPixelCount: width * height - opaquePixelCount,
    transparencyRatio,
    trimmedAreaSavingsRatio,
    feetBaselineYPx,
    normalizedPivot,
    isEmpty,
    croppedRgbaSha256,
  };

  return {
    ...metaForHash,
    croppedRgba,
    artifactSha256: sha256HexFromText(canonicalJsonStringify(metaForHash)),
  };
}
