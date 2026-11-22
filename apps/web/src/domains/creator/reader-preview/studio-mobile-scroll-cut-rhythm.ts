/**
 * Studio Mobile Scroll Cut Rhythm — 모바일 390×844px 세로 스크롤 컷 리듬·호흡 진단 코어.
 *
 * 기존 페이지 단위 분석(`studio-scroll-rhythm.ts`)을 보완해 컷 배열(높이·컷 간 여백·
 * 대사 글자 수·액션/정적 유형)을 모바일 390×844px 화면에 투영해 다음 세 축을 점수화한다.
 *  1. 숨 막히는 밀집 구간 — 컷 간 여백 과소 + 대사 글자 수 과밀 (액션/정적 유형 반영)
 *  2. 늘어지는 빈 여백 구간 — 독자 이탈·빈 화면 오인을 부르는 과도한 컷 간 공백
 *  3. 모바일 1화면(844px) 내 컷 수 — 한 스마트폰 화면에 동시에 들어오는 컷 과밀도
 *
 * - DOM / Canvas 의존 없음(순수·결정적).
 * - 입력 배열/객체를 변형하지 않고 동결(Object.freeze) 결과를 반환한다.
 */

export const MOBILE_SCROLL_VIEWPORT_WIDTH_PX = 390;
export const MOBILE_SCROLL_VIEWPORT_HEIGHT_PX = 844;

export const MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS = Object.freeze({
  /** 정적·대사 컷 사이의 기본 호흡 최소 여백(390px 모바일 px). */
  staticMinGutterPx: 80,
  /** 대사가 아주 많은 정적 컷 쌍의 권장 호흡 여백(390px 모바일 px). */
  heavyDialogueStaticTargetGutterPx: 100,
  /** 액션 컷 쌍이라도 대사가 몰렸을 때 필요한 최소 여백(390px 모바일 px). */
  actionDialogueMinGutterPx: 64,
  /** 인접 2컷 합산 대사 글자 수 과밀 기준. */
  densePairDialogueChars: 65,
  /** 단일 컷 대사 글자 수 과밀 기준. */
  denseSingleCutDialogueChars: 45,
  /** 매우 높은 대사량 기준(더 넉넉한 여백 권장). */
  heavyPairDialogueChars: 100,
  /** 정적 컷 사이에서 늘어지는 빈 여백 경고선(390px 모바일 px). */
  staticDraggingVoidPx: 520,
  /** 액션 연속 컷 사이에서 템포가 끊기는 공백 경고선(390px 모바일 px). */
  actionDraggingVoidPx: 420,
  /** 정적 장면 전환 권장 상한(390px 모바일 px). */
  staticTransitionTargetMaxPx: 320,
  /** 액션 연속 컷 권장 상한(390px 모바일 px). */
  actionTransitionTargetMaxPx: 180,
  /** 1화면(844px)에 컷이 이 픽셀 이상 겹쳐 보이면 동시 노출 컷으로 집계한다. */
  visibleOverlapMinPx: 24,
  /** 1화면(844px)에 3컷이 보일 때 과밀 경고를 띄우는 화면 합산 대사 글자 수. */
  threeCutScreenDenseDialogueChars: 90,
});

export type MobileScrollCutType = "action" | "static";

export type MobileScrollRhythmSeverity = "info" | "warning" | "critical";

export type MobileScrollRhythmGrade = "A" | "B" | "C" | "D";

export interface MobileScrollCutInput {
  readonly id?: string;
  readonly pageId?: string;
  /** 컷 세로 높이(px). */
  readonly heightPx: number;
  /** 다음 컷과의 세로 여백(px). 마지막 컷은 꼬리 여백 또는 0. */
  readonly gapAfterPx: number;
  /** 컷 안의 대사 총 글자 수. */
  readonly dialogueCharCount: number;
  /** 액션 컷(빠른 템포 허용) vs 정적 컷(대사·감정 호흡 필요). */
  readonly cutType: MobileScrollCutType;
}

export interface AnalyzeMobileScrollCutRhythmOptions {
  /** 입력 컷의 기준 캔버스 폭(px). 기본 390(1:1 모바일 px). 720 전달 시 390px 모바일 비율로 투영한다. */
  readonly canvasWidthPx?: number;
  /** 모바일 화면 폭(px). 기본 390px. */
  readonly viewportWidthPx?: number;
  /** 모바일 1화면 세로 높이(px). 기본 844px. */
  readonly viewportHeightPx?: number;
}

