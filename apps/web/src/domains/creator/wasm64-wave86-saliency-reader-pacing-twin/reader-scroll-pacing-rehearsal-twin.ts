/**
 * Wave 86 — 출고 전 세로 스크롤 리듬·체류 시간·이탈 위험 리허설 트윈.
 *
 * 실측 독자 로그나 허구 설문 수치를 사용하지 않고, 3가지 투명한 합성 독자 속도 프로파일
 * (`fast-commuter-skimmer`, `standard-immersed-reader`, `detail-savoring-reader`)을
 * 모바일 뷰포트(기본 390×844px) 위로 가상 스크롤시켜 컷별 체류 시간(ms),
 * `scrollY` 기준 속도 곡선(px/s), 반전 컷 직전 호흡 여백(Breath-Hold Suspense),
 * 그리고 장문 말풍선 과밀·리듬 단조로움 피로 지수를 계산한다.
 */

/** 합성 독자 스크롤 리듬 아키타입 식별자. */
export type ReaderPacingArchetypeId =
  | "fast-commuter-skimmer"
  | "standard-immersed-reader"
  | "detail-savoring-reader";

/** 합성 독자 아키타입 파라미터 명세. */
export interface ReaderPacingArchetypeProfile {
  readonly id: ReaderPacingArchetypeId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly koreanCharsPerSec: number;
  readonly latinCharsPerSec: number;
  readonly baseVisualScanMs: number;
  readonly visualComplexityWeightMs: number;
  readonly balloonSwitchMs: number;
  readonly openWhitespaceVelocityPxPerSec: number;
  readonly patienceFactor: number;
  readonly wallOfTextTolerance: number;
}

/** 3종의 투명한 합성 독자 리듬 아키타입 카탈로그. */
export const READER_PACING_ARCHETYPES: Readonly<
  Record<ReaderPacingArchetypeId, ReaderPacingArchetypeProfile>
> = {
  "fast-commuter-skimmer": {
    id: "fast-commuter-skimmer",
    labelKo: "출근길 빠른 훑기 독자",
    descriptionKo: "이동 중 빠른 엄지 스크롤로 핵심 대사와 표정 변화 위주로 훑는 리듬 모델",
    koreanCharsPerSec: 14.5,
    latinCharsPerSec: 26.0,
    baseVisualScanMs: 460,
    visualComplexityWeightMs: 580,
    balloonSwitchMs: 110,
    openWhitespaceVelocityPxPerSec: 1180,
    patienceFactor: 0.78,
    wallOfTextTolerance: 0.72,
  },
  "standard-immersed-reader": {
    id: "standard-immersed-reader",
    labelKo: "일반 몰입 감상 독자",
    descriptionKo: "대사와 연출 여백을 자연스러운 속도로 따라가며 감상하는 기준 리듬 모델",
    koreanCharsPerSec: 9.5,
    latinCharsPerSec: 17.0,
    baseVisualScanMs: 820,
    visualComplexityWeightMs: 1240,
    balloonSwitchMs: 165,
    openWhitespaceVelocityPxPerSec: 760,
    patienceFactor: 1.0,
    wallOfTextTolerance: 1.0,
  },
  "detail-savoring-reader": {
    id: "detail-savoring-reader",
    labelKo: "작화·연출 꼼꼼 감상 독자",
    descriptionKo: "배경 디테일, 대사 뉘앙스, 컷 간 여운까지 천천히 음미하는 정독 리듬 모델",
    koreanCharsPerSec: 6.4,
    latinCharsPerSec: 11.8,
    baseVisualScanMs: 1320,
    visualComplexityWeightMs: 2050,
    balloonSwitchMs: 230,
    openWhitespaceVelocityPxPerSec: 500,
    patienceFactor: 1.28,
    wallOfTextTolerance: 1.25,
  },
};

/** 기본 모바일 세로 웹툰 뷰포트 규격 (390×844px). */
export interface MobileViewportSpec {
  readonly widthPx: number;
  readonly heightPx: number;
}

export const DEFAULT_MOBILE_VIEWPORT_PX: MobileViewportSpec = {
  widthPx: 390,
  heightPx: 844,
};

