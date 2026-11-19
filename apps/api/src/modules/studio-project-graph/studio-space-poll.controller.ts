import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, Post, Query } from "@nestjs/common";
import { studioSpacePollCommand, studioSpacePollScope, type StudioSpacePollCommand } from "@toonstudio/contracts/studio-space-poll";
import { createZodDto } from "nestjs-zod";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { authenticatedStudioUserId } from "./studio-project-graph.controller";
import { StudioWorkParamsDto } from "./studio-project-graph.dto";
import { StudioSpacePollRepository } from "./studio-space-poll.repository";

class PollScopeDto extends createZodDto(studioSpacePollScope) {}

@Controller("/studio-project-graph/works/:workId/space-poll")
export class StudioSpacePollController {
  constructor(@Inject(StudioSpacePollRepository) private readonly repository: StudioSpacePollRepository) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  current(@Param(new ZodValidationPipe(StudioWorkParamsDto)) params: StudioWorkParamsDto,
    @Query(new ZodValidationPipe(PollScopeDto)) query: PollScopeDto, @Headers("x-user-id") actor?: string) {
    return this.repository.readOrChange(authenticatedStudioUserId(actor), params.workId, query.world);
  }

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store")
  change(@Param(new ZodValidationPipe(StudioWorkParamsDto)) params: StudioWorkParamsDto,
    @Body(new ZodValidationPipe(createZodDto(studioSpacePollCommand))) command: StudioSpacePollCommand, @Headers("x-user-id") actor?: string) {
    return this.repository.readOrChange(authenticatedStudioUserId(actor), params.workId, command);
  }
}