export interface MobileScrollNormalizedCut {
  readonly index: number;
  readonly cutNumber: number;
  readonly id: string;
  readonly pageId: string | null;
  readonly cutType: MobileScrollCutType;
  readonly dialogueCharCount: number;
  readonly topYMobilePx: number;
  readonly bottomYMobilePx: number;
  readonly heightMobilePx: number;
  readonly gapAfterMobilePx: number;
}

export interface MobileScrollSuffocatingZone {
  readonly startCut: number;
  readonly endCut: number;
  readonly minGapMobilePx: number;
  readonly totalDialogueChars: number;
  readonly recommendedAddGapPx: number;
  readonly recommendedAddGapCanvasPx: number;
  readonly severity: MobileScrollRhythmSeverity;
  readonly pageId: string | null;
  readonly feedbackKo: string;
}

export interface MobileScrollDraggingVoidZone {
  readonly fromCut: number;
  readonly toCut: number;
  readonly gapMobilePx: number;
  readonly recommendedTrimGapPx: number;
  readonly recommendedTrimGapCanvasPx: number;
  readonly exceedsFullMobileScreen: boolean;
  readonly severity: MobileScrollRhythmSeverity;
  readonly pageId: string | null;
  readonly feedbackKo: string;
}

export interface MobileScrollCrowdedScreenWindow {
  readonly startCut: number;
  readonly endCut: number;
  readonly visibleCutCount: number;
  readonly totalDialogueChars: number;
  readonly severity: MobileScrollRhythmSeverity;
  readonly pageId: string | null;
  readonly feedbackKo: string;
}

export interface MobileScrollScreenDensitySummary {
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly totalMobileHeightPx: number;
  readonly totalMobileScreens: number;
  readonly maxCutsPerScreen: number;
  readonly averageCutsPerScreen: number;
  readonly crowdedWindows: readonly MobileScrollCrowdedScreenWindow[];
}

export interface MobileScrollDirectingFeedback {
  readonly id: string;
  readonly category: "suffocating" | "dragging-void" | "screen-density";
  readonly severity: MobileScrollRhythmSeverity;
  readonly startCut: number;
  readonly endCut: number;
  readonly pageId: string | null;
  readonly messageKo: string;
}

export interface MobileScrollCutRhythmReport {
  readonly cutCount: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly mobileScale: number;
  readonly overallScore: number;
  readonly grade: MobileScrollRhythmGrade;
  readonly densityBreathScore: number;
  readonly voidBalanceScore: number;
  readonly screenDensityScore: number;
  readonly cuts: readonly MobileScrollNormalizedCut[];
  readonly suffocatingZones: readonly MobileScrollSuffocatingZone[];
  readonly draggingVoidZones: readonly MobileScrollDraggingVoidZone[];
  readonly screenDensity: MobileScrollScreenDensitySummary;
  readonly feedbacks: readonly MobileScrollDirectingFeedback[];
  readonly summaryKo: string;
}

const SEVERITY_RANK: Readonly<Record<MobileScrollRhythmSeverity, number>> = {
  info: 0,
  warning: 1,
  critical: 2,
};

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundStep10(value: number, minStep = 10): number {
  if (value <= 0) return 0;
  return Math.max(minStep, Math.ceil(value / 10) * 10);
}

function gradeForScore(score: number): MobileScrollRhythmGrade {
  if (score >= 88) return "A";
  if (score >= 74) return "B";
  if (score >= 58) return "C";
  return "D";
}

function finiteNonNegative(value: number, fallback = 0): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeCuts(
  cuts: readonly MobileScrollCutInput[],
  scale: number,
): MobileScrollNormalizedCut[] {
  const normalized: MobileScrollNormalizedCut[] = [];
  let cursorY = 0;

  for (let index = 0; index < cuts.length; index += 1) {
    const cut = cuts[index];
    if (!cut) continue;
    const rawHeight = Math.max(1, finiteNonNegative(cut.heightPx, 1));
    const rawGap = finiteNonNegative(cut.gapAfterPx, 0);
    const heightMobilePx = roundTo(rawHeight * scale, 1);
    const gapAfterMobilePx = roundTo(rawGap * scale, 1);
    const topYMobilePx = roundTo(cursorY, 1);
    const bottomYMobilePx = roundTo(cursorY + heightMobilePx, 1);
    cursorY = bottomYMobilePx + gapAfterMobilePx;

    normalized.push(
      Object.freeze({
        index,
        cutNumber: index + 1,
        id: cut.id?.trim() || `cut-${index + 1}`,
        pageId: cut.pageId?.trim() || null,
        cutType: cut.cutType,
        dialogueCharCount: Math.round(finiteNonNegative(cut.dialogueCharCount, 0)),
        topYMobilePx,
        bottomYMobilePx,
        heightMobilePx,
        gapAfterMobilePx,
      }),
    );
  }

  return normalized;
}

