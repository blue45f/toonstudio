/**
 * 자동 컷 리듬 & 거터 높이 솔버 + 390×844 모바일 1뷰포트 스포일러 방지 가드.
 *
 * ₩0 순수 로컬 결정론 엔진:
 * - 컷 시각 밀도(`visualDensity01`)·대사 글자 수(`dialogueCharCount`)·클라이맥스 비트 기반 거터 높이 산출
 * - 1클릭 3종 리듬 변환(`긴장 고조` / `코미디 템포` / `감정 여운`)
 * - 390×844 모바일 1뷰포트 스포일러 방지 가드: 연속 대사 말풍선 2개가 한 화면 안에 동시 노출되지 않도록
 *   최소 거터 여백을 자동 보장
 */

import { clamp, isFinitePoint, isValidRect, round2 } from "./studio-eyeflow-primitives";
import type {
  CutRhythmPresetId,
  EyeFlowBalloonInput,
  EyeFlowCutBounds,
  EyeFlowNode,
  EyeFlowPoint,
  EyeFlowRect,
  MobileSpoilerGuardConfig,
  MobileViewportSpoilerRisk,
} from "./studio-eyeflow-types";

export const DEFAULT_MOBILE_SPOILER_VIEWPORT: MobileSpoilerGuardConfig = Object.freeze({
  viewportWidthPx: 390,
  viewportHeightPx: 844,
  scope: "all-consecutive-dialogue",
  extraMarginPx: 0,
});

export interface CutRhythmPresetDescriptor {
  readonly id: CutRhythmPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly baseGutterPx: number;
  readonly minGutterPx: number;
  readonly maxBaseGutterPx: number;
  readonly densityScalePx: number;
  readonly dialogueCharScalePx: number;
  readonly silenceBonusPx: number;
  readonly climaxLeadInBonusPx: number;
  readonly climaxAfterglowBonusPx: number;
  readonly progressiveCompressionPx: number;
}

export const CUT_RHYTHM_PRESETS: Readonly<Record<CutRhythmPresetId, CutRhythmPresetDescriptor>> =
  Object.freeze({
    "tension-escalation": Object.freeze({
      id: "tension-escalation",
      labelKo: "긴장 고조",
      descriptionKo: "클라이맥스를 향해 거터를 점진 압축하고 반전 직전에 숨 고르기 여백을 배치합니다.",
      baseGutterPx: 96,
      minGutterPx: 44,
      maxBaseGutterPx: 360,
      densityScalePx: 54,
      dialogueCharScalePx: 1.4,
      silenceBonusPx: -12,
      climaxLeadInBonusPx: 190,
      climaxAfterglowBonusPx: 88,
      progressiveCompressionPx: 34,
    }),
    "comedy-tempo": Object.freeze({
      id: "comedy-tempo",
      labelKo: "코미디 템포",
      descriptionKo: "티키타카 대사 간격을 경쾌하게 당기고 펀치라인 직전에 짧은 정지 박자를 넣습니다.",
      baseGutterPx: 72,
      minGutterPx: 32,
      maxBaseGutterPx: 260,
      densityScalePx: 28,
      dialogueCharScalePx: 0.9,
      silenceBonusPx: -18,
      climaxLeadInBonusPx: 124,
      climaxAfterglowBonusPx: 36,
      progressiveCompressionPx: 10,
    }),
    "emotional-lingering": Object.freeze({
      id: "emotional-lingering",
      labelKo: "감정 여운",
      descriptionKo: "무대사·감정선 컷 전후에 넉넉한 여백을 확보해 독자가 표정과 여운에 머물게 합니다.",
      baseGutterPx: 210,
      minGutterPx: 120,
      maxBaseGutterPx: 520,
      densityScalePx: 76,
      dialogueCharScalePx: 2.1,
      silenceBonusPx: 92,
      climaxLeadInBonusPx: 148,
      climaxAfterglowBonusPx: 210,
      progressiveCompressionPx: -24,
    }),
  });

export const CUT_RHYTHM_PRESET_LIST: readonly CutRhythmPresetDescriptor[] = Object.freeze([
  CUT_RHYTHM_PRESETS["tension-escalation"],
  CUT_RHYTHM_PRESETS["comedy-tempo"],
  CUT_RHYTHM_PRESETS["emotional-lingering"],
]);

