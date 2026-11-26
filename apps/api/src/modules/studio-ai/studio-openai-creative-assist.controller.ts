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

import { StudioApprovedDialogueReviewDto, StudioOpenAiCreativeAssistDto } from "./studio-openai-creative-assist.dto";
import { StudioOpenAiCreativeAssistService } from "./studio-openai-creative-assist.service";

import type { Request, Response } from "express";

function loginRequired(): UnauthorizedException {
  return new UnauthorizedException({
    code: "OPENAI_ASSIST_LOGIN_REQUIRED",
    message:
      "OpenAI 창작 도우미를 사용하려면 먼저 로그인해 주세요. 로그인하지 않아도 기획·원고 편집·내보내기는 그대로 사용할 수 있어요.",
    settingsHref: "/settings/ai",
  });
}

export function resolveOpenAiAssistActorKey(
  userId: string | undefined,
  _request?: Request,
): string {
  const normalizedUser = userId?.trim();
  if (!normalizedUser) {
    throw loginRequired();
  }
  return `user:${normalizedUser}`;
}

async function withRequestAbort<T>(
  request: Request,
  response: Response,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  const onClose = () => {
    if (!response.writableEnded) abort();
  };
  request.once("aborted", abort);
  response.once("close", onClose);
  // Node 24는 완료된 POST 본문도 소진한 뒤 destroyed로 표시한다.
  if (request.aborted || (response.destroyed && !response.writableEnded) || (request.destroyed && request.complete === false)) abort();

  try {
    return await run(controller.signal);
  } finally {
    request.off("aborted", abort);
    response.off("close", onClose);
  }
}

@Controller("studio-ai/openai-assist")
export class StudioOpenAiCreativeAssistController {
  constructor(
    @Inject(StudioOpenAiCreativeAssistService)
    private readonly assistService: StudioOpenAiCreativeAssistService,
  ) {}

  @Get("status")
  @Header("Cache-Control", "no-store, max-age=0")
  status() {
    return this.assistService.status();
  }

  @Get("free-quota-status")
  @Header("Cache-Control", "no-store, max-age=0")
  freeQuotaStatus() {
    return this.assistService.freeQuotaStatus();
  }

  @Post("approved-dialogue-review")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store, max-age=0")
  reviewApprovedDialogue(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: StudioApprovedDialogueReviewDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = resolveOpenAiAssistActorKey(userId, request);
    return withRequestAbort(request, response, (signal) =>
      this.assistService.reviewApprovedDialogue(actor, body, { signal }),
    );
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store, max-age=0")
  async assist(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: StudioOpenAiCreativeAssistDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = resolveOpenAiAssistActorKey(userId, request);
    return withRequestAbort(request, response, (signal) =>
      this.assistService.assist(actor, body, { signal }),
    );
  }
}

/**
 * ₩0 Fail-Closed 다중 무료 AI 상태·14모드 창작 보조 전용 컨트롤러.
 * 글로벌 프리픽스(`/api`)와 결합해 `GET /api/studio/ai/free-quota-status` 등을 제공한다.
 */
@Controller("studio/ai")
export class StudioFreeAiController {
  constructor(
    @Inject(StudioOpenAiCreativeAssistService)
    private readonly assistService: StudioOpenAiCreativeAssistService,
  ) {}

  @Get("free-quota-status")
  @Header("Cache-Control", "no-store, max-age=0")
  freeQuotaStatus() {
    return this.assistService.freeQuotaStatus();
  }

  @Get("modes")
  @Header("Cache-Control", "no-store, max-age=0")
  modes() {
    return this.assistService.listModes();
  }

  @Post("creative-assist")
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "no-store, max-age=0")
  async creativeAssist(
    @Headers("x-user-id") userId: string | undefined,
    @Body() body: StudioOpenAiCreativeAssistDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const normalizedUser = userId?.trim();
    const actor = normalizedUser ? `user:${normalizedUser}` : null;
    return withRequestAbort(request, response, (signal) =>
      this.assistService.assistWithZeroBillCascade(actor, body, {
        signal,
        // 미로그인 게스트는 서버 클라우드 무료 풀을 소비하지 않고 즉시 ₩0 로컬 코치로 처리한다.
        localOnly: actor === null,
      }),
    );
  }
}
