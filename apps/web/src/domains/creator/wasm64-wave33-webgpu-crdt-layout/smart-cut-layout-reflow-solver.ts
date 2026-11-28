/**
 * Wave-33: 스마트 컷 레이아웃 자동 재배치(Reflow) 최적화 솔버.
 *
 * 세로 스크롤 웹툰(모바일 720px / 800px 가변 여백 호흡) <-> 출판 만화 페이지(좌->우 / 우->좌 단 구성)
 * <-> 숏폼 세로 영상(1080x1920 안전 영역 및 컷 전환 타이밍) 간 원고 레이아웃을
 * 시선 유도선(Reading Eye-Flow Z/S-curve), 컷 중요도 가중치, 피사체 초점 보존,
 * 그리고 말풍선 최소 가독 글자 크기(>= 11px 환산) 손실 없이 결정론적으로 최적 배치한다.
 */

export const MIN_READABLE_BALLOON_FONT_PX = 11;
export const SHORTFORM_CANVAS_WIDTH_PX = 1080;
export const SHORTFORM_CANVAS_HEIGHT_PX = 1920;

export type CutDramaticPacingBeat = "calm" | "dialogue" | "tension" | "climax" | "reveal";
export type MangaReadingDirection = "ltr" | "rtl";
export type EyeFlowCurveKind = "s-curve" | "z-curve-ltr" | "z-curve-rtl";

export interface NormalizedPoint2D {
  readonly xNorm: number;
  readonly yNorm: number;
}

export interface LayoutRectPx {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DialogueBalloonSpec {
  readonly balloonId: string;
  readonly speakerOrder: number;
  readonly textLengthChars: number;
  readonly sourceFontSizePx: number;
  readonly sourceCutWidthPx: number;
  readonly anchorNorm: NormalizedPoint2D;
}

export interface CanonicalCutSpec {
  readonly cutId: string;
  readonly orderIndex: number;
  readonly intrinsicAspectRatio: number;
  readonly importanceWeight: number;
  readonly dramaticPacingBeat: CutDramaticPacingBeat;
  readonly focalAnchor: NormalizedPoint2D;
  readonly balloons: ReadonlyArray<DialogueBalloonSpec>;
}

export interface WebtoonScrollFormatSpec {
  readonly format: "webtoon-scroll";
  readonly viewportWidthPx: number;
  readonly sideMarginPx?: number;
  readonly baseGutterPx?: number;
  readonly minBalloonFontPx?: number;
}

export interface PrintMangaFormatSpec {
  readonly format: "print-manga-page";
  readonly readingDirection: MangaReadingDirection;
  readonly pageWidthPx: number;
  readonly pageHeightPx: number;
  readonly trimMarginPx?: number;
  readonly columnGutterPx?: number;
  readonly rowGutterPx?: number;
  readonly maxCutsPerPage?: number;
  readonly minBalloonFontPx?: number;
}

export interface ShortformVideoFormatSpec {
  readonly format: "shortform-vertical-video";
  readonly canvasWidthPx?: number;
  readonly canvasHeightPx?: number;
  readonly safeAreaRectPx?: LayoutRectPx;
  readonly minBalloonFontPx?: number;
}

export type TargetLayoutFormatSpec =
  | PrintMangaFormatSpec
  | ShortformVideoFormatSpec
  | WebtoonScrollFormatSpec;

export interface ReflowedBalloonPlacement {
  readonly balloonId: string;
  readonly cutId: string;
  readonly speakerOrder: number;
  readonly rectPx: LayoutRectPx;
  readonly effectiveFontSizePx: number;
  readonly wasUpscaledForLegibility: boolean;
}

export interface ReflowedCutPlacement {
  readonly cutId: string;
  readonly orderIndex: number;
  readonly containerIndex: number;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly rectPx: LayoutRectPx;
  readonly resolvedFocalPointPx: { readonly x: number; readonly y: number };
  readonly cropWindowNorm: {
    readonly xNorm: number;
    readonly yNorm: number;
    readonly widthNorm: number;
    readonly heightNorm: number;
  };
  readonly trailingGutterPx: number;
  readonly durationSec: number;
  readonly startTimeSec: number;
  readonly balloons: ReadonlyArray<ReflowedBalloonPlacement>;
}

export interface EyeFlowWaypoint {
  readonly sequenceIndex: number;
  readonly cutId: string;
  readonly balloonId: string | null;
  readonly containerIndex: number;
  readonly x: number;
  readonly y: number;
}

export interface ReflowSolution {
  readonly format: TargetLayoutFormatSpec["format"];
  readonly containerCount: number;
  readonly totalScrollHeightPx: number;
  readonly totalDurationSec: number;
  readonly eyeFlowCurveKind: EyeFlowCurveKind;
  readonly cuts: ReadonlyArray<ReflowedCutPlacement>;
  readonly eyeFlowWaypoints: ReadonlyArray<EyeFlowWaypoint>;
  readonly minResolvedBalloonFontPx: number;
  readonly meanFocalPreservationScore: number;
}

export interface ReflowReadabilityReport {
  readonly valid: boolean;
  readonly narrativeOrderPreserved: boolean;
  readonly minFontThresholdSatisfied: boolean;
  readonly minObservedFontPx: number;
  readonly nonOverlappingCutsPerContainer: boolean;
  readonly eyeFlowDirectionConsistent: boolean;
  readonly violations: ReadonlyArray<string>;
}

const PACING_GUTTER_MULTIPLIER: Readonly<Record<CutDramaticPacingBeat, number>> = {
  dialogue: 0.72, calm: 1.0, tension: 1.65, reveal: 2.25, climax: 2.6,
};

const PACING_HOLD_SEC_BONUS: Readonly<Record<CutDramaticPacingBeat, number>> = {
  dialogue: 0.2, calm: 0.45, tension: 0.75, reveal: 1.1, climax: 1.35,
};

function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return value < lo ? lo : value > hi ? hi : value;
}

