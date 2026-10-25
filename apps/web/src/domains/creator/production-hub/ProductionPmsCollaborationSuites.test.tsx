// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  buildBurnInSlateOverlay,
  compareMediaVersionSpecs,
  computePipelineMatrixSummary,
  evaluateVersionLineageHealth,
  syncVersionToLatestUpstream,
  transitionCutStepWithAutoHandoff,
  type ShotGridCutMatrixRow,
  type ShotGridMediaVersion,
  type ShotGridPublishedAsset,
} from "./production-shotgrid-version-lineage-model";
import {
  analyzeBlockerAndCriticalPath,
  computeCutEffortPoints,
  evaluateAssigneeWorkloadBalance,
  filterJiraIssuesSmart,
  recommendWorkloadReassignment,
  transitionIssueWithAutomation,
  type JiraAssigneeCapacityProfile,
  type JiraAutomationRule,
  type JiraProductionIssue,
} from "./production-jira-agile-workflow-model";
import {
  computeContentCalendarBufferMetrics,
  computeLoreBibleRollups,
  evaluateWikiVerificationStatus,
  instantiateStudioLoreTemplate,
  renewLoreVerification,
  toggleCalendarLoreRelation,
  type NotionContentCalendarRecord,
  type NotionLoreRecord,
} from "./production-notion-knowledge-calendar-model";
import { ProductionShotGridVersionLineageSuite } from "./ProductionShotGridVersionLineageSuite";
import { ProductionJiraAgileWorkflowSuite } from "./ProductionJiraAgileWorkflowSuite";
import { ProductionNotionKnowledgeCalendarSuite } from "./ProductionNotionKnowledgeCalendarSuite";

