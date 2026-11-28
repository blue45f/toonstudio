/**
 * Wave 85 — 웹툰 IP 굿즈 인쇄 규격 템플릿, CMYK 잉크량(TAC) 패킹 및 24fps 심리스 이모티콘 루프 합성기.
 *
 * - `MERCH_PRODUCT_TEMPLATES`: 리무버블 칼선 비닐 스티커, 투명 아크릴 키링(3.2mm 타공),
 *   아크릴 스탠드(하단 28×4mm ±0.15mm 탭), 55×85mm 포토카드(3mm 라운드·2mm 도련),
 *   메신저 움직이는 이모티콘 팩(카카오톡·라인·디스코드) 실무 표준 규격.
 * - `convertSrgbToCmyk` / `evaluateCmykPrintReadiness`: GCR 기반 CMYK 분판 및 총잉크량(TAC 300%) 제한 검사.
 * - `synthesizeSeamlessEmoticonLoop`: 정수 고조파 푸리에 기저로 C1 연속성(위치·스케일·회전·속도 완전 일치)을
 *   보장하는 24fps 결정적 이모티콘 키프레임 및 `prefersReducedMotion` 저자극 폴백 생성.
 */

import { mmToPx, pointsToSvgPath, type BoundingBox2D, type Point2D } from "./alpha-matte-and-diecut-offset-solver";

export type MerchProductType =
  | "diecut-vinyl-sticker"
  | "acrylic-keyring-charm"
  | "acrylic-standee-set"
  | "collectible-photocard"
  | "messenger-emoticon-pack";

export type EmoticonPlatformId = "kakaotalk" | "line" | "discord";

export type EmoticonMotionPreset =
  | "bounce-cheer" | "sparkle-wink" | "rage-shake" | "heart-float"
  | "sweat-panic" | "bow-thanks" | "gentle-fade-pulse";