function sanitizeAspect(aspect: number): number {
  return !Number.isFinite(aspect) || aspect <= 0 ? 1 : clamp(aspect, 0.25, 4.0);
}

function sanitizeImportance(weight: number): number {
  return !Number.isFinite(weight) ? 0.5 : clamp(weight, 0.1, 2.0);
}

/** 대상 컷 폭에 맞춰 최소 가독 크기(`>= 11px`)를 강제한 말풍선 글자 크기와 외접 박스를 계산한다. */
export function computeBalloonBoxForLegibility(params: {
  readonly balloon: DialogueBalloonSpec;
  readonly targetCutWidthPx: number;
  readonly targetCutHeightPx: number;
  readonly minFontPx?: number;
}): { readonly effectiveFontSizePx: number; readonly wasUpscaledForLegibility: boolean; readonly widthPx: number; readonly heightPx: number } {
  const minFont = Math.max(MIN_READABLE_BALLOON_FONT_PX, params.minFontPx ?? MIN_READABLE_BALLOON_FONT_PX);
  const proportionalFont = Math.max(8, params.balloon.sourceFontSizePx) * Math.max(0.05, params.targetCutWidthPx / Math.max(64, params.balloon.sourceCutWidthPx));
  const effectiveFontSizePx = Math.max(minFont, Math.round(proportionalFont * 100) / 100);
  const wasUpscaledForLegibility = effectiveFontSizePx > proportionalFont + 1e-6;

  const charCount = Math.max(1, Math.ceil(params.balloon.textLengthChars));
  const targetCols = clamp(Math.ceil(Math.sqrt(charCount * 1.45)), 3, 12);
  const charAdvancePx = effectiveFontSizePx * 1.04;
  const lineHeightPx = effectiveFontSizePx * 1.42;
  const padX = effectiveFontSizePx * 1.25;
  const padY = effectiveFontSizePx * 1.05;

  const rawWidth = targetCols * charAdvancePx + padX * 2;
  const rawHeight = Math.max(1, Math.ceil(charCount / targetCols)) * lineHeightPx + padY * 2;
  const widthPx = Math.min(Math.max(effectiveFontSizePx * 3.2, params.targetCutWidthPx * 0.86), rawWidth);
  const recomputedCols = Math.max(2, Math.floor((widthPx - padX * 2) / charAdvancePx));
  const heightPx = Math.min(
    Math.max(effectiveFontSizePx * 2.2, params.targetCutHeightPx * 0.78),
    Math.max(rawHeight, Math.max(1, Math.ceil(charCount / recomputedCols)) * lineHeightPx + padY * 2),
  );
  return { effectiveFontSizePx, wasUpscaledForLegibility, widthPx: Math.round(widthPx * 100) / 100, heightPx: Math.round(heightPx * 100) / 100 };
}

