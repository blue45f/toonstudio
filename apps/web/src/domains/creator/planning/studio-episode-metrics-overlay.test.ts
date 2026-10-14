import { describe, expect, it } from "vitest";
import type { CreatorAnalyticsResponse } from "../analytics/types";
import {
  buildEpisodeMetricsOverlay,
  episodeMetricsFeedbackHints,
  episodeMetricsLoadFromResponse,
  episodeMetricsStatusLine,
  formatEpisodeMetricsBadge,
  formatEpisodeMetricsDetail,
  resolveEpisodeMetricsLoad,
  type EpisodeMetricsLoad,
} from "./studio-episode-metrics-overlay";

const REFS = [
  { episodeId: "ep-1", episodeNumber: 1 },
  { episodeId: "ep-2", episodeNumber: 2 },
  { episodeId: "ep-3", episodeNumber: 3 },
  { episodeId: "ep-4", episodeNumber: 4 },
] as const;

/** 실집계(mock:false) 응답. 3화는 이탈 지점, 좋아요·댓글은 2화부터만 측정됨. */
function liveResponse(overrides: Partial<CreatorAnalyticsResponse> = {}): CreatorAnalyticsResponse {
  return {
    seriesId: "series-1",
    period: "30d",
    generatedAt: "2026-10-15T00:00:00.000Z",
    mock: false,
    kpis: [],
    retention: [
      { episode: 1, title: "1화", views: 10000, retentionPct: 100, dropOffPct: 0, isDropOff: false },
      { episode: 2, title: "2화", views: 9000, retentionPct: 90, dropOffPct: 10, isDropOff: false },
      { episode: 3, title: "3화", views: 6300, retentionPct: 63, dropOffPct: 30, isDropOff: true },
    ],
    trafficSources: [],
    episodes: [
      { episode: 1, title: "1화", publishedAt: "2026-09-01", views: 10000 },
      { episode: 2, title: "2화", publishedAt: "2026-09-08", views: 9000, likes: 320, comments: 41 },
      { episode: 3, title: "3화", publishedAt: "2026-09-15", views: 6300, likes: 150, comments: 12 },
      { episode: 9, title: "9화", publishedAt: "2026-10-27", views: 100 },
    ],
    dropOffEpisodes: [3],
    series: [],
    ...overrides,
  };
}

const LIVE_LOAD: EpisodeMetricsLoad = { status: "live", response: liveResponse() };

describe("episode metrics overlay — live aggregation", () => {
  it("joins metrics onto planning episodes by episode number", () => {
    const overlay = buildEpisodeMetricsOverlay(REFS, LIVE_LOAD);
    expect(overlay.isLive).toBe(true);
    expect(overlay.status).toBe("live");
    expect(overlay.entries).toHaveLength(4);
    expect(overlay.entries[0]?.metrics?.views).toBe(10000);
    expect(overlay.entries[0]?.metrics?.retentionPct).toBe(100);
    expect(overlay.entries[1]?.metrics?.likes).toBe(320);
    expect(overlay.entries[2]?.metrics?.isDropOff).toBe(true);
    expect(overlay.measuredCount).toBe(3);
    expect(overlay.dropOffEpisodeNumbers).toEqual([3]);
  });

  it("leaves unmeasured fields null instead of faking zeroes", () => {
    const overlay = buildEpisodeMetricsOverlay(REFS, LIVE_LOAD);
    // 1화는 API가 likes/comments를 생략했다 — 0이 아니라 null이어야 한다.
    expect(overlay.entries[0]?.metrics?.likes).toBeNull();
    expect(overlay.entries[0]?.metrics?.comments).toBeNull();
    expect(overlay.entries[0]?.metrics?.newSubscribers).toBeNull();
    // 4화는 실측 자체가 없다.
    expect(overlay.entries[3]?.metrics).toBeNull();
    expect(overlay.entries[3]?.badge).toBeNull();
  });

  it("surfaces metrics for episodes missing from planning instead of dropping them", () => {
    const overlay = buildEpisodeMetricsOverlay(REFS, LIVE_LOAD);
    expect(overlay.unmatchedEpisodeNumbers).toEqual([9]);
    expect(overlay.byEpisodeNumber.get(9)?.views).toBe(100);
  });

  it("builds badge and detail text from measured values only", () => {
    const overlay = buildEpisodeMetricsOverlay(REFS, LIVE_LOAD);
    expect(overlay.entries[0]?.badge).toBe("조회 10,000 · 잔존 100%");
    expect(overlay.entries[2]?.badge).toBe("조회 6,300 · 잔존 63% · 이탈 지점");
    expect(overlay.entries[1]?.detail).toContain("좋아요 320");
    expect(overlay.entries[0]?.detail).not.toContain("좋아요");
    expect(formatEpisodeMetricsBadge(null)).toBeNull();
    expect(formatEpisodeMetricsDetail(null)).toBeNull();
  });

  it("emits feedback hints only for drop-off episodes", () => {
    const overlay = buildEpisodeMetricsOverlay(REFS, LIVE_LOAD);
    const hints = episodeMetricsFeedbackHints(overlay);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("3화");
    expect(hints[0]).toContain("30%");
    expect(episodeMetricsStatusLine(overlay)).toContain("3개 회차 측정");
  });
});