interface RawSuffocatingPair {
  readonly fromCut: number;
  readonly toCut: number;
  readonly gapMobilePx: number;
  readonly pairDialogueChars: number;
  readonly recommendedAddGapPx: number;
  readonly severity: MobileScrollRhythmSeverity;
  readonly pageId: string | null;
}

function detectSuffocatingZones(
  cuts: readonly MobileScrollNormalizedCut[],
  scale: number,
): MobileScrollSuffocatingZone[] {
  const pairs: RawSuffocatingPair[] = [];

  for (let index = 0; index < cuts.length - 1; index += 1) {
    const current = cuts[index];
    const next = cuts[index + 1];
    if (!current || !next) continue;

    const pairDialogueChars = current.dialogueCharCount + next.dialogueCharCount;
    const isDialogueDense =
      pairDialogueChars >= MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.densePairDialogueChars ||
      current.dialogueCharCount >= MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.denseSingleCutDialogueChars ||
      next.dialogueCharCount >= MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.denseSingleCutDialogueChars;

    if (!isDialogueDense) continue;

    const bothAction = current.cutType === "action" && next.cutType === "action";
    const minGutterPx = bothAction
      ? MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.actionDialogueMinGutterPx
      : MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.staticMinGutterPx;

    if (current.gapAfterMobilePx >= minGutterPx) continue;

    const targetGutterPx = bothAction
      ? MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.actionDialogueMinGutterPx
      : pairDialogueChars >= MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.heavyPairDialogueChars
        ? MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.heavyDialogueStaticTargetGutterPx
        : MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.staticMinGutterPx;

    const deficitPx = targetGutterPx - current.gapAfterMobilePx;
    const recommendedAddGapPx = roundStep10(deficitPx, 20);
    const severity: MobileScrollRhythmSeverity =
      current.gapAfterMobilePx <= minGutterPx * 0.45 &&
      pairDialogueChars >= MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.heavyPairDialogueChars
        ? "critical"
        : "warning";

    pairs.push({
      fromCut: current.cutNumber,
      toCut: next.cutNumber,
      gapMobilePx: current.gapAfterMobilePx,
      pairDialogueChars,
      recommendedAddGapPx,
      severity,
      pageId: current.pageId ?? next.pageId,
    });
  }

  // 연속으로 붙은 밀집 구간은 하나로 묶어 중복 경고를 줄인다.
  const zones: MobileScrollSuffocatingZone[] = [];
  let cursor = 0;
  while (cursor < pairs.length) {
    const first = pairs[cursor];
    if (!first) break;
    let endCursor = cursor;
    let minGapMobilePx = first.gapMobilePx;
    let maxAddGapPx = first.recommendedAddGapPx;
    let severity: MobileScrollRhythmSeverity = first.severity;

    while (endCursor + 1 < pairs.length) {
      const prev = pairs[endCursor];
      const upcoming = pairs[endCursor + 1];
      if (!prev || !upcoming || upcoming.fromCut !== prev.toCut) break;
      endCursor += 1;
      minGapMobilePx = Math.min(minGapMobilePx, upcoming.gapMobilePx);
      maxAddGapPx = Math.max(maxAddGapPx, upcoming.recommendedAddGapPx);
      if (SEVERITY_RANK[upcoming.severity] > SEVERITY_RANK[severity]) {
        severity = upcoming.severity;
      }
    }

    const last = pairs[endCursor] ?? first;
    const startCut = first.fromCut;
    const endCut = last.toCut;
    let totalDialogueChars = 0;
    for (let cutIdx = startCut - 1; cutIdx <= endCut - 1; cutIdx += 1) {
      totalDialogueChars += cuts[cutIdx]?.dialogueCharCount ?? 0;
    }

    const recommendedAddGapCanvasPx =
      scale < 1 ? roundStep10(maxAddGapPx / scale, 20) : maxAddGapPx;
    const feedbackKo =
      endCut - startCut === 1
        ? `${startCut}~${endCut}컷 사이 여백을 ${maxAddGapPx}px 넓히면 대사 호흡이 살아납니다`
        : `${startCut}~${endCut}컷 밀집 구간의 컷 사이 여백을 ${maxAddGapPx}px 넓히면 대사 호흡이 살아납니다`;

    zones.push(
      Object.freeze({
        startCut,
        endCut,
        minGapMobilePx: roundTo(minGapMobilePx, 1),
        totalDialogueChars,
        recommendedAddGapPx: maxAddGapPx,
        recommendedAddGapCanvasPx,
        severity,
        pageId: first.pageId,
        feedbackKo,
      }),
    );

    cursor = endCursor + 1;
  }

  return zones;
}

