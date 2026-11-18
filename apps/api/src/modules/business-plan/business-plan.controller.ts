import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { getSessionAuthenticationPrincipal } from "../../session-middleware";
import { parseSaveBusinessPlanRequest } from "./business-plan.dto";
import { BusinessPlanRepository } from "./business-plan.repository";

function actor(request: Request, response: Response): string {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
  // 원본 헤더·본문의 userId는 권한 근거가 아니다. 기존 세션 미들웨어가 검증한 신원만 읽는다.
  const principal = getSessionAuthenticationPrincipal(request);
  const userId = principal?.userId;
  if (!userId || userId.trim() !== userId || userId.length > 255
    || [...userId].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new ForbiddenException("사업계획서 보드를 이용하려면 관리자 로그인이 필요합니다.");
  }
  return userId;
}

@Controller("admin/business-plan")
export class BusinessPlanController {
  constructor(@Inject(BusinessPlanRepository) private readonly repository: BusinessPlanRepository) {}

  @Get()
  read(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.repository.read(actor(request, response));
  }

  @Post("save")
  @HttpCode(200)
  save(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const userId = actor(request, response);
    return this.repository.save(userId, parseSaveBusinessPlanRequest(body));
  }
}
