/**
 * Wave 109 — 플랫폼별 스마트 웹툰 썸네일·배너 눈높이 크롭 & UI 배지 회피 솔버.
 *
 * - 6종 표준 연재·홍보 규격에 대해 주연 얼굴 100% 보존, 삼분할 시선 정렬,
 *   플랫폼 UI 배지·타이틀바 가림 회피, 업스케일 해상도 안전 경고를 순수 결정론적 최적화로 계산한다.
 */

import {
  ALL_PLATFORM_THUMBNAIL_PRESET_IDS,
  BOUNDS_EPSILON,
  CONTAINMENT_EPSILON,
  PLATFORM_THUMBNAIL_PRESETS,
  SmartThumbnailError,
  clampNumber,
  computeMaxInscribedSize,
  computeRectUnionOverlapRatio,
  isRectContainedIn,
  pointInsideRect,
  rectArea,
  rectIntersectionArea,
  sortSubjectsByPriority,
  validateSourceSpec,
  type CropSubjectSpec,
  type PlatformThumbnailPresetId,
  type PlatformThumbnailPresetSpec,
  type Point2D,
  type ProjectedUiBadgeRect,
  type Rect2D,
  type SmartThumbnailCropSolution,
  type SmartThumbnailSolverOptions,
  type SmartThumbnailSourceSpec,
  type SolvedPresetCrop,
  type SubjectCropCoverage,
} from "./platform-thumbnail-presets-and-geometry";

export {
  ALL_PLATFORM_THUMBNAIL_PRESET_IDS,
  PLATFORM_THUMBNAIL_PRESETS,
  SmartThumbnailError,
  type CropSubjectSpec,
  type PlatformThumbnailPresetId,
  type PlatformThumbnailPresetSpec,
  type PlatformUiBadgeZone,
  type Point2D,
  type ProjectedUiBadgeRect,
  type Rect2D,
  type SmartThumbnailCropSolution,
  type SmartThumbnailErrorCode,
  type SmartThumbnailSolverOptions,
  type SmartThumbnailSourceSpec,
  type SolvedPresetCrop,
  type SubjectCropCoverage,
  type UiBadgeAnchor,
} from "./platform-thumbnail-presets-and-geometry";

const HORIZONTAL_THIRDS: readonly number[] = [1 / 3, 0.5, 2 / 3];

interface CandidateEvaluation {
  readonly crop: Rect2D;
  readonly score: number;
  readonly primaryFaceContainedRatio: number;
  readonly primaryFaceFullyContained: boolean;
  readonly primaryEyeNorm: Point2D | null;
  readonly ruleOfThirdsAlignmentScore: number;
  readonly primaryEyeOccludedByUiBadge: boolean;
  readonly primaryFaceBadgeOverlapRatio: number;
  readonly projectedUiBadges: readonly ProjectedUiBadgeRect[];
  readonly upscaleRatio: number;
}

interface AnchorBounds {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
}

function projectBadgesIntoSource(
  crop: Rect2D,
  preset: PlatformThumbnailPresetSpec,
  primary: CropSubjectSpec | null,
): ProjectedUiBadgeRect[] {
  const result: ProjectedUiBadgeRect[] = [];
  for (let i = 0; i < preset.uiBadgeZones.length; i += 1) {
    const zone = preset.uiBadgeZones[i];
    const sourceRect: Rect2D = {
      x: crop.x + zone.normRect.x * crop.width,
      y: crop.y + zone.normRect.y * crop.height,
      width: zone.normRect.width * crop.width,
      height: zone.normRect.height * crop.height,
    };
    const occludesPrimaryEye = primary ? pointInsideRect(primary.eyeLinePoint, sourceRect, 1) : false;
    const primaryFaceOverlapRatio = primary
      ? clampNumber(rectIntersectionArea(primary.faceBox, sourceRect) / Math.max(1e-9, rectArea(primary.faceBox)), 0, 1)
      : 0;
    result.push({
      zoneId: zone.zoneId,
      labelKo: zone.labelKo,
      badgeText: zone.badgeText,
      anchor: zone.anchor,
      sourceRect,
      occludesPrimaryEye,
      primaryFaceOverlapRatio,
    });
  }
  return result;
}