function detectDraggingVoidZones(
  cuts: readonly MobileScrollNormalizedCut[],
  viewportHeightPx: number,
  scale: number,
): MobileScrollDraggingVoidZone[] {
  const zones: MobileScrollDraggingVoidZone[] = [];

  for (let index = 0; index < cuts.length - 1; index += 1) {
    const current = cuts[index];
    const next = cuts[index + 1];
    if (!current || !next) continue;

    const bothAction = current.cutType === "action" && next.cutType === "action";
    const voidLimitPx = bothAction
      ? MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.actionDraggingVoidPx
      : MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.staticDraggingVoidPx;

    if (current.gapAfterMobilePx <= voidLimitPx) continue;

    const targetMaxPx = bothAction
      ? MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.actionTransitionTargetMaxPx
      : MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.staticTransitionTargetMaxPx;
    const trimRaw = current.gapAfterMobilePx - targetMaxPx;
    const recommendedTrimGapPx = roundStep10(trimRaw, 40);
    const recommendedTrimGapCanvasPx =
      scale < 1 ? roundStep10(recommendedTrimGapPx / scale, 40) : recommendedTrimGapPx;
    const exceedsFullMobileScreen = current.gapAfterMobilePx >= viewportHeightPx;
    const severity: MobileScrollRhythmSeverity = exceedsFullMobileScreen ? "critical" : "warning";
    const gapLabelPx = Math.round(current.gapAfterMobilePx);

    const feedbackKo = exceedsFullMobileScreen
      ? `${current.cutNumber}~${next.cutNumber}컷 사이 빈 여백이 ${gapLabelPx}px로 모바일 1화면(${viewportHeightPx}px)을 넘습니다. ${recommendedTrimGapPx}px 줄여 빈 화면 오인을 막으세요`
      : bothAction
        ? `${current.cutNumber}~${next.cutNumber}컷 액션 구간 사이 여백이 ${gapLabelPx}px로 늘어집니다. ${recommendedTrimGapPx}px 줄이면 속도감이 유지됩니다`
        : `${current.cutNumber}~${next.cutNumber}컷 사이 빈 여백이 ${gapLabelPx}px로 늘어집니다. ${recommendedTrimGapPx}px 줄이면 스크롤 몰입이 이어집니다`;

    zones.push(
      Object.freeze({
        fromCut: current.cutNumber,
        toCut: next.cutNumber,
        gapMobilePx: roundTo(current.gapAfterMobilePx, 1),
        recommendedTrimGapPx,
        recommendedTrimGapCanvasPx,
        exceedsFullMobileScreen,
        severity,
        pageId: current.pageId ?? next.pageId,
        feedbackKo,
      }),
    );
  }

  return zones;
}

