import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import type { Title } from "@toonstudio/contracts/types";

import {
  loadTitleEpisodeEntries,
  parseTitleEpisode,
  parseTitleEpisodeEntry,
  parseTitleEpisodesSnapshot,
  resetTitleEpisodesCacheForTests,
  withTitleEpisodes,
} from "./title-episodes";

function makeTitle(patch: Partial<Title> = {}): Title {
  return {
    id: "nw-1",
    slug: "nw-1",
    type: "webtoon",
    title: "테스트 작품",
    author: "작가",
    genres: ["드라마"],
    tags: [],
    synopsis: "소개",
    cover: ["#000000", "#111111"],
    status: "ongoing",
    ageRating: "all",
    releaseYear: 2024,
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    stats: {
      views: 100,
      likes: 10,
      bookmarks: 5,
      ratingAvg: 4.5,
      ratingCount: 20,
      ratingDist: [0, 0, 0, 5, 15],
      rankDelta: 0,
      trendingScore: 50,
      completionRate: 80,
      bingeIndex: 70,
    },
    ...patch,
  };
}

afterEach(() => {
  resetTitleEpisodesCacheForTests();
});

describe("parseTitleEpisode — 회차 검증", () => {
  it("형식이 맞는 회차는 모든 필드를 살린다", () => {
    expect(
      parseTitleEpisode({
        number: 3,
        title: "세 번째",
        publishedAt: "2026-09-01",
        likes: 12,
        thumbnailUrl: "/api/cover?u=x",
        status: "published",
      }),
    ).toEqual({
      number: 3,
      title: "세 번째",
      publishedAt: "2026-09-01",
      likes: 12,
      thumbnailUrl: "/api/cover?u=x",
      status: "published",
    });
  });

  it("번호가 없거나 1 미만·정수가 아니면 버린다", () => {
    expect(parseTitleEpisode({ number: 0 })).toBeNull();
    expect(parseTitleEpisode({ number: 2.5 })).toBeNull();
    expect(parseTitleEpisode({ title: "번호 없음" })).toBeNull();
    expect(parseTitleEpisode("문자열")).toBeNull();
    expect(parseTitleEpisode(null)).toBeNull();
  });

  it("어긋난 선택 필드는 필드째 버리고 회차 자체는 살린다", () => {
    expect(parseTitleEpisode({ number: 4, title: "  ", likes: -3, thumbnailUrl: "", status: "hidden" })).toEqual({
      number: 4,
    });
  });
});

describe("parseTitleEpisodeEntry — 스냅샷 항목 검증", () => {
  it("회차를 번호순으로 정렬하고 총수·부분 플래그를 살린다", () => {
    const entry = parseTitleEpisodeEntry({
      episodes: [{ number: 2 }, { number: 1 }],
      totalEpisodes: 10,
      crawledAt: "2026-10-06T00:00:00.000Z",
      source: "naver-webtoon",
      partial: true,
    });
    expect(entry?.episodes.map((ep) => ep.number)).toEqual([1, 2]);
    expect(entry?.totalEpisodes).toBe(10);
    expect(entry?.partial).toBe(true);
    expect(entry?.source).toBe("naver-webtoon");
  });

  it("유효한 회차가 하나도 없으면 항목 자체를 버린다", () => {
    expect(parseTitleEpisodeEntry({ episodes: [] })).toBeNull();
    expect(parseTitleEpisodeEntry({ episodes: [{ number: 0 }] })).toBeNull();
    expect(parseTitleEpisodeEntry({ episodes: "not-array" })).toBeNull();
    expect(parseTitleEpisodeEntry(null)).toBeNull();
  });
});

describe("parseTitleEpisodesSnapshot", () => {
  it("유효한 작품만 맵에 남긴다", () => {
    const snapshot = parseTitleEpisodesSnapshot({
      "nw-1": { episodes: [{ number: 1 }], crawledAt: "t", source: "naver-webtoon" },
      "nw-2": { episodes: [] },
      "nw-3": "깨진 항목",
    });
    expect([...snapshot.keys()]).toEqual(["nw-1"]);
  });

  it("객체가 아니면 빈 맵을 돌려준다", () => {
    expect(parseTitleEpisodesSnapshot(null).size).toBe(0);
    expect(parseTitleEpisodesSnapshot([1, 2]).size).toBe(0);
  });
});

describe("withTitleEpisodes — 상세 응답 부착", () => {
  const entries = parseTitleEpisodesSnapshot({
    "nw-1": {
      episodes: [{ number: 2, title: "둘째" }, { number: 1, title: "첫째" }],
      totalEpisodes: 263,
      crawledAt: "2026-10-06T00:00:00.000Z",
      source: "naver-webtoon",
    },
  });

  it("스냅샷에 없는 작품은 원본 그대로 — episodes 필드를 만들지 않는다", () => {
    const detail = { title: makeTitle({ id: "nw-999" }), reviews: [] };
    const result = withTitleEpisodes(detail, entries);
    expect(result).toBe(detail);
    expect("episodes" in result).toBe(false);
  });

  it("스냅샷에 있으면 응답 루트에 회차를 싣고 totalEpisodes를 병합한다", () => {
    const title = makeTitle();
    const detail = { title, reviews: [] };
    const result = withTitleEpisodes(detail, entries);
    expect(result.episodes?.map((ep) => ep.number)).toEqual([1, 2]);
    expect(result.title.totalEpisodes).toBe(263);
    // 스토어 원본 객체는 변형하지 않는다
    expect(title.totalEpisodes).toBeUndefined();
    expect(result.title).not.toBe(title);
  });

  it("작품 선언값이 더 크면 선언값을 유지한다", () => {
    const detail = { title: makeTitle({ totalEpisodes: 300 }), reviews: [] };
    const result = withTitleEpisodes(detail, entries);
    expect(result.title.totalEpisodes).toBe(300);
    expect(result.title).toBe(detail.title);
  });
});

describe("loadTitleEpisodeEntries — 파일 로드", () => {
  it("env로 지정한 JSON 스냅샷을 읽는다", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "episodes-"));
    const file = path.join(dir, "title-episodes.json");
    writeFileSync(
      file,
      JSON.stringify({ "nw-1": { episodes: [{ number: 1 }], crawledAt: "t", source: "naver-webtoon" } }),
    );
    const loaded = loadTitleEpisodeEntries({ WEBDEX_EPISODES_FILE: file });
    expect(loaded.get("nw-1")?.episodes).toEqual([{ number: 1 }]);
  });

  it("gz 스냅샷도 읽는다", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "episodes-"));
    const file = path.join(dir, "title-episodes.json.gz");
    writeFileSync(
      file,
      gzipSync(JSON.stringify({ "nw-2": { episodes: [{ number: 5 }], crawledAt: "t", source: "naver-webtoon" } })),
    );
    const loaded = loadTitleEpisodeEntries({ WEBDEX_EPISODES_FILE: file });
    expect(loaded.get("nw-2")?.episodes).toEqual([{ number: 5 }]);
  });

  it("파일이 없으면 빈 맵 — 상세는 회차 없이 나간다", () => {
    const loaded = loadTitleEpisodeEntries({ WEBDEX_EPISODES_FILE: "/nonexistent/title-episodes.json" });
    expect(loaded.size).toBe(0);
  });
});
