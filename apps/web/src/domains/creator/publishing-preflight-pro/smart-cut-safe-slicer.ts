/**
 * 스마트 컷-세이프 슬라이서 (#095).
 *
 * 세로 웹툰을 `1,280px` 단위로 자동 분할할 때:
 * 1. 말풍선 보호 영역(`balloons`)과 안전 여백(16px)을 가로지르지 않는다.
 * 2. 인물 눈높이 보호 밴드(`eyeLevelBands`)와 안전 여백(20px)을 가로지르지 않는다.
 * 3. 허용 탐색 창 안에서 **여백(거터) 에너지 최소선**을 결정론적으로 탐색해 자른다.
 *
 * - DOM·브라우저 스토리지·난수 의존 없음(100% 결정론).
 */

import type { EpisodeCutInput } from "./platform-publishing-specs";

export const SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX = 1280;
export const SMART_SLICE_MIN_HEIGHT_RATIO = 0.45;
export const SMART_SLICE_BALLOON_GUARD_MARGIN_PX = 16;
export const SMART_SLICE_EYE_LEVEL_GUARD_MARGIN_PX = 20;

const BALLOON_PENALTY_HARD = 10_000;
const BALLOON_PENALTY_MARGIN = 450;
const EYE_LEVEL_PENALTY_LEAD = 8_000;
const EYE_LEVEL_PENALTY_SUPPORTING = 6_500;
const EYE_LEVEL_PENALTY_MARGIN = 350;
const GUTTER_CENTER_BONUS = 0.55;
const LOW_ENERGY_VALLEY_THRESHOLD = 0.08;
const DEFAULT_ARTWORK_ROW_ENERGY = 0.38;
const DEFAULT_GUTTER_ROW_ENERGY = 0.02;

export interface SmartSliceBalloonZone {
  readonly id: string;
  readonly topY: number;
  readonly bottomY: number;
  readonly cutId?: string;
}

export interface SmartSliceEyeLevelBand {
  readonly id: string;
  readonly topY: number;
  readonly bottomY: number;
  readonly characterName?: string;
  readonly cutId?: string;
  readonly priority?: "lead" | "supporting";
}

export interface SmartSliceGutterBand {
  readonly topY: number;
  readonly bottomY: number;
  readonly baseEnergy?: number;
}

export type SmartSeamReason =
  | "end-of-strip"
  | "ideal-clean"
  | "gutter-min-energy"
  | "avoided-balloon"
  | "avoided-eye-level"
  | "avoided-balloon-and-eye"
  | "forced-compromise";

export interface SmartCutSafeSeamInput {
  readonly totalHeightPx: number;
  readonly sliceStartY: number;
  readonly targetSliceHeightPx?: number;
  readonly maxSliceHeightPx?: number;
  readonly minSliceHeightPx?: number;
  readonly balloons: readonly SmartSliceBalloonZone[];
  readonly eyeLevelBands: readonly SmartSliceEyeLevelBand[];
  readonly gutterBands?: readonly SmartSliceGutterBand[];
  readonly rowEnergyProfile?: readonly number[];
}

export interface SmartCutSafeSeamResult {
  readonly endY: number;
  readonly idealEndY: number;
  readonly seamEnergy: number;
  readonly avoidedBalloon: boolean;
  readonly avoidedEyeLevel: boolean;
  readonly snappedToGutter: boolean;
  readonly forcedCompromise: boolean;
  readonly reason: SmartSeamReason;
}

export interface SmartCutSafeSliceSegment {
  readonly sliceIndex: number;
  readonly startY: number;
  readonly endY: number;
  readonly heightPx: number;
  readonly sourceCutIds: readonly string[];
  readonly seamEnergy: number;
  readonly avoidedBalloon: boolean;
  readonly avoidedEyeLevel: boolean;
  readonly snappedToGutter: boolean;
  readonly forcedCompromise: boolean;
  readonly reason: SmartSeamReason;
}

export interface SmartCutSafeSlicerPlan {
  readonly targetSliceHeightPx: number;
  readonly maxSliceHeightPx: number;
  readonly totalStripHeightPx: number;
  readonly totalSlices: number;
  readonly balloonAvoidanceCount: number;
  readonly eyeLevelAvoidanceCount: number;
  readonly gutterSnappedCount: number;
  readonly compromisedSeamCount: number;
  readonly averageSeamEnergy: number;
  readonly maxSeamEnergy: number;
  readonly slices: readonly SmartCutSafeSliceSegment[];
  readonly fingerprint: string;
}

