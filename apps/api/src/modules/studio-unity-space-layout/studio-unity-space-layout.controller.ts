import { Body, Controller, Get, Headers, Inject, Param, Put } from "@nestjs/common";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  UnitySpaceLayoutParamsSchema,
  SaveUnitySpaceLayoutBodySchema,
  type UnitySpaceLayoutDto,
  type UnitySpaceLayoutParams,
  type SaveUnitySpaceLayoutBody,
} from "./studio-unity-space-layout.dto";
import { StudioUnitySpaceLayoutService } from "./studio-unity-space-layout.service";

/**
 * Unity 가상스튜디오 공간 정의(월드 저작)의 조회·저장 경계.
 * 웹 셸이 소유자이고 Unity 무대는 이 정의의 소비자다.
 * 인증은 기존 creator 표면과 같은 x-user-id 헤더 규약을 쓴다.
 */
@Controller("creator/works/:workId/godot-space-layouts")
export class StudioUnitySpaceLayoutController {
  constructor(
    @Inject(StudioUnitySpaceLayoutService)
    private readonly layoutService: StudioUnitySpaceLayoutService,
  ) {}

  @Get(":spaceId")
  getLayout(
    @Param(new ZodValidationPipe(UnitySpaceLayoutParamsSchema)) params: UnitySpaceLayoutParams,
    @Headers("x-user-id") userId?: string,
  ): Promise<UnitySpaceLayoutDto> {
    return this.layoutService.getLayout(userId, params.workId, params.spaceId);
  }

  @Put(":spaceId")
  saveLayout(
    @Param(new ZodValidationPipe(UnitySpaceLayoutParamsSchema)) params: UnitySpaceLayoutParams,
    @Body(new ZodValidationPipe(SaveUnitySpaceLayoutBodySchema)) body: SaveUnitySpaceLayoutBody,
    @Headers("x-user-id") userId?: string,
  ): Promise<UnitySpaceLayoutDto> {
    return this.layoutService.saveLayout(userId, params.workId, params.spaceId, body);
  }
}
