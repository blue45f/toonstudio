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
    ...overrides,
  } as unknown as StudioCuttoonEditorViewSession;
}

function renderAppBar(session: StudioCuttoonEditorViewSession) {
  return render(
    <MemoryRouter initialEntries={["/studio?drawingShell=app"]}>
      <StudioDrawingAppBar session={session} />
    </MemoryRouter>,
  );
}

describe("StudioDrawingAppBar", () => {
  it("클립스튜디오(CSP) 2× 우위 검증 메타데이터와 다기종 폼팩터 속성을 노출한다", () => {
    const session = createMockSession({ isMobile: false });
    const { container } = renderAppBar(session);

    const header = container.querySelector('[data-studio-drawing-app-bar="true"]');
    expect(header).not.toBeNull();
    expect(header?.getAttribute("data-studio-form-factor")).toBe("desktop");
    expect(header?.getAttribute("data-studio-csp-two-x-verified")).toBe("true");
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

  it("대칭 그리기 모드 순환·캔버스 좌우 반전·브러시 랩 열기가 정상 동작한다", () => {
    const session = createMockSession({ symmetryType: "off" });
    renderAppBar(session);

    fireEvent.click(screen.getByRole("button", { name: "대칭 그리기 모드 전환" }));
    expect(session.changeStudioSymmetryType).toHaveBeenCalledWith("vertical");

    fireEvent.click(screen.getByRole("button", { name: "캔버스 좌우 반전 보기" }));
    expect(session.studioOptionsBarsHandlers.flipCanvasHorizontal).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "브러시 랩 열기" }));
    expect(session.studioOptionsBarsHandlers.openBrushStudio).toHaveBeenCalledTimes(1);
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