function computeRuleOfThirdsScore(eyeNorm: Point2D, idealYMin: number, idealYMax: number): number {
  const yDist = eyeNorm.y < idealYMin ? idealYMin - eyeNorm.y : eyeNorm.y > idealYMax ? eyeNorm.y - idealYMax : 0;
  const yScore = clampNumber(1 - yDist / 0.34, 0, 1);

  let minXDist = 1;
  for (let i = 0; i < HORIZONTAL_THIRDS.length; i += 1) {
    const d = Math.abs(eyeNorm.x - HORIZONTAL_THIRDS[i]);
    if (d < minXDist) minXDist = d;
  }
  const xScore = clampNumber(1 - minXDist / 0.32, 0, 1);
  const edgeMargin = Math.min(eyeNorm.x, 1 - eyeNorm.x, eyeNorm.y, 1 - eyeNorm.y);
  const edgeSafety = clampNumber(edgeMargin / 0.16, 0, 1);
  return clampNumber(0.54 * yScore + 0.34 * xScore + 0.12 * edgeSafety, 0, 1);
}

function evaluateCropCandidate(
  crop: Rect2D,
  source: SmartThumbnailSourceSpec,
  preset: PlatformThumbnailPresetSpec,
  sortedSubjects: readonly CropSubjectSpec[],
  upscaleThreshold: number,
  faceComfortMarginRatio: number,
): CandidateEvaluation {
  const primary = sortedSubjects.length > 0 ? sortedSubjects[0] : null;
  const projectedUiBadges = projectBadgesIntoSource(crop, preset, primary);
  const badgeRects = projectedUiBadges.map((b) => b.sourceRect);
  const upscaleRatio = preset.targetWidthPx / Math.max(1e-9, crop.width);

  let primaryFaceContainedRatio = 1;
  let primaryFaceFullyContained = true;
  let primaryEyeNorm: Point2D | null = null;
  let ruleOfThirdsAlignmentScore = 1;
  let primaryEyeOccludedByUiBadge = false;
  let primaryFaceBadgeOverlapRatio = 0;
  let score = 0;

  if (primary) {
    const faceArea = Math.max(1e-9, rectArea(primary.faceBox));
    primaryFaceContainedRatio = clampNumber(rectIntersectionArea(primary.faceBox, crop) / faceArea, 0, 1);
    primaryFaceFullyContained =
      isRectContainedIn(primary.faceBox, crop) || primaryFaceContainedRatio >= 1 - CONTAINMENT_EPSILON;
    primaryEyeNorm = {
      x: (primary.eyeLinePoint.x - crop.x) / crop.width,
      y: (primary.eyeLinePoint.y - crop.y) / crop.height,
    };
    ruleOfThirdsAlignmentScore = computeRuleOfThirdsScore(
      primaryEyeNorm,
      preset.idealEyeNormYMin,
      preset.idealEyeNormYMax,
    );
    for (let i = 0; i < projectedUiBadges.length; i += 1) {
      if (projectedUiBadges[i].occludesPrimaryEye) {
        primaryEyeOccludedByUiBadge = true;
        break;
      }
    }
    primaryFaceBadgeOverlapRatio = computeRectUnionOverlapRatio(primary.faceBox, badgeRects);

    // 1순위: 주연 얼굴 100% 보존, 2순위: 플랫폼 UI 배지 회피, 3순위: 삼분할 시선 정렬
    score += primaryFaceContainedRatio * 1000 + (primaryFaceFullyContained ? 550 : 0);
    if (primaryEyeOccludedByUiBadge) score -= 680;
    score -= primaryFaceBadgeOverlapRatio * 340;
    if (primaryFaceBadgeOverlapRatio === 0 && !primaryEyeOccludedByUiBadge) score += 45;
    score += ruleOfThirdsAlignmentScore * 135;

    const faceHeightRatio = primary.faceBox.height / crop.height;
    const framingScore =
      faceHeightRatio < 0.16
        ? clampNumber(faceHeightRatio / 0.16, 0.2, 1)
        : faceHeightRatio > 0.56
          ? clampNumber(1 - (faceHeightRatio - 0.56) / 0.44, 0.1, 1)
          : 1;
    score += framingScore * 60;

    const marginX = Math.max(1, primary.faceBox.width * faceComfortMarginRatio);
    const marginY = Math.max(1, primary.faceBox.height * faceComfortMarginRatio);
    const leftClear = clampNumber((primary.faceBox.x - crop.x) / marginX, 0, 1);
    const rightClear = clampNumber((crop.x + crop.width - (primary.faceBox.x + primary.faceBox.width)) / marginX, 0, 1);
    const topClear = clampNumber((primary.faceBox.y - crop.y) / marginY, 0, 1);
    const bottomClear = clampNumber((crop.y + crop.height - (primary.faceBox.y + primary.faceBox.height)) / marginY, 0, 1);
    score += (leftClear + rightClear + topClear + bottomClear) * 6;

    if (primary.fullBodyBox) {
      const bodyRatio = clampNumber(rectIntersectionArea(primary.fullBodyBox, crop) / Math.max(1e-9, rectArea(primary.fullBodyBox)), 0, 1);
      score += bodyRatio * 18;
    }
  } else {
    const dx = Math.abs(crop.x + crop.width * 0.5 - source.sourceWidthPx * 0.5) / source.sourceWidthPx;
    const dy = Math.abs(crop.y + crop.height * 0.5 - source.sourceHeightPx * 0.5) / source.sourceHeightPx;
    score += 200 * (1 - clampNumber(dx + dy, 0, 1)) + (crop.width / source.sourceWidthPx) * 40;
  }

  if (upscaleRatio > upscaleThreshold) {
    score -= Math.min(3.5, upscaleRatio - upscaleThreshold) * 190;
  }

  for (let i = 1; i < sortedSubjects.length; i += 1) {
    const sub = sortedSubjects[i];
    const ratio = clampNumber(rectIntersectionArea(sub.faceBox, crop) / Math.max(1e-9, rectArea(sub.faceBox)), 0, 1);
    const subBadgeOverlap = computeRectUnionOverlapRatio(sub.faceBox, badgeRects);
    score += (ratio * 28 - subBadgeOverlap * 10) * (sub.priority / 10);
  }

  if (source.logoBox) {
    const logoContained = clampNumber(rectIntersectionArea(source.logoBox, crop) / Math.max(1e-9, rectArea(source.logoBox)), 0, 1);
    const logoBadgeOverlap = computeRectUnionOverlapRatio(source.logoBox, badgeRects);
    score += logoContained * 14 - logoBadgeOverlap * 12;
  }

  return {
    crop,
    score,
    primaryFaceContainedRatio,
    primaryFaceFullyContained,
    primaryEyeNorm,
    ruleOfThirdsAlignmentScore,
    primaryEyeOccludedByUiBadge,
    primaryFaceBadgeOverlapRatio,
    projectedUiBadges,
    upscaleRatio,
  };
}

