import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { appRoutes } from "@/app/routes/groups/app-routes";

import {
  FEATURE_OVERVIEW_CATEGORIES,
  FEATURE_OVERVIEW_CATALOG_TITLES,
  FEATURE_OVERVIEW_PLATFORM_COUNT,
} from "./features-overview-data";

/**
 * `/features` 요약 카탈로그의 무결성 고정.
 * - 모든 항목 링크는 등록된 실제 라우트여야 한다 (404 catch-all로 가면 실패).
 * - 카테고리·항목 구조와 한/영 문구가 비어 있지 않아야 한다.
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

  it("모든 항목 링크가 등록된 실제 라우트로 연결된다", () => {
    for (const category of FEATURE_OVERVIEW_CATEGORIES) {
      for (const item of category.items) {
        const matched = matchRoutes(appRoutes, item.href)?.at(-1)?.route;
        expect(matched?.id, `${category.id} / ${item.href}`).toBeTruthy();
        expect(matched?.id, `${category.id} / ${item.href}`).not.toBe("not-found");
      }
    }
  });

  it("표기 수치는 정적 근거가 있는 상수만 쓴다", () => {
    // apps/api/data/catalog.json.gz titles 길이와 packages/core platforms 수 (2026-10-06 실측).
    expect(FEATURE_OVERVIEW_CATALOG_TITLES).toBe(60_234);
    expect(FEATURE_OVERVIEW_PLATFORM_COUNT).toBe(20);
  });
});