export interface KeyringHoleTemplateSpec {
  readonly diameterMm: number; readonly minWallThicknessMm: number;
}
export interface StandeeTabTemplateSpec {
  readonly widthMm: number; readonly heightMm: number; readonly slotToleranceMm: number;
  readonly basePlateDiameterMm: number; readonly acrylicThicknessMm: number;
}
export interface MerchProductTemplateSpec {
  readonly productType: MerchProductType; readonly labelKo: string;
  readonly maxWidthMm: number; readonly maxHeightMm: number; readonly dpi: number;
  readonly dieCutOffsetMm: number; readonly bleedMm: number; readonly cornerRadiusMm: number;
  readonly colorMode: "CMYK+CutContour" | "CMYK+Spot_White+CutContour" | "CMYK+HoloFoil" | "sRGB+Alpha";
  readonly maxTotalInkLimitPercent: number; readonly requiresWhiteUnderbase: boolean;
  readonly defaultWhiteChokePx: number;
  readonly keyringHoleSpec: KeyringHoleTemplateSpec | null;
  readonly standeeTabSpec: StandeeTabTemplateSpec | null;
  readonly supportsDoubleSided: boolean; readonly supportsHoloFoilMask: boolean;
  readonly spotLayers: readonly string[]; readonly printSubstrateKo: string;
}
export interface EmoticonPlatformSpec {
  readonly platform: EmoticonPlatformId; readonly labelKo: string;
  readonly widthPx: number; readonly heightPx: number; readonly fps: number;
  readonly minFrames: number; readonly maxFrames: number; readonly defaultFrameCount: number;
  readonly maxFileSizeKb: number; readonly minTransparentPaddingPx: number;
  readonly supportedFormats: readonly ("webp" | "apng" | "png-sequence")[];
}
export interface CmykColorSample {
  readonly c: number; readonly m: number; readonly y: number; readonly k: number;
  readonly totalInkPercent: number; readonly tacClamped: boolean;
}
export interface CmykPrintReadinessReport {
  readonly colorProfileName: string; readonly maxTotalInkLimitPercent: number;
  readonly sampledOpaquePixels: number; readonly peakOriginalTacPercent: number;
  readonly peakClampedTacPercent: number; readonly tacExceededPixelRatio: number;
  readonly outOfGamutNeonRatio: number; readonly passed: boolean;
  readonly warningsKo: readonly string[];
}
export interface StandeeTabGeometry {
  readonly xPx: number; readonly yPx: number; readonly widthPx: number; readonly heightPx: number;
  readonly widthMm: number; readonly heightMm: number; readonly slotToleranceMm: number;
  readonly matchingBaseSlotWidthMm: number; readonly matchingBaseSlotDepthMm: number;
  readonly svgPathD: string;
}
export interface PhotocardGeometrySpec {
  readonly trimWidthMm: number; readonly trimHeightMm: number; readonly cornerRadiusMm: number;
  readonly bleedMm: number; readonly totalBleedWidthMm: number; readonly totalBleedHeightMm: number;
  readonly safeInsetMm: number; readonly dpi: number;
  readonly trimWidthPx: number; readonly trimHeightPx: number;
  readonly bleedWidthPx: number; readonly bleedHeightPx: number; readonly cornerRadiusPx: number;
  readonly includeBackSide: boolean; readonly includeHoloFoilMask: boolean;
  readonly trimRoundedPathD: string; readonly bleedRectPathD: string;
  readonly holoFoilRegionPathD: string | null;
}
export interface EmoticonKeyframe {
  readonly frameIndex: number; readonly timeSec: number; readonly phaseRad: number;
  readonly translateXPx: number; readonly translateYPx: number;
  readonly scaleX: number; readonly scaleY: number;
  readonly rotationDeg: number; readonly skewXDeg: number;
  readonly opacity: number; readonly accentSparkleScale: number;
  readonly velocityXPxPerSec: number; readonly velocityYPxPerSec: number;
  readonly velocityScaleXPerSec: number; readonly velocityScaleYPerSec: number;
  readonly velocityRotationDegPerSec: number;
}
export interface EmoticonLoopSynthesisInput {
  readonly platform: EmoticonPlatformId; readonly preset: EmoticonMotionPreset;
  readonly frameCount?: number; readonly fps?: number; readonly prefersReducedMotion?: boolean;
  readonly intensity?: number; readonly baseTransparentPaddingPx?: number;
  readonly estimatedBytesPerFrameKb?: number;
}
export interface EmoticonLoopClosureAudit {
  readonly maxPositionDeltaPx: number; readonly maxScaleDelta: number;
  readonly maxRotationDeltaDeg: number; readonly maxVelocityDelta: number;
  readonly isC1Closed: boolean;
}
export interface EmoticonLoopSynthesisResult {
  readonly platform: EmoticonPlatformId; readonly platformLabelKo: string;
  readonly requestedPreset: EmoticonMotionPreset; readonly effectivePreset: EmoticonMotionPreset;
  readonly prefersReducedMotion: boolean;
  readonly widthPx: number; readonly heightPx: number; readonly fps: number;
  readonly frameCount: number; readonly durationSec: number;
  readonly frames: readonly EmoticonKeyframe[]; readonly closureFrame: EmoticonKeyframe;
  readonly closureAudit: EmoticonLoopClosureAudit;
  readonly motionMetrics: {
    readonly maxShakePx: number; readonly maxTranslateXPx: number; readonly maxTranslateYPx: number;
    readonly maxRotationDeg: number; readonly effectiveMinPaddingPx: number;
    readonly amplitudeClampedForPadding: boolean;
  };
  readonly platformCompliance: {
    readonly passed: boolean; readonly maxFileSizeKb: number; readonly estimatedFileSizeKb: number;
    readonly minTransparentPaddingPx: number; readonly violationsKo: readonly string[];
  };
}