export interface ScanlineEnergyBreakdown {
  readonly y: number;
  readonly baseEnergy: number;
  readonly protectedPenalty: number;
  readonly gutterBonus: number;
  readonly distancePenalty: number;
  readonly totalScore: number;
  readonly hitsBalloon: boolean;
  readonly hitsEyeLevel: boolean;
  readonly inGutter: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function computeSlicerFingerprint(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b1;
  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (code + i), 0x85ebca6b) >>> 0;
  }
  return `scs-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function sampleRowEnergy(
  y: number,
  totalHeightPx: number,
  rowEnergyProfile?: readonly number[],
  gutterBands?: readonly SmartSliceGutterBand[],
): { readonly baseEnergy: number; readonly inGutter: boolean; readonly gutterCenterFactor: number } {
  if (gutterBands && gutterBands.length > 0) {
    for (const band of gutterBands) {
      if (y >= band.topY && y <= band.bottomY) {
        const span = Math.max(1, band.bottomY - band.topY);
        const center = (band.topY + band.bottomY) / 2;
        const centerFactor = 1 - Math.abs(y - center) / (span / 2 + 1);
        return {
          baseEnergy: clamp(band.baseEnergy ?? DEFAULT_GUTTER_ROW_ENERGY, 0, 1),
          inGutter: span >= 8,
          gutterCenterFactor: clamp(centerFactor, 0, 1),
        };
      }
    }
  }

  if (rowEnergyProfile && rowEnergyProfile.length > 0) {
    const ratio = totalHeightPx > 1 ? clamp(y / (totalHeightPx - 1), 0, 1) : 0;
    const idx = Math.min(rowEnergyProfile.length - 1, Math.round(ratio * (rowEnergyProfile.length - 1)));
    const raw = rowEnergyProfile[idx] ?? DEFAULT_ARTWORK_ROW_ENERGY;
    const baseEnergy = clamp(Number.isFinite(raw) ? raw : DEFAULT_ARTWORK_ROW_ENERGY, 0, 1);
    const inGutter = baseEnergy <= LOW_ENERGY_VALLEY_THRESHOLD;
    return {
      baseEnergy,
      inGutter,
      gutterCenterFactor: inGutter ? clamp(1 - baseEnergy / LOW_ENERGY_VALLEY_THRESHOLD, 0, 1) : 0,
    };
  }

  return {
    baseEnergy: DEFAULT_ARTWORK_ROW_ENERGY,
    inGutter: false,
    gutterCenterFactor: 0,
  };
}

/**
 * 특정 수직 좌표 `y`에서 분할선을 놓았을 때의 결정론 에너지를 산출한다.
 */
export function evaluateScanlineSeamEnergy(
  y: number,
  context: {
    readonly totalHeightPx: number;
    readonly idealEndY: number;
    readonly searchSpanPx: number;
    readonly balloons: readonly SmartSliceBalloonZone[];
    readonly eyeLevelBands: readonly SmartSliceEyeLevelBand[];
    readonly gutterBands?: readonly SmartSliceGutterBand[];
    readonly rowEnergyProfile?: readonly number[];
  },
): ScanlineEnergyBreakdown {
  const { baseEnergy, inGutter, gutterCenterFactor } = sampleRowEnergy(
    y,
    context.totalHeightPx,
    context.rowEnergyProfile,
    context.gutterBands,
  );

  let protectedPenalty = 0;
  let hitsBalloon = false;
  let hitsEyeLevel = false;

  for (const balloon of context.balloons) {
    const top = Math.min(balloon.topY, balloon.bottomY);
    const bottom = Math.max(balloon.topY, balloon.bottomY);
    if (y > top && y < bottom) {
      hitsBalloon = true;
      protectedPenalty += BALLOON_PENALTY_HARD;
    } else {
      const dist = y <= top ? top - y : y - bottom;
      if (dist < SMART_SLICE_BALLOON_GUARD_MARGIN_PX) {
        protectedPenalty += BALLOON_PENALTY_MARGIN * (1 - dist / SMART_SLICE_BALLOON_GUARD_MARGIN_PX);
      }
    }
  }

  for (const eye of context.eyeLevelBands) {
    const top = Math.min(eye.topY, eye.bottomY);
    const bottom = Math.max(eye.topY, eye.bottomY);
    const hardPenalty = eye.priority === "supporting" ? EYE_LEVEL_PENALTY_SUPPORTING : EYE_LEVEL_PENALTY_LEAD;
    if (y > top && y < bottom) {
      hitsEyeLevel = true;
      protectedPenalty += hardPenalty;
    } else {
      const dist = y <= top ? top - y : y - bottom;
      if (dist < SMART_SLICE_EYE_LEVEL_GUARD_MARGIN_PX) {
        protectedPenalty += EYE_LEVEL_PENALTY_MARGIN * (1 - dist / SMART_SLICE_EYE_LEVEL_GUARD_MARGIN_PX);
      }
    }
  }

  const gutterBonus = inGutter && !hitsBalloon && !hitsEyeLevel
    ? GUTTER_CENTER_BONUS * (0.6 + 0.4 * gutterCenterFactor)
    : 0;

  const normalizedDist = Math.abs(y - context.idealEndY) / Math.max(1, context.searchSpanPx);
  const distancePenalty = 0.18 * normalizedDist * normalizedDist;

  const totalScore = round3(baseEnergy + protectedPenalty - gutterBonus + distancePenalty);
  return {
    y,
    baseEnergy: round3(baseEnergy),
    protectedPenalty: round3(protectedPenalty),
    gutterBonus: round3(gutterBonus),
    distancePenalty: round3(distancePenalty),
    totalScore,
    hitsBalloon,
    hitsEyeLevel,
    inGutter,
  };
}

/**
 * 단일 분할 구간의 다음 컷-세이프 경계선 `endY`를 여백 에너지 최소선 탐색으로 결정한다.
 */
export function findSmartCutSafeSeam(input: SmartCutSafeSeamInput): SmartCutSafeSeamResult {
  const totalHeightPx = Math.max(1, Math.round(input.totalHeightPx));
  const sliceStartY = clamp(Math.round(input.sliceStartY), 0, totalHeightPx);
  const maxSliceHeightPx = Math.max(
    1,
    Math.round(input.maxSliceHeightPx ?? input.targetSliceHeightPx ?? SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX),
  );
  const targetSliceHeightPx = Math.min(
    maxSliceHeightPx,
    Math.max(1, Math.round(input.targetSliceHeightPx ?? maxSliceHeightPx)),
  );
  const idealEndY = Math.min(totalHeightPx, sliceStartY + targetSliceHeightPx);

  if (sliceStartY + maxSliceHeightPx >= totalHeightPx) {
    return Object.freeze({
      endY: totalHeightPx,
      idealEndY: totalHeightPx,
      seamEnergy: 0,
      avoidedBalloon: false,
      avoidedEyeLevel: false,
      snappedToGutter: false,
      forcedCompromise: false,
      reason: "end-of-strip",
    });
  }

  const defaultMinHeight = Math.min(
    maxSliceHeightPx,
    Math.max(240, Math.round(maxSliceHeightPx * SMART_SLICE_MIN_HEIGHT_RATIO)),
  );
  const minSliceHeightPx = clamp(
    Math.round(input.minSliceHeightPx ?? defaultMinHeight),
    1,
    maxSliceHeightPx,
  );
  const windowMinY = Math.min(totalHeightPx, sliceStartY + minSliceHeightPx);
  const windowMaxY = Math.min(totalHeightPx, sliceStartY + maxSliceHeightPx);
  const searchSpanPx = Math.max(1, windowMaxY - windowMinY);

  const evalCtx = {
    totalHeightPx,
    idealEndY,
    searchSpanPx,
    balloons: input.balloons,
    eyeLevelBands: input.eyeLevelBands,
    gutterBands: input.gutterBands,
    rowEnergyProfile: input.rowEnergyProfile,
  };

  const idealEval = evaluateScanlineSeamEnergy(idealEndY, evalCtx);
  let best = idealEval;

  for (let y = windowMinY; y <= windowMaxY; y += 1) {
    const candidate = evaluateScanlineSeamEnergy(y, evalCtx);
    const betterScore = candidate.totalScore < best.totalScore - 1e-6;
    const tieCloser =
      Math.abs(candidate.totalScore - best.totalScore) <= 1e-6 &&
      Math.abs(candidate.y - idealEndY) < Math.abs(best.y - idealEndY);
    if (betterScore || tieCloser) {
      best = candidate;
    }
  }

  const idealBlockedByBalloon = idealEval.hitsBalloon || idealEval.protectedPenalty >= BALLOON_PENALTY_MARGIN * 0.5 && input.balloons.some((b) => {
    const top = Math.min(b.topY, b.bottomY);
    const bottom = Math.max(b.topY, b.bottomY);
    return idealEndY > top - SMART_SLICE_BALLOON_GUARD_MARGIN_PX && idealEndY < bottom + SMART_SLICE_BALLOON_GUARD_MARGIN_PX;
  });
  const idealBlockedByEye = idealEval.hitsEyeLevel || input.eyeLevelBands.some((e) => {
    const top = Math.min(e.topY, e.bottomY);
    const bottom = Math.max(e.topY, e.bottomY);
    return idealEndY > top - SMART_SLICE_EYE_LEVEL_GUARD_MARGIN_PX && idealEndY < bottom + SMART_SLICE_EYE_LEVEL_GUARD_MARGIN_PX;
  });

  const avoidedBalloon = idealBlockedByBalloon && !best.hitsBalloon;
  const avoidedEyeLevel = idealBlockedByEye && !best.hitsEyeLevel;
  const forcedCompromise = best.hitsBalloon || best.hitsEyeLevel;
  const snappedToGutter = best.inGutter && !forcedCompromise;

  let reason: SmartSeamReason;
  if (forcedCompromise) {
    reason = "forced-compromise";
  } else if (avoidedBalloon && avoidedEyeLevel) {
    reason = "avoided-balloon-and-eye";
  } else if (avoidedBalloon) {
    reason = "avoided-balloon";
  } else if (avoidedEyeLevel) {
    reason = "avoided-eye-level";
  } else if (snappedToGutter) {
    reason = "gutter-min-energy";
  } else {
    reason = "ideal-clean";
  }

  return Object.freeze({
    endY: best.y,
    idealEndY,
    seamEnergy: round3(Math.max(0, best.baseEnergy + best.protectedPenalty)),
    avoidedBalloon,
    avoidedEyeLevel,
    snappedToGutter,
    forcedCompromise,
    reason,
  });
}

/**
 * 전체 에피소드 컷 시퀀스를 세로 스트립으로 결합해 `1,280px` 단위 스마트 컷-세이프 슬라이스 계획을 산출한다.
 */
export function planSmartCutSafeSlices(
  cuts: readonly EpisodeCutInput[],
  options: {
    readonly targetSliceHeightPx?: number;
    readonly maxSliceHeightPx?: number;
    readonly minSliceHeightPx?: number;
    readonly targetWidthPx?: number;
    readonly includeInterCutGutters?: boolean;
  } = {},
): SmartCutSafeSlicerPlan {
  const targetSliceHeightPx = Math.max(
    1,
    Math.round(options.targetSliceHeightPx ?? SMART_SLICE_DEFAULT_TARGET_HEIGHT_PX),
  );
  const maxSliceHeightPx = Math.max(
    targetSliceHeightPx,
    Math.round(options.maxSliceHeightPx ?? targetSliceHeightPx),
  );
  const includeGutters = options.includeInterCutGutters ?? true;
  const sortedCuts = [...cuts].sort((a, b) => a.order - b.order);

  if (sortedCuts.length === 0) {
    return Object.freeze({
      targetSliceHeightPx,
      maxSliceHeightPx,
      totalStripHeightPx: 0,
      totalSlices: 0,
      balloonAvoidanceCount: 0,
      eyeLevelAvoidanceCount: 0,
      gutterSnappedCount: 0,
      compromisedSeamCount: 0,
      averageSeamEnergy: 0,
      maxSeamEnergy: 0,
      slices: Object.freeze([]),
      fingerprint: computeSlicerFingerprint("empty"),
    });
  }

  interface CutRange {
    readonly cutId: string;
    readonly topY: number;
    readonly bottomY: number;
  }

  const cutRanges: CutRange[] = [];
  const balloons: SmartSliceBalloonZone[] = [];
  const eyeLevelBands: SmartSliceEyeLevelBand[] = [];
  const gutterBands: SmartSliceGutterBand[] = [];
  const combinedProfile: number[] = [];
  let hasAnyProfile = false;
  let offsetY = 0;

  for (let idx = 0; idx < sortedCuts.length; idx += 1) {
    const cut = sortedCuts[idx]!;
    const scaleRatio =
      options.targetWidthPx && cut.widthPx > 0 ? options.targetWidthPx / cut.widthPx : 1;
    const scaledHeight = Math.max(1, Math.round(cut.heightPx * scaleRatio));
    const cutTop = offsetY;
    const cutBottom = offsetY + scaledHeight;
    cutRanges.push({ cutId: cut.cutId, topY: cutTop, bottomY: cutBottom });

    for (const balloon of cut.balloons) {
      balloons.push({
        id: `${cut.cutId}:${balloon.id}`,
        cutId: cut.cutId,
        topY: cutTop + Math.round(balloon.y * scaleRatio),
        bottomY: cutTop + Math.round((balloon.y + balloon.height) * scaleRatio),
      });
    }

    for (const eye of cut.eyeLevelBands ?? []) {
      eyeLevelBands.push({
        id: `${cut.cutId}:${eye.id}`,
        cutId: cut.cutId,
        characterName: eye.characterName,
        priority: eye.priority,
        topY: cutTop + Math.round(eye.topY * scaleRatio),
        bottomY: cutTop + Math.round(eye.bottomY * scaleRatio),
      });
    }

    if (cut.rowEnergyProfile && cut.rowEnergyProfile.length > 0) {
      hasAnyProfile = true;
      for (let r = 0; r < scaledHeight; r += 1) {
        const pIdx = Math.min(
          cut.rowEnergyProfile.length - 1,
          Math.floor((r / scaledHeight) * cut.rowEnergyProfile.length),
        );
        combinedProfile.push(clamp(cut.rowEnergyProfile[pIdx] ?? DEFAULT_ARTWORK_ROW_ENERGY, 0, 1));
      }
    } else {
      for (let r = 0; r < scaledHeight; r += 1) {
        combinedProfile.push(DEFAULT_ARTWORK_ROW_ENERGY);
      }
    }

    offsetY = cutBottom;
    const gapPx = includeGutters && idx < sortedCuts.length - 1
      ? Math.max(0, Math.round((cut.blankGapBelowPx ?? 0) * scaleRatio))
      : 0;
    if (gapPx > 0) {
      gutterBands.push({
        topY: offsetY,
        bottomY: offsetY + gapPx,
        baseEnergy: DEFAULT_GUTTER_ROW_ENERGY,
      });
      for (let r = 0; r < gapPx; r += 1) {
        combinedProfile.push(DEFAULT_GUTTER_ROW_ENERGY);
      }
      offsetY += gapPx;
    }
  }

  const totalStripHeightPx = offsetY;
  const slices: SmartCutSafeSliceSegment[] = [];
  let cursorY = 0;
  let sliceIndex = 1;

  while (cursorY < totalStripHeightPx) {
    const seam = findSmartCutSafeSeam({
      totalHeightPx: totalStripHeightPx,
      sliceStartY: cursorY,
      targetSliceHeightPx,
      maxSliceHeightPx,
      minSliceHeightPx: options.minSliceHeightPx,
      balloons,
      eyeLevelBands,
      gutterBands,
      rowEnergyProfile: hasAnyProfile ? combinedProfile : undefined,
    });
    const safeEndY = Math.max(cursorY + 1, Math.min(totalStripHeightPx, seam.endY));
    const sourceCutIds = cutRanges
      .filter((range) => range.bottomY > cursorY && range.topY < safeEndY)
      .map((range) => range.cutId);

    slices.push(
      Object.freeze({
        sliceIndex,
        startY: cursorY,
        endY: safeEndY,
        heightPx: safeEndY - cursorY,
        sourceCutIds: Object.freeze(sourceCutIds.length > 0 ? sourceCutIds : [sortedCuts[0]!.cutId]),
        seamEnergy: seam.seamEnergy,
        avoidedBalloon: seam.avoidedBalloon,
        avoidedEyeLevel: seam.avoidedEyeLevel,
        snappedToGutter: seam.snappedToGutter,
        forcedCompromise: seam.forcedCompromise,
        reason: seam.reason,
      }),
    );

    cursorY = safeEndY;
    sliceIndex += 1;
  }

  const internalSeams = slices.slice(0, Math.max(0, slices.length - 1));
  const avgEnergy =
    internalSeams.length > 0
      ? round3(internalSeams.reduce((sum, s) => sum + s.seamEnergy, 0) / internalSeams.length)
      : 0;
  const maxEnergy = internalSeams.reduce((max, s) => Math.max(max, s.seamEnergy), 0);
  const fpSeed = `${targetSliceHeightPx}|${totalStripHeightPx}|${slices.map((s) => `${s.startY}-${s.endY}`).join(",")}`;

  return Object.freeze({
    targetSliceHeightPx,
    maxSliceHeightPx,
    totalStripHeightPx,
    totalSlices: slices.length,
    balloonAvoidanceCount: slices.filter((s) => s.avoidedBalloon).length,
    eyeLevelAvoidanceCount: slices.filter((s) => s.avoidedEyeLevel).length,
    gutterSnappedCount: slices.filter((s) => s.snappedToGutter).length,
    compromisedSeamCount: slices.filter((s) => s.forcedCompromise).length,
    averageSeamEnergy: avgEnergy,
    maxSeamEnergy: round3(maxEnergy),
    slices: Object.freeze(slices),
    fingerprint: computeSlicerFingerprint(fpSeed),
  });
}