function buildCandidateScales(
  preset: PlatformThumbnailPresetSpec,
  primary: CropSubjectSpec | null,
  maxWidth: number,
  maxHeight: number,
  upscaleThreshold: number,
  minScaleFraction: number,
  scaleSampleCount: number,
): number[] {
  const scales: number[] = [1.0];
  let hardMinScale = clampNumber(minScaleFraction, 0.05, 1.0);
  const pushValid = (s: number): void => {
    if (s >= hardMinScale && s <= 1.0) scales.push(s);
  };

  if (primary) {
    const faceExactMin = Math.max(primary.faceBox.width / maxWidth, primary.faceBox.height / maxHeight);
    if (faceExactMin <= 1.0) {
      hardMinScale = Math.max(hardMinScale, faceExactMin);
      scales.push(clampNumber(faceExactMin * 1.0001, faceExactMin, 1.0));
      const faceRatios = [0.65, 0.5, 0.38, 0.28, 0.2];
      for (let i = 0; i < faceRatios.length; i += 1) {
        pushValid(primary.faceBox.height / faceRatios[i] / maxHeight);
      }
      for (let i = 0; i < preset.uiBadgeZones.length; i += 1) {
        const z = preset.uiBadgeZones[i].normRect;
        if (z.x === 0 && z.width < 0.8 && primary.faceBox.x > 0) {
          pushValid(primary.faceBox.x / (z.width + 0.02) / maxWidth);
          pushValid(primary.eyeLinePoint.x / (z.width + 0.05) / maxWidth);
        }
        if (z.y === 0 && z.height < 0.8 && primary.faceBox.y > 0) {
          pushValid(primary.faceBox.y / (z.height + 0.02) / maxHeight);
        }
      }
    } else {
      hardMinScale = 1.0;
    }
  }

  pushValid(preset.targetWidthPx / upscaleThreshold / maxWidth);
  const samples = Math.max(4, Math.floor(scaleSampleCount));
  for (let i = 0; i < samples; i += 1) {
    const t = samples === 1 ? 1 : i / (samples - 1);
    scales.push(clampNumber(hardMinScale + (1.0 - hardMinScale) * t, hardMinScale, 1.0));
  }

  scales.sort((a, b) => a - b);
  const deduped: number[] = [];
  for (let i = 0; i < scales.length; i += 1) {
    if (deduped.length === 0 || Math.abs(scales[i] - deduped[deduped.length - 1]) > 1e-4) {
      deduped.push(scales[i]);
    }
  }
  return deduped;
}