/** 원본과 배치 사각형의 종횡비 차이에서 `focalAnchor`가 잘리지 않는 스마트 크롭 창을 계산한다. */
function solveFocalPreservingCrop(intrinsicAspect: number, targetRect: LayoutRectPx, focalAnchor: NormalizedPoint2D) {
  const srcAspect = sanitizeAspect(intrinsicAspect);
  const dstAspect = sanitizeAspect(targetRect.width / Math.max(1, targetRect.height));
  const fx = clamp(focalAnchor.xNorm, 0, 1);
  const fy = clamp(focalAnchor.yNorm, 0, 1);

  const widthNorm = dstAspect < srcAspect ? clamp(dstAspect / srcAspect, 0.2, 1) : 1;
  const heightNorm = dstAspect > srcAspect ? clamp(srcAspect / dstAspect, 0.2, 1) : 1;
  const xNorm = clamp(fx - widthNorm * 0.5, 0, 1 - widthNorm);
  const yNorm = clamp(fy - heightNorm * 0.5, 0, 1 - heightNorm);
  const localFx = widthNorm > 0 ? (fx - xNorm) / widthNorm : 0.5;
  const localFy = heightNorm > 0 ? (fy - yNorm) / heightNorm : 0.5;
  const edgeClearance = Math.min(localFx, 1 - localFx, localFy, 1 - localFy);

  return {
    cropWindowNorm: { xNorm, yNorm, widthNorm, heightNorm },
    resolvedFocalPointPx: { x: targetRect.x + clamp(localFx, 0, 1) * targetRect.width, y: targetRect.y + clamp(localFy, 0, 1) * targetRect.height },
    preservationScore: clamp(0.65 * widthNorm * heightNorm + 0.35 * Math.min(1, edgeClearance * 4), 0, 1),
  };
}

/** 컷 내부 말풍선들을 시선 유도 곡선과 읽기 순서를 지키며 초점·상호 충돌 없이 배치한다. */
function placeBalloonsInCut(params: {
  readonly cut: CanonicalCutSpec;
  readonly cutRect: LayoutRectPx;
  readonly focalPointPx: { readonly x: number; readonly y: number };
  readonly curveKind: EyeFlowCurveKind;
  readonly cutSequenceIdx: number;
  readonly minFontPx: number;
}): ReadonlyArray<ReflowedBalloonPlacement> {
  const sortedBalloons = [...params.cut.balloons].sort(
    (a, b) => a.speakerOrder - b.speakerOrder || (a.balloonId < b.balloonId ? -1 : 1),
  );
  if (sortedBalloons.length === 0) return [];

  const pad = Math.min(12, Math.max(4, params.cutRect.width * 0.02));
  const placed: ReflowedBalloonPlacement[] = [];
  const count = sortedBalloons.length;

  for (let i = 0; i < count; i += 1) {
    const spec = sortedBalloons[i];
    if (!spec) continue;
    const sized = computeBalloonBoxForLegibility({
      balloon: spec,
      targetCutWidthPx: params.cutRect.width,
      targetCutHeightPx: params.cutRect.height,
      minFontPx: params.minFontPx,
    });

    const usableW = Math.max(1, params.cutRect.width - sized.widthPx - pad * 2);
    const usableH = Math.max(1, params.cutRect.height - sized.heightPx - pad * 2);

    let guideXNorm = clamp(spec.anchorNorm.xNorm, 0.08, 0.92);
    if (params.curveKind === "s-curve") {
      guideXNorm = 0.55 * guideXNorm + 0.45 * ((params.cutSequenceIdx + i) % 2 === 0 ? 0.22 : 0.78);
    } else if (params.curveKind === "z-curve-rtl") {
      guideXNorm = 0.45 * guideXNorm + 0.55 * (count > 1 ? 0.85 - (i / (count - 1)) * 0.7 : 0.78);
    } else {
      guideXNorm = 0.45 * guideXNorm + 0.55 * (count > 1 ? 0.15 + (i / (count - 1)) * 0.7 : 0.22);
    }

    const orderYNorm = count > 1 ? 0.1 + (i / (count - 1)) * 0.58 : clamp(spec.anchorNorm.yNorm, 0.08, 0.36);
    const guideYNorm = 0.35 * clamp(spec.anchorNorm.yNorm, 0.05, 0.85) + 0.65 * orderYNorm;
    let bx = params.cutRect.x + pad + clamp(guideXNorm, 0, 1) * usableW;
    let by = params.cutRect.y + pad + clamp(guideYNorm, 0, 1) * usableH;

    const focalRadius = Math.min(params.cutRect.width, params.cutRect.height) * 0.14;
    if (
      Math.abs(bx + sized.widthPx * 0.5 - params.focalPointPx.x) < sized.widthPx * 0.5 + focalRadius &&
      Math.abs(by + sized.heightPx * 0.5 - params.focalPointPx.y) < sized.heightPx * 0.5 + focalRadius
    ) {
      by =
        params.focalPointPx.y > params.cutRect.y + params.cutRect.height * 0.45
          ? params.cutRect.y + pad
          : params.cutRect.y + params.cutRect.height - pad - sized.heightPx;
    }

    for (const prev of placed) {
      const overlapX = bx < prev.rectPx.x + prev.rectPx.width + 4 && bx + sized.widthPx + 4 > prev.rectPx.x;
      const overlapY = by < prev.rectPx.y + prev.rectPx.height + 4 && by + sized.heightPx + 4 > prev.rectPx.y;
      if (overlapX && overlapY) {
        const pushedDown = prev.rectPx.y + prev.rectPx.height + 6;
        if (pushedDown + sized.heightPx <= params.cutRect.y + params.cutRect.height - pad) {
          by = pushedDown;
        } else {
          const shiftX =
            params.curveKind === "z-curve-rtl" ? prev.rectPx.x - sized.widthPx - 6 : prev.rectPx.x + prev.rectPx.width + 6;
          bx = clamp(shiftX, params.cutRect.x + pad, params.cutRect.x + params.cutRect.width - pad - sized.widthPx);
        }
      }
    }

    bx = clamp(bx, params.cutRect.x + pad, Math.max(params.cutRect.x + pad, params.cutRect.x + params.cutRect.width - pad - sized.widthPx));
    by = clamp(by, params.cutRect.y + pad, Math.max(params.cutRect.y + pad, params.cutRect.y + params.cutRect.height - pad - sized.heightPx));

    placed.push({
      balloonId: spec.balloonId,
      cutId: params.cut.cutId,
      speakerOrder: spec.speakerOrder,
      rectPx: { x: Math.round(bx * 100) / 100, y: Math.round(by * 100) / 100, width: sized.widthPx, height: sized.heightPx },
      effectiveFontSizePx: sized.effectiveFontSizePx,
      wasUpscaledForLegibility: sized.wasUpscaledForLegibility,
    });
  }
  return placed;
}