export const MERCH_PRODUCT_TEMPLATES: Readonly<Record<MerchProductType, MerchProductTemplateSpec>> = {
  "diecut-vinyl-sticker": {
    productType: "diecut-vinyl-sticker", labelKo: "리무버블 칼선 비닐 스티커",
    maxWidthMm: 60, maxHeightMm: 60, dpi: 300, dieCutOffsetMm: 2.5, bleedMm: 2.0, cornerRadiusMm: 0,
    colorMode: "CMYK+CutContour", maxTotalInkLimitPercent: 300,
    requiresWhiteUnderbase: false, defaultWhiteChokePx: 1,
    keyringHoleSpec: null, standeeTabSpec: null, supportsDoubleSided: false, supportsHoloFoilMask: true,
    spotLayers: ["CutContour"], printSubstrateKo: "방수 리무버블 PVC 비닐 (키스컷 2.5mm 여백 · 도련 2mm)",
  },
  "acrylic-keyring-charm": {
    productType: "acrylic-keyring-charm", labelKo: "투명 아크릴 키링 참",
    maxWidthMm: 55, maxHeightMm: 70, dpi: 300, dieCutOffsetMm: 3.5, bleedMm: 2.0, cornerRadiusMm: 0,
    colorMode: "CMYK+Spot_White+CutContour", maxTotalInkLimitPercent: 300,
    requiresWhiteUnderbase: true, defaultWhiteChokePx: 2,
    keyringHoleSpec: { diameterMm: 3.2, minWallThicknessMm: 2.2 }, standeeTabSpec: null,
    supportsDoubleSided: true, supportsHoloFoilMask: false, spotLayers: ["Spot_White", "CutContour"],
    printSubstrateKo: "3T 투명 캐스트 아크릴 (3.5mm 외곽 칼선 · 3.2mm 상단 타공 · 화이트 백킹)",
  },
  "acrylic-standee-set": {
    productType: "acrylic-standee-set", labelKo: "아크릴 스탠드 세트",
    maxWidthMm: 100, maxHeightMm: 140, dpi: 300, dieCutOffsetMm: 3.5, bleedMm: 2.0, cornerRadiusMm: 0,
    colorMode: "CMYK+Spot_White+CutContour", maxTotalInkLimitPercent: 300,
    requiresWhiteUnderbase: true, defaultWhiteChokePx: 2, keyringHoleSpec: null,
    standeeTabSpec: { widthMm: 28.0, heightMm: 4.0, slotToleranceMm: 0.15, basePlateDiameterMm: 60.0, acrylicThicknessMm: 3.0 },
    supportsDoubleSided: true, supportsHoloFoilMask: false, spotLayers: ["Spot_White", "CutContour"],
    printSubstrateKo: "3T 투명 아크릴 스탠드 + 받침대 (하단 28×4mm 끼움 탭 · 공차 ±0.15mm)",
  },
  "collectible-photocard": {
    productType: "collectible-photocard", labelKo: "컬렉터블 포토카드 (55×85mm)",
    maxWidthMm: 55, maxHeightMm: 85, dpi: 300, dieCutOffsetMm: 0, bleedMm: 2.0, cornerRadiusMm: 3.0,
    colorMode: "CMYK+HoloFoil", maxTotalInkLimitPercent: 300,
    requiresWhiteUnderbase: false, defaultWhiteChokePx: 1, keyringHoleSpec: null, standeeTabSpec: null,
    supportsDoubleSided: true, supportsHoloFoilMask: true, spotLayers: ["CutContour", "Spot_Holo_Foil"],
    printSubstrateKo: "350g 코팅 아트지 양면 CMYK (55×85mm · 모서리 R3mm · 도련 2mm · 홀로그램 박 옵션)",
  },
  "messenger-emoticon-pack": {
    productType: "messenger-emoticon-pack", labelKo: "메신저 움직이는 이모티콘 팩 (24fps)",
    maxWidthMm: 30.48, maxHeightMm: 30.48, dpi: 72, dieCutOffsetMm: 0, bleedMm: 0, cornerRadiusMm: 0,
    colorMode: "sRGB+Alpha", maxTotalInkLimitPercent: 0,
    requiresWhiteUnderbase: false, defaultWhiteChokePx: 0, keyringHoleSpec: null, standeeTabSpec: null,
    supportsDoubleSided: false, supportsHoloFoilMask: false, spotLayers: [],
    printSubstrateKo: "카카오톡(360×360) · 라인(370×320) · 디스코드(320×320) 24fps 루프 스티커",
  },
};

export const EMOTICON_PLATFORM_SPECS: Readonly<Record<EmoticonPlatformId, EmoticonPlatformSpec>> = {
  kakaotalk: {
    platform: "kakaotalk", labelKo: "카카오톡 움직이는 이모티콘",
    widthPx: 360, heightPx: 360, fps: 24, minFrames: 12, maxFrames: 96, defaultFrameCount: 24,
    maxFileSizeKb: 1024, minTransparentPaddingPx: 10, supportedFormats: ["webp", "png-sequence"],
  },
  line: {
    platform: "line", labelKo: "라인 애니메이션 스티커 (LINE)",
    widthPx: 370, heightPx: 320, fps: 24, minFrames: 12, maxFrames: 96, defaultFrameCount: 24,
    maxFileSizeKb: 300, minTransparentPaddingPx: 10, supportedFormats: ["apng"],
  },
  discord: {
    platform: "discord", labelKo: "디스코드 커스텀 스티커",
    widthPx: 320, heightPx: 320, fps: 24, minFrames: 12, maxFrames: 120, defaultFrameCount: 24,
    maxFileSizeKb: 512, minTransparentPaddingPx: 10, supportedFormats: ["apng", "webp"],
  },
};

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
}
function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