const BALANCED_RHYTHM_PROFILE: CutRhythmPresetDescriptor = Object.freeze({
  id: "tension-escalation",
  labelKo: "표준 균형",
  descriptionKo: "컷 밀도·대사량·클라이맥스에 맞춘 기본 세로 스크롤 리듬입니다.",
  baseGutterPx: 140,
  minGutterPx: 64,
  maxBaseGutterPx: 420,
  densityScalePx: 60,
  dialogueCharScalePx: 1.6,
  silenceBonusPx: 24,
  climaxLeadInBonusPx: 150,
  climaxAfterglowBonusPx: 120,
  progressiveCompressionPx: 0,
});

export interface AutoCutRhythmInput {
  readonly id: string;
  readonly bounds: EyeFlowRect;
  /** 컷 내 시각 밀도(0..1). */
  readonly visualDensity01: number;
  /** 컷 내 전체 대사 글자 수(공백 제외). */
  readonly dialogueCharCount: number;
  /** 컷 내 대사 말풍선 수. */
  readonly balloonCount: number;
  /** 클라이맥스/반전 비트 여부. */
  readonly isClimaxBeat?: boolean;
  /** 클라이맥스 강도(0..1). 기본 isClimaxBeat ? 1 : 0. */
  readonly climaxIntensity01?: number;
  /** 컷 내부의 대사 말풍선 목록(390×844 스포일러 방지 가드 정밀 계산용). */
  readonly balloons?: readonly EyeFlowBalloonInput[];
}

export interface AutoCutRhythmPlanOptions {
  readonly canvasWidth: number;
  readonly cuts: readonly AutoCutRhythmInput[];
  readonly preset?: CutRhythmPresetId | "balanced";
  /** 390×844 모바일 1뷰포트 스포일러 방지 가드 활성화 여부. 기본 true. */
  readonly enableMobileSpoilerGuard?: boolean;
  readonly mobileSpoilerGuard?: Partial<MobileSpoilerGuardConfig>;
}

export interface CutGutterDecision {
  readonly fromCutId: string;
  readonly toCutId: string;
  readonly transitionIndex: number;
  readonly originalGutterPx: number;
  readonly baseGutterPx: number;
  readonly densityDeltaPx: number;
  readonly dialogueDeltaPx: number;
  readonly climaxDeltaPx: number;
  readonly rhythmGutterPx: number;
  readonly spoilerGuardMinGutterPx: number;
  readonly spoilerGuardAddedPx: number;
  readonly finalGutterPx: number;
  readonly effectiveScreenGapPx: number;
  readonly reasonKo: string;
}

export interface RepositionedCutLayout {
  readonly cutId: string;
  readonly originalBounds: EyeFlowRect;
  readonly nextBounds: EyeFlowRect;
  readonly deltaY: number;
  /** 0(느린 여운) ~ 1(빠른 긴박) 상대 템포 지표. */
  readonly pacingTempo01: number;
}

export interface AutoCutRhythmPlanResult {
  readonly preset: CutRhythmPresetId | "balanced";
  readonly presetLabelKo: string;
  readonly canvasWidth: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly viewportSpanCanvasPx: number;
  readonly mobileSpoilerGuardEnabled: boolean;
  readonly gutters: readonly CutGutterDecision[];
  readonly repositionedCuts: readonly RepositionedCutLayout[];
  readonly repositionedBalloons: readonly EyeFlowBalloonInput[];
  readonly spoilerRisksBeforeCount: number;
  readonly spoilerRisksAfterCount: number;
  readonly averageGutterPx: number;
  readonly totalHeightBeforePx: number;
  readonly totalHeightAfterPx: number;
  readonly summaryKo: string;
}

