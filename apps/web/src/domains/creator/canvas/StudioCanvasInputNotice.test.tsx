// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { studioCanvasInputBusy, studioCanvasInputStatus } from "./studio-canvas-input-status";
import { StudioCanvasInputNotice } from "./StudioCanvasInputNotice";

const ready = {
  saving: false, documentReloadRequired: false, sourceHydrationPending: false, workHydrationFailed: false,
  collaborationDocumentUnavailable: false, initialRecoveryBlocked: false, autosaveCheckFailed: false,
  hasAutosave: false, collaborationDocumentLocked: false, reviewLocked: false, follower: false,
};
afterEach(cleanup);

describe("원고 입력 안내", () => {
  it("복구 확인의 시작·완료 사이에만 대기 사유를 표시한다", () => {
    const state = studioCanvasInputStatus({ ...ready, initialRecoveryBlocked: true });
    const view = render(<StudioCanvasInputNotice id="notice" status={state} />);
    expect(studioCanvasInputBusy(state)).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("저장된 원고를 확인");
    view.rerender(<StudioCanvasInputNotice id="notice" status={studioCanvasInputStatus(ready)} />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(studioCanvasInputBusy(studioCanvasInputStatus(ready))).toBe(false);
  });

  it.each([
    [{ sourceHydrationPending: true }, "loading", true],
    [{ sourceHydrationPending: true, workHydrationFailed: true }, "source-error", false],
    [{ saving: true }, "saving", true],
    [{ initialRecoveryBlocked: true, hasAutosave: true }, "recovery-choice", false],
    [{ initialRecoveryBlocked: true, autosaveCheckFailed: true }, "recovery-error", false],
    [{ collaborationDocumentUnavailable: true }, "unavailable", false],
    [{ collaborationDocumentLocked: true }, "read-only", false],
    [{ reviewLocked: true }, "review", false], [{ follower: true }, "follower", false],
    [{ documentReloadRequired: true, saving: true }, "reload", false],
  ] as const)("%o 입력 상태에서는 %s 사유를 설명한다", (conditions, expected, busy) => {
    const state = studioCanvasInputStatus({ ...ready, ...conditions });
    expect(state).toBe(expected);
    expect(studioCanvasInputBusy(state)).toBe(busy);
    render(<StudioCanvasInputNotice status={state} id="source-state" />);
    expect(screen.getByRole("status").id).toBe("source-state");
    expect(screen.getByRole("status").textContent).not.toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