/**
 * sRGB(0..255) 색상을 인쇄소 GCR 규칙과 총잉크량(TAC) 상한을 적용해 CMYK(0..100%)로 분판한다.
 */
export function convertSrgbToCmyk(r: number, g: number, b: number, maxTotalInkLimitPercent = 300): CmykColorSample {
  const rawC = 1 - clamp(r, 0, 255) / 255;
  const rawM = 1 - clamp(g, 0, 255) / 255;
  const rawY = 1 - clamp(b, 0, 255) / 255;
  const minCmy = Math.min(rawC, rawM, rawY);

  // 중성 회색 성분 치환(GCR 70%): 어두운 색조의 잉크 겹침을 억제하고 K판 안정성을 높인다.
  const kBase = minCmy * 0.7 + (minCmy > 0.85 ? (minCmy - 0.85) * 0.3 : 0);
  const denom = Math.max(1e-6, 1 - kBase);
  let c = clamp(((rawC - kBase) / denom) * 100, 0, 100);
  let m = clamp(((rawM - kBase) / denom) * 100, 0, 100);
  let y = clamp(((rawY - kBase) / denom) * 100, 0, 100);
  let k = clamp(kBase * 100, 0, 100);

  const tacLimit = clamp(maxTotalInkLimitPercent, 180, 400);
  let tacClamped = false;
  if (c + m + y + k > tacLimit) {
    tacClamped = true;
    const availCmy = Math.max(0, tacLimit - k);
    const curCmy = c + m + y;
    if (curCmy > 1e-6) { const ratio = availCmy / curCmy; c *= ratio; m *= ratio; y *= ratio; }
    else k = tacLimit;
  }
  return { c: round2(c), m: round2(m), y: round2(y), k: round2(k), totalInkPercent: round2(c + m + y + k), tacClamped };
}

/**
 * 아트워크 RGBA 버퍼의 인쇄용 CMYK 총잉크량(TAC)과 네온 광색역 이탈 비율을 점검한다.
 */
export function evaluateCmykPrintReadiness(
  rgba: Uint8ClampedArray | Uint8Array, maxTotalInkLimitPercent = 300,
): CmykPrintReadinessReport {
  const pixelCount = Math.floor(rgba.length / 4);
  const stride = Math.max(1, Math.floor(pixelCount / 4096));
  let sampled = 0; let peakOrig = 0; let peakClamped = 0; let tacOver = 0; let neon = 0;

  for (let i = 0; i < pixelCount; i += stride) {
    const p = i * 4;
    if ((rgba[p + 3] ?? 0) < 24) continue;
    sampled += 1;
    const r = rgba[p] ?? 0; const g = rgba[p + 1] ?? 0; const b = rgba[p + 2] ?? 0;
    const unclamped = convertSrgbToCmyk(r, g, b, 400);
    const clamped = convertSrgbToCmyk(r, g, b, maxTotalInkLimitPercent);
    if (unclamped.totalInkPercent > peakOrig) peakOrig = unclamped.totalInkPercent;
    if (clamped.totalInkPercent > peakClamped) peakClamped = clamped.totalInkPercent;
    if (clamped.tacClamped) tacOver += 1;

    const maxCh = Math.max(r, g, b); const minCh = Math.min(r, g, b);
    const sat = maxCh > 0 ? (maxCh - minCh) / maxCh : 0;
    if (sat > 0.92 && maxCh > 235 && (g > 220 || (r > 230 && b > 210 && g < 60))) neon += 1;
  }

  const tacExceededPixelRatio = sampled > 0 ? round2(tacOver / sampled) : 0;
  const outOfGamutNeonRatio = sampled > 0 ? round2(neon / sampled) : 0;
  const warningsKo: string[] = [];
  if (tacExceededPixelRatio > 0.15) {
    warningsKo.push(`어두운 영역(${Math.round(tacExceededPixelRatio * 100)}%)이 총잉크량 ${maxTotalInkLimitPercent}% 상한을 넘어 자동 GCR 보정이 적용됩니다.`);
  }
  if (outOfGamutNeonRatio > 0.08) {
    warningsKo.push(`초고채도 형광 계열(${Math.round(outOfGamutNeonRatio * 100)}%)은 CMYK 인쇄 시 채도가 다소 차분해질 수 있습니다.`);
  }
  return {
    colorProfileName: "Japan Color 2001 Coated / ISO Coated v2 (GCR-300)",
    maxTotalInkLimitPercent, sampledOpaquePixels: sampled,
    peakOriginalTacPercent: round2(peakOrig), peakClampedTacPercent: round2(peakClamped),
    tacExceededPixelRatio, outOfGamutNeonRatio, passed: peakClamped <= maxTotalInkLimitPercent + 0.01, warningsKo,
  };
}