function analyzeScreenDensity(
  cuts: readonly MobileScrollNormalizedCut[],
  viewportWidthPx: number,
  viewportHeightPx: number,
): { summary: MobileScrollScreenDensitySummary; score: number } {
  if (cuts.length === 0) {
    return {
      summary: Object.freeze({
        viewportWidthPx,
        viewportHeightPx,
        totalMobileHeightPx: 0,
        totalMobileScreens: 0,
        maxCutsPerScreen: 0,
        averageCutsPerScreen: 0,
        crowdedWindows: Object.freeze([]),
      }),
      score: 100,
    };
  }

  const lastCut = cuts[cuts.length - 1];
  const totalMobileHeightPx = roundTo(
    (lastCut?.bottomYMobilePx ?? 0) + (lastCut?.gapAfterMobilePx ?? 0),
    1,
  );
  const totalMobileScreens = roundTo(totalMobileHeightPx / viewportHeightPx, 2);
  const averageCutsPerScreen = roundTo(cuts.length / Math.max(1, totalMobileHeightPx / viewportHeightPx), 2);

  let maxCutsPerScreen = 0;
  let maxThreeCutDialogueChars = 0;
  const crowdedWindows: MobileScrollCrowdedScreenWindow[] = [];
  const seenSpanKeys = new Set<string>();

  for (const anchor of cuts) {
    const windowStart = anchor.topYMobilePx;
    const windowEnd = windowStart + viewportHeightPx;

    const visible = cuts.filter((candidate) => {
      const overlap =
        Math.min(candidate.bottomYMobilePx, windowEnd) -
        Math.max(candidate.topYMobilePx, windowStart);
      const minRequiredOverlap = Math.min(
        MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.visibleOverlapMinPx,
        candidate.heightMobilePx,
      );
      return overlap >= minRequiredOverlap;
    });

    if (visible.length > maxCutsPerScreen) {
      maxCutsPerScreen = visible.length;
    }

    const totalDialogueChars = visible.reduce((sum, item) => sum + item.dialogueCharCount, 0);
    if (visible.length === 3 && totalDialogueChars > maxThreeCutDialogueChars) {
      maxThreeCutDialogueChars = totalDialogueChars;
    }

    const isFourOrMore = visible.length >= 4;
    const isDenseThree =
      visible.length === 3 &&
      totalDialogueChars >= MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.threeCutScreenDenseDialogueChars;

    if (!isFourOrMore && !isDenseThree) continue;

    const first = visible[0];
    const last = visible[visible.length - 1];
    if (!first || !last) continue;
    const spanKey = `${first.cutNumber}-${last.cutNumber}`;
    if (seenSpanKeys.has(spanKey)) continue;
    seenSpanKeys.add(spanKey);

    const severity: MobileScrollRhythmSeverity = visible.length >= 5 ? "critical" : "warning";
    const feedbackKo = isFourOrMore
      ? `모바일 1화면(${viewportHeightPx}px)에 ${first.cutNumber}~${last.cutNumber}컷(${visible.length}컷)이 한꺼번에 들어옵니다. 컷 높이나 간격을 키워 화면당 2~3컷으로 나누세요`
      : `모바일 1화면(${viewportHeightPx}px)에 ${first.cutNumber}~${last.cutNumber}컷과 대사 ${totalDialogueChars}자가 몰려 있습니다. 한 컷을 다음 스크롤로 넘기면 읽기 부담이 줄어듭니다`;

    crowdedWindows.push(
      Object.freeze({
        startCut: first.cutNumber,
        endCut: last.cutNumber,
        visibleCutCount: visible.length,
        totalDialogueChars,
        severity,
        pageId: first.pageId,
        feedbackKo,
      }),
    );
  }

  let score = 100;
  if (maxCutsPerScreen >= 5) {
    score = Math.max(20, 62 - (maxCutsPerScreen - 4) * 14);
  } else if (maxCutsPerScreen === 4) {
    score = 62;
  } else if (maxCutsPerScreen === 3) {
    score =
      maxThreeCutDialogueChars >=
      MOBILE_SCROLL_CUT_RHYTHM_THRESHOLDS.threeCutScreenDenseDialogueChars
        ? 72
        : 88;
  }

  return {
    summary: Object.freeze({
      viewportWidthPx,
      viewportHeightPx,
      totalMobileHeightPx,
      totalMobileScreens,
      maxCutsPerScreen,
      averageCutsPerScreen,
      crowdedWindows: Object.freeze(crowdedWindows),
    }),
    score,
  };
}