describe("episode metrics overlay — no live data means no numbers", () => {
  it("treats a mock response as not-connected even when marked live", () => {
    const load = episodeMetricsLoadFromResponse(liveResponse({ mock: true }));
    expect(load.status).toBe("not-connected");
    expect(load.response).toBeNull();
    const overlay = buildEpisodeMetricsOverlay(REFS, load);
    expect(overlay.isLive).toBe(false);
    expect(overlay.measuredCount).toBe(0);
    expect(overlay.entries.every((entry) => entry.metrics === null)).toBe(true);
    expect(overlay.entries.every((entry) => entry.badge === null)).toBe(true);
    expect(episodeMetricsFeedbackHints(overlay)).toEqual([]);
    expect(episodeMetricsStatusLine(overlay)).toContain("아직 연결되지 않았어요");
  });

  it("never promotes a mock payload smuggled into a live load", () => {
    const smuggled: EpisodeMetricsLoad = {
      status: "live",
      response: liveResponse({ mock: true }),
    };
    const overlay = buildEpisodeMetricsOverlay(REFS, smuggled);
    expect(overlay.isLive).toBe(false);
    expect(overlay.status).toBe("not-connected");
    expect(overlay.byEpisodeNumber.size).toBe(0);
    expect(episodeMetricsStatusLine(overlay)).toContain("아직 연결되지 않았어요");
  });

  it("keeps every metric null for loading, error, not-connected and missing loads", () => {
    for (const load of [
      { status: "loading", response: null },
      { status: "error", response: null },
      { status: "not-connected", response: null },
      { status: "idle", response: null },
      null,
      undefined,
    ] as const) {
      const overlay = buildEpisodeMetricsOverlay(REFS, load);
      expect(overlay.isLive).toBe(false);
      expect(overlay.entries).toHaveLength(4);
      expect(overlay.entries.every((entry) => entry.metrics === null)).toBe(true);
      expect(episodeMetricsFeedbackHints(overlay)).toEqual([]);
    }
    expect(episodeMetricsStatusLine(buildEpisodeMetricsOverlay(REFS, null))).toContain("연결되지 않았어요");
    expect(
      episodeMetricsStatusLine(buildEpisodeMetricsOverlay(REFS, { status: "error", response: null })),
    ).toContain("불러오지 못했어요");
  });
});

describe("resolveEpisodeMetricsLoad — mirrors the analytics page rules", () => {
  it("maps resource states without leaking sample numbers", () => {
    expect(resolveEpisodeMetricsLoad({ data: liveResponse() }).status).toBe("live");
    expect(resolveEpisodeMetricsLoad({ data: liveResponse({ mock: true }) }).status).toBe("not-connected");
    expect(resolveEpisodeMetricsLoad({ data: null, notFound: true }).status).toBe("not-connected");
    expect(resolveEpisodeMetricsLoad({ data: null, loading: true }).status).toBe("loading");
    expect(resolveEpisodeMetricsLoad({ data: null, error: new Error("boom") }).status).toBe("error");
    expect(resolveEpisodeMetricsLoad({ data: null }).status).toBe("idle");
    // 목 응답은 loading/error보다 우선해 연결 전으로 접힌다 (숫자를 보여줄 상태가 아님).
    expect(
      resolveEpisodeMetricsLoad({ data: liveResponse({ mock: true }), loading: true }).status,
    ).toBe("not-connected");
  });
});
