import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";

import {
  buildPipelineMatrix,
  calculateRoyaltyLedger,
  type PipelineMatrixResult,
  type RoyaltyLedgerAggregateResult,
} from "./production-division-os.analytics";
import {
  buildPartitionPlans,
  computeMasterManuscriptHash,
  decorateCutSlice,
  evaluateAdFiveChecks,
  STAGE_DEFAULT_ROLE,
  STUDIO_NO9_DEFAULT_TERMS,
  validateSlicesForStitch,
  type AdRegulationCheckSummary,
  type BinaryLockRecord,
  type CutSliceRecord,
  type CutSliceView,
  type QaInspectionRecord,
  type RoyaltyLedgerRecord,
} from "./production-division-os.domain";
import type {
  AcquireBinaryLockInput,
  DivisionSliceStatus,
  DivisionStageCode,
  DivisionTeamPreset,
  PartitionEpisodeSlicesInput,
  PipelineMatrixQueryInput,
  QaInspectSliceInput,
  ReleaseBinaryLockQueryInput,
  RoyaltyLedgerQueryInput,
  StitchSliceInput,
} from "./production-division-os.dto";
import type {
  ProductionDivisionOsRepositoryPort,
  QaLedgerAccrualInput,
} from "./production-division-os.memory-repository";
import { ProductionDivisionOsRepository } from "./production-division-os.repository";

export const DIVISION_OS_CLOCK = Symbol("DIVISION_OS_CLOCK");

export interface PartitionEpisodeSlicesResponse {
  readonly projectId: string;
  readonly episodeId: string;
  readonly stageCode: DivisionStageCode;
  readonly preset: DivisionTeamPreset;
  readonly totalCuts: number;
  readonly coverageComplete: boolean;
  readonly slices: readonly CutSliceView[];
}

export interface StitchSliceResponse {
  readonly projectId: string;
  readonly episodeId: string;
  readonly stageCode: DivisionStageCode;
  readonly masterManuscriptHash: string;
  readonly totalCuts: number;
  readonly cutRange: { readonly start: number; readonly end: number };
  readonly stitchedSliceIds: readonly string[];
  readonly alreadyStitched: boolean;
  readonly stitchedAt: string;
  readonly manifest: readonly {
    readonly sliceId: string;
    readonly cutStart: number;
    readonly cutEnd: number;
    readonly latestRevHash: string;
    readonly allowedFolders: readonly string[];
  }[];
}

export interface AcquireBinaryLockResponse {
  readonly lock: BinaryLockRecord;
  readonly assetFormat: string;
  readonly renewed: boolean;
  readonly evictedPreviousHolder: string | null;
  readonly expiredPreviousHolder: string | null;
}

export interface ReleaseBinaryLockResponse {
  readonly released: boolean;
  readonly assetKey: string;
  readonly projectId: string;
  readonly previousHolderUserId: string;
  readonly forcedByPd: boolean;
  readonly expiredReclaim: boolean;
  readonly releasedAt: string;
}

export interface QaInspectSliceResponse {
  readonly inspection: QaInspectionRecord;
  readonly qaSummary: AdRegulationCheckSummary;
  readonly slice: CutSliceRecord;
  readonly ledgerAccrual: {
    readonly accrued: boolean;
    readonly cutsAdded: number;
    readonly amountAddedKrw: number;
    readonly ledgerEntry: RoyaltyLedgerRecord | null;
  };
}

function detectAssetFormat(assetKey: string): string {
  const lastDot = assetKey.lastIndexOf(".");
  if (lastDot < 0 || lastDot === assetKey.length - 1) return "binary";
  return assetKey.slice(lastDot + 1).toLowerCase();
}

function isCoverageComplete(slices: readonly CutSliceRecord[], totalCuts: number): boolean {
  if (slices.length === 0 || totalCuts <= 0) return false;
  const sorted = [...slices].sort((a, b) => a.cutStart - b.cutStart);
  if (sorted[0]!.cutStart !== 1) return false;
  let cursor = sorted[0]!.cutEnd;
  for (let index = 1; index < sorted.length; index += 1) {
    const next = sorted[index]!;
    if (next.cutStart !== cursor + 1) return false;
    cursor = next.cutEnd;
  }
  return cursor === totalCuts;
}