function buildEyeFlowWaypoints(cuts: ReadonlyArray<ReflowedCutPlacement>): ReadonlyArray<EyeFlowWaypoint> {
  const waypoints: EyeFlowWaypoint[] = [];
  let seq = 0;
  for (const cut of cuts) {
    if (cut.balloons.length === 0) {
      waypoints.push({ sequenceIndex: seq, cutId: cut.cutId, balloonId: null, containerIndex: cut.containerIndex, x: cut.resolvedFocalPointPx.x, y: cut.resolvedFocalPointPx.y });
      seq += 1;
      continue;
    }
    for (const b of cut.balloons) {
      waypoints.push({ sequenceIndex: seq, cutId: cut.cutId, balloonId: b.balloonId, containerIndex: cut.containerIndex, x: b.rectPx.x + b.rectPx.width * 0.5, y: b.rectPx.y + b.rectPx.height * 0.5 });
      seq += 1;
    }
  }
  return waypoints;
}

function createCutPlacementRecord(params: {
  readonly cut: CanonicalCutSpec;
  readonly containerIndex: number;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly rectPx: LayoutRectPx;
  readonly curveKind: EyeFlowCurveKind;
  readonly cutSequenceIdx: number;
  readonly minFontPx: number;
  readonly trailingGutterPx: number;
  readonly durationSec: number;
  readonly startTimeSec: number;
  readonly scoresOut: number[];
}): ReflowedCutPlacement {
  const crop = solveFocalPreservingCrop(params.cut.intrinsicAspectRatio, params.rectPx, params.cut.focalAnchor);
  params.scoresOut.push(crop.preservationScore);
  const balloons = placeBalloonsInCut({
    cut: params.cut,
    cutRect: params.rectPx,
    focalPointPx: crop.resolvedFocalPointPx,
    curveKind: params.curveKind,
    cutSequenceIdx: params.cutSequenceIdx,
    minFontPx: params.minFontPx,
  });
  return {
    cutId: params.cut.cutId,
    orderIndex: params.cut.orderIndex,
    containerIndex: params.containerIndex,
    rowIndex: params.rowIndex,
    columnIndex: params.columnIndex,
    rectPx: params.rectPx,
    resolvedFocalPointPx: crop.resolvedFocalPointPx,
    cropWindowNorm: crop.cropWindowNorm,
    trailingGutterPx: params.trailingGutterPx,
    durationSec: params.durationSec,
    startTimeSec: params.startTimeSec,
    balloons,
  };
}

function finalizeSolutionMetrics(
  format: TargetLayoutFormatSpec["format"],
  containerCount: number,
  totalScrollHeightPx: number,
  totalDurationSec: number,
  eyeFlowCurveKind: EyeFlowCurveKind,
  cuts: ReadonlyArray<ReflowedCutPlacement>,
  preservationScores: ReadonlyArray<number>,
  defaultMinFontPx: number,
): ReflowSolution {
  let minFont = Number.POSITIVE_INFINITY;
  for (const cut of cuts) {
    for (const b of cut.balloons) if (b.effectiveFontSizePx < minFont) minFont = b.effectiveFontSizePx;
  }
  const meanPreservation =
    preservationScores.length > 0 ? preservationScores.reduce((acc, s) => acc + s, 0) / preservationScores.length : 1;
  return {
    format,
    containerCount,
    totalScrollHeightPx: Math.round(totalScrollHeightPx * 100) / 100,
    totalDurationSec: Math.round(totalDurationSec * 1000) / 1000,
    eyeFlowCurveKind,
    cuts,
    eyeFlowWaypoints: buildEyeFlowWaypoints(cuts),
    minResolvedBalloonFontPx: Number.isFinite(minFont) ? minFont : defaultMinFontPx,
    meanFocalPreservationScore: Math.round(meanPreservation * 10000) / 10000,
  };
}

