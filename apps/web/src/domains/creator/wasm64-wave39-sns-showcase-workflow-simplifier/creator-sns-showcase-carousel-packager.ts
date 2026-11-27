import {
  absoluteShareImageUrl, shareTargetUrl, shareText, withShareAttribution,
  type LinkShareChannel, type ShareChannel, type SharePayload,
} from "@/shared/lib/share";

export const INSTAGRAM_PORTRAIT_WIDTH_PX = 1080;
export const INSTAGRAM_PORTRAIT_HEIGHT_PX = 1350;
export const INSTAGRAM_CAROUSEL_MAX_SLIDES = 20;
export const X_LANDSCAPE_WIDTH_PX = 1600;
export const X_LANDSCAPE_HEIGHT_PX = 900;
export const SHORTFORM_VERTICAL_WIDTH_PX = 1080;
export const SHORTFORM_VERTICAL_HEIGHT_PX = 1920;

export interface Point2D { readonly x: number; readonly y: number }
export interface ShowcaseBoundingBox { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export type SemanticRegionKind = "speech-bubble" | "character-face" | "sfx-lettering" | "key-action" | "spoiler";
export interface ShowcaseSemanticRegion {
  readonly id: string; readonly kind: SemanticRegionKind; readonly bounds: ShowcaseBoundingBox;
  readonly importanceWeight: number; readonly allowSplit?: boolean;
}
export interface InstagramCarouselPlanInput {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly regions: readonly ShowcaseSemanticRegion[];
  readonly candidateStepPx?: number; readonly minSlideSourceHeightPx?: number;
  readonly maxSlideSourceHeightPx?: number; readonly maxSlides?: number;
}
export interface InstagramCarouselSlide {
  readonly slideIndex: number; readonly sourceCrop: ShowcaseBoundingBox; readonly contentScale: number;
  readonly letterboxTopPx: number; readonly letterboxBottomPx: number; readonly containedRegionIds: readonly string[];
}
export interface InstagramCarouselPlan {
  readonly targetWidthPx: typeof INSTAGRAM_PORTRAIT_WIDTH_PX; readonly targetHeightPx: typeof INSTAGRAM_PORTRAIT_HEIGHT_PX;
  readonly idealSourceSliceHeightPx: number; readonly slides: readonly InstagramCarouselSlide[];
  readonly totalDpCost: number; readonly speechBubbleCutCount: number; readonly protectedRegionCutCount: number;
}
export interface XSmartCropInput {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly regions: readonly ShowcaseSemanticRegion[];
}
export interface XSmartCropResult {
  readonly targetWidthPx: typeof X_LANDSCAPE_WIDTH_PX; readonly targetHeightPx: typeof X_LANDSCAPE_HEIGHT_PX;
  readonly sourceCrop: ShowcaseBoundingBox; readonly capturedImportanceRatio: number;
  readonly primaryFocusRegionIds: readonly string[]; readonly spoilerOverlapAreaPx: number;
}
export interface HudSafeInsets { readonly topPx: number; readonly bottomPx: number; readonly leftPx: number; readonly rightPx: number }
export const DEFAULT_SHORTFORM_HUD_SAFE_INSETS: HudSafeInsets = { topPx: 220, bottomPx: 380, leftPx: 64, rightPx: 120 };
export interface ShortformSafeZoneFrameInput {
  readonly canvasWidthPx: number; readonly canvasHeightPx: number;
  readonly regions: readonly ShowcaseSemanticRegion[]; readonly hudSafeInsets?: Partial<HudSafeInsets>;
}
export interface ShortformSafeZoneFrameResult {
  readonly frameWidthPx: typeof SHORTFORM_VERTICAL_WIDTH_PX; readonly frameHeightPx: typeof SHORTFORM_VERTICAL_HEIGHT_PX;
  readonly safeZoneRect: ShowcaseBoundingBox; readonly sourceFocusCrop: ShowcaseBoundingBox;
  readonly projectedContentRect: ShowcaseBoundingBox; readonly hudCollisionCount: number; readonly scale: number;
}
export type BeforeAfterWipeMode = "vertical-split" | "diagonal-wipe";
export interface BeforeAfterWipeCardInput {
  readonly widthPx: number; readonly heightPx: number; readonly mode: BeforeAfterWipeMode;
  readonly splitRatio?: number; readonly diagonalAngleDeg?: number;
}
export interface BeforeAfterWipeCardSpec {
  readonly widthPx: number; readonly heightPx: number; readonly mode: BeforeAfterWipeMode; readonly splitRatio: number;
  readonly dividerStart: Point2D; readonly dividerEnd: Point2D;
  readonly beforeClipPolygon: readonly Point2D[]; readonly afterClipPolygon: readonly Point2D[];
}
export type TimelapseStageKind = "rough" | "ink" | "flat" | "shade" | "final";
export interface TimelapseSnapshotCandidate {
  readonly snapshotId: string; readonly stage: TimelapseStageKind;
  readonly timestampMs: number; readonly visualChangeScore: number; readonly strokeCount: number;
}
export interface TimelapseKeyframeSelectionInput {
  readonly snapshots: readonly TimelapseSnapshotCandidate[]; readonly bpm: number;
  readonly durationMs: number; readonly beatSubdivision?: 1 | 2 | 4; readonly maxKeyframes?: number;
}
export interface SelectedTimelapseKeyframe {
  readonly snapshotId: string; readonly stage: TimelapseStageKind;
  readonly beatIndex: number; readonly beatTimeMs: number; readonly sourceTimestampMs: number;
}
export type SpoilerMaskEffect = "mosaic" | "gaussian-blur";
export interface SpoilerMaskRegion {
  readonly regionId: string; readonly maskBounds: ShowcaseBoundingBox;
  readonly effect: SpoilerMaskEffect; readonly mosaicCellSizePx: number; readonly blurSigmaPx: number;
}
export type CornerAnchorPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export interface CornerBackgroundSample { readonly anchor: CornerAnchorPosition; readonly r8: number; readonly g8: number; readonly b8: number }
export interface SignatureWatermarkInput {
  readonly frameWidthPx: number; readonly frameHeightPx: number; readonly watermarkWidthPx: number; readonly watermarkHeightPx: number;
  readonly marginPx?: number; readonly cornerSamples: readonly CornerBackgroundSample[];
  readonly regions?: readonly ShowcaseSemanticRegion[]; readonly safeInsets?: Partial<HudSafeInsets>;
}
export interface SignatureWatermarkPlacement {
  readonly anchor: CornerAnchorPosition; readonly bounds: ShowcaseBoundingBox; readonly textHex: "#111318" | "#FAF8F3";
  readonly backdropRgba: string; readonly backgroundLuminance: number;
  readonly wcagContrastRatio: number; readonly regionOverlapAreaPx: number;
}
export type RightsLicenseSpdx = "CC0-1.0" | "CC-BY-4.0" | "CC-BY-SA-4.0" | "ToonStudio-Commercial" | "NC-Restricted" | "GPL-Isolated";
export interface RightsBomEntry { readonly assetId: string; readonly assetTitle: string; readonly authorName: string; readonly licenseSpdx: RightsLicenseSpdx }
export interface RightsBomAttributionResult {
  readonly footerTextKo: string; readonly requiredCredits: readonly string[];
  readonly hasCommercialConflict: boolean; readonly conflictAssetIds: readonly string[];
}
export interface ChannelShareBundle {
  readonly channel: ShareChannel; readonly attributedUrl: string;
  readonly shareCopyText: string; readonly ogImageUrl: string; readonly intentUrl: string | null;
}
export interface CreatorSnsShowcasePackageInput {
  readonly workTitle: string; readonly shareUrl: string; readonly shareDescription?: string;
  readonly shareImageUrl?: string; readonly origin?: string; readonly channels: readonly ShareChannel[];
  readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly regions: readonly ShowcaseSemanticRegion[];
  readonly rightsBom: readonly RightsBomEntry[]; readonly commercialPublish?: boolean;
  readonly cornerSamples: readonly CornerBackgroundSample[];
}
export interface CreatorSnsShowcasePackage {
  readonly instagramCarousel: InstagramCarouselPlan; readonly xSmartCrop: XSmartCropResult;
  readonly shortformFrame: ShortformSafeZoneFrameResult; readonly spoilerMasks: readonly SpoilerMaskRegion[];
  readonly watermark: SignatureWatermarkPlacement; readonly rightsAttribution: RightsBomAttributionResult;
  readonly channelShares: readonly ChannelShareBundle[];
}

const LINK_SHARE_CHANNELS = new Set<LinkShareChannel>(["naver", "line", "x", "facebook", "linkedin", "telegram", "email"]);
const STAGE_ORDER: Readonly<Record<TimelapseStageKind, number>> = { rough: 0, ink: 1, flat: 2, shade: 3, final: 4 };
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const isProtected = (r: ShowcaseSemanticRegion): boolean =>
  r.allowSplit !== undefined ? !r.allowSplit : r.kind === "speech-bubble" || r.kind === "character-face";

function intersectArea(a: ShowcaseBoundingBox, b: ShowcaseBoundingBox): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function buildCutCandidates(canvasH: number, stepPx: number, regions: readonly ShowcaseSemanticRegion[]): number[] {
  const set = new Set<number>([0, canvasH]);
  for (let y = stepPx; y < canvasH; y += stepPx) set.add(Math.round(y));
  const spans = regions
    .filter(isProtected)
    .map((r) => ({ top: clamp(Math.floor(r.bounds.y), 0, canvasH), bottom: clamp(Math.ceil(r.bounds.y + r.bounds.height), 0, canvasH) }))
    .sort((a, b) => a.top - b.top);
  for (let i = 0; i < spans.length; i += 1) {
    set.add(spans[i].top);
    set.add(spans[i].bottom);
    if (i + 1 < spans.length && spans[i + 1].top > spans[i].bottom) set.add(Math.round((spans[i].bottom + spans[i + 1].top) * 0.5));
  }
  return [...set].sort((a, b) => a - b);
}

function evaluateCutPenalty(cutY: number, canvasH: number, regions: readonly ShowcaseSemanticRegion[]) {
  if (cutY <= 0 || cutY >= canvasH) return { cost: 0, speechCuts: 0, protectedCuts: 0 };
  let cost = 0;
  let speechCuts = 0;
  let protectedCuts = 0;
  let margin = 24;
  for (const r of regions) {
    const top = r.bounds.y;
    const bottom = r.bounds.y + r.bounds.height;
    const w = Math.max(0.1, r.importanceWeight);
    if (cutY > top && cutY < bottom) {
      if (r.kind === "speech-bubble") speechCuts += 1;
      if (isProtected(r)) {
        protectedCuts += 1;
        cost += 1_000_000 * w;
      } else cost += 240 * w;
      margin = 0;
    } else margin = Math.min(margin, cutY <= top ? top - cutY : cutY - bottom);
  }
  return { cost: cost + (24 - margin) * 0.08, speechCuts, protectedCuts };
}

export function planInstagramShowcaseCarousel(input: InstagramCarouselPlanInput): InstagramCarouselPlan {
  const canvasW = Math.max(1, Math.round(input.canvasWidthPx));
  const canvasH = Math.max(1, Math.round(input.canvasHeightPx));
  const idealH = (canvasW * INSTAGRAM_PORTRAIT_HEIGHT_PX) / INSTAGRAM_PORTRAIT_WIDTH_PX;
  const maxSlides = clamp(input.maxSlides ?? INSTAGRAM_CAROUSEL_MAX_SLIDES, 1, INSTAGRAM_CAROUSEL_MAX_SLIDES);
  const buildSlide = (slideIndex: number, y0: number, y1: number): InstagramCarouselSlide => {
    const sliceH = Math.max(1, y1 - y0);
    const scale = Math.min(INSTAGRAM_PORTRAIT_WIDTH_PX / canvasW, INSTAGRAM_PORTRAIT_HEIGHT_PX / sliceH);
    const padTotal = Math.max(0, INSTAGRAM_PORTRAIT_HEIGHT_PX - Math.round(sliceH * scale));
    const letterboxTopPx = Math.floor(padTotal * 0.5);
    const crop: ShowcaseBoundingBox = { x: 0, y: y0, width: canvasW, height: sliceH };
    return {
      slideIndex, sourceCrop: crop, contentScale: scale, letterboxTopPx, letterboxBottomPx: padTotal - letterboxTopPx,
      containedRegionIds: input.regions.filter((r) => intersectArea(crop, r.bounds) > 0).map((r) => r.id),
    };
  };

  if (canvasH <= idealH * 1.05 || maxSlides === 1) {
    return {
      targetWidthPx: INSTAGRAM_PORTRAIT_WIDTH_PX, targetHeightPx: INSTAGRAM_PORTRAIT_HEIGHT_PX, idealSourceSliceHeightPx: idealH,
      slides: [buildSlide(0, 0, canvasH)], totalDpCost: 0, speechBubbleCutCount: 0, protectedRegionCutCount: 0,
    };
  }
  const minSliceH = Math.max(64, Math.round(input.minSlideSourceHeightPx ?? idealH * 0.45));
  const maxSliceH = Math.max(minSliceH + 32, Math.round(input.maxSlideSourceHeightPx ?? Math.max(idealH * 1.25, Math.ceil(canvasH / maxSlides))));
  const ys = buildCutCandidates(canvasH, Math.max(8, Math.round(input.candidateStepPx ?? 20)), input.regions);
  const n = ys.length;
  const cutStats = ys.map((y) => evaluateCutPenalty(y, canvasH, input.regions));
  const dp = Array.from({ length: maxSlides + 1 }, () => new Float64Array(n).fill(Number.POSITIVE_INFINITY));
  const parent = Array.from({ length: maxSlides + 1 }, () => new Int32Array(n).fill(-1));
  dp[0][0] = 0;

  for (let k = 1; k <= maxSlides; k += 1) {
    for (let j = 1; j < n; j += 1) {
      for (let i = j - 1; i >= 0; i -= 1) {
        const sliceH = ys[j] - ys[i];
        if (sliceH > maxSliceH && i < j - 1) break;
        if (sliceH < minSliceH && j < n - 1) continue;
        const prev = dp[k - 1][i];
        if (!Number.isFinite(prev)) continue;
        const diff = (sliceH - idealH) / idealH;
        const cand = prev + diff * diff * 140 + 8 + cutStats[j].cost;
        if (cand < dp[k][j]) {
          dp[k][j] = cand;
          parent[k][j] = i;
        }
      }
    }
  }

  let bestK = 1;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let k = 1; k <= maxSlides; k += 1) {
    if (dp[k][n - 1] < bestCost) { bestCost = dp[k][n - 1]; bestK = k; }
  }
  const cuts: number[] = [];
  if (Number.isFinite(bestCost)) {
    for (let k = bestK, cur = n - 1; k >= 1; k -= 1) { cuts.push(cur); cur = parent[k][cur]; }
    cuts.push(0);
    cuts.reverse();
  } else {
    const count = clamp(Math.ceil(canvasH / idealH), 1, maxSlides);
    for (let s = 0; s <= count; s += 1) cuts.push(Math.round(((n - 1) * s) / count));
    bestCost = 0;
  }

