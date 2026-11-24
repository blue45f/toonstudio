import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";

import { getSessionAuthenticationPrincipal } from "../../session-middleware";
import { parseSaveFinalSubmissionRequest } from "./final-submission.dto";
import { FinalSubmissionRepository } from "./final-submission.repository";

function authenticatedActor(request: Request, response: Response): string {
  response.setHeader("Cache-Control", "private, no-store");
  response.setHeader("Pragma", "no-cache");
  const userId = getSessionAuthenticationPrincipal(request)?.userId;
  if (!userId || userId.trim() !== userId || userId.length > 255
    || [...userId].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new ForbiddenException("최종 제출 점검 보드는 관리자 로그인이 필요합니다.");
  }
  return userId;
}

/** 개인 점검 기록만 다룬다. 제출·첨부 교체·외부 계정·원본 문서 실행 경로는 없다. */
@Controller("admin/final-submission")
export class FinalSubmissionController {
  constructor(@Inject(FinalSubmissionRepository) private readonly repository: FinalSubmissionRepository) {}

  @Get()
  read(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.repository.read(authenticatedActor(request, response));
  }

  @Get("export")
  export(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    // 내보내기 때도 현재 세션과 DB의 활성 역할을 다시 확인한다.
    return this.repository.export(authenticatedActor(request, response));
  }

  @Post("save")
  @HttpCode(200)
  save(@Body() body: unknown, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const actor = authenticatedActor(request, response);
    return this.repository.save(actor, parseSaveFinalSubmissionRequest(body));
  }
}