function solveWebtoonScroll(sortedCuts: ReadonlyArray<CanonicalCutSpec>, spec: WebtoonScrollFormatSpec): ReflowSolution {
  const viewportW = Math.max(320, Math.floor(spec.viewportWidthPx));
  const minFontPx = Math.max(MIN_READABLE_BALLOON_FONT_PX, spec.minBalloonFontPx ?? MIN_READABLE_BALLOON_FONT_PX);
  const scaleFactor = viewportW / 800;
  const sideMargin = Math.max(0, spec.sideMarginPx ?? Math.round(28 * scaleFactor));
  const baseGutter = Math.max(24, spec.baseGutterPx ?? Math.round(132 * scaleFactor));

  let cursorY = Math.round(48 * scaleFactor);
  const placements: ReflowedCutPlacement[] = [];
  const scores: number[] = [];

  for (let idx = 0; idx < sortedCuts.length; idx += 1) {
    const cut = sortedCuts[idx];
    if (!cut) continue;
    const imp = sanitizeImportance(cut.importanceWeight);
    const marginX = cut.dramaticPacingBeat === "climax" || imp >= 0.9 ? 0 : sideMargin;
    const cutWidth = Math.max(160, viewportW - marginX * 2);
    const rawHeight = (cutWidth / sanitizeAspect(cut.intrinsicAspectRatio)) * (0.92 + 0.18 * Math.min(1.5, imp));
    const cutHeight = Math.round(clamp(rawHeight, viewportW * 0.35, viewportW * 2.15));
    const trailingGutterPx =
      idx + 1 < sortedCuts.length
        ? Math.round(baseGutter * PACING_GUTTER_MULTIPLIER[cut.dramaticPacingBeat] * (0.85 + 0.3 * Math.min(1.4, imp)))
        : Math.round(64 * scaleFactor);

    placements.push(
      createCutPlacementRecord({
        cut,
        containerIndex: 0,
        rowIndex: idx,
        columnIndex: 0,
        rectPx: { x: marginX, y: cursorY, width: cutWidth, height: cutHeight },
        curveKind: "s-curve",
        cutSequenceIdx: idx,
        minFontPx,
        trailingGutterPx,
        durationSec: 0,
        startTimeSec: 0,
        scoresOut: scores,
      }),
    );
    cursorY += cutHeight + trailingGutterPx;
  }

  return finalizeSolutionMetrics("webtoon-scroll", sortedCuts.length > 0 ? 1 : 0, cursorY, 0, "s-curve", placements, scores, minFontPx);
}

