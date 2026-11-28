/**
 * Wave 149 — 5대 페이싱 병목 감지기 및 비파괴 여백·호흡 페이싱 옵티마이저.
 *
 * - `simulateEpisodeScrollRetention`을 재수출해 단일 모듈 경로에서도 시뮬레이션·감사·최적화를
 *   모두 호출할 수 있다.
 * - 비파괴 여백 리플로우는 대사·작화·컷 순서를 변경하지 않고 `gutterAfterPx`만 정밀 확장한다.
 */

import {
  CLIFFHANGER_MIN_TENSION,
  CLIFFHANGER_WINDOW_START,
  CRAMPED_GUTTER_ACTION_MIN_PX,
  CRAMPED_GUTTER_TRANSITION_MIN_PX,
  FATIGUE_WALL_BREATH_BREAK_GUTTER_PX,
  FATIGUE_WALL_CHARS_PER_SCREEN_THRESHOLD,
  FATIGUE_WALL_MIN_CONSECUTIVE_CUTS,
  MID_EPISODE_PEAK_MIN_TENSION,
  MID_EPISODE_TWIST_MIN_TENSION,
  MID_EPISODE_WINDOW_END,
  MID_EPISODE_WINDOW_START,
  OPENING_HOOK_LABELED_MIN_TENSION,
  OPENING_HOOK_MIN_TENSION,
  OPENING_HOOK_UNLABELED_MIN_TENSION,
  OPENING_HOOK_WINDOW_END,
  OPTIMIZED_ACTION_GUTTER_PX,
  OPTIMIZED_BREATH_GUTTER_PX,
  OPTIMIZED_DRAMATIC_PAUSE_GUTTER_PX,
  OPTIMIZED_MAX_GUTTER_PX,
  OPTIMIZED_TRANSITION_GUTTER_PX,
  PACING_BOTTLENECK_LABELS_KO,
  SIMULATION_ESTIMATE_NOTICE_KO,
  type CutRetentionSimulationPoint,
  type EpisodeGutterOptimizationResult,
  type EpisodePacingAuditResult,
  type EpisodePacingCutSpec,
  type EpisodePacingInput,
  type GutterAdjustmentReason,
  type GutterOptimizationAdjustment,
  type OptimizeGutterPacingOptions,
  type PacingBottleneckCode,
  type PacingBottleneckFinding,
  type PacingGrade,
} from "./episode-pacing-types";
import { computePacingManifestSha256Hex } from "./pacing-sha256-and-canonical";
import {
  clampNumber,
  computeRequiredTransitionGutterPx,
  isDenseFatigueWallCandidate,
  round1,
  round6,
  simulateEpisodeScrollRetention,
} from "./scroll-retention-physics-kernel";

export { simulateEpisodeScrollRetention } from "./scroll-retention-physics-kernel";

function classifyPacingGrade(score: number): PacingGrade {
  if (score >= 88) return "S";
  if (score >= 75) return "A";
  if (score >= 60) return "B";
  if (score >= 45) return "C";
  return "D";
}

function createEmptyFindingCounts(): Record<PacingBottleneckCode, number> {
  return {
    "text-density-fatigue-wall": 0,
    "missing-opening-hook": 0,
    "mid-episode-sag": 0,
    "weak-cliffhanger-ending": 0,
    "cramped-gutter-rhythm": 0,
  };
}