@Injectable()
export class ProductionDivisionOsService {
  private readonly now: () => Date;

  constructor(
    @Inject(ProductionDivisionOsRepository)
    private readonly repository: ProductionDivisionOsRepositoryPort,
    @Optional()
    @Inject(DIVISION_OS_CLOCK)
    clock?: () => Date,
  ) {
    this.now = clock ?? (() => new Date());
  }

  /** 1. 컷 슬라이스 자동 분할 + 레이어 폴더 권위 부여 (PD/AD 전용). */
  async partitionEpisodeSlices(
    actorUserId: string,
    episodeId: string,
    input: PartitionEpisodeSlicesInput,
  ): Promise<PartitionEpisodeSlicesResponse> {
    const access = await this.repository.resolveActorAccess(actorUserId, input.projectId);
    if (!access.isPd && !access.isAd) {
      throw new ForbiddenException("컷 슬라이스 분할은 PD 또는 AD 권한이 필요합니다.");
    }

    const now = this.now();
    const { totalCuts, plans } = buildPartitionPlans(
      episodeId,
      input,
      now,
      (index, cutStart, cutEnd) =>
        `slice:${episodeId}:${input.stageCode}:${cutStart}-${cutEnd}:${index + 1}:${randomUUID().slice(0, 8)}`,
    );

    for (const plan of plans) {
      if (plan.cutEnd > totalCuts) {
        throw new BadRequestException(
          `슬라이스 종료 컷(${plan.cutEnd})이 회차 총 컷 수(${totalCuts})를 초과할 수 없습니다.`,
        );
      }
      if (input.stageCode !== "qa_final" && plan.allowedFolders.includes("99_AD_REDLINE")) {
        throw new BadRequestException(
          "99_AD_REDLINE 폴더 쓰기 권위는 qa_final 공정에서만 부여할 수 있습니다.",
        );
      }
    }

    const saved = await this.repository.savePartitionedSlices({
      projectId: input.projectId,
      episodeId,
      stageCode: input.stageCode,
      replaceExisting: input.replaceExisting,
      slices: plans,
      now,
    });

    const stageSlices = await this.repository.listSlicesByStage(
      input.projectId,
      episodeId,
      input.stageCode,
    );
    const effectiveTotalCuts = Math.max(
      totalCuts,
      stageSlices.reduce((max, item) => Math.max(max, item.cutEnd), 0),
    );

    return {
      projectId: input.projectId,
      episodeId,
      stageCode: input.stageCode,
      preset: input.preset,
      totalCuts: effectiveTotalCuts,
      coverageComplete: isCoverageComplete(stageSlices, effectiveTotalCuts),
      slices: saved.map((slice) => decorateCutSlice(slice, effectiveTotalCuts)),
    };
  }

