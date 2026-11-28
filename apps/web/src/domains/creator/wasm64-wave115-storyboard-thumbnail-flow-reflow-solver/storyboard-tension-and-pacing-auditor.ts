/**
 * Wave 115 — 4막 감정 텐션 곡선·페이싱 감사기 및 자동 리플로우 제안기.
 *
 * - `analyzeStoryboardFlowAndTensionArc`: 4막(기·승·전·결·여운) 분포, 피크 위치,
 *   연속 정체 구간(4컷 이상 |Δtension| < 0.07), 연속 대사 과밀 구간, 엔딩 클리프행어 점수,
 *   씬 전환 리듬 점수, 종합 페이싱 건강 점수(0..100)와 실행 가능한 리플로우 제안을 산출한다.
 * - `applySuggestion`: 제안을 즉시 실행하고 적용 전·후 점수 변화를 반환한다.
 */

import {
  STORYBOARD_ACT_LABELS_KO,
  type ActTensionSummary,
  type ApplyFlowSuggestionOutcome,
  type DialogueFatigueSpan,
  type FlowReflowSuggestion,
  type ProjectedStoryboardCut,
  type StoryboardAct,
  type StoryboardCutInput,
  type StoryboardFlowAuditOptions,
  type StoryboardFlowAuditResult,
  type StoryboardFlowProjection,
  type StoryboardProjectionOptions,
  type TensionFlatlineSpan,
} from "./storyboard-board-types";
import {
  applyStoryboardReflowOperation,
  buildStoryboardFlowProjection,
} from "./storyboard-flow-reflow-solver";

export const DEFAULT_FLATLINE_MAX_DELTA = 0.07;
export const DEFAULT_FLATLINE_MIN_SPAN = 4;
export const DEFAULT_DIALOGUE_FATIGUE_CHAR_THRESHOLD = 85;
export const DEFAULT_DIALOGUE_EXTREME_CHAR_THRESHOLD = 140;
export const DEFAULT_MIN_DIALOGUE_FATIGUE_RUN = 2;
export const DEFAULT_TARGET_SCENE_BOUNDARY_GUTTER_PX = 120;
export const DEFAULT_TARGET_CLIMAX_GUTTER_PX = 110;

const ALL_ACTS: readonly StoryboardAct[] = [
  "intro",
  "development",
  "twist",
  "climax",
  "epilogue",
];

function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function buildActDistribution(cuts: readonly ProjectedStoryboardCut[]): ActTensionSummary[] {
  return ALL_ACTS.map((act) => {
    const matched = cuts.filter((cut) => cut.act === act);
    if (matched.length === 0) {
      return {
        act,
        labelKo: STORYBOARD_ACT_LABELS_KO[act],
        cutCount: 0,
        averageTension: 0,
        minTension: 0,
        maxTension: 0,
        totalDialogueChars: 0,
        totalReadingSec: 0,
      };
    }
    let sum = 0;
    let minVal = 1;
    let maxVal = 0;
    let totalDialogueChars = 0;
    let totalReadingSec = 0;
    for (let i = 0; i < matched.length; i += 1) {
      const cut = matched[i];
      if (!cut) continue;
      sum += cut.tension;
      if (cut.tension < minVal) minVal = cut.tension;
      if (cut.tension > maxVal) maxVal = cut.tension;
      totalDialogueChars += cut.dialogueCharCount;
      totalReadingSec += cut.readingSec;
    }
    return {
      act,
      labelKo: STORYBOARD_ACT_LABELS_KO[act],
      cutCount: matched.length,
      averageTension: round3(sum / matched.length),
      minTension: round3(minVal),
      maxTension: round3(maxVal),
      totalDialogueChars,
      totalReadingSec: round3(totalReadingSec),
    };
  });
}