/** 동적 계획법(DP)으로 컷 시퀀스를 1~3단 행(Tier)으로 최적 분할한 뒤 페이지 단위로 조판한다. */
function solvePrintMangaPages(sortedCuts: ReadonlyArray<CanonicalCutSpec>, spec: PrintMangaFormatSpec): ReflowSolution {
  const minFontPx = Math.max(MIN_READABLE_BALLOON_FONT_PX, spec.minBalloonFontPx ?? MIN_READABLE_BALLOON_FONT_PX);
  const curveKind: EyeFlowCurveKind = spec.readingDirection === "rtl" ? "z-curve-rtl" : "z-curve-ltr";
  if (sortedCuts.length === 0) {
    return finalizeSolutionMetrics("print-manga-page", 0, 0, 0, curveKind, [], [], minFontPx);
  }

  const pageW = Math.max(400, Math.floor(spec.pageWidthPx));
  const pageH = Math.max(560, Math.floor(spec.pageHeightPx));
  const margin = Math.max(16, spec.trimMarginPx ?? Math.round(pageW * 0.055));
  const colGutter = Math.max(6, spec.columnGutterPx ?? Math.round(pageW * 0.015));
  const rowGutter = Math.max(8, spec.rowGutterPx ?? Math.round(pageH * 0.016));
  const maxCutsPerPage = Math.max(1, Math.min(8, spec.maxCutsPerPage ?? 5));
  const innerW = Math.max(200, pageW - margin * 2);
  const innerH = Math.max(280, pageH - margin * 2);
  const targetRowH = innerH * 0.31;

  const n = sortedCuts.length;
  const dpCost = new Float64Array(n + 1).fill(Number.POSITIVE_INFINITY);
  const dpPrev = new Int32Array(n + 1).fill(-1);
  dpCost[0] = 0;

  for (let end = 1; end <= n; end += 1) {
    for (let k = 1; k <= 3 && end - k >= 0; k += 1) {
      const start = end - k;
      const rowCuts = sortedCuts.slice(start, end);
      const availRowW = innerW - colGutter * (k - 1);
      const weightSum = rowCuts.reduce(
        (acc, c) => acc + sanitizeAspect(c.intrinsicAspectRatio) * (0.7 + 0.6 * sanitizeImportance(c.importanceWeight)),
        0,
      );

      let rowPenalty = 0;
      for (const c of rowCuts) {
        const imp = sanitizeImportance(c.importanceWeight);
        const wShare = (sanitizeAspect(c.intrinsicAspectRatio) * (0.7 + 0.6 * imp)) / Math.max(1e-6, weightSum);
        const estW = availRowW * wShare;
        const aspectLogDiff = Math.log(estW / targetRowH / sanitizeAspect(c.intrinsicAspectRatio));
        rowPenalty += aspectLogDiff * aspectLogDiff * 1.4;

        if ((c.dramaticPacingBeat === "climax" || imp >= 0.95) && k > 1) rowPenalty += 4.5 * k;
        else if (imp < 0.45 && k === 1 && n > 1) rowPenalty += 0.85;

        let balloonAreaSum = 0;
        for (const b of c.balloons) {
          const box = computeBalloonBoxForLegibility({ balloon: b, targetCutWidthPx: estW, targetCutHeightPx: targetRowH, minFontPx });
          balloonAreaSum += box.widthPx * box.heightPx;
        }
        const occlusionRatio = balloonAreaSum / Math.max(1, estW * targetRowH);
        if (occlusionRatio > 0.38) rowPenalty += (occlusionRatio - 0.38) * 28;
      }

      const candidate = (dpCost[start] ?? Number.POSITIVE_INFINITY) + rowPenalty + 0.18;
      if (candidate < (dpCost[end] ?? Number.POSITIVE_INFINITY)) {
        dpCost[end] = candidate;
        dpPrev[end] = start;
      }
    }
  }

  const rowGroups: CanonicalCutSpec[][] = [];
  let cursor = n;
  while (cursor > 0) {
    const prev = dpPrev[cursor] ?? cursor - 1;
    const safePrev = prev >= 0 ? prev : cursor - 1;
    rowGroups.push(sortedCuts.slice(safePrev, cursor));
    cursor = safePrev;
  }
  rowGroups.reverse();

  const pages: CanonicalCutSpec[][][] = [];
  let currentPageRows: CanonicalCutSpec[][] = [];
  let currentPageCutCount = 0;
  for (const row of rowGroups) {
    if (currentPageRows.length > 0 && (currentPageRows.length >= 3 || currentPageCutCount + row.length > maxCutsPerPage)) {
      pages.push(currentPageRows);
      currentPageRows = [];
      currentPageCutCount = 0;
    }
    currentPageRows.push(row);
    currentPageCutCount += row.length;
  }
  if (currentPageRows.length > 0) pages.push(currentPageRows);

  const placements: ReflowedCutPlacement[] = [];
  const scores: number[] = [];
  let globalCutSeq = 0;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx += 1) {
    const rows = pages[pageIdx] ?? [];
    const usablePageH = Math.max(120, innerH - rowGutter * Math.max(0, rows.length - 1));
    const rowIdealHeights = rows.map((row) => {
      const meanImp = row.reduce((acc, c) => acc + sanitizeImportance(c.importanceWeight), 0) / row.length;
      const maxImp = row.reduce((acc, c) => Math.max(acc, sanitizeImportance(c.importanceWeight)), 0);
      const sumAspect = row.reduce((acc, c) => acc + sanitizeAspect(c.intrinsicAspectRatio), 0);
      return (innerW / Math.max(0.6, sumAspect)) * (0.75 + 0.35 * meanImp + 0.2 * maxImp);
    });
    const idealHeightSum = rowIdealHeights.reduce((acc, h) => acc + h, 0);

    let rowY = margin;
    for (let rIdx = 0; rIdx < rows.length; rIdx += 1) {
      const row = rows[rIdx] ?? [];
      const rowShare = (rowIdealHeights[rIdx] ?? 1) / Math.max(1e-6, idealHeightSum);
      const rowH =
        rIdx + 1 === rows.length ? Math.max(80, margin + innerH - rowY) : Math.max(80, Math.round(usablePageH * rowShare));

      const usableRowW = Math.max(120, innerW - colGutter * Math.max(0, row.length - 1));
      const colWeights = row.map(
        (c) => sanitizeAspect(c.intrinsicAspectRatio) * (0.75 + 0.5 * sanitizeImportance(c.importanceWeight)),
      );
      const colWeightSum = colWeights.reduce((acc, w) => acc + w, 0);
      let ltrCursorX = margin;
      let rtlCursorRight = margin + innerW;

      for (let cIdx = 0; cIdx < row.length; cIdx += 1) {
        const cut = row[cIdx];
        if (!cut) continue;
        const wRatio = (colWeights[cIdx] ?? 1) / Math.max(1e-6, colWeightSum);
        const isLast = cIdx + 1 === row.length;
        let cutW: number;
        let cutX: number;
        if (spec.readingDirection === "rtl") {
          cutW = isLast ? Math.max(64, rtlCursorRight - margin) : Math.max(64, Math.round(usableRowW * wRatio));
          cutX = rtlCursorRight - cutW;
          rtlCursorRight = cutX - colGutter;
        } else {
          cutW = isLast ? Math.max(64, margin + innerW - ltrCursorX) : Math.max(64, Math.round(usableRowW * wRatio));
          cutX = ltrCursorX;
          ltrCursorX = cutX + cutW + colGutter;
        }

        placements.push(
          createCutPlacementRecord({
            cut,
            containerIndex: pageIdx,
            rowIndex: rIdx,
            columnIndex: cIdx,
            rectPx: { x: cutX, y: rowY, width: cutW, height: rowH },
            curveKind,
            cutSequenceIdx: globalCutSeq,
            minFontPx,
            trailingGutterPx: 0,
            durationSec: 0,
            startTimeSec: 0,
            scoresOut: scores,
          }),
        );
        globalCutSeq += 1;
      }
      rowY += rowH + rowGutter;
    }
  }

  return finalizeSolutionMetrics("print-manga-page", pages.length, pages.length * pageH, 0, curveKind, placements, scores, minFontPx);
}