/** 회차 리듬 시뮬레이션용 컷 단위 입력 명세. */
export interface EpisodePacingCutSpec {
  readonly cutId: string;
  readonly panelHeightPx: number;
  readonly whitespaceBeforePx: number;
  readonly dialogueCharCount: number;
  readonly latinCharCount?: number;
  readonly balloonCount?: number;
  readonly visualComplexityScore: number;
  readonly isTwistReveal?: boolean;
  readonly isCliffhangerEnd?: boolean;
  readonly labelKo?: string;
}

/** 회차 스크롤 리듬 시뮬레이션 입력. */
export interface SimulateEpisodeReaderPacingInput {
  readonly episodeId?: string;
  readonly cuts: readonly EpisodePacingCutSpec[];
  readonly viewport?: Partial<MobileViewportSpec>;
  readonly archetypes?: readonly ReaderPacingArchetypeId[];
  readonly velocitySampleStepPx?: number;
  readonly minTwistWhitespacePx?: number;
}

/** 컷별 세로 레이아웃 좌표 및 피로 요소. */
export interface CutPacingSimulationPoint {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly startY: number;
  readonly panelStartY: number;
  readonly panelEndY: number;
  readonly whitespaceBeforePx: number;
  readonly panelHeightPx: number;
  readonly dialogueCharCount: number;
  readonly effectiveBalloonCount: number;
  readonly visualComplexityScore: number;
  readonly predictedDwellMs: number;
  readonly readingTimeMs: number;
  readonly visualScanTimeMs: number;
  readonly cutMeanVelocityPxPerSec: number;
  readonly textDensityPer100Px: number;
  readonly fatigueRiskIndex: number;
  readonly dropOffRiskIndex: number;
}

/** `scrollY` 기준 샘플링된 세로 스크롤 속도 곡선 지점. */
export interface ScrollVelocitySample {
  readonly scrollY: number;
  readonly velocityPxPerSec: number;
  readonly cutId: string;
  readonly zone: "whitespace" | "panel";
}

/** 반전 컷 직전 호흡 멈춤(Breath-Hold Suspense) 진단 결과. */
export interface TwistBreathHoldAudit {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly actualWhitespacePx: number;
  readonly recommendedMinWhitespacePx: number;
  readonly recommendedWhitespaceDeltaPx: number;
  readonly breathHoldSuspenseScore: number;
  readonly status: "abrupt" | "well-paced" | "over-stretched";
  readonly guidanceKo: string;
}

/** 인지 피로·리듬 단조로움·호흡 급전환 위험 구간. */
export type PacingRiskHotspotKind =
  | "wall-of-text"
  | "abrupt-twist"
  | "rhythm-monotony"
  | "visual-overload"
  | "over-stretched-gap";

export interface PacingRiskHotspot {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly kind: PacingRiskHotspotKind;
  readonly severity: "info" | "warning" | "critical";
  readonly fatigueRiskIndex: number;
  readonly recommendedWhitespaceDeltaPx: number;
  readonly messageKo: string;
}

/** 아키타입별 전체 회차 리허설 궤적. */
export interface ArchetypePacingSimulation {
  readonly archetype: ReaderPacingArchetypeProfile;
  readonly totalReadTimeMs: number;
  readonly totalReadTimeSec: number;
  readonly meanScrollVelocityPxPerSec: number;
  readonly peakFatigueRiskIndex: number;
  readonly meanFatigueRiskIndex: number;
  readonly estimatedDropOffRiskIndex: number;
  readonly cutTimeline: readonly CutPacingSimulationPoint[];
  readonly scrollVelocityCurve: readonly ScrollVelocitySample[];
}