/**
 * 아크릴 스탠드 하단 끼움 탭(표준 28×4mm, 공차 ±0.15mm)의 정밀 벡터 기하를 계산한다.
 */
export function buildAcrylicStandeeTabGeometry(
  contourBoundsPx: BoundingBox2D, dpi = 300, customSpec?: Partial<StandeeTabTemplateSpec>,
): StandeeTabGeometry {
  const base = MERCH_PRODUCT_TEMPLATES["acrylic-standee-set"].standeeTabSpec!;
  const widthMm = round2(clamp(customSpec?.widthMm ?? base.widthMm, 12, 60));
  const heightMm = round2(clamp(customSpec?.heightMm ?? base.heightMm, 2.5, 10));
  const slotToleranceMm = round2(clamp(customSpec?.slotToleranceMm ?? base.slotToleranceMm, 0.05, 0.5));
  const acrylicThicknessMm = round2(clamp(customSpec?.acrylicThicknessMm ?? base.acrylicThicknessMm, 2.0, 5.0));

  const widthPx = round2(mmToPx(widthMm, dpi));
  const heightPx = round2(mmToPx(heightMm, dpi));
  const xPx = round2((contourBoundsPx.minX + contourBoundsPx.maxX) * 0.5 - widthPx * 0.5);
  const yPx = round2(contourBoundsPx.maxY);
  const rPx = round2(Math.min(mmToPx(0.6, dpi), heightPx * 0.25));
  const pts: Point2D[] = [
    { x: xPx, y: yPx }, { x: xPx + widthPx, y: yPx },
    { x: xPx + widthPx, y: yPx + heightPx - rPx }, { x: xPx + widthPx - rPx, y: yPx + heightPx },
    { x: xPx + rPx, y: yPx + heightPx }, { x: xPx, y: yPx + heightPx - rPx },
  ];
  return {
    xPx, yPx, widthPx, heightPx, widthMm, heightMm, slotToleranceMm,
    matchingBaseSlotWidthMm: round2(widthMm + slotToleranceMm),
    matchingBaseSlotDepthMm: round2(acrylicThicknessMm + slotToleranceMm),
    svgPathD: pointsToSvgPath(pts, true),
  };
}

function buildRoundedRectPath(x: number, y: number, w: number, h: number, radius: number): string {
  const r = round2(clamp(radius, 0, Math.min(w, h) * 0.5));
  const x0 = round2(x); const y0 = round2(y); const x1 = round2(x + w); const y1 = round2(y + h);
  if (r <= 0.01) {
    return `M ${x0.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y0.toFixed(2)} L ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x0.toFixed(2)} ${y1.toFixed(2)} Z`;
  }
  return [
    `M ${(x0 + r).toFixed(2)} ${y0.toFixed(2)}`, `L ${(x1 - r).toFixed(2)} ${y0.toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${(y0 + r).toFixed(2)}`,
    `L ${x1.toFixed(2)} ${(y1 - r).toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x1 - r).toFixed(2)} ${y1.toFixed(2)}`,
    `L ${(x0 + r).toFixed(2)} ${y1.toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x0.toFixed(2)} ${(y1 - r).toFixed(2)}`,
    `L ${x0.toFixed(2)} ${(y0 + r).toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x0 + r).toFixed(2)} ${y0.toFixed(2)}`, "Z",
  ].join(" ");
}

/**
 * 55×85mm 컬렉터블 포토카드 재단선(R3mm), 도련(2mm), 안전 여백 및 홀로그램 박 영역을 생성한다.
 */