function computeFeasibleAnchorBounds(
  sourceWidth: number,
  sourceHeight: number,
  cropWidth: number,
  cropHeight: number,
  primary: CropSubjectSpec | null,
): AnchorBounds {
  const maxX = Math.max(0, sourceWidth - cropWidth);
  const maxY = Math.max(0, sourceHeight - cropHeight);
  if (!primary) return { xMin: 0, xMax: maxX, yMin: 0, yMax: maxY };

  const f = primary.faceBox;
  const xMin = clampNumber(f.x + f.width - cropWidth, 0, maxX);
  const xMax = clampNumber(f.x, 0, maxX);
  const yMin = clampNumber(f.y + f.height - cropHeight, 0, maxY);
  const yMax = clampNumber(f.y, 0, maxY);
  return {
    xMin: Math.min(xMin, xMax),
    xMax: Math.max(xMin, xMax),
    yMin: Math.min(yMin, yMax),
    yMax: Math.max(yMin, yMax),
  };
}

function buildAnchorCandidates(
  bounds: AnchorBounds,
  cropWidth: number,
  cropHeight: number,
  preset: PlatformThumbnailPresetSpec,
  primary: CropSubjectSpec | null,
  gridSteps: number,
): Point2D[] {
  const candidates: Point2D[] = [];
  const pushClamped = (rawX: number, rawY: number): void => {
    candidates.push({ x: clampNumber(rawX, bounds.xMin, bounds.xMax), y: clampNumber(rawY, bounds.yMin, bounds.yMax) });
  };

  if (primary) {
    const idealMidY = (preset.idealEyeNormYMin + preset.idealEyeNormYMax) * 0.5;
    const targetYs = [preset.idealEyeNormYMin, idealMidY, preset.idealEyeNormYMax];
    for (let xi = 0; xi < HORIZONTAL_THIRDS.length; xi += 1) {
      for (let yi = 0; yi < targetYs.length; yi += 1) {
        pushClamped(primary.eyeLinePoint.x - HORIZONTAL_THIRDS[xi] * cropWidth, primary.eyeLinePoint.y - targetYs[yi] * cropHeight);
      }
    }
    for (let i = 0; i < preset.uiBadgeZones.length; i += 1) {
      const z = preset.uiBadgeZones[i].normRect;
      const clearRightX = primary.faceBox.x - (z.x + z.width + 0.02) * cropWidth;
      const clearLeftX = primary.faceBox.x + primary.faceBox.width - (z.x - 0.02) * cropWidth;
      const clearBelowY = primary.faceBox.y - (z.y + z.height + 0.02) * cropHeight;
      const clearAboveY = primary.faceBox.y + primary.faceBox.height - (z.y - 0.02) * cropHeight;
      pushClamped(clearRightX, primary.eyeLinePoint.y - idealMidY * cropHeight);
      pushClamped(clearLeftX, primary.eyeLinePoint.y - idealMidY * cropHeight);
      pushClamped(primary.eyeLinePoint.x - 0.5 * cropWidth, clearBelowY);
      pushClamped(primary.eyeLinePoint.x - 0.5 * cropWidth, clearAboveY);
      pushClamped(clearRightX, clearBelowY);
      pushClamped(clearLeftX, clearAboveY);
    }
  }

  const steps = Math.max(3, Math.floor(gridSteps));
  for (let gx = 0; gx < steps; gx += 1) {
    const x = bounds.xMin + (bounds.xMax - bounds.xMin) * (steps === 1 ? 0.5 : gx / (steps - 1));
    for (let gy = 0; gy < steps; gy += 1) {
      const y = bounds.yMin + (bounds.yMax - bounds.yMin) * (steps === 1 ? 0.5 : gy / (steps - 1));
      candidates.push({ x, y });
    }
  }
  return candidates;
}