/** 회차 스크롤 리듬 리허설 트윈 통합 결과. */
export interface EpisodeReaderPacingTwinResult {
  readonly episodeId: string;
  readonly isSimulationEstimate: true;
  readonly readerPiiCollected: false;
  readonly externalTelemetryUpload: false;
  readonly dataOrigin: "local-synthetic-pacing-model";
  readonly disclaimerKo: string;
  readonly viewport: MobileViewportSpec;
  readonly totalCutCount: number;
  readonly totalStripHeightPx: number;
  readonly archetypeSimulations: readonly ArchetypePacingSimulation[];
  readonly twistAudits: readonly TwistBreathHoldAudit[];
  readonly riskHotspots: readonly PacingRiskHotspot[];
  readonly rhythmVarietyScore: number;
  readonly readabilityComfortScore: number;
  readonly suspensePacingScore: number;
  readonly overallPacingScore: number;
  readonly dropOffRiskTier: "low" | "moderate" | "elevated";
}

export const PACING_TWIN_DISCLAIMER_KO =
  "실측 독자 로그가 아닌 로컬 시각·리듬 시뮬레이션 추정치입니다. 실제 플랫폼 이탈률이나 설문 수치가 아닙니다.";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function validateCuts(cuts: readonly EpisodePacingCutSpec[]): void {
  if (cuts.length === 0) {
    throw new Error("스크롤 리듬 시뮬레이션을 실행하려면 최소 1개 이상의 컷 명세가 필요합니다.");
  }
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;
    if (!Number.isFinite(cut.panelHeightPx) || cut.panelHeightPx <= 0) {
      throw new Error(`컷 '${cut.cutId}'의 panelHeightPx는 0보다 큰 유한한 값이어야 합니다.`);
    }
    if (!Number.isFinite(cut.whitespaceBeforePx) || cut.whitespaceBeforePx < 0) {
      throw new Error(`컷 '${cut.cutId}'의 whitespaceBeforePx는 0 이상이어야 합니다.`);
    }
    if (!Number.isFinite(cut.dialogueCharCount) || cut.dialogueCharCount < 0) {
      throw new Error(`컷 '${cut.cutId}'의 dialogueCharCount는 0 이상이어야 합니다.`);
    }
  }
}

function inferEffectiveBalloonCount(cut: EpisodePacingCutSpec): number {
  if (typeof cut.balloonCount === "number" && Number.isFinite(cut.balloonCount) && cut.balloonCount >= 0) {
    return Math.round(cut.balloonCount);
  }
  const totalChars = cut.dialogueCharCount + (cut.latinCharCount ?? 0);
  if (totalChars <= 0) return 0;
  return Math.max(1, Math.ceil(totalChars / 38));
}

function evaluateTwistBreathHoldAudits(
  cuts: readonly EpisodePacingCutSpec[],
  viewportHeightPx: number,
  customMinTwistWhitespacePx?: number,
): TwistBreathHoldAudit[] {
  // 844px 모바일 화면 기준 약 26%(220px)의 세로 여백을 최소 호흡 멈춤 기준으로 삼는다.
  const recommendedMin =
    customMinTwistWhitespacePx !== undefined
      ? Math.max(60, Math.round(customMinTwistWhitespacePx))
      : Math.round(viewportHeightPx * 0.2607);
  const maxComfortGap = Math.round(viewportHeightPx * 1.3);

  const audits: TwistBreathHoldAudit[] = [];
  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut || !cut.isTwistReveal) continue;

    const actual = Math.round(cut.whitespaceBeforePx);
    if (actual < recommendedMin) {
      const shortfall = recommendedMin - actual;
      const ratio = clamp(actual / recommendedMin, 0, 1);
      const suspenseScore = Number((0.18 + ratio * 0.56).toFixed(3));
      audits.push({
        cutId: cut.cutId,
        cutIndex: i,
        actualWhitespacePx: actual,
        recommendedMinWhitespacePx: recommendedMin,
        recommendedWhitespaceDeltaPx: shortfall,
        breathHoldSuspenseScore: suspenseScore,
        status: "abrupt",
        guidanceKo: `반전 컷 직전 세로 여백이 약 ${shortfall}px 짧아 호흡이 급하게 전환됩니다. 직전 여백을 최소 ${recommendedMin}px 이상으로 늘려 긴장감을 확보해 보세요.`,
      });
    } else if (actual > maxComfortGap) {
      const excess = actual - maxComfortGap;
      const suspenseScore = Number(clamp(0.86 - (excess / viewportHeightPx) * 0.35, 0.35, 0.85).toFixed(3));
      audits.push({
        cutId: cut.cutId,
        cutIndex: i,
        actualWhitespacePx: actual,
        recommendedMinWhitespacePx: recommendedMin,
        recommendedWhitespaceDeltaPx: -excess,
        breathHoldSuspenseScore: suspenseScore,
        status: "over-stretched",
        guidanceKo: `반전 컷 직전 세로 여백이 ${actual}px로 과도하게 길어 스크롤 맥이 끊길 수 있습니다. 약 ${excess}px 줄여 긴장감을 유지해 보세요.`,
      });
    } else {
      // 220px~640px 구간은 한 번의 의도적 엄지 스와이프로 호흡을 멈추기에 이상적이다.
      const sweetPeak = Math.round(viewportHeightPx * 0.42);
      const distNorm = Math.abs(actual - sweetPeak) / Math.max(1, maxComfortGap - recommendedMin);
      const suspenseScore = Number(clamp(1.0 - distNorm * 0.14, 0.85, 1.0).toFixed(3));
      audits.push({
        cutId: cut.cutId,
        cutIndex: i,
        actualWhitespacePx: actual,
        recommendedMinWhitespacePx: recommendedMin,
        recommendedWhitespaceDeltaPx: 0,
        breathHoldSuspenseScore: suspenseScore,
        status: "well-paced",
        guidanceKo: `반전 컷 직전 세로 여백(${actual}px)이 충분해 독자가 숨을 고르고 전환을 받아들이기 좋습니다.`,
      });
    }
  }
  return audits;
}

