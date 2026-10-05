import { describe, expect, it } from "vitest";

import {
  SITE_PAGE_HEADER_ART,
  SITE_PAGE_HEADER_BANNER_PATHS,
  sitePageHeaderArtFor,
  sitePageHeaderArtPlacementFor,
  sitePageHeaderArtSource,
} from "./site-page-header-art";

describe("공용 헤더 아트 배정 맵", () => {
  it("S1 문서군·S2 쉘 페이지에 아트를 배정한다", () => {
    expect(sitePageHeaderArtFor("/status")).toBe("background-city");
    expect(sitePageHeaderArtFor("/sitemap")).toBe("storyboard");
    expect(sitePageHeaderArtFor("/discover")).toBe("hero");
    expect(sitePageHeaderArtFor("/library")).toBe("project-romance");
    expect(sitePageHeaderArtFor("/news")).toBe("canvas-noir");
    expect(sitePageHeaderArtFor("/compare")).toBe("character-blue");
    expect(sitePageHeaderArtFor("/recommend")).toBe("character-pink");
    expect(sitePageHeaderArtFor("/search")).toBe("blank-canvas");
  });

  it("끝 슬래시를 떼고 대조하고, 배정이 없으면 undefined를 돌려준다", () => {
    expect(sitePageHeaderArtFor("/news/")).toBe("canvas-noir");
    // 이미 aside 아트를 쓰는 페이지와 동적 경로는 맵에 넣지 않는다.
    expect(sitePageHeaderArtFor("/help")).toBeUndefined();
    expect(sitePageHeaderArtFor("/contact")).toBeUndefined();
    expect(sitePageHeaderArtFor("/ranking")).toBeUndefined();
    expect(sitePageHeaderArtFor("/title/some-story")).toBeUndefined();
    expect(sitePageHeaderArtFor("/admin")).toBeUndefined();
  });

  it("배정 키는 전부 일러스트 풀 파일 경로로 이어진다", () => {
    const keys = Object.values(SITE_PAGE_HEADER_ART);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(sitePageHeaderArtSource(key)).toBe(`/brand/illustrated-20260928/${key}.webp`);
    }
  });

  it("배너 배치는 발견 계열 6페이지에만 켜고, 나머지는 측면 장식을 유지한다", () => {
    // 시안 고도화 9순위: 배너 승격 범위는 S2 쉘 6페이지로 격리한다.
    expect([...SITE_PAGE_HEADER_BANNER_PATHS].sort()).toEqual(
      ["/compare", "/discover", "/library", "/news", "/recommend", "/search"].sort(),
    );
    for (const path of SITE_PAGE_HEADER_BANNER_PATHS) {
      expect(sitePageHeaderArtPlacementFor(path)).toBe("banner");
      // 배너는 아트 배정이 있는 페이지에서만 의미가 있다.
      expect(sitePageHeaderArtFor(path)).toBeDefined();
    }
    // 문서군·미배정 경로는 배너로 새지 않는다.
    expect(sitePageHeaderArtPlacementFor("/status")).toBe("aside");
    expect(sitePageHeaderArtPlacementFor("/sitemap")).toBe("aside");
    expect(sitePageHeaderArtPlacementFor("/help")).toBe("aside");
    expect(sitePageHeaderArtPlacementFor("/news/")).toBe("banner");
  });
});
