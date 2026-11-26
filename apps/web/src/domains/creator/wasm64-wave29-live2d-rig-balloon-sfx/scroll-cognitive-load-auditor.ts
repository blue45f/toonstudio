/**
 * Wasm64 Wave 29: 모바일 뷰포트(`390×844`) 독자 인지 부하·대사 과밀 연속 구간(`wall-of-text-streak`) 및
 * 호흡 여백(스크롤 거터) 최적화 감사기.
 *
 * - 60~100컷 분량의 세로 웹툰 에피소드 스트립(`totalHeightPx`)을 `390×844` 모바일 화면 단위로 슬라이딩하며
 *   화면당 글자 수(`charsPerViewport`), 말풍선 개수, 시선 초점 밀도, 연속 고밀도 대사 화면 수를 정량 산출한다.
 * - 시각적 휴지 없이 한국어 `160`자를 초과하는 화면이 `3`회 이상 이어지면 `wall-of-text-streak`로 진단하고,
 *   클리프행어 긴장 연출을 해치지 않으면서 최대 인지 부하를 쾌적 임계치 이하로 낮추는 컷 간 백색·암색 여백 삽입량(`recommendedGutterAddPx`)을 계산한다.
 */

export type CutPacingBeat =
  | "normal"
  | "establishing"
  | "dialogue-heavy"
  | "action"
  | "silent-pause"
  | "cliffhanger";

export type ScrollGutterTone = "white" | "dark";

export interface SpeechBalloonSpec {
  readonly balloonId: string;
  readonly textKo: string;
  /** 명시 지정 시 우선 사용하며, 생략 시 공백 제외 가시 글자 수를 자동 계산한다. */
  readonly charCount?: number;
  /** 컷 상단(`0`) 기준 말풍선 상대 Y 오프셋(`px`). 생략 시 컷 내부에 균등 배치한다. */
  readonly offsetYPx?: number;
  readonly heightPx?: number;
  readonly widthPx?: number;
}

export interface EpisodeCutSpec {
  readonly cutId: string;
  readonly heightPx: number;
  /** 스트립 절대 상단 Y(`px`). 생략 시 이전 컷 하단 + `gutterAfterPx`로 누적 계산한다. */
  readonly topPx?: number;
  /** 다음 컷과의 기존 스크롤 간격(`px`). */
  readonly gutterAfterPx?: number;
  readonly balloons: readonly SpeechBalloonSpec[];
  readonly focalPointCount?: number;
  readonly visualComplexity?: number;
  readonly pacingBeat?: CutPacingBeat;
}

export interface EpisodeScrollStripInput {
  readonly episodeId: string;
  readonly cuts: readonly EpisodeCutSpec[];
  readonly totalHeightPx?: number;
  readonly initialTopPaddingPx?: number;
}

export interface ScrollCognitiveAuditOptions {
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly viewportStepPx?: number;
  readonly denseScreenCharThreshold?: number;
  readonly minStreakScreens?: number;
  readonly comfortCognitiveLoadThreshold?: number;
  readonly minCliffhangerLeadInGutterPx?: number;
  readonly maxOptimizationPasses?: number;
}

export interface ViewportScreenLoadSample {
  readonly screenIndex: number;
  readonly topYPx: number;
  readonly bottomYPx: number;
  readonly charsPerViewport: number;
  readonly balloonCount: number;
  readonly focalDensity: number;
  readonly gutterRatio: number;
  readonly hasVisualPause: boolean;
  readonly isDenseDialogueScreen: boolean;
  readonly cognitiveLoadScore: number;
  readonly overlappingCutIds: readonly string[];
}

export interface WallOfTextStreakFinding {
  readonly kind: "wall-of-text-streak";
  readonly startScreenIndex: number;
  readonly endScreenIndex: number;
  readonly consecutiveScreenCount: number;
  readonly startYPx: number;
  readonly endYPx: number;
  readonly peakCharsPerViewport: number;
  readonly meanCharsPerViewport: number;
  readonly involvedCutIds: readonly string[];
  readonly diagnosisKo: string;
}

