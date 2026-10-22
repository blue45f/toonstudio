/**
 * 후보 한 장을 앵커 세트 전체와 견주어 0~1 참고 점수를 낸다.
 *
 * 앵커는 여섯 각도라 후보가 어느 각도를 닮았는지에 따라 가장 비슷한 한 장이 다르다. 점수는 "가장 비슷한 앵커 한 장과의
 * 비교 점수"이고, 각도마다의 비교 결과를 모두 남겨 두어 화면이 사용자가 고른 앵커로 바꿔 보여 줄 수 있다. 같은 캐릭터인지
 * 판정하지 않으며, 일관성을 보장하지 않는다(anchor-consistency-compare.ts 의 안내를 따른다).
 */

import { ANCHOR_ANGLE_IDS, type AnchorAngleId } from "./anchor-capture-spec";
import {
  anchorScoreBand,
  compareAnchorFeatures,
  type AnchorComparisonLimit,
  type AnchorFeatureId,
  type AnchorPairComparison,
  type AnchorScoreBand,
} from "./anchor-consistency-compare";
import type { AnchorImageFeatures } from "./anchor-image-features";

export interface AnchorReferenceFeatures {
  readonly angleId: AnchorAngleId;
  readonly features: AnchorImageFeatures;
}

export interface AnchorCandidateAnchorScore {
  readonly angleId: AnchorAngleId;
  readonly comparison: AnchorPairComparison;
}

export interface AnchorCandidateScore {
  /** 앵커 각도마다의 비교 결과(정본 각도 순서). */
  readonly perAnchor: readonly AnchorCandidateAnchorScore[];
  /** 점수가 가장 높은 앵커와 그 비교(같으면 정본 순서가 앞선 쪽). */
  readonly best: AnchorCandidateAnchorScore;
  /** `best` 의 각도. */
  readonly bestAngleId: AnchorAngleId;
  /** 가장 비슷한 앵커와의 참고 점수(0~1). */
  readonly score: number;
  readonly band: AnchorScoreBand;
  /** limited 면 점수를 읽을 때 조심해야 하는 사정(limits)이 있다. */
  readonly reliability: "ok" | "limited";
  readonly limits: readonly AnchorComparisonLimit[];
}

/** 앵커 특징이 하나도 없으면 null. 같은 각도가 둘이면 먼저 나온 것만 쓴다. */
export function scoreCandidateAgainstAnchors(
  anchors: readonly AnchorReferenceFeatures[],
  candidate: AnchorImageFeatures,
): AnchorCandidateScore | null {
  const byAngle = new Map<AnchorAngleId, AnchorImageFeatures>();
  for (const anchor of anchors) if (!byAngle.has(anchor.angleId)) byAngle.set(anchor.angleId, anchor.features);
  const perAnchor: AnchorCandidateAnchorScore[] = [];
  for (const angleId of ANCHOR_ANGLE_IDS) {
    const features = byAngle.get(angleId);
    if (features) perAnchor.push(Object.freeze({ angleId, comparison: compareAnchorFeatures(features, candidate) }));
  }
  let best: AnchorCandidateAnchorScore | null = null;
  for (const entry of perAnchor) {
    if (!best || entry.comparison.score > best.comparison.score) best = entry;
  }
  if (!best) return null;
  return Object.freeze({
    perAnchor: Object.freeze(perAnchor),
    best,
    bestAngleId: best.angleId,
    score: best.comparison.score,
    band: anchorScoreBand(best.comparison.score),
    reliability: best.comparison.limits.length === 0 ? "ok" as const : "limited" as const,
    limits: best.comparison.limits,
  });
}

/** 사용자가 고른 앵커 각도의 비교 결과. 앵커 세트에 없는 각도면 null. */
export function comparisonForAnchor(score: AnchorCandidateScore, angleId: AnchorAngleId): AnchorPairComparison | null {
  return score.perAnchor.find((entry) => entry.angleId === angleId)?.comparison ?? null;
}

/**
 * 화면이 이 후보에 대해 보여 줄 앵커와 비교. 정렬 키(`sortAnchorCandidates`)와 목록·나란히 보기의 점수가 같은 값을 읽도록
 * 한 곳에서 고른다. `angleId` 가 앵커 세트에 있으면 그 앵커, 비우거나 세트에 없으면 가장 비슷한 앵커다.
 */
export function displayedAnchorScore(score: AnchorCandidateScore, angleId: AnchorAngleId | null): AnchorCandidateAnchorScore {
  if (angleId) {
    const chosen = score.perAnchor.find((entry) => entry.angleId === angleId);
    if (chosen) return chosen;
  }
  return score.best;
}

export type AnchorSortMode = "score-desc" | "score-asc" | "name" | "input-order" | AnchorFeatureId;

export interface RankableAnchorCandidate {
  readonly id: string;
  readonly name: string;
  /** 들어온 순서(0부터). 같은 값이면 이 순서로 안정 정렬한다. */
  readonly order: number;
  /** 아직 점수가 없거나(분석 전·실패) 앵커가 없으면 null. */
  readonly score: AnchorCandidateScore | null;
}

const NAME_COLLATOR = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

function sortValue(candidate: RankableAnchorCandidate, mode: AnchorSortMode, angleId: AnchorAngleId | null): number | null {
  if (!candidate.score) return null;
  if (mode === "name" || mode === "input-order") return null;
  const { comparison } = displayedAnchorScore(candidate.score, angleId);
  return mode === "score-desc" || mode === "score-asc" ? comparison.score : comparison.similarities[mode];
}

/**
 * 후보를 정렬한 새 배열을 돌려준다. 점수가 없는 후보는 어떤 점수 기준에서도 맨 뒤에 들어온 순서로 놓는다.
 * `angleId` 를 주면 그 앵커와의 비교를 기준으로 정렬하고, 비우면 후보마다 가장 비슷한 앵커를 기준으로 한다.
 */
export function sortAnchorCandidates<T extends RankableAnchorCandidate>(
  candidates: readonly T[],
  mode: AnchorSortMode,
  angleId: AnchorAngleId | null = null,
): T[] {
  const copy = [...candidates];
  if (mode === "input-order") return copy.sort((left, right) => left.order - right.order);
  if (mode === "name") {
    return copy.sort((left, right) => NAME_COLLATOR.compare(left.name, right.name) || left.order - right.order);
  }
  return copy.sort((left, right) => {
    const a = sortValue(left, mode, angleId);
    const b = sortValue(right, mode, angleId);
    if (a === null && b === null) return left.order - right.order;
    if (a === null) return 1;
    if (b === null) return -1;
    const diff = mode === "score-asc" ? a - b : b - a;
    return Math.abs(diff) < 1e-9 ? left.order - right.order : diff;
  });
}
