// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  aggregateAssistantSettlementByPerson,
  computeAssistantLineItemAmountKrw,
  computeEpisodeSettlementRollup,
  filterAndSortContentCalendarRecords,
  shiftEpisodeTimelineWithDependencies,
  toggleGalleryVisibleProperty,
  type NotionContentCalendarEpisodeRecord,
} from "./production-notion-content-calendar-model";
import {
  computeCharacterLorebookBacklinks,
  deriveSymmetricCharacterRelations,
  updateSyncedBlockCanonicalContent,
  upsertCharacterAssociationEdge,
  type CharacterAssociationEdge,
  type CharacterSheetArchiveItem,
  type LorebookWikiPage,
  type NotionSyncedBlockContainer,
} from "./production-notion-lorebook-wiki-model";
import {
  SPREADSHEET_PROCESS_COLUMNS,
  computeSpreadsheetRowFormulaMetrics,
  exportChecklistToDelimitedText,
  filterSpreadsheetChecklistRows,
  provisionEpisodeDriveFolderTree,
  resolveDriveFolderConflict,
  toggleSpreadsheetChecklistCell,
  triggerDriveContinuousSyncPass,
  type SpreadsheetEpisodeChecklistRow,
  type SpreadsheetProcessCell,
  type SpreadsheetProcessColumnKey,
} from "./production-workspace-sheet-drive-model";
import { ProductionNotionContentCalendarSuite } from "./ProductionNotionContentCalendarSuite";
import { ProductionNotionLorebookWikiSuite } from "./ProductionNotionLorebookWikiSuite";
import { ProductionWorkspaceSheetDriveSuite } from "./ProductionWorkspaceSheetDriveSuite";

afterEach(() => {
  cleanup();
});

