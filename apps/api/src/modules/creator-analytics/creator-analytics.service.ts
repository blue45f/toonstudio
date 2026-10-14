import type {
  CreatorAnalyticsPeriod,
  CreatorAnalyticsResponse,
} from "./creator-analytics.dto";
import { buildMockCreatorAnalytics } from "./creator-analytics.mock";
import { parseAnalyticsPeriod } from "./creator-analytics.math";

/** 잘못된 period 쿼리에 대한 400 에러. HTTP 어댑터가 statusCode 로 매핑한다. */
export class CreatorAnalyticsBadRequestError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "CreatorAnalyticsBadRequestError";
  }
}

/**
 * 실제 집계 소스가 아직 연결되지 않았을 때의 404 에러.
 * 목 숫자를 실제 지표처럼 200 으로 돌려주지 않기 위한 명시적 "연결 전" 신호다.
 * 웹 클라이언트는 404 를 notFound 로 받아 샘플 숫자가 없는 연결 전 상태를 보여 준다.
 */
export class CreatorAnalyticsNotConnectedError extends Error {
  readonly statusCode = 404;
  constructor(
    message = "실제 집계가 아직 연결되지 않았어요. 작품을 발행하고 독자 반응이 쌓이면 지표가 표시됩니다.",
  ) {
    super(message);
    this.name = "CreatorAnalyticsNotConnectedError";
  }
}

/**
 * 실제 집계 소스 계약. 실제로 집계하는 파이프라인이 이 인터페이스를 구현해
 * 등록하면, 라우트·DTO·웹 클라이언트 변경 없이 실집계로 전환된다.
 * 반환 페이로드는 mock:false 여야 하며, 서비스가 최종 응답에서도 mock:false 를 강제한다.
 * 실제 저장소 조회는 비동기라 Promise 반환을 허용한다(동기 반환도 그대로 동작).
 */
export interface CreatorAnalyticsAggregationSource {
  getAnalytics(
    period: CreatorAnalyticsPeriod,
    seriesId?: string,
  ): CreatorAnalyticsResponse | Promise<CreatorAnalyticsResponse>;
}

let registeredSource: CreatorAnalyticsAggregationSource | null = null;

/**
 * 서버 부트스트랩에서 실제 집계 소스를 연결한다. null 을 넘기면 연결을 해제한다.
 * 연결 전까지 서비스는 목을 돌려주지 않고 CreatorAnalyticsNotConnectedError 를 던진다.
 */
export function registerCreatorAnalyticsSource(
  source: CreatorAnalyticsAggregationSource | null,
): void {
  registeredSource = source;
}

export interface CreatorAnalyticsOptions {
  /**
   * 명시적 샘플 요청일 때만 true. 이 경우에만 목 응답(mock:true)을 허용한다.
   * 기본 요청에서는 절대 목 숫자를 실제 응답처럼 돌려주지 않는다.
   */
  allowSample?: boolean;
}

// PUBLISH T3: 창작자 애널리틱스 서비스.
// 실집계 연결 전에는 404(연결 전)를 돌려주고, 소스가 등록되면 그 응답을 그대로 전달한다.
// HTTP 표면은 creator-analytics.controller.ts(@Controller("creator/analytics"))가 담당한다.
export class CreatorAnalyticsService {
  constructor(
    private readonly source?: CreatorAnalyticsAggregationSource | null,
  ) {}

  async getAnalytics(
    periodRaw: unknown,
    seriesId?: string,
    options?: CreatorAnalyticsOptions,
  ): Promise<CreatorAnalyticsResponse> {
    const period = this.requirePeriod(periodRaw);
    const source = this.source ?? registeredSource;
    if (source) {
      const response = await source.getAnalytics(period, seriesId);
      // 소스가 목 표시를 달아 보내면 실제 집계가 아닌 것으로 보고 연결 전으로 처리한다.
      // 목 숫자를 mock:false 로 바꿔 실제 지표로 위장하는 일은 절대 하지 않는다.
      if (response.mock) throw new CreatorAnalyticsNotConnectedError();
      return response;
    }
    if (options?.allowSample) {
      return buildMockCreatorAnalytics(period, seriesId);
    }
    throw new CreatorAnalyticsNotConnectedError();
  }

  private requirePeriod(periodRaw: unknown): CreatorAnalyticsPeriod {
    const period = parseAnalyticsPeriod(periodRaw);
    if (period == null) {
      throw new CreatorAnalyticsBadRequestError(
        "period 는 7d, 30d, 90d 중 하나여야 해요.",
      );
    }
    return period;
  }
}