export function resolveMobileSpoilerConfig(
  config?: Partial<MobileSpoilerGuardConfig>,
): MobileSpoilerGuardConfig {
  const viewportWidthPx =
    typeof config?.viewportWidthPx === "number" &&
    Number.isFinite(config.viewportWidthPx) &&
    config.viewportWidthPx >= 240
      ? Math.round(config.viewportWidthPx)
      : DEFAULT_MOBILE_SPOILER_VIEWPORT.viewportWidthPx;
  const viewportHeightPx =
    typeof config?.viewportHeightPx === "number" &&
    Number.isFinite(config.viewportHeightPx) &&
    config.viewportHeightPx >= 320
      ? Math.round(config.viewportHeightPx)
      : DEFAULT_MOBILE_SPOILER_VIEWPORT.viewportHeightPx;
  const extraMarginPx =
    typeof config?.extraMarginPx === "number" && Number.isFinite(config.extraMarginPx)
      ? Math.max(0, Math.round(config.extraMarginPx))
      : 0;
  return {
    viewportWidthPx,
    viewportHeightPx,
    scope: config?.scope ?? DEFAULT_MOBILE_SPOILER_VIEWPORT.scope,
    extraMarginPx,
  };
}

/**
 * 모바일 뷰포트(기본 390×844)에 캔버스 폭을 맞췄을 때 한 화면에 노출되는 캔버스 세로 높이(px).
 * - canvasWidth = 390 → 844px
 * - canvasWidth = 720 → 1559px (390×844 화면에서 정확히 844 CSS px)
 */
export function computeMobileViewportCanvasSpanPx(
  canvasWidth: number,
  config?: Partial<MobileSpoilerGuardConfig>,
): number {
  const safeCanvasWidth = Math.max(1, Number.isFinite(canvasWidth) ? canvasWidth : 720);
  const resolved = resolveMobileSpoilerConfig(config);
  const scaledHeight = safeCanvasWidth * (resolved.viewportHeightPx / resolved.viewportWidthPx);
  return Math.ceil(scaledHeight) + (resolved.extraMarginPx ?? 0);
}

/**
 * 연속 대사 말풍선 2개가 390×844 모바일 1뷰포트 안에 동시에 노출되는 스포일러 위험을 감지한다.
 */
export function detectMobileViewportSpoilerRisks(params: {
  readonly canvasWidth: number;
  readonly nodes: readonly EyeFlowNode[];
  readonly cuts?: readonly EyeFlowCutBounds[];
  readonly config?: Partial<MobileSpoilerGuardConfig>;
  /** 같은 컷 내부의 연속 말풍선도 스포일러 위험으로 포함할지 여부. 기본 false(컷 전환 기준). */
  readonly includeSameCutPairs?: boolean;
}): readonly MobileViewportSpoilerRisk[] {
  const { nodes, cuts = [], includeSameCutPairs = false } = params;
  if (nodes.length < 2) return Object.freeze([]);

  const safeCanvasWidth = Math.max(1, Number.isFinite(params.canvasWidth) ? params.canvasWidth : 720);
  const resolved = resolveMobileSpoilerConfig(params.config);
  const requiredViewportSpanPx = computeMobileViewportCanvasSpanPx(safeCanvasWidth, resolved);
  const climaxCutIds = new Set(
    cuts.filter((cut) => cut.isClimaxBeat || (cut.climaxIntensity01 ?? 0) >= 0.6).map((cut) => cut.id),
  );

  const risks: MobileViewportSpoilerRisk[] = [];

  for (let i = 0; i < nodes.length - 1; i += 1) {
    const prev = nodes[i]!;
    const next = nodes[i + 1]!;
    const sameCut = Boolean(prev.cutId && next.cutId && prev.cutId === next.cutId);
    const hasDistinctCuts = Boolean(prev.cutId && next.cutId && prev.cutId !== next.cutId);

    // 컷 경계가 명시되지 않은 단일 페이지에서는 세로 배치된 연속 대사 쌍을 검사하되,
    // 컷이 정의된 경우 같은 컷 내 대화는 기본 제외(includeSameCutPairs=true일 때 포함).
    if (sameCut && !includeSameCutPairs) continue;
    if (cuts.length > 0 && !hasDistinctCuts && !includeSameCutPairs) continue;

    if (resolved.scope === "climax-only") {
      const touchesClimax =
        (prev.cutId !== null && climaxCutIds.has(prev.cutId)) ||
        (next.cutId !== null && climaxCutIds.has(next.cutId));
      if (!touchesClimax) continue;
    }

    const prevBottom = prev.bounds.y + prev.bounds.height;
    const nextTop = next.bounds.y;
    const verticalGapPx = round2(nextTop - prevBottom);
    if (verticalGapPx >= requiredViewportSpanPx) continue;

    const requiredGutterAddPx = Math.max(1, Math.ceil(requiredViewportSpanPx - verticalGapPx));
    const effectiveScreenGapPx = Math.round(
      verticalGapPx * (resolved.viewportWidthPx / safeCanvasWidth),
    );
    const touchesClimax =
      (prev.cutId !== null && climaxCutIds.has(prev.cutId)) ||
      (next.cutId !== null && climaxCutIds.has(next.cutId));
    const severity = touchesClimax || effectiveScreenGapPx < resolved.viewportHeightPx * 0.45
      ? "critical"
      : "warning";

    risks.push({
      id: `spoiler-${prev.balloonId}-${next.balloonId}`,
      prevBalloonId: prev.balloonId,
      nextBalloonId: next.balloonId,
      prevSequence: prev.sequenceNumber,
      nextSequence: next.sequenceNumber,
      prevCutId: prev.cutId,
      nextCutId: next.cutId,
      sameCut,
      verticalGapPx,
      requiredViewportSpanPx,
      effectiveScreenGapPx,
      requiredGutterAddPx,
      severity,
      messageKo: `${prev.sequenceNumber}·${next.sequenceNumber}번 대사가 ${resolved.viewportWidthPx}×${resolved.viewportHeightPx} 1화면에 동시 노출됩니다`,
      detailKo: `현재 대사 간격 ${Math.round(verticalGapPx)}px(모바일 환산 ${effectiveScreenGapPx}px)로 다음 대사 스포일러 위험이 있습니다. 거터를 최소 +${requiredGutterAddPx}px 넓혀 1뷰포트(${requiredViewportSpanPx}px)를 분리하세요.`,
    });
  }

  return Object.freeze(risks);
}

