// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioDrawingAppBar } from "./StudioDrawingAppBar";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

afterEach(cleanup);

function makeSession(overrides: Partial<StudioCuttoonEditorViewSession> = {}): StudioCuttoonEditorViewSession {
  return {
    name: "1화 원고",
    brush: "G펜",
    strokeWidth: 5,
    brushOpacity: 1,
    stabilizer: 3,
    color: "#112233",
    saving: false,
    collaborationOperationSyncPending: false,
    offlineSceneNotice: null,
    serverRevisionError: null,
    shortcutsOpen: false,
    setStrokeWidth: vi.fn(),
    setBrushOpacity: vi.fn(),
    setStabilizer: vi.fn(),
    requestSaveFlush: vi.fn(),
    setShortcutsOpen: vi.fn(),
    ...overrides,
  } as unknown as StudioCuttoonEditorViewSession;
}

describe("StudioDrawingAppBar", () => {
  it("원클릭으로 브러시 크기·불투명도·손떨림 보정을 빠르게 순환 전환한다", () => {
    const session = makeSession({ strokeWidth: 5, brushOpacity: 1, stabilizer: 3 });
    render(
      <MemoryRouter>
        <StudioDrawingAppBar session={session} />
      </MemoryRouter>,
    );

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
    render(
      <MemoryRouter>
        <StudioDrawingAppBar session={session} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("drawing-appbar-help-button"));
    expect(session.setShortcutsOpen).toHaveBeenCalledTimes(1);
  });
});