export interface GutterInsertionRecommendation {
  readonly afterCutId: string;
  readonly afterCutIndex: number;
  readonly existingGutterPx: number;
  readonly recommendedGutterAddPx: number;
  readonly targetTotalGutterPx: number;
  readonly gutterTone: ScrollGutterTone;
  readonly preservesCliffhangerPacing: boolean;
  readonly reasonKo: string;
}

export interface EpisodeScrollAuditMetrics {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly totalHeightPx: number;
  readonly cutCount: number;
  readonly evaluatedScreenCount: number;
  readonly peakCharsPerViewport: number;
  readonly peakCognitiveLoad: number;
  readonly meanCognitiveLoad: number;
  readonly denseDialogueScreenCount: number;
  readonly maxConsecutiveDenseScreens: number;
  readonly screens: readonly ViewportScreenLoadSample[];
  readonly wallOfTextStreaks: readonly WallOfTextStreakFinding[];
  readonly cliffhangerPacingPreserved: boolean;
}

export interface ScrollCognitiveLoadAuditReport {
  readonly episodeId: string;
  readonly comfortThreshold: number;
  readonly denseScreenCharThreshold: number;
  readonly initialMetrics: EpisodeScrollAuditMetrics;
  readonly recommendations: readonly GutterInsertionRecommendation[];
  readonly totalRecommendedGutterAddPx: number;
  readonly projectedMetrics: EpisodeScrollAuditMetrics;
  readonly summaryKo: string;
}

interface ResolvedBalloonRect {
  readonly balloonId: string;
  readonly charCount: number;
  readonly topPx: number;
  readonly bottomPx: number;
  readonly widthPx: number;
}

interface ResolvedCutSegment {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly topPx: number;
  readonly bottomPx: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly focalPointCount: number;
  readonly visualComplexity: number;
  readonly pacingBeat: CutPacingBeat;
  readonly balloons: readonly ResolvedBalloonRect[];
}

