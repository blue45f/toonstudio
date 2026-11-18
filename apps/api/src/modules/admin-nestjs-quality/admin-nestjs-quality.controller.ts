import {
  BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Inject, Param,
  Post, UnauthorizedException,
} from "@nestjs/common";
import { parseNestBoardMutation, type NestBoardMutation } from "@toonstudio/contracts/admin-nestjs-quality";
import { AdminNestjsQualityRepository } from "./admin-nestjs-quality.repository";

function actor(userId?: string): string {
  if (!userId) throw new UnauthorizedException("로그인이 필요합니다.");
  return userId;
}

@Controller("admin/quality/nestjs")
export class AdminNestjsQualityController {
  constructor(@Inject(AdminNestjsQualityRepository) private readonly repository: AdminNestjsQualityRepository) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  read(@Headers("x-user-id") userId?: string) {
    return this.repository.read(actor(userId));
  }

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  save(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const actorId = actor(userId);
    let mutation: NestBoardMutation;
    try { mutation = parseNestBoardMutation(body, Date.now()); }
    catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "검증 보드의 형식을 확인해주세요.");
    }
    return this.repository.save(actorId, mutation);
  }

  @Get("history/:revision")
  @Header("Cache-Control", "private, no-store")
  history(@Param("revision") revision: string, @Headers("x-user-id") userId?: string) {
    const actorId = actor(userId);
    if (!/^[1-9]\d{0,9}$/u.test(revision) || Number(revision) > 2_147_483_647) {
      throw new BadRequestException("유효한 변경 이력 번호가 필요합니다.");
    }
    return this.repository.history(actorId, Number(revision));
  }
}