  /** 2. 승인 슬라이스 검증 및 마스터 원고 무손실 합본 (PD/AD 전용). */
  async stitchSlice(
    actorUserId: string,
    sliceId: string,
    input: StitchSliceInput,
  ): Promise<StitchSliceResponse> {
    const anchor = await this.repository.getSliceById(sliceId);
    if (!anchor) {
      throw new NotFoundException("합본 대상 컷 슬라이스를 찾을 수 없습니다.");
    }
    if (input.projectId && input.projectId !== anchor.projectId) {
      throw new NotFoundException("해당 프로젝트에서 컷 슬라이스를 찾을 수 없습니다.");
    }

    const access = await this.repository.resolveActorAccess(actorUserId, anchor.projectId);
    if (!access.isPd && !access.isAd) {
      throw new ForbiddenException("마스터 원고 합본은 PD 또는 AD 권한이 필요합니다.");
    }

    let targetSlices: readonly CutSliceRecord[];
    if (input.sliceIds && input.sliceIds.length > 0) {
      const uniqueIds = [...new Set(input.sliceIds)];
      if (!uniqueIds.includes(sliceId)) {
        throw new BadRequestException("요청 경로의 sliceId가 sliceIds 목록에 포함되어야 합니다.");
      }
      const loaded = await this.repository.listSlicesByIds(uniqueIds);
      if (loaded.length !== uniqueIds.length) {
        throw new NotFoundException("지정한 슬라이스 중 존재하지 않는 항목이 있습니다.");
      }
      const mismatched = loaded.find(
        (item) =>
          item.projectId !== anchor.projectId ||
          item.episodeId !== anchor.episodeId ||
          item.stageCode !== anchor.stageCode,
      );
      if (mismatched) {
        throw new BadRequestException(
          "같은 프로젝트·회차·공정의 슬라이스만 함께 합본할 수 있습니다.",
        );
      }
      targetSlices = loaded;
    } else if (input.stitchWholeStage) {
      targetSlices = await this.repository.listSlicesByStage(
        anchor.projectId,
        anchor.episodeId,
        anchor.stageCode,
      );
    } else {
      targetSlices = [anchor];
    }

    const validation = validateSlicesForStitch(targetSlices, input.expectedTotalCuts);
    if (!validation.valid) {
      throw new ConflictException({
        code: "slice_stitch_precondition_failed",
        message: "미승인·리비전 누락·컷 누락 또는 겹침이 있어 마스터 원고를 합본할 수 없습니다.",
        unapprovedSliceIds: validation.unapprovedSliceIds,
        missingRevisionSliceIds: validation.missingRevisionSliceIds,
        missingCutRanges: validation.missingCutRanges,
        overlappingSlices: validation.overlappingSlices,
      });
    }

    const masterManuscriptHash = computeMasterManuscriptHash(
      anchor.projectId,
      anchor.episodeId,
      anchor.stageCode,
      validation.sortedSlices,
    );

    const now = this.now();
    const stitched = validation.alreadyStitched
      ? validation.sortedSlices
      : await this.repository.markSlicesStitched(
          validation.sortedSlices.map((item) => item.id),
          now,
        );

    return {
      projectId: anchor.projectId,
      episodeId: anchor.episodeId,
      stageCode: anchor.stageCode,
      masterManuscriptHash,
      totalCuts: validation.totalCuts,
      cutRange: { start: validation.cutStart, end: validation.cutEnd },
      stitchedSliceIds: stitched.map((item) => item.id),
      alreadyStitched: validation.alreadyStitched,
      stitchedAt: now.toISOString(),
      manifest: stitched.map((item) => ({
        sliceId: item.id,
        cutStart: item.cutStart,
        cutEnd: item.cutEnd,
        latestRevHash: item.latestRevHash!,
        allowedFolders: item.allowedFolders,
      })),
    };
  }

  /** 3-A. 바이너리 에셋 단독 체크아웃 잠금 획득 (편집 권한 필수, 강제 회수는 PD 전용). */
  async acquireBinaryLock(
    actorUserId: string,
    input: AcquireBinaryLockInput,
  ): Promise<AcquireBinaryLockResponse> {
    const access = await this.repository.resolveActorAccess(actorUserId, input.projectId);
    if (!access.edit) {
      throw new ForbiddenException("바이너리 에셋 체크아웃은 편집 권한이 필요합니다.");
    }
    if (input.forceTakeover && !access.isPd) {
      throw new ForbiddenException("활성 잠금 강제 회수는 PD 권한이 필요합니다.");
    }

    const result = await this.repository.acquireBinaryLock({
      projectId: input.projectId,
      assetKey: input.assetKey,
      holderUserId: actorUserId,
      lockReason: input.lockReason,
      ttlMinutes: input.ttlMinutes,
      forceTakeover: input.forceTakeover,
      canForceTakeover: access.isPd,
      now: this.now(),
    });

    return {
      lock: result.lock,
      assetFormat: detectAssetFormat(input.assetKey),
      renewed: result.renewed,
      evictedPreviousHolder: result.evictedPreviousHolder,
      expiredPreviousHolder: result.expiredPreviousHolder,
    };
  }

