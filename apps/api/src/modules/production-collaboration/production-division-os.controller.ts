import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";

import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  AcquireBinaryLockDto,
  EpisodePartitionParamsDto,
  PartitionEpisodeSlicesDto,
  PipelineMatrixQueryDto,
  ProjectDivisionParamsDto,
  QaInspectSliceDto,
  ReleaseBinaryLockParamsDto,
  ReleaseBinaryLockQueryDto,
  RoyaltyLedgerQueryDto,
  SliceParamsDto,
  StitchSliceDto,
} from "./production-division-os.dto";
import { ProductionDivisionOsService } from "./production-division-os.service";

function authenticatedProductionUserId(userId: string | undefined): string {
  // 세션 미들웨어가 클라이언트 위조 헤더를 제거한 뒤 검증된 사용자 ID를 주입한다.
  if (!userId) throw new ForbiddenException("로그인이 필요해요.");
  return userId;
}

@Controller("/production")
export class ProductionDivisionOsController {
  constructor(
    @Inject(ProductionDivisionOsService)
    private readonly service: ProductionDivisionOsService,
  ) {}

  @Post("/episodes/:episodeId/slices/partition")
  @Header("Cache-Control", "private, no-store, max-age=0")
  partitionEpisodeSlices(
    @Param(new ZodValidationPipe(EpisodePartitionParamsDto))
    params: EpisodePartitionParamsDto,
    @Body(new ZodValidationPipe(PartitionEpisodeSlicesDto))
    body: PartitionEpisodeSlicesDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.partitionEpisodeSlices(
      authenticatedProductionUserId(userId),
      params.episodeId,
      body,
    );
  }

  @Post("/slices/:sliceId/stitch")
  @Header("Cache-Control", "private, no-store, max-age=0")
  stitchSlice(
    @Param(new ZodValidationPipe(SliceParamsDto))
    params: SliceParamsDto,
    @Body(new ZodValidationPipe(StitchSliceDto))
    body: StitchSliceDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.stitchSlice(authenticatedProductionUserId(userId), params.sliceId, body);
  }

  @Post("/locks/acquire")
  @Header("Cache-Control", "private, no-store, max-age=0")
  acquireBinaryLock(
    @Body(new ZodValidationPipe(AcquireBinaryLockDto))
    body: AcquireBinaryLockDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.acquireBinaryLock(authenticatedProductionUserId(userId), body);
  }

  @Delete("/locks/:assetKey")
  @Header("Cache-Control", "private, no-store, max-age=0")
  releaseBinaryLock(
    @Param(new ZodValidationPipe(ReleaseBinaryLockParamsDto))
    params: ReleaseBinaryLockParamsDto,
    @Query(new ZodValidationPipe(ReleaseBinaryLockQueryDto))
    query: ReleaseBinaryLockQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.releaseBinaryLock(
      authenticatedProductionUserId(userId),
      params.assetKey,
      query,
    );
  }

  @Post("/slices/:sliceId/qa-inspect")
  @Header("Cache-Control", "private, no-store, max-age=0")
  inspectSliceQa(
    @Param(new ZodValidationPipe(SliceParamsDto))
    params: SliceParamsDto,
    @Body(new ZodValidationPipe(QaInspectSliceDto))
    body: QaInspectSliceDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.inspectSliceQa(
      authenticatedProductionUserId(userId),
      params.sliceId,
      body,
    );
  }

  @Get("/projects/:projectId/pipeline-matrix")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getPipelineMatrix(
    @Param(new ZodValidationPipe(ProjectDivisionParamsDto))
    params: ProjectDivisionParamsDto,
    @Query(new ZodValidationPipe(PipelineMatrixQueryDto))
    query: PipelineMatrixQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getPipelineMatrix(
      authenticatedProductionUserId(userId),
      params.projectId,
      query,
    );
  }

  @Get("/projects/:projectId/royalty-ledger")
  @Header("Cache-Control", "private, no-store, max-age=0")
  getRoyaltyLedger(
    @Param(new ZodValidationPipe(ProjectDivisionParamsDto))
    params: ProjectDivisionParamsDto,
    @Query(new ZodValidationPipe(RoyaltyLedgerQueryDto))
    query: RoyaltyLedgerQueryDto,
    @Headers("x-user-id") userId?: string,
  ) {
    return this.service.getRoyaltyLedger(
      authenticatedProductionUserId(userId),
      params.projectId,
      query,
    );
  }
}