function solveShortformVerticalVideo(sortedCuts: ReadonlyArray<CanonicalCutSpec>, spec: ShortformVideoFormatSpec): ReflowSolution {
  const canvasW = Math.max(360, Math.floor(spec.canvasWidthPx ?? SHORTFORM_CANVAS_WIDTH_PX));
  const canvasH = Math.max(640, Math.floor(spec.canvasHeightPx ?? SHORTFORM_CANVAS_HEIGHT_PX));
  const minFontPx = Math.max(MIN_READABLE_BALLOON_FONT_PX, spec.minBalloonFontPx ?? MIN_READABLE_BALLOON_FONT_PX);
  const safeRect: LayoutRectPx = spec.safeAreaRectPx ?? {
    x: Math.round(canvasW * 0.045),
    y: Math.round(canvasH * 0.065),
    width: Math.round(canvasW * 0.845),
    height: Math.round(canvasH * 0.79),
  };

  const placements: ReflowedCutPlacement[] = [];
  const scores: number[] = [];
  let timelineSec = 0;

  for (let idx = 0; idx < sortedCuts.length; idx += 1) {
    const cut = sortedCuts[idx];
    if (!cut) continue;
    const imp = sanitizeImportance(cut.importanceWeight);
    const aspect = sanitizeAspect(cut.intrinsicAspectRatio);

    let frameH = Math.min(safeRect.height, safeRect.width / Math.max(0.55, Math.min(1.35, aspect)));
    frameH =
      cut.dramaticPacingBeat === "climax" || imp >= 0.9
        ? safeRect.height
        : clamp(frameH * (0.88 + 0.12 * imp), safeRect.height * 0.56, safeRect.height);

    const totalChars = cut.balloons.reduce((acc, b) => acc + Math.max(0, b.textLengthChars), 0);
    const roundedDur =
      Math.round(
        clamp(1.35 + totalChars / 7.5 + PACING_HOLD_SEC_BONUS[cut.dramaticPacingBeat] + 0.45 * imp, 1.5, 8.5) * 1000,
      ) / 1000;

    placements.push(
      createCutPlacementRecord({
        cut,
        containerIndex: idx,
        rowIndex: 0,
        columnIndex: 0,
        rectPx: { x: safeRect.x, y: safeRect.y + Math.round((safeRect.height - frameH) * 0.5), width: Math.round(safeRect.width), height: Math.round(frameH) },
        curveKind: "s-curve",
        cutSequenceIdx: idx,
        minFontPx,
        trailingGutterPx: 0,
        durationSec: roundedDur,
        startTimeSec: Math.round(timelineSec * 1000) / 1000,
        scoresOut: scores,
      }),
    );
    timelineSec += roundedDur;
  }

  return finalizeSolutionMetrics("shortform-vertical-video", sortedCuts.length, sortedCuts.length * canvasH, timelineSec, "s-curve", placements, scores, minFontPx);
}