function shiftPointY(point: EyeFlowPoint | undefined, deltaY: number): EyeFlowPoint | undefined {
  if (!isFinitePoint(point)) return point;
  return { x: point.x, y: round2(point.y + deltaY) };
}

function shiftBalloonY(balloon: EyeFlowBalloonInput, deltaY: number): EyeFlowBalloonInput {
  if (Math.abs(deltaY) < 1e-4) return balloon;
  return {
    ...balloon,
    bounds: {
      ...balloon.bounds,
      y: round2(balloon.bounds.y + deltaY),
    },
    tailBase: shiftPointY(balloon.tailBase, deltaY),
    tailTip: shiftPointY(balloon.tailTip, deltaY),
    extraTailTips: balloon.extraTailTips
      ? Object.freeze(
          balloon.extraTailTips.map((tip) => ({
            x: tip.x,
            y: round2(tip.y + deltaY),
          })),
        )
      : undefined,
  };
}

function sortCutBalloons(balloons: readonly EyeFlowBalloonInput[] | undefined): EyeFlowBalloonInput[] {
  if (!balloons || balloons.length === 0) return [];
  return balloons
    .filter((balloon) => isValidRect(balloon.bounds))
    .slice()
    .sort((a, b) => {
      const orderA = a.readingOrder ?? Number.POSITIVE_INFINITY;
      const orderB = b.readingOrder ?? Number.POSITIVE_INFINITY;
      return orderA - orderB || a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x;
    });
}

function countDialogueExposureAcrossCuts(
  cuts: readonly { readonly id: string; readonly bounds: EyeFlowRect; readonly balloons: readonly EyeFlowBalloonInput[] }[],
  viewportSpanCanvasPx: number,
  scope: MobileSpoilerGuardConfig["scope"],
  climaxIds: ReadonlySet<string>,
): number {
  let exposed = 0;
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const prevCut = cuts[i]!;
    const nextCut = cuts[i + 1]!;
    if (prevCut.balloons.length === 0 || nextCut.balloons.length === 0) continue;
    if (scope === "climax-only" && !climaxIds.has(prevCut.id) && !climaxIds.has(nextCut.id)) {
      continue;
    }
    const lastPrev = prevCut.balloons[prevCut.balloons.length - 1]!;
    const firstNext = nextCut.balloons[0]!;
    const gap = firstNext.bounds.y - (lastPrev.bounds.y + lastPrev.bounds.height);
    if (gap < viewportSpanCanvasPx) exposed += 1;
  }
  return exposed;
}