function detectFatigueWalls(
  cutPoints: readonly CutRetentionSimulationPoint[],
): PacingBottleneckFinding[] {
  const findings: PacingBottleneckFinding[] = [];
  let run: CutRetentionSimulationPoint[] = [];

  const flushRun = (): void => {
    if (run.length < FATIGUE_WALL_MIN_CONSECUTIVE_CUTS) {
      run = [];
      return;
    }
    let maxDensity = 0;
    for (let i = 0; i < run.length; i += 1) {
      const item = run[i];
      if (item !== undefined && item.charsPerViewportScreen > maxDensity) {
        maxDensity = item.charsPerViewportScreen;
      }
    }
    const first = run[0];
    const last = run[run.length - 1];
    if (first !== undefined && last !== undefined) {
      const severity = run.length >= 4 || maxDensity >= 130 ? "high" : "medium";
      findings.push({
        code: "text-density-fatigue-wall",
        severity,
        titleKo: PACING_BOTTLENECK_LABELS_KO["text-density-fatigue-wall"],
        descriptionKo: `연속 ${run.length}컷(${first.cutId}~${last.cutId})에 걸쳐 고대사 밀도 또는 설명 컷이 호흡 여백 없이 이어져 인지 피로벽이 형성됐습니다(최대 ${round1(maxDensity)}자/뷰포트).`,
        affectedCutIds: run.map((item) => item.cutId),
        affectedCutIndices: run.map((item) => item.cutIndex),
        scrollRangeStart: first.scrollProgressStart,
        scrollRangeEnd: last.scrollProgressEnd,
        metricValue: round6(maxDensity),
        thresholdValue: FATIGUE_WALL_CHARS_PER_SCREEN_THRESHOLD,
        recommendationKo: `연속 고밀도 컷 사이에 ${OPTIMIZED_BREATH_GUTTER_PX}px 이상의 호흡 거터나 무대사 시선 쉼표 컷을 배치해 독자 피로를 분산하세요.`,
      });
    }
    run = [];
  };

  for (let i = 0; i < cutPoints.length; i += 1) {
    const cut = cutPoints[i];
    if (cut === undefined) continue;
    if (isDenseFatigueWallCandidate(cut)) {
      run.push(cut);
      if (cut.gutterAfterPx >= FATIGUE_WALL_BREATH_BREAK_GUTTER_PX) {
        flushRun();
      }
    } else {
      flushRun();
    }
  }
  flushRun();

  return findings;
}

/**
 * 에피소드 스크롤 체류 시뮬레이션 결과에 대해 5대 페이싱 병목과 클리프행어 강도를 감사한다.
 */
