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
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";

import { StudioAiMessagesDto } from "./studio-ai-messages.dto";
import { StudioAiChatDto } from "./studio-ai.dto";
import { StudioAiService } from "./studio-ai.service";

import type { Request, Response } from "express";

function loginRequired(): UnauthorizedException {
  return new UnauthorizedException({
    code: "FREE_AI_LOGIN_REQUIRED",
    message: "자동 무료 AI를 사용하려면 로그인하세요. 로그인하지 않으려면 개인 무료 API 키를 연결할 수 있습니다.",
    settingsHref: "/settings/ai",
  });
}

/** 클라이언트가 연결을 끊으면 진행 중인 외부 AI 요청도 취소한다. 같은 요청을 다른 제공자로 재전송하지 않는다. */
async function withClientAbort<T>(
  request: Request,
  response: Response,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const clientController = new AbortController();
  const abortForClientDisconnect = () => {
    if (!clientController.signal.aborted) clientController.abort();
  };
  const abortForResponseClose = () => {
    if (!response.writableEnded) abortForClientDisconnect();
  };

  request.once("aborted", abortForClientDisconnect);
  response.once("close", abortForResponseClose);
  if (request.aborted || response.destroyed) abortForClientDisconnect();

  try {
    return await run(clientController.signal);
  } finally {
    request.off("aborted", abortForClientDisconnect);
    response.off("close", abortForResponseClose);
  }
}

@Controller("studio-ai")
export class StudioAiController {
  constructor(@Inject(StudioAiService) private readonly studioAiService: StudioAiService) {}

  @Get("status")
  @Header("Cache-Control", "no-store, max-age=0")
  status() {
    return this.studioAiService.status();
  }

  @Post("chat")
  @HttpCode(HttpStatus.OK)
  async chat(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: StudioAiChatDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!userId) throw loginRequired();
    return withClientAbort(request, response, (signal) =>
      this.studioAiService.complete(userId, body, idempotencyKey, signal));
  }

  /** 키 없이 쓰는 보조 기능(이미지·구조화 출력 포함). 운영 고성능 경로 → 성능 순 무료 풀. */
  @Post("messages")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store, max-age=0")
  async messages(
    @Headers("x-user-id") userId: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: StudioAiMessagesDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (!userId) throw loginRequired();
    return withClientAbort(request, response, (signal) =>
      this.studioAiService.completeMessages(userId, body, idempotencyKey, signal));
  }
}
