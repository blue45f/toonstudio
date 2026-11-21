import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import type { ProductionQaRedlineStroke } from "../../platform/database/schema/production-division-os.schema";
import {
  detectCutRangeOverlaps,
  type BinaryLockRecord,
  type CutSliceRecord,
  type DivisionOsActorAccess,
  type DivisionOsActorRole,
  type PlannedCutSliceDraft,
  type QaInspectionRecord,
  type RoyaltyLedgerRecord,
} from "./production-division-os.domain";
import type {
  DivisionQaVerdict,
  DivisionRoleCode,
  DivisionSettlementModel,
  DivisionSliceStatus,
  DivisionStageCode,
} from "./production-division-os.dto";

export interface SavePartitionedSlicesParams {
  readonly projectId: string;
  readonly episodeId: string;
  readonly stageCode: DivisionStageCode;
  readonly replaceExisting: boolean;
  readonly slices: readonly PlannedCutSliceDraft[];
  readonly now: Date;
}

export interface AcquireBinaryLockParams {
  readonly projectId: string;
  readonly assetKey: string;
  readonly holderUserId: string;
  readonly lockReason: string;
  readonly ttlMinutes: number;
  readonly forceTakeover: boolean;
  readonly canForceTakeover: boolean;
  readonly now: Date;
}

export interface AcquireBinaryLockResult {
  readonly lock: BinaryLockRecord;
  readonly renewed: boolean;
  readonly evictedPreviousHolder: string | null;
  readonly expiredPreviousHolder: string | null;
}

export interface QaLedgerAccrualInput {
  readonly ledgerId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly payeeUserId: string;
  readonly roleCode: DivisionRoleCode;
  readonly settlementModel: DivisionSettlementModel;
  readonly cutsAdded: number;
  readonly baseAmountAddedKrw: number;
  readonly royaltyBps: number;
  readonly mgAdvanceKrw: number;
  readonly flatAmountKrw?: number;
}

export interface RecordQaInspectionParams {
  readonly inspectionId: string;
  readonly sliceId: string;
  readonly revisionHash: string;
  readonly paletteDriftMax: number;
  readonly lineWidthCv: number;
  readonly mobile375Ok: boolean;
  readonly rightsBomOk: boolean;
  readonly redlineStrokes: readonly ProductionQaRedlineStroke[];
  readonly verdict: DivisionQaVerdict;
  readonly nextSliceStatus: DivisionSliceStatus;
  readonly reviewerUserId: string;
  readonly now: Date;
  readonly ledgerAccrual: QaLedgerAccrualInput | null;
}

export interface RecordQaInspectionResult {
  readonly inspection: QaInspectionRecord;
  readonly slice: CutSliceRecord;
  readonly ledgerEntry: RoyaltyLedgerRecord | null;
  readonly ledgerAccrued: boolean;
}

export interface ListRoyaltyLedgerFilter {
  readonly projectId: string;
  readonly episodeId?: string;
  readonly payeeUserId?: string;
  readonly settlementModel?: DivisionSettlementModel;
}

export interface ProductionDivisionOsRepositoryPort {
  resolveActorAccess(actorUserId: string, projectId: string): Promise<DivisionOsActorAccess>;
  listSlicesByStage(
    projectId: string,
    episodeId: string,
    stageCode: DivisionStageCode,
  ): Promise<readonly CutSliceRecord[]>;
  savePartitionedSlices(params: SavePartitionedSlicesParams): Promise<readonly CutSliceRecord[]>;
  getSliceById(sliceId: string): Promise<CutSliceRecord | null>;
  listSlicesByIds(sliceIds: readonly string[]): Promise<readonly CutSliceRecord[]>;
  markSlicesStitched(sliceIds: readonly string[], now: Date): Promise<readonly CutSliceRecord[]>;
  acquireBinaryLock(params: AcquireBinaryLockParams): Promise<AcquireBinaryLockResult>;
  getBinaryLock(assetKey: string): Promise<BinaryLockRecord | null>;
  releaseBinaryLock(assetKey: string): Promise<boolean>;
  recordQaInspectionAndAccrueLedger(
    params: RecordQaInspectionParams,
  ): Promise<RecordQaInspectionResult>;
  listProjectSlices(projectId: string): Promise<readonly CutSliceRecord[]>;
  countActiveLocks(projectId: string, asOf: Date): Promise<number>;
  listProjectRoyaltyLedger(filter: ListRoyaltyLedgerFilter): Promise<readonly RoyaltyLedgerRecord[]>;
}

