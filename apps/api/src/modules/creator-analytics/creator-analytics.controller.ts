import {
  Controller,
  Get,
  Header,
  Headers,
  Query,
  Res,
} from "@nestjs/common";

import { handleCreatorAnalyticsRequest } from "./creator-analytics.routes";

import type { Response } from "express";

// GET /api/creator/analytics — 창작자 애널리틱스 Nest 표면.
//
// 인증: 전역 세션 미들웨어(session-middleware.ts)가 서명된 세션 토큰을 검증해
// x-user-id 헤더를 실제 userId로 치환한다. 헤더가 없으면 비로그인이라 401 —
// 웹 클라이언트는 401/403을 샘플이 아닌 로그인 안내로 구분해 표시한다.
// 집계 자체는 순수 핸들러(handleCreatorAnalyticsRequest)에 위임한다.
@Controller("creator/analytics")
export class CreatorAnalyticsController {
  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  async getAnalytics(
    @Res() res: Response,
    @Headers("x-user-id") actor?: string,
    @Query("period") period?: string,
    @Query("seriesId") seriesId?: string,
    @Query("sample") sample?: string,
  ): Promise<Response> {
    if (!actor) {
      return res.status(401).json({ message: "로그인이 필요해요." });
    }
    const result = await handleCreatorAnalyticsRequest({
      period,
      seriesId,
      sample,
    });
    return res.status(result.status).json(result.body);
  }
}