export function buildCollectiblePhotocardSpec(options: {
  readonly dpi?: number; readonly includeBackSide?: boolean; readonly includeHoloFoilMask?: boolean;
} = {}): PhotocardGeometrySpec {
  const tpl = MERCH_PRODUCT_TEMPLATES["collectible-photocard"];
  const dpi = clamp(Math.round(options.dpi ?? tpl.dpi), 72, 1200);
  const trimWidthMm = tpl.maxWidthMm; const trimHeightMm = tpl.maxHeightMm;
  const cornerRadiusMm = tpl.cornerRadiusMm; const bleedMm = tpl.bleedMm; const safeInsetMm = 3.0;
  const totalBleedWidthMm = round2(trimWidthMm + bleedMm * 2);
  const totalBleedHeightMm = round2(trimHeightMm + bleedMm * 2);
  const bleedPx = round2(mmToPx(bleedMm, dpi));
  const trimWidthPx = round2(mmToPx(trimWidthMm, dpi));
  const trimHeightPx = round2(mmToPx(trimHeightMm, dpi));
  const bleedWidthPx = round2(mmToPx(totalBleedWidthMm, dpi));
  const bleedHeightPx = round2(mmToPx(totalBleedHeightMm, dpi));
  const cornerRadiusPx = round2(mmToPx(cornerRadiusMm, dpi));
  const safePx = round2(mmToPx(safeInsetMm, dpi));
  const includeHoloFoilMask = options.includeHoloFoilMask ?? true;

  return {
    trimWidthMm, trimHeightMm, cornerRadiusMm, bleedMm, totalBleedWidthMm, totalBleedHeightMm, safeInsetMm, dpi,
    trimWidthPx, trimHeightPx, bleedWidthPx, bleedHeightPx, cornerRadiusPx,
    includeBackSide: options.includeBackSide ?? true, includeHoloFoilMask,
    trimRoundedPathD: buildRoundedRectPath(bleedPx, bleedPx, trimWidthPx, trimHeightPx, cornerRadiusPx),
    bleedRectPathD: buildRoundedRectPath(0, 0, bleedWidthPx, bleedHeightPx, 0),
    holoFoilRegionPathD: includeHoloFoilMask
      ? buildRoundedRectPath(bleedPx + safePx, bleedPx + safePx, trimWidthPx - safePx * 2, trimHeightPx - safePx * 2, Math.max(1, cornerRadiusPx * 0.65))
      : null,
  };
}

// 정수 고조파 튜플: [harmonic, cosAmp, sinAmp]
type HarmonicTuple = readonly [number, number, number];
interface PresetMotionProfile {
  readonly tx: readonly HarmonicTuple[]; readonly ty: readonly HarmonicTuple[];
  readonly sy: readonly HarmonicTuple[]; readonly rot: readonly HarmonicTuple[];
  readonly skew: readonly HarmonicTuple[]; readonly opacityBase: number;
  readonly opacity: readonly HarmonicTuple[]; readonly sparkle: readonly HarmonicTuple[];
}

const MOTION_PROFILES: Readonly<Record<EmoticonMotionPreset, PresetMotionProfile>> = {
  "bounce-cheer": {
    tx: [[1, 0, 3.5]], ty: [[1, -11.0, 0], [2, 3.2, 0]], sy: [[2, 0.08, 0], [1, -0.025, 0]],
    rot: [[1, 0, 5.5]], skew: [[1, 0, 2.0]], opacityBase: 1, opacity: [], sparkle: [[2, 0.25, 0]],
  },
  "sparkle-wink": {
    tx: [[1, 2.5, 0]], ty: [[2, -4.0, 0]], sy: [[1, 0.035, 0.015]],
    rot: [[1, 0, 4.5], [2, 1.5, 0]], skew: [], opacityBase: 1, opacity: [], sparkle: [[1, 0.35, 0], [3, 0.15, 0]],
  },
  "rage-shake": {
    tx: [[4, 0, 6.5], [6, 2.5, 0]], ty: [[3, -3.0, 0], [5, 0, 2.0]], sy: [[2, 0.05, 0]],
    rot: [[4, 0, 4.2]], skew: [[4, 3.0, 0]], opacityBase: 1, opacity: [], sparkle: [[4, 0.2, 0]],
  },
  "heart-float": {
    tx: [[1, 0, 5.0]], ty: [[1, -8.5, 0]], sy: [[2, 0.045, 0]],
    rot: [[1, 3.5, 0]], skew: [], opacityBase: 1, opacity: [], sparkle: [[1, 0.3, 0.1]],
  },
  "sweat-panic": {
    tx: [[3, 0, 5.5], [1, 2.0, 0]], ty: [[2, 4.5, 0]], sy: [[3, -0.04, 0]],
    rot: [[3, 0, 3.2]], skew: [[2, 0, 3.5]], opacityBase: 1, opacity: [], sparkle: [[2, 0.25, 0]],
  },
  "bow-thanks": {
    tx: [], ty: [[1, -6.5, 0], [2, 2.0, 0]], sy: [[1, 0.055, 0]],
    rot: [[1, 0, -8.0]], skew: [[1, 0, -2.5]], opacityBase: 1, opacity: [], sparkle: [[1, 0.2, 0]],
  },
  "gentle-fade-pulse": {
    tx: [], ty: [], sy: [[1, 0.012, 0]], rot: [], skew: [],
    opacityBase: 0.96, opacity: [[1, 0.04, 0]], sparkle: [[1, 0.08, 0]],
  },
};

