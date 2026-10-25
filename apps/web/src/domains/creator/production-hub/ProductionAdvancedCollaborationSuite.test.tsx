// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  batchDeleteDeadlines,
  computeBatchEpisodeNumbers,
  deleteEpisodeWithOptionalPull,
  filterEpisodesByTreatment,
  generateBatchDeadlines,
  shiftDeadlinesCascade,
} from "./production-batch-schedule-model";
import {
  exportMonitoringRowsToCsv,
  filterMonitoringRows,
  toggleMonitoringColumn,
} from "./production-monitoring-suite-model";
import {
  buildShadingDownloadManifest,
  computeMultiplyShadedColor,
  recommendShadingResolution,
} from "./production-shading-assistant-model";
import {
  buildTextBlockDeepLink,
  checkVisibilityScopeNarrowing,
  classifySnapshotPageDiff,
  computeEpisodeTotalCutCount,
  computeTextBlockSideBySideDiff,
  computeWorkerContributionSplit,
  deriveProcessStartedAtIso,
} from "./production-snapshot-lifecycle-model";
import {
  addSideViewerSlot,
  bulkUpdateFeedbackVisibility,
  computeAutoScrollStepPx,
  computeCompareSyncedScrollTop,
  cycleAutoScrollSpeed,
  cycleOptimalWidthLock,
  cycleViewerToolbarDock,
  filterVisibleFeedbacks,
  findFocusedFeedbackForScroll,
  publishAllDraftFeedbacks,
  toggleHorizontalPageFilter,
} from "./production-viewer-controls-model";
import {
  buildProtectedShareMessageTemplate,
  computeInviteSeatRequirement,
  formatDynamicShareWatermark,
  validateThumbnailSpecDimensions,
} from "./production-workspace-governance-model";
import { ProductionBatchScheduleSuite } from "./ProductionBatchScheduleSuite";
import { ProductionFocusedAiWorkflow } from "./ProductionFocusedAiWorkflow";
import { ProductionMonitoringSuite } from "./ProductionMonitoringSuite";
import { ProductionSnapshotLifecycleSuite } from "./ProductionSnapshotLifecycleSuite";
import { ProductionViewerControlsBar } from "./ProductionViewerControlsBar";
import { ProductionWorkspaceGovernanceSuite } from "./ProductionWorkspaceGovernanceSuite";

