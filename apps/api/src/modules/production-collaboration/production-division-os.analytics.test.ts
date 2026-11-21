import { getTableConfig } from "drizzle-orm/pg-core";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";

import {
  productionBinaryLock,
  productionCutSlice,
  productionQaInspection,
  productionRoyaltyLedger,
} from "../../platform/database/schema";
import { ZodValidationPipe } from "../../platform/http/zod-validation.pipe";
import {
  AcquireBinaryLockDto,
  PartitionEpisodeSlicesDto,
  PipelineMatrixQueryDto,
  QaInspectSliceDto,
  ReleaseBinaryLockParamsDto,
  ReleaseBinaryLockQueryDto,
  RoyaltyLedgerQueryDto,
} from "./production-division-os.dto";
import { InMemoryProductionDivisionOsRepository } from "./production-division-os.memory-repository";
import { ProductionDivisionOsRepository } from "./production-division-os.repository";
import { ProductionDivisionOsService } from "./production-division-os.service";

const PROJECT_ID = "proj-division-02";
const PD_USER = "user-pd-1";
const AD_USER = "user-ad-1";
const LINE_USER_1 = "user-line-1";
const LINE_USER_2 = "user-line-2";
const BG_USER = "user-bg-1";

function revHash(hexChar: string): string {
  return `sha256:${hexChar.repeat(64)}`;
}