function detectFlatlineSpans(
  cuts: readonly ProjectedStoryboardCut[],
  maxDelta: number,
  minSpan: number,
): TensionFlatlineSpan[] {
  if (cuts.length < minSpan) return [];
  const spans: TensionFlatlineSpan[] = [];
  let runStart = 0;
  let runMaxDelta = 0;

  const flushRun = (endIdx: number): void => {
    const length = endIdx - runStart + 1;
    if (length < minSpan) return;
    const slice = cuts.slice(runStart, endIdx + 1);
    const avg =
      slice.reduce((acc, item) => acc + item.tension, 0) / Math.max(1, slice.length);
    const firstId = slice[0]?.cutId ?? `#${runStart + 1}`;
    const lastId = slice[slice.length - 1]?.cutId ?? `#${endIdx + 1}`;
    spans.push({
      startCutIndex: runStart,
      endCutIndex: endIdx,
      cutIds: slice.map((item) => item.cutId),
      length,
      averageTension: round3(avg),
      maxAdjacentDelta: round3(runMaxDelta),
      reasonKo: `${firstId}~${lastId}(${length}컷 연속) 구간에서 텐션 변동폭이 ${round3(runMaxDelta)} 미만으로 정체되었습니다.`,
    });
  };

  for (let i = 1; i < cuts.length; i += 1) {
    const prev = cuts[i - 1];
    const curr = cuts[i];
    if (!prev || !curr) continue;
    const delta = Math.abs(curr.tension - prev.tension);
    if (delta < maxDelta) {
      if (delta > runMaxDelta) runMaxDelta = delta;
    } else {
      flushRun(i - 1);
      runStart = i;
      runMaxDelta = 0;
    }
  }
  flushRun(cuts.length - 1);
  return spans;
}

function isDialogueHeavyCut(
  cut: ProjectedStoryboardCut,
  denseThreshold: number,
): boolean {
  return (
    cut.dialogueCharCount >= denseThreshold ||
    (cut.dialogueCharCount >= Math.round(denseThreshold * 0.78) && cut.visualComplexity >= 0.72)
  );
}

function detectDialogueFatigueSpans(
  cuts: readonly ProjectedStoryboardCut[],
  denseThreshold: number,
  extremeThreshold: number,
  minRun: number,
): DialogueFatigueSpan[] {
  const spans: DialogueFatigueSpan[] = [];
  let i = 0;
  while (i < cuts.length) {
    const cut = cuts[i];
    if (!cut || !isDialogueHeavyCut(cut, denseThreshold)) {
      i += 1;
      continue;
    }
    const start = i;
    while (i + 1 < cuts.length) {
      const next = cuts[i + 1];
      if (!next || !isDialogueHeavyCut(next, denseThreshold)) break;
      i += 1;
    }
    const end = i;
    const slice = cuts.slice(start, end + 1);
    let peakCut = slice[0];
    let totalDialogueChars = 0;
    let visualSum = 0;
    for (let k = 0; k < slice.length; k += 1) {
      const item = slice[k];
      if (!item) continue;
      totalDialogueChars += item.dialogueCharCount;
      visualSum += item.visualComplexity;
      if (!peakCut || item.dialogueCharCount > peakCut.dialogueCharCount) {
        peakCut = item;
      }
    }
    const peakChars = peakCut?.dialogueCharCount ?? 0;
    if (slice.length >= minRun || peakChars >= extremeThreshold) {
      const severity: "warning" | "critical" =
        slice.length >= minRun + 1 || peakChars >= extremeThreshold ? "critical" : "warning";
      const firstId = slice[0]?.cutId ?? `#${start + 1}`;
      const lastId = slice[slice.length - 1]?.cutId ?? `#${end + 1}`;
      spans.push({
        startCutIndex: start,
        endCutIndex: end,
        cutIds: slice.map((item) => item.cutId),
        length: slice.length,
        totalDialogueChars,
        peakDialogueChars: peakChars,
        peakCutId: peakCut?.cutId ?? firstId,
        averageVisualComplexity: round3(visualSum / Math.max(1, slice.length)),
        severity,
        reasonKo:
          slice.length === 1
            ? `단일 컷(${firstId})에 대사 ${peakChars}자가 몰려 독자 읽기 피로가 급증합니다.`
            : `${firstId}~${lastId}(${slice.length}컷) 구간에 대사 ${totalDialogueChars}자(최대 ${peakChars}자)가 연속 과밀 배치되었습니다.`,
      });
    }
    i += 1;
  }
  return spans;
}

