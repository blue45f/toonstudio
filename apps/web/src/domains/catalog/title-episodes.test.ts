import { describe, expect, it } from "vitest";

import {
  resolveTitleEpisodes,
  resolveTotalEpisodes,
  sortEpisodes,
  type TitleEpisode,
} from "./title-episodes";

describe("resolveTitleEpisodes — 회차 계약 경계", () => {
  it("회차 필드가 없으면 undefined를 돌려준다 (현재 카탈로그 계약)", () => {
    expect(resolveTitleEpisodes({ title: { slug: "x" } })).toBeUndefined();
    expect(resolveTitleEpisodes(null)).toBeUndefined();
    expect(resolveTitleEpisodes("episodes")).toBeUndefined();
    expect(resolveTitleEpisodes({ episodes: "not-an-array" })).toBeUndefined();
    expect(resolveTitleEpisodes({ episodes: [] })).toBeUndefined();
  });

  it("형식이 맞는 회차만 검증해 번호순으로 돌려준다", () => {
    const resolved = resolveTitleEpisodes({
      episodes: [
        { number: 3, title: "세 번째", likes: 12 },
        { number: 1, title: "첫 번째", publishedAt: "2026-09-01" },
        { number: 2, status: "scheduled" },
        { number: 0, title: "번호가 0이면 버린다" },
        { number: 2.5, title: "정수가 아니면 버린다" },
        { title: "번호가 없으면 버린다" },
        "문자열은 버린다",
        { number: 4, title: "  ", likes: -3, thumbnailUrl: "" },
      ],
    });
    expect(resolved?.map((ep) => ep.number)).toEqual([1, 2, 3, 4]);
    expect(resolved?.[0]).toMatchObject({ number: 1, title: "첫 번째", publishedAt: "2026-09-01" });
    expect(resolved?.[1]).toMatchObject({ number: 2, status: "scheduled" });
    // 빈 제목·음수 좋아요·빈 썸네일은 필드째 버리고 회차 자체는 살린다
    expect(resolved?.[3]).toEqual({ number: 4 });
  });
});

describe("API 상세 응답 연동 — 스냅샷이 공급을 시작하면 켜진다", () => {
  // 실측 fixture: 2026-10-06 네이버 회차 API 응답(참교육, nw-758037)을 크롤러 매핑
  // (날짜 YY.MM.DD → ISO, 썸네일은 /api/cover 프록시 형태)한 뒤 API 상세 응답 루트에
  // episodes 로 실은 형태. scripts/crawl-episodes.mjs 의 산출과 같은 모양이다.
  const apiDetailResponse = {
    title: { slug: "nw-758037", totalEpisodes: 263 },
    reviews: [],
    episodes: [
      {
        number: 264,
        title: "262화",
        publishedAt: "2026-10-04",
        thumbnailUrl:
          "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F758037%2F264%2Fthumbnail_202x120_0e1f38e7-387b-45ed-8804-85c1dc440de0.jpg",
      },
      {
        number: 263,
        title: "261화",
        publishedAt: "2026-09-27",
        thumbnailUrl:
          "/api/cover?u=https%3A%2F%2Fimage-comic.pstatic.net%2Fwebtoon%2F758037%2F263%2Fthumbnail_202x120_1455d79d-8877-41ac-a33f-4a878530c68e6.jpg",
      },
    ],
  };

  it("상세 응답 루트의 episodes를 검증해 회차 목록으로 켠다", () => {
    const episodes = resolveTitleEpisodes(apiDetailResponse);
    expect(episodes?.map((ep) => ep.number)).toEqual([263, 264]);
    expect(episodes?.[1]).toMatchObject({ number: 264, title: "262화", publishedAt: "2026-10-04" });
    expect(episodes?.[0].thumbnailUrl).toContain("/api/cover?u=");
  });

  it("총수는 API가 병합한 선언값과 회차 번호 중 큰 값을 쓴다", () => {
    const episodes = resolveTitleEpisodes(apiDetailResponse);
    expect(resolveTotalEpisodes(apiDetailResponse.title, episodes)).toBe(264);
  });
});

describe("sortEpisodes", () => {
  const episodes: TitleEpisode[] = [{ number: 2 }, { number: 1 }, { number: 3 }];

  it("oldest는 첫 화부터, latest는 최신부터", () => {
    expect(sortEpisodes(episodes, "oldest").map((ep) => ep.number)).toEqual([1, 2, 3]);
    expect(sortEpisodes(episodes, "latest").map((ep) => ep.number)).toEqual([3, 2, 1]);
    // 입력 순서는 바꾸지 않는다
    expect(episodes.map((ep) => ep.number)).toEqual([2, 1, 3]);
  });
});

describe("resolveTotalEpisodes", () => {
  it("선언값과 회차 목록 중 가장 큰 단서를 쓴다", () => {
    expect(resolveTotalEpisodes({ totalEpisodes: 128 }, [{ number: 1 }, { number: 2 }])).toBe(128);
    expect(resolveTotalEpisodes({}, [{ number: 1 }, { number: 2 }])).toBe(2);
  });

  it("목록이 일부만 실려 와도 가장 큰 회차 번호를 총수 하한으로 본다", () => {
    expect(resolveTotalEpisodes({}, [{ number: 5, status: "scheduled" }])).toBe(5);
  });

  it("작품 메타의 선언값만 있어도 쓴다", () => {
    expect(resolveTotalEpisodes({ totalEpisodes: 128 })).toBe(128);
  });

  it("단서가 없으면 undefined — 지어내지 않는다", () => {
    expect(resolveTotalEpisodes({})).toBeUndefined();
    expect(resolveTotalEpisodes({ totalEpisodes: 0 })).toBeUndefined();
  });
});
