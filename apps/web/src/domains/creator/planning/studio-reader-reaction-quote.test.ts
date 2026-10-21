import { describe, expect, it } from "vitest";
import type { CreatorAnalyticsResponse } from "../analytics/types";
import type { EpisodeMetricsLoad } from "./studio-episode-metrics-overlay";
import {
  buildReaderReactionQuoteCard,
  pickReaderReactionMemoTarget,
} from "./studio-reader-reaction-quote";

/** 실집계(mock:false) 응답. 좋아요·댓글·구독은 API가 생략한 상태가 기본이다. */
function liveResponse(overrides: Partial<CreatorAnalyticsResponse> = {}): CreatorAnalyticsResponse {
  return {
    seriesId: "series-1",
    period: "30d",
    generatedAt: "2026-10-15T00:00:00.000Z",
    mock: false,
    kpis: [{ key: "views", value: 25300, deltaPct: 12.5 }],
    retention: [
      { episode: 1, title: "1화", views: 10000, retentionPct: 100, dropOffPct: 0, isDropOff: false },
      { episode: 2, title: "2화", views: 9000, retentionPct: 90, dropOffPct: 10, isDropOff: false },
      { episode: 3, title: "3화", views: 6300, retentionPct: 63, dropOffPct: 30, isDropOff: true },
    ],
    trafficSources: [
      { source: "direct", labelKo: "직접 방문", labelEn: "Direct", visits: 500, sharePct: 20 },
      { source: "naver", labelKo: "naver 검색", labelEn: "naver (search)", visits: 2000, sharePct: 80 },
    ],
    episodes: [
      { episode: 1, title: "1화", publishedAt: "2026-09-01", views: 10000 },
      { episode: 2, title: "2화", publishedAt: "2026-09-08", views: 9000 },
      { episode: 3, title: "3화", publishedAt: "2026-09-15", views: 6300 },
    ],
    dropOffEpisodes: [3],
    series: [],
    ...overrides,
  };
}

const LIVE_LOAD: EpisodeMetricsLoad = { status: "live", response: liveResponse() };

describe("reader reaction quote card — live data only", () => {
  it("quotes the latest measured episode, total views and top traffic source", () => {
    const card = buildReaderReactionQuoteCard(LIVE_LOAD);
    expect(card.isLive).toBe(true);
    expect(card.sourceEpisode?.episodeNumber).toBe(3);
    expect(card.emptyLine).toBeNull();
    const byId = new Map(card.quotes.map((quote) => [quote.id, quote.text]));
    expect(byId.get("latest-episode")).toContain("3화");
    expect(byId.get("latest-episode")).toContain("조회 6,300");
    expect(byId.get("latest-episode")).toContain("잔존 63%");
    expect(byId.get("latest-episode")).toContain("이탈 지점");
    expect(byId.get("total-views")).toContain("25,300");
    expect(byId.get("total-views")).toContain("12.5% 늘었어요");
    expect(byId.get("traffic")).toContain("naver 검색");
    expect(byId.get("traffic")).toContain("2,000");
  });

  it("marks likes, comments, subscribers, rating and comment sentences as uncollected", () => {
    const card = buildReaderReactionQuoteCard(LIVE_LOAD);
    expect(card.uncollected.map((item) => item.key)).toEqual([
      "likes",
      "comments",
      "newSubscribers",
      "rating",
      "topCommentSentences",
    ]);
    // 미수집 지표의 숫자가 인용 문장에 새지 않는다.
    const allText = card.quotes.map((quote) => quote.text).join(" ");
    expect(allText).not.toContain("좋아요");
    expect(allText).not.toContain("별점");
    // 메모 본문에도 미수집은 숫자가 아니라 라벨로만 들어간다.
    expect(card.memoText).toContain("미수집(인용하지 않음)");
    expect(card.memoText).toContain("댓글 반응 상위 문장");
    expect(card.memoText).toContain("3화까지의 실집계");
  });

  it("quotes engagement values when the response actually carries them", () => {
    const load: EpisodeMetricsLoad = {
      status: "live",
      response: liveResponse({
        episodes: [
          { episode: 1, title: "1화", publishedAt: "2026-09-01", views: 10000 },
          { episode: 2, title: "2화", publishedAt: "2026-09-08", views: 9000 },
          {
            episode: 3,
            title: "3화",
            publishedAt: "2026-09-15",
            views: 6300,
            likes: 150,
            comments: 12,
            newSubscribers: 7,
          },
        ],
      }),
    };
    const card = buildReaderReactionQuoteCard(load);
    expect(card.uncollected.map((item) => item.key)).toEqual([
      "rating",
      "topCommentSentences",
    ]);
    const latest = card.quotes.find((quote) => quote.id === "latest-episode");
    expect(latest?.text).toContain("좋아요 150");
    expect(latest?.text).toContain("댓글 12");
    expect(latest?.text).toContain("새 구독 7");
  });
});

describe("reader reaction quote card — no live data means no quotes", () => {
  it("never quotes a mock response", () => {
    const card = buildReaderReactionQuoteCard({
      status: "live",
      response: liveResponse({ mock: true }),
    });
    expect(card.isLive).toBe(false);
    expect(card.quotes).toEqual([]);
    expect(card.memoText).toBeNull();
    expect(card.sourceEpisode).toBeNull();
    expect(card.emptyLine).toContain("아직 연결되지 않았어요");
  });

  it("returns an empty-state line for loading, error, not-connected and missing loads", () => {
    for (const load of [
      { status: "loading", response: null },
      { status: "error", response: null },
      { status: "not-connected", response: null },
      { status: "idle", response: null },
      null,
      undefined,
    ] as const) {
      const card = buildReaderReactionQuoteCard(load);
      expect(card.quotes).toEqual([]);
      expect(card.memoText).toBeNull();
      expect(card.emptyLine).toBeTruthy();
      expect(card.uncollected.map((item) => item.key)).toContain("rating");
    }
    expect(
      buildReaderReactionQuoteCard({ status: "error", response: null }).emptyLine,
    ).toContain("불러오지 못했어요");
  });

  it("distinguishes a connected project with no measured episodes yet", () => {
    const card = buildReaderReactionQuoteCard({
      status: "live",
      response: liveResponse({ episodes: [], retention: [], kpis: [], trafficSources: [] }),
    });
    expect(card.isLive).toBe(true);
    expect(card.quotes).toEqual([]);
    expect(card.emptyLine).toContain("아직 측정된 회차가 없어요");
  });
});

describe("pickReaderReactionMemoTarget", () => {
  const plans = [
    { episodeId: "ep-1", episodeNumber: 1 },
    { episodeId: "ep-2", episodeNumber: 2 },
    { episodeId: "ep-3", episodeNumber: 3 },
    { episodeId: "ep-4", episodeNumber: 4 },
  ] as const;

  it("targets the next planned episode after the source episode", () => {
    expect(pickReaderReactionMemoTarget(plans, 3)?.episodeId).toBe("ep-4");
    expect(pickReaderReactionMemoTarget(plans, 1)?.episodeId).toBe("ep-2");
  });

  it("falls back to the latest plan when no later episode is planned yet", () => {
    expect(pickReaderReactionMemoTarget(plans, 4)?.episodeId).toBe("ep-4");
    expect(pickReaderReactionMemoTarget(plans, 9)?.episodeId).toBe("ep-4");
  });

  it("returns null without a source episode or plans", () => {
    expect(pickReaderReactionMemoTarget(plans, null)).toBeNull();
    expect(pickReaderReactionMemoTarget([], 3)).toBeNull();
  });
});