describe("Production 고급 협업 도메인 모델 및 UI 스위트 검증", () => {
  it("뷰어 단축키 순환, 3종 비교 동기화(A/S/P), 사이드 뷰어 최대 2개 제한, 초안 일괄 발행 및 포커스를 계산한다", () => {
    expect(cycleViewerToolbarDock("bottom")).toBe("right");
    expect(cycleViewerToolbarDock("right")).toBe("left");
    expect(cycleOptimalWidthLock("free")).toBe(720);
    expect(cycleOptimalWidthLock(720)).toBe(1080);
    expect(cycleAutoScrollSpeed(0)).toBe(1);
    expect(computeAutoScrollStepPx(2, 500)).toBe(120);

    expect(
      computeCompareSyncedScrollTop({
        mode: "all",
        sourceScrollTop: 600,
        sourceMaxScroll: 2000,
        targetMaxScroll: 3000,
      }),
    ).toBe(600);

    expect(
      computeCompareSyncedScrollTop({
        mode: "scroll-offset",
        sourceScrollTop: 600,
        sourceMaxScroll: 2000,
        targetMaxScroll: 3000,
        manualOffsetPx: 250,
      }),
    ).toBe(850);

    expect(
      computeCompareSyncedScrollTop({
        mode: "page-proportional",
        sourceScrollTop: 1000,
        sourceMaxScroll: 2000,
        targetMaxScroll: 3200,
      }),
    ).toBe(1600);

    const s1 = addSideViewerSlot([], {
      id: "s1",
      episodeId: "ep-10",
      episodeLabel: "10화",
      processLabel: "선화",
    });
    const s2 = addSideViewerSlot(s1.slots, {
      id: "s2",
      episodeId: "ep-11",
      episodeLabel: "11화",
      processLabel: "채색",
    });
    const s3 = addSideViewerSlot(s2.slots, {
      id: "s3",
      episodeId: "ep-12",
      episodeLabel: "12화",
      processLabel: "식자",
    });
    expect(s2.added).toBe(true);
    expect(s3.added).toBe(false);
    expect(s3.slots).toHaveLength(2);

    const sampleFeedbacks = [
      {
        id: "f1",
        authorId: "me",
        authorName: "PD",
        body: "내 비공개 초안",
        pageNumber: 1,
        normalizedY: 0.2,
        visibility: "private" as const,
        importance: "required" as const,
        resolved: false,
        hasDrawing: true,
      },
      {
        id: "f2",
        authorId: "me",
        authorName: "PD",
        body: "일부 공개 코멘트",
        pageNumber: 2,
        normalizedY: 0.7,
        visibility: "restricted" as const,
        importance: "recommended" as const,
        resolved: false,
        hasDrawing: false,
      },
    ];

    expect(filterVisibleFeedbacks(sampleFeedbacks, { viewerId: "guest", canEdit: false })).toHaveLength(0);
    expect(filterVisibleFeedbacks(sampleFeedbacks, { viewerId: "editor-2", canEdit: true })).toHaveLength(1);

    const published = publishAllDraftFeedbacks(sampleFeedbacks, "me", "public");
    expect(published.publishedCount).toBe(1);
    expect(published.items[0]?.visibility).toBe("public");

    const bulkChanged = bulkUpdateFeedbackVisibility(published.items, new Set(["f1", "f2"]), "restricted");
    expect(bulkChanged.every((item) => item.visibility === "restricted")).toBe(true);

    const focused = findFocusedFeedbackForScroll(sampleFeedbacks, 0.65);
    expect(focused?.id).toBe("f2");

    expect(toggleHorizontalPageFilter([1, 2], 2)).toEqual([1]);
    expect(toggleHorizontalPageFilter([1], 1)).toEqual([1]);
  });

  it("버전 라이프사이클 5종 배지, 공개 범위 좁히기 경고, 공정 시작 시각 역산, 작업자 기여도 100% 배분, 텍스트 블록 Diff를 계산한다", () => {
    expect(classifySnapshotPageDiff({ previousHash: null, nextHash: "h1" })).toBe("new");
    expect(classifySnapshotPageDiff({ previousHash: "h1", nextHash: "h2" })).toBe("updated");
    expect(classifySnapshotPageDiff({ previousHash: "h1", nextHash: "h1", isDuplicateUpload: true })).toBe(
      "duplicate-skipped",
    );
    expect(classifySnapshotPageDiff({ previousHash: "h1", nextHash: "h1" })).toBe("unchanged");
    expect(classifySnapshotPageDiff({ previousHash: "h1", nextHash: null })).toBe("empty");

    const cuts = computeEpisodeTotalCutCount([{ cutCount: 15 }, { cutCount: 20 }], 42);
    expect(cuts.autoSum).toBe(35);
    expect(cuts.effectiveTotal).toBe(42);
    expect(cuts.isManual).toBe(true);

    expect(checkVisibilityScopeNarrowing("public", "restricted").narrowed).toBe(true);
    expect(checkVisibilityScopeNarrowing("private", "public").narrowed).toBe(false);

    expect(deriveProcessStartedAtIso("2026-10-26T10:00:00.000Z", 4)).toBe("2026-10-26T06:00:00.000Z");

    const workers = [
      { workerId: "w1", workerName: "작가 A", workHours: 7 },
      { workerId: "w2", workerName: "작가 B", workHours: 2 },
      { workerId: "w3", workerName: "작가 C", workHours: 1 },
    ];
    const proportional = computeWorkerContributionSplit(workers, "time-proportional");
    expect(proportional.reduce((sum, w) => sum + w.contributionPercent, 0)).toBe(100);
    expect(proportional[0]?.contributionPercent).toBe(70);

    const equal = computeWorkerContributionSplit(workers, "equal");
    expect(equal.reduce((sum, w) => sum + w.contributionPercent, 0)).toBe(100);
    expect(equal.map((w) => w.contributionPercent)).toEqual([34, 33, 33]);

    expect(buildTextBlockDeepLink("https://app.toonstudio.io/ep/12", "blk-7")).toContain("blockId=blk-7");

    const diff = computeTextBlockSideBySideDiff(
      [{ blockId: "b1", kind: "text", content: "초안", feedbackCount: 1 }],
      [
        { blockId: "b1", kind: "text", content: "수정본", feedbackCount: 1 },
        { blockId: "b2", kind: "h2", content: "신규 장", feedbackCount: 0 },
      ],
      { showBlankPlaceholders: true },
    );
    expect(diff).toHaveLength(2);
    expect(diff[0]?.status).toBe("modified");
    expect(diff[1]?.status).toBe("added");
    expect(diff[1]?.left).toBeNull();
  });

  it("복수 회차 번호 건너뛰기, 삭제 시 기존 회차 당기기(-1), 주말·특별편 제외 데드라인 생성 및 연쇄 이동을 계산한다", () => {
    const batch = computeBatchEpisodeNumbers({
      startNumber: 1,
      endNumber: 5,
      existingNumbers: [2, 4],
    });
    expect(batch.createdNumbers).toEqual([1, 3, 5]);
    expect(batch.skippedNumbers).toEqual([2, 4]);

    const pulled = deleteEpisodeWithOptionalPull(
      [
        {
          episodeId: "e1",
          episodeNumber: 1,
          title: "1화",
          treatment: "서막",
          isSpecial: false,
          referenceEpisodeId: null,
          placement: null,
        },
        {
          episodeId: "e2",
          episodeNumber: 2,
          title: "2화",
          treatment: "전개",
          isSpecial: false,
          referenceEpisodeId: null,
          placement: null,
        },
        {
          episodeId: "e3",
          episodeNumber: 3,
          title: "3화",
          treatment: "절정",
          isSpecial: false,
          referenceEpisodeId: null,
          placement: null,
        },
      ],
      "e2",
      true,
    );
    expect(pulled.map((e) => e.episodeNumber)).toEqual([1, 2]);
    expect(filterEpisodesByTreatment(pulled, "절정")).toHaveLength(1);

    const generated = generateBatchDeadlines({
      episodes: [
        ...pulled,
        {
          episodeId: "esp",
          episodeNumber: null,
          title: "특별편",
          treatment: "외전",
          isSpecial: true,
          referenceEpisodeId: "e1",
          placement: "after",
        },
      ],
      processKeys: [{ key: "lineart", label: "선화" }],
      startDateIso: "2026-10-26",
      intervalDays: 5,
      includeWeekends: false,
      ignoreSpecialEpisodes: true,
      overwriteExisting: true,
      existingDeadlines: [],
    });
    expect(generated.mergedDeadlines).toHaveLength(2);
    // 2026-10-26(월)에서 영업일 5일 뒤는 토·일(10/31, 11/01)을 건너뛰어 2026-11-02(월)
    expect(generated.mergedDeadlines[1]?.dueDateIso).toBe("2026-11-02");

    const shifted = shiftDeadlinesCascade({
      deadlines: generated.mergedDeadlines,
      anchorId: generated.mergedDeadlines[0]!.id,
      deltaDays: 2,
      mode: "cascade",
    });
    expect(shifted[0]?.dueDateIso).toBe("2026-10-28");
    expect(shifted[1]?.dueDateIso).toBe("2026-11-04");

    const deleted = batchDeleteDeadlines({
      deadlines: shifted,
      episodeIds: new Set(["e1"]),
      processKeys: new Set(["lineart"]),
    });
    expect(deleted.deletedCount).toBe(1);
    expect(deleted.remaining).toHaveLength(1);
  });

  it("AI 음영 2K/4K 토큰 추천, Multiply 블렌딩 색상, 병합/분리 다운로드 매니페스트, 모니터링 CSV, 시트 필요 여부를 계산한다", () => {
    expect(recommendShadingResolution(1600, 1800)).toMatchObject({ resolution: "2K", estimatedTokens: 40 });
    expect(recommendShadingResolution(2400, 1800)).toMatchObject({ resolution: "4K", estimatedTokens: 55 });

    const blended = computeMultiplyShadedColor({
      baseRgb: { r: 240, g: 220, b: 200 },
      shadowHex: "#5c5470",
      maskStrength: 0.8,
      opacityPercent: 75,
    });
    expect(blended.hex).toMatch(/^#[0-9a-f]{6}$/u);
    expect(blended.r).toBeLessThan(240);

    const regions = [
      {
        id: "r1",
        pageNumber: 1,
        label: "영역1",
        widthPx: 1200,
        heightPx: 1200,
        lightDirection: "top-left" as const,
        edgeStyle: "hard" as const,
        shadowAmount: "normal" as const,
        resolution: "2K" as const,
        shadowHex: "#5c5470",
        opacityPercent: 70,
        visible: true,
      },
      {
        id: "r2",
        pageNumber: 1,
        label: "영역2",
        widthPx: 1200,
        heightPx: 1200,
        lightDirection: "backlight" as const,
        edgeStyle: "soft" as const,
        shadowAmount: "backlight" as const,
        resolution: "2K" as const,
        shadowHex: "#5c5470",
        opacityPercent: 70,
        visible: true,
      },
    ];
    expect(buildShadingDownloadManifest({ regions, scope: "all", packaging: "merged" })).toHaveLength(1);
    expect(buildShadingDownloadManifest({ regions, scope: "all", packaging: "separated" })).toHaveLength(2);

    const cols = toggleMonitoringColumn(["occurredAt", "episode"], "episode");
    expect(cols).toEqual(["occurredAt"]);
    const csv = exportMonitoringRowsToCsv(
      filterMonitoringRows(
        [
          {
            id: "m1",
            tab: "version",
            occurredAt: "2026-10-26",
            episode: "12화",
            process: "선화",
            actor: "홍길동",
            isDepartedMember: true,
            summary: "v2, 업데이트",
            status: "공개",
            workHours: 8,
            contributionPercent: 100,
          },
        ],
        { tab: "version", query: "12화", includeDepartedMembers: true },
      ),
      ["episode", "actor", "summary"],
    );
    expect(csv).toContain('"v2, 업데이트"');
    expect(csv).toContain("홍길동 (탈퇴)");

    expect(validateThumbnailSpecDimensions(120, 400).valid).toBe(false);
    expect(validateThumbnailSpecDimensions(720, 960).valid).toBe(true);

    expect(
      computeInviteSeatRequirement({
        workspaceRole: "guest",
        projectPermissions: ["comment"],
        processPermissions: ["view"],
      }).requiresPaidSeat,
    ).toBe(false);

    expect(
      computeInviteSeatRequirement({
        workspaceRole: "guest",
        projectPermissions: ["comment"],
        processPermissions: ["limited-edit"],
      }).requiresPaidSeat,
    ).toBe(true);

    expect(formatDynamicShareWatermark("김편집", "2026-10-26")).toContain("김편집 · 열람일 2026-10-26");
    expect(
      buildProtectedShareMessageTemplate(
        {
          shareId: "s1",
          recipientIdentifier: "김편집",
          password: "pw",
          expiresAtIso: "2026-11-01",
          watermarkEnabled: true,
          ndaBannerEnabled: true,
          isActive: true,
          selectedEpisodeProcessLabels: ["12화 선화"],
        },
        "https://app.toonstudio.io/share/s1",
      ),
    ).toContain("https://app.toonstudio.io/share/s1");
  });

  it("5개 신규 협업 UI 스위트와 AI 음영 세부 패널을 렌더링하고 상호작용한다", () => {
    render(
      <MemoryRouter>
        <div>
          <ProductionViewerControlsBar />
          <ProductionSnapshotLifecycleSuite />
          <ProductionBatchScheduleSuite />
          <ProductionFocusedAiWorkflow workId="work-1" process={null} editorHref={null} />
          <ProductionMonitoringSuite />
          <ProductionWorkspaceGovernanceSuite />
        </div>
      </MemoryRouter>,
    );

    // 1. ProductionViewerControlsBar 상호작용
    expect(screen.getByTestId("production-viewer-controls-bar")).toBeTruthy();
    fireEvent.click(screen.getByTestId("viewer-dock-cycle-btn"));
    expect(screen.getByTestId("production-viewer-controls-bar").getAttribute("data-toolbar-dock")).toBe("right");

    fireEvent.click(screen.getByTestId("viewer-mode-horizontal-btn"));
    expect(screen.getByTestId("viewer-horizontal-spread-bar")).toBeTruthy();

    fireEvent.click(screen.getByTestId("publish-all-draft-feedbacks-btn"));
    expect(screen.getByTestId("viewer-controls-status-notice").textContent).toContain("전체 공개로 일괄 발행");

    // 2. ProductionSnapshotLifecycleSuite 상호작용
    expect(screen.getByTestId("production-snapshot-lifecycle-suite")).toBeTruthy();
    fireEvent.click(screen.getByTestId("snapshot-visibility-private-btn"));
    expect(screen.getByTestId("snapshot-visibility-narrowing-warning")).toBeTruthy();

    fireEvent.click(screen.getByTestId("step1-worker-complete-btn"));
    expect(screen.getByTestId("snapshot-completion-stage-badge").textContent).toContain("1단계: 작업자 작업 완료");

    fireEvent.click(screen.getByTestId("step2-process-finalize-btn"));
    expect(screen.getByTestId("snapshot-completion-stage-badge").textContent).toContain("2단계: 관리자 공정 마감 완료");

    // 3. ProductionBatchScheduleSuite 상호작용
    expect(screen.getByTestId("production-batch-schedule-suite")).toBeTruthy();
    fireEvent.click(screen.getByTestId("add-batch-episodes-btn"));
    expect(screen.getByTestId("batch-schedule-status-message").textContent).toContain("복수 회차 생성 완료");

    // 4. ProductionFocusedAiWorkflow 음영 어시스턴트 세부 패널 상호작용
    expect(screen.getByTestId("shading-assistant-detail-panel")).toBeTruthy();
    fireEvent.change(screen.getByTestId("shading-crop-width-input"), { target: { value: "2560" } });
    expect(screen.getByTestId("shading-resolution-recommendation-badge").textContent).toContain("4K");

    // 5. ProductionMonitoringSuite 상호작용
    expect(screen.getByTestId("production-monitoring-suite")).toBeTruthy();
    fireEvent.click(screen.getByTestId("export-monitoring-csv-btn"));
    expect(screen.getByTestId("monitoring-csv-output-preview")).toBeTruthy();

    // 6. ProductionWorkspaceGovernanceSuite 상호작용
    expect(screen.getByTestId("production-workspace-governance-suite")).toBeTruthy();
    expect(screen.getByTestId("invite-seat-requirement-banner").textContent).toContain("무료 초대");
    fireEvent.change(screen.getByTestId("invite-process-perm-select"), { target: { value: "limited-edit" } });
    expect(screen.getByTestId("invite-seat-requirement-banner").textContent).toContain("유료 시트 1개 필요");

    fireEvent.click(screen.getByTestId("copy-protected-share-message-btn"));
    expect(screen.getByTestId("copied-share-message-preview")).toBeTruthy();
  });
});
