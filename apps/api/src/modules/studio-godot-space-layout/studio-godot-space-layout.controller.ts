import { Body, Controller, Get, Headers, Inject, Param, Put } from "@nestjs/common";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  GodotSpaceLayoutParamsSchema,
  SaveGodotSpaceLayoutBodySchema,
  type GodotSpaceLayoutDto,
  type GodotSpaceLayoutParams,
  type SaveGodotSpaceLayoutBody,
} from "./studio-godot-space-layout.dto";
import { StudioGodotSpaceLayoutService } from "./studio-godot-space-layout.service";

/**
 * Godot 가상스튜디오 공간 정의(월드 저작)의 조회·저장 경계.
 * 웹 셸이 소유자이고 Godot 무대는 이 정의의 소비자다.
 * 인증은 기존 creator 표면과 같은 x-user-id 헤더 규약을 쓴다.
 */
@Controller("creator/works/:workId/godot-space-layouts")
export class StudioGodotSpaceLayoutController {
  constructor(
    @Inject(StudioGodotSpaceLayoutService)
    private readonly layoutService: StudioGodotSpaceLayoutService,
  ) {}

  @Get(":spaceId")
  getLayout(
    @Param(new ZodValidationPipe(GodotSpaceLayoutParamsSchema)) params: GodotSpaceLayoutParams,
    @Headers("x-user-id") userId?: string,
  ): Promise<GodotSpaceLayoutDto> {
    return this.layoutService.getLayout(userId, params.workId, params.spaceId);
  }

  @Put(":spaceId")
  saveLayout(
    @Param(new ZodValidationPipe(GodotSpaceLayoutParamsSchema)) params: GodotSpaceLayoutParams,
    @Body(new ZodValidationPipe(SaveGodotSpaceLayoutBodySchema)) body: SaveGodotSpaceLayoutBody,
    @Headers("x-user-id") userId?: string,
  ): Promise<GodotSpaceLayoutDto> {
    return this.layoutService.saveLayout(userId, params.workId, params.spaceId, body);
  }
}