  let speechBubbleCutCount = 0;
  let protectedRegionCutCount = 0;
  const slides: InstagramCarouselSlide[] = [];
  for (let s = 0; s < cuts.length - 1; s += 1) {
    const i0 = cuts[s];
    const i1 = cuts[s + 1];
    slides.push(buildSlide(s, ys[i0], ys[i1]));
    if (s < cuts.length - 2) {
      speechBubbleCutCount += cutStats[i1].speechCuts;
      protectedRegionCutCount += cutStats[i1].protectedCuts;
    }
  }
  return {
    targetWidthPx: INSTAGRAM_PORTRAIT_WIDTH_PX, targetHeightPx: INSTAGRAM_PORTRAIT_HEIGHT_PX, idealSourceSliceHeightPx: idealH,
    slides, totalDpCost: bestCost, speechBubbleCutCount, protectedRegionCutCount,
  };
}

export function computeXLandscapeSmartCrop(input: XSmartCropInput): XSmartCropResult {
  const canvasW = Math.max(1, Math.round(input.canvasWidthPx));
  const canvasH = Math.max(1, Math.round(input.canvasHeightPx));
  const aspect = X_LANDSCAPE_WIDTH_PX / X_LANDSCAPE_HEIGHT_PX;
  const cropW = canvasW / canvasH <= aspect ? canvasW : Math.max(1, Math.round(canvasH * aspect));
  const cropH = canvasW / canvasH <= aspect ? Math.max(1, Math.round(canvasW / aspect)) : canvasH;
  const xs = new Set<number>([0, Math.max(0, canvasW - cropW), Math.round((canvasW - cropW) * 0.5)]);
  const ys = new Set<number>([0, Math.max(0, canvasH - cropH), Math.round((canvasH - cropH) * 0.5)]);
  for (let s = 0; s <= 12; s += 1) {
    xs.add(Math.round(((canvasW - cropW) * s) / 12));
    ys.add(Math.round(((canvasH - cropH) * s) / 12));
  }
  for (const r of input.regions) {
    if (r.kind === "spoiler") continue;
    xs.add(clamp(Math.round(r.bounds.x + r.bounds.width * 0.5 - cropW * 0.5), 0, canvasW - cropW));
    ys.add(clamp(Math.round(r.bounds.y + r.bounds.height * 0.5 - cropH * 0.5), 0, canvasH - cropH));
    ys.add(clamp(Math.floor(r.bounds.y - 16), 0, canvasH - cropH));
  }
  const positive = input.regions.filter((r) => r.kind !== "spoiler");
  const totalImp = positive.reduce((acc, r) => acc + Math.max(0.1, r.importanceWeight), 0);
  let bestScore = Number.NEGATIVE_INFINITY;
  let bestCrop: ShowcaseBoundingBox = { x: 0, y: 0, width: cropW, height: cropH };
  let bestWeight = 0;
  let bestSpoiler = 0;

  for (const x of xs) {
    for (const y of ys) {
      const box: ShowcaseBoundingBox = { x, y, width: cropW, height: cropH };
      let score = 0;
      let weightSum = 0;
      let spoilerArea = 0;
      for (const r of input.regions) {
        const area = Math.max(1, r.bounds.width * r.bounds.height);
        const ov = intersectArea(box, r.bounds);
        if (ov <= 0) continue;
        if (r.kind === "spoiler") {
          spoilerArea += ov;
          score -= (ov / area) * Math.max(1, r.importanceWeight) * 500;
          continue;
        }
        const cov = ov / area;
        const w = Math.max(0.1, r.importanceWeight);
        weightSum += cov * w;
        score += cov * w * 100 - (isProtected(r) && cov > 0.05 && cov < 0.99 ? (1 - cov) * w * 180 : 0);
      }
      if (score > bestScore) { bestScore = score; bestCrop = box; bestWeight = weightSum; bestSpoiler = spoilerArea; }
    }
  }
  return {
    targetWidthPx: X_LANDSCAPE_WIDTH_PX, targetHeightPx: X_LANDSCAPE_HEIGHT_PX, sourceCrop: bestCrop,
    capturedImportanceRatio: totalImp > 0 ? clamp(bestWeight / totalImp, 0, 1) : 1,
    primaryFocusRegionIds: positive.filter((r) => intersectArea(bestCrop, r.bounds) >= r.bounds.width * r.bounds.height * 0.5).map((r) => r.id),
    spoilerOverlapAreaPx: bestSpoiler,
  };
}

