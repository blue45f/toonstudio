import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers, HttpCode, Inject, Injectable, Param, Post } from "@nestjs/common";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { StudioScopedWriteManagementCommandSchema, StudioScopedWritePolicySchema } from "@toonstudio/contracts/studio-scoped-write";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";
import { StudioScopedWriteRepository } from "./studio-scoped-write.repository";

class ScopedParamsDto extends createZodDto(z.object({ id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u) }).strict()) {}
class ScopedManagementDto extends createZodDto(StudioScopedWriteManagementCommandSchema) {}

@Injectable()
export class StudioScopedWriteService {
  constructor(@Inject(StudioScopedWriteRepository) private readonly repository: StudioScopedWriteRepository) {}
  async run(actor: string | undefined, workId: string, command?: ScopedManagementDto) {
    if (!actor) throw new ForbiddenException("로그인이 필요합니다.");
    try { return StudioScopedWritePolicySchema.parse(await (command ? this.repository.manage(actor, workId, command) : this.repository.read(actor, workId))); }
    catch (error) {
      if (error instanceof StudioScopedWriteDeniedError) throw new BadRequestException({ code: `studio_scoped_${error.code}`, message: error.message });
      throw error;
    }
  }
}

@Controller()
export class StudioScopedWriteController {
  constructor(@Inject(StudioScopedWriteService) private readonly service: StudioScopedWriteService) {}
  @Get("/creator/works/:id/scoped-write")
  @Header("Cache-Control", "private, no-store, max-age=0")
  read(@Param(new ZodValidationPipe(ScopedParamsDto)) params: ScopedParamsDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, params.id);
  }
  @Post("/creator/works/:id/scoped-write")
  @Header("Cache-Control", "private, no-store, max-age=0")
  @HttpCode(200)
  manage(@Param(new ZodValidationPipe(ScopedParamsDto)) params: ScopedParamsDto,
    @Body(new ZodValidationPipe(ScopedManagementDto)) input: ScopedManagementDto, @Headers("x-user-id") actor?: string) {
    return this.service.run(actor, params.id, input);
  }
}
