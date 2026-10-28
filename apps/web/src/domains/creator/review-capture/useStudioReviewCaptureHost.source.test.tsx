// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStudioReviewCaptureHost } from "./useStudioReviewCaptureHost";
import { studioReviewCaptureSourceHref } from "./studio-review-capture-source";
import type { StudioReviewCaptureHostBindings } from "./studio-review-capture-host-context";

const capture = vi.hoisted(() => ({ open: vi.fn(), getContext: null as (() => unknown) | null }));
vi.mock("./useStudioReviewCapture", () => ({ useStudioReviewCapture: (_key: string, bindings: { getContext: () => unknown }) => {
  capture.getContext = bindings.getContext;
  return { open: capture.open, getOpenPhase: () => "idle", visible: false, snapshot: { phase: "idle" }, save: vi.fn(), retry: vi.fn(), close: vi.fn() };
} }));
vi.mock("./StudioReviewCaptureDialogMount", () => ({ StudioReviewCaptureDialogMount: () => null }));
vi.mock("../review-handoff/StudioReviewEditorHandoffMount", () => ({ StudioReviewEditorHandoffMount: () => null }));
afterEach(cleanup);
beforeEach(() => { capture.open.mockReset().mockReturnValue(true); capture.getContext = null; });

function bindings(available: boolean): StudioReviewCaptureHostBindings {
  return { studioAuthUserId: "actor", workId: "work", available, editorMountedRef: { current: true },
    studioRevisionProjectGenerationRef: { current: 1 }, drawingRef: { current: null }, pendingStrokeCommitsRef: { current: null },
    flushPendingStrokeCommitsRef: { current: vi.fn(() => true) },
    captureStudioMutationTicket: () => ({ authScopeKey: "actor", workId: "work", accessGeneration: 1, documentGeneration: 1 }),
    canApplyStudioMutation: () => true, getSnapshot: () => { throw new Error("원본 조회는 캡처 bridge가 수행합니다."); },
    canvasWidth: 800, isDurableMask: () => false, save: vi.fn(async () => undefined), captureAll: vi.fn(async () => []) };
}
const source = { artifactId: "original", revisionId: "submitted", rootGraphHash: "a".repeat(64) };
const search = new URL(studioReviewCaptureSourceHref("work", source), "https://toon.test").search;

describe("제출 정본 캡처의 Editor 진입", () => {
  it("편집기 준비 뒤 명시적인 정본 링크를 한 번 처리하고 같은 tuple을 bridge로 전달한다", async () => {
    const view = renderHook(({ available, query }) => useStudioReviewCaptureHost({ ...bindings(available),
      reviewHandoff: { search: query, getCurrentPageId: () => "page", hasActivePointer: () => false, select: vi.fn() } }),
    { initialProps: { available: false, query: search } });
    expect(capture.open).not.toHaveBeenCalled();
    view.rerender({ available: true, query: search });
    await waitFor(() => expect(capture.open).toHaveBeenCalledTimes(1));
    expect(capture.getContext?.()).toMatchObject({ workId: "work", sourceRevision: source });
    view.rerender({ available: true, query: search });
    expect(capture.open).toHaveBeenCalledTimes(1);
    const next = search.replace("captureRevision=submitted", "captureRevision=other");
    view.rerender({ available: true, query: next });
    await waitFor(() => expect(capture.open).toHaveBeenCalledTimes(2));
    expect(capture.getContext?.()).toMatchObject({ sourceRevision: { revisionId: "other" } });
  });
  it("불완전한 정본 링크에서는 자동 캡처를 시작하지 않는다", () => {
    renderHook(() => useStudioReviewCaptureHost({ ...bindings(true), reviewHandoff: {
      search: "?captureRevision=submitted", getCurrentPageId: () => "page", hasActivePointer: () => false, select: vi.fn(),
    } }));
    expect(capture.open).not.toHaveBeenCalled();
  });
});
