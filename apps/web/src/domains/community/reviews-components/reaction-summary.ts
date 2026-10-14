import type { SeedReview } from "@/shared/lib/types";

/**
 * 악성 댓글 방벽 — 반응 요약 분류·집계 모델 (REPORT O-5).
 *
 * 작품 댓글을 감정·주제별로 분류·집계해 '반응 요약'으로만 보여 주고, 원본은 본인이
 * 명시적으로 열 때만 보게 하는 것이 목적이다. 핵심은 작품 평가와 인신공격을 분리하는 것:
 * - 인신공격(attack)으로 분류된 댓글은 요약 산출물 어디에도 원본 텍스트가 실리지 않는다.
 *   집계에는 개수만 들어가고, 대표 반응·주제 집계에서도 제외된다.
 * - 분류는 규칙·키워드 기반 1차 판정이다. 정확도 한계가 있으므로 오분류 신고
 *   (MisclassificationReport)로 다듬는 경로를 함께 제공한다 — 신고된 재분류는
 *   overrides로 즉시 요약에 반영된다.
 */

export type ReactionCategory = "praise" | "work" | "critique" | "attack" | "other";

export type ReactionTopic = "art" | "story" | "character" | "pacing" | "serialization";

export interface ReactionClassification {
  readonly category: ReactionCategory;
  readonly topics: readonly ReactionTopic[];
  /** attack 판정 근거가 된 표현 — 원본 전체가 아니라 매칭된 단어만 (검증·신고용). */
  readonly attackSignals: readonly string[];
}

export interface ReactionHighlight {
  readonly reviewId: string;
  readonly author: string;
  readonly rating: number;
  readonly category: Exclude<ReactionCategory, "attack">;
  readonly topics: readonly ReactionTopic[];
  readonly excerpt: string;
}

export interface ReactionSummary {
  readonly total: number;
  readonly counts: Readonly<Record<ReactionCategory, number>>;
  /** 0..1 비율. total이 0이면 전부 0. */
  readonly shares: Readonly<Record<ReactionCategory, number>>;
  /** 인신공격으로 분류돼 원본이 가려진 댓글 수 — 텍스트는 요약에 존재하지 않는다. */
  readonly shieldedCount: number;
  /** 주제별 집계 (인신공격 댓글은 제외 — 원본 내용을 요약에 끌어오지 않는다). */
  readonly topics: readonly { readonly topic: ReactionTopic; readonly count: number }[];
  /** 대표 반응 — attack 카테고리는 구조적으로 포함될 수 없다. */
  readonly highlights: readonly ReactionHighlight[];
}

export interface MisclassificationReport {
  readonly reviewId: string;
  readonly classifiedAs: ReactionCategory;
  readonly claimedAs: ReactionCategory;
  readonly reportedAt: string;
}

const CATEGORIES: readonly ReactionCategory[] = ["praise", "work", "critique", "attack", "other"];

/** 욕설·비하 표현 — 등장 자체로 인신공격 방벽 대상. 작품 비판과 섞여 있어도 원본 비노출이 안전 기본값이다. */
const PROFANITY_SIGNALS: readonly string[] = [
  "씨발",
  "시발",
  "ㅅㅂ",
  "ㅂㅅ",
  "병신",
  "개새끼",
  "지랄",
  "닥쳐",
  "꺼져",
  "또라이",
  "미친놈",
  "미친년",
  "한심",
  "무능",
  "재능 없",
  "재능없",
  "그만 그려",
  "그만그려",
  "때려치",
  "작가놈",
  "작가년",
];

/** 사람을 겨냥한 표현 — 대상어와 함께 있을 때만 인신공격으로 본다 (작품 평가와 분리). */
const PERSON_TARGETS: readonly string[] = ["작가", "글쓴이", "그린이", "연출가", "작가님"];
const PERSON_DEROGATIONS: readonly string[] = ["인성", "머리", "수준", "얼굴", "외모", "집안", "멘탈"];

const PRAISE_SIGNALS: readonly string[] = [
  "최고",
  "재밌",
  "재미있",
  "감동",
  "명작",
  "레전드",
  "갓",
  "힐링",
  "눈물",
  "소름",
  "완벽",
  "미쳤",
  "인생작",
  "띵작",
  "강추",
  "좋았",
  "좋아요",
  "좋다",
  "훌륭",
  "대박",
];

const CRITIQUE_SIGNALS: readonly string[] = [
  "노잼",
  "지루",
  "별로",
  "아쉽",
  "아쉬",
  "실망",
  "억지",
  "개연성 없",
  "개연성없",
  "발연출",
  "하차",
  "유치",
  "식상",
  "그림이 아쉬",
  "스토리가 아쉬",
  "전개가 아쉬",
];

const TOPIC_SIGNALS: Readonly<Record<ReactionTopic, readonly string[]>> = {
  art: ["작화", "그림", "선화", "채색", "배경", "연출", "컷", "표정", "색감"],
  story: ["스토리", "전개", "대사", "개연성", "떡밥", "복선", "서사", "결말", "반전"],
  character: ["캐릭터", "주인공", "매력", "서브남주", "서브여주", "빌런", "케미"],
  pacing: ["분량", "호흡", "느려", "느리", "빠르", "질질", "전개 속도"],
  serialization: ["연재", "휴재", "업로드", "주기", "연재일"],
};