  /** 3-B. 바이너리 에셋 잠금 해제·만료 회수·PD 강제 회수. */
  async releaseBinaryLock(
    actorUserId: string,
    assetKey: string,
    query: ReleaseBinaryLockQueryInput,
  ): Promise<ReleaseBinaryLockResponse> {
    const existing = await this.repository.getBinaryLock(assetKey);
    if (!existing) {
      throw new NotFoundException("해당 에셋의 활성 잠금을 찾을 수 없습니다.");
    }
    if (query.projectId && query.projectId !== existing.projectId) {
      throw new NotFoundException("해당 프로젝트에서 에셋 잠금을 찾을 수 없습니다.");
    }

    const access = await this.repository.resolveActorAccess(actorUserId, existing.projectId);
    const now = this.now();
    const isHolder = existing.holderUserId === actorUserId;
    const isExpired = Date.parse(existing.expiresAt) <= now.getTime();

    if (!isHolder) {
      if (isExpired) {
        if (!access.edit && !access.isPd && !access.isAd) {
          throw new ForbiddenException("만료된 잠금 정리는 프로젝트 편집 권한이 필요합니다.");
        }
      } else {
        if (!access.isPd) {
          throw new ForbiddenException(
            "다른 작업자가 보유 중인 잠금은 본인 또는 PD만 회수할 수 있습니다.",
          );
        }
        if (query.force === false) {
          throw new ConflictException({
            code: "binary_lock_force_required",
            message: "타인의 활성 잠금을 해제하려면 force=true 옵션을 허용해야 합니다.",
            holderUserId: existing.holderUserId,
          });
        }
      }
    }

    await this.repository.releaseBinaryLock(assetKey);
    return {
      released: true,
      assetKey: existing.assetKey,
      projectId: existing.projectId,
      previousHolderUserId: existing.holderUserId,
      forcedByPd: !isHolder && !isExpired && access.isPd,
      expiredReclaim: !isHolder && isExpired,
      releasedAt: now.toISOString(),
    };
  }

  /** 4. AD 5종 자동 검수 저장 + 승인 시 정산 원장 컷수 자동 적립 (AD/PD 전용). */
  async inspectSliceQa(
    actorUserId: string,
    sliceId: string,
    input: QaInspectSliceInput,
  ): Promise<QaInspectSliceResponse> {
    const slice = await this.repository.getSliceById(sliceId);
    if (!slice) {
      throw new NotFoundException("검수 대상 컷 슬라이스를 찾을 수 없습니다.");
    }
    if (input.projectId && input.projectId !== slice.projectId) {
      throw new NotFoundException("해당 프로젝트에서 컷 슬라이스를 찾을 수 없습니다.");
    }

    const access = await this.repository.resolveActorAccess(actorUserId, slice.projectId);
    if (!access.isAd && !access.isPd) {
      throw new ForbiddenException("AD 5종 자동 검수 저장은 AD 또는 PD 권한이 필요합니다.");
    }

    const qaSummary = evaluateAdFiveChecks({
      paletteDriftMax: input.paletteDriftMax,
      lineWidthCv: input.lineWidthCv,
      colorscriptMoodDrift: input.colorscriptMoodDrift,
      mobile375Ok: input.mobile375Ok,
      rightsBomOk: input.rightsBomOk,
    });

    const verdict = input.verdict ?? qaSummary.recommendedVerdict;
    if (verdict === "approved" && qaSummary.hardBlockedForApproval) {
      throw new BadRequestException({
        code: "rights_bom_approval_blocked",
        message: "Rights BOM 미통과 슬라이스는 승인할 수 없습니다.",
        failedChecks: qaSummary.failedChecks,
      });
    }

    const nextSliceStatus: DivisionSliceStatus =
      verdict === "approved"
        ? slice.status === "stitched"
          ? "stitched"
          : "approved"
        : verdict === "conditional"
          ? "in_qa"
          : "retake";

    const payeeUserId = input.payeeUserId ?? slice.assigneeUserId;
    let ledgerAccrual: QaLedgerAccrualInput | null = null;
    if (verdict === "approved" && payeeUserId) {
      const roleCode = input.roleCode ?? STAGE_DEFAULT_ROLE[slice.stageCode];
      const settlementModel = input.settlementModel ?? "hybrid-base-plus-royalty";
      const defaults = STUDIO_NO9_DEFAULT_TERMS[roleCode];
      const perCutRateKrw = input.perCutRateKrw ?? defaults.perCutRateKrw;
      const defaultRoyaltyBps =
        settlementModel === "per-cut" || settlementModel === "flat" ? 0 : defaults.royaltyBps;
      const royaltyBps = input.royaltyBps ?? defaultRoyaltyBps;
      const cutsAdded = slice.cutEnd - slice.cutStart + 1;
      const baseAmountAddedKrw =
        settlementModel === "flat"
          ? (input.flatAmountKrw ?? cutsAdded * perCutRateKrw)
          : cutsAdded * perCutRateKrw;
      const mgAdvanceKrw = settlementModel === "mg-recoup-rs" ? (input.mgAdvanceKrw ?? 0) : 0;

      ledgerAccrual = {
        ledgerId: `ledger:${slice.projectId}:${slice.episodeId}:${payeeUserId}:${roleCode}`,
        projectId: slice.projectId,
        episodeId: slice.episodeId,
        payeeUserId,
        roleCode,
        settlementModel,
        cutsAdded,
        baseAmountAddedKrw,
        royaltyBps,
        mgAdvanceKrw,
        flatAmountKrw: input.flatAmountKrw,
      };
    }

    const result = await this.repository.recordQaInspectionAndAccrueLedger({
      inspectionId: `qa:${slice.id}:${randomUUID().slice(0, 12)}`,
      sliceId: slice.id,
      revisionHash: input.revisionHash,
      paletteDriftMax: input.paletteDriftMax,
      lineWidthCv: input.lineWidthCv,
      mobile375Ok: input.mobile375Ok,
      rightsBomOk: input.rightsBomOk,
      redlineStrokes: input.redlineStrokes,
      verdict,
      nextSliceStatus,
      reviewerUserId: actorUserId,
      now: this.now(),
      ledgerAccrual,
    });

    return {
      inspection: result.inspection,
      qaSummary,
      slice: result.slice,
      ledgerAccrual: {
        accrued: result.ledgerAccrued,
        cutsAdded: result.ledgerAccrued && ledgerAccrual ? ledgerAccrual.cutsAdded : 0,
        amountAddedKrw:
          result.ledgerAccrued && ledgerAccrual ? ledgerAccrual.baseAmountAddedKrw : 0,
        ledgerEntry: result.ledgerEntry,
      },
    };
  }

