import { describe, expect, it } from "vitest";

import { CreatorAnalyticsNotConnectedError } from "./creator-analytics.service";
import {
  TrafficCreatorAnalyticsSource,
  type CreatorAnalyticsSeriesCatalog,
  type CreatorAnalyticsTrafficReader,
  type CreatorAnalyticsTrafficStats,
} from "./creator-analytics.traffic-source";

const FIXED_NOW = new Date("2026-10-14T00:00:00.000Z");

const catalog: CreatorAnalyticsSeriesCatalog = {
  listSeries: () => [
    {
      id: "midnight-diner",
      slug: "midnight-diner",
      title: "심야식당",
      episodes: [
        { episode: 1, title: "첫 손님", publishedAt: "2026-09-01" },
        { episode: 2, title: "단골", publishedAt: "2026-09-08" },
        { episode: 3, title: "마지막 국물", publishedAt: "2026-09-15" },
      ],
    },
    {
      id: "starfall",
      slug: "starfall",
      title: "별의 낙하",
      episodes: [{ episode: 1, title: "낙하", publishedAt: "2026-10-01" }],
    },
  ],
  findSeries: (seriesId) =>
    (catalog.listSeries().find((record) => record.id === seriesId) ?? null),
};

function readerWith(stats: CreatorAnalyticsTrafficStats): CreatorAnalyticsTrafficReader {
  return { readWindowStats: async () => stats };
}

describe("TrafficCreatorAnalyticsSource", () => {
  it("실측 트래픽으로 조회수 KPI·리텐션·유입을 구성하고 측정 불가 지표는 생략한다", async () => {
    const source = new TrafficCreatorAnalyticsSource(
      catalog,
      readerWith({
        detailViews: 120,
        episodeViews: new Map([
          [1, 300],
          [2, 240],
          [3, 100],
        ]),
        previousDetailViews: 100,
        previousEpisodeViews: new Map([
          [1, 200],
          [2, 200],
          [3, 100],
        ]),
        sources: [
          { source: "direct", medium: "none", visits: 500 },
          { source: "google", medium: "organic", visits: 260 },
        ],
      }),
      () => FIXED_NOW,
    );
    const response = await source.getAnalytics("30d", "midnight-diner");
    expect(response.mock).toBe(false);
    expect(response.seriesId).toBe("midnight-diner");
    expect(response.generatedAt).toBe(FIXED_NOW.toISOString());
    // 조회수 KPI만 실측으로 나간다 — likes/comments/구독 전환 KPI는 만들지 않는다.
    expect(response.kpis).toEqual([
      { key: "views", value: 760, deltaPct: 26.7 },
    ]);
    expect(response.retention.map((point) => point.views)).toEqual([300, 240, 100]);
    expect(response.retention[0]?.retentionPct).toBe(100);
    expect(response.retention[2]?.retentionPct).toBe(33.3);
    // 2화 이탈 20%·3화 이탈 58.3% — 둘 다 임계값(15%) 이상이라 이탈 지점이다.
    expect(response.dropOffEpisodes).toEqual([2, 3]);
    // 회차 행에는 실측 불가 지표를 0으로 채우지 않고 생략한다.
    for (const episode of response.episodes) {
      expect(episode).not.toHaveProperty("likes");
      expect(episode).not.toHaveProperty("comments");
      expect(episode).not.toHaveProperty("newSubscribers");
    }
    expect(response.episodes.map((episode) => episode.views)).toEqual([300, 240, 100]);
    expect(response.trafficSources).toEqual([
      { source: "direct", labelKo: "직접 방문", labelEn: "Direct", visits: 500, sharePct: 65.8 },
      { source: "google", labelKo: "google 검색", labelEn: "google (search)", visits: 260, sharePct: 34.2 },
    ]);
    expect(response.series).toEqual([
      { id: "midnight-diner", title: "심야식당", episodeCount: 3 },
      { id: "starfall", title: "별의 낙하", episodeCount: 1 },
    ]);
  });

  it("seriesId가 없으면 카탈로그의 첫 시리즈를 기본으로 집계한다", async () => {
    const source = new TrafficCreatorAnalyticsSource(
      catalog,
      readerWith({
        detailViews: 0,
        episodeViews: new Map(),
        previousDetailViews: 0,
        previousEpisodeViews: new Map(),
        sources: [],
      }),
      () => FIXED_NOW,
    );
    const response = await source.getAnalytics("7d");
    expect(response.seriesId).toBe("midnight-diner");
    // 트래픽이 실제로 0건이면 0이 실측이다 — 연결 전과 혼동하지 않는다.
    expect(response.kpis).toEqual([{ key: "views", value: 0, deltaPct: 0 }]);
    expect(response.trafficSources).toEqual([]);
  });

  it("카탈로그에 없는 시리즈는 집계를 지어내지 않고 연결 전 에러를 던진다", async () => {
    const source = new TrafficCreatorAnalyticsSource(
      catalog,
      readerWith({
        detailViews: 0,
        episodeViews: new Map(),
        previousDetailViews: 0,
        previousEpisodeViews: new Map(),
        sources: [],
      }),
      () => FIXED_NOW,
    );
    await expect(source.getAnalytics("30d", "no-such-series")).rejects.toBeInstanceOf(
      CreatorAnalyticsNotConnectedError,
    );
  });

  it("기간 윈도우를 현재·직전으로 정확히 나눠 리더에 전달한다", async () => {
    const windows: { start: Date; end: Date; previousStart: Date }[] = [];
    const reader: CreatorAnalyticsTrafficReader = {
      readWindowStats: async (_slug, window) => {
        windows.push(window);
        return {
          detailViews: 0,
          episodeViews: new Map(),
          previousDetailViews: 0,
          previousEpisodeViews: new Map(),
          sources: [],
        };
      },
    };
    const source = new TrafficCreatorAnalyticsSource(catalog, reader, () => FIXED_NOW);
    await source.getAnalytics("7d", "starfall");
    expect(windows).toHaveLength(1);
    expect(windows[0]?.end).toEqual(FIXED_NOW);
    expect(windows[0]?.start).toEqual(new Date("2026-10-07T00:00:00.000Z"));
    expect(windows[0]?.previousStart).toEqual(new Date("2026-09-30T00:00:00.000Z"));
  });
});
