import {
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { AuthenticatedUploadGuard } from "../creator/studio-asset-upload.guard";
import {
  UnitySpaceBackgroundAssetParamsSchema,
  UnitySpaceBackgroundWorkParamsSchema,
  type UnitySpaceBackgroundAssetParams,
  type UnitySpaceBackgroundDto,
  type UnitySpaceBackgroundWorkParams,
} from "./studio-unity-space-background.dto";
import { UNITY_SPACE_BACKGROUND_MAX_BYTES } from "./studio-unity-background-glb";
import {
  StudioUnitySpaceBackgroundService,
  type UnitySpaceBackgroundUploadFile,
} from "./studio-unity-space-background.service";

import type { Response } from "express";

/**
 * Unity 공간 배경 GLB 업로드·목록·서빙·삭제 경계.
 *
 * 업로드 검증(형식·Unity 로드 가능성·용량)은 서비스의 순수
 * 검증기가 판단한다. content는 assetId가 바뀌지 않는 한 내용이
 * 변하지 않으므로 장기 캐시를 허용한다 — 새 업로드는 항상 새
 * assetId를 발급한다.
 */
@Controller("creator/works/:workId/godot-space-backgrounds")
export class StudioUnitySpaceBackgroundController {
  constructor(
    @Inject(StudioUnitySpaceBackgroundService)
    private readonly backgroundService: StudioUnitySpaceBackgroundService,
  ) {}

  @Post()
  @UseGuards(AuthenticatedUploadGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: UNITY_SPACE_BACKGROUND_MAX_BYTES,
        files: 1,
        fields: 0,
        fieldNameSize: 64,
        parts: 1,
      },
    }),
  )
  upload(
    @Param(new ZodValidationPipe(UnitySpaceBackgroundWorkParamsSchema))
    params: UnitySpaceBackgroundWorkParams,
    @UploadedFile() file: UnitySpaceBackgroundUploadFile | undefined,
    @Headers("x-user-id") userId?: string,
  ): Promise<UnitySpaceBackgroundDto> {
    return this.backgroundService.upload(userId, params.workId, file);
  }

  @Get()
  list(
    @Param(new ZodValidationPipe(UnitySpaceBackgroundWorkParamsSchema))
    params: UnitySpaceBackgroundWorkParams,
    @Headers("x-user-id") userId?: string,
  ): Promise<UnitySpaceBackgroundDto[]> {
    return this.backgroundService.list(userId, params.workId);
  }

  @Get(":assetId/content")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async content(
    @Param(new ZodValidationPipe(UnitySpaceBackgroundAssetParamsSchema))
    params: UnitySpaceBackgroundAssetParams,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const content = await this.backgroundService.getContent(
      params.workId,
      params.assetId,
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("ETag", `"${content.sha256}"`);
    return new StreamableFile(content.payload, {
      type: "model/gltf-binary",
      length: content.byteSize,
      disposition: "inline",
    });
  }

  @Delete(":assetId")
  remove(
    @Param(new ZodValidationPipe(UnitySpaceBackgroundAssetParamsSchema))
    params: UnitySpaceBackgroundAssetParams,
    @Headers("x-user-id") userId?: string,
  ): Promise<{ deleted: true }> {
    return this.backgroundService.remove(userId, params.workId, params.assetId);
  }
}
