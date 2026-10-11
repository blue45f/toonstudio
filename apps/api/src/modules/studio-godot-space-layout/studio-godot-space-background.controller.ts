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
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  GodotSpaceBackgroundAssetParamsSchema,
  GodotSpaceBackgroundWorkParamsSchema,
  type GodotSpaceBackgroundAssetParams,
  type GodotSpaceBackgroundDto,
  type GodotSpaceBackgroundWorkParams,
} from "./studio-godot-space-background.dto";
import { GODOT_SPACE_BACKGROUND_MAX_BYTES } from "./studio-godot-background-glb";
import {
  StudioGodotSpaceBackgroundService,
  type GodotSpaceBackgroundUploadFile,
} from "./studio-godot-space-background.service";

import type { Response } from "express";

/**
 * Godot 공간 배경 GLB 업로드·목록·서빙·삭제 경계.
 *
 * 업로드 검증(형식·Godot 로드 가능성·용량)은 서비스의 순수
 * 검증기가 판단한다. content는 assetId가 바뀌지 않는 한 내용이
 * 변하지 않으므로 장기 캐시를 허용한다 — 새 업로드는 항상 새
 * assetId를 발급한다.
 */
@Controller("creator/works/:workId/godot-space-backgrounds")
export class StudioGodotSpaceBackgroundController {
  constructor(
    @Inject(StudioGodotSpaceBackgroundService)
    private readonly backgroundService: StudioGodotSpaceBackgroundService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: GODOT_SPACE_BACKGROUND_MAX_BYTES,
        files: 1,
        fields: 0,
        fieldNameSize: 64,
        parts: 1,
      },
    }),
  )
  upload(
    @Param(new ZodValidationPipe(GodotSpaceBackgroundWorkParamsSchema))
    params: GodotSpaceBackgroundWorkParams,
    @UploadedFile() file: GodotSpaceBackgroundUploadFile | undefined,
    @Headers("x-user-id") userId?: string,
  ): Promise<GodotSpaceBackgroundDto> {
    return this.backgroundService.upload(userId, params.workId, file);
  }

  @Get()
  list(
    @Param(new ZodValidationPipe(GodotSpaceBackgroundWorkParamsSchema))
    params: GodotSpaceBackgroundWorkParams,
    @Headers("x-user-id") userId?: string,
  ): Promise<GodotSpaceBackgroundDto[]> {
    return this.backgroundService.list(userId, params.workId);
  }

  @Get(":assetId/content")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  async content(
    @Param(new ZodValidationPipe(GodotSpaceBackgroundAssetParamsSchema))
    params: GodotSpaceBackgroundAssetParams,
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
    @Param(new ZodValidationPipe(GodotSpaceBackgroundAssetParamsSchema))
    params: GodotSpaceBackgroundAssetParams,
    @Headers("x-user-id") userId?: string,
  ): Promise<{ deleted: true }> {
    return this.backgroundService.remove(userId, params.workId, params.assetId);
  }
}