describe("Production Division OS — 매트릭스·인세 정산·입력 경계·Drizzle 스키마 계약", () => {
  let memoryRepo: InMemoryProductionDivisionOsRepository;
  let service: ProductionDivisionOsService;
  let now: Date;

  beforeEach(() => {
    now = new Date("2026-11-21T09:00:00.000Z");
    memoryRepo = new InMemoryProductionDivisionOsRepository();
    memoryRepo.registerProject(PROJECT_ID, [
      { userId: PD_USER, roleCodes: ["pd"] },
      { userId: AD_USER, roleCodes: ["art_director"] },
      { userId: LINE_USER_1, roleCodes: ["line"] },
      { userId: LINE_USER_2, roleCodes: ["line"] },
      { userId: BG_USER, roleCodes: ["bg3d"] },
    ]);
    service = new ProductionDivisionOsService(
      new ProductionDivisionOsRepository(memoryRepo),
      () => now,
    );
  });

  it("13. 5주 병렬 멀티 에피소드 매트릭스는 마감 지연·리테이크·만료 리스 병목을 심각도 순으로 집계한다", async () => {
    const pastDue = "2026-11-20T18:00:00.000Z";
    const futureDue = "2026-11-25T18:00:00.000Z";
    const expiredLease = "2026-11-21T08:00:00.000Z";
    const activeLease = "2026-11-21T18:00:00.000Z";

    memoryRepo.seedSlice({
      id: "m-ep1-line",
      projectId: PROJECT_ID,
      episodeId: "ep-11",
      stageCode: "line",
      cutStart: 1,
      cutEnd: 40,
      allowedFolders: ["20_LINE"],
      assigneeUserId: LINE_USER_1,
      status: "in_progress",
      leaseExpiresAt: expiredLease,
      latestRevHash: null,
      dueAt: pastDue,
      updatedAt: now.toISOString(),
    });
    memoryRepo.seedSlice({
      id: "m-ep2-line",
      projectId: PROJECT_ID,
      episodeId: "ep-12",
      stageCode: "line",
      cutStart: 1,
      cutEnd: 40,
      allowedFolders: ["20_LINE"],
      assigneeUserId: LINE_USER_2,
      status: "retake",
      leaseExpiresAt: activeLease,
      latestRevHash: revHash("7"),
      dueAt: pastDue,
      updatedAt: now.toISOString(),
    });
    memoryRepo.seedSlice({
      id: "m-ep3-flat",
      projectId: PROJECT_ID,
      episodeId: "ep-13",
      stageCode: "flat",
      cutStart: 1,
      cutEnd: 70,
      allowedFolders: ["30_FLAT"],
      assigneeUserId: BG_USER,
      status: "approved",
      leaseExpiresAt: activeLease,
      latestRevHash: revHash("8"),
      dueAt: futureDue,
      updatedAt: now.toISOString(),
    });
    memoryRepo.seedSlice({
      id: "m-ep4-bg",
      projectId: PROJECT_ID,
      episodeId: "ep-14",
      stageCode: "bg3d",
      cutStart: 1,
      cutEnd: 70,
      allowedFolders: ["10_BG3D"],
      assigneeUserId: BG_USER,
      status: "stitched",
      leaseExpiresAt: activeLease,
      latestRevHash: revHash("9"),
      dueAt: futureDue,
      updatedAt: now.toISOString(),
    });
    memoryRepo.seedSlice({
      id: "m-ep5-script",
      projectId: PROJECT_ID,
      episodeId: "ep-15",
      stageCode: "script",
      cutStart: 1,
      cutEnd: 70,
      allowedFolders: ["00_CONTI"],
      assigneeUserId: PD_USER,
      status: "in_progress",
      leaseExpiresAt: activeLease,
      latestRevHash: null,
      dueAt: futureDue,
      updatedAt: now.toISOString(),
    });

    await service.acquireBinaryLock(
      BG_USER,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep11/city.blend",
        lockReason: "야경 텍스처 수정",
      }),
    );

    const matrix = await service.getPipelineMatrix(
      PD_USER,
      PROJECT_ID,
      PipelineMatrixQueryDto.create({ weeks: 5 }),
    );

    expect(matrix.windowWeeks).toBe(5);
    expect(matrix.episodes).toHaveLength(5);
    expect(matrix.episodes.map((ep) => ep.weekSlot)).toEqual(["W+0", "W+1", "W+2", "W+3", "W+4"]);
    expect(matrix.riskSummary).toMatchObject({
      overallHealth: "critical",
      totalEpisodes: 5,
      overdueSlices: 2,
      retakeSlices: 1,
      expiredLeases: 1,
      delayRippleRiskEpisodes: 2,
      activeLocksCount: 1,
    });
    expect(matrix.bottlenecks[0]).toMatchObject({
      stageCode: "line",
      severity: "critical",
      overdueSlices: 2,
      retakeSlices: 1,
      expiredLeases: 1,
    });
  });

  it("14. Studio No.9 하이브리드 인세 정산(기본 컷 단가 + 순매출 인세 - 3.3% 원천징수)을 정확히 계산한다", async () => {
    const partitioned = await service.partitionEpisodeSlices(
      PD_USER,
      "ep-20",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "line",
        totalCuts: 50,
        slices: [{ cutStart: 1, cutEnd: 50, assigneeUserId: LINE_USER_1 }],
      }),
    );
    await service.inspectSliceQa(
      AD_USER,
      partitioned.slices[0]!.id,
      QaInspectSliceDto.create({
        revisionHash: revHash("f"),
        paletteDriftMax: 1.0,
        lineWidthCv: 0.08,
        mobile375Ok: true,
        rightsBomOk: true,
        settlementModel: "hybrid-base-plus-royalty",
        perCutRateKrw: 10_000,
        royaltyBps: 300,
      }),
    );

    const ledger = await service.getRoyaltyLedger(
      PD_USER,
      PROJECT_ID,
      RoyaltyLedgerQueryDto.create({
        episodeId: "ep-20",
        grossRevenueKrw: 100_000_000,
        platformFeeBps: 3_000,
        withholdingTaxBps: 330,
      }),
    );

    expect(ledger.parameters.netRevenueKrw).toBe(70_000_000);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      approvedCuts: 50,
      basePayoutKrw: 500_000,
      royaltyPayoutKrw: 2_100_000,
      grossPayoutKrw: 2_600_000,
      withholdingTaxKrw: 85_800,
      netPayoutKrw: 2_514_200,
    });
  });

  it("15. 한국 CP 표준 MG 선공제 + RS 모델은 미회수 MG 잔액을 우선 차감하고 초과분만 RS로 지급한다", async () => {
    memoryRepo.seedLedgerEntry({
      id: "ledger-mg-1",
      projectId: PROJECT_ID,
      episodeId: "ep-21",
      payeeUserId: LINE_USER_1,
      roleCode: "line",
      settlementModel: "mg-recoup-rs",
      approvedCuts: 70,
      baseAmountKrw: 2_000_000,
      royaltyBps: 1_000,
      mgBalanceKrw: 5_000_000,
      status: "accruing",
      settledAt: null,
    });

    const partial = await service.getRoyaltyLedger(
      PD_USER,
      PROJECT_ID,
      RoyaltyLedgerQueryDto.create({
        episodeId: "ep-21",
        grossRevenueKrw: 50_000_000,
        platformFeeBps: 3_000,
      }),
    );
    expect(partial.entries[0]).toMatchObject({
      mgRecoupedKrw: 3_500_000,
      remainingMgBalanceKrw: 1_500_000,
      royaltyPayoutKrw: 0,
      grossPayoutKrw: 2_000_000,
    });

    const recouped = await service.getRoyaltyLedger(
      PD_USER,
      PROJECT_ID,
      RoyaltyLedgerQueryDto.create({
        episodeId: "ep-21",
        grossRevenueKrw: 100_000_000,
        platformFeeBps: 3_000,
      }),
    );
    expect(recouped.entries[0]).toMatchObject({
      mgRecoupedKrw: 5_000_000,
      remainingMgBalanceKrw: 0,
      royaltyPayoutKrw: 2_000_000,
      grossPayoutKrw: 4_000_000,
    });
  });

  it("16. 정산 원장 열람 권한 경계: 일반 작업자는 본인 내역만 조회하고 타인 원장 지정 시 403으로 차단된다", async () => {
    memoryRepo.seedLedgerEntry({
      id: "l-user-1",
      projectId: PROJECT_ID,
      episodeId: "ep-22",
      payeeUserId: LINE_USER_1,
      roleCode: "line",
      settlementModel: "per-cut",
      approvedCuts: 30,
      baseAmountKrw: 360_000,
      royaltyBps: 0,
      mgBalanceKrw: 0,
      status: "ready",
      settledAt: null,
    });
    memoryRepo.seedLedgerEntry({
      id: "l-user-2",
      projectId: PROJECT_ID,
      episodeId: "ep-22",
      payeeUserId: LINE_USER_2,
      roleCode: "shade",
      settlementModel: "per-cut",
      approvedCuts: 40,
      baseAmountKrw: 260_000,
      royaltyBps: 0,
      mgBalanceKrw: 0,
      status: "ready",
      settledAt: null,
    });

    const pdView = await service.getRoyaltyLedger(
      PD_USER,
      PROJECT_ID,
      RoyaltyLedgerQueryDto.create({}),
    );
    expect(pdView.viewerScope).toBe("all");
    expect(pdView.entries).toHaveLength(2);

    const selfView = await service.getRoyaltyLedger(
      LINE_USER_1,
      PROJECT_ID,
      RoyaltyLedgerQueryDto.create({}),
    );
    expect(selfView.viewerScope).toBe("self");
    expect(selfView.entries).toHaveLength(1);
    expect(selfView.entries[0]!.payeeUserId).toBe(LINE_USER_1);

    await expect(
      service.getRoyaltyLedger(
        LINE_USER_1,
        PROJECT_ID,
        RoyaltyLedgerQueryDto.create({ payeeUserId: LINE_USER_2 }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("17. ZodValidationPipe가 위조 필드·역전 컷 범위·경로 탐색 assetKey를 경계에서 차단하고 쿼리를 안전하게 파싱한다", () => {
    const partitionPipe = new ZodValidationPipe(PartitionEpisodeSlicesDto);
    expect(() =>
      partitionPipe.transform(
        {
          projectId: PROJECT_ID,
          stageCode: "line",
          totalCuts: 40,
          forgedRole: "pd",
        },
        { type: "body", metatype: PartitionEpisodeSlicesDto },
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      partitionPipe.transform(
        {
          projectId: PROJECT_ID,
          stageCode: "line",
          slices: [{ cutStart: 30, cutEnd: 10 }],
        },
        { type: "body", metatype: PartitionEpisodeSlicesDto },
      ),
    ).toThrow(BadRequestException);

    const lockParamPipe = new ZodValidationPipe(ReleaseBinaryLockParamsDto);
    expect(() =>
      lockParamPipe.transform(
        { assetKey: "ep01/../../etc/passwd" },
        { type: "param", metatype: ReleaseBinaryLockParamsDto },
      ),
    ).toThrow(BadRequestException);

    const lockQueryPipe = new ZodValidationPipe(ReleaseBinaryLockQueryDto);
    expect(
      lockQueryPipe.transform(
        { projectId: PROJECT_ID, force: "true" },
        { type: "query", metatype: ReleaseBinaryLockQueryDto },
      ),
    ).toEqual({ projectId: PROJECT_ID, force: true });

    const ledgerQueryPipe = new ZodValidationPipe(RoyaltyLedgerQueryDto);
    expect(
      ledgerQueryPipe.transform(
        { grossRevenueKrw: "50000000", platformFeeBps: "3500" },
        { type: "query", metatype: RoyaltyLedgerQueryDto },
      ),
    ).toEqual({
      grossRevenueKrw: 50_000_000,
      platformFeeBps: 3_500,
      withholdingTaxBps: 330,
    });
  });

  it("18. Drizzle 4대 분업 OS 테이블 스키마와 컬럼 매핑이 정합하게 export된다", () => {
    const cutSliceCfg = getTableConfig(productionCutSlice);
    expect(cutSliceCfg.name).toBe("production_cut_slice");
    expect(cutSliceCfg.columns.map((c) => c.name)).toEqual([
      "id",
      "project_id",
      "episode_id",
      "stage_code",
      "cut_start",
      "cut_end",
      "allowed_folders",
      "assignee_user_id",
      "status",
      "lease_expires_at",
      "latest_rev_hash",
      "due_at",
      "updated_at",
    ]);

    const lockCfg = getTableConfig(productionBinaryLock);
    expect(lockCfg.name).toBe("production_binary_lock");
    expect(lockCfg.columns.map((c) => c.name)).toEqual([
      "asset_key",
      "project_id",
      "holder_user_id",
      "lock_reason",
      "locked_at",
      "expires_at",
    ]);

    const qaCfg = getTableConfig(productionQaInspection);
    expect(qaCfg.name).toBe("production_qa_inspection");
    expect(qaCfg.columns.map((c) => c.name)).toEqual([
      "id",
      "cut_slice_id",
      "revision_hash",
      "palette_drift_max",
      "line_width_cv",
      "mobile_375_ok",
      "rights_bom_ok",
      "redline_strokes",
      "verdict",
      "reviewer_user_id",
      "created_at",
    ]);

    const ledgerCfg = getTableConfig(productionRoyaltyLedger);
    expect(ledgerCfg.name).toBe("production_royalty_ledger");
    expect(ledgerCfg.columns.map((c) => c.name)).toEqual([
      "id",
      "project_id",
      "episode_id",
      "payee_user_id",
      "role_code",
      "settlement_model",
      "approved_cuts",
      "base_amount_krw",
      "royalty_bps",
      "mg_balance_krw",
      "status",
      "settled_at",
    ]);
  });
});
