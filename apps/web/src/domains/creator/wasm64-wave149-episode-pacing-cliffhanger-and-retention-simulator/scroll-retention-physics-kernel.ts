/**
 * Wave 149 — 결정론적 모바일 웹툰 스크롤 체류·인지 피로 물리 커널.
 *
 * - 실측 독자 이탈 로그를 날조하지 않고, 모든 산출물에 `isSimulationEstimate: true`를 강제한다.
 * - 체류 곡선은 1.0에서 출발해 `[0, 1]` 범위에서 단조 비증가 불변량을 보장한다.
 */

import {
  CLIFFHANGER_WINDOW_START,
  CRAMPED_GUTTER_ACTION_MIN_PX,
  CRAMPED_GUTTER_BASELINE_MIN_PX,
  CRAMPED_GUTTER_CLIFFHANGER_MIN_PX,
  CRAMPED_GUTTER_TRANSITION_MIN_PX,
  DEFAULT_CHARS_PER_SEC,
  DEFAULT_VIEWPORT_HEIGHT_PX,
  DEFAULT_VIEWPORT_WIDTH_PX,
  FATIGUE_WALL_BREATH_BREAK_GUTTER_PX,
  FATIGUE_WALL_CHARS_PER_SCREEN_THRESHOLD,
  FATIGUE_WALL_MIN_CONSECUTIVE_CUTS,
  NARRATIVE_BEAT_KINDS,
  SIMULATION_ESTIMATE_NOTICE_KO,
  type CutRetentionSimulationPoint,
  type EpisodePacingCutSpec,
  type EpisodePacingInput,
  type EpisodeScrollRetentionSimulation,
  type MobileViewportConfig,
  type NarrativeBeatKind,
  type NormalizedMobileViewportConfig,
  type RetentionCurveSample,
} from "./episode-pacing-types";
import { computePacingManifestSha256Hex } from "./pacing-sha256-and-canonical";

const BEAT_ENGAGEMENT_BONUS: Readonly<Record<NarrativeBeatKind, number>> = {
  "opening-hook": 0.16,
  exposition: -0.06,
  "dialogue-exchange": 0.03,
  "action-surge": 0.14,
  "emotional-pause": 0.08,
  "mid-twist": 0.2,
  "cliffhanger-reveal": 0.22,
  "epilogue-fade": 0.02,
};

const VALID_BEAT_SET: ReadonlySet<string> = new Set<string>(NARRATIVE_BEAT_KINDS);

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function clampUnit(value: number): number {
  return clampNumber(value, 0, 1);
}

export function round6(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1000000) / 1000000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function round1(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sanitizeFinite(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  warningLabel: string,
  warnings: string[],
): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) {
    warnings.push(`${warningLabel} 값이 비유한 수치여서 기본값(${fallback})으로 보정했습니다.`);
    return fallback;
  }
  if (value < min || value > max) {
    const clamped = clampNumber(value, min, max);
    warnings.push(
      `${warningLabel} 값(${value})이 허용 범위(${min}~${max})를 벗어나 ${clamped}로 보정했습니다.`,
    );
    return clamped;
  }
  return value;
}

function normalizeViewport(
  viewport: MobileViewportConfig | undefined,
  warnings: string[],
): NormalizedMobileViewportConfig {
  return {
    viewportWidthPx: Math.round(
      sanitizeFinite(
        viewport?.viewportWidthPx,
        DEFAULT_VIEWPORT_WIDTH_PX,
        240,
        1280,
        "viewportWidthPx",
        warnings,
      ),
    ),
    viewportHeightPx: Math.round(
      sanitizeFinite(
        viewport?.viewportHeightPx,
        DEFAULT_VIEWPORT_HEIGHT_PX,
        400,
        2400,
        "viewportHeightPx",
        warnings,
      ),
    ),
    charsPerSec: round6(
      sanitizeFinite(
        viewport?.charsPerSec,
        DEFAULT_CHARS_PER_SEC,
        3,
        35,
        "charsPerSec",
        warnings,
      ),
    ),
  };
}

interface SanitizedCut {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly originalOrder: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly characterCountKo: number;
  readonly balloonCount: number;
  readonly visualComplexity: number;
  readonly narrativeBeatKind: NarrativeBeatKind;
  readonly tensionScore: number;
  readonly isSilentBreathCut: boolean;
}