function computeWallOfTextRisk(
  dialogueChars: number,
  latinChars: number,
  balloonCount: number,
  panelHeightPx: number,
  tolerance: number,
): { readonly densityPer100Px: number; readonly risk: number } {
  const effectiveChars = dialogueChars + latinChars * 0.55;
  const densityPer100Px = (effectiveChars / Math.max(panelHeightPx, 120)) * 100;
  const balloonsPerScreenHalf = balloonCount / Math.max(panelHeightPx / 260, 0.7);
  // 100px당 16자 초과 또는 짧은 컷 내 말풍선 3~4개 과밀 시 피로가 급격히 오른다.
  const densityPressure = clamp((densityPer100Px - 14 * tolerance) / (26 * tolerance), 0, 1);
  const crowdingPressure = clamp((balloonsPerScreenHalf - 1.5 * tolerance) / (1.8 * tolerance), 0, 1);
  const absoluteTextPressure = clamp((effectiveChars - 110 * tolerance) / (120 * tolerance), 0, 1);
  const risk = clamp(
    0.45 * densityPressure + 0.35 * crowdingPressure + 0.2 * absoluteTextPressure,
    0,
    1,
  );
  return { densityPer100Px: Number(densityPer100Px.toFixed(2)), risk };
}

function computeRhythmVarietyScore(cuts: readonly EpisodePacingCutSpec[]): {
  readonly varietyScore: number;
  readonly monotonyRunIndices: readonly number[];
} {
  if (cuts.length < 3) {
    return { varietyScore: 82, monotonyRunIndices: [] };
  }

  const heights = cuts.map((c) => c.panelHeightPx);
  const gaps = cuts.map((c) => c.whitespaceBeforePx);
  const meanH = heights.reduce((a, b) => a + b, 0) / heights.length;
  const meanG = gaps.reduce((a, b) => a + b, 0) / gaps.length;

  const stdH = Math.sqrt(heights.reduce((acc, v) => acc + (v - meanH) * (v - meanH), 0) / heights.length);
  const stdG = Math.sqrt(gaps.reduce((acc, v) => acc + (v - meanG) * (v - meanG), 0) / gaps.length);

  const cvH = meanH > 0 ? stdH / meanH : 0;
  const cvG = meanG > 0 ? stdG / meanG : 0;

  // 연속 4컷 이상 높이와 여백 변화가 거의 없고 반전/완급도 없는 단조 구간을 탐지한다.
  const monotonyRunIndices: number[] = [];
  let streak = 1;
  for (let i = 1; i < cuts.length; i += 1) {
    const prev = cuts[i - 1];
    const curr = cuts[i];
    if (!prev || !curr) continue;
    const heightRelDiff = Math.abs(curr.panelHeightPx - prev.panelHeightPx) / Math.max(prev.panelHeightPx, 1);
    const gapAbsDiff = Math.abs(curr.whitespaceBeforePx - prev.whitespaceBeforePx);
    const isSimilarBeat =
      heightRelDiff <= 0.1 && gapAbsDiff <= 25 && !curr.isTwistReveal && !curr.isCliffhangerEnd;
    if (isSimilarBeat) {
      streak += 1;
      if (streak === 4) {
        monotonyRunIndices.push(i);
      }
    } else {
      streak = 1;
    }
  }

  const heightVariety = clamp(cvH / 0.34, 0, 1);
  const gapVariety = clamp(cvG / 0.45, 0, 1);
  const penalty = Math.min(35, monotonyRunIndices.length * 16);
  const score = clamp(Math.round(40 + 36 * heightVariety + 24 * gapVariety - penalty), 20, 100);
  return { varietyScore: score, monotonyRunIndices };
}

