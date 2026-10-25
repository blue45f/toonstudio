// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  claimWebtoonTicket,
  evaluateConfluenceSmartLinks,
  formatStandardWebtoonTicketTitle,
  issueWebtoonProductionTicket,
  queryTicketsWithJqlFilter,
  reviewWebtoonTicketByPd,
  submitWebtoonTicketForPdReview,
  syncTicketConfluenceSpecVersions,
  type ConfluenceLorePage,
} from "./production-jira-confluence-workflow-model";
import {
  analyzePublishedFileDownstreamImpact,
  buildVersionLineageChain,
  computeBeforeAfterVersionDiff,
  filterShotGridVersions,
  transitionShotGridVersionStatus,
  type ShotGridPublishedFileRecord,
  type ShotGridRetakeNote,
  type ShotGridVersionRecord,
} from "./production-shotgrid-version-lineage-model";
import { ProductionJiraConfluenceWorkflowSuite } from "./ProductionJiraConfluenceWorkflowSuite";
import { ProductionShotGridVersionLineageSuite } from "./ProductionShotGridVersionLineageSuite";

const SAMPLE_VERSIONS: readonly ShotGridVersionRecord[] = [
  {
    id: "v1",
    versionCode: "v001",
    versionNumber: 1,
    episodeId: "ep-48",
    episodeLabel: "화산귀환 48화",
    step: "shading",
    cutRange: [1, 65],
    status: "fix",
    artistId: "a1",
    artistName: "이채림",
    createdAt: "2026-10-24T10:00:00.000Z",
    parentVersionId: null,
    byteHash: "hash-v1",
    resolution: "1440×48000",
    fileSizeBytes: 30_000_000,
    comment: "1차 채색 초안",
    triggeredByNoteId: null,
    changeRegions: [],
    publishedFileIds: ["f-v1"],
  },
  {
    id: "v2",
    versionCode: "v002",
    versionNumber: 2,
    episodeId: "ep-48",
    episodeLabel: "화산귀환 48화",
    step: "shading",
    cutRange: [1, 65],
    status: "rev",
    artistId: "a1",
    artistName: "이채림",
    createdAt: "2026-10-25T10:00:00.000Z",
    parentVersionId: "v1",
    byteHash: "hash-v2",
    resolution: "1440×48000",
    fileSizeBytes: 32_500_000,
    comment: "14컷 매화검기 광원 보정",
    triggeredByNoteId: "n1",
    changeRegions: [
      {
        regionId: "r-14",
        cutNumber: 14,
        label: "14컷 매화검기 코어",
        xPercent: 20,
        yPercent: 20,
        widthPercent: 50,
        heightPercent: 40,
        changedPixelRatio: 0.3,
        deltaE: 10.5,
        beforeSummary: "단색 분홍 광원",
        afterSummary: "백색 코어 + 매화 잔상 분리",
        linkedNoteId: "n1",
      },
    ],
    publishedFileIds: ["f-v2"],
  },
];

const SAMPLE_NOTES: readonly ShotGridRetakeNote[] = [
  {
    id: "n1",
    targetVersionId: "v1",
    resolvedInVersionId: "v2",
    cutNumber: 14,
    authorName: "메인 PD",
    body: "14컷 코어 발광 보강",
    status: "verified",
  },
  {
    id: "n2",
    targetVersionId: "v1",
    resolvedInVersionId: null,
    cutNumber: 55,
    authorName: "메인 PD",
    body: "55컷 배경 안개 농도 조정",
    status: "open",
  },
];

