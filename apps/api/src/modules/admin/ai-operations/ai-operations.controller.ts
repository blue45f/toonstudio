import {
  BadRequestException, Body, Controller, ForbiddenException, Get, Header,
  Headers, Inject, Post, UseGuards,
} from "@nestjs/common";
import { parseAiOperationsSave } from "@toonstudio/contracts/ai-operations";

import { AdminMutationGuard } from "../admin-mutation.guard";
import { AiOperationsRepository } from "./ai-operations.repository";

function authenticatedActor(value: string | undefined): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) {
    throw new ForbiddenException("관리자 로그인이 필요합니다.");
  }
  // sessionAuth가 검증 후 주입한 식별자만 사용한다. 역할은 저장소에서 다시 확인한다.
  return value;
}

@Controller("admin/ai-operations")
export class AiOperationsController {
  constructor(@Inject(AiOperationsRepository) private readonly repository: AiOperationsRepository) {}

  @Get()
  @Header("Cache-Control", "private, no-store, max-age=0")
  read(@Headers("x-user-id") userId?: string) {
    return this.repository.read(authenticatedActor(userId));
  }

  @Post()
  @UseGuards(AdminMutationGuard)
  @Header("Cache-Control", "private, no-store, max-age=0")
  save(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const actor = authenticatedActor(userId);
    let input;
    try {
      input = parseAiOperationsSave(body);
    } catch (cause) {
      throw new BadRequestException(cause instanceof Error ? cause.message : "운영 보드 입력 형식을 확인하세요.");
    }
    return this.repository.save(actor, input);
  }
}