function normalizeCut(
  raw: EpisodePacingCutSpec,
  originalOrder: number,
  viewportHeightPx: number,
  warnings: string[],
): SanitizedCut {
  const cutId =
    typeof raw.cutId === "string" && raw.cutId.trim().length > 0
      ? raw.cutId.trim()
      : `cut-${originalOrder + 1}`;
  const rawIndex = Number.isFinite(raw.cutIndex) ? Math.round(raw.cutIndex) : originalOrder;
  const defaultCutHeight = Math.round(viewportHeightPx * 0.75);

  const heightPx = Math.round(
    sanitizeFinite(raw.heightPx, defaultCutHeight, 80, 12000, `${cutId}.heightPx`, warnings),
  );
  const gutterAfterPx = Math.round(
    sanitizeFinite(raw.gutterAfterPx, 0, 0, 3000, `${cutId}.gutterAfterPx`, warnings),
  );
  const characterCountKo = Math.round(
    sanitizeFinite(raw.characterCountKo, 0, 0, 5000, `${cutId}.characterCountKo`, warnings),
  );
  const balloonCount = Math.round(
    sanitizeFinite(raw.balloonCount, 0, 0, 50, `${cutId}.balloonCount`, warnings),
  );
  const visualComplexity = round6(
    sanitizeFinite(raw.visualComplexity, 0.5, 0, 1, `${cutId}.visualComplexity`, warnings),
  );
  const tensionScore = round6(
    sanitizeFinite(raw.tensionScore, 0.5, 0, 1, `${cutId}.tensionScore`, warnings),
  );

  let narrativeBeatKind: NarrativeBeatKind = "dialogue-exchange";
  if (VALID_BEAT_SET.has(raw.narrativeBeatKind)) {
    narrativeBeatKind = raw.narrativeBeatKind;
  } else {
    warnings.push(
      `${cutId}.narrativeBeatKind 값이 유효하지 않아 'dialogue-exchange'로 보정했습니다.`,
    );
  }

  return {
    cutId,
    cutIndex: rawIndex,
    originalOrder,
    heightPx,
    gutterAfterPx,
    characterCountKo,
    balloonCount,
    visualComplexity,
    narrativeBeatKind,
    tensionScore,
    isSilentBreathCut: raw.isSilentBreathCut === true,
  };
}

/**
 * 인접한 두 컷 사이의 서사 비트·긴장 전환에 필요한 최소 호흡 거터(px)를 산출한다.
 */
export function computeRequiredTransitionGutterPx(
  current: { readonly narrativeBeatKind: NarrativeBeatKind; readonly tensionScore: number },
  next: { readonly narrativeBeatKind: NarrativeBeatKind; readonly tensionScore: number },
): number {
  if (next.narrativeBeatKind === "cliffhanger-reveal") {
    return CRAMPED_GUTTER_CLIFFHANGER_MIN_PX;
  }
  if (
    current.narrativeBeatKind === "action-surge" ||
    next.narrativeBeatKind === "action-surge" ||
    current.narrativeBeatKind === "mid-twist" ||
    next.narrativeBeatKind === "mid-twist"
  ) {
    return CRAMPED_GUTTER_ACTION_MIN_PX;
  }
  if (
    current.narrativeBeatKind === "emotional-pause" ||
    next.narrativeBeatKind === "emotional-pause" ||
    current.narrativeBeatKind !== next.narrativeBeatKind ||
    Math.abs(next.tensionScore - current.tensionScore) >= 0.25
  ) {
    return CRAMPED_GUTTER_TRANSITION_MIN_PX;
  }
  return CRAMPED_GUTTER_BASELINE_MIN_PX;
}

/**
 * 컷이 대사 과밀 피로벽(Wall-of-Text) 후보인지 판정한다.
 */
export function isDenseFatigueWallCandidate(cut: CutRetentionSimulationPoint): boolean {
  if (cut.isSilentBreathCut) return false;
  return (
    cut.charsPerViewportScreen >= FATIGUE_WALL_CHARS_PER_SCREEN_THRESHOLD ||
    cut.narrativeBeatKind === "exposition"
  );
}

/**
 * 결정론적 모바일 웹툰 스크롤 체류·인지 피로 시뮬레이션을 실행한다.
 */