export function computeShortformSafeZoneFrame(input: ShortformSafeZoneFrameInput): ShortformSafeZoneFrameResult {
  const insets: HudSafeInsets = { ...DEFAULT_SHORTFORM_HUD_SAFE_INSETS, ...input.hudSafeInsets };
  const safeZoneRect: ShowcaseBoundingBox = {
    x: insets.leftPx, y: insets.topPx,
    width: Math.max(120, SHORTFORM_VERTICAL_WIDTH_PX - insets.leftPx - insets.rightPx),
    height: Math.max(200, SHORTFORM_VERTICAL_HEIGHT_PX - insets.topPx - insets.bottomPx),
  };
  const canvasW = Math.max(1, Math.round(input.canvasWidthPx));
  const canvasH = Math.max(1, Math.round(input.canvasHeightPx));
  const focusH = Math.min(canvasH, Math.max(1, Math.round(canvasW / (safeZoneRect.width / safeZoneRect.height))));
  const important = input.regions.filter((r) => r.kind !== "spoiler");
  let focusY = Math.max(0, Math.round((canvasH - focusH) * 0.5));
  if (important.length > 0) {
    const wSum = important.reduce((s, r) => s + Math.max(0.1, r.importanceWeight), 0);
    const wy = important.reduce((s, r) => s + (r.bounds.y + r.bounds.height * 0.5) * Math.max(0.1, r.importanceWeight), 0);
    focusY = clamp(Math.round(wy / wSum - focusH * 0.5), 0, Math.max(0, canvasH - focusH));
  }
  const sourceFocusCrop: ShowcaseBoundingBox = { x: 0, y: focusY, width: canvasW, height: focusH };
  const scale = Math.min(safeZoneRect.width / canvasW, safeZoneRect.height / focusH);
  const projW = Math.round(canvasW * scale);
  const projH = Math.round(focusH * scale);
  const projectedContentRect: ShowcaseBoundingBox = {
    x: safeZoneRect.x + Math.floor((safeZoneRect.width - projW) * 0.5),
    y: safeZoneRect.y + Math.floor((safeZoneRect.height - projH) * 0.5),
    width: projW, height: projH,
  };
  let hudCollisionCount = 0;
  for (const r of important) {
    if (intersectArea(sourceFocusCrop, r.bounds) <= 0) continue;
    const rx0 = Math.max(r.bounds.x, sourceFocusCrop.x) - sourceFocusCrop.x;
    const ry0 = Math.max(r.bounds.y, sourceFocusCrop.y) - sourceFocusCrop.y;
    const rx1 = Math.min(r.bounds.x + r.bounds.width, sourceFocusCrop.x + sourceFocusCrop.width) - sourceFocusCrop.x;
    const ry1 = Math.min(r.bounds.y + r.bounds.height, sourceFocusCrop.y + sourceFocusCrop.height) - sourceFocusCrop.y;
    const projBox: ShowcaseBoundingBox = {
      x: projectedContentRect.x + rx0 * scale, y: projectedContentRect.y + ry0 * scale,
      width: (rx1 - rx0) * scale, height: (ry1 - ry0) * scale,
    };
    const area = projBox.width * projBox.height;
    if (area > 0 && intersectArea(projBox, safeZoneRect) + 1e-3 < area) hudCollisionCount += 1;
  }
  return {
    frameWidthPx: SHORTFORM_VERTICAL_WIDTH_PX, frameHeightPx: SHORTFORM_VERTICAL_HEIGHT_PX,
    safeZoneRect, sourceFocusCrop, projectedContentRect, hudCollisionCount, scale,
  };
}

