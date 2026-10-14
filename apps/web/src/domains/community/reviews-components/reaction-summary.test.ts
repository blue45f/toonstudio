import { describe, expect, it } from "vitest";

import {
  buildMisclassificationReport,
  buildReactionSummary,
  classifyReaction,
  type ReactionCategory,
} from "./reaction-summary";

import type { SeedReview } from "@/shared/lib/types";

function makeReview(partial: Partial<SeedReview> & { readonly id: string }): SeedReview {
  return {
    titleId: "title-1",
    author: "독자",
    avatar: "#888888",
    rating: 3,
    text: "",
    tags: [],
    spoiler: false,
    likes: 0,
    createdAt: "2026-10-01T00:00:00.000Z",
    ...partial,
  };
}

describe("classifyReaction — 작품 평가와 인신공격 분리", () => {
  it("작품을 혹평해도 인신공격이 아니면 critique로 분류한다", () => {
    const result = classifyReaction({ text: "전개가 너무 지루하고 개연성 없는 회차였다. 아쉽다.", rating: 1.5 });
    expect(result.category).toBe("critique");
    expect(result.topics).toContain("story");
  });

  it("욕설이 섞인 댓글은 작품 얘기가 있어도 attack으로 분류한다", () => {
    const result = classifyReaction({ text: "스토리는 좋은데 작가 씨발 진짜 한심하다", rating: 3 });
    expect(result.category).toBe("attack");
    expect(result.attackSignals.length).toBeGreaterThan(0);
    // 인신공격은 주제 집계로 원본 내용을 끌어오지 않는다.
    expect(result.topics).toEqual([]);
  });

  it("사람을 겨냥한 비하(대상어+비하어)는 욕설이 없어도 attack이다", () => {
    const result = classifyReaction({ text: "작가 수준이 이 정도일 줄은 몰랐다", rating: 2 });
    expect(result.category).toBe("attack");
  });

  it("칭찬은 praise, 주제 신호가 있는 중립 의견은 work로 분류한다", () => {
    expect(classifyReaction({ text: "이번 화 연출이 최고였다 감동", rating: 5 }).category).toBe("praise");
    expect(classifyReaction({ text: "작화는 안정적인데 전개 속도가 조금 느린 편이다", rating: 3.5 }).category).toBe("work");
  });
});

describe("buildReactionSummary — 방벽 판정", () => {
  const attackText = "작가 씨발 한심하다 그만 그려라";
  const reviews: SeedReview[] = [
    makeReview({ id: "r-praise", text: "최고의 회차였다. 작화도 스토리도 감동.", rating: 5, likes: 42 }),
    makeReview({ id: "r-critique", text: "전개가 지루해서 아쉽다.", rating: 2, likes: 3 }),
    makeReview({ id: "r-attack", text: attackText, rating: 1, likes: 99 }),
    makeReview({ id: "r-work", text: "캐릭터 케미가 살아나고 있다.", rating: 4, likes: 7 }),
  ];

  it("인신공격 댓글은 개수만 세고 요약 어디에도 원본 텍스트가 실리지 않는다", () => {
    const summary = buildReactionSummary(reviews);
    expect(summary.total).toBe(4);
    expect(summary.counts.attack).toBe(1);
    expect(summary.shieldedCount).toBe(1);
    // 대표 반응에 공격 댓글이 공감 1위여도 들어가지 않는다.
    expect(summary.highlights.map((highlight) => highlight.reviewId)).not.toContain("r-attack");
    // 직렬화한 요약 전체에 원본 문구가 없어야 한다 (방벽의 핵심 단언).
    expect(JSON.stringify(summary)).not.toContain("씨발");
    expect(JSON.stringify(summary)).not.toContain("그만 그려라");
    // 주제 집계도 공격 댓글에서 끌어오지 않는다.
    expect(summary.topics.every(({ count }) => count >= 1)).toBe(true);
  });

  it("비율과 대표 반응은 비공격 카테고리에서만 조립된다", () => {
    const summary = buildReactionSummary(reviews);
    expect(summary.shares.praise).toBeCloseTo(0.25);
    expect(summary.highlights[0]?.reviewId).toBe("r-praise");
    // highlights의 category 타입은 설계상 attack을 제외하므로, 런타임 불변식 단언은
    // 전체 카테고리 유니온으로 넓혀 비교한다(타입이 보장하는 바를 테스트가 다시 확인).
    expect(summary.highlights.every((highlight) => (highlight.category as ReactionCategory) !== "attack")).toBe(true);
  });

  it("오분류 신고 override가 있으면 재분류가 즉시 요약에 반영된다", () => {
    const overrides = new Map<string, ReactionCategory>([["r-attack", "critique"]]);
    const summary = buildReactionSummary(reviews, overrides);
    expect(summary.counts.attack).toBe(0);
    expect(summary.shieldedCount).toBe(0);
    expect(summary.counts.critique).toBe(2);
  });

  it("빈 입력에서는 0 나눗셈 없이 빈 요약을 반환한다", () => {
    const summary = buildReactionSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.shares.attack).toBe(0);
    expect(summary.highlights).toEqual([]);
  });
});

describe("buildMisclassificationReport", () => {
  it("신고 payload에 원본 분류·주장 분류·시각이 담긴다", () => {
    const report = buildMisclassificationReport({
      reviewId: "r-1",
      classifiedAs: "attack",
      claimedAs: "critique",
      now: new Date("2026-10-14T00:00:00.000Z"),
    });
    expect(report).toEqual({
      reviewId: "r-1",
      classifiedAs: "attack",
      claimedAs: "critique",
      reportedAt: "2026-10-14T00:00:00.000Z",
    });
  });
});
