/**
 * Wave 17A — 무스포일러 캐릭터 관계도 & 30초 요약 + 연재 텐션 그래프 + 독자 참여형 분기 인터랙티브 컷 검증 엔진
 */

/* ---------------- 3A. 무스포일러 캐릭터 관계도 & 지난 화 30초 요약 ---------------- */

export type CharacterRelationType = "ally" | "rival" | "secret" | "family" | "mentor";

export interface StoryCharacterRecord {
  readonly id: string;
  readonly nameKo: string;
  readonly roleKo: string;
  readonly firstAppearanceEpisode: number;
  readonly toneOklch: string;
}

export interface CharacterRelationshipFact {
  readonly id: string;
  readonly fromCharacterId: string;
  readonly toCharacterId: string;
  readonly relationType: CharacterRelationType;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly revealedEpisode: number;
  /** 이후 회차에서 관계가 반전·갱신되면 기존 사실은 숨기고 최신 사실로 대체된다. */
  readonly supersededEpisode?: number;
}

export interface EpisodeRecapBeat {
  readonly episodeNumber: number;
  readonly headlineKo: string;
  readonly keyTurnKo: string;
  readonly cliffhangerKo: string;
}

export interface SpoilerFreeStoryBible {
  readonly characters: readonly StoryCharacterRecord[];
  readonly relationships: readonly CharacterRelationshipFact[];
  readonly episodeBeats: readonly EpisodeRecapBeat[];
}

export interface RecapCardItem {
  readonly episodeNumber: number;
  readonly headlineKo: string;
  readonly summaryTextKo: string;
  readonly estimatedReadSeconds: number;
}

export interface SpoilerFreeRecapResult {
  readonly readUpToEpisode: number;
  readonly visibleCharacters: readonly StoryCharacterRecord[];
  readonly visibleRelationships: readonly CharacterRelationshipFact[];
  readonly recapCards: readonly RecapCardItem[];
  readonly totalReadSeconds: number;
  readonly within30SecBudget: boolean;
  readonly redactedCharacterCount: number;
  readonly redactedRelationshipCount: number;
  readonly redactedBeatCount: number;
  readonly spoilerLeakCount: 0;
}