export function buildBeforeAfterWipeCardSpec(input: BeforeAfterWipeCardInput): BeforeAfterWipeCardSpec {
  const w = Math.max(1, Math.round(input.widthPx));
  const h = Math.max(1, Math.round(input.heightPx));
  const splitRatio = clamp(input.splitRatio ?? 0.5, 0.1, 0.9);
  const centerX = w * splitRatio;
  const angleDeg = input.mode === "diagonal-wipe" ? clamp(input.diagonalAngleDeg ?? 18, -45, 45) : 0;
  const maxShift = Math.min(centerX, w - centerX);
  const shift = clamp(Math.tan((angleDeg * Math.PI) / 180) * (h * 0.5), -maxShift, maxShift);
  const topX = centerX + shift;
  const bottomX = centerX - shift;
  return {
    widthPx: w, heightPx: h, mode: input.mode, splitRatio,
    dividerStart: { x: topX, y: 0 }, dividerEnd: { x: bottomX, y: h },
    beforeClipPolygon: [{ x: 0, y: 0 }, { x: topX, y: 0 }, { x: bottomX, y: h }, { x: 0, y: h }],
    afterClipPolygon: [{ x: topX, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: bottomX, y: h }],
  };
}

export function selectBeatSyncedTimelapseKeyframes(input: TimelapseKeyframeSelectionInput): readonly SelectedTimelapseKeyframe[] {
  if (input.snapshots.length === 0) return [];
  const beatIntervalMs = 60_000 / (clamp(input.bpm, 40, 240) * (input.beatSubdivision ?? 1));
  const totalBeats = Math.max(1, Math.floor(Math.max(beatIntervalMs, input.durationMs) / beatIntervalMs));
  const targetCount = clamp(input.maxKeyframes ?? Math.min(8, totalBeats), 1, Math.min(input.snapshots.length, totalBeats));
  const sorted = [...input.snapshots].sort((a, b) =>
    STAGE_ORDER[a.stage] !== STAGE_ORDER[b.stage] ? STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage] : a.timestampMs - b.timestampMs,
  );
  if (targetCount === 1) {
    const last = sorted[sorted.length - 1];
    return [{ snapshotId: last.snapshotId, stage: last.stage, beatIndex: 0, beatTimeMs: 0, sourceTimestampMs: last.timestampMs }];
  }
  const chosen: number[] = [0];
  for (let slot = 1; slot < targetCount - 1; slot += 1) {
    const minIdx = chosen[chosen.length - 1] + 1;
    const maxIdx = sorted.length - (targetCount - slot);
    const idealIdx = (slot * (sorted.length - 1)) / (targetCount - 1);
    let bestIdx = minIdx;
    let bestRank = Number.NEGATIVE_INFINITY;
    for (let idx = minIdx; idx <= maxIdx; idx += 1) {
      const rank = sorted[idx].visualChangeScore * 10 - Math.abs(idx - idealIdx) * 1.5;
      if (rank > bestRank) { bestRank = rank; bestIdx = idx; }
    }
    chosen.push(bestIdx);
  }
  chosen.push(sorted.length - 1);
  return chosen.map((snapIdx, slotIdx) => {
    const beatIndex = Math.round((slotIdx * (totalBeats - 1)) / (targetCount - 1));
    const snap = sorted[snapIdx];
    return {
      snapshotId: snap.snapshotId, stage: snap.stage, beatIndex,
      beatTimeMs: Number((beatIndex * beatIntervalMs).toFixed(3)), sourceTimestampMs: snap.timestampMs,
    };
  });
}