/**
 * 컷 밀도·대사 글자 수·클라이맥스 비트·리듬 프리셋·390×844 스포일러 방지 가드를 통합 계산해
 * 각 컷 사이 거터 높이와 재배치 좌표를 순수 결정적으로 산출한다.
 */
export function computeAutoCutRhythmPlan(
  options: AutoCutRhythmPlanOptions,
): AutoCutRhythmPlanResult {
  const canvasWidth = Math.max(1, Number.isFinite(options.canvasWidth) ? options.canvasWidth : 720);
  const preset = options.preset ?? "balanced";
  const profile = preset === "balanced" ? BALANCED_RHYTHM_PROFILE : CUT_RHYTHM_PRESETS[preset];
  const enableSpoilerGuard = options.enableMobileSpoilerGuard !== false;
  const spoilerConfig = resolveMobileSpoilerConfig(options.mobileSpoilerGuard);
  const viewportSpanCanvasPx = computeMobileViewportCanvasSpanPx(canvasWidth, spoilerConfig);

  const validCuts = options.cuts
    .filter((cut) => isValidRect(cut.bounds))
    .slice()
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x);

  if (validCuts.length === 0) {
    return {
      preset,
      presetLabelKo: profile.labelKo,
      canvasWidth,
      viewportWidthPx: spoilerConfig.viewportWidthPx,
      viewportHeightPx: spoilerConfig.viewportHeightPx,
      viewportSpanCanvasPx,
      mobileSpoilerGuardEnabled: enableSpoilerGuard,
      gutters: Object.freeze([]),
      repositionedCuts: Object.freeze([]),
      repositionedBalloons: Object.freeze([]),
      spoilerRisksBeforeCount: 0,
      spoilerRisksAfterCount: 0,
      averageGutterPx: 0,
      totalHeightBeforePx: 0,
      totalHeightAfterPx: 0,
      summaryKo: "리듬을 계산할 컷이 없습니다.",
    };
  }

  const normalizedCuts = validCuts.map((cut) => ({
    ...cut,
    density: clamp(Number.isFinite(cut.visualDensity01) ? cut.visualDensity01 : 0.5, 0, 1),
    dialogueChars: Math.max(0, Math.round(Number.isFinite(cut.dialogueCharCount) ? cut.dialogueCharCount : 0)),
    climaxIntensity: clamp(
      typeof cut.climaxIntensity01 === "number" && Number.isFinite(cut.climaxIntensity01)
        ? cut.climaxIntensity01
        : cut.isClimaxBeat
          ? 1
          : 0,
      0,
      1,
    ),
    sortedBalloons: sortCutBalloons(cut.balloons),
  }));

  const climaxIds = new Set(
    normalizedCuts.filter((cut) => cut.isClimaxBeat || cut.climaxIntensity >= 0.6).map((cut) => cut.id),
  );

  const spoilerRisksBeforeCount = countDialogueExposureAcrossCuts(
    normalizedCuts.map((cut) => ({
      id: cut.id,
      bounds: cut.bounds,
      balloons: cut.sortedBalloons,
    })),
    viewportSpanCanvasPx,
    spoilerConfig.scope,
    climaxIds,
  );

  const firstCut = normalizedCuts[0]!;
  const lastCutBefore = normalizedCuts[normalizedCuts.length - 1]!;
  const totalHeightBeforePx = round2(
    Math.max(0, lastCutBefore.bounds.y + lastCutBefore.bounds.height - firstCut.bounds.y),
  );

  const gutters: CutGutterDecision[] = [];
  const repositionedCuts: RepositionedCutLayout[] = [];
  const repositionedBalloons: EyeFlowBalloonInput[] = [];
  const placedCutContexts: Array<{
    readonly id: string;
    readonly bounds: EyeFlowRect;
    readonly balloons: readonly EyeFlowBalloonInput[];
  }> = [];

  let cursorY = firstCut.bounds.y;

  for (let i = 0; i < normalizedCuts.length; i += 1) {
    const cut = normalizedCuts[i]!;
    const deltaY = round2(cursorY - cut.bounds.y);
    const nextBounds: EyeFlowRect = {
      ...cut.bounds,
      y: round2(cursorY),
    };
    const shiftedBalloons = cut.sortedBalloons.map((balloon) => shiftBalloonY(balloon, deltaY));
    repositionedBalloons.push(...shiftedBalloons);
    placedCutContexts.push({ id: cut.id, bounds: nextBounds, balloons: shiftedBalloons });

    // 다음 컷과의 거터 계산
    let nextGutterPx = 0;
    if (i < normalizedCuts.length - 1) {
      const nextCut = normalizedCuts[i + 1]!;
      const progress01 = normalizedCuts.length > 2 ? i / (normalizedCuts.length - 2) : 0;
      const originalGutterPx = round2(
        Math.max(0, nextCut.bounds.y - (cut.bounds.y + cut.bounds.height)),
      );

      const avgDensity = (cut.density + nextCut.density) / 2;
      const densityDeltaPx = Math.round((avgDensity - 0.5) * profile.densityScalePx);

      const combinedChars = cut.dialogueChars + nextCut.dialogueChars;
      const isQuietTransition = combinedChars <= 8;
      const dialogueDeltaPx = isQuietTransition
        ? profile.silenceBonusPx
        : Math.round(Math.min(180, combinedChars * profile.dialogueCharScalePx * 0.5));

      const climaxLeadIn = nextCut.climaxIntensity > 0 ? profile.climaxLeadInBonusPx * nextCut.climaxIntensity : 0;
      const climaxAfter = cut.climaxIntensity > 0 ? profile.climaxAfterglowBonusPx * cut.climaxIntensity : 0;
      const climaxDeltaPx = Math.round(climaxLeadIn + climaxAfter);

      const progressiveShift = Math.round(-progress01 * profile.progressiveCompressionPx);
      const rawRhythmGutter =
        profile.baseGutterPx +
        progressiveShift +
        densityDeltaPx +
        dialogueDeltaPx +
        climaxDeltaPx;
      const rhythmGutterPx = Math.round(
        clamp(rawRhythmGutter, profile.minGutterPx, profile.maxBaseGutterPx + Math.max(0, climaxDeltaPx)),
      );

      let spoilerGuardMinGutterPx = 0;
      const prevHasDialogue = cut.sortedBalloons.length > 0 || cut.balloonCount > 0 || cut.dialogueChars > 0;
      const nextHasDialogue =
        nextCut.sortedBalloons.length > 0 || nextCut.balloonCount > 0 || nextCut.dialogueChars > 0;
      const matchesSpoilerScope =
        spoilerConfig.scope === "all-consecutive-dialogue" ||
        climaxIds.has(cut.id) ||
        climaxIds.has(nextCut.id);

      if (enableSpoilerGuard && prevHasDialogue && nextHasDialogue && matchesSpoilerScope) {
        let prevBottomMargin: number;
        if (cut.sortedBalloons.length > 0) {
          const lastPrevBalloon = cut.sortedBalloons[cut.sortedBalloons.length - 1]!;
          prevBottomMargin = Math.max(
            0,
            cut.bounds.y + cut.bounds.height - (lastPrevBalloon.bounds.y + lastPrevBalloon.bounds.height),
          );
        } else {
          prevBottomMargin = Math.round(cut.bounds.height * 0.12);
        }

        let nextTopMargin: number;
        if (nextCut.sortedBalloons.length > 0) {
          const firstNextBalloon = nextCut.sortedBalloons[0]!;
          nextTopMargin = Math.max(0, firstNextBalloon.bounds.y - nextCut.bounds.y);
        } else {
          nextTopMargin = Math.round(nextCut.bounds.height * 0.12);
        }

        spoilerGuardMinGutterPx = Math.max(
          0,
          Math.ceil(viewportSpanCanvasPx - prevBottomMargin - nextTopMargin),
        );
      }

      const finalGutterPx = Math.max(rhythmGutterPx, spoilerGuardMinGutterPx);
      const spoilerGuardAddedPx = Math.max(0, finalGutterPx - rhythmGutterPx);
      const effectiveScreenGapPx = Math.round(
        finalGutterPx * (spoilerConfig.viewportWidthPx / canvasWidth),
      );

      const reasons: string[] = [];
      if (climaxDeltaPx > 0) reasons.push(`클라이맥스 비트 +${climaxDeltaPx}px`);
      if (densityDeltaPx !== 0) {
        reasons.push(`밀도 보정 ${densityDeltaPx > 0 ? `+${densityDeltaPx}` : densityDeltaPx}px`);
      }
      if (dialogueDeltaPx !== 0) {
        reasons.push(`대사량 보정 ${dialogueDeltaPx > 0 ? `+${dialogueDeltaPx}` : dialogueDeltaPx}px`);
      }
      if (spoilerGuardAddedPx > 0) {
        reasons.push(
          `${spoilerConfig.viewportWidthPx}×${spoilerConfig.viewportHeightPx} 스포일러 가드 +${spoilerGuardAddedPx}px`,
        );
      }

      gutters.push({
        fromCutId: cut.id,
        toCutId: nextCut.id,
        transitionIndex: i,
        originalGutterPx,
        baseGutterPx: profile.baseGutterPx,
        densityDeltaPx,
        dialogueDeltaPx,
        climaxDeltaPx,
        rhythmGutterPx,
        spoilerGuardMinGutterPx,
        spoilerGuardAddedPx,
        finalGutterPx,
        effectiveScreenGapPx,
        reasonKo: reasons.length > 0 ? reasons.join(" · ") : `${profile.labelKo} 기본 거터`,
      });
      nextGutterPx = finalGutterPx;
    }

    const tempoSourceGutter = nextGutterPx > 0 ? nextGutterPx : profile.baseGutterPx;
    const pacingTempo01 = round2(clamp(1 - (tempoSourceGutter - 40) / 480, 0.05, 1));
    repositionedCuts.push({
      cutId: cut.id,
      originalBounds: cut.bounds,
      nextBounds,
      deltaY,
      pacingTempo01,
    });

    cursorY = nextBounds.y + nextBounds.height + nextGutterPx;
  }

  const lastPlaced = repositionedCuts[repositionedCuts.length - 1]!;
  const totalHeightAfterPx = round2(
    Math.max(0, lastPlaced.nextBounds.y + lastPlaced.nextBounds.height - firstCut.bounds.y),
  );
  const averageGutterPx =
    gutters.length > 0
      ? Math.round(gutters.reduce((sum, g) => sum + g.finalGutterPx, 0) / gutters.length)
      : 0;
  const spoilerRisksAfterCount = countDialogueExposureAcrossCuts(
    placedCutContexts,
    viewportSpanCanvasPx,
    spoilerConfig.scope,
    climaxIds,
  );
  const guardedTransitions = gutters.filter((g) => g.spoilerGuardAddedPx > 0).length;

  const summaryKo =
    gutters.length === 0
      ? `${profile.labelKo} 리듬 분석 완료(단일 컷).`
      : `${profile.labelKo} 리듬 적용: 평균 거터 ${averageGutterPx}px · ${spoilerConfig.viewportWidthPx}×${spoilerConfig.viewportHeightPx} 스포일러 가드 ${guardedTransitions}구간 보정(잔여 노출 ${spoilerRisksAfterCount}건).`;

  return {
    preset,
    presetLabelKo: profile.labelKo,
    canvasWidth,
    viewportWidthPx: spoilerConfig.viewportWidthPx,
    viewportHeightPx: spoilerConfig.viewportHeightPx,
    viewportSpanCanvasPx,
    mobileSpoilerGuardEnabled: enableSpoilerGuard,
    gutters: Object.freeze(gutters),
    repositionedCuts: Object.freeze(repositionedCuts),
    repositionedBalloons: Object.freeze(repositionedBalloons),
    spoilerRisksBeforeCount,
    spoilerRisksAfterCount,
    averageGutterPx,
    totalHeightBeforePx,
    totalHeightAfterPx,
    summaryKo,
  };
}