function estimateKoreanReadSeconds(text: string): number {
  const charCount = text.replace(/\s+/gu, "").length;
  return Math.max(3, Math.ceil(charCount / 7.5));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildSpoilerFreeRecap(
  bible: SpoilerFreeStoryBible,
  readUpToEpisode: number,
  targetBudgetSeconds = 30,
): SpoilerFreeRecapResult {
  const cutoff = Math.max(1, Math.floor(readUpToEpisode));
  const visibleCharacters = bible.characters.filter((character) => character.firstAppearanceEpisode <= cutoff);
  const visibleCharIds = new Set(visibleCharacters.map((character) => character.id));

  const visibleRelationships = bible.relationships.filter((fact) => {
    if (fact.revealedEpisode > cutoff) return false;
    if (fact.supersededEpisode !== undefined && fact.supersededEpisode <= cutoff) return false;
    return visibleCharIds.has(fact.fromCharacterId) && visibleCharIds.has(fact.toCharacterId);
  });

  const eligibleBeats = bible.episodeBeats
    .filter((beat) => beat.episodeNumber <= cutoff)
    .sort((a, b) => b.episodeNumber - a.episodeNumber);

  const selectedReversed: RecapCardItem[] = [];
  let usedSeconds = 0;
  for (const beat of eligibleBeats) {
    const summaryTextKo = `${beat.keyTurnKo} ${beat.cliffhangerKo}`.trim();
    const readSec = estimateKoreanReadSeconds(`${beat.headlineKo} ${summaryTextKo}`);
    if (selectedReversed.length > 0 && usedSeconds + readSec > targetBudgetSeconds) {
      break;
    }
    selectedReversed.push({
      episodeNumber: beat.episodeNumber,
      headlineKo: beat.headlineKo,
      summaryTextKo,
      estimatedReadSeconds: readSec,
    });
    usedSeconds += readSec;
  }

  const recapCards = selectedReversed.reverse();
  const redactedCharacterCount = bible.characters.length - visibleCharacters.length;
  const redactedRelationshipCount = bible.relationships.filter((fact) => fact.revealedEpisode > cutoff).length;
  const redactedBeatCount = bible.episodeBeats.filter((beat) => beat.episodeNumber > cutoff).length;

  return {
    readUpToEpisode: cutoff,
    visibleCharacters,
    visibleRelationships,
    recapCards,
    totalReadSeconds: usedSeconds,
    within30SecBudget: usedSeconds <= targetBudgetSeconds,
    redactedCharacterCount,
    redactedRelationshipCount,
    redactedBeatCount,
    spoilerLeakCount: 0,
  };
}

/* ---------------- 3B. 연재 텐션 그래프 & 클라이맥스 배치 검증기 ---------------- */

export interface EpisodeTensionCut {
  readonly cutIndex: number;
  readonly labelKo: string;
  readonly emotionIntensity: number;
  readonly actionIntensity: number;
  readonly dialogueDensity: number;
  readonly hasCliffhanger: boolean;
}

export interface TensionCurvePoint {
  readonly cutIndex: number;
  readonly labelKo: string;
  readonly tensionScore: number;
  readonly pacingDragDetected: boolean;
}

export interface EpisodeTensionAnalysis {
  readonly points: readonly TensionCurvePoint[];
  readonly averageTension: number;
  readonly peakTension: number;
  readonly climaxCutIndex: number;
  readonly climaxPositionRatio: number;
  readonly climaxPlacementStatus: "optimal" | "too-early" | "too-flat";
  readonly flatlineStretches: readonly { readonly startCut: number; readonly endCut: number }[];
  readonly pacingDragCutIndices: readonly number[];
  readonly endingHookScore: number;
  readonly recommendationsKo: readonly string[];
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function analyzeEpisodeTensionCurve(cuts: readonly EpisodeTensionCut[]): EpisodeTensionAnalysis {
  if (cuts.length === 0) {
    return {
      points: [],
      averageTension: 0,
      peakTension: 0,
      climaxCutIndex: 0,
      climaxPositionRatio: 0,
      climaxPlacementStatus: "too-flat",
      flatlineStretches: [],
      pacingDragCutIndices: [],
      endingHookScore: 0,
      recommendationsKo: ["분석할 컷 데이터가 없습니다. 최소 4컷 이상 입력해 텐션 곡선을 확인하세요."],
    };
  }

  const points: TensionCurvePoint[] = cuts.map((cut) => {
    const emotion = clampPercent(cut.emotionIntensity);
    const action = clampPercent(cut.actionIntensity);
    const dialogue = clampPercent(cut.dialogueDensity);
    const pacingDragDetected = dialogue >= 82 && action <= 30 && emotion <= 48;
    const dialogueContribution = pacingDragDetected ? Math.max(0, 100 - dialogue) * 0.45 : Math.min(dialogue, 75) * 0.9;
    const cliffBonus = cut.hasCliffhanger ? 12 : 0;
    const rawScore = emotion * 0.44 + action * 0.38 + dialogueContribution * 0.18 + cliffBonus - (pacingDragDetected ? 10 : 0);
    return {
      cutIndex: cut.cutIndex,
      labelKo: cut.labelKo,
      tensionScore: Math.round(clampPercent(rawScore)),
      pacingDragDetected,
    };
  });

  let peakPoint = points[0];
  let sum = 0;
  for (const point of points) {
    sum += point.tensionScore;
    if (point.tensionScore >= peakPoint.tensionScore) {
      peakPoint = point;
    }
  }

  const peakArrayIndex = points.findIndex((point) => point.cutIndex === peakPoint.cutIndex);
  const climaxPositionRatio = points.length <= 1 ? 1 : roundTwo(peakArrayIndex / (points.length - 1));
  const minTension = Math.min(...points.map((point) => point.tensionScore));
  const dynamicRange = peakPoint.tensionScore - minTension;

  let climaxPlacementStatus: EpisodeTensionAnalysis["climaxPlacementStatus"] = "optimal";
  if (peakPoint.tensionScore < 65 || dynamicRange < 20) {
    climaxPlacementStatus = "too-flat";
  } else if (climaxPositionRatio < 0.65) {
    climaxPlacementStatus = "too-early";
  }

  const flatlineStretches: { readonly startCut: number; readonly endCut: number }[] = [];
  let runStart = 0;
  for (let i = 1; i <= points.length; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const isFlatStep =
      curr !== undefined && Math.abs(curr.tensionScore - prev.tensionScore) <= 6 && curr.tensionScore < 42 && prev.tensionScore < 42;
    if (!isFlatStep) {
      if (i - runStart >= 3) {
        flatlineStretches.push({ startCut: points[runStart].cutIndex, endCut: points[i - 1].cutIndex });
      }
      runStart = i;
    }
  }

  const pacingDragCutIndices = points.filter((point) => point.pacingDragDetected).map((point) => point.cutIndex);
  const lastCut = cuts[cuts.length - 1];
  const lastPoint = points[points.length - 1];
  const endingHookScore = Math.round(clampPercent(lastPoint.tensionScore * 0.85 + (lastCut.hasCliffhanger ? 18 : 0)));

  const recommendationsKo: string[] = [];
  if (climaxPlacementStatus === "too-early") {
    recommendationsKo.push(
      `클라이맥스(${peakPoint.cutIndex}컷, 진행률 ${Math.round(climaxPositionRatio * 100)}%)가 초반에 쏠려 있습니다. 후반 70~95% 구간에 반전 컷을 추가하세요.`,
    );
  } else if (climaxPlacementStatus === "too-flat") {
    recommendationsKo.push("전체 텐션 진폭이 좁아 평탄합니다. 감정이나 액션 고점을 75점 이상으로 끌어올리는 핵심 컷을 배치하세요.");
  } else {
    recommendationsKo.push(
      `클라이맥스가 후반 핵심 구간(${peakPoint.cutIndex}컷, 진행률 ${Math.round(climaxPositionRatio * 100)}%)에 안정적으로 자리 잡았습니다.`,
    );
  }
  if (pacingDragCutIndices.length > 0) {
    recommendationsKo.push(
      `설명 대사 과밀 구간(${pacingDragCutIndices.join(", ")}컷)에서 호흡이 처집니다. 말풍선을 두 컷으로 나누거나 반응 컷을 끼워 넣으세요.`,
    );
  }
  if (flatlineStretches.length > 0) {
    const first = flatlineStretches[0];
    recommendationsKo.push(`${first.startCut}~${first.endCut}컷이 저긴장 평탄 구간입니다. 독자 스크롤 이탈을 막기 위해 시각적 전환 컷을 넣어주세요.`);
  }
  if (endingHookScore < 68) {
    recommendationsKo.push("마지막 컷의 다음 화 유도 훅이 약합니다. 미해결 질문이나 시선 클로즈업으로 끝맺음을 보강하세요.");
  }

  return {
    points,
    averageTension: Math.round(sum / points.length),
    peakTension: peakPoint.tensionScore,
    climaxCutIndex: peakPoint.cutIndex,
    climaxPositionRatio,
    climaxPlacementStatus,
    flatlineStretches,
    pacingDragCutIndices,
    endingHookScore,
    recommendationsKo,
  };
}

/* ---------------- 3C. 독자 참여형 분기 인터랙티브 컷 그래프 검증기 ---------------- */

export interface BranchingChoiceEdge {
  readonly id: string;
  readonly labelKo: string;
  readonly targetNodeId: string;
}

export interface BranchingCutNode {
  readonly id: string;
  readonly titleKo: string;
  readonly isEnding: boolean;
  readonly choices: readonly BranchingChoiceEdge[];
}

export interface BranchingStoryGraph {
  readonly startNodeId: string;
  readonly nodes: readonly BranchingCutNode[];
}

export interface BranchingGraphValidationResult {
  readonly isValid: boolean;
  readonly reachableNodeIds: readonly string[];
  readonly unreachableNodeIds: readonly string[];
  readonly infiniteLoopPaths: readonly (readonly string[])[];
  readonly danglingEdges: readonly { readonly fromNodeId: string; readonly choiceId: string; readonly missingTargetId: string }[];
  readonly deadEndNodeIds: readonly string[];
  readonly reachableEndingIds: readonly string[];
  readonly summaryKo: string;
}

export function validateBranchingStoryGraph(graph: BranchingStoryGraph): BranchingGraphValidationResult {
  const nodeMap = new Map<string, BranchingCutNode>();
  for (const node of graph.nodes) {
    nodeMap.set(node.id, node);
  }

  const reachable = new Set<string>();
  const danglingEdges: { readonly fromNodeId: string; readonly choiceId: string; readonly missingTargetId: string }[] = [];
  const deadEndNodeIds: string[] = [];

  for (const node of graph.nodes) {
    if (!node.isEnding && node.choices.length === 0) {
      deadEndNodeIds.push(node.id);
    }
    for (const choice of node.choices) {
      if (!nodeMap.has(choice.targetNodeId)) {
        danglingEdges.push({ fromNodeId: node.id, choiceId: choice.id, missingTargetId: choice.targetNodeId });
      }
    }
  }

  if (nodeMap.has(graph.startNodeId)) {
    const queue: string[] = [graph.startNodeId];
    reachable.add(graph.startNodeId);
    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;
      const current = nodeMap.get(currentId);
      if (!current) continue;
      for (const choice of current.choices) {
        if (nodeMap.has(choice.targetNodeId) && !reachable.has(choice.targetNodeId)) {
          reachable.add(choice.targetNodeId);
          queue.push(choice.targetNodeId);
        }
      }
    }
  }

  const visitState = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const loopSignatures = new Set<string>();
  const infiniteLoopPaths: string[][] = [];

  function dfs(nodeId: string): void {
    visitState.set(nodeId, 1);
    stack.push(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const choice of node.choices) {
        if (!nodeMap.has(choice.targetNodeId)) continue;
        const targetState = visitState.get(choice.targetNodeId) ?? 0;
        if (targetState === 1) {
          const cycleStart = stack.indexOf(choice.targetNodeId);
          if (cycleStart >= 0) {
            const cyclePath = [...stack.slice(cycleStart), choice.targetNodeId];
            const signature = cyclePath.join("->");
            if (!loopSignatures.has(signature)) {
              loopSignatures.add(signature);
              infiniteLoopPaths.push(cyclePath);
            }
          }
        } else if (targetState === 0) {
          dfs(choice.targetNodeId);
        }
      }
    }
    stack.pop();
    visitState.set(nodeId, 2);
  }

  for (const node of graph.nodes) {
    if ((visitState.get(node.id) ?? 0) === 0) {
      dfs(node.id);
    }
  }

  const reachableNodeIds = graph.nodes.filter((node) => reachable.has(node.id)).map((node) => node.id);
  const unreachableNodeIds = graph.nodes.filter((node) => !reachable.has(node.id)).map((node) => node.id);
  const reachableEndingIds = graph.nodes.filter((node) => reachable.has(node.id) && node.isEnding).map((node) => node.id);

  const isValid =
    nodeMap.has(graph.startNodeId) &&
    unreachableNodeIds.length === 0 &&
    infiniteLoopPaths.length === 0 &&
    danglingEdges.length === 0 &&
    deadEndNodeIds.length === 0 &&
    reachableEndingIds.length > 0;

  const issues: string[] = [];
  if (unreachableNodeIds.length > 0) issues.push(`도달 불가 분기 ${unreachableNodeIds.length}개`);
  if (infiniteLoopPaths.length > 0) issues.push(`무한 루프 ${infiniteLoopPaths.length}건`);
  if (danglingEdges.length > 0) issues.push(`끊긴 선택지 ${danglingEdges.length}개`);
  if (deadEndNodeIds.length > 0) issues.push(`막다른 컷 ${deadEndNodeIds.length}개`);
  if (reachableEndingIds.length === 0) issues.push("도달 가능한 엔딩 없음");

  const summaryKo = isValid
    ? `총 ${graph.nodes.length}개 분기 컷과 ${reachableEndingIds.length}개 엔딩이 막힘과 루프 없이 정상 연결됐습니다.`
    : `분기 그래프 수정 필요: ${issues.join(" · ")}`;

  return {
    isValid,
    reachableNodeIds,
    unreachableNodeIds,
    infiniteLoopPaths,
    danglingEdges,
    deadEndNodeIds,
    reachableEndingIds,
    summaryKo,
  };
}
