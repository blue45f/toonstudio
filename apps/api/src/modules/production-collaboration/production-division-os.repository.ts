import { and, asc, count, eq, gt, inArray, notInArray } from "drizzle-orm";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { ProductionProjectAggregate, ProductionRoleType } from "@toonstudio/core/production";

import {
  creatorWorkCollaborators,
  creatorWorks,
  db,
  productionBinaryLock,
  productionCutSlice,
  productionProjects,
  productionQaInspection,
  productionRoyaltyLedger,
  users,
  type ProductionBinaryLockRow,
  type ProductionCutSliceRow,
  type ProductionQaInspectionRow,
  type ProductionRoyaltyLedgerRow,
} from "../../platform/database";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";
import {
  detectCutRangeOverlaps,
  type BinaryLockRecord,
  type CutSliceRecord,
  type DivisionOsActorAccess,
  type DivisionOsActorRole,
  type QaInspectionRecord,
  type RoyaltyLedgerRecord,
} from "./production-division-os.domain";
import {
  DIVISION_LAYER_FOLDERS,
  DIVISION_LEDGER_STATUSES,
  DIVISION_QA_VERDICTS,
  DIVISION_ROLE_CODES,
  DIVISION_SETTLEMENT_MODELS,
  DIVISION_SLICE_STATUSES,
  DIVISION_STAGE_CODES,
  type DivisionLayerFolder,
  type DivisionLedgerStatus,
  type DivisionQaVerdict,
  type DivisionRoleCode,
  type DivisionSettlementModel,
  type DivisionSliceStatus,
  type DivisionStageCode,
} from "./production-division-os.dto";
import {
  InMemoryProductionDivisionOsRepository,
  type AcquireBinaryLockParams,
  type AcquireBinaryLockResult,
  type ListRoyaltyLedgerFilter,
  type ProductionDivisionOsRepositoryPort,
  type RecordQaInspectionParams,
  type RecordQaInspectionResult,
  type SavePartitionedSlicesParams,
} from "./production-division-os.memory-repository";

function isInEnum<T extends string>(values: readonly T[], candidate: string): candidate is T {
  return (values as readonly string[]).includes(candidate);
}

function mapRoleTypeToDivisionRole(roleType: ProductionRoleType): DivisionOsActorRole {
  switch (roleType) {
    case "producer":
      return "pd";
    case "art-lead":
    case "editor":
    case "rights-reviewer":
      return "art_director";
    case "story-lead":
    case "writer":
    case "adaptation-writer":
    case "associate-writer":
      return "writer";
    case "storyboard-artist":
      return "storyboard";
    case "background-artist":
    case "background-assistant":
      return "bg3d";
    case "line-artist":
    case "line-assistant":
    case "associate-artist":
    case "assistant":
    case "vendor":
      return "line";
    case "flat-color-assistant":
      return "flat";
    case "colorist":
    case "shading-assistant":
      return "shade";
    case "letterer":
    case "lettering-assistant":
    case "effect-assistant":
    case "localizer":
      return "finishing_lettering";
  }
}