export function auditEpisodePacingAndCliffhanger(
  input: EpisodePacingInput,
): EpisodePacingAuditResult {
  const simulation = simulateEpisodeScrollRetention(input);
  const { cutPoints } = simulation;
  const findings: PacingBottleneckFinding[] = [];
  const counts = createEmptyFindingCounts();

  if (cutPoints.length === 0) {
    const emptyAuditManifest = {
      episodeId: simulation.episodeId,
      simulationSha256Hex: simulation.simulationSha256Hex,
      findings: [],
      pacingHealthScore: 0,
      pacingGrade: "D",
    };
    return {
      episodeId: simulation.episodeId,
      episodeTitle: simulation.episodeTitle,
      isSimulationEstimate: true,
      simulationNoticeKo: SIMULATION_ESTIMATE_NOTICE_KO,
      simulation,
      findings: [],
      findingCountsByCode: counts,
      pacingHealthScore: 0,
      pacingGrade: "D",
      openingHookTensionPeak: 0,
      midEpisodeTensionPeak: 0,
      cliffhangerTensionPeak: 0,
      hasMidTwistOrPeak: false,
      hasStrongCliffhanger: false,
      pacingAuditSha256Hex: computePacingManifestSha256Hex(emptyAuditManifest),
    };
  }

  // 1. 대사 과밀 피로벽(text-density-fatigue-wall)
  const fatigueWallFindings = detectFatigueWalls(cutPoints);
  for (let i = 0; i < fatigueWallFindings.length; i += 1) {
    const item = fatigueWallFindings[i];
    if (item !== undefined) findings.push(item);
  }

  // 2. 도입부 훅 부족(missing-opening-hook, 초반 15% 구간)
  const openingCuts = cutPoints.filter(
    (cut, idx) => idx === 0 || cut.scrollProgressStart < OPENING_HOOK_WINDOW_END,
  );
  let openingPeakTension = 0;
  let hasOpeningHookBeat = false;
  for (let i = 0; i < openingCuts.length; i += 1) {
    const cut = openingCuts[i];
    if (cut === undefined) continue;
    if (cut.tensionScore > openingPeakTension) openingPeakTension = cut.tensionScore;
    if (cut.narrativeBeatKind === "opening-hook") hasOpeningHookBeat = true;
  }
  const hasOpeningHook =
    (hasOpeningHookBeat && openingPeakTension >= OPENING_HOOK_LABELED_MIN_TENSION) ||
    openingPeakTension >= OPENING_HOOK_UNLABELED_MIN_TENSION;

  if (!hasOpeningHook) {
    const firstOpening = openingCuts[0];
    const lastOpening = openingCuts[openingCuts.length - 1];
    findings.push({
      code: "missing-opening-hook",
      severity: openingPeakTension < 0.4 ? "high" : "medium",
      titleKo: PACING_BOTTLENECK_LABELS_KO["missing-opening-hook"],
      descriptionKo: `초반 15% 구간에 독자 시선을 붙잡는 도입 훅이 약합니다(구간 최대 긴장도 ${round1(openingPeakTension * 100)}%).`,
      affectedCutIds: openingCuts.map((c) => c.cutId),
      affectedCutIndices: openingCuts.map((c) => c.cutIndex),
      scrollRangeStart: firstOpening?.scrollProgressStart ?? 0,
      scrollRangeEnd: Math.min(OPENING_HOOK_WINDOW_END, lastOpening?.scrollProgressEnd ?? 0.15),
      metricValue: round6(openingPeakTension),
      thresholdValue: OPENING_HOOK_MIN_TENSION,
      recommendationKo:
        "첫 1~2스크롤 안에 핵심 갈등이나 미스터리 장면을 전진 배치해 초반 이탈을 줄이세요.",
    });
  }

  // 3. 중반부 서사 늘어짐(mid-episode-sag, 35~65% 구간)
  const midCuts = cutPoints.filter(
    (cut) =>
      cut.scrollProgressEnd >= MID_EPISODE_WINDOW_START &&
      cut.scrollProgressStart <= MID_EPISODE_WINDOW_END,
  );
  let midPeakTension = 0;
  let hasMidTwistBeat = false;
  for (let i = 0; i < midCuts.length; i += 1) {
    const cut = midCuts[i];
    if (cut === undefined) continue;
    if (cut.tensionScore > midPeakTension) midPeakTension = cut.tensionScore;
    if (cut.narrativeBeatKind === "mid-twist" && cut.tensionScore >= MID_EPISODE_TWIST_MIN_TENSION) {
      hasMidTwistBeat = true;
    }
  }
  const hasMidTwistOrPeak = hasMidTwistBeat || midPeakTension >= MID_EPISODE_PEAK_MIN_TENSION;

  if (cutPoints.length >= 4 && midCuts.length > 0 && !hasMidTwistOrPeak) {
    const firstMid = midCuts[0];
    const lastMid = midCuts[midCuts.length - 1];
    findings.push({
      code: "mid-episode-sag",
      severity: midPeakTension < 0.48 ? "high" : "medium",
      titleKo: PACING_BOTTLENECK_LABELS_KO["mid-episode-sag"],
      descriptionKo: `중반부(35~65% 스크롤) 구간에 반전 비트나 긴장 정점이 없어 템포가 늘어집니다(최대 긴장도 ${round1(midPeakTension * 100)}%).`,
      affectedCutIds: midCuts.map((c) => c.cutId),
      affectedCutIndices: midCuts.map((c) => c.cutIndex),
      scrollRangeStart: firstMid?.scrollProgressStart ?? MID_EPISODE_WINDOW_START,
      scrollRangeEnd: lastMid?.scrollProgressEnd ?? MID_EPISODE_WINDOW_END,
      metricValue: round6(midPeakTension),
      thresholdValue: MID_EPISODE_PEAK_MIN_TENSION,
      recommendationKo:
        "40~55% 지점에 사건 전환(mid-twist)이나 대립 고조 컷을 넣어 중반 집중력을 환기하세요.",
    });
  }

  // 4. 클리프행어 결말 약화(weak-cliffhanger-ending, 마지막 2컷 / 90~100% 구간)
  const endingCuts = cutPoints.filter(
    (cut, idx) =>
      idx >= Math.max(0, cutPoints.length - 2) ||
      cut.scrollProgressEnd >= CLIFFHANGER_WINDOW_START,
  );
  let cliffhangerPeakTension = 0;
  let hasCliffhangerBeat = false;
  for (let i = 0; i < endingCuts.length; i += 1) {
    const cut = endingCuts[i];
    if (cut === undefined) continue;
    if (cut.tensionScore > cliffhangerPeakTension) cliffhangerPeakTension = cut.tensionScore;
    if (cut.narrativeBeatKind === "cliffhanger-reveal") hasCliffhangerBeat = true;
  }
  const lastCut = cutPoints[cutPoints.length - 1];
  const endsWithFlatFade =
    lastCut !== undefined && lastCut.narrativeBeatKind === "epilogue-fade" && !hasCliffhangerBeat;
  const belowEpisodeAverage = cliffhangerPeakTension < simulation.averageTensionScore;
  const flatWithoutCliffhanger = !hasCliffhangerBeat && cliffhangerPeakTension < CLIFFHANGER_MIN_TENSION;
  const hasStrongCliffhanger = !belowEpisodeAverage && !flatWithoutCliffhanger && !endsWithFlatFade;

  if (!hasStrongCliffhanger) {
    const firstEnd = endingCuts[0];
    const lastEnd = endingCuts[endingCuts.length - 1];
    findings.push({
      code: "weak-cliffhanger-ending",
      severity: belowEpisodeAverage || cliffhangerPeakTension < 0.52 ? "high" : "medium",
      titleKo: PACING_BOTTLENECK_LABELS_KO["weak-cliffhanger-ending"],
      descriptionKo: `종반 90~100% 구간의 긴장도(${round1(cliffhangerPeakTension * 100)}%)가 회차 평균(${round1(simulation.averageTensionScore * 100)}%)보다 낮거나 클리프행어 비트 없이 평탄하게 끝납니다.`,
      affectedCutIds: endingCuts.map((c) => c.cutId),
      affectedCutIndices: endingCuts.map((c) => c.cutIndex),
      scrollRangeStart: firstEnd?.scrollProgressStart ?? CLIFFHANGER_WINDOW_START,
      scrollRangeEnd: lastEnd?.scrollProgressEnd ?? 1,
      metricValue: round6(cliffhangerPeakTension),
      thresholdValue: round6(Math.max(CLIFFHANGER_MIN_TENSION, simulation.averageTensionScore)),
      recommendationKo:
        "마지막 컷 직전에 정적 여백(360px 이상)을 둔 뒤 미해결 충격·반전 컷으로 회차를 마무리하세요.",
    });
  }

  // 5. 컷 간 여백 압박(cramped-gutter-rhythm)
  for (let i = 0; i < cutPoints.length - 1; i += 1) {
    const current = cutPoints[i];
    const next = cutPoints[i + 1];
    if (current === undefined || next === undefined) continue;
    const requiredPx = computeRequiredTransitionGutterPx(current, next);
    if (current.gutterAfterPx < requiredPx) {
      const deficit = requiredPx - current.gutterAfterPx;
      findings.push({
        code: "cramped-gutter-rhythm",
        severity: deficit >= 60 ? "high" : "medium",
        titleKo: PACING_BOTTLENECK_LABELS_KO["cramped-gutter-rhythm"],
        descriptionKo: `${current.cutId}→${next.cutId} 전환 여백이 ${current.gutterAfterPx}px로 권장 호흡 기준(${requiredPx}px)보다 좁아 시선이 압박됩니다.`,
        affectedCutIds: [current.cutId, next.cutId],
        affectedCutIndices: [current.cutIndex, next.cutIndex],
        scrollRangeStart: current.scrollProgressStart,
        scrollRangeEnd: next.scrollProgressEnd,
        metricValue: current.gutterAfterPx,
        thresholdValue: requiredPx,
        recommendationKo: `${current.cutId} 하단 거터를 최소 ${requiredPx}px 이상으로 넓혀 장면 전환 호흡을 확보하세요.`,
      });
    }
  }

  // 건수 집계 및 페이싱 건강도 점수 계산(0..100)
  for (let i = 0; i < findings.length; i += 1) {
    const finding = findings[i];
    if (finding !== undefined) counts[finding.code] += 1;
  }

  let fatigueWallPenalty = 0;
  let crampedPenalty = 0;
  let otherPenalty = 0;

  for (let i = 0; i < findings.length; i += 1) {
    const f = findings[i];
    if (f === undefined) continue;
    if (f.code === "text-density-fatigue-wall") {
      fatigueWallPenalty += f.severity === "high" ? 18 : 13;
    } else if (f.code === "cramped-gutter-rhythm") {
      crampedPenalty += f.severity === "high" ? 5 : 3.5;
    } else if (f.code === "weak-cliffhanger-ending") {
      otherPenalty += f.severity === "high" ? 20 : 14;
    } else {
      otherPenalty += f.severity === "high" ? 16 : 11;
    }
  }

  const highFatiguePenalty =
    simulation.peakCognitiveFatigue > 0.65
      ? Math.min(10, (simulation.peakCognitiveFatigue - 0.65) * 28)
      : 0;

  const totalPenalty =
    Math.min(28, fatigueWallPenalty) +
    Math.min(20, crampedPenalty) +
    otherPenalty +
    highFatiguePenalty;
  const pacingHealthScore = round1(clampNumber(100 - totalPenalty, 0, 100));
  const pacingGrade = classifyPacingGrade(pacingHealthScore);

  const auditManifest = {
    episodeId: simulation.episodeId,
    simulationSha256Hex: simulation.simulationSha256Hex,
    findingCountsByCode: counts,
    findingSummary: findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      affectedCutIds: f.affectedCutIds,
      metricValue: f.metricValue,
    })),
    pacingHealthScore,
    pacingGrade,
    openingHookTensionPeak: round6(openingPeakTension),
    midEpisodeTensionPeak: round6(midPeakTension),
    cliffhangerTensionPeak: round6(cliffhangerPeakTension),
  };

  return {
    episodeId: simulation.episodeId,
    episodeTitle: simulation.episodeTitle,
    isSimulationEstimate: true,
    simulationNoticeKo: SIMULATION_ESTIMATE_NOTICE_KO,
    simulation,
    findings,
    findingCountsByCode: counts,
    pacingHealthScore,
    pacingGrade,
    openingHookTensionPeak: round6(openingPeakTension),
    midEpisodeTensionPeak: round6(midPeakTension),
    cliffhangerTensionPeak: round6(cliffhangerPeakTension),
    hasMidTwistOrPeak,
    hasStrongCliffhanger,
    pacingAuditSha256Hex: computePacingManifestSha256Hex(auditManifest),
  };
}