const DEFAULT_VIEWPORT_WIDTH_PX = 390;
const DEFAULT_VIEWPORT_HEIGHT_PX = 844;
const DEFAULT_DENSE_CHAR_THRESHOLD = 160;
const DEFAULT_MIN_STREAK_SCREENS = 3;
const DEFAULT_COMFORT_LOAD_THRESHOLD = 68;
const DEFAULT_CLIFFHANGER_LEAD_IN_PX = 360;
const GUTTER_QUANTUM_PX = 20;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function round2(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function quantizeUpPx(px: number): number {
  return Math.ceil(Math.max(0, px) / GUTTER_QUANTUM_PX) * GUTTER_QUANTUM_PX;
}

function isWhitespaceCodePoint(ch: string): boolean {
  const code = ch.charCodeAt(0);
  return code === 32 || code === 9 || code === 10 || code === 13 || code === 160 || code === 12288;
}

/** 공백·개행을 제외한 실제 가독 대사 글자 수를 정규식 없이 선형 시간으로 계산한다. */
export function countReadableDialogueChars(textKo: string): number {
  let count = 0;
  for (const ch of textKo) {
    if (!isWhitespaceCodePoint(ch)) count += 1;
  }
  return count;
}

function extractBaseGutters(strip: EpisodeScrollStripInput): number[] {
  const cuts = strip.cuts;
  return cuts.map((cur, i) => {
    const next = cuts[i + 1];
    if (cur.gutterAfterPx !== undefined && Number.isFinite(cur.gutterAfterPx)) {
      return Math.max(0, cur.gutterAfterPx);
    }
    if (
      next &&
      cur.topPx !== undefined &&
      next.topPx !== undefined &&
      Number.isFinite(cur.topPx) &&
      Number.isFinite(next.topPx)
    ) {
      return Math.max(0, next.topPx - (cur.topPx + Math.max(40, cur.heightPx)));
    }
    return i < cuts.length - 1 ? 48 : 0;
  });
}

function resolveStripSegments(
  strip: EpisodeScrollStripInput,
  baseGutters: readonly number[],
  addedGutters: readonly number[],
  viewportWidthPx: number,
): { readonly segments: readonly ResolvedCutSegment[]; readonly totalHeightPx: number } {
  const firstCut = strip.cuts[0];
  let cursorY = Math.max(
    0,
    strip.initialTopPaddingPx ??
      (firstCut?.topPx !== undefined && Number.isFinite(firstCut.topPx) ? firstCut.topPx : 0),
  );
  const segments: ResolvedCutSegment[] = [];

  for (let i = 0; i < strip.cuts.length; i += 1) {
    const cut = strip.cuts[i];
    if (!cut) continue;
    const heightPx = Math.max(40, Number.isFinite(cut.heightPx) ? cut.heightPx : 400);
    const topPx = cursorY;
    const bottomPx = topPx + heightPx;
    const gutterAfterPx = Math.max(0, (baseGutters[i] ?? 0) + (addedGutters[i] ?? 0));
    const bCount = cut.balloons.length;

    const resolvedBalloons: ResolvedBalloonRect[] = cut.balloons.map((b, bIdx) => {
      const charCount =
        b.charCount !== undefined && Number.isFinite(b.charCount)
          ? Math.max(0, Math.round(b.charCount))
          : countReadableDialogueChars(b.textKo);
      const defaultSlotSpan = (heightPx * 0.8) / Math.max(1, bCount);
      const bHeight = clamp(b.heightPx ?? Math.min(132, defaultSlotSpan * 0.78), 24, heightPx);
      const relTop = clamp(
        b.offsetYPx ?? heightPx * 0.1 + bIdx * defaultSlotSpan,
        0,
        Math.max(0, heightPx - bHeight),
      );
      return {
        balloonId: b.balloonId,
        charCount,
        topPx: topPx + relTop,
        bottomPx: topPx + relTop + bHeight,
        widthPx: clamp(b.widthPx ?? viewportWidthPx * 0.56, 48, viewportWidthPx),
      };
    });

    segments.push({
      cutIndex: i,
      cutId: cut.cutId,
      topPx,
      bottomPx,
      heightPx,
      gutterAfterPx,
      focalPointCount: clamp(cut.focalPointCount ?? 1, 0, 8),
      visualComplexity: clamp(cut.visualComplexity ?? 0.42, 0, 1),
      pacingBeat: cut.pacingBeat ?? "normal",
      balloons: resolvedBalloons,
    });
    cursorY = bottomPx + gutterAfterPx;
  }

  const totalAdded = addedGutters.reduce((acc, v) => acc + Math.max(0, v), 0);
  return {
    segments,
    totalHeightPx: Math.max(cursorY, (strip.totalHeightPx ?? 0) + totalAdded),
  };
}

function evaluateResolvedStripMetrics(
  segments: readonly ResolvedCutSegment[],
  totalHeightPx: number,
  options: {
    readonly viewportWidthPx: number;
    readonly viewportHeightPx: number;
    readonly viewportStepPx: number;
    readonly denseScreenCharThreshold: number;
    readonly minStreakScreens: number;
    readonly minCliffhangerLeadInGutterPx: number;
  },
): EpisodeScrollAuditMetrics {
  const {
    viewportWidthPx,
    viewportHeightPx,
    viewportStepPx,
    denseScreenCharThreshold,
    minStreakScreens,
    minCliffhangerLeadInGutterPx,
  } = options;
  const safeTotalHeight = Math.max(viewportHeightPx, totalHeightPx);
  const screenCount = Math.max(1, Math.ceil(safeTotalHeight / viewportStepPx));
  const viewportArea = viewportWidthPx * viewportHeightPx;

  const screens: ViewportScreenLoadSample[] = [];
  let peakCharsPerViewport = 0;
  let peakCognitiveLoad = 0;
  let sumCognitiveLoad = 0;
  let denseDialogueScreenCount = 0;

  for (let sIdx = 0; sIdx < screenCount; sIdx += 1) {
    const viewTop = sIdx * viewportStepPx;
    const viewBottom = viewTop + viewportHeightPx;
    let cutOccupiedPx = 0;
    let charsInView = 0;
    let balloonCount = 0;
    let balloonAreaPx = 0;
    let focalAccum = 0;
    let silentPauseVisiblePx = 0;
    const overlappingCutIds: string[] = [];

    for (const seg of segments) {
      if (seg.bottomPx <= viewTop || seg.topPx >= viewBottom) continue;
      const cutOverlapPx = Math.min(viewBottom, seg.bottomPx) - Math.max(viewTop, seg.topPx);
      if (cutOverlapPx <= 0) continue;
      overlappingCutIds.push(seg.cutId);
      cutOccupiedPx += cutOverlapPx;
      focalAccum +=
        (cutOverlapPx / viewportHeightPx) *
        (seg.focalPointCount * 0.14 + seg.visualComplexity * 0.42);
      if (seg.pacingBeat === "silent-pause" && seg.balloons.length === 0) {
        silentPauseVisiblePx += cutOverlapPx;
      }

      for (const b of seg.balloons) {
        const bOverlap = Math.min(viewBottom, b.bottomPx) - Math.max(viewTop, b.topPx);
        if (bOverlap <= 0) continue;
        const fraction = clamp(bOverlap / Math.max(1, b.bottomPx - b.topPx), 0, 1);
        charsInView += b.charCount * fraction;
        if (fraction >= 0.2) {
          balloonCount += 1;
          balloonAreaPx += bOverlap * b.widthPx;
        }
      }
    }

    const gutterRatio = round2(clamp(1 - cutOccupiedPx / viewportHeightPx, 0, 1));
    const focalDensity = round2(clamp(focalAccum, 0, 1));
    const charsRounded = round2(charsInView);
    const hasVisualPause =
      (gutterRatio >= 0.3 && charsRounded <= denseScreenCharThreshold * 0.5) ||
      (silentPauseVisiblePx >= viewportHeightPx * 0.25 &&
        charsRounded <= denseScreenCharThreshold * 0.35);

    const isDenseDialogueScreen = charsRounded > denseScreenCharThreshold && !hasVisualPause;
    if (isDenseDialogueScreen) denseDialogueScreenCount += 1;

    const charTerm = (charsRounded / Math.max(1, denseScreenCharThreshold)) * 52;
    const balloonTerm =
      Math.max(0, balloonCount - 2) * 4.5 + (balloonAreaPx / Math.max(1, viewportArea)) * 18;
    const cognitiveLoadScore = round2(
      clamp(charTerm + balloonTerm + focalDensity * 18 - gutterRatio * 22, 0, 100),
    );

    if (charsRounded > peakCharsPerViewport) peakCharsPerViewport = charsRounded;
    if (cognitiveLoadScore > peakCognitiveLoad) peakCognitiveLoad = cognitiveLoadScore;
    sumCognitiveLoad += cognitiveLoadScore;

    screens.push({
      screenIndex: sIdx,
      topYPx: viewTop,
      bottomYPx: viewBottom,
      charsPerViewport: charsRounded,
      balloonCount,
      focalDensity,
      gutterRatio,
      hasVisualPause,
      isDenseDialogueScreen,
      cognitiveLoadScore,
      overlappingCutIds,
    });
  }

  const wallOfTextStreaks: WallOfTextStreakFinding[] = [];
  let maxConsecutiveDenseScreens = 0;
  let runStart = -1;

  const flushStreak = (endInclusive: number): void => {
    if (runStart < 0) return;
    const len = endInclusive - runStart + 1;
    if (len > maxConsecutiveDenseScreens) maxConsecutiveDenseScreens = len;
    if (len >= minStreakScreens) {
      let streakPeakChars = 0;
      let streakSumChars = 0;
      const cutIdSet = new Set<string>();
      for (let k = runStart; k <= endInclusive; k += 1) {
        const sample = screens[k];
        if (!sample) continue;
        if (sample.charsPerViewport > streakPeakChars) streakPeakChars = sample.charsPerViewport;
        streakSumChars += sample.charsPerViewport;
        for (const cId of sample.overlappingCutIds) cutIdSet.add(cId);
      }
      wallOfTextStreaks.push({
        kind: "wall-of-text-streak",
        startScreenIndex: runStart,
        endScreenIndex: endInclusive,
        consecutiveScreenCount: len,
        startYPx: screens[runStart]?.topYPx ?? 0,
        endYPx: screens[endInclusive]?.bottomYPx ?? 0,
        peakCharsPerViewport: round2(streakPeakChars),
        meanCharsPerViewport: round2(streakSumChars / len),
        involvedCutIds: [...cutIdSet],
        diagnosisKo: `화면 #${runStart}~#${endInclusive}(${len}연속 뷰포트)에서 한국어 ${denseScreenCharThreshold}자를 초과하는 대사 과밀 구간이 시각적 휴지 없이 이어집니다.`,
      });
    }
    runStart = -1;
  };

  for (let i = 0; i < screens.length; i += 1) {
    if (screens[i]?.isDenseDialogueScreen) {
      if (runStart < 0) runStart = i;
    } else {
      flushStreak(i - 1);
    }
  }
  flushStreak(screens.length - 1);

  let cliffhangerPacingPreserved = true;
  for (let i = 1; i < segments.length; i += 1) {
    if (
      segments[i]?.pacingBeat === "cliffhanger" &&
      (segments[i - 1]?.gutterAfterPx ?? 0) < minCliffhangerLeadInGutterPx
    ) {
      cliffhangerPacingPreserved = false;
    }
  }

  return {
    viewportWidthPx,
    viewportHeightPx,
    totalHeightPx: safeTotalHeight,
    cutCount: segments.length,
    evaluatedScreenCount: screens.length,
    peakCharsPerViewport,
    peakCognitiveLoad,
    meanCognitiveLoad: round2(sumCognitiveLoad / Math.max(1, screens.length)),
    denseDialogueScreenCount,
    maxConsecutiveDenseScreens,
    screens,
    wallOfTextStreaks,
    cliffhangerPacingPreserved,
  };
}

function selectGutterTone(
  currentCut: EpisodeCutSpec | undefined,
  nextCut: EpisodeCutSpec | undefined,
): ScrollGutterTone {
  return nextCut?.pacingBeat === "cliffhanger" ||
    currentCut?.pacingBeat === "cliffhanger" ||
    nextCut?.pacingBeat === "action"
    ? "dark"
    : "white";
}

/** 권고된 스크롤 여백(`recommendedGutterAddPx`)을 에피소드 스트립 사양에 반영한 새 복사본을 반환한다. */
export function applyGutterRecommendations(
  strip: EpisodeScrollStripInput,
  recommendations: readonly GutterInsertionRecommendation[],
): EpisodeScrollStripInput {
  const baseGutters = extractBaseGutters(strip);
  const addByIndex = new Map<number, number>();
  for (const rec of recommendations) {
    addByIndex.set(rec.afterCutIndex, (addByIndex.get(rec.afterCutIndex) ?? 0) + rec.recommendedGutterAddPx);
  }
  const nextCuts: EpisodeCutSpec[] = strip.cuts.map((cut, idx) => {
    const { topPx: _omittedTopPx, ...rest } = cut;
    void _omittedTopPx;
    return { ...rest, gutterAfterPx: (baseGutters[idx] ?? 0) + (addByIndex.get(idx) ?? 0) };
  });
  const totalAdded = recommendations.reduce((acc, r) => acc + r.recommendedGutterAddPx, 0);
  return {
    episodeId: strip.episodeId,
    cuts: nextCuts,
    ...(strip.initialTopPaddingPx !== undefined ? { initialTopPaddingPx: strip.initialTopPaddingPx } : {}),
    ...(strip.totalHeightPx !== undefined ? { totalHeightPx: strip.totalHeightPx + totalAdded } : {}),
  };
}

/** `390×844` 모바일 뷰포트 기준 에피소드 스크롤 인지 부하를 감사하고 최적 호흡 여백 삽입안을 산출한다. */
export function auditEpisodeScrollCognitiveLoad(
  strip: EpisodeScrollStripInput,
  options: ScrollCognitiveAuditOptions = {},
): ScrollCognitiveLoadAuditReport {
  const viewportWidthPx = clamp(options.viewportWidthPx ?? DEFAULT_VIEWPORT_WIDTH_PX, 240, 1024);
  const viewportHeightPx = clamp(options.viewportHeightPx ?? DEFAULT_VIEWPORT_HEIGHT_PX, 400, 2400);
  const viewportStepPx = clamp(options.viewportStepPx ?? viewportHeightPx, 120, viewportHeightPx);
  const denseScreenCharThreshold = clamp(
    options.denseScreenCharThreshold ?? DEFAULT_DENSE_CHAR_THRESHOLD,
    60,
    600,
  );
  const minStreakScreens = Math.max(2, Math.round(options.minStreakScreens ?? DEFAULT_MIN_STREAK_SCREENS));
  const comfortThreshold = clamp(
    options.comfortCognitiveLoadThreshold ?? DEFAULT_COMFORT_LOAD_THRESHOLD,
    30,
    95,
  );
  const minCliffhangerLeadInGutterPx = clamp(
    options.minCliffhangerLeadInGutterPx ?? DEFAULT_CLIFFHANGER_LEAD_IN_PX,
    120,
    1200,
  );
  const maxPasses = Math.round(clamp(options.maxOptimizationPasses ?? 64, 4, 200));

  const metricOpts = {
    viewportWidthPx,
    viewportHeightPx,
    viewportStepPx,
    denseScreenCharThreshold,
    minStreakScreens,
    minCliffhangerLeadInGutterPx,
  };

  const baseGutters = extractBaseGutters(strip);
  const zeroAdds = Array.from({ length: strip.cuts.length }, () => 0);
  const initialResolved = resolveStripSegments(strip, baseGutters, zeroAdds, viewportWidthPx);
  const initialMetrics = evaluateResolvedStripMetrics(
    initialResolved.segments,
    initialResolved.totalHeightPx,
    metricOpts,
  );

  const addedGutters = [...zeroAdds];
  for (let i = 1; i < strip.cuts.length; i += 1) {
    if (strip.cuts[i]?.pacingBeat === "cliffhanger") {
      const existing = baseGutters[i - 1] ?? 0;
      if (existing < minCliffhangerLeadInGutterPx) {
        addedGutters[i - 1] = quantizeUpPx(minCliffhangerLeadInGutterPx - existing);
      }
    }
  }

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const resolved = resolveStripSegments(strip, baseGutters, addedGutters, viewportWidthPx);
    const iterMetrics = evaluateResolvedStripMetrics(resolved.segments, resolved.totalHeightPx, metricOpts);
    if (iterMetrics.wallOfTextStreaks.length === 0 && iterMetrics.peakCognitiveLoad <= comfortThreshold) {
      break;
    }

    let targetScreen: ViewportScreenLoadSample | undefined;
    const firstStreak = iterMetrics.wallOfTextStreaks[0];
    if (firstStreak) {
      for (let s = firstStreak.startScreenIndex; s <= firstStreak.endScreenIndex; s += 1) {
        const cand = iterMetrics.screens[s];
        if (cand && (!targetScreen || cand.cognitiveLoadScore > targetScreen.cognitiveLoadScore)) {
          targetScreen = cand;
        }
      }
    } else {
      for (const s of iterMetrics.screens) {
        if (s.cognitiveLoadScore > comfortThreshold && (!targetScreen || s.cognitiveLoadScore > targetScreen.cognitiveLoadScore)) {
          targetScreen = s;
        }
      }
    }
    if (!targetScreen) break;

    const overlappingSegs = resolved.segments.filter(
      (seg) => seg.bottomPx > targetScreen.topYPx && seg.topPx < targetScreen.bottomYPx,
    );
    let mutated = false;
    if (overlappingSegs.length >= 2) {
      const firstSeg = overlappingSegs[0];
      const secondSeg = overlappingSegs[1];
      if (firstSeg && secondSeg && firstSeg.cutIndex < strip.cuts.length - 1) {
        const delta = quantizeUpPx(clamp(targetScreen.bottomYPx - secondSeg.topPx + 40, 140, 520));
        addedGutters[firstSeg.cutIndex] = (addedGutters[firstSeg.cutIndex] ?? 0) + delta;
        mutated = true;
      }
    } else if (overlappingSegs.length === 1) {
      const onlySeg = overlappingSegs[0];
      if (onlySeg) {
        const midBalloon = onlySeg.balloons[Math.floor(onlySeg.balloons.length / 2)];
        if (onlySeg.balloons.length >= 2 && onlySeg.cutIndex > 0 && midBalloon && midBalloon.topPx < targetScreen.bottomYPx) {
          const shiftDown = quantizeUpPx(clamp(targetScreen.bottomYPx - midBalloon.topPx + 24, 100, 460));
          addedGutters[onlySeg.cutIndex - 1] = (addedGutters[onlySeg.cutIndex - 1] ?? 0) + shiftDown;
          mutated = true;
        } else if (onlySeg.cutIndex < strip.cuts.length - 1) {
          addedGutters[onlySeg.cutIndex] = (addedGutters[onlySeg.cutIndex] ?? 0) + 360;
          mutated = true;
        } else if (onlySeg.cutIndex > 0) {
          addedGutters[onlySeg.cutIndex - 1] = (addedGutters[onlySeg.cutIndex - 1] ?? 0) + 360;
          mutated = true;
        }
      }
    }
    if (!mutated) break;
  }

  const finalResolved = resolveStripSegments(strip, baseGutters, addedGutters, viewportWidthPx);
  const projectedMetrics = evaluateResolvedStripMetrics(
    finalResolved.segments,
    finalResolved.totalHeightPx,
    metricOpts,
  );

  const recommendations: GutterInsertionRecommendation[] = [];
  let totalRecommendedGutterAddPx = 0;
  for (let i = 0; i < strip.cuts.length; i += 1) {
    const addPx = addedGutters[i] ?? 0;
    const cut = strip.cuts[i];
    if (addPx <= 0 || !cut) continue;
    const nextCut = strip.cuts[i + 1];
    const existingGutterPx = round2(baseGutters[i] ?? 0);
    const gutterTone = selectGutterTone(cut, nextCut);
    totalRecommendedGutterAddPx += addPx;
    recommendations.push({
      afterCutId: cut.cutId,
      afterCutIndex: i,
      existingGutterPx,
      recommendedGutterAddPx: addPx,
      targetTotalGutterPx: round2(existingGutterPx + addPx),
      gutterTone,
      preservesCliffhangerPacing: projectedMetrics.cliffhangerPacingPreserved,
      reasonKo:
        nextCut?.pacingBeat === "cliffhanger"
          ? `클리프행어 컷('${nextCut.cutId}') 진입 전 암전 서스펜스 호흡(${addPx}px 추가)을 확보해 극적 반전 몰입도를 유지합니다.`
          : `모바일 화면 내 과밀 대사·초점 중첩을 분리하기 위해 '${cut.cutId}' 하단에 ${gutterTone === "dark" ? "암색" : "백색"} 호흡 여백 ${addPx}px 삽입을 권장합니다.`,
    });
  }

  const summaryKo =
    initialMetrics.wallOfTextStreaks.length === 0 && initialMetrics.peakCognitiveLoad <= comfortThreshold
      ? `전체 ${initialMetrics.cutCount}컷(${initialMetrics.evaluatedScreenCount}화면) 모두 쾌적 인지 부하 임계치(${comfortThreshold}) 이내로 추가 여백 보정이 필요하지 않습니다.`
      : `초기 과밀 연속 구간 ${initialMetrics.wallOfTextStreaks.length}건(피크 부하 ${initialMetrics.peakCognitiveLoad})을 ${recommendations.length}개 구간 총 ${totalRecommendedGutterAddPx}px 호흡 여백 삽입으로 해소하여 예상 피크 부하를 ${projectedMetrics.peakCognitiveLoad}로 낮췄습니다.`;

  return {
    episodeId: strip.episodeId,
    comfortThreshold,
    denseScreenCharThreshold,
    initialMetrics,
    recommendations,
    totalRecommendedGutterAddPx,
    projectedMetrics,
    summaryKo,
  };
}
