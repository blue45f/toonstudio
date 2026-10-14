import { Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Post, Query } from "@nestjs/common";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { PresenceParamsDto, PresenceSyncDto } from "./presence.dto";
import { PresenceService } from "./presence.service";

function actor(value: string | undefined): string {
  // Existing session middleware injects a verified user after removing client identity headers.
  if (!value) throw new ForbiddenException("로그인이 필요합니다.");
  return value;
}

/**
 * 프레즌스·세션 전송 엔드포인트.
 * - POST sync: 하트비트 왕복 하나로 내 프레즌스·라이브 뷰·세션을 올리고
 *   범위 전체의 합류 스냅샷을 받는다. 클라이언트 하트비트 주기(라이브 5초 /
 *   프레즌스 30초)에 맞춰 멱등하게 설계했다 — 같은 본문을 다시 보내도 같다.
 * - GET snapshot: 올릴 것이 없을 때의 읽기 전용 조회(재접속 직후 등).
 */
@Controller("/production/projects/:projectId/presence")
export class PresenceController {
  constructor(@Inject(PresenceService) private readonly service: PresenceService) {}

  @Post("/sync")
  @Header("Cache-Control", "private, no-store")
  sync(
    @Param(new ZodValidationPipe(PresenceParamsDto)) params: PresenceParamsDto,
    @Body(new ZodValidationPipe(PresenceSyncDto)) body: PresenceSyncDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.sync(actor(userId), params.projectId, body);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  snapshot(
    @Param(new ZodValidationPipe(PresenceParamsDto)) params: PresenceParamsDto,
    @Query("episodeId") episodeId: string,
    @Query("pageId") pageId: string,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.snapshot(actor(userId), params.projectId, episodeId, pageId);
  }
}
