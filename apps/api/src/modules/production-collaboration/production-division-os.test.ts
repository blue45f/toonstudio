import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";

import { ProductionDivisionOsController } from "./production-division-os.controller";
import {
  AcquireBinaryLockDto,
  PartitionEpisodeSlicesDto,
  PipelineMatrixQueryDto,
  QaInspectSliceDto,
  RoyaltyLedgerQueryDto,
  StitchSliceDto,
} from "./production-division-os.dto";
import { InMemoryProductionDivisionOsRepository } from "./production-division-os.memory-repository";
import { ProductionDivisionOsRepository } from "./production-division-os.repository";
import { ProductionDivisionOsService } from "./production-division-os.service";

const PROJECT_ID = "proj-division-01";
const PD_USER = "user-pd-1";
const AD_USER = "user-ad-1";
const LINE_USER_1 = "user-line-1";
const LINE_USER_2 = "user-line-2";
const BG_USER = "user-bg-1";
const VIEWER_USER = "user-viewer-1";
const OUTSIDER_USER = "user-outsider-1";

function revHash(hexChar: string): string {
  return `sha256:${hexChar.repeat(64)}`;
}

describe("Production Division OS — API 서비스·컨트롤러·스키마 검증", () => {
  let memoryRepo: InMemoryProductionDivisionOsRepository;
  let repository: ProductionDivisionOsRepository;
  let service: ProductionDivisionOsService;
  let controller: ProductionDivisionOsController;
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
      { userId: VIEWER_USER, roleCodes: ["viewer"] },
    ]);
    repository = new ProductionDivisionOsRepository(memoryRepo);
    service = new ProductionDivisionOsService(repository, () => now);
    controller = new ProductionDivisionOsController(service);
  });

  it("1. 미인증 요청(x-user-id 누락)은 6대 엔드포인트 진입 전 403으로 차단한다", () => {
    const partitionBody = PartitionEpisodeSlicesDto.create({
      projectId: PROJECT_ID,
      stageCode: "line",
      totalCuts: 40,
    });
    const stitchBody = StitchSliceDto.create({});
    const lockBody = AcquireBinaryLockDto.create({
      projectId: PROJECT_ID,
      assetKey: "ep01/scene01.clip",
      lockReason: "선화 작업",
    });
    const qaBody = QaInspectSliceDto.create({
      revisionHash: revHash("a"),
      paletteDriftMax: 1.2,
      lineWidthCv: 0.08,
      mobile375Ok: true,
      rightsBomOk: true,
    });

    expect(() => controller.partitionEpisodeSlices({ episodeId: "ep-01" }, partitionBody)).toThrow(
      ForbiddenException,
    );
    expect(() => controller.stitchSlice({ sliceId: "slice-1" }, stitchBody)).toThrow(
      ForbiddenException,
    );
    expect(() => controller.acquireBinaryLock(lockBody)).toThrow(ForbiddenException);
    expect(() => controller.releaseBinaryLock({ assetKey: "ep01/scene01.clip" }, {})).toThrow(
      ForbiddenException,
    );
    expect(() => controller.inspectSliceQa({ sliceId: "slice-1" }, qaBody)).toThrow(
      ForbiddenException,
    );
    expect(() =>
      controller.getPipelineMatrix(
        { projectId: PROJECT_ID },
        PipelineMatrixQueryDto.create({}),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.getRoyaltyLedger(
        { projectId: PROJECT_ID },
        RoyaltyLedgerQueryDto.create({}),
      ),
    ).toThrow(ForbiddenException);
  });

  it("2. 일반 작업자·열람자·외부인은 분할·합본·AD 검수·체크아웃 권한 경계를 넘지 못한다", async () => {
    const partitionInput = PartitionEpisodeSlicesDto.create({
      projectId: PROJECT_ID,
      stageCode: "line",
      totalCuts: 40,
      sliceCount: 2,
      assigneeUserIds: [LINE_USER_1, LINE_USER_2],
    });

    await expect(
      service.partitionEpisodeSlices(LINE_USER_1, "ep-01", partitionInput),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.partitionEpisodeSlices(VIEWER_USER, "ep-01", partitionInput),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      service.partitionEpisodeSlices(OUTSIDER_USER, "ep-01", partitionInput),
    ).rejects.toThrow(ForbiddenException);

    const partitioned = await service.partitionEpisodeSlices(PD_USER, "ep-01", partitionInput);
    const sliceId = partitioned.slices[0]!.id;

    await expect(
      service.inspectSliceQa(
        LINE_USER_1,
        sliceId,
        QaInspectSliceDto.create({
          revisionHash: revHash("1"),
          paletteDriftMax: 1.0,
          lineWidthCv: 0.05,
          mobile375Ok: true,
          rightsBomOk: true,
          verdict: "approved",
        }),
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.stitchSlice(LINE_USER_1, sliceId, StitchSliceDto.create({})),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.acquireBinaryLock(
        VIEWER_USER,
        AcquireBinaryLockDto.create({
          projectId: PROJECT_ID,
          assetKey: "ep01/bg.blend",
          lockReason: "열람자가 편집 시도",
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("3. PD가 80컷 회차를 자동 분할하면 4개 연속 슬라이스·레이어 권위·앞뒤 1컷 컨텍스트·리스가 발급된다", async () => {
    const result = await service.partitionEpisodeSlices(
      PD_USER,
      "ep-01",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "line",
        totalCuts: 80,
        sliceCount: 4,
        assigneeUserIds: [LINE_USER_1, LINE_USER_2],
        leaseDurationMinutes: 360,
        dueAt: "2026-11-24T12:00:00.000Z",
      }),
    );

    expect(result.coverageComplete).toBe(true);
    expect(result.totalCuts).toBe(80);
    expect(result.slices).toHaveLength(4);
    expect(result.slices.map((s) => [s.cutStart, s.cutEnd])).toEqual([
      [1, 20],
      [21, 40],
      [41, 60],
      [61, 80],
    ]);
    expect(result.slices[0]).toMatchObject({
      allowedFolders: ["20_LINE"],
      assigneeUserId: LINE_USER_1,
      cutCount: 20,
      contextCutBefore: null,
      contextCutAfter: 21,
      status: "assigned",
    });
    expect(result.slices[1]).toMatchObject({
      assigneeUserId: LINE_USER_2,
      contextCutBefore: 20,
      contextCutAfter: 41,
    });
    expect(result.slices[3]).toMatchObject({
      contextCutBefore: 60,
      contextCutAfter: null,
      leaseExpiresAt: "2026-11-21T15:00:00.000Z",
    });
  });

  it("4. 미니 팀 프리셋(duo-line-color)은 묶음 폴더 권위를 부여하고, 비-QA 공정의 99_AD_REDLINE 쓰기는 차단한다", async () => {
    const duoResult = await service.partitionEpisodeSlices(
      AD_USER,
      "ep-02",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "flat",
        preset: "duo-line-color",
        totalCuts: 60,
        sliceCount: 2,
      }),
    );
    expect(duoResult.slices[0]!.allowedFolders).toEqual(["30_FLAT", "40_SHADE", "50_FX"]);

    await expect(
      service.partitionEpisodeSlices(
        PD_USER,
        "ep-02",
        PartitionEpisodeSlicesDto.create({
          projectId: PROJECT_ID,
          stageCode: "line",
          totalCuts: 20,
          slices: [
            {
              cutStart: 1,
              cutEnd: 20,
              allowedFolders: ["20_LINE", "99_AD_REDLINE"],
            },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("5. 동일 공정의 컷 범위가 요청 내부 또는 기존 슬라이스와 겹치면 409 Conflict로 차단한다", async () => {
    await expect(
      service.partitionEpisodeSlices(
        PD_USER,
        "ep-03",
        PartitionEpisodeSlicesDto.create({
          projectId: PROJECT_ID,
          stageCode: "line",
          totalCuts: 40,
          slices: [
            { cutStart: 1, cutEnd: 25, assigneeUserId: LINE_USER_1 },
            { cutStart: 20, cutEnd: 40, assigneeUserId: LINE_USER_2 },
          ],
        }),
      ),
    ).rejects.toThrow(ConflictException);

    const initial = await service.partitionEpisodeSlices(
      PD_USER,
      "ep-03",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "line",
        totalCuts: 40,
        slices: [{ cutStart: 1, cutEnd: 20, assigneeUserId: LINE_USER_1 }],
      }),
    );

    await expect(
      service.partitionEpisodeSlices(
        PD_USER,
        "ep-03",
        PartitionEpisodeSlicesDto.create({
          projectId: PROJECT_ID,
          stageCode: "line",
          totalCuts: 40,
          slices: [{ cutStart: 15, cutEnd: 30, assigneeUserId: LINE_USER_2 }],
        }),
      ),
    ).rejects.toThrow(ConflictException);

    // 승인 완료된 슬라이스는 replaceExisting: true 여도 덮어쓸 수 없다.
    await service.inspectSliceQa(
      AD_USER,
      initial.slices[0]!.id,
      QaInspectSliceDto.create({
        revisionHash: revHash("2"),
        paletteDriftMax: 1.5,
        lineWidthCv: 0.1,
        mobile375Ok: true,
        rightsBomOk: true,
        verdict: "approved",
      }),
    );

    await expect(
      service.partitionEpisodeSlices(
        PD_USER,
        "ep-03",
        PartitionEpisodeSlicesDto.create({
          projectId: PROJECT_ID,
          stageCode: "line",
          totalCuts: 40,
          replaceExisting: true,
          slices: [{ cutStart: 10, cutEnd: 40, assigneeUserId: LINE_USER_2 }],
        }),
      ),
    ).rejects.toThrow(ConflictException);
  });

  it("6. 바이너리 에셋 단독 체크아웃 잠금은 본인 갱신은 허용하고 타인 동시 잠금은 409로 차단한다", async () => {
    const acquired = await service.acquireBinaryLock(
      BG_USER,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep05/palace_hall.blend",
        lockReason: "대연회장 조명 1차 렌더",
        ttlMinutes: 90,
      }),
    );
    expect(acquired.assetFormat).toBe("blend");
    expect(acquired.renewed).toBe(false);
    expect(acquired.lock.holderUserId).toBe(BG_USER);

    // 동일 보유자 재요청은 만료 연장(renewed: true)
    const renewed = await service.acquireBinaryLock(
      BG_USER,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep05/palace_hall.blend",
        lockReason: "대연회장 조명 2차 보정",
        ttlMinutes: 120,
      }),
    );
    expect(renewed.renewed).toBe(true);
    expect(renewed.lock.lockReason).toBe("대연회장 조명 2차 보정");

    // 다른 작업자의 체크아웃 시도는 409 Conflict
    let caught: unknown;
    try {
      await service.acquireBinaryLock(
        LINE_USER_1,
        AcquireBinaryLockDto.create({
          projectId: PROJECT_ID,
          assetKey: "ep05/palace_hall.blend",
          lockReason: "선화 기준 추출",
        }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      code: "binary_lock_conflict",
      holderUserId: BG_USER,
    });
  });

  it("7. 바이너리 잠금 TTL이 만료되면 다른 편집자가 자동으로 잠금을 승계하고 만료 해제도 가능하다", async () => {
    await service.acquireBinaryLock(
      BG_USER,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep05/hero.vrm",
        lockReason: "표정 블렌드셰입 수정",
        ttlMinutes: 30,
      }),
    );

    // 31분 경과 → 만료
    now = new Date(now.getTime() + 31 * 60_000);
    const reclaimed = await service.acquireBinaryLock(
      LINE_USER_1,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep05/hero.vrm",
        lockReason: "포즈 캡처 작업",
        ttlMinutes: 60,
      }),
    );
    expect(reclaimed.expiredPreviousHolder).toBe(BG_USER);
    expect(reclaimed.lock.holderUserId).toBe(LINE_USER_1);

    // 61분 추가 경과 → 타 편집자가 만료 잠금 정리
    now = new Date(now.getTime() + 61 * 60_000);
    const released = await service.releaseBinaryLock(BG_USER, "ep05/hero.vrm", {});
    expect(released.released).toBe(true);
    expect(released.expiredReclaim).toBe(true);
    expect(released.forcedByPd).toBe(false);
  });

  it("8. 활성 잠금 강제 회수(인수/해제)는 PD만 가능하며 비-PD 강제 시도는 403으로 거부된다", async () => {
    await service.acquireBinaryLock(
      LINE_USER_1,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep06/master.clip",
        lockReason: "1~40컷 선화",
        ttlMinutes: 180,
      }),
    );

    await expect(
      service.acquireBinaryLock(
        AD_USER,
        AcquireBinaryLockDto.create({
          projectId: PROJECT_ID,
          assetKey: "ep06/master.clip",
          lockReason: "AD 강제 인수 시도",
          forceTakeover: true,
        }),
      ),
    ).rejects.toThrow(ForbiddenException);

    await expect(
      service.releaseBinaryLock(AD_USER, "ep06/master.clip", { force: true }),
    ).rejects.toThrow(ForbiddenException);

    // PD 강제 인수 성공
    const takeover = await service.acquireBinaryLock(
      PD_USER,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep06/master.clip",
        lockReason: "긴급 마감 대응 PD 회수",
        forceTakeover: true,
      }),
    );
    expect(takeover.evictedPreviousHolder).toBe(LINE_USER_1);
    expect(takeover.lock.holderUserId).toBe(PD_USER);

    // 다시 LINE_USER_2가 보유한 활성 잠금을 PD가 DELETE로 강제 해제
    await service.releaseBinaryLock(PD_USER, "ep06/master.clip", {});
    await service.acquireBinaryLock(
      LINE_USER_2,
      AcquireBinaryLockDto.create({
        projectId: PROJECT_ID,
        assetKey: "ep06/master.clip",
        lockReason: "후반 선화",
      }),
    );
    const forcedRelease = await service.releaseBinaryLock(PD_USER, "ep06/master.clip", {
      force: true,
    });
    expect(forcedRelease.forcedByPd).toBe(true);
    expect(forcedRelease.previousHolderUserId).toBe(LINE_USER_2);
  });

  it("9. AD 5종 검수 통과 및 승인 시 슬라이스 상태가 approved로 전이되고 정산 원장에 컷수·기본금이 자동 적립된다", async () => {
    const partitioned = await service.partitionEpisodeSlices(
      PD_USER,
      "ep-07",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "line",
        totalCuts: 60,
        slices: [
          { cutStart: 1, cutEnd: 30, assigneeUserId: LINE_USER_1 },
          { cutStart: 31, cutEnd: 60, assigneeUserId: LINE_USER_1 },
        ],
      }),
    );

    const qa1 = await service.inspectSliceQa(
      AD_USER,
      partitioned.slices[0]!.id,
      QaInspectSliceDto.create({
        revisionHash: revHash("a"),
        paletteDriftMax: 2.1,
        lineWidthCv: 0.11,
        colorscriptMoodDrift: 0.08,
        mobile375Ok: true,
        rightsBomOk: true,
      }),
    );
    expect(qa1.qaSummary.passedCount).toBe(5);
    expect(qa1.inspection.verdict).toBe("approved");
    expect(qa1.slice.status).toBe("approved");
    expect(qa1.slice.latestRevHash).toBe(revHash("a"));
    expect(qa1.ledgerAccrual.accrued).toBe(true);
    expect(qa1.ledgerAccrual.cutsAdded).toBe(30);
    expect(qa1.ledgerAccrual.amountAddedKrw).toBe(30 * 12_000);
    expect(qa1.ledgerAccrual.ledgerEntry).toMatchObject({
      payeeUserId: LINE_USER_1,
      roleCode: "line",
      settlementModel: "hybrid-base-plus-royalty",
      approvedCuts: 30,
      baseAmountKrw: 360_000,
      royaltyBps: 300,
    });

    // 두 번째 슬라이스 승인 시 동일 원장 행에 누적 적립
    const qa2 = await service.inspectSliceQa(
      AD_USER,
      partitioned.slices[1]!.id,
      QaInspectSliceDto.create({
        revisionHash: revHash("b"),
        paletteDriftMax: 1.8,
        lineWidthCv: 0.09,
        mobile375Ok: true,
        rightsBomOk: true,
        verdict: "approved",
      }),
    );
    expect(qa2.ledgerAccrual.ledgerEntry?.approvedCuts).toBe(60);
    expect(qa2.ledgerAccrual.ledgerEntry?.baseAmountKrw).toBe(720_000);
  });

  it("10. Rights BOM 미통과는 승인을 차단(400)하고, 리테이크 판정은 레드라인 스트로크를 저장하되 정산 원장에 적립하지 않는다", async () => {
    const partitioned = await service.partitionEpisodeSlices(
      PD_USER,
      "ep-08",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "bg3d",
        totalCuts: 20,
        slices: [{ cutStart: 1, cutEnd: 20, assigneeUserId: BG_USER }],
      }),
    );
    const sliceId = partitioned.slices[0]!.id;

    // Rights BOM 미통과 + 강제 승인 시도 → 400 차단
    await expect(
      service.inspectSliceQa(
        AD_USER,
        sliceId,
        QaInspectSliceDto.create({
          revisionHash: revHash("c"),
          paletteDriftMax: 1.0,
          lineWidthCv: 0.05,
          mobile375Ok: true,
          rightsBomOk: false,
          verdict: "approved",
        }),
      ),
    ).rejects.toThrow(BadRequestException);

    // 리테이크 저장 (레드라인 스트로크 + 음성 핀 포함)
    const retake = await service.inspectSliceQa(
      AD_USER,
      sliceId,
      QaInspectSliceDto.create({
        revisionHash: revHash("c"),
        paletteDriftMax: 6.2,
        lineWidthCv: 0.24,
        mobile375Ok: false,
        rightsBomOk: true,
        redlineStrokes: [
          {
            id: "stroke-1",
            cutNumber: 12,
            color: "oklch(0.62 0.22 25)",
            width: 4,
            points: [
              { x: 120, y: 340 },
              { x: 240, y: 380 },
            ],
            note: "모바일 375px에서 말풍선 대비 부족 — 배경 명도 낮춤 요청",
            voicePinUrl: "https://cdn.toonstudio.example/voice/pin-12.webm",
          },
        ],
      }),
    );
    expect(retake.inspection.verdict).toBe("retake");
    expect(retake.slice.status).toBe("retake");
    expect(retake.inspection.redlineStrokes).toHaveLength(1);
    expect(retake.ledgerAccrual.accrued).toBe(false);
    expect(retake.ledgerAccrual.cutsAdded).toBe(0);

    const ledger = await service.getRoyaltyLedger(
      PD_USER,
      PROJECT_ID,
      RoyaltyLedgerQueryDto.create({ episodeId: "ep-08" }),
    );
    expect(ledger.entries).toHaveLength(0);
  });

  it("11. 이미 승인된 슬라이스를 재검수해도 정산 원장 컷수가 중복 적립되지 않는다(멱등성)", async () => {
    const partitioned = await service.partitionEpisodeSlices(
      PD_USER,
      "ep-09",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "shade",
        totalCuts: 25,
        slices: [{ cutStart: 1, cutEnd: 25, assigneeUserId: LINE_USER_2 }],
      }),
    );
    const sliceId = partitioned.slices[0]!.id;

    const first = await service.inspectSliceQa(
      AD_USER,
      sliceId,
      QaInspectSliceDto.create({
        revisionHash: revHash("d"),
        paletteDriftMax: 1.1,
        lineWidthCv: 0.08,
        mobile375Ok: true,
        rightsBomOk: true,
        verdict: "approved",
      }),
    );
    expect(first.ledgerAccrual.accrued).toBe(true);
    expect(first.ledgerAccrual.cutsAdded).toBe(25);

    const second = await service.inspectSliceQa(
      AD_USER,
      sliceId,
      QaInspectSliceDto.create({
        revisionHash: revHash("e"),
        paletteDriftMax: 0.9,
        lineWidthCv: 0.07,
        mobile375Ok: true,
        rightsBomOk: true,
        verdict: "approved",
      }),
    );
    expect(second.ledgerAccrual.accrued).toBe(false);
    expect(second.ledgerAccrual.cutsAdded).toBe(0);

    const ledger = await service.getRoyaltyLedger(
      PD_USER,
      PROJECT_ID,
      RoyaltyLedgerQueryDto.create({ episodeId: "ep-09" }),
    );
    expect(ledger.summary.totalApprovedCuts).toBe(25);
  });

  it("12. 마스터 원고 합본은 미승인·컷 누락을 409로 차단하고 전 슬라이스 승인 시 결정적 SHA-256 해시를 생성한다", async () => {
    const partitioned = await service.partitionEpisodeSlices(
      PD_USER,
      "ep-10",
      PartitionEpisodeSlicesDto.create({
        projectId: PROJECT_ID,
        stageCode: "line",
        totalCuts: 40,
        slices: [
          { cutStart: 1, cutEnd: 20, assigneeUserId: LINE_USER_1 },
          { cutStart: 21, cutEnd: 40, assigneeUserId: LINE_USER_2 },
        ],
      }),
    );
    const [s1, s2] = partitioned.slices;

    // 1번만 승인 → 2번 미승인이므로 전체 합본 409
    await service.inspectSliceQa(
      AD_USER,
      s1!.id,
      QaInspectSliceDto.create({
        revisionHash: revHash("1"),
        paletteDriftMax: 1.0,
        lineWidthCv: 0.05,
        mobile375Ok: true,
        rightsBomOk: true,
        verdict: "approved",
      }),
    );
    await expect(
      service.stitchSlice(PD_USER, s1!.id, StitchSliceDto.create({ expectedTotalCuts: 40 })),
    ).rejects.toThrow(ConflictException);

    // 2번도 승인하지만 expectedTotalCuts: 50 → 41..50 누락 감지 409
    await service.inspectSliceQa(
      AD_USER,
      s2!.id,
      QaInspectSliceDto.create({
        revisionHash: revHash("2"),
        paletteDriftMax: 1.2,
        lineWidthCv: 0.06,
        mobile375Ok: true,
        rightsBomOk: true,
        verdict: "approved",
      }),
    );
    await expect(
      service.stitchSlice(PD_USER, s1!.id, StitchSliceDto.create({ expectedTotalCuts: 50 })),
    ).rejects.toThrow(ConflictException);

    // 정상 합본 성공
    const stitched = await service.stitchSlice(
      PD_USER,
      s1!.id,
      StitchSliceDto.create({ expectedTotalCuts: 40 }),
    );
    expect(stitched.masterManuscriptHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(stitched.totalCuts).toBe(40);
    expect(stitched.cutRange).toEqual({ start: 1, end: 40 });
    expect(stitched.stitchedSliceIds).toEqual([s1!.id, s2!.id]);
    expect(stitched.alreadyStitched).toBe(false);

    // 재합본 호출 시 동일 해시·멱등 반환
    const restitched = await service.stitchSlice(
      AD_USER,
      s2!.id,
      StitchSliceDto.create({ expectedTotalCuts: 40 }),
    );
    expect(restitched.alreadyStitched).toBe(true);
    expect(restitched.masterManuscriptHash).toBe(stitched.masterManuscriptHash);
  });
});