/**
 * 비파괴 여백·호흡 리플로우 옵티마이저.
 * 원본 컷 배열·대사·작화 순서를 변경하지 않고 `gutterAfterPx`만 정밀 확장해
 * 인지 피로 감소, 추정 완독률 상승, 좁은 거터 결함 0건, 클리프행어 직전 정적 거터 배치를 수행한다.
 */
export function optimizeEpisodeGutterPacing(
  input: EpisodePacingInput,
  options?: OptimizeGutterPacingOptions,
): EpisodeGutterOptimizationResult {
  const beforeAudit = auditEpisodePacingAndCliffhanger(input);
  const { cutPoints } = beforeAudit.simulation;

  const maxGutterPx = Math.round(
    clampNumber(options?.maxGutterPx ?? OPTIMIZED_MAX_GUTTER_PX, 180, 620),
  );
  const breathGutterPx = Math.round(
    clampNumber(options?.breathGutterPx ?? OPTIMIZED_BREATH_GUTTER_PX, 220, maxGutterPx),
  );
  const dramaticPauseGutterPx = Math.round(
    clampNumber(
      options?.dramaticPauseGutterPx ?? OPTIMIZED_DRAMATIC_PAUSE_GUTTER_PX,
      240,
      maxGutterPx,
    ),
  );
  const actionMinGutterPx = Math.round(
    clampNumber(
      options?.actionMinGutterPx ?? OPTIMIZED_ACTION_GUTTER_PX,
      CRAMPED_GUTTER_ACTION_MIN_PX,
      maxGutterPx,
    ),
  );
  const transitionMinGutterPx = Math.round(
    clampNumber(
      options?.transitionMinGutterPx ?? OPTIMIZED_TRANSITION_GUTTER_PX,
      CRAMPED_GUTTER_TRANSITION_MIN_PX,
      maxGutterPx,
    ),
  );

  if (cutPoints.length === 0) {
    const emptyOptManifest = {
      episodeId: beforeAudit.episodeId,
      beforeSha: beforeAudit.pacingAuditSha256Hex,
      afterSha: beforeAudit.pacingAuditSha256Hex,
      totalAddedGutterPx: 0,
    };
    return {
      episodeId: beforeAudit.episodeId,
      episodeTitle: beforeAudit.episodeTitle,
      isSimulationEstimate: true,
      simulationNoticeKo: SIMULATION_ESTIMATE_NOTICE_KO,
      beforeAudit,
      afterAudit: beforeAudit,
      optimizedCuts: [],
      adjustments: [],
      totalAddedGutterPx: 0,
      peakFatigueDelta: 0,
      peakFatigueReduction: 0,
      completionRetentionDelta: 0,
      pacingHealthScoreDelta: 0,
      crampedGutterFindingsBefore: 0,
      crampedGutterFindingsAfter: 0,
      optimizationSha256Hex: computePacingManifestSha256Hex(emptyOptManifest),
    };
  }

  const fatigueWallCutIds = new Set<string>();
  for (let i = 0; i < beforeAudit.findings.length; i += 1) {
    const finding = beforeAudit.findings[i];
    if (finding !== undefined && finding.code === "text-density-fatigue-wall") {
      for (let j = 0; j < finding.affectedCutIds.length; j += 1) {
        const id = finding.affectedCutIds[j];
        if (id !== undefined) fatigueWallCutIds.add(id);
      }
    }
  }

  const adjustments: GutterOptimizationAdjustment[] = [];
  const optimizedCuts: EpisodePacingCutSpec[] = [];
  let consecutiveDenseInPass = 0;
  let totalAddedGutterPx = 0;

  for (let i = 0; i < cutPoints.length; i += 1) {
    const current = cutPoints[i];
    if (current === undefined) continue;
    const isLastCut = i === cutPoints.length - 1;
    const next = isLastCut ? undefined : cutPoints[i + 1];

    let targetGutterPx = current.gutterAfterPx;
    let reason: GutterAdjustmentReason | undefined;
    let reasonKo = "";

    const dense = isDenseFatigueWallCandidate(current);
    consecutiveDenseInPass = dense ? consecutiveDenseInPass + 1 : 0;

    // 1. 컷 간 좁은 전환 여백 해소 (cramped-gutter-rhythm 0건 보장)
    if (!isLastCut && next !== undefined) {
      const requiredPx = computeRequiredTransitionGutterPx(current, next);
      if (targetGutterPx < requiredPx) {
        const reliefTarget =
          requiredPx >= CRAMPED_GUTTER_ACTION_MIN_PX
            ? Math.max(requiredPx, actionMinGutterPx)
            : Math.max(requiredPx, transitionMinGutterPx);
        targetGutterPx = Math.max(targetGutterPx, Math.min(maxGutterPx, reliefTarget));
        reason = "cramped-transition-breath";
        reasonKo = `${current.cutId}→${next.cutId} 전환 호흡 기준(${requiredPx}px)을 충족하도록 여백을 확장했습니다.`;
      }
    }

    // 2. 고대사 밀도 피로벽 구간 및 단일 고밀도 컷 호흡 거터 배치
    const inFatigueWall = fatigueWallCutIds.has(current.cutId);
    if (
      dense &&
      !isLastCut &&
      (consecutiveDenseInPass >= 2 || (inFatigueWall && current.charsPerViewportScreen >= 115))
    ) {
      if (targetGutterPx < breathGutterPx) {
        targetGutterPx = Math.min(maxGutterPx, breathGutterPx);
        reason = "fatigue-wall-breath-gutter";
        reasonKo = `연속 고대사 피로벽을 끊기 위해 ${current.cutId} 하단에 호흡 거터(${targetGutterPx}px)를 배치했습니다.`;
      }
      consecutiveDenseInPass = 0;
    } else if (
      dense &&
      !isLastCut &&
      current.charsPerViewportScreen >= 115 &&
      targetGutterPx < breathGutterPx
    ) {
      targetGutterPx = Math.min(maxGutterPx, breathGutterPx);
      reason = "dense-text-relief-gutter";
      reasonKo = `단일 컷 대사 밀도(${round1(current.charsPerViewportScreen)}자/뷰포트)가 높아 호흡 여백(${targetGutterPx}px)을 보강했습니다.`;
      consecutiveDenseInPass = 0;
    }

    // 3. 클리프행어 직전 정적 거터(Dramatic Pause Gutter) 배치
    if (
      !isLastCut &&
      next !== undefined &&
      (next.narrativeBeatKind === "cliffhanger-reveal" ||
        (i === cutPoints.length - 2 && next.tensionScore >= CLIFFHANGER_MIN_TENSION))
    ) {
      if (targetGutterPx < dramaticPauseGutterPx) {
        targetGutterPx = Math.min(maxGutterPx, dramaticPauseGutterPx);
        reason = "cliffhanger-dramatic-pause-gutter";
        reasonKo = `클리프행어 컷(${next.cutId}) 직전에 정적 긴장 거터(${targetGutterPx}px)를 배치해 임팩트를 높였습니다.`;
      }
    }

    const finalGutterPx = Math.max(current.gutterAfterPx, Math.round(targetGutterPx));
    const deltaPx = finalGutterPx - current.gutterAfterPx;

    if (deltaPx > 0 && reason !== undefined) {
      totalAddedGutterPx += deltaPx;
      adjustments.push({
        cutId: current.cutId,
        cutIndex: current.cutIndex,
        originalGutterPx: current.gutterAfterPx,
        optimizedGutterPx: finalGutterPx,
        deltaPx,
        reason,
        reasonKo,
      });
    }

    optimizedCuts.push({
      cutId: current.cutId,
      cutIndex: current.cutIndex,
      heightPx: current.heightPx,
      gutterAfterPx: finalGutterPx,
      characterCountKo: current.characterCountKo,
      balloonCount: current.balloonCount,
      visualComplexity: current.visualComplexity,
      narrativeBeatKind: current.narrativeBeatKind,
      tensionScore: current.tensionScore,
      isSilentBreathCut: current.isSilentBreathCut,
    });
  }

  const afterAudit = auditEpisodePacingAndCliffhanger({
    episodeId: beforeAudit.episodeId,
    episodeTitle: beforeAudit.episodeTitle,
    viewport: beforeAudit.simulation.viewport,
    cuts: optimizedCuts,
  });

  const peakFatigueDelta = round6(
    afterAudit.simulation.peakCognitiveFatigue - beforeAudit.simulation.peakCognitiveFatigue,
  );
  const peakFatigueReduction = round6(
    beforeAudit.simulation.peakCognitiveFatigue - afterAudit.simulation.peakCognitiveFatigue,
  );
  const completionRetentionDelta = round6(
    afterAudit.simulation.estimatedCompletionRetention -
      beforeAudit.simulation.estimatedCompletionRetention,
  );
  const pacingHealthScoreDelta = round1(
    afterAudit.pacingHealthScore - beforeAudit.pacingHealthScore,
  );
  const crampedGutterFindingsBefore = beforeAudit.findingCountsByCode["cramped-gutter-rhythm"];
  const crampedGutterFindingsAfter = afterAudit.findingCountsByCode["cramped-gutter-rhythm"];

  const optimizationManifest = {
    episodeId: beforeAudit.episodeId,
    beforeAuditSha256Hex: beforeAudit.pacingAuditSha256Hex,
    afterAuditSha256Hex: afterAudit.pacingAuditSha256Hex,
    totalAddedGutterPx,
    adjustments: adjustments.map((adj) => ({
      cutId: adj.cutId,
      deltaPx: adj.deltaPx,
      reason: adj.reason,
    })),
  };

  return {
    episodeId: beforeAudit.episodeId,
    episodeTitle: beforeAudit.episodeTitle,
    isSimulationEstimate: true,
    simulationNoticeKo: SIMULATION_ESTIMATE_NOTICE_KO,
    beforeAudit,
    afterAudit,
    optimizedCuts,
    adjustments,
    totalAddedGutterPx,
    peakFatigueDelta,
    peakFatigueReduction,
    completionRetentionDelta,
    pacingHealthScoreDelta,
    crampedGutterFindingsBefore,
    crampedGutterFindingsAfter,
    optimizationSha256Hex: computePacingManifestSha256Hex(optimizationManifest),
  };
}
