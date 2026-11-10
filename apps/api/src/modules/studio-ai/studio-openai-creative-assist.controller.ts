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
} from "@nestjs/common";

import { StudioOpenAiCreativeAssistDto } from "./studio-openai-creative-assist.dto";
import { StudioOpenAiCreativeAssistService } from "./studio-openai-creative-assist.service";

import type { Request, Response } from "express";

function resolveActorKey(userId: string | undefined, request: Request): string {
  if (userId && userId.trim().length > 0) {
    return `user:${userId.trim()}`;
  }
  const edgeClientIp = request.header("x-toonstudio-client-ip")?.trim();
  if (edgeClientIp) return `ip:${edgeClientIp}`;
  return `ip:${request.ip || "local-anonymous"}`;
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
    const actor = resolveActorKey(userId, request);
    return withRequestAbort(request, response, (signal) =>
      this.assistService.assist(actor, body, { signal }),
    );
  }
}
