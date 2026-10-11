import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ZodSerializerDto } from "nestjs-zod";

import { STUDIO_LIVE_GUEST_CREDENTIAL_TTL_MS } from "@toonstudio/contracts/studio-live-auth-ticket";
import {
  isStudioLiveJamScope,
  studioRealtimeJamGuestActorId,
} from "@toonstudio/contracts/studio-live-jam-scope";
import {
  isStudioLiveProjectGuestSessionId,
  studioRealtimeProjectGuestActorId,
} from "@toonstudio/contracts/studio-live-project-guest";
import {
  getSessionAuthenticationPrincipal,
  getSessionAuthenticationSource,
} from "../../session-middleware";

import {
  IssueStudioRealtimeTicketDto,
  StudioRealtimeTicketResponseDto,
} from "./studio-realtime-ticket.dto";
import { StudioRealtimeTicketService } from "./studio-realtime-ticket.service";

import type { Request } from "express";

@Controller("studio-realtime")
export class StudioRealtimeTicketController {
  constructor(
    @Inject(StudioRealtimeTicketService)
    private readonly service: StudioRealtimeTicketService,
  ) {}

  @Post("tickets")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @Header("Pragma", "no-cache")
  @Header("Referrer-Policy", "no-referrer")
  @Header("Vary", "Origin")
  @ZodSerializerDto(StudioRealtimeTicketResponseDto)
  issue(
    @Req() request: Request,
    @Headers("origin") origin: string | undefined,
    @Body() body: IssueStudioRealtimeTicketDto,
  ): Promise<StudioRealtimeTicketResponseDto> {
    const source = getSessionAuthenticationSource(request);
    const principal = getSessionAuthenticationPrincipal(request);
    if (source === "cookie" && principal) {
      return this.service.issue(principal, origin, body);
    }
    if (source !== "header" && isStudioLiveJamScope(body.scope)) {
      return this.service.issue(
        {
          userId: studioRealtimeJamGuestActorId(body.sessionId),
          sessionVersion: 1,
          expiresAt: Date.now() + STUDIO_LIVE_GUEST_CREDENTIAL_TTL_MS,
        },
        origin,
        body,
      );
    }
    // 프로젝트 공간 게스트: 쿠키 세션이 없을 때만, 초대 자격 제시가
    // 있을 때만 동작한다. 여기서 만드는 principal은 자격 그 자체가
    // 아니라 게스트 세션 신원이며, 자격의 유효성은 인가 어댑터가
    // 발급 직전에 검증 저장소로 판정한다(실패는 일반 403으로 수렴).
    if (
      source !== "header" &&
      body.guestAccess &&
      isStudioLiveProjectGuestSessionId(body.guestAccess.guestSessionId) &&
      !isStudioLiveJamScope(body.scope)
    ) {
      return this.service.issue(
        {
          userId: studioRealtimeProjectGuestActorId(
            body.guestAccess.guestSessionId,
          ),
          sessionVersion: 1,
          expiresAt: Date.now() + STUDIO_LIVE_GUEST_CREDENTIAL_TTL_MS,
        },
        origin,
        body,
      );
    }
    throw new UnauthorizedException("로그인이 필요해요.");
  }
}
