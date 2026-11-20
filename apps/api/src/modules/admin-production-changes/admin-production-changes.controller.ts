import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Inject, Injectable, Param, Post, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { productionChangeCreateSchema, productionChangeSaveSchema, productionChangeTransitionSchema } from "@toonstudio/contracts/admin-production-change";
import type { Response } from "express";
import { AdminProductionChangesRepository } from "./admin-production-changes.repository";
import { AdminProductionChangesCaptureService, PRODUCTION_CAPTURE_MAX_BYTES, type ProductionCaptureFile } from "./admin-production-changes-capture.service";

function actor(value: string | undefined): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new UnauthorizedException("로그인이 필요합니다.");
  return value;
}
function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try { return schema.parse(value); }
  catch { throw new BadRequestException("변경 요청의 입력 형식과 버전·요청 ID를 확인해 주세요."); }
}
@Injectable()
export class AdminProductionChangesUploadGuard implements CanActivate {
  constructor(@Inject(AdminProductionChangesRepository) private readonly repository: AdminProductionChangesRepository) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    await this.repository.assertWrite(actor(request.headers["x-user-id"]));
    return true;
  }
}

/** 보드 기록 전용 경로이며 실제 코드·배포·제작 데이터 실행 API는 제공하지 않는다. */
@Controller("admin/production-changes")
export class AdminProductionChangesController {
  constructor(@Inject(AdminProductionChangesRepository) private readonly repository: AdminProductionChangesRepository,
    @Inject(AdminProductionChangesCaptureService) private readonly captures: AdminProductionChangesCaptureService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  read(@Headers("x-user-id") userId?: string) { return this.repository.read(actor(userId)); }

  @Post()
  @HttpCode(201)
  @Header("Cache-Control", "private, no-store")
  create(@Body() body: unknown, @Headers("x-user-id") userId?: string) {
    return this.repository.create(actor(userId), parse(productionChangeCreateSchema, body));
  }

  @Post(":id/save")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  save(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    return this.repository.save(actor(userId), id, parse(productionChangeSaveSchema, body));
  }

  @Post(":id/transition")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  transition(@Param("id") id: string, @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    return this.repository.transition(actor(userId), id, parse(productionChangeTransitionSchema, body));
  }

  @Post("captures")
  @HttpCode(201)
  @UseGuards(AdminProductionChangesUploadGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: PRODUCTION_CAPTURE_MAX_BYTES, files: 1, fields: 0, parts: 2, fieldNameSize: 64 } }))
  @Header("Cache-Control", "private, no-store")
  upload(@UploadedFile() file: ProductionCaptureFile | undefined, @Headers("x-user-id") userId?: string) {
    return this.captures.upload(actor(userId), file);
  }

  @Get("captures/:id")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async capture(@Param("id") id: string, @Headers("x-user-id") userId: string | undefined, @Res() response: Response) {
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("Referrer-Policy", "no-referrer");
    return response.redirect(302, await this.captures.read(actor(userId), id));
  }
}
