// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Pencil } from "lucide-react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_RAIL_TOOL_CATALOG,
  defaultStudioAppSettings,
  type StudioRailToolId,
} from "../studio-app-settings";
import { StudioAllToolsCatalog } from "../StudioAllToolsCatalog";
import type { StudioRailToolButtonProps } from "../studio-chrome-ui";
import {
  resolveStudioTerminology,
  searchStudio,
} from "../studio-command-search";
import { StudioCommandSearchDialog } from "../StudioCommandSearchDialog";
import { registerStudioCommandSearchHost, subscribeStudioCommandSearchRequests } from "../studio-help-center-channel";
import {
  STUDIO_RAIL_TOOL_ALIASES,
  matchesStudioRailToolQuery,
} from "../studio-rail-tool-search";
import { StudioDrawingClarityProvider } from "../studio-cuttoon-editor/StudioDrawingClarity";
import { StudioDrawingClarityBar } from "../studio-cuttoon-editor/StudioDrawingClarityBar";
import type { StudioCuttoonEditorViewSession } from "../studio-cuttoon-editor/StudioCuttoonEditorViewSession";
import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";
import { createStudioWorkspaceDefaultState } from "../studio-workspaces";

vi.mock("../studio-collab/studio-scoped-draft-save", () => ({
  useStudioScopedDraftSaveState: () => ({ available: false, pendingConfirmation: false }),
}));
vi.mock("../studio-tool-belt-lazy-ui", () => ({
  preloadStudioAssetToolPopoverBody: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function createDefinitions(): Record<StudioRailToolId, StudioRailToolButtonProps> {
  const entries = STUDIO_RAIL_TOOL_CATALOG.map(
    (item): readonly [StudioRailToolId, StudioRailToolButtonProps] => [
      item.id,
      {
        id: item.id,
        label: item.label,
        icon: Pencil,
        active: false,
        onClick: vi.fn(),
      },
    ],
  );
  return Object.fromEntries(entries) as unknown as Record<
    StudioRailToolId,
    StudioRailToolButtonProps
  >;
}

function createClaritySession(isMobile: boolean) {
  const state = createStudioWorkspaceDefaultState(null);
  return {
    currentWorkspaceOwnerScope: "guest",
    isMobile,
    mobileImmersive: isMobile,
    canvasOnlyMode: false,
    workspaceState: state,
    workMode: "all",
    uiDensityMode: "simple",
    appSettings: defaultStudioAppSettings(),
    location: { pathname: "/studio/canvas", search: "?uiMode=basic", hash: "", state: null, key: "p2-20" },
    studioDrawingClarityBaseline: { ownerScope: "guest", source: "default" as const, state },
    title: "신규 작가 첫 원고",
    activePageIndex: 0,
    studioMenubarActivePageLabel: "1페이지",
    studioMainMenuGroups: [],
    saveSyncStore: createStudioSaveSyncSignalStore(),
    saving: false,
    exportMenuOpen: false,
    collaborationDocumentLocked: false,
    sharedDocument: null,
    collaborationLockMessage: () => "편집 잠김",
    canUndo: false,
    canRedo: false,
    activePrimaryTool: "pen",
    brushStabilizerPreset: "medium",
    setBrushStabilizerPreset: vi.fn(),
    brushSizePx: 12,
    setBrushSizePx: vi.fn(),
    brushOpacityPct: 100,
    setBrushOpacityPct: vi.fn(),
    studioMenubarContentHandlers: {
      setStudioUiDensity: vi.fn(),
      handleSave: vi.fn().mockResolvedValue(undefined),
      handleUndo: vi.fn(),
      handleRedo: vi.fn(),
    },
    studioMobileEditingDockHandlers: {
      openInspectorRoute: vi.fn(),
    },
    stableHandlers: {
      activatePrimaryCanvasTool: vi.fn(),
    },
    setMobileSheet: vi.fn(),
    setMenu: vi.fn(),
    setExportMenuOpen: vi.fn(),
    setTeamPanelOpen: vi.fn(),
    setTutorialHubOpen: vi.fn(),
  } as unknown as StudioCuttoonEditorViewSession;
}

function stubNativeModal() {
  const proto = HTMLDialogElement.prototype;
  const previousShow = Object.getOwnPropertyDescriptor(proto, "showModal");
  const previousClose = Object.getOwnPropertyDescriptor(proto, "close");
  Object.defineProperty(proto, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(proto, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event("close"));
    },
  });
  return () => {
    if (previousShow) Object.defineProperty(proto, "showModal", previousShow);
    else Reflect.deleteProperty(proto, "showModal");
    if (previousClose) Object.defineProperty(proto, "close", previousClose);
    else Reflect.deleteProperty(proto, "close");
  };
}

describe("P2-20 도구 발견 — 한국어 별칭·초보 안내·기본 메뉴 진입로 점검", () => {
  it("35종 전체 레일 도구가 한국어 작업 별칭을 보유하고 별칭 질의로 즉시 매칭된다", () => {
    for (const tool of STUDIO_RAIL_TOOL_CATALOG) {
      const alias = STUDIO_RAIL_TOOL_ALIASES[tool.id];
      expect(alias, `${tool.id} 별칭 누락`).toBeTruthy();
      expect(alias.trim().length).toBeGreaterThan(5);
    }

    const expectedPairs: readonly [string, StudioRailToolId][] = [
      ["손떨림 보정", "pen"],
      ["선따기", "pen"],
      ["교차점 지우개", "eraser"],
      ["틈 닫기", "fill"],
      ["원근 자", "perspective"],
      ["투시자", "perspective"],
      ["소실점", "perspective"],
      ["칸 나누기", "smart-shape"],
      ["식자", "text"],
      ["대사창", "bubble"],
      ["셰이퍼", "character-shaper"],
      ["축 고정", "bg3d"],
      ["바닥 맞춤", "bg3d"],
      ["컷 댓글", "comment"],
    ];

    for (const [query, toolId] of expectedPairs) {
      expect(matchesStudioRailToolQuery(toolId, query), `${query} → ${toolId}`).toBe(true);
    }
  });

  it("전체 도구 카탈로그에서 추천 한국어 별칭 칩을 누르면 관련 도구가 바로 필터링된다", () => {
    const onQuery = vi.fn();
    const { rerender } = render(
      <StudioAllToolsCatalog
        definitions={createDefinitions()}
        pinned={["pen"]}
        query=""
        onQuery={onQuery}
        onPin={vi.fn()}
        onUsed={vi.fn()}
      />,
    );

    const chip = screen.getByRole("button", { name: "원근 자" });
    fireEvent.click(chip);
    expect(onQuery).toHaveBeenCalledWith("원근 자");

    rerender(
      <StudioAllToolsCatalog
        definitions={createDefinitions()}
        pinned={["pen"]}
        query="원근 자"
        onQuery={onQuery}
        onPin={vi.fn()}
        onUsed={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "투시 가이드 사용" })).toBeTruthy();
  });

  it("통합 검색 색인이 P1·P2 핵심 작업의 한국어·타사 별칭을 실제 이동 가능한 목적지로 연결한다", () => {
    const corpusQueries: readonly [string, string][] = [
      ["손떨림 보정", "property.stroke-stabilization"],
      ["StreamLine", "property.stroke-stabilization"],
      ["필압 곡선", "property.pressure-tilt-curve"],
      ["기울기 곡선", "property.pressure-tilt-curve"],
      ["틈 닫기", "property.color-fill-assist"],
      ["참조 레이어", "property.color-fill-assist"],
      ["교차점 지우기", "property.vector-ink-edit"],
      ["원근 자", "property.perspective-ruler-snap"],
      ["퍼스 자", "property.perspective-ruler-snap"],
      ["칸 나누기", "property.comic-cut-frame"],
      ["3D 배치", "property.bg3d-placement"],
      ["바닥 맞춤", "property.bg3d-placement"],
      ["협업 검수", "property.collab-cut-review"],
      ["컷 댓글", "property.collab-cut-review"],
      ["이력 복구", "property.collab-cut-review"],
    ];

    for (const [query, expectedId] of corpusQueries) {
      const outcome = searchStudio(query);
      const ids = outcome.sections.flatMap((section) =>
        section.results.map((row) => row.entry.id),
      );
      expect(ids, `"${query}" → ${expectedId}`).toContain(expectedId);
      expect(
        resolveStudioTerminology(query).map((entry) => entry.id),
        `terminology("${query}") → ${expectedId}`,
      ).toContain(expectedId);
    }
  });

  it("빈 통합 검색창에서 초보자 3단계 빠른 시작과 별칭 칩을 제공하고 클릭 시 실제 결과로 연결한다", () => {
    const onNavigateInspector = vi.fn();
    const onExpandPalette = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioCommandSearchDialog
        open
        onClose={onClose}
        onNavigateInspector={onNavigateInspector}
        onExpandPalette={onExpandPalette}
      />,
    );

    expect(screen.getByRole("region", { name: "초보자 3단계 빠른 시작" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "자주 찾는 한국어 별칭" })).toBeTruthy();
    expect(screen.queryAllByRole("option")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "틈 닫기" }));
    const combobox = screen.getByRole("combobox") as HTMLInputElement;
    expect(combobox.value).toBe("틈 닫기");

    const closeGapOption = screen
      .getAllByRole("option")
      .find((node) => within(node).queryByText("참조 레이어 · 틈 닫기 채우기"));
    expect(closeGapOption).toBeTruthy();
    expect(closeGapOption?.getAttribute("data-action")).toBe("inspector");
    fireEvent.click(closeGapOption as HTMLElement);
    expect(onNavigateInspector).toHaveBeenCalledWith({
      primary: "properties",
      image: "fill",
    });
    expect(onClose).toHaveBeenCalledWith("action");
  });

  it("데스크톱·모바일 기본 메뉴 모두에서 '함께 작업(협업)'과 '도구·기능 검색' 진입로가 누락 없이 동작한다", () => {
    const restoreModal = stubNativeModal();
    let releaseMobileSearch = () => {};
    let releaseMobileHost = () => {};
    try {
      // 1. 데스크톱 기본 메뉴에서 '내보내기와 협업 › 함께 작업' 및 '그리기 도구 › 도구·기능 검색' 점검
      const desktop = createClaritySession(false);
      const desktopSearchListener = vi.fn();
      const unsubDesktop = subscribeStudioCommandSearchRequests(desktopSearchListener);
      const desktopView = render(
        <StudioDrawingClarityProvider session={desktop}>
          <StudioDrawingClarityBar session={desktop} />
        </StudioDrawingClarityProvider>,
      );

      fireEvent.click(screen.getByLabelText("더보기 · 작업 설정과 도움말"));
      fireEvent.click(screen.getByRole("button", { name: /그리기 도구/ }));
      fireEvent.click(screen.getByRole("button", { name: "도구·기능 검색" }));
      expect(desktopSearchListener).toHaveBeenCalledWith({ scope: "all" });

      fireEvent.click(screen.getByLabelText("더보기 · 작업 설정과 도움말"));
      fireEvent.click(screen.getByRole("button", { name: /내보내기와 협업/ }));
      fireEvent.click(screen.getByRole("button", { name: "함께 작업" }));
      expect(desktop.setTeamPanelOpen).toHaveBeenCalledWith(true);

      unsubDesktop();
      desktopView.unmount();

      // 2. 모바일 기본 메뉴에서 '그리기 도구 › 도구·기능 검색' 및 '내보내기와 협업 › 함께 작업' 점검
      const mobile = createClaritySession(true);
      const mobileSearchListener = vi.fn();
      releaseMobileSearch = subscribeStudioCommandSearchRequests(mobileSearchListener);
      function StatefulMobileSheet() {
        const [mobileSheet, setMobileSheet] = useState<StudioCuttoonEditorViewSession["mobileSheet"]>(null);
        const session = { ...mobile, mobileSheet, setMobileSheet };
        return <StudioDrawingClarityProvider session={session}>
          <StudioDrawingClarityBar session={session} />
        </StudioDrawingClarityProvider>;
      }
      render(<StatefulMobileSheet />);

      fireEvent.click(screen.getByLabelText("더보기 · 도구와 도움말"));
      fireEvent.click(screen.getByRole("button", { name: /그리기 도구/ }));
      fireEvent.click(screen.getByRole("button", { name: "도구·기능 검색" }));
      expect(mobileSearchListener).not.toHaveBeenCalled();
      act(() => { releaseMobileHost = registerStudioCommandSearchHost(); });
      expect(mobileSearchListener).toHaveBeenCalledWith({ scope: "all" });
      expect(mobileSearchListener).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByLabelText("더보기 · 도구와 도움말"));
      fireEvent.click(screen.getByRole("button", { name: /내보내기와 협업/ }));
      fireEvent.click(screen.getByRole("button", { name: "함께 작업" }));
      expect(mobile.setTeamPanelOpen).toHaveBeenCalledWith(true);

    } finally {
      act(releaseMobileHost);
      releaseMobileSearch();
      restoreModal();
    }
  });
});
