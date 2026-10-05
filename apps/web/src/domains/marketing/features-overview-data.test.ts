import { describe, expect, it } from "vitest";

import {
  FEATURE_OVERVIEW_CATEGORIES,
  FEATURE_OVERVIEW_CATALOG_TITLES,
  FEATURE_OVERVIEW_PLATFORM_COUNT,
} from "./features-overview-data";

/**
 * `/features` 요약 카탈로그의 구조 무결성 고정.
 * - 카테고리·항목 구조와 한/영 문구가 비어 있지 않아야 한다.
 * - 링크가 등록 라우트로 이어지는지는 app 레이어의
 *   app/routes/features-overview-links.test.ts가 고정한다
 *   (도메인 → app import는 경계 규칙 위반이라 여기서 직접 대조하지 않는다).
 * 수치 상수는 정적 근거가 있는 값만 허용한다 (데이터 파일 머리말 참조).
 */
describe("features overview catalog", () => {
  it("카테고리 id가 유일하고 제목·요약이 한/영으로 채워져 있다", () => {
    const ids = FEATURE_OVERVIEW_CATEGORIES.map((category) => category.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      expect(category.title.ko.trim()).not.toBe("");
      expect(category.title.en.trim()).not.toBe("");
      expect(category.summary.ko.trim()).not.toBe("");
      expect(category.summary.en.trim()).not.toBe("");
    }
  });

  it("모든 카테고리에 항목이 3개 이상 있고 이름·설명이 한/영으로 채워져 있다", () => {
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      expect(category.items.length).toBeGreaterThanOrEqual(3);
      for (const item of category.items) {
        expect(item.name.ko.trim()).not.toBe("");
        expect(item.name.en.trim()).not.toBe("");
        expect(item.description.ko.trim()).not.toBe("");
        expect(item.description.en.trim()).not.toBe("");
      }
    }
  });

  it("항목 링크가 전체에서 유일하다", () => {
    const hrefs = FEATURE_OVERVIEW_CATEGORIES.flatMap((category) =>
      category.items.map((item) => item.href),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("표기 수치는 정적 근거가 있는 상수만 쓴다", () => {
    // apps/api/data/catalog.json.gz titles 길이와 packages/core platforms 수 (2026-10-06 실측).
    expect(FEATURE_OVERVIEW_CATALOG_TITLES).toBe(60_234);
    expect(FEATURE_OVERVIEW_PLATFORM_COUNT).toBe(20);
  });
});