export function simulateEpisodeScrollRetention(
  input: EpisodePacingInput,
): EpisodeScrollRetentionSimulation {
  const warnings: string[] = [];
  const episodeId =
    typeof input.episodeId === "string" && input.episodeId.trim().length > 0
      ? input.episodeId.trim()
      : "episode-untitled";
  const episodeTitle =
    typeof input.episodeTitle === "string" && input.episodeTitle.trim().length > 0
      ? input.episodeTitle.trim()
      : episodeId;

  const viewport = normalizeViewport(input.viewport, warnings);
  const rawCuts = Array.isArray(input.cuts) ? input.cuts : [];

  if (rawCuts.length === 0) {
    warnings.push("분석할 컷 데이터가 비어 있어 시뮬레이션을 빈 상태로 마감했습니다.");
    const emptyManifest = {
      episodeId,
      episodeTitle,
      isSimulationEstimate: true,
      viewport,
      totalCutCount: 0,
      estimatedCompletionRetention: 0,
      warnings,
    };
    return {
      episodeId,
      episodeTitle,
      isSimulationEstimate: true,
      simulationNoticeKo: SIMULATION_ESTIMATE_NOTICE_KO,
      viewport,
      totalCutCount: 0,
      totalScrollHeightPx: 0,
      totalViewportScreens: 0,
      totalEstimatedDwellSeconds: 0,
      averageTensionScore: 0,
      averageCharsPerViewportScreen: 0,
      maxCharsPerViewportScreen: 0,
      peakCognitiveFatigue: 0,
      averageCognitiveFatigue: 0,
      averageEngagementIndex: 0,
      estimatedCompletionRetention: 0,
      estimatedNextEpisodeClickPropensity: 0,
      cutPoints: [],
      estimatedRetentionCurve: [],
      warnings,
      simulationSha256Hex: computePacingManifestSha256Hex(emptyManifest),
    };
  }

  const sanitizedCuts: SanitizedCut[] = rawCuts
    .map((cut, index) => normalizeCut(cut, index, viewport.viewportHeightPx, warnings))
    .sort((a, b) => a.cutIndex - b.cutIndex || a.originalOrder - b.originalOrder);

  let totalScrollHeightPx = 0;
  for (let i = 0; i < sanitizedCuts.length; i += 1) {
    const cut = sanitizedCuts[i];
    if (cut !== undefined) {
      totalScrollHeightPx += cut.heightPx + cut.gutterAfterPx;
    }
  }
  const safeTotalHeightPx = Math.max(1, totalScrollHeightPx);

  const cutPoints: CutRetentionSimulationPoint[] = [];
  const curve: RetentionCurveSample[] = [];
  const cutCount = sanitizedCuts.length;
  const perCutScale = 1 / Math.max(8, cutCount);

  let cursorPx = 0;
  let carryFatigue = 0.06;
  let retention = 1;
  let consecutiveDenseCount = 0;
  let prevTension = sanitizedCuts[0]?.tensionScore ?? 0.5;
  let prevGutterPx = 0;
  let prevWasSilent = false;

  let totalDwellSec = 0;
  let sumTension = 0;
  let sumCharsPerScreen = 0;
  let maxCharsPerScreen = 0;
  let peakFatigue = 0;
  let sumFatigue = 0;
  let sumEngagement = 0;

  for (let i = 0; i < cutCount; i += 1) {
    const cut = sanitizedCuts[i];
    if (cut === undefined) continue;
    const isLastCut = i === cutCount - 1;
    const nextCut = isLastCut ? undefined : sanitizedCuts[i + 1];

    const spanPx = cut.heightPx + cut.gutterAfterPx;
    const scrollStartPx = cursorPx;
    const scrollEndPx = cursorPx + spanPx;
    cursorPx = scrollEndPx;

    const scrollProgressStart = round6(clampUnit(scrollStartPx / safeTotalHeightPx));
    const scrollProgressCenter = round6(
      clampUnit((scrollStartPx + cut.heightPx * 0.5) / safeTotalHeightPx),
    );
    const scrollProgressEnd = round6(clampUnit(scrollEndPx / safeTotalHeightPx));

    const effectiveScreenSpan = Math.max(
      0.35,
      (cut.heightPx + Math.min(cut.gutterAfterPx, 480) * 0.85) / viewport.viewportHeightPx,
    );
    const charsPerViewportScreen = round6(cut.characterCountKo / effectiveScreenSpan);

    const textReadSec = cut.characterCountKo / viewport.charsPerSec;
    const balloonSwitchSec = cut.balloonCount * 0.24;
    const visualScanSec =
      0.55 +
      cut.visualComplexity * 1.45 +
      (cut.heightPx / viewport.viewportHeightPx) * 0.45;
    const breathPauseSec =
      (cut.isSilentBreathCut ? 0.85 : 0) +
      Math.min(1.6, cut.gutterAfterPx / (viewport.viewportHeightPx * 0.55));
    const dwellSeconds = round6(textReadSec + balloonSwitchSec + visualScanSec + breathPauseSec);

    const denseCut =
      !cut.isSilentBreathCut &&
      (charsPerViewportScreen >= FATIGUE_WALL_CHARS_PER_SCREEN_THRESHOLD ||
        (cut.narrativeBeatKind === "exposition" && charsPerViewportScreen >= 55));
    consecutiveDenseCount = denseCut ? consecutiveDenseCount + 1 : 0;

    const textBaseLoad = Math.min(0.24, (charsPerViewportScreen / 140) * 0.14);
    const textWallLoad =
      charsPerViewportScreen > 85
        ? Math.min(0.28, ((charsPerViewportScreen - 85) / 110) * 0.22)
        : 0;
    const balloonClutterLoad =
      cut.balloonCount > 3 ? Math.min(0.12, (cut.balloonCount - 3) * 0.025) : 0;
    const visualLoad = cut.visualComplexity * (0.04 + (charsPerViewportScreen > 75 ? 0.05 : 0));
    const expositionDrag = cut.narrativeBeatKind === "exposition" ? 0.055 : 0;
    const runCompounding =
      consecutiveDenseCount >= 2 ? Math.min(0.18, (consecutiveDenseCount - 1) * 0.065) : 0;

    let crampedStress = 0;
    let isCrampedTransition = false;
    if (!isLastCut && nextCut !== undefined) {
      const requiredGutter = computeRequiredTransitionGutterPx(cut, nextCut);
      if (cut.gutterAfterPx < requiredGutter) {
        isCrampedTransition = true;
        crampedStress = ((requiredGutter - cut.gutterAfterPx) / requiredGutter) * 0.09;
      }
    }

    const totalLoad =
      textBaseLoad +
      textWallLoad +
      balloonClutterLoad +
      visualLoad +
      expositionDrag +
      runCompounding +
      crampedStress;

    const cutIntrinsicRecovery =
      (cut.isSilentBreathCut ? 0.24 : 0) +
      (cut.narrativeBeatKind === "emotional-pause" && cut.characterCountKo <= 25 ? 0.12 : 0) +
      (charsPerViewportScreen < 40 ? 0.055 : 0);

    const effectiveRecoveryGutterPx = Math.min(cut.gutterAfterPx, 420);
    const gutterRecovery =
      effectiveRecoveryGutterPx > 90
        ? Math.min(0.26, ((effectiveRecoveryGutterPx - 90) / 300) * 0.22)
        : 0;

    const cognitiveFatigue = round6(
      clampUnit(carryFatigue * 0.9 + totalLoad - cutIntrinsicRecovery - gutterRecovery * 0.55),
    );
    carryFatigue = clampUnit(cognitiveFatigue - gutterRecovery * 0.45);

    if (cut.gutterAfterPx >= FATIGUE_WALL_BREATH_BREAK_GUTTER_PX) {
      consecutiveDenseCount = 0;
    }

    const beatBonus = BEAT_ENGAGEMENT_BONUS[cut.narrativeBeatKind];
    const isDramaticPayoffCut =
      cut.narrativeBeatKind === "cliffhanger-reveal" || cut.narrativeBeatKind === "mid-twist";
    const anticipationBonus =
      isDramaticPayoffCut && (prevGutterPx >= 220 || prevWasSilent) ? 0.08 : 0;
    const tensionSwingBonus = Math.min(0.06, Math.abs(cut.tensionScore - prevTension) * 0.16);
    const excessGutterBoredom =
      cut.gutterAfterPx > 650 ? Math.min(0.14, ((cut.gutterAfterPx - 650) / 800) * 0.12) : 0;

    const engagementIndex = round6(
      clampUnit(
        0.28 +
          cut.tensionScore * 0.56 +
          beatBonus +
          anticipationBonus +
          tensionSwingBonus -
          cognitiveFatigue * 0.36 -
          excessGutterBoredom,
      ),
    );

    const baseAttrition = 0.022 * perCutScale;
    const fatigueHazard = Math.pow(cognitiveFatigue, 1.65) * 0.42 * perCutScale;
    const boredomHazard =
      Math.pow(Math.max(0, 0.58 - engagementIndex), 1.45) * 0.38 * perCutScale;
    const wallShockHazard = consecutiveDenseCount >= FATIGUE_WALL_MIN_CONSECUTIVE_CUTS ? 0.028 : 0;
    const crampedHazard = isCrampedTransition ? 0.012 : 0;

    const dropFraction = clampNumber(
      baseAttrition + fatigueHazard + boredomHazard + wallShockHazard + crampedHazard,
      0,
      0.35,
    );

    const retentionBeforeCut = round6(retention);
    const retentionAfterCut = round6(clampNumber(retention * (1 - dropFraction), 0, retentionBeforeCut));
    const estimatedDropOffDelta = round6(Math.max(0, retentionBeforeCut - retentionAfterCut));
    retention = retentionAfterCut;

    totalDwellSec += dwellSeconds;
    sumTension += cut.tensionScore;
    sumCharsPerScreen += charsPerViewportScreen;
    if (charsPerViewportScreen > maxCharsPerScreen) maxCharsPerScreen = charsPerViewportScreen;
    if (cognitiveFatigue > peakFatigue) peakFatigue = cognitiveFatigue;
    sumFatigue += cognitiveFatigue;
    sumEngagement += engagementIndex;

    prevTension = cut.tensionScore;
    prevGutterPx = cut.gutterAfterPx;
    prevWasSilent = cut.isSilentBreathCut;

    cutPoints.push({
      cutId: cut.cutId,
      cutIndex: cut.cutIndex,
      narrativeBeatKind: cut.narrativeBeatKind,
      isSilentBreathCut: cut.isSilentBreathCut,
      heightPx: cut.heightPx,
      gutterAfterPx: cut.gutterAfterPx,
      characterCountKo: cut.characterCountKo,
      balloonCount: cut.balloonCount,
      visualComplexity: cut.visualComplexity,
      tensionScore: cut.tensionScore,
      scrollStartPx,
      scrollEndPx,
      scrollProgressStart,
      scrollProgressCenter,
      scrollProgressEnd,
      dwellSeconds,
      charsPerViewportScreen,
      cognitiveFatigue,
      engagementIndex,
      retentionBeforeCut,
      retentionAfterCut,
      estimatedDropOffDelta,
    });

    curve.push({
      cutId: cut.cutId,
      cutIndex: cut.cutIndex,
      scrollProgress: scrollProgressEnd,
      estimatedRetention: retentionAfterCut,
      cognitiveFatigue,
      tensionScore: cut.tensionScore,
      engagementIndex,
      isSimulationEstimate: true,
    });
  }

  const estimatedCompletionRetention = round6(retention);
  const endingCuts = cutPoints.filter(
    (point, idx) =>
      idx >= Math.max(0, cutCount - 2) || point.scrollProgressEnd >= CLIFFHANGER_WINDOW_START,
  );
  let endingPeakTension = 0;
  let hasCliffhangerBeat = false;
  for (let i = 0; i < endingCuts.length; i += 1) {
    const item = endingCuts[i];
    if (item === undefined) continue;
    if (item.tensionScore > endingPeakTension) endingPeakTension = item.tensionScore;
    if (item.narrativeBeatKind === "cliffhanger-reveal") hasCliffhangerBeat = true;
  }
  const finalFatigue = cutPoints[cutCount - 1]?.cognitiveFatigue ?? 0;
  const estimatedNextEpisodeClickPropensity = round6(
    clampUnit(
      estimatedCompletionRetention *
        (0.42 +
          endingPeakTension * 0.45 +
          (hasCliffhangerBeat ? 0.13 : 0) -
          finalFatigue * 0.15),
    ),
  );

  const manifest = {
    episodeId,
    episodeTitle,
    isSimulationEstimate: true,
    viewport,
    totalCutCount: cutCount,
    totalScrollHeightPx,
    estimatedCompletionRetention,
    peakCognitiveFatigue: round6(peakFatigue),
    estimatedNextEpisodeClickPropensity,
    cutDigest: cutPoints.map((c) => ({
      cutId: c.cutId,
      cutIndex: c.cutIndex,
      gutterAfterPx: c.gutterAfterPx,
      charsPerViewportScreen: c.charsPerViewportScreen,
      cognitiveFatigue: c.cognitiveFatigue,
      retentionAfterCut: c.retentionAfterCut,
    })),
  };

  return {
    episodeId,
    episodeTitle,
    isSimulationEstimate: true,
    simulationNoticeKo: SIMULATION_ESTIMATE_NOTICE_KO,
    viewport,
    totalCutCount: cutCount,
    totalScrollHeightPx,
    totalViewportScreens: round6(totalScrollHeightPx / viewport.viewportHeightPx),
    totalEstimatedDwellSeconds: round6(totalDwellSec),
    averageTensionScore: round6(sumTension / cutCount),
    averageCharsPerViewportScreen: round6(sumCharsPerScreen / cutCount),
    maxCharsPerViewportScreen: round6(maxCharsPerScreen),
    peakCognitiveFatigue: round6(peakFatigue),
    averageCognitiveFatigue: round6(sumFatigue / cutCount),
    averageEngagementIndex: round6(sumEngagement / cutCount),
    estimatedCompletionRetention,
    estimatedNextEpisodeClickPropensity,
    cutPoints,
    estimatedRetentionCurve: curve,
    warnings,
    simulationSha256Hex: computePacingManifestSha256Hex(manifest),
  };
}
