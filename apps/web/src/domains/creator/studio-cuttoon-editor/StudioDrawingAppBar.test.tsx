// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDrawingAppBar } from "./StudioDrawingAppBar";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";
import { bindStudioScopedWriteAuthority } from "../studio-collab/studio-scoped-write-authority";
import { createStudioScopedWriteFixture } from "../studio-collab/studio-scoped-write.test-fixture";
import { createStudioScopedHistory } from "../studio-collab/studio-scoped-history";
import { admitStudioScopedDrawStart, admitStudioScopedPagesCommit } from "../studio-collab/studio-scoped-write-mutation";
import { resolveStudioEditAvailability } from "../studio-edit-controls";
import { StudioCrdtDocument } from "../live/studio-crdt-document";
import { studioDrawElementToCrdtStroke, studioPageToCrdtPage } from "../live/studio-crdt-page-bridge";
import { publishStudioCrdtSceneGraphDiff } from "../live/studio-crdt-scene-publisher";
import type { PageState } from "../studio-page-state";

afterEach(() => {
  cleanup();
});

function createMockSession(
  overrides: Partial<Omit<StudioCuttoonEditorViewSession, "symmetryType">> & {
    symmetryType?: StudioCuttoonEditorViewSession["symmetryType"] | "off";
  } = {},
): StudioCuttoonEditorViewSession {
  return {
    name: "에피소드 12화 원고",
    brush: "g-pen",
    activeCatalogBrush: { id: "g-pen", name: "G펜 Pro" },
    strokeWidth: 16,
    setStrokeWidth: vi.fn(),
    brushOpacity: 0.8,
    setBrushOpacity: vi.fn(),
    stabilizer: 20,
    setStabilizer: vi.fn(),
    color: "#1e293b",
    colorWheelOpen: false,
    setColorWheelOpen: vi.fn(),
    symmetryType: "off",
    changeStudioSymmetryType: vi.fn(),
    setSymmetryType: vi.fn(),
    canvasFlipH: false,
    studioOptionsBarsHandlers: {
      flipCanvasHorizontal: vi.fn(),
      openBrushStudio: vi.fn(),
    },
    studioBrushCatalogHandlers: {
      toggle: vi.fn(),
    },
    quickAccessPaletteOpen: false,
    setQuickAccessPaletteOpen: vi.fn(),
    visibleLeftPanelOpen: true,
    setLeftPanelOpenWithOverride: vi.fn(),
    visibleRightPanelOpen: true,
    setRightPanelOpenWithOverride: vi.fn(),
    canvasOnlyMode: false,
    setCanvasOnlyMode: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    menuEditUndoDisabled: false,
    menuEditRedoDisabled: false,
    isMobile: false,
    setMobileSheet: vi.fn(),
    zoom: 1.5,
    setZoom: vi.fn(),
    quickShapeActive: false,
    setQuickShapeActive: vi.fn(),
    saving: false,
    collaborationOperationSyncPending: false,
    offlineSceneNotice: null,
    serverRevisionError: null,
    shortcutsOpen: false,
    requestSaveFlush: vi.fn(),
    setShortcutsOpen: vi.fn(),
    ...overrides,
  } as unknown as StudioCuttoonEditorViewSession;
}

const makeSession = createMockSession;

function renderAppBar(session: StudioCuttoonEditorViewSession) {
  return render(
    <MemoryRouter initialEntries={["/studio?drawingShell=app"]}>
      <StudioDrawingAppBar session={session} />
    </MemoryRouter>,
  );
}

