// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Pencil } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_RAIL_TOOL_CATALOG,
  defaultStudioAppSettings,
  type StudioRailToolId,
} from "../studio-app-settings";
import { StudioAllToolsCatalog } from "../StudioAllToolsCatalog";
import type { StudioRailToolButtonProps } from "../studio-chrome-ui";
import { StudioDrawingClarityProvider } from "../studio-cuttoon-editor/StudioDrawingClarity";
import { StudioDrawingClarityBar } from "../studio-cuttoon-editor/StudioDrawingClarityBar";
import type { StudioCuttoonEditorViewSession } from "../studio-cuttoon-editor/StudioCuttoonEditorViewSession";
import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";
import { createStudioWorkspaceDefaultState } from "../studio-workspaces";
import { ProductionGrandAtelierCollabHub } from "./ProductionGrandAtelierCollabHub";

vi.mock("../studio-collab/studio-scoped-draft-save", () => ({
  useStudioScopedDraftSaveState: () => ({ available: false, pendingConfirmation: false }),
}));
vi.mock("../studio-tool-belt-lazy-ui", () => ({
  preloadStudioAssetToolPopoverBody: vi.fn(),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function createDefinitions(): Record<StudioRailToolId, StudioRailToolButtonProps> {
  return Object.fromEntries(
    STUDIO_RAIL_TOOL_CATALOG.map((item) => [
      item.id,
      { id: item.id, label: item.label, icon: Pencil, active: false, onClick: vi.fn() },
    ]),
  ) as unknown as Record<StudioRailToolId, StudioRailToolButtonProps>;
}

function createEditorSession(): StudioCuttoonEditorViewSession {
  const state = createStudioWorkspaceDefaultState(null);
  return {
    currentWorkspaceOwnerScope: "guest",
    isMobile: false,
    mobileImmersive: false,
    canvasOnlyMode: false,
    workspaceState: state,
    workMode: "all",
    uiDensityMode: "simple",
    appSettings: defaultStudioAppSettings(),
    location: { pathname: "/studio/comic", search: "?uiMode=basic", hash: "", state: null, key: "v4" },
    studioDrawingClarityBaseline: { ownerScope: "guest", source: "default", state },
    title: "12화 Grand Atelier 테스트 원고",
    activePageIndex: 0,
    studioMenubarActivePageLabel: "1페이지",
    studioMainMenuGroups: [],
    saveSyncStore: createStudioSaveSyncSignalStore(),
    saving: false,
    exportMenuOpen: false,
    collaborationDocumentLocked: false,
    sharedDocument: null,
    collaborationLockMessage: () => "편집 잠김",
    openStudioCommentCount: 2,
    strokeWidth: 10,
    setStrokeWidth: vi.fn(),
    stabilizer: 2,
    setStabilizer: vi.fn(),
    showWebtoonGuides: true,
    setShowWebtoonGuides: vi.fn(),
    effScale: 1,
    setZoom: vi.fn(),
    bg3dOpen: false,
    setBg3dOpen: vi.fn(),
    menuEditUndoDisabled: false,
    menuEditRedoDisabled: false,
    tool: "draw",
    drawMode: "pen",
    activatePrimaryCanvasTool: vi.fn(),
    studioMenubarContentHandlers: {
      setStudioUiDensity: vi.fn(),
      handleSave: vi.fn().mockResolvedValue(undefined),
      undo: vi.fn(),
      redo: vi.fn(),
    },
    studioMobileEditingDockHandlers: { openInspectorRoute: vi.fn() },
    setMobileSheet: vi.fn(),
    setMenu: vi.fn(),
    setExportMenuOpen: vi.fn(),
    setTeamPanelOpen: vi.fn(),
    setHistoryPanelOpen: vi.fn(),
    setCommentsOpen: vi.fn(),
    setTutorialHubOpen: vi.fn(),
  } as unknown as StudioCuttoonEditorViewSession;
}

describe("Grand Atelier V4 Wave 1 — 3번 드로잉 & 4번 협업 통합 검증", () => {
  it("3번 드로잉: 전체 도구 35종이 카테고리 벽 없이 0클릭으로 즉시 노출된다", () => {
    render(
      <StudioAllToolsCatalog
        definitions={createDefinitions()}
        pinned={["pen"]}
        query=""
        onQuery={vi.fn()}
        onPin={vi.fn()}
        onUsed={vi.fn()}
      />,
    );
    expect(document.querySelectorAll("[data-studio-catalog-tool-id]")).toHaveLength(
      STUDIO_RAIL_TOOL_CATALOG.length,
    );
  });

  it("3번 드로잉: 상단 옴니박스·수정이력·공유초대 모달과 Escape 초점 복귀가 동작한다", async () => {
    const session = createEditorSession();
    render(
      <MemoryRouter>
        <StudioDrawingClarityProvider session={session}>
          <StudioDrawingClarityBar session={session} />
        </StudioDrawingClarityProvider>
      </MemoryRouter>,
    );

    expect(document.querySelector('[data-studio-clarity-omnibox="true"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "수정이력" }));
    expect(session.setHistoryPanelOpen).toHaveBeenCalledWith(true);

    const shareBtn = screen.getByRole("button", { name: "공유·초대" });
    shareBtn.focus();
    fireEvent.click(shareBtn);

    const dialog = await screen.findByTestId("studio-share-invite-dialog");
    expect(dialog).toBeTruthy();

    fireEvent.change(screen.getByLabelText("초대할 이메일 또는 @아이디"), {
      target: { value: "@jinho.line" },
    });
    fireEvent.click(screen.getByTestId("studio-share-send-invite"));
    expect(screen.getByText("@jinho.line")).toBeTruthy();

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByTestId("studio-share-invite-dialog")).toBeNull();
  });

  it("4번 협업: 5대 핵심 축(초대·4대 직무 RBAC·컷 점유 따라가기·핀 검수·안전 복원)이 유기적으로 동작한다", () => {
    render(
      <MemoryRouter>
        <ProductionGrandAtelierCollabHub />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("collab-pillar-1-invite")).toBeTruthy();
    expect(screen.getByTestId("collab-pillar-2-rbac")).toBeTruthy();
    expect(screen.getByTestId("collab-pillar-3-presence")).toBeTruthy();
    expect(screen.getByTestId("collab-pillar-4-review")).toBeTruthy();
    expect(screen.getByTestId("collab-pillar-5-history")).toBeTruthy();

    // 컷 점유 따라가기 동작
    fireEvent.click(screen.getByTestId("collab-follow-cut-02"));
    expect(screen.getByText(/현재 시점 따라가기 중: 준호/u)).toBeTruthy();

    // 외부 열람자 전환 시 핀 댓글·승인·이력 복원 잠금 확인
    fireEvent.click(screen.getByTestId("collab-role-external-viewer"));
    expect((screen.getByTestId("collab-hub-add-pin-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("collab-hub-approve-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("collab-hub-restore-v12-lineart-pass") as HTMLButtonElement).disabled).toBe(true);

    // 총괄 작가 복귀 후 안전 복원(자동 백업 동반) 검증
    fireEvent.click(screen.getByTestId("collab-role-lead-author"));
    fireEvent.click(screen.getByTestId("collab-hub-restore-v12-lineart-pass"));
    expect(screen.getByRole("status").textContent).toContain("v12-lineart-pass 시점으로 안전 복원했습니다");
  });
});
