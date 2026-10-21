import { describe, expect, it } from "vitest";

import { createTrafficCreatorAnalyticsSource } from "./creator-analytics.source-provider";
import { TrafficCreatorAnalyticsSource } from "./creator-analytics.traffic-source";

// 운영 저장소 판정 — TRAFFIC_ANALYTICS_STORE 값에 따라 실집계 소스가
// 어떤 리더로 조립되는지(또는 등록되지 않는지)를 고정한다.

const D1_ENV = {
  TRAFFIC_ANALYTICS_STORE: "d1",
  TRAFFIC_ANALYTICS_D1_RPC_URL: "https://analytics-rpc.example.com/query",
  TRAFFIC_ANALYTICS_D1_RPC_TOKEN: "t".repeat(40),
};

describe("createTrafficCreatorAnalyticsSource", () => {
  it("미설정이면 운영 기본값인 Postgres 실집계 소스를 만든다", () => {
    expect(createTrafficCreatorAnalyticsSource({})).toBeInstanceOf(
      TrafficCreatorAnalyticsSource,
    );
  });

  it("postgres면 Postgres 실집계 소스를 만든다", () => {
    expect(
      createTrafficCreatorAnalyticsSource({ TRAFFIC_ANALYTICS_STORE: "postgres" }),
    ).toBeInstanceOf(TrafficCreatorAnalyticsSource);
  });

  it("d1이고 RPC 설정이 올바르면 D1 실집계 소스를 만든다", () => {
    expect(createTrafficCreatorAnalyticsSource(D1_ENV)).toBeInstanceOf(
      TrafficCreatorAnalyticsSource,
    );
  });

  it("d1인데 RPC 설정이 없으면 조용히 빠지지 않고 기동 오류를 낸다", () => {
    expect(() =>
      createTrafficCreatorAnalyticsSource({ TRAFFIC_ANALYTICS_STORE: "d1" }),
    ).toThrow();
  });

  it("알 수 없는 저장소 값이면 소스를 등록하지 않는다(연결 전 유지)", () => {
    expect(
      createTrafficCreatorAnalyticsSource({ TRAFFIC_ANALYTICS_STORE: "sqlite" }),
    ).toBeNull();
  });
});
