import { afterEach, describe, expect, it } from "vitest";

import type { CreatorAnalyticsResponse } from "./creator-analytics.dto";
import { buildMockCreatorAnalytics } from "./creator-analytics.mock";
import {
  CreatorAnalyticsBadRequestError,
  CreatorAnalyticsNotConnectedError,
  CreatorAnalyticsService,
  registerCreatorAnalyticsSource,
} from "./creator-analytics.service";

afterEach(() => {
  registerCreatorAnalyticsSource(null);
});

describe("CreatorAnalyticsService", () => {
  it("실제 집계 소스가 없으면 목을 돌려주지 않고 연결 전 에러를 던진다", async () => {
    const service = new CreatorAnalyticsService();
    for (const period of ["7d", "30d", "90d"] as const) {
      try {
        await service.getAnalytics(period);
        expect.unreachable("연결 전 에러가 던져져야 합니다");
      } catch (error) {
        expect(error).toBeInstanceOf(CreatorAnalyticsNotConnectedError);
        expect((error as CreatorAnalyticsNotConnectedError).statusCode).toBe(404);
      }
    }
  });

  it("명시적 샘플 허용일 때만 목 애널리틱스를 반환한다", async () => {
    const service = new CreatorAnalyticsService();
    for (const period of ["7d", "30d", "90d"] as const) {
      const response = await service.getAnalytics(period, undefined, { allowSample: true });
      expect(response.period).toBe(period);
      expect(response.mock).toBe(true);
      expect(response.retention.length).toBeGreaterThan(0);
    }
    const sampled = await service.getAnalytics("30d", "series-starfall", { allowSample: true });
    expect(sampled.seriesId).toBe("series-starfall");
    expect(sampled.episodes).toHaveLength(8);
  });

  it("등록된 실제 집계 소스의 응답을 mock:false 로 그대로 전달한다", async () => {
    const real: CreatorAnalyticsResponse = {
      ...buildMockCreatorAnalytics("30d", "series-starfall"),
      mock: false,
    };
    registerCreatorAnalyticsSource({ getAnalytics: () => real });
    const service = new CreatorAnalyticsService();
    const response = await service.getAnalytics("30d", "series-starfall");
    expect(response).toBe(real);
    expect(response.mock).toBe(false);
  });

  it("주입된 소스가 우선하고, 목 표시를 단 소스 응답은 연결 전으로 처리한다", async () => {
    const fake = new CreatorAnalyticsService({
      getAnalytics: () => buildMockCreatorAnalytics("30d"),
    });
    await expect(fake.getAnalytics("30d")).rejects.toThrow(CreatorAnalyticsNotConnectedError);
  });

  it("잘못된 period에는 샘플 허용 여부와 무관하게 400 에러를 던진다", async () => {
    const service = new CreatorAnalyticsService();
    for (const bad of ["1y", "", undefined, 30]) {
      try {
        await service.getAnalytics(bad, undefined, { allowSample: true });
        expect.unreachable("에러가 던져져야 합니다");
      } catch (error) {
        expect(error).toBeInstanceOf(CreatorAnalyticsBadRequestError);
        expect((error as CreatorAnalyticsBadRequestError).statusCode).toBe(400);
      }
    }
  });
});
