/**
 * research.controller.ts — 리서치 API 경계. studio-ai.controller.ts와 같은
 * x-user-id 헤더 인증 방식을 쓴다: 헤더가 없으면 로그인 요구 오류를 반환한다.
 * 입력 검증은 DTO 스키마(전역 Zod 파이프)가 controller 경계에서 수행한다.
 */
import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from "@nestjs/common";

import {
  ExistenceCheckDto,
  ResearchBriefDto,
  TrendDigestDto,
} from "./research.dto";
import { ResearchService } from "./research.service";

@Controller("research")
export class ResearchController {
  constructor(
    @Inject(ResearchService) private readonly researchService: ResearchService,
  ) {}

  @Get("status")
  @Header("Cache-Control", "no-store, max-age=0")
  status() {
    return this.researchService.status();
  }

  private requireUserId(userId: string | undefined): string {
    if (!userId) {
      throw new UnauthorizedException({
        code: "RESEARCH_LOGIN_REQUIRED",
        message: "리서치 기능을 사용하려면 로그인하세요.",
      });
    }
    return userId;
  }

  @Post("brief")
  @HttpCode(HttpStatus.OK)
  async brief(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ResearchBriefDto,
  ) {
    return this.researchService.brief(
      this.requireUserId(userId),
      body,
      idempotencyKey,
    );
  }

  @Post("existence-check")
  @HttpCode(HttpStatus.OK)
  async existenceCheck(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: ExistenceCheckDto,
  ) {
    return this.researchService.existenceCheck(
      this.requireUserId(userId),
      body,
      idempotencyKey,
    );
  }

  @Post("trend-digest")
  @HttpCode(HttpStatus.OK)
  async trendDigest(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: TrendDigestDto,
  ) {
    return this.researchService.trendDigest(
      this.requireUserId(userId),
      body,
      idempotencyKey,
    );
  }
}