describe("ShotGrid 버전 히스토리 & Jira/Confluence 웹툰 협업 워크플로 검증", () => {
  it("ShotGrid 버전 계보(v001→v002), 수정 전/후(Before/After) ΔE 색차 및 리테이크 노트 검증, PublishedFile 하위 의존성을 계산한다", () => {
    const chain = buildVersionLineageChain(SAMPLE_VERSIONS, "v2");
    expect(chain.map((v) => v.versionCode)).toEqual(["v001", "v002"]);

    const diff = computeBeforeAfterVersionDiff(SAMPLE_VERSIONS, "v1", "v2", SAMPLE_NOTES);
    expect(diff).not.toBeNull();
    expect(diff?.isDirectParentChild).toBe(true);
    expect(diff?.lineagePathCodes).toEqual(["v001", "v002"]);
    expect(diff?.modifiedCutNumbers).toEqual([14]);
    expect(diff?.averageDeltaE).toBe(10.5);
    expect(diff?.verifiedNoteIds).toEqual(["n1"]);
    expect(diff?.unverifiedNoteIds).toEqual(["n2"]);

    const filteredByCut = filterShotGridVersions(SAMPLE_VERSIONS, { cutNumber: 30 });
    expect(filteredByCut).toHaveLength(2);
    expect(filterShotGridVersions(SAMPLE_VERSIONS, { cutNumber: 99 })).toHaveLength(0);

    const lockedFinal = transitionShotGridVersionStatus(SAMPLE_VERSIONS, "v2", "fin");
    expect(lockedFinal.updated).toBe(true);
    const reopenBlocked = transitionShotGridVersionStatus(lockedFinal.versions, "v2", "ip");
    expect(reopenBlocked.updated).toBe(false);
    expect(reopenBlocked.reason).toBe("final-locked");

    const files: readonly ShotGridPublishedFileRecord[] = [
      {
        id: "f-line",
        code: "line.clip",
        fileType: "clip",
        versionNumber: 1,
        step: "line-art",
        path: "/line.clip",
        byteHash: "h1",
        upstreamFileIds: [],
        linkedVersionId: "v1",
      },
      {
        id: "f-color",
        code: "color.psd",
        fileType: "psd",
        versionNumber: 1,
        step: "shading",
        path: "/color.psd",
        byteHash: "h2",
        upstreamFileIds: ["f-line"],
        linkedVersionId: "v2",
      },
      {
        id: "f-fx",
        code: "fx.psd",
        fileType: "psd",
        versionNumber: 1,
        step: "lighting-fx",
        path: "/fx.psd",
        byteHash: "h3",
        upstreamFileIds: ["f-color"],
        linkedVersionId: "v2",
      },
    ];

    const impact = analyzePublishedFileDownstreamImpact(files, "f-line");
    expect(impact?.directDownstreamIds).toEqual(["f-color"]);
    expect(impact?.transitiveDownstreamIds).toEqual(["f-color", "f-fx"]);
    expect(impact?.affectedSteps).toEqual(["shading", "lighting-fx"]);
  });

  it("Jira 메인 PD 티켓 발행 → 채색 담당자 가져가기(Pull) → 완료 시 PD 자동 검수 알림 → 승인 시 후속 블로커 해제 및 Confluence 설정집 동기화를 수행한다", () => {
    const pages: readonly ConfluenceLorePage[] = [
      {
        id: "p1",
        spaceKey: "HSGH-LORE",
        title: "화산귀환 표준 컬러 가이드",
        category: "color-script",
        versionNumber: 3,
        lastUpdatedBy: "김현준 메인 PD",
        updatedAt: "2026-10-26",
        paletteSwatches: [{ label: "매화검기", hex: "#FB7185" }],
        summaryRules: ["매화검기 스크린 레이어 필수"],
        inlineCommentsCount: 2,
      },
    ];

    expect(formatStandardWebtoonTicketTitle("화산귀환", 48, "shading")).toBe(
      "화산귀환 48화 채색 요청",
    );

    const issuedColor = issueWebtoonProductionTicket([], pages, {
      projectKey: "HSGH",
      workTitle: "화산귀환",
      episodeNumber: 48,
      step: "shading",
      cutRange: [1, 65],
      priority: "highest",
      reporterPdId: "pd-1",
      reporterPdName: "김현준 메인 PD",
      dueDate: "2026-10-27",
      linkedConfluencePageIds: ["p1"],
    });
    expect(issuedColor.createdTicket.title).toBe("화산귀환 48화 채색 요청");
    expect(issuedColor.createdTicket.status).toBe("READY_FOR_PULL");

    const issuedFx = issueWebtoonProductionTicket(issuedColor.tickets, pages, {
      projectKey: "HSGH",
      workTitle: "화산귀환",
      episodeNumber: 48,
      step: "lighting-fx",
      cutRange: [1, 65],
      priority: "high",
      reporterPdId: "pd-1",
      reporterPdName: "김현준 메인 PD",
      dueDate: "2026-10-28",
      linkedConfluencePageIds: ["p1"],
      blockedByIssueKeys: [issuedColor.createdTicket.issueKey],
    });

    // 선행 채색 티켓이 완료되지 않은 상태에서 후보정 티켓 가져가기 시도 → 차단
    const blockedClaim = claimWebtoonTicket(
      issuedFx.tickets,
      issuedFx.createdTicket.issueKey,
      { workerId: "w-fx", workerName: "최이펙트" },
    );
    expect(blockedClaim.ok).toBe(false);
    expect(blockedClaim.reason).toBe("blocked-by-upstream");

    // 채색 담당자가 채색 티켓을 가져가 작업 시작
    const claimed = claimWebtoonTicket(
      issuedFx.tickets,
      issuedColor.createdTicket.issueKey,
      { workerId: "w-color", workerName: "이채림 (채색 담당)" },
    );
    expect(claimed.ok).toBe(true);
    const activeTicket = claimed.tickets.find(
      (t) => t.issueKey === issuedColor.createdTicket.issueKey,
    );
    expect(activeTicket?.status).toBe("IN_PROGRESS");
    expect(activeTicket?.assigneeWorkerName).toBe("이채림 (채색 담당)");

    // 채색 담당자가 작업 완료 후 제출 → 담당 메인 PD에게 자동으로 검수 알림 발송
    const submitted = submitWebtoonTicketForPdReview(claimed.tickets, [], {
      issueKey: issuedColor.createdTicket.issueKey,
      workerId: "w-color",
      workerName: "이채림 (채색 담당)",
      linkedVersionCode: "v003",
    });
    expect(submitted.ok).toBe(true);
    expect(submitted.notifications).toHaveLength(1);
    expect(submitted.createdNotification?.recipientPdName).toBe("김현준 메인 PD");
    expect(submitted.createdNotification?.linkedVersionCode).toBe("v003");
    expect(submitted.createdNotification?.message).toContain("화산귀환 48화 채색 요청");

    // 담당 PD가 승인하면 후속 후보정 티켓의 선행 블로커가 자동 해제됨
    const approved = reviewWebtoonTicketByPd(submitted.tickets, {
      issueKey: issuedColor.createdTicket.issueKey,
      decision: "approve",
    });
    expect(approved.ok).toBe(true);
    expect(approved.unblockedIssueKeys).toEqual([issuedFx.createdTicket.issueKey]);

    // Confluence 설정집이 v3 -> v4로 개정되면 티켓에서 outdated 감지 후 동기화
    const firstPage = pages[0];
    expect(firstPage).toBeDefined();
    if (!firstPage) return;
    const updatedPages: readonly ConfluenceLorePage[] = [
      { ...firstPage, versionNumber: 4 },
    ];
    const targetTicket = approved.tickets.find(
      (t) => t.issueKey === issuedColor.createdTicket.issueKey,
    );
    expect(targetTicket).toBeDefined();
    if (!targetTicket) return;
    const linksBeforeSync = evaluateConfluenceSmartLinks(targetTicket, updatedPages);
    expect(linksBeforeSync[0]?.isOutdatedSpec).toBe(true);
    expect(linksBeforeSync[0]?.versionDelta).toBe(1);

    const syncedTickets = syncTicketConfluenceSpecVersions(
      approved.tickets,
      targetTicket.issueKey,
      updatedPages,
    );
    const syncedTarget = syncedTickets.find((t) => t.issueKey === targetTicket.issueKey);
    expect(syncedTarget).toBeDefined();
    if (!syncedTarget) return;
    expect(evaluateConfluenceSmartLinks(syncedTarget, updatedPages)[0]?.isOutdatedSpec).toBe(false);

    expect(
      queryTicketsWithJqlFilter(syncedTickets, { status: "PD_APPROVED" }),
    ).toHaveLength(1);
  });

  it("ShotGrid 버전 히스토리 UI와 Jira/Confluence 워크플로 UI가 상호작용을 정상 렌더링한다", () => {
    render(
      <div>
        <ProductionShotGridVersionLineageSuite />
        <ProductionJiraConfluenceWorkflowSuite />
      </div>,
    );

    expect(screen.getByTestId("shotgrid-version-lineage-suite")).toBeTruthy();
    expect(screen.getByTestId("shotgrid-before-after-diff-summary")).toBeTruthy();

    // ShotGrid 신규 버전 등록 버튼 클릭 → v004 생성 확인
    fireEvent.click(screen.getByTestId("shotgrid-register-version-btn"));
    expect(screen.getByTestId("shotgrid-status-feedback").textContent).toContain("v004");

    // Jira/Confluence 스위트에서 '화산귀환 48화 채색 요청'(HSGH-4802) 가져가기 → 완료 제출 → PD 자동 검수 알림 확인
    expect(screen.getByTestId("jira-confluence-workflow-suite")).toBeTruthy();
    fireEvent.click(screen.getByTestId("jira-claim-btn-HSGH-4802"));
    expect(screen.getByTestId("jira-workflow-notice").textContent).toContain("HSGH-4802");

    fireEvent.click(screen.getByTestId("jira-submit-review-btn-HSGH-4802"));
    expect(screen.getByTestId("jira-workflow-notice").textContent).toContain("자동 검수 알림");
    expect(screen.getByTestId("pd-auto-notif-HSGH-4802")).toBeTruthy();

    // PD 검수 승인 클릭 → 후속 공정 HSGH-4803 잠금 해제 확인
    fireEvent.click(screen.getByTestId("jira-pd-approve-btn-HSGH-4802"));
    expect(screen.getByTestId("jira-workflow-notice").textContent).toContain("HSGH-4803");

    // 새 회차(49화) 채색 요청 티켓 발행
    fireEvent.click(screen.getByTestId("jira-issue-ticket-btn"));
    expect(screen.getByTestId("jira-workflow-notice").textContent).toContain(
      "화산귀환 49화 채색 요청",
    );
  });
});