const HIGHLIGHT_LIMIT = 3;
const EXCERPT_LIMIT = 120;

function matchedSignals(text: string, signals: readonly string[]): string[] {
  return signals.filter((signal) => text.includes(signal));
}

function detectTopics(text: string): ReactionTopic[] {
  const topics: ReactionTopic[] = [];
  (Object.keys(TOPIC_SIGNALS) as ReactionTopic[]).forEach((topic) => {
    if (matchedSignals(text, TOPIC_SIGNALS[topic]).length > 0) topics.push(topic);
  });
  return topics;
}

function detectAttackSignals(text: string): string[] {
  const profanity = matchedSignals(text, PROFANITY_SIGNALS);
  if (profanity.length > 0) return profanity;
  const targets = matchedSignals(text, PERSON_TARGETS);
  const derogations = matchedSignals(text, PERSON_DEROGATIONS);
  if (targets.length > 0 && derogations.length > 0) {
    return [...targets.map((target) => `${target}·${derogations[0]}`)];
  }
  return [];
}

/** 댓글 한 건 분류. 작품 평가(critique)와 인신공격(attack)을 분리하는 것이 핵심 규칙이다. */
export function classifyReaction(review: Pick<SeedReview, "text" | "rating">): ReactionClassification {
  const text = review.text ?? "";
  const attackSignals = detectAttackSignals(text);
  if (attackSignals.length > 0) {
    // 인신공격은 주제 집계에도 끌어오지 않는다 — topics를 비워 원본 내용이 요약에 섞이지 않게 한다.
    return { category: "attack", topics: [], attackSignals };
  }
  const topics = detectTopics(text);
  const praise = matchedSignals(text, PRAISE_SIGNALS).length;
  const critique = matchedSignals(text, CRITIQUE_SIGNALS).length;
  if (critique > praise) return { category: "critique", topics, attackSignals: [] };
  if (praise > 0) return { category: "praise", topics, attackSignals: [] };
  if (critique > 0) return { category: "critique", topics, attackSignals: [] };
  if (review.rating >= 4.5) return { category: "praise", topics, attackSignals: [] };
  if (review.rating <= 2.5) return { category: "critique", topics, attackSignals: [] };
  if (topics.length > 0 || text.trim().length >= 12) return { category: "work", topics, attackSignals: [] };
  return { category: "other", topics, attackSignals: [] };
}

/**
 * 분류·집계. overrides(오분류 신고로 확정된 재분류)가 있으면 그 분류를 우선한다.
 * attack 항목은 counts/shieldedCount에만 기여하고 highlights·topics에는 절대 들어가지 않는다.
 */
export function buildReactionSummary(
  reviews: readonly SeedReview[],
  overrides?: ReadonlyMap<string, ReactionCategory>,
): ReactionSummary {
  const counts: Record<ReactionCategory, number> = { praise: 0, work: 0, critique: 0, attack: 0, other: 0 };
  const topicCounts = new Map<ReactionTopic, number>();
  const highlightCandidates: ReactionHighlight[] = [];

  for (const review of reviews) {
    const classified = classifyReaction(review);
    const category = overrides?.get(review.id) ?? classified.category;
    counts[category] += 1;
    if (category === "attack") continue;
    for (const topic of classified.topics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
    highlightCandidates.push({
      reviewId: review.id,
      author: review.author,
      rating: review.rating,
      category,
      topics: classified.topics,
      excerpt: review.text.length > EXCERPT_LIMIT ? `${review.text.slice(0, EXCERPT_LIMIT)}…` : review.text,
    });
  }

  const total = reviews.length;
  const shares = Object.fromEntries(
    CATEGORIES.map((category) => [category, total === 0 ? 0 : counts[category] / total]),
  ) as Record<ReactionCategory, number>;
  const topics = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
  // 대표 반응은 칭찬·작품 평가를 우선하고, 공감(likes)이 큰 순으로 고른다.
  const categoryRank: Record<Exclude<ReactionCategory, "attack">, number> = { praise: 0, work: 1, critique: 2, other: 3 };
  const likesById = new Map(reviews.map((review) => [review.id, review.likes]));
  const highlights = [...highlightCandidates]
    .sort(
      (a, b) =>
        categoryRank[a.category] - categoryRank[b.category] ||
        (likesById.get(b.reviewId) ?? 0) - (likesById.get(a.reviewId) ?? 0),
    )
    .slice(0, HIGHLIGHT_LIMIT);

  return { total, counts, shares, shieldedCount: counts.attack, topics, highlights };
}

/** 오분류 신고 payload 조립 — 분류를 다듬는 유일한 피드백 경로. */
export function buildMisclassificationReport(input: {
  readonly reviewId: string;
  readonly classifiedAs: ReactionCategory;
  readonly claimedAs: ReactionCategory;
  readonly now?: Date;
}): MisclassificationReport {
  return {
    reviewId: input.reviewId,
    classifiedAs: input.classifiedAs,
    claimedAs: input.claimedAs,
    reportedAt: (input.now ?? new Date()).toISOString(),
  };
}