export interface InMemoryProjectMemberConfig {
  readonly userId: string;
  readonly roleCodes: readonly DivisionOsActorRole[];
  readonly view?: boolean;
  readonly edit?: boolean;
  readonly isPd?: boolean;
  readonly isAd?: boolean;
}

function ledgerKey(
  projectId: string,
  episodeId: string,
  payeeUserId: string,
  roleCode: DivisionRoleCode,
): string {
  return `${projectId}::${episodeId}::${payeeUserId}::${roleCode}`;
}

/**
 * 단위 테스트 및 DB 미연결 폴백용 인메모리 분업 OS 저장소.
 * PostgreSQL Drizzle 저장소와 동일한 권한 경계·컷 중복 차단·잠금 충돌·원자적 QA 적립 계약을 유지한다.
 */
export class InMemoryProductionDivisionOsRepository implements ProductionDivisionOsRepositoryPort {
  private readonly projects = new Set<string>();
  private readonly members = new Map<string, Map<string, DivisionOsActorAccess>>();
  private readonly slices = new Map<string, CutSliceRecord>();
  private readonly locks = new Map<string, BinaryLockRecord>();
  private readonly inspections = new Map<string, QaInspectionRecord>();
  private readonly ledgers = new Map<string, RoyaltyLedgerRecord>();

  registerProject(projectId: string, members: readonly InMemoryProjectMemberConfig[] = []): void {
    this.projects.add(projectId);
    for (const member of members) {
      this.registerMember(projectId, member);
    }
  }

  registerMember(projectId: string, config: InMemoryProjectMemberConfig): void {
    this.projects.add(projectId);
    let projectMembers = this.members.get(projectId);
    if (!projectMembers) {
      projectMembers = new Map();
      this.members.set(projectId, projectMembers);
    }
    const isPd = config.isPd ?? config.roleCodes.includes("pd");
    const isAd = config.isAd ?? config.roleCodes.includes("art_director");
    const isViewerOnly =
      config.roleCodes.length > 0 && config.roleCodes.every((role) => role === "viewer");
    const edit = config.edit ?? (!isViewerOnly || isPd || isAd);
    projectMembers.set(config.userId, {
      actorUserId: config.userId,
      projectId,
      view: config.view ?? true,
      edit,
      isPd,
      isAd,
      roleCodes: [...config.roleCodes],
    });
  }

  seedSlice(slice: CutSliceRecord): void {
    this.projects.add(slice.projectId);
    this.slices.set(slice.id, { ...slice, allowedFolders: [...slice.allowedFolders] });
  }

  seedLedgerEntry(entry: RoyaltyLedgerRecord): void {
    this.projects.add(entry.projectId);
    this.ledgers.set(
      ledgerKey(entry.projectId, entry.episodeId, entry.payeeUserId, entry.roleCode),
      { ...entry },
    );
  }

