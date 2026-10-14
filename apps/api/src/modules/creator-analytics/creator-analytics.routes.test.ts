import { describe, expect, it } from "vitest";

import {
  CREATOR_ANALYTICS_ROUTE_PATH,
  handleCreatorAnalyticsRequest,
} from "./creator-analytics.routes";

describe("creator analytics routes", () => {
  it("엔드포인트 경로를 노출한다", () => {
    expect(CREATOR_ANALYTICS_ROUTE_PATH).toBe("/api/creator/analytics");
  });

  it("실집계 연결 전에는 목 숫자를 200으로 위장하지 않고 404를 반환한다", () => {
    const result = handleCreatorAnalyticsRequest({
      period: "30d",
      seriesId: "series-starfall",
    });
    expect(result.status).toBe(404);
    expect((result.body as { message: string }).message).toContain("연결되지 않았어요");
    expect(result.body).not.toHaveProperty("kpis");
  });

  it("sample=1 명시 요청에서만 200과 목 본문(mock:true)을 반환한다", () => {
    const result = handleCreatorAnalyticsRequest({
      period: "30d",
      seriesId: "series-starfall",
      sample: "1",
    });
    expect(result.status).toBe(200);
    const body = result.body as { seriesId: string; period: string; mock: boolean };
    expect(body.seriesId).toBe("series-starfall");
    expect(body.period).toBe("30d");
    expect(body.mock).toBe(true);
  });

  it("period가 없으면 기본이 아니라 400을 반환한다", () => {
    const result = handleCreatorAnalyticsRequest({});
    expect(result.status).toBe(400);
    expect((result.body as { message: string }).message).toContain("period");
  });

  it("seriesId가 비어 있으면 샘플 요청에서 기본 시리즈로 처리한다", () => {
    const result = handleCreatorAnalyticsRequest({ period: "7d", seriesId: " ", sample: "1" });
    expect(result.status).toBe(200);
    expect((result.body as { seriesId: string }).seriesId).toBe(
      "series-midnight-diner",
    );
  });
});