function solveSinglePresetCrop(
  source: SmartThumbnailSourceSpec,
  preset: PlatformThumbnailPresetSpec,
  sortedSubjects: readonly CropSubjectSpec[],
  options: Required<SmartThumbnailSolverOptions>,
): SolvedPresetCrop {
  const primary = sortedSubjects.length > 0 ? sortedSubjects[0] : null;
  const { maxWidth, maxHeight } = computeMaxInscribedSize(
    source.sourceWidthPx,
    source.sourceHeightPx,
    preset.targetAspectRatio,
  );
  const candidateScales = buildCandidateScales(
    preset,
    primary,
    maxWidth,
    maxHeight,
    options.upscaleWarningThreshold,
    options.minScaleFraction,
    options.scaleSampleCount,
  );

  let bestEval: CandidateEvaluation | null = null;
  let bestScale = 1.0;

  for (let si = 0; si < candidateScales.length; si += 1) {
    const scale = candidateScales[si];
    const w = maxWidth * scale;
    const h = maxHeight * scale;
    const bounds = computeFeasibleAnchorBounds(source.sourceWidthPx, source.sourceHeightPx, w, h, primary);
    const anchors = buildAnchorCandidates(bounds, w, h, preset, primary, options.gridStepsPerAxis);
    for (let ai = 0; ai < anchors.length; ai += 1) {
      const ev = evaluateCropCandidate(
        { x: anchors[ai].x, y: anchors[ai].y, width: w, height: h },
        source,
        preset,
        sortedSubjects,
        options.upscaleWarningThreshold,
        options.faceComfortMarginRatio,
      );
      if (bestEval === null || ev.score > bestEval.score) {
        bestEval = ev;
        bestScale = scale;
      }
    }
  }

  // 결정론적 국소 정밀 탐색(위치 + 스케일 미세 조정)
  if (bestEval !== null) {
    let stepFrac = 0.04;
    const faceMinScale = primary ? Math.max(primary.faceBox.width / maxWidth, primary.faceBox.height / maxHeight) : 0;
    const refineMinScale = clampNumber(Math.max(options.minScaleFraction, faceMinScale <= 1 ? faceMinScale : 1), 0.05, 1.0);
    for (let iter = 0; iter < 5; iter += 1) {
      let improved = false;
      const cur = bestEval;
      const scaleDeltas = [0, -stepFrac, stepFrac];
      for (let sd = 0; sd < scaleDeltas.length; sd += 1) {
        const nextScale = clampNumber(bestScale + scaleDeltas[sd], refineMinScale, 1.0);
        const w = maxWidth * nextScale;
        const h = maxHeight * nextScale;
        const bounds = computeFeasibleAnchorBounds(source.sourceWidthPx, source.sourceHeightPx, w, h, primary);
        const dxStep = (bounds.xMax - bounds.xMin) * stepFrac;
        const dyStep = (bounds.yMax - bounds.yMin) * stepFrac;
        const baseX = clampNumber(cur.crop.x + (cur.crop.width - w) * 0.5, bounds.xMin, bounds.xMax);
        const baseY = clampNumber(cur.crop.y + (cur.crop.height - h) * 0.5, bounds.yMin, bounds.yMax);
        const offsets: readonly (readonly [number, number])[] = [[0, 0], [-dxStep, 0], [dxStep, 0], [0, -dyStep], [0, dyStep]];
        for (let oi = 0; oi < offsets.length; oi += 1) {
          const ev = evaluateCropCandidate(
            {
              x: clampNumber(baseX + offsets[oi][0], bounds.xMin, bounds.xMax),
              y: clampNumber(baseY + offsets[oi][1], bounds.yMin, bounds.yMax),
              width: w,
              height: h,
            },
            source,
            preset,
            sortedSubjects,
            options.upscaleWarningThreshold,
            options.faceComfortMarginRatio,
          );
          if (ev.score > bestEval.score + 1e-9) {
            bestEval = ev;
            bestScale = nextScale;
            improved = true;
          }
        }
      }
      stepFrac *= improved ? 0.65 : 0.5;
    }
  }

  const finalEval =
    bestEval ??
    evaluateCropCandidate(
      { x: (source.sourceWidthPx - maxWidth) * 0.5, y: (source.sourceHeightPx - maxHeight) * 0.5, width: maxWidth, height: maxHeight },
      source,
      preset,
      sortedSubjects,
      options.upscaleWarningThreshold,
      options.faceComfortMarginRatio,
    );

  const crop = finalEval.crop;
  const cropAspectRatio = crop.width / crop.height;
  const aspectRatioRelativeError = Math.abs(cropAspectRatio - preset.targetAspectRatio) / preset.targetAspectRatio;
  const withinSourceBounds =
    crop.x >= -BOUNDS_EPSILON &&
    crop.y >= -BOUNDS_EPSILON &&
    crop.x + crop.width <= source.sourceWidthPx + BOUNDS_EPSILON &&
    crop.y + crop.height <= source.sourceHeightPx + BOUNDS_EPSILON;

  const badgeRects = finalEval.projectedUiBadges.map((b) => b.sourceRect);
  const subjectCoverages: SubjectCropCoverage[] = sortedSubjects.map((sub, idx) => {
    const faceContainedRatio = clampNumber(rectIntersectionArea(sub.faceBox, crop) / Math.max(1e-9, rectArea(sub.faceBox)), 0, 1);
    const faceFullyContained = isRectContainedIn(sub.faceBox, crop) || faceContainedRatio >= 1 - CONTAINMENT_EPSILON;
    const eyeNormX = (sub.eyeLinePoint.x - crop.x) / crop.width;
    const eyeNormY = (sub.eyeLinePoint.y - crop.y) / crop.height;
    let eyeOccludedByUiBadge = false;
    for (let bi = 0; bi < badgeRects.length; bi += 1) {
      if (pointInsideRect(sub.eyeLinePoint, badgeRects[bi], 1)) {
        eyeOccludedByUiBadge = true;
        break;
      }
    }
    return {
      subjectId: sub.subjectId,
      labelKo: sub.labelKo,
      priority: sub.priority,
      isPrimary: idx === 0,
      faceContainedRatio,
      faceFullyContained,
      eyeNormX,
      eyeNormY,
      eyeInsideCrop: eyeNormX >= 0 && eyeNormX <= 1 && eyeNormY >= 0 && eyeNormY <= 1,
      eyeOccludedByUiBadge,
    };
  });

  const lowResolutionWarning = finalEval.upscaleRatio > options.upscaleWarningThreshold;
  const warningsKo: string[] = [];
  if (!finalEval.primaryFaceFullyContained) warningsKo.push("주연 얼굴 일부가 크롭 영역 밖으로 벗어났습니다.");
  if (finalEval.primaryEyeOccludedByUiBadge) warningsKo.push("플랫폼 UI 배지 영역이 주연 시선 좌표를 가립니다.");
  if (lowResolutionWarning) {
    warningsKo.push(`업스케일 배율(${finalEval.upscaleRatio.toFixed(2)}배)이 권장 한계(${options.upscaleWarningThreshold.toFixed(1)}배)를 초과합니다.`);
  }

  return {
    presetId: preset.presetId,
    preset,
    cropWindow: crop,
    cropAspectRatio,
    aspectRatioRelativeError,
    withinSourceBounds,
    primarySubjectId: primary ? primary.subjectId : null,
    primaryFaceContainedRatio: finalEval.primaryFaceContainedRatio,
    primaryFaceFullyContained: finalEval.primaryFaceFullyContained,
    primaryEyeNorm: finalEval.primaryEyeNorm,
    ruleOfThirdsAlignmentScore: finalEval.ruleOfThirdsAlignmentScore,
    primaryEyeOccludedByUiBadge: finalEval.primaryEyeOccludedByUiBadge,
    primaryFaceBadgeOverlapRatio: finalEval.primaryFaceBadgeOverlapRatio,
    projectedUiBadges: finalEval.projectedUiBadges,
    subjectCoverages,
    upscaleRatio: finalEval.upscaleRatio,
    lowResolutionWarning,
    compositeScore: finalEval.score,
    warningsKo,
  };
}

