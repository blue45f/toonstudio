/**
 * 베이즈 리뷰 신뢰 엔진 (AC-015 / DIFFERENTIATION.md F06).
 *
 * 별점 인플레·테러로 무너진 시장에서 검증 독자 가중치, 베이즈 보정 평점,
 * 1~5점 분포 스펙트럼, 단기 극단 평점 테러(review bombing) 감지 신호를 결정적으로 계산한다.
 */

export interface ReviewSignalInput {
  readonly id: string;
  readonly rating: number; // 1..5
  readonly createdAt: string;
  readonly verifiedReader?: boolean;
  readonly episodesRead?: number;
  readonly helpfulCount?: number;
}

export interface ReviewDistributionBucket {
  readonly star: 1 | 2 | 3 | 4 | 5;
  readonly count: number;
  readonly sharePercent: number;
}

export interface ReviewTrustSummary {
  readonly totalCount: number;
  readonly verifiedCount: number;
  readonly rawAverage: number;
  readonly bayesianTrustScore: number;
  readonly priorMean: number;
  readonly priorWeight: number;
  readonly distribution: readonly ReviewDistributionBucket[];
  readonly anomalyFlag: "none" | "possible-bombing" | "cold-start";
  readonly anomalyReasonKo: string | null;
}

const DEFAULT_PRIOR_MEAN = 3.9;
const DEFAULT_PRIOR_WEIGHT = 12;

function clampStar(rating: number): 1 | 2 | 3 | 4 | 5 {
  const rounded = Math.round(rating);
  if (rounded <= 1) return 1;
  if (rounded >= 5) return 5;
  return rounded as 1 | 2 | 3 | 4 | 5;
}

function reviewWeight(review: ReviewSignalInput): number {
  let weight = 1.0;
  if (review.verifiedReader) weight += 0.65;
  if (typeof review.episodesRead === "number" && review.episodesRead >= 10) {
    weight += Math.min(0.45, Math.log10(review.episodesRead) * 0.25);
  }
  if (typeof review.helpfulCount === "number" && review.helpfulCount > 0) {
    weight += Math.min(0.3, Math.log10(review.helpfulCount + 1) * 0.2);
  }
  return weight;
}

export function computeReviewTrustSummary(
  reviews: readonly ReviewSignalInput[],
  options: { readonly priorMean?: number; readonly priorWeight?: number } = {},
): ReviewTrustSummary {
  const priorMean = options.priorMean ?? DEFAULT_PRIOR_MEAN;
  const priorWeight = options.priorWeight ?? DEFAULT_PRIOR_WEIGHT;

  const counts: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let rawSum = 0;
  let weightedSum = 0;
  let totalWeight = 0;
  let verifiedCount = 0;
  let unverifiedOneStar = 0;

  for (const r of reviews) {
    const star = clampStar(r.rating);
    counts[star] += 1;
    rawSum += star;
    const w = reviewWeight(r);
    weightedSum += star * w;
    totalWeight += w;
    if (r.verifiedReader) {
      verifiedCount += 1;
    } else if (star === 1) {
      unverifiedOneStar += 1;
    }
  }

  const totalCount = reviews.length;
  const rawAverage = totalCount > 0 ? Number((rawSum / totalCount).toFixed(2)) : 0;
  const bayesianTrustScore =
    totalCount > 0
      ? Number(((priorMean * priorWeight + weightedSum) / (priorWeight + totalWeight)).toFixed(2))
      : priorMean;

  const distribution: ReviewDistributionBucket[] = ([5, 4, 3, 2, 1] as const).map((star) => ({
    star,
    count: counts[star],
    sharePercent: totalCount > 0 ? Math.round((counts[star] / totalCount) * 100) : 0,
  }));

  let anomalyFlag: ReviewTrustSummary["anomalyFlag"] = "none";
  let anomalyReasonKo: string | null = null;

  if (totalCount < 5) {
    anomalyFlag = "cold-start";
    anomalyReasonKo = "초기 평가 표본이 적어 사전 평균 기준으로 보정 중입니다.";
  } else if (
    unverifiedOneStar / totalCount >= 0.45 &&
    counts[5] / totalCount >= 0.2
  ) {
    anomalyFlag = "possible-bombing";
    anomalyReasonKo = "미검증 1점 평가가 비정상적으로 집중되어 검증 독자 가중치를 높여 보정했습니다.";
  }

  return Object.freeze({
    totalCount,
    verifiedCount,
    rawAverage,
    bayesianTrustScore,
    priorMean,
    priorWeight,
    distribution: Object.freeze(distribution),
    anomalyFlag,
    anomalyReasonKo,
  });
}