/** 컷 배열을 모바일 390×844px 세로 스크롤 기준으로 분석해 리듬 점수와 한글 연출 피드백을 생성한다. */
export function analyzeMobileScrollCutRhythm(
  cuts: readonly MobileScrollCutInput[],
  options: AnalyzeMobileScrollCutRhythmOptions = {},
): MobileScrollCutRhythmReport {
  const viewportWidthPx =
    options.viewportWidthPx && Number.isFinite(options.viewportWidthPx) && options.viewportWidthPx > 0
      ? options.viewportWidthPx
      : MOBILE_SCROLL_VIEWPORT_WIDTH_PX;
  const viewportHeightPx =
    options.viewportHeightPx &&
    Number.isFinite(options.viewportHeightPx) &&
    options.viewportHeightPx > 0
      ? options.viewportHeightPx
      : MOBILE_SCROLL_VIEWPORT_HEIGHT_PX;
  const canvasWidthPx =
    options.canvasWidthPx && Number.isFinite(options.canvasWidthPx) && options.canvasWidthPx > 0
      ? options.canvasWidthPx
      : viewportWidthPx;

  const mobileScale = Math.min(1, viewportWidthPx / canvasWidthPx);

  if (cuts.length === 0) {
    return Object.freeze({
      cutCount: 0,
      viewportWidthPx,
      viewportHeightPx,
      mobileScale: roundTo(mobileScale, 4),
      overallScore: 100,
      grade: "A",
      densityBreathScore: 100,
      voidBalanceScore: 100,
      screenDensityScore: 100,
      cuts: Object.freeze([]),
      suffocatingZones: Object.freeze([]),
      draggingVoidZones: Object.freeze([]),
      screenDensity: Object.freeze({
        viewportWidthPx,
        viewportHeightPx,
        totalMobileHeightPx: 0,
        totalMobileScreens: 0,
        maxCutsPerScreen: 0,
        averageCutsPerScreen: 0,
        crowdedWindows: Object.freeze([]),
      }),
      feedbacks: Object.freeze([]),
      summaryKo: "분석할 컷이 없습니다.",
    });
  }

  const normalized = normalizeCuts(cuts, mobileScale);
  const suffocatingZones = detectSuffocatingZones(normalized, mobileScale);
  const draggingVoidZones = detectDraggingVoidZones(normalized, viewportHeightPx, mobileScale);
  const { summary: screenDensity, score: screenDensityScore } = analyzeScreenDensity(
    normalized,
    viewportWidthPx,
    viewportHeightPx,
  );

  const densityPenalty = suffocatingZones.reduce(
    (sum, zone) => sum + (zone.severity === "critical" ? 32 : 22),
    0,
  );
  const voidPenalty = draggingVoidZones.reduce(
    (sum, zone) => sum + (zone.severity === "critical" ? 30 : 18),
    0,
  );

  const densityBreathScore = clamp(100 - densityPenalty, 0, 100);
  const voidBalanceScore = clamp(100 - voidPenalty, 0, 100);
  const overallScore = Math.round(
    clamp(
      densityBreathScore * 0.4 + voidBalanceScore * 0.3 + screenDensityScore * 0.3,
      0,
      100,
    ),
  );
  const grade = gradeForScore(overallScore);

  const feedbacks: MobileScrollDirectingFeedback[] = [
    ...suffocatingZones.map((zone) =>
      Object.freeze({
        id: `suffocating:${zone.startCut}-${zone.endCut}`,
        category: "suffocating" as const,
        severity: zone.severity,
        startCut: zone.startCut,
        endCut: zone.endCut,
        pageId: zone.pageId,
        messageKo: zone.feedbackKo,
      }),
    ),
    ...draggingVoidZones.map((zone) =>
      Object.freeze({
        id: `dragging-void:${zone.fromCut}-${zone.toCut}`,
        category: "dragging-void" as const,
        severity: zone.severity,
        startCut: zone.fromCut,
        endCut: zone.toCut,
        pageId: zone.pageId,
        messageKo: zone.feedbackKo,
      }),
    ),
    ...screenDensity.crowdedWindows.map((win) =>
      Object.freeze({
        id: `screen-density:${win.startCut}-${win.endCut}`,
        category: "screen-density" as const,
        severity: win.severity,
        startCut: win.startCut,
        endCut: win.endCut,
        pageId: win.pageId,
        messageKo: win.feedbackKo,
      }),
    ),
  ].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || a.startCut - b.startCut,
  );

  const summaryKo =
    feedbacks.length === 0
      ? `${normalized.length}컷 분석 · 모바일 390×${viewportHeightPx} 1화면 최대 ${screenDensity.maxCutsPerScreen}컷 · 호흡이 고릅니다 (${overallScore}점)`
      : `${normalized.length}컷 분석 · 밀집 ${suffocatingZones.length}곳 · 빈 여백 ${draggingVoidZones.length}곳 · 1화면 최대 ${screenDensity.maxCutsPerScreen}컷 (${overallScore}점)`;

  return Object.freeze({
    cutCount: normalized.length,
    viewportWidthPx,
    viewportHeightPx,
    mobileScale: roundTo(mobileScale, 4),
    overallScore,
    grade,
    densityBreathScore,
    voidBalanceScore,
    screenDensityScore,
    cuts: Object.freeze(normalized),
    suffocatingZones: Object.freeze(suffocatingZones),
    draggingVoidZones: Object.freeze(draggingVoidZones),
    screenDensity,
    feedbacks: Object.freeze(feedbacks),
    summaryKo,
  });
}
