// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  addCutRedPenFeedback,
  buildSvgPathFromRedPenPoints,
  computeCorePipelineDashboardSummary,
  computeLargeManuscriptDeltaRevision,
  inspectPsdClipLayerSeparation,
  mapSubStageToCoreStage,
  summarizeCutRedPenByCutAndStage,
  transitionCutRedPenStatus,
} from "./production-webtoon-now-pms-model";
import {
  analyzeAssistantBottlenecks,
  computeArtistCareerSummary,
  computeStudioMgRsSettlement,
  detectDelayedSeriesAndStages,
  recommendAssistantLoadRebalance,
  summarizeMultiSeriesErpFleet,
  validateAtoonSeriesSubmission,
  type SerializedSeriesErpEntry,
  type StudioAssistantNode,
} from "./production-studio-erp-bottleneck-model";
import { ProductionWebtoonNowPmsSuite } from "./ProductionWebtoonNowPmsSuite";
import { ProductionStudioErpBottleneckSuite } from "./ProductionStudioErpBottleneckSuite";

describe("웹툰나우(Webtoon Now) PMS 및 투니스트·스튜디오 전용 ERP 도메인 모델·UI 검증", () => {
  it("웹툰나우 4단계 핵심 파이프라인(콘티➡️선화➡️채색➡️후가공) 매핑, PSD/CLIP 레이어 분리 검수, 대용량 이미지 델타 수정, 빨간 펜 피드백을 계산한다", () => {
    expect(mapSubStageToCoreStage("script-conti")).toBe("storyboard");
    expect(mapSubStageToCoreStage("draw-conti")).toBe("storyboard");
    expect(mapSubStageToCoreStage("lineart")).toBe("lineart");
    expect(mapSubStageToCoreStage("background-3d")).toBe("lineart");
    expect(mapSubStageToCoreStage("flat-color")).toBe("coloring");
    expect(mapSubStageToCoreStage("shading")).toBe("coloring");
    expect(mapSubStageToCoreStage("vfx-compositing")).toBe("postprocess");
    expect(mapSubStageToCoreStage("typesetting")).toBe("postprocess");

    const dashboard = computeCorePipelineDashboardSummary([
      {
        id: "c1",
        episodeNumber: 12,
        cutNumber: 1,
        coreStage: "storyboard",
        subStage: "draw-conti",
        assigneeName: "콘티작가",
        status: "approved",
        openRedPenCount: 0,
        layerSeparatedValid: true,
        estimatedHours: 2,
        elapsedHours: 2,
      },
      {
        id: "c2",
        episodeNumber: 12,
        cutNumber: 2,
        coreStage: "coloring",
        subStage: "shading",
        assigneeName: "채색어시",
        status: "redline-requested",
        openRedPenCount: 2,
        layerSeparatedValid: false,
        estimatedHours: 4,
        elapsedHours: 5,
      },
    ]);

    const storyboardStage = dashboard.find((s) => s.coreStage === "storyboard");
    const coloringStage = dashboard.find((s) => s.coreStage === "coloring");
    expect(storyboardStage?.completionPercent).toBe(100);
    expect(storyboardStage?.handoffGateBlocked).toBe(false);
    expect(coloringStage?.handoffGateBlocked).toBe(true);
    expect(coloringStage?.blockReasonKo).toContain("미해결 빨간펜 피드백");

    const inspectionFail = inspectPsdClipLayerSeparation(
      {
        fileName: "EP12.psd",
        format: "PSD",
        totalSizeMb: 280,
        canvasWidthPx: 1440,
        canvasHeightPx: 20000,
        dpi: 150,
        colorProfile: "CMYK",
        layers: [
          {
            id: "l1",
            name: "선화+밑색 병합본",
            role: "lineart",
            blendMode: "normal",
            isMergedOrFlattened: true,
            isAlphaLocked: false,
            isVisible: true,
            byteSizeMb: 120,
          },
        ],
      },
      "coloring",
    );
    expect(inspectionFail.valid).toBe(false);
    expect(inspectionFail.issues.some((i) => i.code === "merged-layer-error")).toBe(true);
    expect(inspectionFail.issues.some((i) => i.code === "cmyk-profile-warning")).toBe(true);
    expect(inspectionFail.issues.some((i) => i.code === "low-dpi-warning")).toBe(true);

    const delta = computeLargeManuscriptDeltaRevision({
      fileName: "EP12_MASTER.clip",
      format: "CLIP",
      fullFileSizeMb: 400,
      tiles: [
        {
          tileIndex: 1,
          cutNumbers: [1, 2, 3],
          startYPx: 0,
          endYPx: 10000,
          previousHash: "h1",
          nextHash: "h1",
          tileByteSizeMb: 200,
        },
        {
          tileIndex: 2,
          cutNumbers: [4, 5, 6],
          startYPx: 10000,
          endYPx: 20000,
          previousHash: "h2",
          nextHash: "h2_modified",
          tileByteSizeMb: 40,
        },
      ],
    });
    expect(delta.changedTileIndices).toEqual([2]);
    expect(delta.affectedCutNumbers).toEqual([4, 5, 6]);
    expect(delta.deltaTransferMb).toBe(40);
    expect(delta.bandwidthSavedPercent).toBe(90);

    const svgPath = buildSvgPathFromRedPenPoints(
      [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.8 },
      ],
      200,
      100,
    );
    expect(svgPath).toBe("M 20 20 L 100 80");

    const emptyCheck = addCutRedPenFeedback([], {
      id: "rp-err",
      episodeNumber: 12,
      cutNumber: 12,
      targetCoreStage: "lineart",
      targetLayerRole: "lineart",
      authorName: "PD",
      instruction: "   ",
      priority: "critical",
      strokes: [],
      createdAtIso: "2026-10-26T10:00:00.000Z",
    });
    expect(emptyCheck.added).toBe(false);

    const added = addCutRedPenFeedback([], {
      id: "rp-ok",
      episodeNumber: 12,
      cutNumber: 12,
      targetCoreStage: "lineart",
      targetLayerRole: "lineart",
      authorName: "PD",
      instruction: "12컷 어깨선 빨간펜 교정",
      priority: "critical",
      strokes: [
        {
          id: "s1",
          tool: "freehand-pen",
          color: "#ef4444",
          strokeWidthPx: 3,
          points: [{ x: 0.2, y: 0.3 }],
        },
      ],
      createdAtIso: "2026-10-26T10:00:00.000Z",
    });
    expect(added.added).toBe(true);
    expect(added.items).toHaveLength(1);

    const resolvedList = transitionCutRedPenStatus(
      added.items,
      "rp-ok",
      "resolved",
      "2026-10-26T12:00:00.000Z",
    );
    expect(resolvedList[0]?.status).toBe("resolved");
    const summary = summarizeCutRedPenByCutAndStage(resolvedList);
    expect(summary.resolvedCount).toBe(1);
    expect(summary.strokeAttachedCount).toBe(1);
  });

  it("스튜디오 전용 ERP(재담·케나즈·투니스트·스피노프) 동시 연재작 채색 지연 감지, 어시스턴트 병목 재배치, 에이툰 투고 규격 및 MG/RS 정산을 계산한다", () => {
    const sampleSeries: readonly SerializedSeriesErpEntry[] = [
      {
        seriesId: "s-1",
        title: "작품 A",
        track: "production-investment",
        platform: "네이버웹툰",
        serialDayOfWeek: "수",
        currentEpisodeNumber: 20,
        preProductionBufferEpisodes: 0,
        currentStage: "03-color",
        stageDelayHours: {
          "01-storyboard": 0,
          "02-lineart": 0,
          "03-color": 26,
          "04-background": 0,
          "05-postprocess": 0,
          "06-editing": 0,
          "07-localization": 0,
        },
        assignedColorAssistantId: "a-1",
        assignedLineAssistantId: "a-2",
        assignedBackgroundAssistantId: "a-2",
        pendingRedPenCount: 4,
        partnerCode: "KNZ-01",
      },
      {
        seriesId: "s-2",
        title: "작품 B",
        track: "inhouse-studio",
        platform: "카카오페이지",
        serialDayOfWeek: "금",
        currentEpisodeNumber: 15,
        preProductionBufferEpisodes: 5,
        currentStage: "06-editing",
        stageDelayHours: {
          "01-storyboard": 0,
          "02-lineart": 0,
          "03-color": 0,
          "04-background": 0,
          "05-postprocess": 0,
          "06-editing": 0,
          "07-localization": 0,
        },
        assignedColorAssistantId: "a-2",
        assignedLineAssistantId: "a-2",
        assignedBackgroundAssistantId: "a-2",
        pendingRedPenCount: 0,
        partnerCode: null,
      },
    ];

    const fleet = summarizeMultiSeriesErpFleet(sampleSeries);
    expect(fleet.totalSeriesCount).toBe(2);
    expect(fleet.coloringDelayedCount).toBe(1);
    expect(fleet.criticalSeriesCount).toBe(1);

    const delayedDiagnoses = detectDelayedSeriesAndStages(sampleSeries, "03-color");
    expect(delayedDiagnoses).toHaveLength(1);
    expect(delayedDiagnoses[0]?.isColoringDelayed).toBe(true);
    expect(delayedDiagnoses[0]?.severity).toBe("critical");

    const sampleAssistants: readonly StudioAssistantNode[] = [
      {
        assistantId: "a-1",
        name: "과부하 채색어시",
        primaryPart: "shading",
        dccTool: "clip-studio",
        proficiency: "high",
        workMode: "in-house",
        availability: "busy",
        assignedSeriesIds: ["s-1", "s-2"],
        wipCutCount: 60,
        dailyCapacityCuts: 15,
        openRevisionLoops: 4,
        ratePerEpisodeKrw: 400000,
      },
      {
        assistantId: "a-2",
        name: "여유 채색어시",
        primaryPart: "shading",
        dccTool: "clip-studio",
        proficiency: "high",
        workMode: "remote",
        availability: "immediate",
        assignedSeriesIds: [],
        wipCutCount: 5,
        dailyCapacityCuts: 20,
        openRevisionLoops: 0,
        ratePerEpisodeKrw: 400000,
      },
    ];

    const bottlenecks = analyzeAssistantBottlenecks(sampleAssistants, sampleSeries);
    expect(bottlenecks[0]?.bottleneckLevel).toBe("critical");
    expect(bottlenecks[0]?.rootCause).toBe("revision-loop");

    const rebalanced = recommendAssistantLoadRebalance(sampleAssistants, sampleSeries, "a-1");
    expect(rebalanced.rebalanced).toBe(true);
    expect(rebalanced.toAssistantId).toBe("a-2");
    expect(rebalanced.transferredCuts).toBeGreaterThan(0);

    const career = computeArtistCareerSummary([
      { workTitle: "첫 작품", startYearMonth: "2024-01", endYearMonth: "2024-12" },
      { workTitle: "두번째 작품", startYearMonth: "2025-01", endYearMonth: "2025-06" },
    ]);
    expect(career.totalMonths).toBe(18);
    expect(career.formattedKo).toBe("1년 6개월 (총 2작품)");

    const validPitch = validateAtoonSeriesSubmission({
      title: "정상 웹툰 타이틀",
      genres: ["판타지"],
      hashtags: ["#판타지", "#액션"],
      synopsis: "충분한 줄거리 설명",
      expectedEpisodeCount: 50,
      allowKrJpStudioMatching: true,
      bannerSizePx: { width: 1920, height: 1080, sizeMb: 1.5 },
      mainThumbSizePx: { width: 300, height: 420, sizeMb: 0.9 },
      episodeThumbSizePx: { width: 250, height: 125, sizeMb: 0.5 },
      sampleEpisodeCount: 3,
    });
    expect(validPitch.valid).toBe(true);

    const invalidPitch = validateAtoonSeriesSubmission({
      title: "",
      genres: [],
      hashtags: ["#1", "#2", "#3", "#4"],
      synopsis: "",
      expectedEpisodeCount: 0,
      allowKrJpStudioMatching: false,
      bannerSizePx: { width: 1000, height: 1000, sizeMb: 3 },
      mainThumbSizePx: { width: 100, height: 100, sizeMb: 3 },
      episodeThumbSizePx: { width: 100, height: 100, sizeMb: 3 },
      sampleEpisodeCount: 0,
    });
    expect(invalidPitch.valid).toBe(false);
    expect(invalidPitch.errorsKo.length).toBeGreaterThanOrEqual(5);

    const mgRs = computeStudioMgRsSettlement({
      grossPlatformRevenueKrw: 30000000,
      minimumGuaranteePerEpisodeKrw: 2000000,
      episodeCount: 4,
      creatorRsPercent: 50,
      assistantLaborCostKrw: 3000000,
    });
    expect(mgRs.totalMgKrw).toBe(8000000);
    expect(mgRs.grossRsShareKrw).toBe(15000000);
    expect(mgRs.excessRsPayoutKrw).toBe(7000000);
    expect(mgRs.creatorGrossPayoutKrw).toBe(15000000);
    expect(mgRs.creatorNetAfterAssistantKrw).toBe(12000000);
  });

  it("ProductionWebtoonNowPmsSuite 및 ProductionStudioErpBottleneckSuite UI 상호작용이 정상 동작한다", () => {
    render(
      <div>
        <ProductionWebtoonNowPmsSuite />
        <ProductionStudioErpBottleneckSuite />
      </div>,
    );

    // 1. 웹툰나우 4단계 필터 및 병합 레이어 복구
    expect(screen.getByTestId("production-webtoon-now-pms-suite")).toBeTruthy();
    fireEvent.click(screen.getByTestId("webtoon-now-stage-filter-coloring"));
    expect(screen.getByTestId("cut-pipeline-row-18")).toBeTruthy();

    fireEvent.click(screen.getByTestId("unmerge-psd-clip-layer-btn"));
    expect(screen.getByTestId("psd-clip-inspection-summary").textContent).toContain("100점");

    // 2. 빨간 펜 마킹 추가 및 칸별 피드백 등록·검수 완료
    fireEvent.click(screen.getByTestId("redpen-drawing-canvas"));
    fireEvent.change(screen.getByTestId("redpen-instruction-input"), {
      target: { value: "12컷 배경 투시선 빨간 펜 보정 요청" },
    });
    fireEvent.click(screen.getByTestId("submit-redpen-feedback-btn"));
    expect(screen.getByText("12컷 배경 투시선 빨간 펜 보정 요청")).toBeTruthy();

    fireEvent.click(screen.getByTestId("resolve-redpen-btn-rp-1"));
    expect(screen.getByTestId("reopen-redpen-btn-rp-1")).toBeTruthy();

    // 3. 스튜디오 전용 ERP 채색 지연 필터 & 어시스턴트 병목 1클릭 분산 재배치
    expect(screen.getByTestId("production-studio-erp-bottleneck-suite")).toBeTruthy();
    fireEvent.click(screen.getByTestId("filter-coloring-delayed-checkbox"));
    expect(screen.getByTestId("erp-series-row-sr-01")).toBeTruthy();

    fireEvent.click(screen.getByTestId("rebalance-assistant-btn-ast-color-1"));
    expect(screen.getByTestId("assistant-rebalance-notice").textContent).toContain("분산 재배치");

    // 4. 투니스트/에이툰 투고 규격 검증 및 정산 원장
    fireEvent.change(screen.getByTestId("atoon-banner-width-input"), {
      target: { value: "1200" },
    });
    expect(screen.getByTestId("atoon-validation-status").textContent).toContain("규격 오류");
  });
});
