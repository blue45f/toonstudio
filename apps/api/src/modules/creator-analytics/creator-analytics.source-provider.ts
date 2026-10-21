import {
  TrafficD1HttpExecutor,
  resolveTrafficD1Config,
} from "../traffic-analytics/traffic-analytics-d1.client";

import {
  registerCreatorAnalyticsSource,
  type CreatorAnalyticsAggregationSource,
} from "./creator-analytics.service";
import { CatalogCreatorAnalyticsSeriesCatalog } from "./creator-analytics.series-catalog";
import { D1CreatorAnalyticsTrafficReader } from "./creator-analytics.traffic-d1-repository";
import { PostgresCreatorAnalyticsTrafficReader } from "./creator-analytics.traffic-repository";
import { TrafficCreatorAnalyticsSource } from "./creator-analytics.traffic-source";

// 실집계 소스 조립·등록.
//
// 운영 저장소(TRAFFIC_ANALYTICS_STORE)에 맞는 리더를 붙인다: postgres(기본값)는
// Postgres 리더, d1은 D1 리더(creator-analytics.traffic-d1-repository.ts).
// d1인데 RPC 설정이 잘못됐으면 traffic-analytics 저장소 프로바이더와 같은
// 기준으로 기동 시점에 실패시킨다(fail-closed) — 조용히 소스를 빼서 "연결 전"
// 으로 위장하지 않는다. 알 수 없는 저장소 값이면 소스를 등록하지 않고
// 서비스가 기존대로 "연결 전"(404)을 유지한다 — 빈 저장소를 읽어 0을
// 실측처럼 내는 것보다 정직한 상태다.
export function createTrafficCreatorAnalyticsSource(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CreatorAnalyticsAggregationSource | null {
  const store = environment.TRAFFIC_ANALYTICS_STORE?.trim() || "postgres";
  if (store === "postgres") {
    return new TrafficCreatorAnalyticsSource(
      new CatalogCreatorAnalyticsSeriesCatalog(),
      new PostgresCreatorAnalyticsTrafficReader(),
    );
  }
  if (store === "d1") {
    return new TrafficCreatorAnalyticsSource(
      new CatalogCreatorAnalyticsSeriesCatalog(),
      new D1CreatorAnalyticsTrafficReader(
        new TrafficD1HttpExecutor(resolveTrafficD1Config(environment)),
      ),
    );
  }
  return null;
}

export const CREATOR_ANALYTICS_SOURCE_REGISTRATION = Symbol(
  "CREATOR_ANALYTICS_SOURCE_REGISTRATION",
);

/** 모듈 초기화 시점에 전역 레지스트리에 실집계 소스를 연결한다. */
export const creatorAnalyticsSourceRegistrationProvider = {
  provide: CREATOR_ANALYTICS_SOURCE_REGISTRATION,
  useFactory: (): CreatorAnalyticsAggregationSource | null => {
    const source = createTrafficCreatorAnalyticsSource();
    registerCreatorAnalyticsSource(source);
    return source;
  },
};