function simulateSingleArchetype(
  cuts: readonly EpisodePacingCutSpec[],
  archetype: ReaderPacingArchetypeProfile,
  viewport: MobileViewportSpec,
  velocitySampleStepPx: number,
  twistAuditByCutId: ReadonlyMap<string, TwistBreathHoldAudit>,
  monotonyIndices: ReadonlySet<number>,
): ArchetypePacingSimulation {
  const timeline: CutPacingSimulationPoint[] = [];
  const curve: ScrollVelocitySample[] = [];

  let cursorY = 0;
  let totalReadTimeMs = 0;
  let cumulativeFatigueDebt = 0;
  let peakFatigue = 0;
  let fatigueSum = 0;
  let dropOffPeak = 0;

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;
    const startY = cursorY;
    const panelStartY = startY + cut.whitespaceBeforePx;
    const panelEndY = panelStartY + cut.panelHeightPx;
    cursorY = panelEndY;

    const latinChars = Math.max(0, cut.latinCharCount ?? 0);
    const koreanChars = Math.max(0, cut.dialogueCharCount);
    const complexity = clamp(cut.visualComplexityScore, 0, 1);
    const effectiveBalloons = inferEffectiveBalloonCount(cut);

    const readingTimeMs =
      (koreanChars / archetype.koreanCharsPerSec) * 1000 +
      (latinChars / archetype.latinCharsPerSec) * 1000 +
      Math.max(0, effectiveBalloons - 1) * archetype.balloonSwitchMs;

    const heightScale = clamp(cut.panelHeightPx / viewport.heightPx, 0.55, 2.2);
    const visualScanTimeMs =
      archetype.baseVisualScanMs * heightScale + complexity * archetype.visualComplexityWeightMs;

    const twistPauseMs = cut.isTwistReveal ? 240 * archetype.patienceFactor : 0;
    const cliffPauseMs = cut.isCliffhangerEnd ? 320 * archetype.patienceFactor : 0;
    const predictedDwellMs = Math.round(readingTimeMs + visualScanTimeMs + twistPauseMs + cliffPauseMs);

    const whitespaceTimeMs =
      cut.whitespaceBeforePx > 0
        ? Math.round((cut.whitespaceBeforePx / archetype.openWhitespaceVelocityPxPerSec) * 1000)
        : 0;
    totalReadTimeMs += predictedDwellMs + whitespaceTimeMs;

    const panelVelocity = clamp(cut.panelHeightPx / Math.max(predictedDwellMs / 1000, 0.2), 35, 1950);
    const whitespaceVelocity = cut.isTwistReveal
      ? archetype.openWhitespaceVelocityPxPerSec * 0.72
      : archetype.openWhitespaceVelocityPxPerSec;

    const wall = computeWallOfTextRisk(
      koreanChars,
      latinChars,
      effectiveBalloons,
      cut.panelHeightPx,
      archetype.wallOfTextTolerance,
    );
    const visualOverload = clamp((complexity - 0.74) / 0.26, 0, 1) * clamp(koreanChars / 90, 0.25, 1);
    const twistAudit = twistAuditByCutId.get(cut.cutId);
    const twistPenalty = twistAudit?.status === "abrupt" ? 0.22 : twistAudit?.status === "over-stretched" ? 0.14 : 0;
    const monotonyPenalty = monotonyIndices.has(i) ? 0.24 : 0;

    const dominantLoad = Math.max(wall.risk * 0.88, visualOverload * 0.78);
    const blendedLoad = 0.62 * wall.risk + 0.26 * visualOverload;
    const cutFatigue = clamp(
      Math.max(dominantLoad, blendedLoad) + twistPenalty + monotonyPenalty,
      0,
      1,
    );

    // 피로가 누적되면 이탈 위험이 상승하고, 여유로운 여백·저밀도 컷에서 자연 회복된다.
    if (cutFatigue >= 0.45) {
      cumulativeFatigueDebt = clamp(cumulativeFatigueDebt + cutFatigue * 0.28, 0, 1);
    } else {
      cumulativeFatigueDebt = clamp(cumulativeFatigueDebt * 0.74, 0, 1);
    }
    const cutDropOffRisk = clamp(0.62 * cutFatigue + 0.38 * cumulativeFatigueDebt, 0, 1);

    if (cutFatigue > peakFatigue) peakFatigue = cutFatigue;
    fatigueSum += cutFatigue;
    if (cutDropOffRisk > dropOffPeak) dropOffPeak = cutDropOffRisk;

    timeline.push({
      cutId: cut.cutId,
      cutIndex: i,
      startY: Math.round(startY),
      panelStartY: Math.round(panelStartY),
      panelEndY: Math.round(panelEndY),
      whitespaceBeforePx: Math.round(cut.whitespaceBeforePx),
      panelHeightPx: Math.round(cut.panelHeightPx),
      dialogueCharCount: Math.round(koreanChars + latinChars),
      effectiveBalloonCount: effectiveBalloons,
      visualComplexityScore: Number(complexity.toFixed(3)),
      predictedDwellMs,
      readingTimeMs: Math.round(readingTimeMs),
      visualScanTimeMs: Math.round(visualScanTimeMs),
      cutMeanVelocityPxPerSec: Number(panelVelocity.toFixed(1)),
      textDensityPer100Px: wall.densityPer100Px,
      fatigueRiskIndex: Number(cutFatigue.toFixed(3)),
      dropOffRiskIndex: Number(cutDropOffRisk.toFixed(3)),
    });

    // `scrollY` 기준 속도 곡선 샘플링 (여백 -> 컷 내부 감속 전이 반영).
    if (cut.whitespaceBeforePx > 0) {
      for (let y = startY; y < panelStartY; y += velocitySampleStepPx) {
        const progress = clamp((y - startY) / Math.max(cut.whitespaceBeforePx, 1), 0, 1);
        const vel = whitespaceVelocity * (1 - 0.25 * progress) + panelVelocity * (0.25 * progress);
        curve.push({
          scrollY: Math.round(y),
          velocityPxPerSec: Number(vel.toFixed(1)),
          cutId: cut.cutId,
          zone: "whitespace",
        });
      }
    }
    for (let y = panelStartY; y < panelEndY; y += velocitySampleStepPx) {
      const progress = clamp((y - panelStartY) / Math.max(cut.panelHeightPx, 1), 0, 1);
      // 컷 중앙부에서 가장 느리게 읽고, 하단 탈출 시 미세하게 가속한다.
      const bell = Math.sin(progress * Math.PI);
      const vel = clamp(panelVelocity * (1.12 - 0.24 * bell), 30, 2100);
      curve.push({
        scrollY: Math.round(y),
        velocityPxPerSec: Number(vel.toFixed(1)),
        cutId: cut.cutId,
        zone: "panel",
      });
    }
  }

  const totalStripHeightPx = cursorY;
  const meanVelocity =
    totalReadTimeMs > 0 ? Number((totalStripHeightPx / (totalReadTimeMs / 1000)).toFixed(1)) : 0;
  const meanFatigue = cuts.length > 0 ? fatigueSum / cuts.length : 0;
  const estimatedDropOff = clamp(0.55 * dropOffPeak + 0.45 * meanFatigue, 0, 1);

  return {
    archetype,
    totalReadTimeMs,
    totalReadTimeSec: Number((totalReadTimeMs / 1000).toFixed(2)),
    meanScrollVelocityPxPerSec: meanVelocity,
    peakFatigueRiskIndex: Number(peakFatigue.toFixed(3)),
    meanFatigueRiskIndex: Number(meanFatigue.toFixed(3)),
    estimatedDropOffRiskIndex: Number(estimatedDropOff.toFixed(3)),
    cutTimeline: timeline,
    scrollVelocityCurve: curve,
  };
}

