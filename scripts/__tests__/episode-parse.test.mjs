import { describe, expect, it } from "vitest";

import {
  coverProxy,
  mapNaverArticle,
  mapNaverArticlePage,
  mergeEpisodePages,
  parseNaverServiceDate,
} from "../episode-parse.mjs";

// 실측 fixture — 2026-10-06 네이버 회차 API(api/article/list, titleId=758037) 응답 발췌.
const NAVER_ARTICLE_264 = {
  no: 264,
  thumbnailUrl:
    "https://image-comic.pstatic.net/webtoon/758037/264/thumbnail_202x120_0e1f38e7-387b-45ed-8804-85c1dc440de0.jpg",
  subtitle: "262화",
  starScore: 9.91305,
  bgm: false,
  up: false,
  charge: false,
  serviceDateDescription: "26.10.04",
  volumeNo: 264,
  hasReadLog: false,
  recentlyReadLog: false,
  thumbnailClock: false,
  thumbnailLock: false,
};

describe("episode-parse — 네이버 회차 응답 파싱", () => {
  it("parseNaverServiceDate: YY.MM.DD 만 ISO로 바꾸고 나머지는 버린다", () => {
    expect(parseNaverServiceDate("26.10.04")).toBe("2026-10-04");
    expect(parseNaverServiceDate("09.01.05")).toBe("2009-01-05");
    expect(parseNaverServiceDate("2026-10-04")).toBeNull();
    expect(parseNaverServiceDate("26.13.01")).toBeNull();
    expect(parseNaverServiceDate("26.10.32")).toBeNull();
    expect(parseNaverServiceDate("")).toBeNull();
    expect(parseNaverServiceDate(null)).toBeNull();
    expect(parseNaverServiceDate(undefined)).toBeNull();
  });

  it("coverProxy: https만 프록시로 감싸고 그 외는 버린다(표지 선례)", () => {
    expect(coverProxy("https://image-comic.pstatic.net/a.jpg")).toBe(
      "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fa.jpg",
    );
    expect(coverProxy("http://image-comic.pstatic.net/a.jpg")).toBeUndefined();
    expect(coverProxy("")).toBeUndefined();
    expect(coverProxy(null)).toBeUndefined();
  });

  it("mapNaverArticle: 번호·제목·날짜·썸네일을 매핑한다", () => {
    expect(mapNaverArticle(NAVER_ARTICLE_264)).toEqual({
      number: 264,
      title: "262화",
      publishedAt: "2026-10-04",
      thumbnailUrl:
        "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F758037%2F264%2Fthumbnail_202x120_0e1f38e7-387b-45ed-8804-85c1dc440de0.jpg",
    });
  });

  it("mapNaverArticle: 별점(starScore)을 좋아요로 위장하지 않는다", () => {
    const episode = mapNaverArticle(NAVER_ARTICLE_264);
    expect(episode).not.toHaveProperty("likes");
  });

  it("mapNaverArticle: 번호가 유효하지 않으면 버리고, 빈 제목·깨진 날짜는 필드째 비운다", () => {
    expect(mapNaverArticle({ no: 0 })).toBeNull();
    expect(mapNaverArticle({ no: 1.5 })).toBeNull();
    expect(mapNaverArticle({})).toBeNull();
    expect(mapNaverArticle(null)).toBeNull();
    expect(mapNaverArticle({ no: 7, subtitle: "  ", serviceDateDescription: "미정" })).toEqual({ number: 7 });
  });

  it("mapNaverArticlePage: 페이지 정보와 함께 매핑하고 깨진 응답은 null", () => {
    const page = mapNaverArticlePage({
      totalCount: 268,
      articleList: [NAVER_ARTICLE_264, { no: 263, subtitle: "261화", serviceDateDescription: "26.09.27" }],
      pageInfo: { totalRows: 263, pageSize: 20, page: 1, totalPages: 14 },
    });
    expect(page?.episodes.map((ep) => ep.number)).toEqual([264, 263]);
    expect(page?.totalPages).toBe(14);
    expect(page?.totalRows).toBe(263);
    expect(page?.page).toBe(1);
    expect(mapNaverArticlePage(null)).toBeNull();
    expect(mapNaverArticlePage({ articleList: "no" })).toBeNull();
  });

  it("mapNaverArticlePage: pageInfo가 없으면 totalCount로 총수를 대신한다", () => {
    const page = mapNaverArticlePage({ totalCount: 42, articleList: [{ no: 1 }] });
    expect(page?.totalRows).toBe(42);
    expect(page?.totalPages).toBe(1);
  });

  it("mergeEpisodePages: 번호 중복을 제거하고 오름차순으로 정렬한다", () => {
    const merged = mergeEpisodePages([
      { episodes: [{ number: 3 }, { number: 2 }] },
      { episodes: [{ number: 2, title: "중복은 먼저 본 쪽" }, { number: 1 }] },
    ]);
    expect(merged.map((ep) => ep.number)).toEqual([1, 2, 3]);
    expect(merged[1]).toEqual({ number: 2 });
  });
});
