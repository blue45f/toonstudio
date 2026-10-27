/**
 * research.dto.test.ts — 리서치 DTO 스키마 단위 테스트.
 * 128자 제한(검색 쿼리 상한)이 곧 원고 유입 방지 가드레일이다.
 */
import { describe, expect, it } from "vitest";

import {
  ExistenceCheckSchema,
  ResearchBriefSchema,
  TrendDigestSchema,
} from "./research.dto";

describe("research.dto 브리프", () => {
  it("질문 128자를 넘기면 거부한다", () => {
    expect(ResearchBriefSchema.safeParse({
      question: "a".repeat(129),
    }).success).toBe(false);
    expect(ResearchBriefSchema.safeParse({
      question: "조선시대 시장",
      maxFetchSources: 4,
    }).success).toBe(false);
    expect(ResearchBriefSchema.safeParse({
      question: "조선시대 시장",
      fetchSources: true,
      maxFetchSources: 2,
      extra: 1,
    }).success).toBe(false);
    expect(ResearchBriefSchema.safeParse({
      question: "조선시대 시장",
    }).success).toBe(true);
  });
});

describe("research.dto 존재 여부 확인", () => {
  it("제목이 비어 있거나 128자를 넘기면 거부한다", () => {
    expect(ExistenceCheckSchema.safeParse({ title: "" }).success).toBe(false);
    expect(ExistenceCheckSchema.safeParse({
      title: "a".repeat(129),
    }).success).toBe(false);
    expect(ExistenceCheckSchema.safeParse({
      title: "내 작품",
      maxResults: 10,
    }).success).toBe(true);
  });
});

describe("research.dto 트렌드 다이제스트", () => {
  it("질의 수와 중복을 검증한다", () => {
    expect(TrendDigestSchema.safeParse({ queries: [] })).toBe(false);
    expect(TrendDigestSchema.safeParse({
      queries: Array.from({ length: 11 }, (_, i) => `질의${i}`),
    })).toBe(false);
    expect(TrendDigestSchema.safeParse({
      queries: ["판타지", "판타지"],
    })).toBe(false);
    expect(TrendDigestSchema.safeParse({
      queries: ["판타지", "로맨스"],
    })).toBe(true);
  });
});