function computeEndingHookScore(
  cuts: readonly ProjectedStoryboardCut[],
  targetClimaxGutterPx: number,
): number {
  if (cuts.length === 0) return 0;
  const last = cuts[cuts.length - 1];
  if (!last) return 0;
  const prev = cuts.length >= 2 ? cuts[cuts.length - 2] : undefined;

  let score = last.tension * 62;
  if (prev) {
    const lift = last.tension - prev.tension;
    score += clamp(lift * 48, -14, 18);
  }
  if (last.gutterBeforePx >= targetClimaxGutterPx) {
    score += 14;
  } else if (last.gutterBeforePx >= Math.round(targetClimaxGutterPx * 0.7)) {
    score += 7;
  } else {
    score -= 10;
  }
  if (last.act === "climax" || last.act === "twist") {
    score += 10;
  } else if (last.act === "epilogue" && last.tension >= 0.55) {
    score += 6;
  }
  if (last.dialogueCharCount > 110) {
    score -= Math.min(20, Math.round((last.dialogueCharCount - 110) * 0.25));
  }
  return Math.round(clamp(score, 0, 100));
}

function computeSceneTransitionRhythmScore(
  projection: StoryboardFlowProjection,
  targetBoundaryGutterPx: number,
): number {
  const { cuts, scenes } = projection;
  if (cuts.length === 0) return 0;
  if (scenes.length <= 1) {
    return cuts.length <= 6 ? 78 : 56;
  }

  let boundarySum = 0;
  let transitions = 0;
  for (let s = 1; s < scenes.length; s += 1) {
    const scene = scenes[s];
    if (!scene) continue;
    const openCut = cuts[scene.startCutIndex];
    const prevCut = cuts[scene.startCutIndex - 1];
    if (!openCut || !prevCut) continue;

    transitions += 1;
    let boundaryScore = 52;
    if (openCut.gutterBeforePx >= targetBoundaryGutterPx) {
      boundaryScore += 28;
    } else if (openCut.gutterBeforePx >= Math.round(targetBoundaryGutterPx * 0.65)) {
      boundaryScore += 14;
    } else {
      boundaryScore -= 14;
    }
    const tensionDelta = Math.abs(openCut.tension - prevCut.tension);
    if (tensionDelta >= 0.08 && tensionDelta <= 0.6) {
      boundaryScore += 20;
    } else if (tensionDelta < 0.04) {
      boundaryScore -= 6;
    } else {
      boundaryScore += 10;
    }
    boundarySum += clamp(boundaryScore, 0, 100);
  }

  const avgBoundary = transitions > 0 ? boundarySum / transitions : 70;
  const microScenes = scenes.filter((scene) => scene.cutCount === 1).length;
  const microPenalty = microScenes > Math.max(1, Math.floor(scenes.length / 2)) ? 14 : 0;
  return Math.round(clamp(avgBoundary - microPenalty, 0, 100));
}

function computeArcProgressionScore(
  cuts: readonly ProjectedStoryboardCut[],
  peakPositionRatio: number,
  peakTension: number,
  actDistribution: readonly ActTensionSummary[],
): number {
  if (cuts.length === 0) return 0;
  let score = 48;

  if (peakPositionRatio >= 0.62 && peakPositionRatio <= 0.96) {
    score += 24;
  } else if (peakPositionRatio >= 0.5) {
    score += 12;
  } else {
    score -= 10;
  }

  if (peakTension >= 0.78) {
    score += 14;
  } else if (peakTension >= 0.6) {
    score += 7;
  } else {
    score -= 8;
  }

  const intro = actDistribution.find((item) => item.act === "intro");
  const climax = actDistribution.find((item) => item.act === "climax");
  const twist = actDistribution.find((item) => item.act === "twist");
  const highActAvg =
    climax && climax.cutCount > 0
      ? climax.averageTension
      : twist && twist.cutCount > 0
        ? twist.averageTension
        : peakTension;
  if (intro && intro.cutCount > 0) {
    const rise = highActAvg - intro.averageTension;
    if (rise >= 0.25) score += 14;
    else if (rise >= 0.12) score += 8;
    else score -= 6;
  } else {
    score += 6;
  }

  return Math.round(clamp(score, 0, 100));
}

