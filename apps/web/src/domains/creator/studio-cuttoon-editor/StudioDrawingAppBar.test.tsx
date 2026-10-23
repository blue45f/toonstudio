// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDrawingAppBar } from "./StudioDrawingAppBar";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

afterEach(() => {
  cleanup();
});

function createMockSession(
  overrides: Partial<StudioCuttoonEditorViewSession> = {},
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
});