/** 정규 컷 시퀀스를 목표 매체(웹툰 스크롤·출판 만화·숏폼 영상) 레이아웃으로 결정론적 리플로우한다. */
export function reflowCanonicalCutsToFormat(
  cuts: ReadonlyArray<CanonicalCutSpec>,
  targetSpec: TargetLayoutFormatSpec,
): ReflowSolution {
  const sortedCuts = [...cuts].sort((a, b) => a.orderIndex - b.orderIndex || (a.cutId < b.cutId ? -1 : 1));
  switch (targetSpec.format) {
    case "webtoon-scroll":
      return solveWebtoonScroll(sortedCuts, targetSpec);
    case "print-manga-page":
      return solvePrintMangaPages(sortedCuts, targetSpec);
    case "shortform-vertical-video":
      return solveShortformVerticalVideo(sortedCuts, targetSpec);
  }
}

/** 리플로우 결과의 서사 순서, 최소 글자 크기(`>= 11px`), 컷 비충돌, 시선 유도 일관성 불변식을 검증한다. */
export function verifyReflowReadabilityInvariants(
  solution: ReflowSolution,
  minFontThresholdPx = MIN_READABLE_BALLOON_FONT_PX,
): ReflowReadabilityReport {
  const violations: string[] = [];
  let narrativeOrderPreserved = true;
  for (let i = 1; i < solution.cuts.length; i += 1) {
    const prev = solution.cuts[i - 1];
    const curr = solution.cuts[i];
    if (prev && curr && curr.orderIndex < prev.orderIndex) {
      narrativeOrderPreserved = false;
      violations.push(`컷 순서 역전 감지: ${prev.cutId} -> ${curr.cutId}`);
    }
  }

  let minObservedFontPx = Number.POSITIVE_INFINITY;
  let minFontThresholdSatisfied = true;
  for (const cut of solution.cuts) {
    for (const b of cut.balloons) {
      if (b.effectiveFontSizePx < minObservedFontPx) minObservedFontPx = b.effectiveFontSizePx;
      if (b.effectiveFontSizePx + 1e-6 < minFontThresholdPx) {
        minFontThresholdSatisfied = false;
        violations.push(`말풍선 최소 가독 크기 미달(${b.balloonId}: ${b.effectiveFontSizePx}px < ${minFontThresholdPx}px)`);
      }
    }
  }
  if (!Number.isFinite(minObservedFontPx)) minObservedFontPx = minFontThresholdPx;

  let nonOverlappingCutsPerContainer = true;
  const byContainer = new Map<number, ReflowedCutPlacement[]>();
  for (const cut of solution.cuts) {
    const list = byContainer.get(cut.containerIndex) ?? [];
    list.push(cut);
    byContainer.set(cut.containerIndex, list);
  }
  for (const [cIdx, group] of byContainer.entries()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const a = group[i]?.rectPx;
        const b = group[j]?.rectPx;
        if (!a || !b) continue;
        const overlapW = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const overlapH = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (overlapW > 0.5 && overlapH > 0.5) {
          nonOverlappingCutsPerContainer = false;
          violations.push(`컨테이너 ${cIdx} 내부 컷 사각형 충돌 발생`);
        }
      }
    }
  }

  let eyeFlowDirectionConsistent = true;
  if (solution.format === "print-manga-page") {
    for (const group of byContainer.values()) {
      for (let i = 1; i < group.length; i += 1) {
        const prev = group[i - 1];
        const curr = group[i];
        if (!prev || !curr) continue;
        if (curr.rowIndex < prev.rowIndex) {
          eyeFlowDirectionConsistent = false;
          violations.push(`페이지 행 시선 역행: ${prev.cutId} -> ${curr.cutId}`);
        } else if (curr.rowIndex === prev.rowIndex) {
          if (solution.eyeFlowCurveKind === "z-curve-rtl" && curr.rectPx.x >= prev.rectPx.x) {
            eyeFlowDirectionConsistent = false;
            violations.push(`우->좌 단 구성 내 가로 시선 역행: ${prev.cutId} -> ${curr.cutId}`);
          }
          if (solution.eyeFlowCurveKind === "z-curve-ltr" && curr.rectPx.x <= prev.rectPx.x) {
            eyeFlowDirectionConsistent = false;
            violations.push(`좌->우 단 구성 내 가로 시선 역행: ${prev.cutId} -> ${curr.cutId}`);
          }
        }
      }
    }
  }

  return {
    valid: violations.length === 0, narrativeOrderPreserved, minFontThresholdSatisfied,
    minObservedFontPx, nonOverlappingCutsPerContainer, eyeFlowDirectionConsistent, violations,
  };
}
