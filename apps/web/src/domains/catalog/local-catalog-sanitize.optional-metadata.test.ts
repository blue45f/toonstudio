// 전체 카탈로그 건수를 모르면 로드된 개수로 대체하지 않는다.
import { describe, expect, it } from "vitest";
import type { SearchResponse } from "@/platform/search-client";
import { sanitizeCatalogApiData } from "@/domains/catalog/local-catalog-sanitize";

const responseWithoutMetadata: SearchResponse = {
  items: [], total: 0, typeCount: { webtoon: 0, webnovel: 0 }, topTags: [],
  pagination: { page: 1, pageSize: 24, total: 0, hasMore: false, nextPage: null },
};
describe("검색 카탈로그의 선택적 메타데이터", () => {
  it("합법적인 응답에 메타데이터가 없으면 카탈로그를 합성하지 않는다", () => {
    const result = sanitizeCatalogApiData("/api/search", responseWithoutMetadata);
    expect(result?.catalog).toBeUndefined();
    expect(result?.pagination?.total).toBe(0);
  });
  it.each([0, 117])("명시한 전체 건수 %s를 로드한 작품 개수로 대체하지 않는다", (count) => {
    const response: SearchResponse = { ...responseWithoutMetadata, catalog: {
      source: "UNIT-ONLY-NOT-LIVE", loadedAt: "2026-01-01T00:00:00Z", titleCount: count,
      platformCoverage: [], filteredPlatformCoverage: [],
    } };
    const result = sanitizeCatalogApiData("/api/search", response);
    expect(result?.catalog?.titleCount).toBe(count);
    expect(result?.items).toEqual([]);
  });
});