/** 비교 기준용 단순 중앙 크롭 계산(스마트 크롭과 얼굴 보존율 비교 시 사용). */
export function computeNaiveCenterCrop(
  sourceSpec: SmartThumbnailSourceSpec,
  presetId: PlatformThumbnailPresetId,
): { readonly cropWindow: Rect2D; readonly primaryFaceContainedRatio: number; readonly primaryFaceFullyContained: boolean } {
  validateSourceSpec(sourceSpec);
  const preset = PLATFORM_THUMBNAIL_PRESETS[presetId];
  if (!preset) throw new SmartThumbnailError("UNKNOWN_PRESET_ID", `알 수 없는 프리셋입니다: ${String(presetId)}`);

  const { maxWidth, maxHeight } = computeMaxInscribedSize(sourceSpec.sourceWidthPx, sourceSpec.sourceHeightPx, preset.targetAspectRatio);
  const cropWindow: Rect2D = {
    x: (sourceSpec.sourceWidthPx - maxWidth) * 0.5,
    y: (sourceSpec.sourceHeightPx - maxHeight) * 0.5,
    width: maxWidth,
    height: maxHeight,
  };
  const sorted = sortSubjectsByPriority(sourceSpec.subjects);
  const primary = sorted.length > 0 ? sorted[0] : null;
  if (!primary) return { cropWindow, primaryFaceContainedRatio: 1, primaryFaceFullyContained: true };

  const ratio = clampNumber(rectIntersectionArea(primary.faceBox, cropWindow) / Math.max(1e-9, rectArea(primary.faceBox)), 0, 1);
  return { cropWindow, primaryFaceContainedRatio: ratio, primaryFaceFullyContained: isRectContainedIn(primary.faceBox, cropWindow) || ratio >= 1 - CONTAINMENT_EPSILON };
}

