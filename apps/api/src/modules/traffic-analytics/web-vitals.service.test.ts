import { describe, expect, it } from "vitest";

import { TrafficAnalyticsService } from "./traffic-analytics.service";
import type {
  TrafficAnalyticsRepository,
} from "./traffic-analytics.repository";
import type { TrafficWebVitalsRecord } from "./traffic-analytics-store";

const VISITOR_ID = "visitor-1234567890abcdef";
const SESSION_ID = "session-1234567890abcdef";
const BROWSER_CONTEXT = {
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
  countryCode: "KR",
};

function createService() {
  const stored: TrafficWebVitalsRecord[] = [];
  const repository: TrafficAnalyticsRepository = {
    persistPageView: async () => {},
    persistHeartbeat: async () => {},
    persistShareEvent: async () => {},
    persistWebVitals: async (record) => {
      stored.push(record);
    },
    webVitalsSamples: async () => [],
    cleanup: async () => {},
    overview: async () => ({}),
    pulse: async () => ({}),
    checkHealth: async () => true,
  };
  return { service: new TrafficAnalyticsService(repository), stored };
}

describe("recordWebVitals intake (G6)", () => {
  it("stores a bounded public-path beacon with hashed identifiers only", async () => {
    const { service, stored } = createService();
    const result = await service.recordWebVitals(
      {
        visitorId: VISITOR_ID,
        sessionId: SESSION_ID,
        path: "/discover",
        lcpMs: 2_100.4,
        cls: 0.04,
        inpMs: null,
      },
      BROWSER_CONTEXT,
    );
    expect(result).toEqual({ accepted: true });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      path: "/discover",
      lcpMs: 2_100,
      cls: 0.04,
      inpMs: null,
      countryCode: "KR",
      deviceType: "desktop",
    });
    // Raw identifiers never reach the store — only HMAC hashes do.
    expect(stored[0]?.visitorHash).not.toBe(VISITOR_ID);
    expect(stored[0]?.visitorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored[0]?.sessionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("excludes non-public paths instead of polluting the §6.4 pool", async () => {
    const { service, stored } = createService();
    for (const path of ["/studio/projects/abc", "/mypage", "/title/demo"]) {
      const result = await service.recordWebVitals(
        { visitorId: VISITOR_ID, sessionId: SESSION_ID, path, lcpMs: 900 },
        BROWSER_CONTEXT,
      );
      expect(result).toEqual({ accepted: false, excluded: true });
    }
    expect(stored).toEqual([]);
  });

  it("excludes bots and privacy opt-outs", async () => {
    const { service, stored } = createService();
    const bot = await service.recordWebVitals(
      { visitorId: VISITOR_ID, sessionId: SESSION_ID, path: "/", lcpMs: 900 },
      {
        userAgent: "Mozilla/5.0 compatible Googlebot/2.1; +https://www.google.com/bot.html",
      },
    );
    expect(bot).toEqual({ accepted: false, excluded: true });

    const optedOut = await service.recordWebVitals(
      { visitorId: VISITOR_ID, sessionId: SESSION_ID, path: "/", lcpMs: 900 },
      { ...BROWSER_CONTEXT, privacyOptOut: true },
    );
    expect(optedOut).toEqual({ accepted: false, excluded: true });
    expect(stored).toEqual([]);
  });

  it("rejects a beacon with no usable metric", async () => {
    const { service } = createService();
    await expect(
      service.recordWebVitals(
        { visitorId: VISITOR_ID, sessionId: SESSION_ID, path: "/", lcpMs: null },
        BROWSER_CONTEXT,
      ),
    ).rejects.toThrow("측정된 성능 지표가 없습니다.");
  });

  it("rate-limits a session that floods the beacon", async () => {
    const { service } = createService();
    const payload = {
      visitorId: VISITOR_ID,
      sessionId: SESSION_ID,
      path: "/",
      lcpMs: 1_000,
    };
    for (let index = 0; index < 120; index += 1) {
      await service.recordWebVitals(payload, BROWSER_CONTEXT);
    }
    await expect(service.recordWebVitals(payload, BROWSER_CONTEXT)).rejects.toMatchObject({
      status: 429,
    });
  });
});
