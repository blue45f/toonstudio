import { describe, expect, it } from "vitest";
import { externalLinkForName } from "./engineering-external-links";
import {
  FREE_AI_TOKEN_CATEGORIES,
  FREE_AI_TOKEN_CAUTIONS,
  FREE_AI_TOKEN_GUIDE_VERIFIED_ON,
  FREE_AI_TOKEN_METHODS,
  TOONSTUDIO_FREE_AI_ROUTES,
} from "./engineering-free-ai-token-guide";

describe("무료 AI 토큰 가이드", () => {
  it("분류 5종이 모두 존재하고 빠진 분류가 없다", () => {
    expect(FREE_AI_TOKEN_CATEGORIES.map((category) => category.id)).toEqual([
      "provider-free-tier",
      "router",
      "byok",
      "on-device",
      "trial-credit",
    ]);
    for (const category of FREE_AI_TOKEN_CATEGORIES) {
      expect(category.title.ko.length).toBeGreaterThan(0);
      expect(category.title.en.length).toBeGreaterThan(0);
      expect(category.summary.ko.length).toBeGreaterThan(0);
      expect(category.summary.en.length).toBeGreaterThan(0);
      expect(
        FREE_AI_TOKEN_METHODS.some((method) => method.categoryId === category.id),
      ).toBe(true);
    }
  });

  it("방법 항목의 링크가 전부 레지스트리나 내부 경로로 해결된다", () => {
    const ids = new Set<string>();
    for (const method of FREE_AI_TOKEN_METHODS) {
      expect(ids.has(method.id)).toBe(false);
      ids.add(method.id);
      expect(method.name.ko.length).toBeGreaterThan(0);
      expect(method.freeScope.ko.length).toBeGreaterThan(0);
      expect(method.limits.ko.length).toBeGreaterThan(0);
      expect(method.start.ko.length).toBeGreaterThan(0);
      if (method.linkName) {
        expect(
          externalLinkForName(method.linkName),
          `${method.id}: 레지스트리에 없는 링크 이름 ${method.linkName}`,
        ).toBeDefined();
      } else {
        expect(method.internalHref, `${method.id}: 링크 이름도 내부 경로도 없다`).toMatch(
          /^\//,
        );
      }
    }
  });

  it("툰스튜디오 실제 경로는 근거 파일 경로를 함께 적는다", () => {
    expect(TOONSTUDIO_FREE_AI_ROUTES.length).toBeGreaterThanOrEqual(4);
    for (const route of TOONSTUDIO_FREE_AI_ROUTES) {
      expect(route.evidence.length).toBeGreaterThan(0);
      for (const path of route.evidence) {
        expect(path).toMatch(/^(apps|docs)\//);
      }
    }
  });

  it("확인 날짜와 주의사항이 명시된다", () => {
    expect(FREE_AI_TOKEN_GUIDE_VERIFIED_ON).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(FREE_AI_TOKEN_CAUTIONS.length).toBeGreaterThanOrEqual(4);
  });
});