/** 다중 플랫폼 표준 규격에 대한 스마트 눈높이 크롭·UI 배지 회피 일괄 계산. */
export function solveSmartThumbnailCrops(
  sourceSpec: SmartThumbnailSourceSpec,
  presetIds: readonly PlatformThumbnailPresetId[] = ALL_PLATFORM_THUMBNAIL_PRESET_IDS,
  options?: SmartThumbnailSolverOptions,
): SmartThumbnailCropSolution {
  validateSourceSpec(sourceSpec);
  if (presetIds.length === 0) {
    throw new SmartThumbnailError("EMPTY_PRESET_LIST", "최소 1개 이상의 플랫폼 프리셋을 지정해야 합니다.");
  }
  const resolvedOptions: Required<SmartThumbnailSolverOptions> = {
    upscaleWarningThreshold: options?.upscaleWarningThreshold ?? 2.0,
    faceComfortMarginRatio: options?.faceComfortMarginRatio ?? 0.14,
    minScaleFraction: options?.minScaleFraction ?? 0.18,
    scaleSampleCount: options?.scaleSampleCount ?? 14,
    gridStepsPerAxis: options?.gridStepsPerAxis ?? 11,
  };

  const sortedSubjects = sortSubjectsByPriority(sourceSpec.subjects);
  const crops: SolvedPresetCrop[] = [];
  const lowResolutionPresetIds: PlatformThumbnailPresetId[] = [];
  let allPrimaryFacesContained = true;
  let anyPrimaryEyeOccludedByUiBadge = false;
  let maxAspectRatioRelativeError = 0;

  for (let i = 0; i < presetIds.length; i += 1) {
    const preset = PLATFORM_THUMBNAIL_PRESETS[presetIds[i]];
    if (!preset) throw new SmartThumbnailError("UNKNOWN_PRESET_ID", `알 수 없는 플랫폼 프리셋입니다: ${String(presetIds[i])}`);
    const solved = solveSinglePresetCrop(sourceSpec, preset, sortedSubjects, resolvedOptions);
    crops.push(solved);
    if (!solved.primaryFaceFullyContained) allPrimaryFacesContained = false;
    if (solved.primaryEyeOccludedByUiBadge) anyPrimaryEyeOccludedByUiBadge = true;
    if (solved.lowResolutionWarning) lowResolutionPresetIds.push(solved.presetId);
    if (solved.aspectRatioRelativeError > maxAspectRatioRelativeError) {
      maxAspectRatioRelativeError = solved.aspectRatioRelativeError;
    }
  }

  return {
    artworkId: sourceSpec.artworkId,
    titleKo: sourceSpec.titleKo,
    sourceWidthPx: sourceSpec.sourceWidthPx,
    sourceHeightPx: sourceSpec.sourceHeightPx,
    primarySubjectId: sortedSubjects.length > 0 ? sortedSubjects[0].subjectId : null,
    upscaleWarningThreshold: resolvedOptions.upscaleWarningThreshold,
    crops,
    allPrimaryFacesContained,
    anyPrimaryEyeOccludedByUiBadge,
    lowResolutionPresetIds,
    maxAspectRatioRelativeError,
  };
}
