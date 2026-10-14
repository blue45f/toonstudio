import {
  Body,
  Controller,
  ForbiddenException,
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
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import type { StudioWorkAssetUploadFile } from "../creator/studio-work-asset.service";
import {
  PRODUCTION_VOICE_COMMENTARY_MAX_BYTES,
  PRODUCTION_VOICE_COMMENTARY_METADATA_MAX_CHARS,
  ProductionVoiceCommentaryDeleteDto,
  ProductionVoiceCommentaryProjectEpisodeParamsDto,
  ProductionVoiceCommentaryQueryDto,
  ProductionVoiceCommentaryTrackParamsDto,
  ProductionVoiceCommentaryUploadBodyDto,
} from "./production-voice-commentary.dto";
import { ProductionVoiceCommentaryService } from "./production-voice-commentary.service";

function authenticatedProductionUserId(userId: string | undefined): string {
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

export const PRODUCTION_VOICE_COMMENTARY_UPLOAD_LIMITS = {
  fileSize: PRODUCTION_VOICE_COMMENTARY_MAX_BYTES,
  files: 1,
  fields: 1,
  fieldSize: PRODUCTION_VOICE_COMMENTARY_METADATA_MAX_CHARS,
  fieldNameSize: 64,
  parts: 3,
} as const;

@Controller("/production/projects/:projectId/episodes/:episodeId/voice-commentaries")
export class ProductionVoiceCommentaryController {
  constructor(
    @Inject(ProductionVoiceCommentaryService)
    private readonly service: ProductionVoiceCommentaryService,
  ) {}

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  @UseInterceptors(FileInterceptor("file", { limits: PRODUCTION_VOICE_COMMENTARY_UPLOAD_LIMITS }))
  create(
    @Param(new ZodValidationPipe(ProductionVoiceCommentaryProjectEpisodeParamsDto))
    params: ProductionVoiceCommentaryProjectEpisodeParamsDto,
    @Body(new ZodValidationPipe(ProductionVoiceCommentaryUploadBodyDto))
    body: ProductionVoiceCommentaryUploadBodyDto,
    @UploadedFile() file: StudioWorkAssetUploadFile | undefined,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.create(
      authenticatedProductionUserId(userId),
      params.projectId,
      params.episodeId,
      body.metadata,
      file,
    );
  }

  @Post("/query")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  list(
    @Param(new ZodValidationPipe(ProductionVoiceCommentaryProjectEpisodeParamsDto))
    params: ProductionVoiceCommentaryProjectEpisodeParamsDto,
    @Body(new ZodValidationPipe(ProductionVoiceCommentaryQueryDto))
    _body: ProductionVoiceCommentaryQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.list(authenticatedProductionUserId(userId), params.projectId, params.episodeId);
  }

  @Post(":trackId/read")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  signedRead(
    @Param(new ZodValidationPipe(ProductionVoiceCommentaryTrackParamsDto))
    params: ProductionVoiceCommentaryTrackParamsDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.signedRead(
      authenticatedProductionUserId(userId),
      params.projectId,
      params.episodeId,
      params.trackId,
    );
  }

  @Post(":trackId/delete")
  @HttpCode(200)
  @Header("Cache-Control", "private, no-store, max-age=0")
  delete(
    @Param(new ZodValidationPipe(ProductionVoiceCommentaryTrackParamsDto))
    params: ProductionVoiceCommentaryTrackParamsDto,
    @Body(new ZodValidationPipe(ProductionVoiceCommentaryDeleteDto))
    body: ProductionVoiceCommentaryDeleteDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.delete(
      authenticatedProductionUserId(userId),
      params.projectId,
      params.episodeId,
      params.trackId,
      body,
    );
  }
}
