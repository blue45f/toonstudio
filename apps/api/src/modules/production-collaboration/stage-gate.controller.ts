import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Post } from "@nestjs/common";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StageGateCommandSchema, StageGateListParamsDto, StageGateParamsDto } from "./stage-gate.dto";
import { StageGateRepository } from "./stage-gate.repository";

function actor(value: string | undefined): string {
  // Existing session middleware injects a verified user after removing client identity headers.
  if (!value) throw new ForbiddenException("로그인이 필요합니다.");
  return value;
}
@Controller("/production/projects/:projectId/episodes/:episodeId/stage-gates")
export class StageGateController {
  constructor(@Inject(StageGateRepository) private readonly repository: StageGateRepository) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Param(new ZodValidationPipe(StageGateListParamsDto)) params: StageGateListParamsDto,
    @Headers("x-user-id") userId?: string) {
    return this.repository.list(actor(userId), params.projectId, params.episodeId);
  }
  @Post("/:stageId/commands")
  @Header("Cache-Control", "private, no-store")
  command(@Param(new ZodValidationPipe(StageGateParamsDto)) params: StageGateParamsDto,
    @Body() body: unknown, @Headers("x-user-id") userId?: string) {
    const parsed = StageGateCommandSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("요청 형식이 올바르지 않습니다.");
    return this.repository.command(actor(userId), params.projectId, params.episodeId, params.stageId, parsed.data);
  }
}