function buildSuggestions(
  projection: StoryboardFlowProjection,
  flatlineSpans: readonly TensionFlatlineSpan[],
  dialogueFatigueSpans: readonly DialogueFatigueSpan[],
  targetBoundaryGutterPx: number,
  targetClimaxGutterPx: number,
  denseDialogueThreshold: number,
): FlowReflowSuggestion[] {
  const suggestions: FlowReflowSuggestion[] = [];
  const cuts = projection.cuts;
  let seq = 1;

  // 1. 복선→회수 인과 역전 해결 (최우선)
  for (let i = 0; i < projection.continuityViolations.length; i += 1) {
    const v = projection.continuityViolations[i];
    if (!v) continue;
    const sourceCut = cuts[v.sourceIndex];
    const targetCut = cuts[v.targetIndex];
    if (!sourceCut || !targetCut) continue;

    if (!sourceCut.lockedAnchor) {
      suggestions.push({
        suggestionId: `sug-${seq++}`,
        priority: "high",
        category: "continuity",
        targetCutIds: [sourceCut.cutId, targetCut.cutId],
        operation: {
          kind: "reorder-cut",
          cutId: sourceCut.cutId,
          targetIndex: v.targetIndex,
        },
        titleKo: `복선 컷 ${sourceCut.cutId}를 회수 컷(${targetCut.cutId}) 앞으로 복원`,
        rationaleKo: `현재 복선(${sourceCut.cutId})이 회수(${targetCut.cutId})보다 뒤에 있어 독자 이해가 끊깁니다. #${v.targetIndex + 1} 위치 앞으로 당겨 인과 순서를 바로잡습니다.`,
        expectedScoreGain: 18,
      });
    } else if (!targetCut.lockedAnchor) {
      suggestions.push({
        suggestionId: `sug-${seq++}`,
        priority: "high",
        category: "continuity",
        targetCutIds: [sourceCut.cutId, targetCut.cutId],
        operation: {
          kind: "reorder-cut",
          cutId: targetCut.cutId,
          targetIndex: v.sourceIndex,
        },
        titleKo: `회수 컷 ${targetCut.cutId}를 복선 컷(${sourceCut.cutId}) 뒤로 재배치`,
        rationaleKo: `복선 컷(${sourceCut.cutId})이 잠겨 있으므로 회수 컷(${targetCut.cutId})을 뒤로 이동해 인과 역전을 해소합니다.`,
        expectedScoreGain: 18,
      });
    }
  }

  // 2. 과밀 대사 구간 -> 가장 무거운 비잠금 컷 2분할
  for (let i = 0; i < dialogueFatigueSpans.length; i += 1) {
    const span = dialogueFatigueSpans[i];
    if (!span) continue;
    const candidates = cuts
      .slice(span.startCutIndex, span.endCutIndex + 1)
      .filter((cut) => !cut.lockedAnchor)
      .sort((a, b) => b.dialogueCharCount - a.dialogueCharCount);
    const heaviest = candidates[0];
    if (heaviest) {
      suggestions.push({
        suggestionId: `sug-${seq++}`,
        priority: span.severity === "critical" ? "high" : "medium",
        category: "dialogue-fatigue",
        targetCutIds: [heaviest.cutId],
        operation: {
          kind: "split-cut",
          cutId: heaviest.cutId,
          splitRatio: 0.5,
        },
        titleKo: `과밀 대사 컷 ${heaviest.cutId}(${heaviest.dialogueCharCount}자) 2분할`,
        rationaleKo: `한 컷에 대사가 몰린 구간(${span.cutIds.join(", ")})의 호흡을 풀기 위해 대사와 시각 밀도를 두 컷으로 나눕니다.`,
        expectedScoreGain: span.severity === "critical" ? 13 : 9,
      });
    }
  }

  // 3. 연속 텐션 정체 구간 -> 저대사 인접 2컷 병합(압축) 또는 여백 보강
  for (let i = 0; i < flatlineSpans.length; i += 1) {
    const span = flatlineSpans[i];
    if (!span) continue;
    let bestPair: readonly [ProjectedStoryboardCut, ProjectedStoryboardCut] | null = null;
    let bestCombinedChars = Number.POSITIVE_INFINITY;
    for (let idx = span.startCutIndex; idx < span.endCutIndex; idx += 1) {
      const a = cuts[idx];
      const b = cuts[idx + 1];
      if (!a || !b) continue;
      if (a.lockedAnchor || b.lockedAnchor) continue;
      if (a.sceneId !== b.sceneId) continue;
      const combined = a.dialogueCharCount + b.dialogueCharCount;
      if (combined < denseDialogueThreshold && combined < bestCombinedChars) {
        bestCombinedChars = combined;
        bestPair = [a, b];
      }
    }
    if (bestPair) {
      const [first, second] = bestPair;
      suggestions.push({
        suggestionId: `sug-${seq++}`,
        priority: "medium",
        category: "flatline",
        targetCutIds: [first.cutId, second.cutId],
        operation: {
          kind: "merge-adjacent-cuts",
          firstCutId: first.cutId,
          secondCutId: second.cutId,
        },
        titleKo: `정체 구간 인접 컷 ${first.cutId} + ${second.cutId} 압축 병합`,
        rationaleKo: `${span.length}컷 연속 평탄한 텐션 구간을 줄여 전개를 당기고 리듬 대비를 살립니다.`,
        expectedScoreGain: 10,
      });
    } else {
      const tailCut = cuts[span.endCutIndex];
      if (tailCut) {
        suggestions.push({
          suggestionId: `sug-${seq++}`,
          priority: "low",
          category: "flatline",
          targetCutIds: [tailCut.cutId],
          operation: {
            kind: "insert-breathing-gutter",
            cutId: tailCut.cutId,
            extraGutterPx: 90,
          },
          titleKo: `정체 구간 끝 컷 ${tailCut.cutId} 앞 전환 여백 확장`,
          rationaleKo: "정체 구간 뒤에 시선 환기용 여백을 넣어 다음 장면 전환감을 또렷하게 만듭니다.",
          expectedScoreGain: 4,
        });
      }
    }
  }

  // 4. 엔딩 클리프행어 / 고텐션 클라이맥스 여백 부족 보강
  const lastCut = cuts[cuts.length - 1];
  if (lastCut && lastCut.gutterBeforePx < targetClimaxGutterPx) {
    const deficit = Math.max(60, targetClimaxGutterPx - lastCut.gutterBeforePx + 24);
    suggestions.push({
      suggestionId: `sug-${seq++}`,
      priority: "medium",
      category: "ending-hook",
      targetCutIds: [lastCut.cutId],
      operation: {
        kind: "insert-breathing-gutter",
        cutId: lastCut.cutId,
        extraGutterPx: deficit,
      },
      titleKo: `엔딩 컷 ${lastCut.cutId} 앞 클리프행어 호흡 여백(+${deficit}px) 확보`,
      rationaleKo: `엔딩 컷 앞 여백(${lastCut.gutterBeforePx}px)이 좁아 마지막 반전·여운의 충격이 약해집니다.`,
      expectedScoreGain: 6,
    });
  }

  // 5. 씬 전환 경계 여백 부족 보강
  for (let s = 1; s < projection.scenes.length; s += 1) {
    const scene = projection.scenes[s];
    if (!scene) continue;
    const opener = cuts[scene.startCutIndex];
    if (!opener || opener.cutId === lastCut?.cutId) continue;
    if (opener.gutterBeforePx < targetBoundaryGutterPx) {
      const extra = Math.max(50, targetBoundaryGutterPx - opener.gutterBeforePx + 16);
      suggestions.push({
        suggestionId: `sug-${seq++}`,
        priority: "low",
        category: "scene-rhythm",
        targetCutIds: [opener.cutId],
        operation: {
          kind: "insert-breathing-gutter",
          cutId: opener.cutId,
          extraGutterPx: extra,
        },
        titleKo: `씬 전환 시작 컷 ${opener.cutId}(${scene.sceneTitleKo}) 앞 여백(+${extra}px) 보강`,
        rationaleKo: `새 씬 시작 여백(${opener.gutterBeforePx}px)을 권장선(${targetBoundaryGutterPx}px) 이상으로 넓혀 장면 전환을 명확히 구분합니다.`,
        expectedScoreGain: 5,
      });
    }
  }

  const priorityRank: Readonly<Record<FlowReflowSuggestion["priority"], number>> = {
    high: 0,
    medium: 1,
    low: 2,
  };
  return suggestions.sort((a, b) => {
    const rankDiff = priorityRank[a.priority] - priorityRank[b.priority];
    return rankDiff !== 0 ? rankDiff : b.expectedScoreGain - a.expectedScoreGain;
  });
}