  listInspectionsForSlice(cutSliceId: string): readonly QaInspectionRecord[] {
    return [...this.inspections.values()]
      .filter((entry) => entry.cutSliceId === cutSliceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async resolveActorAccess(actorUserId: string, projectId: string): Promise<DivisionOsActorAccess> {
    if (!this.projects.has(projectId)) {
      throw new NotFoundException("제작 프로젝트를 찾을 수 없습니다.");
    }
    const access = this.members.get(projectId)?.get(actorUserId);
    if (!access || !access.view) {
      throw new ForbiddenException("프로젝트 접근 권한이 없습니다.");
    }
    return access;
  }

  async listSlicesByStage(
    projectId: string,
    episodeId: string,
    stageCode: DivisionStageCode,
  ): Promise<readonly CutSliceRecord[]> {
    return [...this.slices.values()]
      .filter(
        (slice) =>
          slice.projectId === projectId &&
          slice.episodeId === episodeId &&
          slice.stageCode === stageCode,
      )
      .sort((a, b) => a.cutStart - b.cutStart || a.cutEnd - b.cutEnd);
  }

  async savePartitionedSlices(
    params: SavePartitionedSlicesParams,
  ): Promise<readonly CutSliceRecord[]> {
    const existing = await this.listSlicesByStage(
      params.projectId,
      params.episodeId,
      params.stageCode,
    );
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
      for (const slice of existing) {
        if (slice.status !== "approved" && slice.status !== "stitched") {
          this.slices.delete(slice.id);
        }
      }
    }

    const updatedAt = params.now.toISOString();
    const created: CutSliceRecord[] = params.slices.map((draft) => {
      if (this.slices.has(draft.id)) {
        throw new ConflictException({
          code: "cut_slice_id_conflict",
          message: `이미 존재하는 슬라이스 ID입니다: ${draft.id}`,
        });
      }
      const record: CutSliceRecord = {
        id: draft.id,
        projectId: params.projectId,
        episodeId: params.episodeId,
        stageCode: params.stageCode,
        cutStart: draft.cutStart,
        cutEnd: draft.cutEnd,
        allowedFolders: [...draft.allowedFolders],
        assigneeUserId: draft.assigneeUserId,
        status: "assigned",
        leaseExpiresAt: draft.leaseExpiresAt.toISOString(),
        latestRevHash: null,
        dueAt: draft.dueAt ? draft.dueAt.toISOString() : null,
        updatedAt,
      };
      this.slices.set(record.id, record);
      return record;
    });

    return created.sort((a, b) => a.cutStart - b.cutStart);
  }

  async getSliceById(sliceId: string): Promise<CutSliceRecord | null> {
    return this.slices.get(sliceId) ?? null;
  }

  async listSlicesByIds(sliceIds: readonly string[]): Promise<readonly CutSliceRecord[]> {
    const result: CutSliceRecord[] = [];
    for (const id of sliceIds) {
      const slice = this.slices.get(id);
      if (slice) result.push(slice);
    }
    return result.sort((a, b) => a.cutStart - b.cutStart);
  }

  async markSlicesStitched(
    sliceIds: readonly string[],
    now: Date,
  ): Promise<readonly CutSliceRecord[]> {
    const updatedAt = now.toISOString();
    const updated: CutSliceRecord[] = [];
    for (const id of sliceIds) {
      const existing = this.slices.get(id);
      if (!existing) continue;
      const next: CutSliceRecord = {
        ...existing,
        status: "stitched",
        updatedAt,
      };
      this.slices.set(id, next);
      updated.push(next);
    }
    return updated.sort((a, b) => a.cutStart - b.cutStart);
  }

  async acquireBinaryLock(params: AcquireBinaryLockParams): Promise<AcquireBinaryLockResult> {
    const existing = this.locks.get(params.assetKey);
    const nowMs = params.now.getTime();
    const lockedAt = params.now.toISOString();
    const expiresAt = new Date(nowMs + params.ttlMinutes * 60_000).toISOString();

    let renewed = false;
    let evictedPreviousHolder: string | null = null;
    let expiredPreviousHolder: string | null = null;

    if (existing) {
      const isExpired = Date.parse(existing.expiresAt) <= nowMs;
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
          expiresAt: existing.expiresAt,
        });
      }
    }

    const nextLock: BinaryLockRecord = {
      assetKey: params.assetKey,
      projectId: params.projectId,
      holderUserId: params.holderUserId,
      lockReason: params.lockReason,
      lockedAt,
      expiresAt,
    };
    this.locks.set(params.assetKey, nextLock);
    return {
      lock: nextLock,
      renewed,
      evictedPreviousHolder,
      expiredPreviousHolder,
    };
  }

  async getBinaryLock(assetKey: string): Promise<BinaryLockRecord | null> {
    return this.locks.get(assetKey) ?? null;
  }

  async releaseBinaryLock(assetKey: string): Promise<boolean> {
    return this.locks.delete(assetKey);
  }

  async recordQaInspectionAndAccrueLedger(
    params: RecordQaInspectionParams,
  ): Promise<RecordQaInspectionResult> {
    const existingSlice = this.slices.get(params.sliceId);
    if (!existingSlice) {
      throw new NotFoundException("컷 슬라이스를 찾을 수 없습니다.");
    }

    const wasAlreadyApproved =
      existingSlice.status === "approved" || existingSlice.status === "stitched";
    const nowIso = params.now.toISOString();

    const inspection: QaInspectionRecord = {
      id: params.inspectionId,
      cutSliceId: params.sliceId,
      revisionHash: params.revisionHash,
      paletteDriftMax: params.paletteDriftMax,
      lineWidthCv: params.lineWidthCv,
      mobile375Ok: params.mobile375Ok,
      rightsBomOk: params.rightsBomOk,
      redlineStrokes: params.redlineStrokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((pt) => ({ ...pt })),
      })),
      verdict: params.verdict,
      reviewerUserId: params.reviewerUserId,
      createdAt: nowIso,
    };
    this.inspections.set(inspection.id, inspection);

    const updatedSlice: CutSliceRecord = {
      ...existingSlice,
      status: params.nextSliceStatus,
      latestRevHash: params.revisionHash,
      updatedAt: nowIso,
    };
    this.slices.set(updatedSlice.id, updatedSlice);

    let ledgerEntry: RoyaltyLedgerRecord | null = null;
    let ledgerAccrued = false;

    if (params.verdict === "approved" && !wasAlreadyApproved && params.ledgerAccrual) {
      const accrual = params.ledgerAccrual;
      const key = ledgerKey(
        accrual.projectId,
        accrual.episodeId,
        accrual.payeeUserId,
        accrual.roleCode,
      );
      const current = this.ledgers.get(key);
      if (current) {
        const nextBaseAmount =
          accrual.settlementModel === "flat"
            ? (accrual.flatAmountKrw ?? current.baseAmountKrw)
            : current.baseAmountKrw + accrual.baseAmountAddedKrw;
        ledgerEntry = {
          ...current,
          settlementModel: accrual.settlementModel,
          approvedCuts: current.approvedCuts + accrual.cutsAdded,
          baseAmountKrw: nextBaseAmount,
          royaltyBps: accrual.royaltyBps,
          mgBalanceKrw: current.mgBalanceKrw + accrual.mgAdvanceKrw,
        };
      } else {
        ledgerEntry = {
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
        };
      }
      this.ledgers.set(key, ledgerEntry);
      ledgerAccrued = true;
    }

    return {
      inspection,
      slice: updatedSlice,
      ledgerEntry,
      ledgerAccrued,
    };
  }

  async listProjectSlices(projectId: string): Promise<readonly CutSliceRecord[]> {
    return [...this.slices.values()]
      .filter((slice) => slice.projectId === projectId)
      .sort(
        (a, b) =>
          a.episodeId.localeCompare(b.episodeId, undefined, { numeric: true }) ||
          a.stageCode.localeCompare(b.stageCode) ||
          a.cutStart - b.cutStart,
      );
  }

  async countActiveLocks(projectId: string, asOf: Date): Promise<number> {
    const asOfMs = asOf.getTime();
    let count = 0;
    for (const lock of this.locks.values()) {
      if (lock.projectId === projectId && Date.parse(lock.expiresAt) > asOfMs) {
        count += 1;
      }
    }
    return count;
  }

  async listProjectRoyaltyLedger(
    filter: ListRoyaltyLedgerFilter,
  ): Promise<readonly RoyaltyLedgerRecord[]> {
    return [...this.ledgers.values()]
      .filter((entry) => {
        if (entry.projectId !== filter.projectId) return false;
        if (filter.episodeId && entry.episodeId !== filter.episodeId) return false;
        if (filter.payeeUserId && entry.payeeUserId !== filter.payeeUserId) return false;
        if (filter.settlementModel && entry.settlementModel !== filter.settlementModel) {
          return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          a.episodeId.localeCompare(b.episodeId, undefined, { numeric: true }) ||
          a.payeeUserId.localeCompare(b.payeeUserId) ||
          a.roleCode.localeCompare(b.roleCode),
      );
  }
}