export function buildSpoilerMaskRegions(
  regions: readonly ShowcaseSemanticRegion[],
  options: { readonly canvasWidthPx: number; readonly canvasHeightPx: number; readonly effect?: SpoilerMaskEffect; readonly featherPaddingPx?: number },
): readonly SpoilerMaskRegion[] {
  const pad = Math.max(0, Math.round(options.featherPaddingPx ?? 12));
  const effect = options.effect ?? "mosaic";
  return regions.filter((r) => r.kind === "spoiler").map((r) => {
    const x0 = clamp(Math.floor(r.bounds.x - pad), 0, options.canvasWidthPx);
    const y0 = clamp(Math.floor(r.bounds.y - pad), 0, options.canvasHeightPx);
    const x1 = clamp(Math.ceil(r.bounds.x + r.bounds.width + pad), x0 + 1, options.canvasWidthPx);
    const y1 = clamp(Math.ceil(r.bounds.y + r.bounds.height + pad), y0 + 1, options.canvasHeightPx);
    const minDim = Math.min(x1 - x0, y1 - y0);
    return {
      regionId: r.id, maskBounds: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, effect,
      mosaicCellSizePx: Math.max(12, Math.round(minDim * 0.14)), blurSigmaPx: Math.max(14, Math.round(minDim * 0.08)),
    };
  });
}