function evalHarmonic(terms: readonly HarmonicTuple[], theta: number, omega: number, gain: number): { v: number; dv: number } {
  let v = 0; let dv = 0;
  for (const [m, cAmp, sAmp] of terms) {
    const c = Math.cos(m * theta); const s = Math.sin(m * theta);
    v += (cAmp * c + sAmp * s) * gain;
    dv += m * (-cAmp * s + sAmp * c) * omega * gain;
  }
  return { v, dv };
}

function evalKeyframe(
  profile: PresetMotionProfile, frameIndex: number, frameCount: number, fps: number, tGain: number, aGain: number,
): EmoticonKeyframe {
  const phaseRad = (2 * Math.PI * frameIndex) / frameCount;
  const omega = (2 * Math.PI * fps) / frameCount;
  const tx = evalHarmonic(profile.tx, phaseRad, omega, tGain);
  const ty = evalHarmonic(profile.ty, phaseRad, omega, tGain);
  const syRaw = evalHarmonic(profile.sy, phaseRad, omega, aGain);
  const rot = evalHarmonic(profile.rot, phaseRad, omega, tGain);
  const skew = evalHarmonic(profile.skew, phaseRad, omega, tGain);
  const op = evalHarmonic(profile.opacity, phaseRad, omega, 1);
  const sp = evalHarmonic(profile.sparkle, phaseRad, omega, aGain);
  const scaleY = Math.max(0.75, 1 + syRaw.v);
  const scaleX = 1 / scaleY;
  return {
    frameIndex, timeSec: frameIndex / fps, phaseRad,
    translateXPx: tx.v, translateYPx: ty.v, scaleX, scaleY,
    rotationDeg: rot.v, skewXDeg: skew.v,
    opacity: clamp(profile.opacityBase + op.v, 0.5, 1),
    accentSparkleScale: Math.max(0, 1 + sp.v),
    velocityXPxPerSec: tx.dv, velocityYPxPerSec: ty.dv,
    velocityScaleXPerSec: -syRaw.dv / (scaleY * scaleY), velocityScaleYPerSec: syRaw.dv,
    velocityRotationDegPerSec: rot.dv,
  };
}

/**
 * 카카오톡(360×360)·라인(370×320)·디스코드(320×320) 규격에 맞춘 결정적 24fps 심리스 루프
 * 이모티콘 키프레임을 합성한다. `frame[N]`과 `frame[0]`의 위치·스케일·회전·속도가 C1 연속으로 일치한다.
 */