describe("노션(Notion) & 구글 워크스페이스(Sheets·Drive) 클린룸 내재화 도메인 및 UI 검증", () => {
  it("노션 콘텐츠 캘린더: 어시스턴트 컷당·정액 정산 롤업(SUM), 인원별 누적 집계, 주말 회피 의존성 일정 시프트를 계산한다", () => {
    const sampleRecords: readonly NotionContentCalendarEpisodeRecord[] = [
      {
        episodeId: "ep-1",
        episodeNumber: 1,
        title: "1화",
        synopsisSummary: "서막",
        startDateIso: "2026-10-20",
        deadlineDateIso: "2026-10-23", // 금요일
        platformSubmissionStatus: "submitted",
        platformName: "네이버웹툰",
        cutCount: 60,
        coverBadgeText: "1화",
        coverThemeTone: "emerald",
        dependencyEpisodeIds: [],
        assistantSettlements: [
          {
            id: "s-1",
            assistantId: "a-1",
            assistantName: "김선화",
            role: "lineart",
            pricingModel: "per-cut",
            unitRateKrw: 10000,
            cutOrPageCount: 60,
            bonusKrw: 50000,
            paymentStatus: "paid",
          },
          {
            id: "s-2",
            assistantId: "a-2",
            assistantName: "박배경",
            role: "background",
            pricingModel: "flat-episode",
            unitRateKrw: 250000,
            cutOrPageCount: 15,
            bonusKrw: 0,
            paymentStatus: "unpaid",
          },
        ],
      },
      {
        episodeId: "ep-2",
        episodeNumber: 2,
        title: "2화",
        synopsisSummary: "본격 전개",
        startDateIso: "2026-10-26",
        deadlineDateIso: "2026-10-30", // 금요일
        platformSubmissionStatus: "not-submitted",
        platformName: "네이버웹툰",
        cutCount: 70,
        coverBadgeText: "2화",
        coverThemeTone: "indigo",
        dependencyEpisodeIds: ["ep-1"],
        assistantSettlements: [
          {
            id: "s-3",
            assistantId: "a-1",
            assistantName: "김선화",
            role: "lineart",
            pricingModel: "per-cut",
            unitRateKrw: 10000,
            cutOrPageCount: 70,
            bonusKrw: 0,
            paymentStatus: "unpaid",
          },
        ],
      },
    ];

    expect(
      computeAssistantLineItemAmountKrw(sampleRecords[0]!.assistantSettlements[0]!),
    ).toBe(650000);
    expect(
      computeAssistantLineItemAmountKrw(sampleRecords[0]!.assistantSettlements[1]!),
    ).toBe(250000);

    const ep1Rollup = computeEpisodeSettlementRollup(sampleRecords[0]!);
    expect(ep1Rollup.totalSettlementKrw).toBe(900000);
    expect(ep1Rollup.paidSettlementKrw).toBe(650000);
    expect(ep1Rollup.unpaidSettlementKrw).toBe(250000);
    expect(ep1Rollup.costPerCutKrw).toBe(15000);
    expect(ep1Rollup.paymentCompletionPercent).toBe(50);

    const byPerson = aggregateAssistantSettlementByPerson(sampleRecords);
    expect(byPerson).toHaveLength(2);
    expect(byPerson[0]?.assistantName).toBe("김선화");
    expect(byPerson[0]?.episodeCount).toBe(2);
    expect(byPerson[0]?.totalCutsAssigned).toBe(130);
    expect(byPerson[0]?.totalAmountKrw).toBe(1350000);
    expect(byPerson[0]?.unpaidAmountKrw).toBe(700000);

    // 2026-10-23(금) + 1일 이동 시 토요일(2026-10-24)이므로 주말 회피(avoidWeekends=true)가 작동하여 월요일(2026-10-26)로 이동하고,
    // 의존 회차인 ep-2(2026-10-30 금)도 연쇄 시프트되어 월요일(2026-11-02)로 이동한다.
    const shifted = shiftEpisodeTimelineWithDependencies(
      sampleRecords,
      "ep-1",
      1,
      true,
    );
    expect(shifted[0]?.deadlineDateIso).toBe("2026-10-26");
    expect(shifted[1]?.deadlineDateIso).toBe("2026-11-02");

    const filtered = filterAndSortContentCalendarRecords(sampleRecords, {
      statusFilter: "not-submitted",
      sortBy: "settlement-desc",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.episodeId).toBe("ep-2");

    const toggledProps = toggleGalleryVisibleProperty(
      {
        coverFormat: "thumbnail-cover",
        cardSize: "medium",
        coverAspect: "16:9",
        visibleProperties: ["deadline", "settlementTotal"],
      },
      "deadline",
    );
    expect(toggledProps.visibleProperties).toEqual(["settlementTotal"]);
  });

  it("노션 설정집·시놉시스 위키: 양방향 인물 관계도(AssociationRelationStore), 동기화 블록(SyncedBlock), 자동 역링크를 처리한다", () => {
    const characters: readonly CharacterSheetArchiveItem[] = [
      {
        characterId: "c-1",
        name: "카엘",
        roleTitle: "기사단장",
        faction: "북부",
        ageAndHeight: "26세",
        personalityCallout: "왼손잡이",
        hiddenSpoilerToggle: "비밀 혈통",
        turnaroundViews: ["전신 삼면도"],
        colorPalette: [{ partLabel: "헤어", hex: "#111111" }],
        syncedRuleBlockId: "sync-1",
        sharedWithTeam: true,
        updatedAtIso: "2026-10-26",
      },
      {
        characterId: "c-2",
        name: "셀레네",
        roleTitle: "황녀",
        faction: "황실",
        ageAndHeight: "23세",
        personalityCallout: "좌측 귀걸이",
        hiddenSpoilerToggle: "봉인 열쇠",
        turnaroundViews: ["예복 시트"],
        colorPalette: [{ partLabel: "헤어", hex: "#EEEEEE" }],
        syncedRuleBlockId: "sync-1",
        sharedWithTeam: true,
        updatedAtIso: "2026-10-26",
      },
    ];

    const initialEdges: readonly CharacterAssociationEdge[] = [];
    const edges = upsertCharacterAssociationEdge(initialEdges, {
      record1CharacterId: "c-1",
      record2CharacterId: "c-2",
      kind: "mentor-student",
      mirrorInverse: true,
      affinityScore: 80,
      note: "검술과 마법 상호 지도",
    });

    const fromKael = deriveSymmetricCharacterRelations("c-1", characters, edges);
    const fromSelene = deriveSymmetricCharacterRelations("c-2", characters, edges);

    expect(fromKael[0]?.relationLabel).toBe("스승 (지도)");
    expect(fromKael[0]?.direction).toBe("forward");
    expect(fromSelene[0]?.relationLabel).toBe("제자 (사사)");
    expect(fromSelene[0]?.direction).toBe("inverse-mirrored");

    const syncedBlocks: readonly NotionSyncedBlockContainer[] = [
      {
        syncedBlockId: "sync-1",
        title: "공통 규칙",
        canonicalContent: "카엘과 셀레네의 문양은 금빛 고정",
        sourcePageTitle: "세계관",
        referenceEpisodeIds: ["1화", "2화"],
        lastSyncedAtIso: "2026-10-26T00:00:00.000Z",
      },
    ];

    const updatedBlocks = updateSyncedBlockCanonicalContent(
      syncedBlocks,
      "sync-1",
      "카엘과 셀레네의 문양은 은빛(#E2E8F0)으로 변경",
    );
    expect(updatedBlocks[0]?.canonicalContent).toContain("은빛(#E2E8F0)");

    const pages: readonly LorebookWikiPage[] = [
      {
        pageId: "p-1",
        category: "synopsis",
        title: "1화 시놉시스",
        episodeRangeLabel: "1화",
        calloutBanner: "중요",
        bodyMarkdown: "북부 요새 장면",
        spoilerToggleContent: "",
        embeddedSyncedBlockIds: ["sync-1"],
        sharedLiveWithAssistants: true,
      },
    ];

    const backlinks = computeCharacterLorebookBacklinks(
      characters,
      pages,
      updatedBlocks,
    );
    expect(backlinks[0]?.mentionedInPages).toHaveLength(1);
    expect(backlinks[1]?.mentionedInPages).toHaveLength(1);
  });

  it("구글 워크스페이스(Sheets & Drive): 마감 체크리스트 COUNTIF 수식·조건부 서식·CSV 내보내기와 드라이브 공유 폴더 상시 동기화·충돌 해결을 수행한다", () => {
    const cells = {} as Record<SpreadsheetProcessColumnKey, SpreadsheetProcessCell>;
    for (const col of SPREADSHEET_PROCESS_COLUMNS) {
      cells[col.key] = {
        processKey: col.key,
        checked: col.key !== "finalManuscript",
        assigneeName: "김지현",
        driveFolderId: `drive-ep-1-${col.key}`,
        updatedAtIso: "2026-10-26T09:00:00.000Z",
      };
    }

    const row: SpreadsheetEpisodeChecklistRow = {
      episodeId: "ep-1",
      episodeNumber: 1,
      episodeTitle: "1화",
      deadlineDateIso: "2026-10-27", // 기준일(2026-10-26) 대비 D-1 -> due-soon
      cells,
    };

    const metricsBefore = computeSpreadsheetRowFormulaMetrics(row, "2026-10-26");
    expect(metricsBefore.completedCount).toBe(6);
    expect(metricsBefore.completionPercent).toBe(86);
    expect(metricsBefore.conditionalTone).toBe("due-soon");
    expect(metricsBefore.formulaExpression).toContain("COUNTIF(B2:H2, TRUE)");

    const toggledRows = toggleSpreadsheetChecklistCell(
      [row],
      "ep-1",
      "finalManuscript",
    );
    const metricsAfter = computeSpreadsheetRowFormulaMetrics(
      toggledRows[0]!,
      "2026-10-26",
    );
    expect(metricsAfter.completionPercent).toBe(100);
    expect(metricsAfter.conditionalTone).toBe("completed");

    const csv = exportChecklistToDelimitedText(toggledRows, ",", "2026-10-26");
    expect(csv).toContain("100%");
    expect(csv).toContain("100% 마감 완료");

    expect(
      filterSpreadsheetChecklistRows(toggledRows, {
        assigneeFilter: "김지현",
        toneFilter: "completed",
      }),
    ).toHaveLength(1);

    const folders = provisionEpisodeDriveFolderTree({
      workFolderName: "웹툰원고",
      episodeId: "ep-1",
      episodeNumber: 1,
    }).map((f, idx) =>
      idx === 0
        ? { ...f, syncState: "uploading" as const }
        : idx === 1
          ? {
              ...f,
              syncState: "conflict" as const,
              conflictDetail: "동시 편집 충돌",
            }
          : f,
    );

    const syncPass = triggerDriveContinuousSyncPass(folders);
    expect(syncPass.newlySyncedCount).toBe(1);
    expect(syncPass.folders[0]?.syncState).toBe("synced");
    expect(syncPass.folders[1]?.syncState).toBe("conflict");

    const resolved = resolveDriveFolderConflict(
      syncPass.folders,
      syncPass.folders[1]!.folderId,
      "keep-both-with-suffix",
    );
    expect(resolved[1]?.syncState).toBe("synced");
    expect(resolved[1]?.latestFileName).toContain("_병합보존본");
    expect(resolved[1]?.conflictDetail).toBeNull();
  });

  it("3종 UI 스위트(콘텐츠 캘린더, 설정집 위키, 시트·드라이브 동기화)가 렌더링되고 상호작용이 동작한다", () => {
    render(
      <div>
        <ProductionNotionContentCalendarSuite />
        <ProductionNotionLorebookWikiSuite />
        <ProductionWorkspaceSheetDriveSuite />
      </div>,
    );

    // 1. 노션 콘텐츠 캘린더 뷰 전환 및 정산 항목 추가
    expect(
      screen.getByRole("heading", {
        name: /콘텐츠 캘린더 · 플랫폼 제출 & 어시스턴트 정산 롤업 뷰/,
      }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "타임라인 뷰" }));
    expect(screen.getByTestId("notion-timeline-view")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "정산 데이터베이스 표" }));
    expect(screen.getByTestId("notion-table-view")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /정산 항목 추가/ }));
    expect(screen.getByRole("status").textContent).toContain("정산");

    // 2. 노션 설정집 위키 동기화 블록 반영 및 인물 관계 저장
    fireEvent.change(screen.getByLabelText("동기화 블록 원본 내용"), {
      target: { value: "[업데이트된 전 회차 공통 작화 규칙] 검신 오라 색상 변경" },
    });
    fireEvent.click(screen.getByRole("button", { name: /전 회차 동기화 반영/ }));
    expect(
      screen.getByTestId("embedded-wiki-worldview-1-sync-rule-seal-sword")
        .textContent,
    ).toContain("[업데이트된 전 회차 공통 작화 규칙]");

    fireEvent.click(screen.getByRole("button", { name: "인물 관계 저장" }));

    // 3. 구글 스프레드시트 체크리스트 및 드라이브 상시 동기화·충돌 해결
    fireEvent.click(screen.getByRole("button", { name: /CSV 시트 내보내기/ }));
    expect(screen.getByTestId("exported-sheet-preview").textContent).toContain(
      "1화 · 잿빛 성채의 귀환자",
    );

    fireEvent.click(screen.getByRole("button", { name: /양쪽 사본 보존 병합/ }));
    fireEvent.click(
      screen.getByRole("button", { name: /상시 동기화 즉시 실행/ }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: /다음 회차 시트\+공유폴더 자동 생성/ }),
    );
    expect(screen.getAllByText(/4화 · 신규 연재 준비 회차/).length).toBeGreaterThan(0);
  });
});
