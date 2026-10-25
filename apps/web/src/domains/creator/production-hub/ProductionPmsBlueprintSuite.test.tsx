// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  WEBTOON_ASSISTANT_ROLE_CATALOG,
  adjustCutAssetCasting,
  bulkCastAssetToCutRange,
  calculateReverseEpisodeSchedule,
  computeAssistantQuotasAndVariance,
  copyCutCastingToTargets,
  detectStatusAutomationCycles,
  evaluateEpisodeAssetReadinessAndLicense,
  evaluateStatusAutomationRules,
  exportAssetBreakdownCsv,
  formatStudioHandoverFileName,
  parseStudioHandoverFileName,
  projectNotionProductionDatabase,
  shiftDependentAssistantTasks,
  simulateSerializationBufferHealth,
  validateStudioHandoverPackage,
} from "./production-pms-blueprint-model";
import { ProductionPmsBlueprintSuite } from "./ProductionPmsBlueprintSuite";

describe("웹툰 스튜디오 블루프린트 및 제작 관리(PMS) 도메인 엔진 & UI 스위트 검증", () => {
  it("표준 파일 네이밍 포맷·파싱·레이어 인계 체크리스트 및 버전 역전 경고를 검증한다", () => {
    const formatted = formatStudioHandoverFileName({
      workCode: "north",
      episodeNumber: 12,
      cutStart: 1,
      cutEnd: 20,
      role: "lineart",
      version: 3,
      extension: ".clip",
    });
    expect(formatted).toBe("NORTH_EP012_CUT001-020_lineart_v03.clip");

    const parsed = parseStudioHandoverFileName(formatted);
    expect(parsed).toEqual({
      workCode: "NORTH",
      episodeNumber: 12,
      cutStart: 1,
      cutEnd: 20,
      role: "lineart",
      version: 3,
      extension: "clip",
    });
    expect(parseStudioHandoverFileName("12화_선화_최종_진짜최종.clip")).toBeNull();

    const validResult = validateStudioHandoverPackage({
      fileName: formatted,
      expectedRole: "lineart",
      latestExistingVersion: 2,
      checkedChecklistItems: WEBTOON_ASSISTANT_ROLE_CATALOG.lineart.requiredChecklist,
    });
    expect(validResult.valid).toBe(true);
    expect(validResult.errors).toHaveLength(0);
    expect(validResult.warnings).toHaveLength(0);

    const versionWarningResult = validateStudioHandoverPackage({
      fileName: "NORTH_EP012_CUT001-020_lineart_v02.clip",
      expectedRole: "lineart",
      latestExistingVersion: 2,
      checkedChecklistItems: WEBTOON_ASSISTANT_ROLE_CATALOG.lineart.requiredChecklist,
    });
    expect(versionWarningResult.valid).toBe(true);
    expect(versionWarningResult.warnings[0]).toContain("버전 역전/중복 주의");

    const invalidRoleAndChecklist = validateStudioHandoverPackage({
      fileName: "NORTH_EP012_CUT001-020_shading_v03.skp",
      expectedRole: "lineart",
      latestExistingVersion: 2,
      checkedChecklistItems: [],
    });
    expect(invalidRoleAndChecklist.valid).toBe(false);
    expect(invalidRoleAndChecklist.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("Kitsu형 Status Automation(상태 트리거, Ready-For 트리거, 최신 프리뷰/파일 자동 인계, 순환 참조 감지)을 계산한다", () => {
    const cyclicRules = [
      {
        id: "r1",
        triggerMode: "status" as const,
        sourceRole: "lineart" as const,
        sourceTriggerStatus: "done" as const,
        targetRole: "flatting" as const,
        targetAppliedStatus: "ready" as const,
        copyLatestPreview: true,
      },
      {
        id: "r2",
        triggerMode: "status" as const,
        sourceRole: "flatting" as const,
        sourceTriggerStatus: "retake" as const,
        targetRole: "lineart" as const,
        targetAppliedStatus: "wip" as const,
        copyLatestPreview: false,
      },
    ];
    expect(detectStatusAutomationCycles(cyclicRules).length).toBeGreaterThan(0);

    const tasks = [
      {
        id: "t-line",
        episodeNumber: 12,
        cutRangeLabel: "CUT001-020",
        cutCount: 20,
        role: "lineart" as const,
        assigneeId: "a1",
        assigneeName: "김선화",
        status: "wip" as const,
        dueDateIso: "2026-10-27",
        dependencyTaskIds: [],
        latestFileName: "NORTH_EP012_CUT001-020_lineart_v02.clip",
        latestPreviewUrl: "https://cdn.toonstudio.io/previews/lineart.png",
        inputFileName: null,
        inputPreviewUrl: null,
        readyForRole: null,
      },
      {
        id: "t-flat",
        episodeNumber: 12,
        cutRangeLabel: "CUT001-020",
        cutCount: 20,
        role: "flatting" as const,
        assigneeId: "a2",
        assigneeName: "이밑색",
        status: "todo" as const,
        dueDateIso: "2026-10-28",
        dependencyTaskIds: ["t-line"],
        latestFileName: null,
        latestPreviewUrl: null,
        inputFileName: null,
        inputPreviewUrl: null,
        readyForRole: null,
      },
    ];

    const evaluated = evaluateStatusAutomationRules({
      tasks,
      rules: [cyclicRules[0]!],
      changedTaskId: "t-line",
      nextStatus: "done",
    });
    expect(evaluated.triggeredRuleIds).toEqual(["r1"]);
    const updatedFlat = evaluated.updatedTasks.find((t) => t.id === "t-flat");
    expect(updatedFlat?.status).toBe("ready");
    expect(updatedFlat?.inputFileName).toBe("NORTH_EP012_CUT001-020_lineart_v02.clip");
    expect(updatedFlat?.inputPreviewUrl).toBe("https://cdn.toonstudio.io/previews/lineart.png");
  });

  it("툰메이트형 연재 마감일 역산 자동 캘린더(병렬 공정 임계경로 포함) 및 세이브 원고 버퍼 소진을 시뮬레이션한다", () => {
    const schedule = calculateReverseEpisodeSchedule({
      releaseDateIso: "2026-11-06", // 금요일
      todayIso: "2026-10-26", // 월요일
      cutCount: 48,
      includeWeekends: false,
      stageSpecs: [
        { role: "lineart", minutesPerCut: 20, dailyWorkHours: 8, stageOrderGroup: 1 }, // 16h = 2일 (Critical)
        { role: "background-3d", minutesPerCut: 10, dailyWorkHours: 8, stageOrderGroup: 1 }, // 8h = 1일 (병렬)
        { role: "flatting", minutesPerCut: 10, dailyWorkHours: 8, stageOrderGroup: 2 }, // 8h = 1일
        { role: "shading", minutesPerCut: 20, dailyWorkHours: 8, stageOrderGroup: 3 }, // 16h = 2일
        { role: "retouch-lettering", minutesPerCut: 10, dailyWorkHours: 8, stageOrderGroup: 4 }, // 8h = 1일
      ],
    });

    // 총 임계경로 일수 = 2(그룹1 최대) + 1(그룹2) + 2(그룹3) + 1(그룹4) = 6영업일
    expect(schedule.totalWorkDaysOnCriticalPath).toBe(6);
    expect(schedule.earliestKickoffDateIso).toBe("2026-10-30");
    expect(schedule.scheduleRisk).toBe("healthy");

    const lineartSlot = schedule.stageSlots.find((s) => s.role === "lineart");
    const bgSlot = schedule.stageSlots.find((s) => s.role === "background-3d");
    expect(lineartSlot?.isCriticalPath).toBe(true);
    expect(bgSlot?.isCriticalPath).toBe(false);

    const buffer = simulateSerializationBufferHealth({
      initialBufferEpisodes: 2,
      weeklyReleaseEpisodes: 1,
      weeklyTeamCapacityEpisodes: 0.5,
      safetyThresholdEpisodes: 1.5,
      weeksToSimulate: 5,
    });
    expect(buffer.firstWarningWeek).toBe(2); // 1주차 1.5화(안전), 2주차 1.0화(경고)
    expect(buffer.firstDepletedWeek).toBe(4); // 4주차 0.0화(고갈)
  });

  it("Kitsu + 툰메이트 에셋 캐스팅(+1/+10/-1, 범위 일괄, 복사, CSV) 및 투고용 50% 할인권 상업 연재 차단 가드를 검증한다", () => {
    let castings = adjustCutAssetCasting([], "CUT001", "a1", 1);
    castings = adjustCutAssetCasting(castings, "CUT001", "a1", 10);
    expect(castings[0]?.quantity).toBe(11);
    castings = adjustCutAssetCasting(castings, "CUT001", "a1", -1);
    expect(castings[0]?.quantity).toBe(10);

    const bulk = bulkCastAssetToCutRange(castings, ["CUT001", "CUT002"], "a2", 3);
    expect(bulk.find((c) => c.cutId === "CUT002" && c.assetId === "a2")?.quantity).toBe(3);

    const copied = copyCutCastingToTargets(bulk, "CUT001", ["CUT003"]);
    expect(copied.filter((c) => c.cutId === "CUT003")).toHaveLength(2);

    const assets = [
      {
        id: "a1",
        name: "북부 성채(.skp/.cs3o)",
        category: "background-3d" as const,
        status: "approved" as const,
        licenseTier: "pitch-50off" as const,
        formats: ["skp", "cs3o"] as const,
        aiTrainingRestricted: true,
        isGlobalLibraryAsset: false,
      },
      {
        id: "a2",
        name: "미승인 마차",
        category: "prop" as const,
        status: "wip" as const,
        licenseTier: "commercial-serialization" as const,
        formats: ["cs3o"] as const,
        aiTrainingRestricted: true,
        isGlobalLibraryAsset: true,
      },
    ];

    const commercialDiag = evaluateEpisodeAssetReadinessAndLicense({
      castings: copied,
      assets,
      episodePublicationMode: "commercial-serialization",
    });
    expect(commercialDiag.licenseViolationAssetIds).toEqual(["a1"]);
    expect(commercialDiag.unapprovedAssetIds).toEqual(["a2"]);
    expect(commercialDiag.blockedCutIds).toEqual(["CUT001", "CUT002", "CUT003"]);

    const pitchDiag = evaluateEpisodeAssetReadinessAndLicense({
      castings: [{ cutId: "CUT001", assetId: "a1", quantity: 1 }],
      assets,
      episodePublicationMode: "pitch",
    });
    expect(pitchDiag.licenseViolationAssetIds).toHaveLength(0);
    expect(pitchDiag.blockedCutIds).toHaveLength(0);

    const csv = exportAssetBreakdownCsv(copied, assets);
    expect(csv).toContain("cut_id,asset_id,asset_name,category,quantity,license_tier,formats");
    expect(csv).toContain("pitch-50off");
  });

  it("Kitsu형 Quotas(타임시트 가중치 vs WIP→WFA First-Take)와 Bid vs Actual 공수 편차, 노션형 종속성 시프트를 계산한다", () => {
    const logs = [
      {
        taskId: "t1",
        assigneeId: "u1",
        assigneeName: "김선화",
        role: "lineart" as const,
        cutCount: 30,
        bidHours: 16, // 2 인일
        firstWipDateIso: "2026-10-20",
        firstWfaDateIso: "2026-10-22", // 3영업일 동안 진행
        timesheetHoursByDate: { "2026-10-20": 12, "2026-10-21": 12 }, // 실제 타임시트는 2일만 총 24시간(3인일) 기록
      },
    ];

    const timesheetQuota = computeAssistantQuotasAndVariance({
      logs,
      mode: "timesheet-weighted",
      targetDailyCuts: 15,
    })[0]!;
    expect(timesheetQuota.activeDaysCount).toBe(2);
    expect(timesheetQuota.averageDailyCuts).toBe(15);
    expect(timesheetQuota.quotaAchievementPercent).toBe(100);
    expect(timesheetQuota.bidPersonDays).toBe(2);
    expect(timesheetQuota.actualPersonDays).toBe(3);
    expect(timesheetQuota.variancePersonDays).toBe(1);
    expect(timesheetQuota.estimationHealth).toBe("overrun");

    const statusQuota = computeAssistantQuotasAndVariance({
      logs,
      mode: "status-first-take",
      targetDailyCuts: 15,
    })[0]!;
    expect(statusQuota.activeDaysCount).toBe(3);
    expect(statusQuota.averageDailyCuts).toBe(10);

    const shifted = shiftDependentAssistantTasks({
      tasks: [
        {
          id: "t1",
          episodeNumber: 12,
          cutRangeLabel: "CUT001-020",
          cutCount: 20,
          role: "lineart",
          assigneeId: "u1",
          assigneeName: "김선화",
          status: "wip",
          dueDateIso: "2026-10-27",
          dependencyTaskIds: [],
          latestFileName: null,
          latestPreviewUrl: null,
          inputFileName: null,
          inputPreviewUrl: null,
          readyForRole: null,
        },
        {
          id: "t2",
          episodeNumber: 12,
          cutRangeLabel: "CUT001-020",
          cutCount: 20,
          role: "flatting",
          assigneeId: "u2",
          assigneeName: "이밑색",
          status: "todo",
          dueDateIso: "2026-10-28",
          dependencyTaskIds: ["t1"],
          latestFileName: null,
          latestPreviewUrl: null,
          inputFileName: null,
          inputPreviewUrl: null,
          readyForRole: null,
        },
      ],
      anchorTaskId: "t1",
      deltaDays: 3,
    });
    expect(shifted[0]?.dueDateIso).toBe("2026-10-30");
    expect(shifted[1]?.dueDateIso).toBe("2026-10-31");

    const projected = projectNotionProductionDatabase({
      tasks: shifted,
      view: "kanban",
      roleFilter: "all",
      viewerId: "u1",
      isLeadOrPd: false,
    });
    expect(projected.filteredTasks[0]?.canEditRow).toBe(true);
    expect(projected.filteredTasks[1]?.canEditRow).toBe(false);
  });

  it("ProductionPmsBlueprintSuite 컴포넌트를 렌더링하고 5대 엔진 UI 상호작용을 수행한다", () => {
    render(<ProductionPmsBlueprintSuite />);

    expect(screen.getByTestId("production-pms-blueprint-suite")).toBeTruthy();
    expect(screen.getByTestId("handover-validation-badge").textContent).toBe("인계 규격 통과");

    // 1. 잘못된 파일명 입력 시 즉시 인계 규격 위반 감지
    fireEvent.change(screen.getByTestId("handover-filename-input"), {
      target: { value: "12화_선화_최종.clip" },
    });
    expect(screen.getByTestId("handover-validation-badge").textContent).toBe("인계 규격 위반");
    expect(screen.getByTestId("handover-error-list")).toBeTruthy();

    // 2. Kitsu형 선화 완료 자동화 트리거 → 밑색 Ready 전이 및 파일 인계 확인
    fireEvent.click(screen.getByTestId("trigger-lineart-done-automation-btn"));
    expect(screen.getByTestId("pms-automation-status-banner").textContent).toContain(
      "밑색(Flatting) 상태 'ready' 자동 전이",
    );
    expect(screen.getByTestId("notion-row-status-task-ep12-flatting").textContent).toBe("ready");
    expect(screen.getByTestId("notion-row-input-file-task-ep12-flatting").textContent).toContain(
      "NORTH_EP012_CUT001-020_lineart_v02.clip",
    );

    // 3. 툰메이트형 역산 캘린더 컷수 변경 및 세이브 원고 버퍼 시뮬레이션
    fireEvent.change(screen.getByTestId("reverse-cut-count-input"), {
      target: { value: "90" },
    });
    expect(screen.getByTestId("reverse-slot-lineart").textContent).toContain("30h");

    // 4. 에셋 브레이크다운 캐스팅 수량 조절, 라이선스 업그레이드 및 CSV 내보내기
    fireEvent.click(screen.getByTestId("cast-plus10-asset-char-kael"));
    expect(screen.getByTestId("cut1-qty-asset-char-kael").textContent).toContain("11");

    expect(screen.getByTestId("asset-license-warning-box").textContent).toContain(
      "투고용 50% 할인권",
    );
    fireEvent.click(screen.getByTestId("upgrade-citadel-license-btn"));
    expect(screen.getByTestId("asset-license-warning-box").textContent).not.toContain(
      "투고용 50% 할인권",
    );

    fireEvent.click(screen.getByTestId("export-asset-breakdown-csv-btn"));
    expect(screen.getByTestId("asset-breakdown-csv-preview").textContent).toContain(
      "asset-char-kael",
    );

    // 5. 노션 다중 뷰 전환, 담당자별 권한 토글 및 선행 지연 +2일 연쇄 이동
    fireEvent.click(screen.getByTestId("notion-view-btn-kanban"));
    expect(screen.getByTestId("notion-db-active-view").getAttribute("data-view-mode")).toBe(
      "kanban",
    );

    fireEvent.click(screen.getByTestId("notion-lead-permission-toggle"));
    expect(screen.getByTestId("notion-row-perm-task-ep12-flatting").textContent).toContain(
      "읽기 전용(타 담당)",
    );

    fireEvent.click(screen.getByTestId("cascade-shift-dependent-tasks-btn"));
    expect(screen.getByTestId("notion-row-due-task-ep12-retouch").textContent).toContain(
      "2026-11-01",
    );
  });
});
