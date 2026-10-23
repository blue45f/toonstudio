/**
 * 앵커 이미지 한 장과 후보 이미지 한 장의 비교 — 특징별 유사도와 0~1 참고 점수.
 *
 * 이 점수는 같은 캐릭터인지 판정하는 값이 아니다. 색 분포·전체 팔레트·실루엣 비율·구조 해시라는 가벼운 특징이 얼마나
 * 비슷한지를 가중 평균한 "휴리스틱 참고 값"이다. 가중치와 구간 경계는 사람이 판단해 정한 값이며, 실제 작품 모음으로
 * 검증하거나 보정한 적이 없다(docs/features/anchor-consistency.md "휴리스틱 임계값"). 포즈·조명·구도가 다르면 같은
 * 캐릭터라도 낮게 나올 수 있고, 다른 캐릭터라도 색이 비슷하면 높게 나올 수 있다.
 *
 * 특징별 유사도(모두 0~1, 1 이 같음)
 * - color: 1 − (0.7×a*b* Hellinger + 0.3×L* Hellinger)
 * - palette: 1 − 양방향 가중 최근접 ΔE ÷ 40
 * - silhouette: 점유 격자 겹침·가로세로 비·상중하 질량·채움 비율의 가중 평균(둘 다 피사체를 분리했을 때만)
 * - structure: 1 − 2×dHash 해밍 거리 ÷ 64 (서로 무관한 이미지가 0 근처가 되게 맞춤)
 * 쓸 수 없는 특징은 빼고 남은 가중치를 다시 정규화한다.
 */

import { compareAnchorColorStats, type AnchorColorComparison } from "./anchor-color-stats";
import { compareAnchorPalettes, type AnchorPaletteComparison } from "./anchor-palette";
import type { AnchorImageFeatures } from "./anchor-image-features";
import { compareAnchorSilhouettes, type AnchorSilhouetteSimilarity } from "./anchor-silhouette";
import { compareAnchorStructureHashes, type AnchorStructureComparison } from "./anchor-structure-hash";

export const ANCHOR_FEATURE_IDS = ["color", "palette", "silhouette", "structure"] as const;
export type AnchorFeatureId = (typeof ANCHOR_FEATURE_IDS)[number];

/** 특징별 가중치(합 1). 사람이 정한 값이다. */
export const ANCHOR_SCORE_WEIGHTS: Readonly<Record<AnchorFeatureId, number>> = Object.freeze({
  color: 0.3,
  palette: 0.3,
  silhouette: 0.25,
  structure: 0.15,
});

/** 화면에 보이는 구간 경계. 사람이 정한 값이며 어떤 정확도나 판정 기준도 뜻하지 않는다. */
export const ANCHOR_SCORE_BANDS = Object.freeze({ high: 0.75, medium: 0.55 });

export type AnchorScoreBand = "high" | "medium" | "low";

export function anchorScoreBand(score: number): AnchorScoreBand {
  if (score >= ANCHOR_SCORE_BANDS.high) return "high";
  return score >= ANCHOR_SCORE_BANDS.medium ? "medium" : "low";
}

export type AnchorComparisonLimit =
  | "anchor-not-separated"
  | "candidate-not-separated"
  | "anchor-low-contrast"
  | "candidate-low-contrast"
  | "tiny-subject";

/** 피사체가 화면의 이 비율보다 작으면 특징이 불안정하다고 알린다. */
export const ANCHOR_TINY_SUBJECT_COVERAGE = 0.03;

export interface AnchorPairComparison {
  /** 0~1 참고 점수. */
  readonly score: number;
  readonly band: AnchorScoreBand;
  /** 특징별 유사도. 쓸 수 없던 특징은 null. */
  readonly similarities: Readonly<Record<AnchorFeatureId, number | null>>;
  /** 실제로 쓴(정규화한) 가중치. 쓰지 않은 특징은 0. */
  readonly weights: Readonly<Record<AnchorFeatureId, number>>;
  /** 참고 신뢰도를 낮추는 사정. 비어 있으면 특별한 제약이 없다는 뜻이지 점수가 맞다는 뜻은 아니다. */
  readonly limits: readonly AnchorComparisonLimit[];
  readonly detail: Readonly<{
    color: AnchorColorComparison;
    palette: AnchorPaletteComparison;
    silhouette: AnchorSilhouetteSimilarity | null;
    structure: AnchorStructureComparison;
  }>;
}

function comparisonLimits(anchor: AnchorImageFeatures, candidate: AnchorImageFeatures): AnchorComparisonLimit[] {
  const limits: AnchorComparisonLimit[] = [];
  if (anchor.subject.mode === "whole-image") limits.push("anchor-not-separated");
  if (candidate.subject.mode === "whole-image") limits.push("candidate-not-separated");
  if (anchor.lowContrast) limits.push("anchor-low-contrast");
  if (candidate.lowContrast) limits.push("candidate-low-contrast");
  const tiny = [anchor, candidate].some(
    (features) => features.subject.mode !== "whole-image" && features.subject.coverage < ANCHOR_TINY_SUBJECT_COVERAGE,
  );
  if (tiny) limits.push("tiny-subject");
  return limits;
}

export function compareAnchorFeatures(anchor: AnchorImageFeatures, candidate: AnchorImageFeatures): AnchorPairComparison {
  const color = compareAnchorColorStats(anchor.color, candidate.color);
  const palette = compareAnchorPalettes(anchor.palette, candidate.palette);
  const silhouette = anchor.silhouette && candidate.silhouette ? compareAnchorSilhouettes(anchor.silhouette, candidate.silhouette) : null;
  const structure = compareAnchorStructureHashes(anchor.structure, candidate.structure);
  const similarities: Record<AnchorFeatureId, number | null> = {
    color: color.similarity,
    palette: palette.similarity,
    silhouette: silhouette ? silhouette.score : null,
    structure: structure.similarity,
  };
  let totalWeight = 0;
  for (const id of ANCHOR_FEATURE_IDS) {
    if (similarities[id] !== null) totalWeight += ANCHOR_SCORE_WEIGHTS[id];
  }
  const weights: Record<AnchorFeatureId, number> = { color: 0, palette: 0, silhouette: 0, structure: 0 };
  let score = 0;
  for (const id of ANCHOR_FEATURE_IDS) {
    const similarity = similarities[id];
    if (similarity === null) continue;
    weights[id] = ANCHOR_SCORE_WEIGHTS[id] / totalWeight;
    score += weights[id] * similarity;
  }
  const clamped = Math.min(1, Math.max(0, score));
  return Object.freeze({
    score: clamped,
    band: anchorScoreBand(clamped),
    similarities: Object.freeze(similarities),
    weights: Object.freeze(weights),
    limits: Object.freeze(comparisonLimits(anchor, candidate)),
    detail: Object.freeze({ color, palette, silhouette, structure }),
  });
}