  /** 5. 5주 병렬 멀티 에피소드 매트릭스 + 병목 위험 요약. */
  async getPipelineMatrix(
    actorUserId: string,
    projectId: string,
    query: PipelineMatrixQueryInput,
  ): Promise<PipelineMatrixResult> {
    await this.repository.resolveActorAccess(actorUserId, projectId);
    const asOf = query.asOf ? new Date(query.asOf) : this.now();
    const [slices, activeLocksCount] = await Promise.all([
      this.repository.listProjectSlices(projectId),
      this.repository.countActiveLocks(projectId, asOf),
    ]);

    return buildPipelineMatrix({
      projectId,
      slices,
      activeLocksCount,
      weeks: query.weeks,
      episodeIds: query.episodeIds,
      asOf,
    });
  }

  /** 6. Studio No.9 하이브리드 인세 + 한국형 MG/RS 정산 원장 집계. */
  async getRoyaltyLedger(
    actorUserId: string,
    projectId: string,
    query: RoyaltyLedgerQueryInput,
  ): Promise<RoyaltyLedgerAggregateResult> {
    const access = await this.repository.resolveActorAccess(actorUserId, projectId);
    const canViewAll = access.isPd || access.isAd;
    if (!canViewAll && query.payeeUserId && query.payeeUserId !== actorUserId) {
      throw new ForbiddenException("타 작업자의 정산 원장은 PD 또는 AD만 조회할 수 있습니다.");
    }

    const entries = await this.repository.listProjectRoyaltyLedger({
      projectId,
      episodeId: query.episodeId,
      payeeUserId: canViewAll ? query.payeeUserId : actorUserId,
      settlementModel: query.settlementModel,
    });

    return calculateRoyaltyLedger({
      projectId,
      viewerScope: canViewAll ? "all" : "self",
      entries,
      grossRevenueKrw: query.grossRevenueKrw,
      platformFeeBps: query.platformFeeBps,
      withholdingTaxBps: query.withholdingTaxBps,
    });
  }
}
