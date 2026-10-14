import {
  registerCreatorAnalyticsSource,
  type CreatorAnalyticsAggregationSource,
} from "./creator-analytics.service";
import { CatalogCreatorAnalyticsSeriesCatalog } from "./creator-analytics.series-catalog";
import { PostgresCreatorAnalyticsTrafficReader } from "./creator-analytics.traffic-repository";
import { TrafficCreatorAnalyticsSource } from "./creator-analytics.traffic-source";

// 실집계 소스 조립·등록.
//
// 트래픽 저장소가 Postgres일 때만 리더를 붙인다. D1 저장소 배포에서는 아직
// D1용 리더가 없어 소스를 등록하지 않고, 서비스는 기존대로 "연결 전"(404)을
// 유지한다 — 빈 저장소를 읽어 0을 실측처럼 내는 것보다 정직한 상태다.
export function createTrafficCreatorAnalyticsSource(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CreatorAnalyticsAggregationSource | null {
  const store = environment.TRAFFIC_ANALYTICS_STORE?.trim() || "postgres";
  if (store !== "postgres") return null;
  return new TrafficCreatorAnalyticsSource(
    new CatalogCreatorAnalyticsSeriesCatalog(),
    new PostgresCreatorAnalyticsTrafficReader(),
  );
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
