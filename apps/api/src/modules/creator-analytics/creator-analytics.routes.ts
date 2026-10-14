import type { CreatorAnalyticsResponse } from "./creator-analytics.dto";
import {
  CreatorAnalyticsBadRequestError,
  CreatorAnalyticsNotConnectedError,
  CreatorAnalyticsService,
} from "./creator-analytics.service";

/**
 * 창작자 애널리틱스 HTTP 엔드포인트 정의.
 *
 *   GET /api/creator/analytics?period=30d&seriesId=<id>
 *   GET /api/creator/analytics?period=30d&sample=1   (명시적 샘플 요청 전용)
 *
 * 프레임워크에 구애받지 않는 순수 핸들러다. Nest 표면인
 * `creator-analytics.controller.ts`의 `@Controller("creator/analytics")`가
 * 로그인 확인(401)을 마친 뒤 이 핸들러에 위임한다.
 *
 * 데이터 정직성:
 * - 실제 집계 소스가 연결돼 있으면 그 응답(200, mock:false)을 그대로 돌려준다.
 * - 연결 전이면 목 숫자를 200 으로 위장하지 않고 404 를 돌려준다.
 *   웹은 404 를 "연결 전" 상태로 표시하고 샘플 숫자를 보여 주지 않는다.
 * - 목 응답은 sample=1 을 명시한 요청에서만 나가며 mock:true 로 구분된다.
 */

export const CREATOR_ANALYTICS_ROUTE_PATH = "/api/creator/analytics";

export interface CreatorAnalyticsHttpResult {
  status: number;
  body: CreatorAnalyticsResponse | { message: string };
}

const service = new CreatorAnalyticsService();

function isSampleRequest(raw: unknown): boolean {
  return raw === "1" || raw === "true" || raw === true;
}

export async function handleCreatorAnalyticsRequest(query: {
  period?: unknown;
  seriesId?: unknown;
  sample?: unknown;
}): Promise<CreatorAnalyticsHttpResult> {
  const seriesId =
    typeof query.seriesId === "string" && query.seriesId.trim().length > 0
      ? query.seriesId.trim()
      : undefined;
  try {
    return {
      status: 200,
      body: await service.getAnalytics(query.period, seriesId, {
        allowSample: isSampleRequest(query.sample),
      }),
    };
  } catch (error) {
    if (
      error instanceof CreatorAnalyticsBadRequestError ||
      error instanceof CreatorAnalyticsNotConnectedError
    ) {
      return { status: error.statusCode, body: { message: error.message } };
    }
    throw error;
  }
}
