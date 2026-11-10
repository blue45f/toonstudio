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

import { StudioOpenAiCreativeAssistDto } from "./studio-openai-creative-assist.dto";
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
  if (request.aborted || request.destroyed) abort();

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