/**
 * 스토리보드 투영 결과를 대상으로 4막 텐션 곡선·정체·대사 과밀·엔딩 훅·씬 전환 리듬을 종합 감사한다.
 */
export function analyzeStoryboardFlowAndTensionArc(
  projection: StoryboardFlowProjection,
  options?: StoryboardFlowAuditOptions,
): StoryboardFlowAuditResult {
  const flatlineMaxDelta = clamp(
    options?.flatlineMaxDelta ?? DEFAULT_FLATLINE_MAX_DELTA,
    0.01,
    0.4,
  );
  const flatlineMinSpan = Math.max(2, Math.round(options?.flatlineMinSpan ?? DEFAULT_FLATLINE_MIN_SPAN));
  const denseDialogueThreshold = Math.max(
    30,
    Math.round(options?.dialogueFatigueCharThreshold ?? DEFAULT_DIALOGUE_FATIGUE_CHAR_THRESHOLD),
  );
  const extremeDialogueThreshold = Math.max(
    denseDialogueThreshold + 20,
    Math.round(options?.dialogueExtremeCharThreshold ?? DEFAULT_DIALOGUE_EXTREME_CHAR_THRESHOLD),
  );
  const minDialogueRun = Math.max(
    1,
    Math.round(options?.minDialogueFatigueRun ?? DEFAULT_MIN_DIALOGUE_FATIGUE_RUN),
  );
  const targetBoundaryGutterPx = Math.max(
    60,
    Math.round(options?.targetSceneBoundaryGutterPx ?? DEFAULT_TARGET_SCENE_BOUNDARY_GUTTER_PX),
  );
  const targetClimaxGutterPx = Math.max(
    60,
    Math.round(options?.targetClimaxGutterPx ?? DEFAULT_TARGET_CLIMAX_GUTTER_PX),
  );

  const cuts = projection.cuts;
  const actDistribution = buildActDistribution(cuts);

  let peakTensionCutId: string | null = null;
  let peakTension = 0;
  let peakCutIndex = -1;
  let tensionSum = 0;

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;
    tensionSum += cut.tension;
    if (peakCutIndex < 0 || cut.tension >= peakTension) {
      peakTension = cut.tension;
      peakCutIndex = i;
      peakTensionCutId = cut.cutId;
    }
  }

  const averageTension = cuts.length > 0 ? round3(tensionSum / cuts.length) : 0;
  const varianceSum = cuts.reduce((acc, cut) => {
    const diff = cut.tension - averageTension;
    return acc + diff * diff;
  }, 0);
  const tensionStdDev = cuts.length > 0 ? round3(Math.sqrt(varianceSum / cuts.length)) : 0;
  const peakPositionRatio =
    cuts.length <= 1 ? (cuts.length === 1 ? 1 : 0) : round3(peakCutIndex / (cuts.length - 1));

  const flatlineSpans = detectFlatlineSpans(cuts, flatlineMaxDelta, flatlineMinSpan);
  const dialogueFatigueSpans = detectDialogueFatigueSpans(
    cuts,
    denseDialogueThreshold,
    extremeDialogueThreshold,
    minDialogueRun,
  );

  const endingHookScore = computeEndingHookScore(cuts, targetClimaxGutterPx);
  const sceneTransitionRhythmScore = computeSceneTransitionRhythmScore(
    projection,
    targetBoundaryGutterPx,
  );
  const arcProgressionScore = computeArcProgressionScore(
    cuts,
    peakPositionRatio,
    peakTension,
    actDistribution,
  );

  const continuityPenalty = Math.min(45, projection.continuityViolations.length * 18);
  const flatlinePenalty = Math.min(
    30,
    flatlineSpans.reduce((acc, span) => acc + 10 + Math.max(0, span.length - flatlineMinSpan) * 2, 0),
  );
  const dialoguePenalty = Math.min(
    30,
    dialogueFatigueSpans.reduce(
      (acc, span) => acc + (span.severity === "critical" ? 14 : 9),
      0,
    ),
  );
  const crampedClimaxCount = cuts.filter(
    (cut) => cut.tension >= 0.78 && cut.gutterBeforePx < Math.round(targetClimaxGutterPx * 0.8),
  ).length;
  const crampedClimaxPenalty = Math.min(12, crampedClimaxCount * 4);

  const weightedBase =
    arcProgressionScore * 0.38 +
    endingHookScore * 0.32 +
    sceneTransitionRhythmScore * 0.3;
  const overallFlowHealthScore =
    cuts.length === 0
      ? 0
      : Math.round(
          clamp(
            weightedBase -
              continuityPenalty -
              flatlinePenalty -
              dialoguePenalty -
              crampedClimaxPenalty,
            0,
            100,
          ),
        );

  const suggestions = buildSuggestions(
    projection,
    flatlineSpans,
    dialogueFatigueSpans,
    targetBoundaryGutterPx,
    targetClimaxGutterPx,
    denseDialogueThreshold,
  );

  return {
    cutCount: cuts.length,
    sceneCount: projection.scenes.length,
    actDistribution,
    peakTensionCutId,
    peakTension: round3(peakTension),
    peakCutIndex,
    peakPositionRatio,
    averageTension,
    tensionStdDev,
    flatlineSpans,
    dialogueFatigueSpans,
    continuityViolations: projection.continuityViolations,
    endingHookScore,
    sceneTransitionRhythmScore,
    arcProgressionScore,
    overallFlowHealthScore,
    suggestions,
  };
}

/**
 * 감사기가 생성한 리플로우 제안을 스토리보드에 즉시 적용하고 적용 전·후 페이싱 점수 변화를 반환한다.
 */
export function applySuggestion(
  cutsInput: readonly StoryboardCutInput[],
  suggestion: FlowReflowSuggestion,
  projectionOptions?: StoryboardProjectionOptions,
  auditOptions?: StoryboardFlowAuditOptions,
): ApplyFlowSuggestionOutcome {
  const beforeProjection = buildStoryboardFlowProjection(cutsInput, projectionOptions);
  const beforeAudit = analyzeStoryboardFlowAndTensionArc(beforeProjection, auditOptions);
  const reflow = applyStoryboardReflowOperation(cutsInput, suggestion.operation, projectionOptions);
  const afterAudit = analyzeStoryboardFlowAndTensionArc(reflow.projection, auditOptions);

  return {
    suggestion,
    reflow,
    beforeAudit,
    afterAudit,
    scoreDelta: afterAudit.overallFlowHealthScore - beforeAudit.overallFlowHealthScore,
  };
}

export const applyFlowReflowSuggestion = applySuggestion;