/**
 * 3종의 합성 독자 아키타입으로 세로 웹툰 회차의 스크롤 속도, 컷별 체류 시간,
 * 반전 전 호흡 여백, 장문 과밀·단조 피로 지수를 통합 시뮬레이션한다.
 */
export function simulateEpisodeReaderPacingTwin(
  input: SimulateEpisodeReaderPacingInput,
): EpisodeReaderPacingTwinResult {
  validateCuts(input.cuts);

  const viewport: MobileViewportSpec = {
    widthPx: Math.max(280, Math.round(input.viewport?.widthPx ?? DEFAULT_MOBILE_VIEWPORT_PX.widthPx)),
    heightPx: Math.max(480, Math.round(input.viewport?.heightPx ?? DEFAULT_MOBILE_VIEWPORT_PX.heightPx)),
  };
  const velocitySampleStepPx = clamp(Math.round(input.velocitySampleStepPx ?? 120), 24, 400);
  const archetypeIds: readonly ReaderPacingArchetypeId[] =
    input.archetypes && input.archetypes.length > 0
      ? input.archetypes
      : ["fast-commuter-skimmer", "standard-immersed-reader", "detail-savoring-reader"];

  const twistAudits = evaluateTwistBreathHoldAudits(
    input.cuts,
    viewport.heightPx,
    input.minTwistWhitespacePx,
  );
  const twistAuditByCutId = new Map<string, TwistBreathHoldAudit>();
  for (const audit of twistAudits) {
    twistAuditByCutId.set(audit.cutId, audit);
  }

  const variety = computeRhythmVarietyScore(input.cuts);
  const monotonySet = new Set<number>(variety.monotonyRunIndices);

  const archetypeSimulations = archetypeIds.map((id) =>
    simulateSingleArchetype(
      input.cuts,
      READER_PACING_ARCHETYPES[id],
      viewport,
      velocitySampleStepPx,
      twistAuditByCutId,
      monotonySet,
    ),
  );

  const standardSim =
    archetypeSimulations.find((s) => s.archetype.id === "standard-immersed-reader") ??
    archetypeSimulations[0];
  const totalStripHeightPx = input.cuts.reduce(
    (sum, cut) => sum + Math.round(cut.whitespaceBeforePx + cut.panelHeightPx),
    0,
  );

  // 기준 독자(일반 몰입 감상 독자)를 중심으로 위험 구간(Hotspot) 수집.
  const riskHotspots: PacingRiskHotspot[] = [];
  for (const audit of twistAudits) {
    if (audit.status === "abrupt") {
      riskHotspots.push({
        cutId: audit.cutId,
        cutIndex: audit.cutIndex,
        kind: "abrupt-twist",
        severity: audit.recommendedWhitespaceDeltaPx >= 120 ? "critical" : "warning",
        fatigueRiskIndex: Number((1 - audit.breathHoldSuspenseScore).toFixed(3)),
        recommendedWhitespaceDeltaPx: audit.recommendedWhitespaceDeltaPx,
        messageKo: audit.guidanceKo,
      });
    } else if (audit.status === "over-stretched") {
      riskHotspots.push({
        cutId: audit.cutId,
        cutIndex: audit.cutIndex,
        kind: "over-stretched-gap",
        severity: "warning",
        fatigueRiskIndex: Number((1 - audit.breathHoldSuspenseScore).toFixed(3)),
        recommendedWhitespaceDeltaPx: audit.recommendedWhitespaceDeltaPx,
        messageKo: audit.guidanceKo,
      });
    }
  }

  if (standardSim) {
    for (const cutPoint of standardSim.cutTimeline) {
      const cutSpec = input.cuts[cutPoint.cutIndex];
      if (!cutSpec) continue;
      const wall = computeWallOfTextRisk(
        cutSpec.dialogueCharCount,
        cutSpec.latinCharCount ?? 0,
        cutPoint.effectiveBalloonCount,
        cutSpec.panelHeightPx,
        1.0,
      );
      if (wall.risk >= 0.55) {
        riskHotspots.push({
          cutId: cutPoint.cutId,
          cutIndex: cutPoint.cutIndex,
          kind: "wall-of-text",
          severity: wall.risk >= 0.72 ? "critical" : "warning",
          fatigueRiskIndex: cutPoint.fatigueRiskIndex,
          recommendedWhitespaceDeltaPx: 0,
          messageKo: `컷 '${cutPoint.cutId}'에 말풍선 ${cutPoint.effectiveBalloonCount}개(${cutPoint.dialogueCharCount}자)가 몰려 가독 피로가 높습니다. 컷을 둘로 나누거나 대사를 줄여 보세요.`,
        });
      } else if (cutSpec.visualComplexityScore >= 0.85 && cutSpec.dialogueCharCount >= 80) {
        riskHotspots.push({
          cutId: cutPoint.cutId,
          cutIndex: cutPoint.cutIndex,
          kind: "visual-overload",
          severity: "warning",
          fatigueRiskIndex: cutPoint.fatigueRiskIndex,
          recommendedWhitespaceDeltaPx: 0,
          messageKo: `컷 '${cutPoint.cutId}'은 배경 밀도와 대사량이 동시에 높아 독자 시선이 피로해질 수 있습니다. 배경 톤을 한 단계 정리해 보세요.`,
        });
      }
      if (monotonySet.has(cutPoint.cutIndex)) {
        riskHotspots.push({
          cutId: cutPoint.cutId,
          cutIndex: cutPoint.cutIndex,
          kind: "rhythm-monotony",
          severity: "warning",
          fatigueRiskIndex: cutPoint.fatigueRiskIndex,
          recommendedWhitespaceDeltaPx: 80,
          messageKo: `컷 '${cutPoint.cutId}' 부근까지 비슷한 크기와 여백의 컷이 4연속 이어져 스크롤 리듬이 단조로워집니다. 컷 높이나 직전 여백에 강약을 주세요.`,
        });
      }
    }
  }

  const readabilityComfortScore = standardSim
    ? clamp(Math.round(100 - standardSim.peakFatigueRiskIndex * 48 - standardSim.meanFatigueRiskIndex * 32), 15, 100)
    : 85;
  const suspensePacingScore =
    twistAudits.length > 0
      ? Math.round(
          (twistAudits.reduce((sum, a) => sum + a.breathHoldSuspenseScore, 0) / twistAudits.length) * 100,
        )
      : 88;
  const overallPacingScore = clamp(
    Math.round(
      0.42 * readabilityComfortScore + 0.34 * suspensePacingScore + 0.24 * variety.varietyScore,
    ),
    0,
    100,
  );
  const dropOffRiskIndex = standardSim ? standardSim.estimatedDropOffRiskIndex : 0.2;
  const dropOffRiskTier: "low" | "moderate" | "elevated" =
    dropOffRiskIndex >= 0.52 ? "elevated" : dropOffRiskIndex >= 0.3 ? "moderate" : "low";

  return {
    episodeId: input.episodeId ?? "untitled-episode",
    isSimulationEstimate: true,
    readerPiiCollected: false,
    externalTelemetryUpload: false,
    dataOrigin: "local-synthetic-pacing-model",
    disclaimerKo: PACING_TWIN_DISCLAIMER_KO,
    viewport,
    totalCutCount: input.cuts.length,
    totalStripHeightPx,
    archetypeSimulations,
    twistAudits,
    riskHotspots,
    rhythmVarietyScore: variety.varietyScore,
    readabilityComfortScore,
    suspensePacingScore,
    overallPacingScore,
    dropOffRiskTier,
  };
}