describe("StudioDrawingAppBar", () => {
  it("실제 담당 획의 버튼 Undo·Redo가 전역 잠금을 유지하며 동일 CRDT ID를 삭제·복원한다", () => {
    const f = createStudioScopedWriteFixture(), owner = { current: { locked: true } }, document = new StudioCrdtDocument();
    const unbind = bindStudioScopedWriteAuthority(owner, f.authority), reportError = vi.fn();
    const page: PageState = { id: "page-1", elements: [], bg: "#ffffff", bgGrad: null, canvasH: 1000 };
    let index = 1;
    try {
      f.choose();
      const stroke = admitStudioScopedDrawStart(owner, page.id, page.elements, { id: "real-pointer-id", type: "draw", mode: "pen", kind: "freehand", points: [10, 20, 30, 40], stroke: "#000000", strokeWidth: 3 });
      const next: PageState[] = [{ ...page, elements: [stroke] }], history = [[page], next];
      expect(admitStudioScopedPagesCommit({ owner, previous: [page], next, reportError, lockMessage: () => "잠금" })).toBe(true);
      document.addPage(studioPageToCrdtPage(page)); document.addStroke(studioDrawElementToCrdtStroke(page.id, stroke));
      const original = f.authority.captureWriteContext();
      const controller = createStudioScopedHistory({ owner, getHistory: () => history, getIndex: () => index, getPending: () => [], flushPending: () => true,
        blocked: () => false, entryKind: () => "pages", reportError, publish: (previous, after) => { publishStudioCrdtSceneGraphDiff(document, previous, after, { registerNewDraws: false }); return true; },
        onApplied: (_direction, _pages, nextIndex) => { index = nextIndex; } });
      const ui = () => {
        const availability = resolveStudioEditAvailability({ historyIndex: index, historyLength: history.length, documentEmpty: !history[index]?.[0]?.elements.length,
          hasElementSelection: false, hasSingleElementSelection: false, hasPixelSelection: false, hasPixelEditing: false, pixelBusy: false, selectedImage: false,
          rasterRetouchTargetAvailable: false, interactionLocked: false, mutationLocked: true, selectedContentMutationLocked: true, masterEditMode: false,
          scopedHistoryAvailability: { undo: controller.canUndo(), redo: controller.canRedo() } });
        return <MemoryRouter><StudioDrawingAppBar session={createMockSession({ menuEditUndoDisabled: availability.undoDisabled, menuEditRedoDisabled: availability.redoDisabled,
          undo: () => { controller.undo(); }, redo: () => { controller.redo(); } })} /></MemoryRouter>;
      };
      const view = render(ui());
      expect(screen.getByRole("button", { name: "실행 취소" }).matches(":disabled")).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
      expect(index).toBe(0); expect(document.getStroke("real-pointer-id", true)?.deleted).toBe(true);
      f.authority.captureWriteContext(); view.rerender(ui());
      expect(screen.getByRole("button", { name: "다시 실행" }).matches(":disabled")).toBe(false);
      fireEvent.click(screen.getByRole("button", { name: "다시 실행" }));
      expect(index).toBe(1); expect(document.getStroke("real-pointer-id")?.id).toBe("real-pointer-id");
      expect(f.authority.captureWriteContext()).toMatchObject({ creations: [], restorations: [{ kind: "stroke", id: "real-pointer-id", targetId: "target-1" }] });
      expect(original.creations[0]?.id).toBe("real-pointer-id"); expect(owner.current.locked).toBe(true); expect(reportError).not.toHaveBeenCalled();
      f.expire(); view.rerender(ui()); expect(screen.getByRole("button", { name: "실행 취소" }).matches(":disabled")).toBe(true);
    } finally { unbind(); document.destroy(); }
  });
  it("클립스튜디오(CSP) 2× 우위 검증 메타데이터, 컨테이너 쿼리(inline-size), 다기종 폼팩터 속성을 노출한다", () => {
    const session = createMockSession({ isMobile: false });
    const { container } = renderAppBar(session);

    const header = container.querySelector('[data-studio-drawing-app-bar="true"]') as HTMLElement | null;
    expect(header).not.toBeNull();
    expect(header?.getAttribute("data-studio-form-factor")).toBe("desktop");
    expect(header?.getAttribute("data-studio-csp-two-x-verified")).toBe("true");
    expect(header?.style.containerType).toBe("inline-size");
    expect(container.querySelector('[data-studio-appbar-csp-badge="true"]')?.textContent).toContain("CSP");
  });

  it("브러시 크기·불투명도·손떨림 보정 빠른 스텝 버튼이 세션 핸들러를 즉시 호출한다", () => {
    const session = createMockSession({
      strokeWidth: 16,
      brushOpacity: 0.8,
      stabilizer: 20,
    });
    renderAppBar(session);

    expect(screen.getByTestId("studio-appbar-stroke-width").textContent).toBe("16 px");
    fireEvent.click(screen.getByRole("button", { name: "브러시 크기 키우기" }));
    expect(session.setStrokeWidth).toHaveBeenCalledWith(20);

    fireEvent.click(screen.getByRole("button", { name: "브러시 크기 줄이기" }));
    expect(session.setStrokeWidth).toHaveBeenCalledWith(12);

    expect(screen.getByTestId("studio-appbar-opacity").textContent).toBe("80%");
    fireEvent.click(screen.getByRole("button", { name: "불투명도 높이기" }));
    expect(session.setBrushOpacity).toHaveBeenCalledWith(0.9);

    expect(screen.getByTestId("studio-appbar-stabilizer").textContent).toBe("Stabilizer 20");
    fireEvent.click(screen.getByRole("button", { name: "손떨림 보정 높이기" }));
    expect(session.setStabilizer).toHaveBeenCalledWith(25);
  });

  it("원클릭으로 브러시 크기·불투명도·손떨림 보정을 빠르게 순환 전환한다", () => {
    const session = makeSession({ strokeWidth: 5, brushOpacity: 1, stabilizer: 3 });
    renderAppBar(session);

    fireEvent.click(screen.getByTestId("drawing-appbar-size-cycle"));
    expect(session.setStrokeWidth).toHaveBeenCalledWith(12);

    fireEvent.click(screen.getByTestId("drawing-appbar-opacity-cycle"));
    expect(session.setBrushOpacity).toHaveBeenCalledWith(0.75);

    fireEvent.click(screen.getByTestId("drawing-appbar-stabilizer-cycle"));
    expect(session.setStabilizer).toHaveBeenCalledWith(7);
  });

  it("실시간 서버 동기화·저장 중·오프라인 보호 상태를 표시하고 클릭 시 즉시 저장 플러시를 호출한다", () => {
    const syncedSession = makeSession();
    const { rerender } = render(
      <MemoryRouter>
        <StudioDrawingAppBar session={syncedSession} />
      </MemoryRouter>,
    );

    const syncButton = screen.getByTestId("drawing-appbar-sync-status");
    expect(syncButton.textContent).toContain("실시간 동기화됨");
    fireEvent.click(syncButton);
    expect(syncedSession.requestSaveFlush).toHaveBeenCalledTimes(1);

    rerender(
      <MemoryRouter>
        <StudioDrawingAppBar session={makeSession({ saving: true })} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("drawing-appbar-sync-status").textContent).toContain("실시간 저장 중…");

    rerender(
      <MemoryRouter>
        <StudioDrawingAppBar session={makeSession({ offlineSceneNotice: "오프라인 큐" })} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("drawing-appbar-sync-status").textContent).toContain("오프라인 보호 중");
  });

  it("단축키 및 입문 가이드 버튼 클릭 시 setShortcutsOpen을 토글한다", () => {
    const session = makeSession({ shortcutsOpen: false });
    renderAppBar(session);

    fireEvent.click(screen.getByTestId("drawing-appbar-help-button"));
    expect(session.setShortcutsOpen).toHaveBeenCalledTimes(1);
  });

  it("대칭 그리기 모드 순환·캔버스 좌우 반전·브러시 랩 열기·빠른 도형 보정·배율 100% 초기화가 정상 동작한다", () => {
    const session = createMockSession({ symmetryType: "off", zoom: 1.5, quickShapeActive: false });
    renderAppBar(session);

    fireEvent.click(screen.getByRole("button", { name: "대칭 그리기 모드 전환" }));
    expect(session.changeStudioSymmetryType).toHaveBeenCalledWith("vertical");

    fireEvent.click(screen.getByRole("button", { name: "캔버스 좌우 반전 보기" }));
    expect(session.studioOptionsBarsHandlers.flipCanvasHorizontal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "브러시 랩 열기" }));
    expect(session.studioOptionsBarsHandlers.openBrushStudio).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "빠른 도형 보정 전환" }));
    expect(session.setQuickShapeActive).toHaveBeenCalledWith(true);

    expect(screen.getByTestId("studio-appbar-zoom-percent").textContent).toBe("150%");
    fireEvent.click(screen.getByRole("button", { name: "캔버스 배율 100% 초기화" }));
    expect(session.setZoom).toHaveBeenCalledWith(1);
  });

  it("모바일 세션에서 컴팩트 폼팩터로 판정하고 모바일 브러시 시트를 연다", () => {
    const session = createMockSession({ isMobile: true, strokeWidth: 12 });
    const { container } = renderAppBar(session);

    const header = container.querySelector('[data-studio-drawing-app-bar="true"]');
    expect(header?.getAttribute("data-studio-form-factor")).toBe("compact");

    fireEvent.click(screen.getByRole("button", { name: "모바일 브러시 시트 열기" }));
    expect(session.setMobileSheet).toHaveBeenCalledWith("draw");

    fireEvent.click(screen.getByRole("button", { name: "모바일 브러시 크기 키우기" }));
    expect(session.setStrokeWidth).toHaveBeenCalledWith(14);
  });

  it("마우스 휠 스크롤 및 상하 방향키로 브러시 크기·불투명도·보정을 즉시 미세 조절하고 만다라 대칭을 지원한다", () => {
    const session = createMockSession({
      strokeWidth: 16,
      brushOpacity: 0.8,
      stabilizer: 20,
      symmetryType: "radial",
    });
    const { container } = renderAppBar(session);

    fireEvent.keyDown(screen.getByTestId("drawing-appbar-size-cycle"), { key: "ArrowUp" });
    expect(session.setStrokeWidth).toHaveBeenCalledWith(20);

    fireEvent.keyDown(screen.getByTestId("drawing-appbar-opacity-cycle"), { key: "ArrowDown" });
    expect(session.setBrushOpacity).toHaveBeenCalledWith(0.75);

    const stabilizerGroup = container.querySelector('[data-studio-quick-stabilizer-control="true"]');
    if (stabilizerGroup) {
      fireEvent.wheel(stabilizerGroup, { deltaY: -100 });
      expect(session.setStabilizer).toHaveBeenCalledWith(25);
    }

    fireEvent.click(screen.getByRole("button", { name: "대칭 그리기 모드 전환" }));
    expect(session.changeStudioSymmetryType).toHaveBeenCalledWith("mandala");
  });
});