describe("전문 협업 및 공정 관리(ShotGrid · Jira · Notion) 내재화 모델 및 UI 검증", () => {
  it("ShotGrid: 업스트림 PublishedFile 구버전 참조 감지, 최신 리비전 리바인딩, Burn-in Slate, 공정 자동 인계(WTG->RDY)를 계산한다", () => {
    const assets: readonly ShotGridPublishedAsset[] = [
      {
        assetId: "ast-1",
        assetCode: "AST-BG-CASTLE",
        assetName: "북부 성채 3D 세트",
        assetType: "bg_3d_scene",
        latestRevision: 4,
        publishedBy: "박도윤",
        publishedAtIso: "2026-10-26T00:00:00Z",
        fileFormat: "BLEND",
        checksumSha256Short: "1122aabb",
      },
      {
        assetId: "ast-2",
        assetCode: "AST-CHAR-KAEL",
        assetName: "카엘 모델 시트",
        assetType: "character_sheet",
        latestRevision: 2,
        publishedBy: "김서연",
        publishedAtIso: "2026-10-25T00:00:00Z",
        fileFormat: "CLIP",
        checksumSha256Short: "3344ccdd",
      },
    ];

    const versionV1: ShotGridMediaVersion = {
      versionId: "v-1",
      versionCode: "EP04_CUT012_SHD_v001",
      episodeCode: "EP04",
      cutCode: "CUT-012",
      cutTitle: "봉인석 각성",
      pipelineStep: "shading",
      revisionNumber: 1,
      status: "cbb",
      artistName: "이지안",
      submittedAtIso: "2026-10-25T12:00:00Z",
      sourceSpec: {
        fileFormat: "CLIP",
        widthPx: 1440,
        heightPx: 4000,
        colorSpace: "Display-P3",
        layerCount: 50,
        fileSizeMb: 150,
      },
      upstreamPins: [
        { assetId: "ast-1", pinnedRevision: 2 },
        { assetId: "ast-2", pinnedRevision: 2 },
      ],
      directorNotes: [
        { noteId: "n-1", author: "최현우", scrollYOrFrame: 1200, body: "배경 세트 갱신 필요", resolved: false },
      ],
    };

    const health = evaluateVersionLineageHealth(versionV1, assets);
    expect(health.isUpToDate).toBe(false);
    expect(health.outdatedAssets).toHaveLength(1);
    expect(health.outdatedAssets[0]?.assetCode).toBe("AST-BG-CASTLE");
    expect(health.outdatedAssets[0]?.revisionDelta).toBe(2);

    const slateBefore = buildBurnInSlateOverlay(versionV1, "북부 성채", assets);
    expect(slateBefore.lineageWarningBanner).toContain("AST-BG-CASTLE v2→v4");

    const synced = syncVersionToLatestUpstream(versionV1, assets, "2026-10-26T06:00:00Z");
    expect(synced.revisionNumber).toBe(2);
    expect(synced.versionCode).toBe("EP04_CUT012_SHD_v002");
    expect(synced.status).toBe("rev");
    expect(evaluateVersionLineageHealth(synced, assets).isUpToDate).toBe(true);

    const diff = compareMediaVersionSpecs(versionV1, {
      ...synced,
      sourceSpec: { ...synced.sourceSpec, heightPx: 4320, layerCount: 58, fileSizeMb: 172.5 },
    });
    expect(diff.revisionGap).toBe(1);
    expect(diff.heightDeltaPx).toBe(320);
    expect(diff.layerCountDelta).toBe(8);
    expect(diff.fileSizeDeltaMb).toBe(22.5);

    const matrixRows: readonly ShotGridCutMatrixRow[] = [
      {
        cutCode: "CUT-012",
        cutTitle: "봉인석 각성",
        sequenceName: "SEQ-02",
        stepStatuses: {
          storyboard: "fin",
          bg3d: "omt",
          lineart: "ip",
          flat: "wtg",
          shading: "wtg",
          compositing: "wtg",
        },
      },
    ];

    // 선화(lineart)가 apr(승인)로 전환되면 다음 활성 공정인 밑색(flat)이 wtg -> rdy로 자동 승격되어야 함
    const handoffResult = transitionCutStepWithAutoHandoff(
      matrixRows,
      "CUT-012",
      "lineart",
      "apr",
    );
    expect(handoffResult.autoPromotedStep).toBe("flat");
    expect(handoffResult.updatedRows[0]?.stepStatuses.flat).toBe("rdy");

    const summary = computePipelineMatrixSummary(handoffResult.updatedRows);
    expect(summary.readyToStartCount).toBe(1);
    expect(summary.overallProgressPercent).toBeGreaterThan(0);
  });

  it("Jira: 컷 가중치 포인트 계산, 선후행 블로커 진단, 담당자 용량 과부하 분산 추천, WHEN-IF-THEN 자동화 규칙을 수행한다", () => {
    expect(computeCutEffortPoints(5, "dialogue_1pt")).toBe(5);
    expect(computeCutEffortPoints(5, "directed_2pt")).toBe(10);
    expect(computeCutEffortPoints(5, "high_action_4pt")).toBe(20);

    const capacities: readonly JiraAssigneeCapacityProfile[] = [
      {
        assigneeId: "a-1",
        assigneeName: "김도현",
        roleLabel: "메인 선화",
        primaryProcess: "lineart",
        sprintCapacityPoints: 20,
        wipLimitCount: 2,
      },
      {
        assigneeId: "a-2",
        assigneeName: "윤서아",
        roleLabel: "보조 선화",
        primaryProcess: "lineart",
        sprintCapacityPoints: 20,
        wipLimitCount: 2,
      },
    ];

    const issues: readonly JiraProductionIssue[] = [
      {
        issueId: "1",
        issueKey: "TOON-101",
        kind: "task",
        parentIssueKey: null,
        episodeCode: "EP04",
        processStep: "bg3d",
        summary: "3D 성채 세트",
        assigneeId: "a-1",
        assigneeName: "김도현",
        status: "in_progress",
        priority: "highest",
        cutCount: 4,
        difficultyTier: "high_action_4pt",
        effortPoints: 16,
        dueDateIso: "2026-10-26",
        blockedByIssueKeys: [],
      },
      {
        issueId: "2",
        issueKey: "TOON-102",
        kind: "task",
        parentIssueKey: "TOON-101",
        episodeCode: "EP04",
        processStep: "lineart",
        summary: "메인 액션 선화",
        assigneeId: "a-1",
        assigneeName: "김도현",
        status: "blocked",
        priority: "high",
        cutCount: 3,
        difficultyTier: "high_action_4pt",
        effortPoints: 12,
        dueDateIso: "2026-10-27",
        blockedByIssueKeys: ["TOON-101"],
      },
    ];

    const blockerReport = analyzeBlockerAndCriticalPath(issues, "2026-10-26");
    expect(blockerReport.unresolvedBlockerIssueKeys).toContain("TOON-102");
    expect(blockerReport.diagnosesByKey["TOON-102"]?.hasUnresolvedBlocker).toBe(true);

    const workloads = evaluateAssigneeWorkloadBalance(issues, capacities);
    const a1Workload = workloads.find((w) => w.assigneeId === "a-1")!;
    expect(a1Workload.isOverCapacity).toBe(true);
    expect(a1Workload.overloadPoints).toBe(8);

    const recommendation = recommendWorkloadReassignment(issues, capacities, "TOON-102");
    expect(recommendation?.recommendedAssigneeId).toBe("a-2");
    expect(recommendation?.projectedUtilizationPercent).toBe(60);

    const rules: readonly JiraAutomationRule[] = [
      {
        ruleId: "r-1",
        name: "3D 배경 완료 시 후속 차단 일감 자동 착수",
        enabled: true,
        triggerWhenStatusBecomes: "done",
        ifProcessStepEquals: "bg3d",
        thenAction: "unblock_and_start_dependents",
      },
    ];

    const autoResult = transitionIssueWithAutomation(issues, rules, "TOON-101", "done");
    const updated102 = autoResult.updatedIssues.find((i) => i.issueKey === "TOON-102")!;
    expect(updated102.status).toBe("in_progress");
    expect(autoResult.triggeredRuleNames).toContain("3D 배경 완료 시 후속 차단 일감 자동 착수");

    const filtered = filterJiraIssuesSmart(autoResult.updatedIssues, {
      processStep: "lineart",
      status: "in_progress",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.issueKey).toBe("TOON-102");
  });

  it("Notion: 세이브 원고 버퍼 계산, 양방향 Relation 토글, Rollup 등장 회차 집계, 위키 검증 만료 갱신 및 템플릿 생성을 수행한다", () => {
    expect(evaluateWikiVerificationStatus("2026-10-20", "2026-10-26").state).toBe("expired");
    expect(evaluateWikiVerificationStatus("2026-10-30", "2026-10-26").state).toBe("expiring_soon");
    expect(evaluateWikiVerificationStatus("2026-11-20", "2026-10-26").state).toBe("verified");

    const loreRecords: readonly NotionLoreRecord[] = [
      {
        loreId: "lore-1",
        loreCategory: "character",
        title: "카엘",
        canonicalTag: "CHR-KAEL",
        summaryBlock: "북부 기사단장",
        outfitOrVisualSpec: "흑청색 제복",
        continuityWarning: null,
        verification: { verifiedBy: "김서연", verifiedUntilIso: "2026-10-20" },
      },
    ];

    const calendarRecords: readonly NotionContentCalendarRecord[] = [
      {
        recordId: "c-1",
        episodeCode: "EP01",
        title: "1화",
        category: "regular_episode",
        platforms: ["naver_webtoon"],
        publishStatus: "published",
        releaseDateIso: "2026-10-12",
        relatedLoreIds: ["lore-1"],
        manuscriptReadyPercent: 100,
      },
      {
        recordId: "c-2",
        episodeCode: "EP02",
        title: "2화",
        category: "regular_episode",
        platforms: ["naver_webtoon"],
        publishStatus: "ready_buffer",
        releaseDateIso: "2026-10-26",
        relatedLoreIds: [],
        manuscriptReadyPercent: 100,
      },
    ];

    const rollupsBefore = computeLoreBibleRollups(loreRecords, calendarRecords, "2026-10-26");
    expect(rollupsBefore[0]?.appearanceCount).toBe(1);
    expect(rollupsBefore[0]?.verificationState).toBe("expired");

    const linkedCalendar = toggleCalendarLoreRelation(calendarRecords, "c-2", "lore-1");
    const rollupsAfter = computeLoreBibleRollups(loreRecords, linkedCalendar, "2026-10-26");
    expect(rollupsAfter[0]?.appearanceCount).toBe(2);
    expect(rollupsAfter[0]?.firstAppearanceEpisode).toBe("EP01");
    expect(rollupsAfter[0]?.latestAppearanceEpisode).toBe("EP02");
    expect(rollupsAfter[0]?.hasContinuityRisk).toBe(true); // 만료된 설정이 미공개 회차(EP02)에 연결됨

    const renewedLore = renewLoreVerification(loreRecords, "lore-1", "최현우", "2026-11-30");
    const rollupsRenewed = computeLoreBibleRollups(renewedLore, linkedCalendar, "2026-10-26");
    expect(rollupsRenewed[0]?.verificationState).toBe("verified");
    expect(rollupsRenewed[0]?.hasContinuityRisk).toBe(false);

    const bufferMetrics = computeContentCalendarBufferMetrics(linkedCalendar, "2026-10-26");
    expect(bufferMetrics.readyBufferEpisodeCount).toBe(1);
    expect(bufferMetrics.bufferHealthStatus).toBe("warning");

    const tpl = instantiateStudioLoreTemplate("location_3d", 5);
    expect(tpl.canonicalTag).toBe("LOC-TPL-5");
    expect(tpl.loreCategory).toBe("location_3d");
  });

  it("3대 협업 UI 스위트(ShotGrid · Jira · Notion)를 렌더링하고 인터랙션을 검증한다", () => {
    render(
      <div>
        <ProductionShotGridVersionLineageSuite />
        <ProductionJiraAgileWorkflowSuite />
        <ProductionNotionKnowledgeCalendarSuite />
      </div>,
    );

    // 1. ShotGrid UI 인터랙션 검증
    expect(screen.getByTestId("shotgrid-version-lineage-suite")).toBeTruthy();
    expect(screen.getByTestId("shotgrid-lineage-warning-banner").textContent).toContain("AST-BG-CITADEL");

    fireEvent.click(screen.getByTestId("shotgrid-sync-upstream-btn"));
    expect(screen.getByTestId("shotgrid-handoff-banner").textContent).toContain("리바인딩");

    fireEvent.change(screen.getByTestId("shotgrid-matrix-cell-CUT-012-shading"), {
      target: { value: "apr" },
    });
    expect(screen.getByTestId("shotgrid-handoff-banner").textContent).toContain("WTG → RDY");

    // 2. Jira UI 인터랙션 검증
    expect(screen.getByTestId("jira-agile-workflow-suite")).toBeTruthy();
    expect(screen.getByTestId("jira-blocker-count-badge").textContent).toContain("2건");

    // 선행 TOON-401(3D 배경)을 done으로 전환하면 자동화 규칙에 의해 후속 TOON-402가 유지되고 TOON-402의 선행 블로커가 해제됨
    fireEvent.change(screen.getByTestId("jira-status-select-TOON-401"), {
      target: { value: "done" },
    });
    expect(screen.getByTestId("jira-blocker-count-badge").textContent).toContain("1건");

    // 과부하 분산 버튼 클릭
    const rebalanceBtn = screen.getByTestId("jira-rebalance-btn-TOON-402");
    fireEvent.click(rebalanceBtn);
    expect(screen.getByTestId("jira-automation-audit-log").textContent).toContain("용량 밸런서");

    // 3. Notion UI 인터랙션 검증
    expect(screen.getByTestId("notion-knowledge-calendar-suite")).toBeTruthy();
    fireEvent.click(screen.getByTestId("notion-view-tab-table"));
    expect(screen.getByTestId("notion-calendar-table-view")).toBeTruthy();

    fireEvent.click(screen.getByTestId("notion-renew-verify-btn-lore-loc-citadel"));
    expect(screen.getByTestId("notion-verification-badge-lore-loc-citadel").textContent).toContain("검증됨");

    fireEvent.click(screen.getByTestId("notion-instantiate-template-btn"));
    expect(screen.getByTestId("notion-status-banner").textContent).toContain("노션 표준 템플릿");
  });
});
