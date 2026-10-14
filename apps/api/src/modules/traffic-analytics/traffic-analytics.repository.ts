import type {
  TrafficPageViewRecord,
  TrafficSessionRecord,
  TrafficShareEventRecord,
  TrafficWebVitalsRecord,
} from "./traffic-analytics-store";
import type { WebVitalsSample } from "./web-vitals-report";

export const TRAFFIC_ANALYTICS_REPOSITORY = Symbol("TRAFFIC_ANALYTICS_REPOSITORY");

export interface TrafficOverviewQuery {
  readonly start: Date;
  readonly now: Date;
  readonly days: number;
  readonly bucketSeconds: number;
  readonly retentionDays: number;
}

export interface TrafficPulseQuery {
  readonly fiveMinutesAgo: Date;
  readonly thirtyMinutesAgo: Date;
  readonly now: Date;
}

export interface TrafficWebVitalsQuery {
  readonly start: Date;
  readonly end: Date;
}

/** 수집·조회·보존 정책은 하나의 저장소를 선택하며 장애 시 다른 저장소에 쓰지 않는다. */
export interface TrafficAnalyticsRepository {
  persistPageView(input: { event: TrafficPageViewRecord; session: TrafficSessionRecord }): Promise<void>;
  persistHeartbeat(input: { session: TrafficSessionRecord }): Promise<void>;
  persistShareEvent(event: TrafficShareEventRecord): Promise<void>;
  persistWebVitals(record: TrafficWebVitalsRecord): Promise<void>;
  webVitalsSamples(query: TrafficWebVitalsQuery): Promise<readonly WebVitalsSample[]>;
  cleanup(retentionDays: number, now?: Date): Promise<void>;
  overview(query: TrafficOverviewQuery): Promise<Record<string, unknown>>;
  pulse(query: TrafficPulseQuery): Promise<Record<string, unknown>>;
  checkHealth(): Promise<boolean>;
}