function mapCutSliceRow(row: ProductionCutSliceRow): CutSliceRecord {
  const stageCode: DivisionStageCode = isInEnum(DIVISION_STAGE_CODES, row.stageCode)
    ? row.stageCode
    : "line";
  const status: DivisionSliceStatus = isInEnum(DIVISION_SLICE_STATUSES, row.status)
    ? row.status
    : "assigned";
  const allowedFolders: DivisionLayerFolder[] = Array.isArray(row.allowedFolders)
    ? row.allowedFolders.filter((entry): entry is DivisionLayerFolder =>
        isInEnum(DIVISION_LAYER_FOLDERS, entry),
      )
    : [];

  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    stageCode,
    cutStart: row.cutStart,
    cutEnd: row.cutEnd,
    allowedFolders,
    assigneeUserId: row.assigneeUserId ?? null,
    status,
    leaseExpiresAt: row.leaseExpiresAt ? row.leaseExpiresAt.toISOString() : null,
    latestRevHash: row.latestRevHash ?? null,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapBinaryLockRow(row: ProductionBinaryLockRow): BinaryLockRecord {
  return {
    assetKey: row.assetKey,
    projectId: row.projectId,
    holderUserId: row.holderUserId,
    lockReason: row.lockReason,
    lockedAt: row.lockedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

function mapQaInspectionRow(row: ProductionQaInspectionRow): QaInspectionRecord {
  const verdict: DivisionQaVerdict = isInEnum(DIVISION_QA_VERDICTS, row.verdict)
    ? row.verdict
    : "retake";
  return {
    id: row.id,
    cutSliceId: row.cutSliceId,
    revisionHash: row.revisionHash,
    paletteDriftMax: Number(row.paletteDriftMax),
    lineWidthCv: Number(row.lineWidthCv),
    mobile375Ok: row.mobile375Ok,
    rightsBomOk: row.rightsBomOk,
    redlineStrokes: Array.isArray(row.redlineStrokes) ? row.redlineStrokes : [],
    verdict,
    reviewerUserId: row.reviewerUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapRoyaltyLedgerRow(row: ProductionRoyaltyLedgerRow): RoyaltyLedgerRecord {
  const roleCode: DivisionRoleCode = isInEnum(DIVISION_ROLE_CODES, row.roleCode)
    ? row.roleCode
    : "line";
  const settlementModel: DivisionSettlementModel = isInEnum(
    DIVISION_SETTLEMENT_MODELS,
    row.settlementModel,
  )
    ? row.settlementModel
    : "hybrid-base-plus-royalty";
  const status: DivisionLedgerStatus = isInEnum(DIVISION_LEDGER_STATUSES, row.status)
    ? row.status
    : "accruing";

  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    payeeUserId: row.payeeUserId,
    roleCode,
    settlementModel,
    approvedCuts: row.approvedCuts,
    baseAmountKrw: Number(row.baseAmountKrw),
    royaltyBps: row.royaltyBps,
    mgBalanceKrw: Number(row.mgBalanceKrw),
    status,
    settledAt: row.settledAt ? row.settledAt.toISOString() : null,
  };
}

/**
 * 산업형 분업 OS 영속 저장소.
 * 기본 런타임에서는 PostgreSQL(Drizzle)을 권위 원장으로 사용하며,
 * 명시적 폴백 설정 또는 테스트 주입 시 인메모리 저장소로 동일 계약을 수행한다.
 */
@Injectable()
export class ProductionDivisionOsRepository implements ProductionDivisionOsRepositoryPort {
  private readonly memoryFallback: InMemoryProductionDivisionOsRepository | null;

  constructor(@Optional() memoryFallback?: InMemoryProductionDivisionOsRepository) {
    this.memoryFallback =
      memoryFallback ??
      (process.env.PRODUCTION_DIVISION_OS_MEMORY_FALLBACK === "true"
        ? new InMemoryProductionDivisionOsRepository()
        : null);
  }

  async resolveActorAccess(actorUserId: string, projectId: string): Promise<DivisionOsActorAccess> {
    if (this.memoryFallback) {
      return this.memoryFallback.resolveActorAccess(actorUserId, projectId);
    }

    const projectRows = await db
      .select({
        id: productionProjects.id,
        workId: productionProjects.workId,
        aggregate: productionProjects.aggregate,
      })
      .from(productionProjects)
      .where(eq(productionProjects.id, projectId))
      .limit(1);
    const project = projectRows[0];
    if (!project) {
      throw new NotFoundException("제작 프로젝트를 찾을 수 없습니다.");
    }

    const userRows = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, actorUserId))
      .limit(1);
    if (userRows[0]?.status !== "active") {
      throw new ForbiddenException("활성 사용자 계정만 접근할 수 있습니다.");
    }

    const workRows = await db
      .select({
        ownerUserId: creatorWorks.userId,
        membershipRole: creatorWorkCollaborators.role,
        membershipStatus: creatorWorkCollaborators.status,
      })
      .from(creatorWorks)
      .leftJoin(
        creatorWorkCollaborators,
        and(
          eq(creatorWorkCollaborators.workId, creatorWorks.id),
          eq(creatorWorkCollaborators.userId, actorUserId),
        ),
      )
      .where(eq(creatorWorks.id, project.workId))
      .limit(1);

    const work = workRows[0];
    if (!work) {
      throw new ForbiddenException("연결된 작품 접근 권한이 없습니다.");
    }

    const access = resolveCreatorCollaborationAccess({
      actorUserId,
      ownerUserId: work.ownerUserId,
      membership: work.membershipRole
        ? {
            userId: actorUserId,
            role: work.membershipRole,
            status: work.membershipStatus,
          }
        : null,
    });
    if (!access.view) {
      throw new ForbiddenException("프로젝트 접근 권한이 없습니다.");
    }

    const aggregate = project.aggregate as ProductionProjectAggregate | null;
    const actorPartyIds = new Set(
      (aggregate?.parties ?? [])
        .filter((party) => party.accountUserId === actorUserId && party.status === "active")
        .map((party) => party.id),
    );
    const activeRoles = (aggregate?.assignments ?? [])
      .filter((assignment) => assignment.status === "active" && actorPartyIds.has(assignment.partyId))
      .map((assignment) => assignment.roleType);

    const roleSet = new Set<DivisionOsActorRole>(
      activeRoles.map((roleType) => mapRoleTypeToDivisionRole(roleType)),
    );
    if (access.manageMembers) roleSet.add("pd");
    if (roleSet.size === 0) roleSet.add(access.edit ? "line" : "viewer");

    const isPd = access.manageMembers || roleSet.has("pd");
    const isAd = roleSet.has("art_director");

    return {
      actorUserId,
      projectId,
      view: access.view,
      edit: access.edit,
      isPd,
      isAd,
      roleCodes: [...roleSet],
    };
  }

  async listSlicesByStage(
    projectId: string,
    episodeId: string,
    stageCode: DivisionStageCode,
  ): Promise<readonly CutSliceRecord[]> {
    if (this.memoryFallback) {
      return this.memoryFallback.listSlicesByStage(projectId, episodeId, stageCode);
    }
    const rows = await db
      .select()
      .from(productionCutSlice)
      .where(
        and(
          eq(productionCutSlice.projectId, projectId),
          eq(productionCutSlice.episodeId, episodeId),
          eq(productionCutSlice.stageCode, stageCode),
        ),
      )
      .orderBy(asc(productionCutSlice.cutStart));
    return rows.map(mapCutSliceRow);
  }

  async savePartitionedSlices(
    params: SavePartitionedSlicesParams,
  ): Promise<readonly CutSliceRecord[]> {
    if (this.memoryFallback) {
      return this.memoryFallback.savePartitionedSlices(params);
    }

    return db.transaction(async (transaction) => {
      const existingRows = await transaction
        .select()
        .from(productionCutSlice)
        .where(
          and(
            eq(productionCutSlice.projectId, params.projectId),
            eq(productionCutSlice.episodeId, params.episodeId),
            eq(productionCutSlice.stageCode, params.stageCode),
          ),
        )
        .for("update");
      const existing = existingRows.map(mapCutSliceRow);
      const preserved = params.replaceExisting
        ? existing.filter((slice) => slice.status === "approved" || slice.status === "stitched")
        : existing;

      const overlaps = detectCutRangeOverlaps(params.slices, preserved);
      if (overlaps.length > 0) {
        throw new ConflictException({
          code: "cut_slice_overlap",
          message: "요청한 컷 범위가 기존 또는 다른 슬라이스와 겹칩니다.",
          overlaps,
        });
      }

      if (params.replaceExisting) {
        await transaction
          .delete(productionCutSlice)
          .where(
            and(
              eq(productionCutSlice.projectId, params.projectId),
              eq(productionCutSlice.episodeId, params.episodeId),
              eq(productionCutSlice.stageCode, params.stageCode),
              notInArray(productionCutSlice.status, ["approved", "stitched"]),
            ),
          );
      }

      const inserted = await transaction
        .insert(productionCutSlice)
        .values(
          params.slices.map((draft) => ({
            id: draft.id,
            projectId: params.projectId,
            episodeId: params.episodeId,
            stageCode: params.stageCode,
            cutStart: draft.cutStart,
            cutEnd: draft.cutEnd,
            allowedFolders: [...draft.allowedFolders],
            assigneeUserId: draft.assigneeUserId,
            status: "assigned",
            leaseExpiresAt: draft.leaseExpiresAt,
            latestRevHash: null,
            dueAt: draft.dueAt,
            updatedAt: params.now,
          })),
        )
        .returning();

      return inserted.map(mapCutSliceRow).sort((a, b) => a.cutStart - b.cutStart);
    });
  }

  async getSliceById(sliceId: string): Promise<CutSliceRecord | null> {
    if (this.memoryFallback) {
      return this.memoryFallback.getSliceById(sliceId);
    }
    const rows = await db
      .select()
      .from(productionCutSlice)
      .where(eq(productionCutSlice.id, sliceId))
      .limit(1);
    return rows[0] ? mapCutSliceRow(rows[0]) : null;
  }

  async listSlicesByIds(sliceIds: readonly string[]): Promise<readonly CutSliceRecord[]> {
    if (this.memoryFallback) {
      return this.memoryFallback.listSlicesByIds(sliceIds);
    }
    if (sliceIds.length === 0) return [];
    const rows = await db
      .select()
      .from(productionCutSlice)
      .where(inArray(productionCutSlice.id, [...sliceIds]))
      .orderBy(asc(productionCutSlice.cutStart));
    return rows.map(mapCutSliceRow);
  }

  async markSlicesStitched(
    sliceIds: readonly string[],
    now: Date,
  ): Promise<readonly CutSliceRecord[]> {
    if (this.memoryFallback) {
      return this.memoryFallback.markSlicesStitched(sliceIds, now);
    }
    if (sliceIds.length === 0) return [];
    return db.transaction(async (transaction) => {
      const updated = await transaction
        .update(productionCutSlice)
        .set({ status: "stitched", updatedAt: now })
        .where(inArray(productionCutSlice.id, [...sliceIds]))
        .returning();
      return updated.map(mapCutSliceRow).sort((a, b) => a.cutStart - b.cutStart);
    });
  }

  async acquireBinaryLock(params: AcquireBinaryLockParams): Promise<AcquireBinaryLockResult> {
    if (this.memoryFallback) {
      return this.memoryFallback.acquireBinaryLock(params);
    }
    return db.transaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(productionBinaryLock)
        .where(eq(productionBinaryLock.assetKey, params.assetKey))
        .limit(1)
        .for("update");
      const existing = rows[0];
      const expiresAt = new Date(params.now.getTime() + params.ttlMinutes * 60_000);

      let renewed = false;
      let evictedPreviousHolder: string | null = null;
      let expiredPreviousHolder: string | null = null;

      if (existing) {
        const isExpired = existing.expiresAt.getTime() <= params.now.getTime();
        if (isExpired) {
          expiredPreviousHolder = existing.holderUserId;
        } else if (
          existing.holderUserId === params.holderUserId &&
          existing.projectId === params.projectId
        ) {
          renewed = true;
        } else if (params.forceTakeover) {
          if (!params.canForceTakeover) {
            throw new ForbiddenException("활성 잠금 강제 회수는 PD 권한이 필요합니다.");
          }
          evictedPreviousHolder = existing.holderUserId;
        } else {
          throw new ConflictException({
            code: "binary_lock_conflict",
            message: "다른 작업자가 해당 바이너리 에셋을 단독 체크아웃 중입니다.",
            assetKey: existing.assetKey,
            holderUserId: existing.holderUserId,
            lockReason: existing.lockReason,
            expiresAt: existing.expiresAt.toISOString(),
          });
        }

        const updated = await transaction
          .update(productionBinaryLock)
          .set({
            projectId: params.projectId,
            holderUserId: params.holderUserId,
            lockReason: params.lockReason,
            lockedAt: params.now,
            expiresAt,
          })
          .where(eq(productionBinaryLock.assetKey, params.assetKey))
          .returning();
        return {
          lock: mapBinaryLockRow(updated[0]!),
          renewed,
          evictedPreviousHolder,
          expiredPreviousHolder,
        };
      }

      const inserted = await transaction
        .insert(productionBinaryLock)
        .values({
          assetKey: params.assetKey,
          projectId: params.projectId,
          holderUserId: params.holderUserId,
          lockReason: params.lockReason,
          lockedAt: params.now,
          expiresAt,
        })
        .returning();
      return {
        lock: mapBinaryLockRow(inserted[0]!),
        renewed: false,
        evictedPreviousHolder: null,
        expiredPreviousHolder: null,
      };
    });
  }

  async getBinaryLock(assetKey: string): Promise<BinaryLockRecord | null> {
    if (this.memoryFallback) {
      return this.memoryFallback.getBinaryLock(assetKey);
    }
    const rows = await db
      .select()
      .from(productionBinaryLock)
      .where(eq(productionBinaryLock.assetKey, assetKey))
      .limit(1);
    return rows[0] ? mapBinaryLockRow(rows[0]) : null;
  }

  async releaseBinaryLock(assetKey: string): Promise<boolean> {
    if (this.memoryFallback) {
      return this.memoryFallback.releaseBinaryLock(assetKey);
    }
    const deleted = await db
      .delete(productionBinaryLock)
      .where(eq(productionBinaryLock.assetKey, assetKey))
      .returning({ assetKey: productionBinaryLock.assetKey });
    return deleted.length > 0;
  }

  async recordQaInspectionAndAccrueLedger(
    params: RecordQaInspectionParams,
  ): Promise<RecordQaInspectionResult> {
    if (this.memoryFallback) {
      return this.memoryFallback.recordQaInspectionAndAccrueLedger(params);
    }

    return db.transaction(async (transaction) => {
      const sliceRows = await transaction
        .select()
        .from(productionCutSlice)
        .where(eq(productionCutSlice.id, params.sliceId))
        .limit(1)
        .for("update");
      const existingSlice = sliceRows[0];
      if (!existingSlice) {
        throw new NotFoundException("컷 슬라이스를 찾을 수 없습니다.");
      }

      const wasAlreadyApproved =
        existingSlice.status === "approved" || existingSlice.status === "stitched";

      const insertedInspection = await transaction
        .insert(productionQaInspection)
        .values({
          id: params.inspectionId,
          cutSliceId: params.sliceId,
          revisionHash: params.revisionHash,
          paletteDriftMax: params.paletteDriftMax,
          lineWidthCv: params.lineWidthCv,
          mobile375Ok: params.mobile375Ok,
          rightsBomOk: params.rightsBomOk,
          redlineStrokes: [...params.redlineStrokes],
          verdict: params.verdict,
          reviewerUserId: params.reviewerUserId,
          createdAt: params.now,
        })
        .returning();

      const updatedSlices = await transaction
        .update(productionCutSlice)
        .set({
          status: params.nextSliceStatus,
          latestRevHash: params.revisionHash,
          updatedAt: params.now,
        })
        .where(eq(productionCutSlice.id, params.sliceId))
        .returning();

      let ledgerEntry: RoyaltyLedgerRecord | null = null;
      let ledgerAccrued = false;

      if (params.verdict === "approved" && !wasAlreadyApproved && params.ledgerAccrual) {
        const accrual = params.ledgerAccrual;
        const ledgerRows = await transaction
          .select()
          .from(productionRoyaltyLedger)
          .where(
            and(
              eq(productionRoyaltyLedger.projectId, accrual.projectId),
              eq(productionRoyaltyLedger.episodeId, accrual.episodeId),
              eq(productionRoyaltyLedger.payeeUserId, accrual.payeeUserId),
              eq(productionRoyaltyLedger.roleCode, accrual.roleCode),
            ),
          )
          .limit(1)
          .for("update");
        const current = ledgerRows[0];
        if (current) {
          const nextBaseAmount =
            accrual.settlementModel === "flat"
              ? (accrual.flatAmountKrw ?? Number(current.baseAmountKrw))
              : Number(current.baseAmountKrw) + accrual.baseAmountAddedKrw;
          const updatedLedger = await transaction
            .update(productionRoyaltyLedger)
            .set({
              settlementModel: accrual.settlementModel,
              approvedCuts: current.approvedCuts + accrual.cutsAdded,
              baseAmountKrw: nextBaseAmount,
              royaltyBps: accrual.royaltyBps,
              mgBalanceKrw: Number(current.mgBalanceKrw) + accrual.mgAdvanceKrw,
            })
            .where(eq(productionRoyaltyLedger.id, current.id))
            .returning();
          ledgerEntry = mapRoyaltyLedgerRow(updatedLedger[0]!);
        } else {
          const insertedLedger = await transaction
            .insert(productionRoyaltyLedger)
            .values({
              id: accrual.ledgerId,
              projectId: accrual.projectId,
              episodeId: accrual.episodeId,
              payeeUserId: accrual.payeeUserId,
              roleCode: accrual.roleCode,
              settlementModel: accrual.settlementModel,
              approvedCuts: accrual.cutsAdded,
              baseAmountKrw:
                accrual.settlementModel === "flat"
                  ? (accrual.flatAmountKrw ?? accrual.baseAmountAddedKrw)
                  : accrual.baseAmountAddedKrw,
              royaltyBps: accrual.royaltyBps,
              mgBalanceKrw: accrual.mgAdvanceKrw,
              status: "accruing",
              settledAt: null,
            })
            .returning();
          ledgerEntry = mapRoyaltyLedgerRow(insertedLedger[0]!);
        }
        ledgerAccrued = true;
      }

      return {
        inspection: mapQaInspectionRow(insertedInspection[0]!),
        slice: mapCutSliceRow(updatedSlices[0]!),
        ledgerEntry,
        ledgerAccrued,
      };
    });
  }

  async listProjectSlices(projectId: string): Promise<readonly CutSliceRecord[]> {
    if (this.memoryFallback) {
      return this.memoryFallback.listProjectSlices(projectId);
    }
    const rows = await db
      .select()
      .from(productionCutSlice)
      .where(eq(productionCutSlice.projectId, projectId))
      .orderBy(
        asc(productionCutSlice.episodeId),
        asc(productionCutSlice.stageCode),
        asc(productionCutSlice.cutStart),
      );
    return rows.map(mapCutSliceRow);
  }

  async countActiveLocks(projectId: string, asOf: Date): Promise<number> {
    if (this.memoryFallback) {
      return this.memoryFallback.countActiveLocks(projectId, asOf);
    }
    const rows = await db
      .select({ total: count() })
      .from(productionBinaryLock)
      .where(
        and(
          eq(productionBinaryLock.projectId, projectId),
          gt(productionBinaryLock.expiresAt, asOf),
        ),
      );
    return Number(rows[0]?.total ?? 0);
  }

  async listProjectRoyaltyLedger(
    filter: ListRoyaltyLedgerFilter,
  ): Promise<readonly RoyaltyLedgerRecord[]> {
    if (this.memoryFallback) {
      return this.memoryFallback.listProjectRoyaltyLedger(filter);
    }
    const conditions = [eq(productionRoyaltyLedger.projectId, filter.projectId)];
    if (filter.episodeId) {
      conditions.push(eq(productionRoyaltyLedger.episodeId, filter.episodeId));
    }
    if (filter.payeeUserId) {
      conditions.push(eq(productionRoyaltyLedger.payeeUserId, filter.payeeUserId));
    }
    if (filter.settlementModel) {
      conditions.push(eq(productionRoyaltyLedger.settlementModel, filter.settlementModel));
    }
    const rows = await db
      .select()
      .from(productionRoyaltyLedger)
      .where(and(...conditions))
      .orderBy(
        asc(productionRoyaltyLedger.episodeId),
        asc(productionRoyaltyLedger.payeeUserId),
        asc(productionRoyaltyLedger.roleCode),
      );
    return rows.map(mapRoyaltyLedgerRow);
  }
}
