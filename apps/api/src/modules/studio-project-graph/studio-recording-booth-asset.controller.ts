import {
  Body,
  Controller,
  Header,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import {
  STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES,
  studioRecordingBoothAssetCreateSchema,
  studioRecordingBoothAssetDeleteSchema,
} from "@toonstudio/studio-project-model/recording-booth-asset";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import type { StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import { authenticatedStudioUserId } from "./studio-project-graph.controller";
import { StudioRecordingBoothAssetService } from "./studio-recording-booth-asset.service";

const id = z.string().trim().min(1).max(160);
class WorkParams extends createZodDto(z.object({ workId: id }).strict()) {}
class AssetParams extends createZodDto(z.object({ workId: id, assetId: id }).strict()) {}
class BoothAssetListDto extends createZodDto(z.object({}).strict()) {}
class BoothAssetDeleteDto extends createZodDto(studioRecordingBoothAssetDeleteSchema) {}
class BoothAssetUploadBodyDto extends createZodDto(z.object({
  metadata: z.string().max(16_384).transform((text, context) => {
    try { return studioRecordingBoothAssetCreateSchema.parse(JSON.parse(text)); }
    catch { context.addIssue({ code: "custom", message: "Invalid recording booth asset metadata" }); return z.NEVER; }
  }),
}).strict()) {}

export const STUDIO_RECORDING_BOOTH_ASSET_UPLOAD_LIMITS = {
  fileSize: STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES,
  files: 1,
  fields: 1,
  fieldSize: 16_384,
  fieldNameSize: 64,
  parts: 3,
} as const;

@Controller("/studio-project-graph/works/:workId/recording-booth-assets")
export class StudioRecordingBoothAssetController {
  constructor(@Inject(StudioRecordingBoothAssetService) private readonly service: StudioRecordingBoothAssetService) {}

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @UseInterceptors(FileInterceptor("file", { limits: STUDIO_RECORDING_BOOTH_ASSET_UPLOAD_LIMITS }))
  create(
    @Param(new ZodValidationPipe(WorkParams)) params: WorkParams,
    @Body(new ZodValidationPipe(BoothAssetUploadBodyDto)) body: BoothAssetUploadBodyDto,
    @UploadedFile() file: StudioWorkAssetUploadFile | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.create(authenticatedStudioUserId(userId), params.workId, body.metadata, file);
  }

  @Post("/query")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  list(
    @Param(new ZodValidationPipe(WorkParams)) params: WorkParams,
    @Body(new ZodValidationPipe(BoothAssetListDto)) _body: BoothAssetListDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.list(authenticatedStudioUserId(userId), params.workId);
  }

  @Post(":assetId/read")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  signedRead(
    @Param(new ZodValidationPipe(AssetParams)) params: AssetParams,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.signedRead(authenticatedStudioUserId(userId), params.workId, params.assetId);
  }

  @Post(":assetId/delete")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  delete(
    @Param(new ZodValidationPipe(AssetParams)) params: AssetParams,
    @Body(new ZodValidationPipe(BoothAssetDeleteDto)) body: BoothAssetDeleteDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.delete(authenticatedStudioUserId(userId), params.workId, params.assetId, body);
  }
}