export function synthesizeSeamlessEmoticonLoop(input: EmoticonLoopSynthesisInput): EmoticonLoopSynthesisResult {
  const spec = EMOTICON_PLATFORM_SPECS[input.platform];
  const fps = Math.round(clamp(input.fps ?? spec.fps, 12, 60));
  const frameCount = Math.round(clamp(input.frameCount ?? spec.defaultFrameCount, 4, 240));
  const prefersReducedMotion = input.prefersReducedMotion === true;
  const effectivePreset: EmoticonMotionPreset = prefersReducedMotion ? "gentle-fade-pulse" : input.preset;
  const profile = MOTION_PROFILES[effectivePreset];
  const baseIntensity = clamp(input.intensity ?? 1.0, 0.1, 2.0);
  const basePadding = Math.max(0, input.baseTransparentPaddingPx ?? 24);

  let probeMaxDisp = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const f = evalKeyframe(profile, i, frameCount, fps, baseIntensity, baseIntensity);
    probeMaxDisp = Math.max(probeMaxDisp, Math.abs(f.translateXPx), Math.abs(f.translateYPx));
  }
  const allowedDisp = Math.max(0, basePadding - spec.minTransparentPaddingPx);
  let tGain = baseIntensity;
  let amplitudeClampedForPadding = false;
  if (probeMaxDisp > allowedDisp && probeMaxDisp > 1e-6) {
    tGain = baseIntensity * (allowedDisp / probeMaxDisp);
    amplitudeClampedForPadding = true;
  }

  const frames: EmoticonKeyframe[] = [];
  let maxShakePx = 0; let maxTx = 0; let maxTy = 0; let maxRot = 0;
  for (let i = 0; i < frameCount; i += 1) {
    const kf = evalKeyframe(profile, i, frameCount, fps, tGain, baseIntensity);
    frames.push(kf);
    maxTx = Math.max(maxTx, Math.abs(kf.translateXPx));
    maxTy = Math.max(maxTy, Math.abs(kf.translateYPx));
    maxShakePx = Math.max(maxShakePx, Math.hypot(kf.translateXPx, kf.translateYPx));
    maxRot = Math.max(maxRot, Math.abs(kf.rotationDeg));
  }

  const closureFrame = evalKeyframe(profile, frameCount, frameCount, fps, tGain, baseIntensity);
  const start = frames[0]!;
  const maxPositionDeltaPx = Math.max(Math.abs(closureFrame.translateXPx - start.translateXPx), Math.abs(closureFrame.translateYPx - start.translateYPx));
  const maxScaleDelta = Math.max(Math.abs(closureFrame.scaleX - start.scaleX), Math.abs(closureFrame.scaleY - start.scaleY));
  const maxRotationDeltaDeg = Math.abs(closureFrame.rotationDeg - start.rotationDeg);
  const maxVelocityDelta = Math.max(
    Math.abs(closureFrame.velocityXPxPerSec - start.velocityXPxPerSec),
    Math.abs(closureFrame.velocityYPxPerSec - start.velocityYPxPerSec),
    Math.abs(closureFrame.velocityScaleXPerSec - start.velocityScaleXPerSec),
    Math.abs(closureFrame.velocityScaleYPerSec - start.velocityScaleYPerSec),
    Math.abs(closureFrame.velocityRotationDegPerSec - start.velocityRotationDegPerSec),
  );
  const isC1Closed = maxPositionDeltaPx < 1e-6 && maxScaleDelta < 1e-6 && maxRotationDeltaDeg < 1e-6 && maxVelocityDelta < 1e-6;

  const effectiveMinPaddingPx = round2(basePadding - Math.max(maxTx, maxTy));
  const estimatedFileSizeKb = round2(frameCount * clamp(input.estimatedBytesPerFrameKb ?? 8.5, 1, 64));
  const violationsKo: string[] = [];
  if (fps !== spec.fps) violationsKo.push(`${spec.labelKo} 표준 프레임레이트(${spec.fps}fps)와 다릅니다(현재 ${fps}fps).`);
  if (frameCount < spec.minFrames || frameCount > spec.maxFrames) {
    violationsKo.push(`프레임 수(${frameCount})가 ${spec.labelKo} 허용 범위(${spec.minFrames}~${spec.maxFrames})를 벗어났습니다.`);
  }
  if (effectiveMinPaddingPx < spec.minTransparentPaddingPx - 0.01) {
    violationsKo.push(`투명 안전 여백(${effectiveMinPaddingPx}px)이 최소 기준(${spec.minTransparentPaddingPx}px) 미만입니다.`);
  }
  if (estimatedFileSizeKb > spec.maxFileSizeKb) {
    violationsKo.push(`예상 용량(${estimatedFileSizeKb}KB)이 ${spec.labelKo} 제한(${spec.maxFileSizeKb}KB)을 초과합니다.`);
  }

  return {
    platform: input.platform, platformLabelKo: spec.labelKo,
    requestedPreset: input.preset, effectivePreset, prefersReducedMotion,
    widthPx: spec.widthPx, heightPx: spec.heightPx, fps, frameCount, durationSec: round2(frameCount / fps),
    frames, closureFrame,
    closureAudit: { maxPositionDeltaPx, maxScaleDelta, maxRotationDeltaDeg, maxVelocityDelta, isC1Closed },
    motionMetrics: {
      maxShakePx: round2(maxShakePx), maxTranslateXPx: round2(maxTx), maxTranslateYPx: round2(maxTy),
      maxRotationDeg: round2(maxRot), effectiveMinPaddingPx, amplitudeClampedForPadding,
    },
    platformCompliance: {
      passed: violationsKo.length === 0 && isC1Closed,
      maxFileSizeKb: spec.maxFileSizeKb, estimatedFileSizeKb,
      minTransparentPaddingPx: spec.minTransparentPaddingPx, violationsKo,
    },
  };
}
