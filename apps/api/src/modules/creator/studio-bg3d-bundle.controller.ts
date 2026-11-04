import { Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Put, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createZodDto } from "nestjs-zod";
import { z } from "zod";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import { StudioWorkAssetUploadGuard } from "./studio-asset-upload.guard";
import { StudioScopedAssetContextSchema } from "./studio-scoped-write-input";
import { STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES } from "./studio-bg3d-bundle.repository";
import { StudioBg3dBundleService } from "./studio-bg3d-bundle.service";
import type { StudioWorkAssetUploadFile } from "./studio-work-asset.service";

const id = z.string().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:~-]*$/u);
const keySchema = z.object({ id, bundleId: id, renderRevisionId: id }).strict();
export class StudioBg3dBundleParamsDto extends createZodDto(keySchema) {}
export class StudioBg3dBundleArtifactParamsDto extends createZodDto(keySchema.extend({ role: z.enum(STUDIO_BG3D_BUNDLE_ARTIFACT_ROLES) }).strict()) {}
export class PrepareStudioBg3dBundleDto extends createZodDto(z.object({ manifest: z.unknown(), writeContext: StudioScopedAssetContextSchema }).strict()) {}
export class StudioBg3dBundleMutationDto extends createZodDto(z.object({ writeContext: StudioScopedAssetContextSchema }).strict()) {}
const actor = (value?: string) => { if (!value) throw new ForbiddenException("로그인이 필요합니다."); return value; };
const key = (params: StudioBg3dBundleParamsDto) => ({ workId: params.id, bundleId: params.bundleId, renderRevisionId: params.renderRevisionId });

@Controller("/creator/works/:id/bg3d-bundles/:bundleId/revisions/:renderRevisionId")
export class StudioBg3dBundleController {
  constructor(@Inject(StudioBg3dBundleService) private readonly service: StudioBg3dBundleService) {}

  @Put()
  @UseGuards(StudioWorkAssetUploadGuard)
  prepare(@Param(new ZodValidationPipe(StudioBg3dBundleParamsDto)) params: StudioBg3dBundleParamsDto,
    @Body(new ZodValidationPipe(PrepareStudioBg3dBundleDto)) body: PrepareStudioBg3dBundleDto,
    @Headers("x-user-id") userId?: string) {
    return this.service.prepare(actor(userId), key(params), body.manifest, body.writeContext);
  }

  @Put("/artifacts/:role")
  @UseGuards(StudioWorkAssetUploadGuard)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 64 * 1024 * 1024, files: 1, fields: 1, fieldNameSize: 64, fieldSize: 16 * 1024, parts: 2 } }))
  upload(@Param(new ZodValidationPipe(StudioBg3dBundleArtifactParamsDto)) params: StudioBg3dBundleArtifactParamsDto,
    @Body(new ZodValidationPipe(StudioBg3dBundleMutationDto)) body: StudioBg3dBundleMutationDto,
    @UploadedFile() file: StudioWorkAssetUploadFile | undefined, @Headers("x-user-id") userId?: string) {
    return this.service.upload(actor(userId), key(params), params.role, file, body.writeContext);
  }

  @Put("/seal")
  @UseGuards(StudioWorkAssetUploadGuard)
  seal(@Param(new ZodValidationPipe(StudioBg3dBundleParamsDto)) params: StudioBg3dBundleParamsDto,
    @Body(new ZodValidationPipe(StudioBg3dBundleMutationDto)) body: StudioBg3dBundleMutationDto,
    @Headers("x-user-id") userId?: string) {
    return this.service.seal(actor(userId), key(params), body.writeContext);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  get(@Param(new ZodValidationPipe(StudioBg3dBundleParamsDto)) params: StudioBg3dBundleParamsDto,
    @Headers("x-user-id") userId?: string) {
    return this.service.get(actor(userId), key(params));
  }

  @Get("/artifacts/:role")
  @Header("Cache-Control", "private, no-store")
  download(@Param(new ZodValidationPipe(StudioBg3dBundleArtifactParamsDto)) params: StudioBg3dBundleArtifactParamsDto,
    @Headers("x-user-id") userId?: string) {
    return this.service.download(actor(userId), key(params), params.role);
  }
}

export class StudioBg3dBundleChainParamsDto extends createZodDto(z.object({ id, bundleId: id }).strict()) {}
export class StudioBg3dBundleWorkParamsDto extends createZodDto(z.object({ id }).strict()) {}
@Controller("/creator/works/:id/bg3d-bundles")
export class StudioBg3dBundleCapabilitiesController {
  constructor(@Inject(StudioBg3dBundleService) private readonly service: StudioBg3dBundleService) {}
  @Get("/:bundleId/sealed-chain")
  @Header("Cache-Control", "private, no-store")
  sealedChain(@Param(new ZodValidationPipe(StudioBg3dBundleChainParamsDto)) params: StudioBg3dBundleChainParamsDto,
    @Headers("x-user-id") userId?: string) { return this.service.sealedChain(actor(userId), { workId: params.id, bundleId: params.bundleId }); }
  @Get("/capabilities")
  @Header("Cache-Control", "private, no-store")
  capabilities(@Param(new ZodValidationPipe(StudioBg3dBundleWorkParamsDto)) params: StudioBg3dBundleWorkParamsDto,
    @Headers("x-user-id") userId?: string) { return this.service.capabilities(actor(userId), params.id); }
}