const srgb8ToLinear = (c8: number): number => {
  const c = clamp(c8, 0, 255) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
export const computeBt709RelativeLuminance = (r8: number, g8: number, b8: number): number =>
  0.2126 * srgb8ToLinear(r8) + 0.7152 * srgb8ToLinear(g8) + 0.0722 * srgb8ToLinear(b8);

const DARK_INK_LUMINANCE = computeBt709RelativeLuminance(0x11, 0x13, 0x18);
const LIGHT_PAPER_LUMINANCE = computeBt709RelativeLuminance(0xfa, 0xf8, 0xf3);

export function resolveSignatureWatermarkPlacement(input: SignatureWatermarkInput): SignatureWatermarkPlacement {
  const margin = Math.max(8, Math.round(input.marginPx ?? 24));
  const insets: HudSafeInsets = { topPx: 0, bottomPx: 0, leftPx: 0, rightPx: 0, ...input.safeInsets };
  const w = Math.max(24, Math.round(input.watermarkWidthPx));
  const h = Math.max(16, Math.round(input.watermarkHeightPx));
  const order: readonly CornerAnchorPosition[] = ["bottom-right", "bottom-left", "top-right", "top-left"];
  const sampleMap = new Map(input.cornerSamples.map((s) => [s.anchor, s]));
  let best: SignatureWatermarkPlacement | null = null;
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (let rank = 0; rank < order.length; rank += 1) {
    const anchor = order[rank];
    const bounds: ShowcaseBoundingBox = {
      x: anchor.endsWith("right") ? Math.max(0, input.frameWidthPx - insets.rightPx - margin - w) : insets.leftPx + margin,
      y: anchor.startsWith("bottom") ? Math.max(0, input.frameHeightPx - insets.bottomPx - margin - h) : insets.topPx + margin,
      width: w, height: h,
    };
    const sample = sampleMap.get(anchor) ?? { anchor, r8: 245, g8: 245, b8: 245 };
    const bgLum = computeBt709RelativeLuminance(sample.r8, sample.g8, sample.b8);
    const darkC = (Math.max(bgLum, DARK_INK_LUMINANCE) + 0.05) / (Math.min(bgLum, DARK_INK_LUMINANCE) + 0.05);
    const lightC = (Math.max(bgLum, LIGHT_PAPER_LUMINANCE) + 0.05) / (Math.min(bgLum, LIGHT_PAPER_LUMINANCE) + 0.05);
    const useDark = darkC >= lightC;
    const effBg = Math.max(darkC, lightC) >= 4.5 ? bgLum : useDark ? Math.max(bgLum, 0.42) : Math.min(bgLum, 0.09);
    const fgLum = useDark ? DARK_INK_LUMINANCE : LIGHT_PAPER_LUMINANCE;
    const wcagContrastRatio = (Math.max(effBg, fgLum) + 0.05) / (Math.min(effBg, fgLum) + 0.05);
    const overlapArea = (input.regions ?? []).reduce((s, r) => s + intersectArea(bounds, r.bounds), 0);
    const penalty = overlapArea * 10 + rank * 2;
    if (penalty < bestPenalty || best === null) {
      bestPenalty = penalty;
      best = {
        anchor, bounds, textHex: useDark ? "#111318" : "#FAF8F3",
        backdropRgba: useDark ? "rgba(250, 248, 243, 0.78)" : "rgba(17, 19, 24, 0.76)",
        backgroundLuminance: bgLum, wcagContrastRatio, regionOverlapAreaPx: overlapArea,
      };
    }
  }
  return best!;
}

export function composeRightsBomAttributionFooter(
  entries: readonly RightsBomEntry[],
  options: { readonly commercialPublish?: boolean } = {},
): RightsBomAttributionResult {
  const commercial = options.commercialPublish ?? true;
  const creditSet = new Set<string>();
  const conflictAssetIds: string[] = [];
  for (const entry of entries) {
    if (commercial && (entry.licenseSpdx === "NC-Restricted" || entry.licenseSpdx === "GPL-Isolated")) conflictAssetIds.push(entry.assetId);
    if (entry.licenseSpdx === "CC-BY-4.0" || entry.licenseSpdx === "CC-BY-SA-4.0") creditSet.add(`${entry.assetTitle} (${entry.authorName}, ${entry.licenseSpdx})`);
  }
  const requiredCredits = [...creditSet];
  return {
    footerTextKo: requiredCredits.length > 0 ? `소재 출처: ${requiredCredits.join(" · ")}` : "외부 출처 표기 의무 소재 없음 (상업 이용 검증 완료)",
    requiredCredits, hasCommercialConflict: conflictAssetIds.length > 0, conflictAssetIds,
  };
}

export function packageCreatorSnsShowcase(input: CreatorSnsShowcasePackageInput): CreatorSnsShowcasePackage {
  const rightsAttribution = composeRightsBomAttributionFooter(input.rightsBom, { commercialPublish: input.commercialPublish });
  const ogImageUrl = absoluteShareImageUrl(input.shareImageUrl, input.origin);
  const payload: SharePayload = {
    title: input.workTitle, url: input.shareUrl, imageUrl: ogImageUrl,
    text: [input.shareDescription ?? input.workTitle, rightsAttribution.footerTextKo].filter((s) => s.trim().length > 0).join(" — "),
  };
  const copy = shareText(payload);
  return {
    instagramCarousel: planInstagramShowcaseCarousel(input),
    xSmartCrop: computeXLandscapeSmartCrop(input),
    shortformFrame: computeShortformSafeZoneFrame(input),
    spoilerMasks: buildSpoilerMaskRegions(input.regions, input),
    watermark: resolveSignatureWatermarkPlacement({
      frameWidthPx: input.canvasWidthPx, frameHeightPx: input.canvasHeightPx,
      watermarkWidthPx: 180, watermarkHeightPx: 44, cornerSamples: input.cornerSamples, regions: input.regions,
    }),
    rightsAttribution,
    channelShares: input.channels.map((channel) => ({
      channel, attributedUrl: withShareAttribution(payload.url, channel), shareCopyText: copy, ogImageUrl,
      intentUrl: LINK_SHARE_CHANNELS.has(channel as LinkShareChannel) ? shareTargetUrl(channel as LinkShareChannel, payload) : null,
    })),
  };
}
