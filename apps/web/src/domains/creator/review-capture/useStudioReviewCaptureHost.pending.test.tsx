// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode, useLayoutEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reviewEditorFixture } from "../review-handoff/studio-review-editor-test-fixture";
import { useStudioReviewCaptureHost } from "./useStudioReviewCaptureHost";

import type { DrawEl } from "../studio-element-model";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { StudioSharedDocument } from "../studio-shared-document-client";
import type { StudioReviewCaptureInput } from "../virtual-space/studio-virtual-space-review-producer";
import type { StudioReviewCaptureSnapshot } from "./studio-review-capture-bridge";

const api = vi.hoisted(() => ({ read: vi.fn(), patch: vi.fn(), prepare: vi.fn(), produce: vi.fn(), cancel: vi.fn() }));
vi.mock("../studio-shared-document-client", () => ({ getStudioSharedDocument: api.read, updateStudioSharedDocument: api.patch }));
vi.mock("../virtual-space/studio-virtual-space-review-producer", () => ({
  studioReviewCaptureContentDigest: async (doc: unknown) => JSON.stringify(doc),
  prepareStudioVirtualSpaceReviewCapture: api.prepare,
  produceStudioVirtualSpaceReviewCapture: api.produce,
  cancelStudioVirtualSpaceReviewCapture: api.cancel,
}));
// 실제 Host hook·capture hook·bridge·문서 투영을 사용하고 대화상자만 snapshot 관찰면으로 바꾼다.
vi.mock("./StudioReviewCaptureDialogMount", () => ({
  StudioReviewCaptureDialogMount: ({ open, snapshot }: { open: boolean; snapshot: StudioReviewCaptureSnapshot }) => open
    ? <section role="dialog" aria-label="캡처 상태"><output data-testid="capture-state">{snapshot.phase}:{snapshot.reason}</output></section>
    : null,
}));

function fixture() {
  const initial = reviewEditorFixture(() => "a".repeat(64));
  const stroke: DrawEl = { id: "pending-ink", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
    points: [10, 10, 30, 25], stroke: "#1a1a1a", strokeWidth: 12 };
  const nextSnapshot: StudioProjectSnapshot = { ...initial.snapshot,
    pagesList: initial.snapshot.pagesList.map((page) => page.id === "p1"
      ? { ...page, elements: [...page.elements, stroke] } : page) };
  const pending = { current: { pageId: "p1", strokes: [stroke] } as { pageId: string; strokes: DrawEl[] } | null };
  const generation = { current: 1 };
  const ticket: StudioEditorMutationTicket = { authScopeKey: "actor", workId: "work", accessGeneration: 1, documentGeneration: 1 };
  const timeline: string[] = [];
  const publishIdentity = (identity: { actorId: string; workId: string }, documentGeneration: number) => {
    ticket.authScopeKey = identity.actorId;
    ticket.workId = identity.workId;
    ticket.accessGeneration = identity.actorId === "actor" && identity.workId === "work" ? 1 : 2;
    ticket.documentGeneration = documentGeneration;
    generation.current = documentGeneration;
    timeline.push(`published:${documentGeneration}`);
  };
  const flush = vi.fn<() => boolean>();
  const flushPendingStrokeCommitsRef = { current: flush };
  const snapshotRead = vi.fn<(snapshot: StudioProjectSnapshot) => void>();
  api.read.mockImplementation(async () => { timeline.push(`read:${ticket.documentGeneration}`); return initial.saved; });
  const bindings = { studioAuthUserId: "actor", workId: "work", available: true,
    editorMountedRef: { current: true }, studioRevisionProjectGenerationRef: generation,
    drawingRef: { current: null as unknown }, pendingStrokeCommitsRef: pending, flushPendingStrokeCommitsRef,
    captureStudioMutationTicket: () => ({ ...ticket }), canApplyStudioMutation: vi.fn(() => true),
    canvasWidth: 800, isDurableMask: () => false, save: vi.fn(async () => { await api.patch(); }),
    captureAll: vi.fn(async (): Promise<HTMLCanvasElement[]> => []),
  };
  const control: { flushSucceeds: boolean; clearPendingOnFailedFlush: boolean; nextIdentity: { actorId: string; workId: string } | null;
    sameTickPending: { pageId: string; strokes: DrawEl[] } | null } = {
    flushSucceeds: true, clearPendingOnFailedFlush: false, nextIdentity: null, sameTickPending: null,
  };
  const clearPending = () => { pending.current = null; };
  const installSameTickPending = () => {
    if (!control.sameTickPending) return false;
    pending.current = control.sameTickPending;
    return true;
  };
  return { initial, nextSnapshot, bindings, pending, generation, ticket, timeline, flush, snapshotRead, control,
    publishIdentity, clearPending, installSameTickPending };
}

type Fixture = ReturnType<typeof fixture>;
function Host({ state, automatic = false }: { state: Fixture; automatic?: boolean }) {
  const [snapshot, setSnapshot] = useState(state.initial.snapshot);
  const [identity, setIdentity] = useState({ actorId: "actor", workId: "work" });
  useLayoutEffect(() => {
    const generation = snapshot === state.nextSnapshot ? 2 : 1;
    state.publishIdentity(identity, generation);
  }, [identity, snapshot, state]);
  state.flush.mockImplementation(() => {
    state.timeline.push("flush");
    if (!state.control.flushSucceeds) {
      if (state.control.clearPendingOnFailedFlush) state.clearPending();
      return false;
    }
    if (state.control.nextIdentity) setIdentity(state.control.nextIdentity);
    setSnapshot(state.nextSnapshot);
    state.clearPending();
    return true;
  });
  const capture = useStudioReviewCaptureHost({ ...state.bindings,
    studioAuthUserId: identity.actorId, workId: identity.workId,
    ...(automatic ? { reviewHandoff: {
      search: `?captureArtifact=artifact&captureRevision=revision&captureDigest=${"a".repeat(64)}`,
      getCurrentPageId: () => snapshot.currentPageId, hasActivePointer: () => false, select: vi.fn(),
    } } : {}),
    getSnapshot: () => {
      state.timeline.push(`snapshot:${state.ticket.documentGeneration}`);
      state.snapshotRead(snapshot);
      return snapshot;
    } });
  return <><button type="button" onClick={() => {
    capture.open();
    if (state.installSameTickPending()) capture.open();
  }}>검수본 열기</button>
    <output data-testid="published-ink">{snapshot === state.nextSnapshot ? "pending-ink" : "baseline"}</output>
    {capture.dialog}</>;
}

beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

describe("검수 캡처 수동 진입의 pending 획 publication", () => {
  it("pending을 한 번 flush하고 React가 새 문서를 publish한 뒤 저장 원고와 비교한다", async () => {
    const state = fixture();
    render(<Host state={state} />);
    expect(state.flush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    // 실제 flushSync가 layout effect의 새 mutation generation까지 publish해야 한다.
    expect(state.flush).toHaveBeenCalledOnce();
    expect(screen.getByTestId("published-ink").textContent).toBe("pending-ink");
    await waitFor(() => expect(screen.getByTestId("capture-state").textContent).toBe("needs-save:not-saved"));
    expect(state.timeline).toEqual(["published:1", "flush", "published:2", "read:2", "snapshot:2"]);
    expect(state.snapshotRead).toHaveBeenCalledExactlyOnceWith(state.nextSnapshot);
    expect(api.read).toHaveBeenCalledOnce();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
    expect(api.produce).not.toHaveBeenCalled();
    expect(state.bindings.captureAll).not.toHaveBeenCalled();
  });

  it.each(["authority", "mounted", "hydration", "drawing"] as const)("%s 차단에서는 flush나 서버 원고 조회 없이 기존 실패 상태를 연다", async (gate) => {
    const state = fixture();
    if (gate === "authority") state.bindings.canApplyStudioMutation.mockReturnValue(false);
    if (gate === "mounted") state.bindings.editorMountedRef.current = false;
    if (gate === "hydration") state.bindings.available = false;
    if (gate === "drawing") state.bindings.drawingRef.current = { id: "active-pointer" };
    render(<Host state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    await waitFor(() => expect(screen.getByTestId("capture-state").textContent).toBe("failed:unavailable"));
    expect(state.flush).not.toHaveBeenCalled();
    expect(api.read).not.toHaveBeenCalled();
    expect(state.snapshotRead).not.toHaveBeenCalled();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it("GPU 영수증 미완료로 flush가 false이면 pending을 지키고 서버 원고를 조회하지 않는다", async () => {
    const state = fixture(); state.control.flushSucceeds = false;
    const originalPending = state.pending.current;
    render(<Host state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    await waitFor(() => expect(screen.getByTestId("capture-state").textContent).toBe("failed:unavailable"));
    expect(state.flush).toHaveBeenCalledOnce();
    expect(state.pending.current).toBe(originalPending);
    expect(screen.getByTestId("published-ink").textContent).toBe("baseline");
    expect(api.read).not.toHaveBeenCalled();
    expect(state.snapshotRead).not.toHaveBeenCalled();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it("실패한 flush가 pending을 잘못 비워도 서버 원고 조회나 검수본 생성을 허용하지 않는다", async () => {
    const state = fixture(); state.control.flushSucceeds = false; state.control.clearPendingOnFailedFlush = true;
    render(<Host state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    await waitFor(() => expect(screen.getByTestId("capture-state").textContent).toBe("failed:unavailable"));
    expect(state.flush).toHaveBeenCalledOnce();
    expect(state.pending.current).toBeNull();
    expect(api.read).not.toHaveBeenCalled();
    expect(state.snapshotRead).not.toHaveBeenCalled();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
    expect(api.produce).not.toHaveBeenCalled();
  });

  it.each([
    { name: "계정", actorId: "next-actor", workId: "work" },
    { name: "작품", actorId: "actor", workId: "next-work" },
  ])("flush publication 중 $name scope가 바뀌면 새 scope의 캡처를 열거나 조회하지 않는다", async ({ actorId, workId }) => {
    const state = fixture(); state.control.nextIdentity = { actorId, workId };
    render(<Host state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    await act(async () => {});
    expect(state.flush).toHaveBeenCalledOnce();
    expect(state.ticket).toMatchObject({ authScopeKey: actorId, workId });
    expect(screen.queryByRole("dialog", { name: "캡처 상태" })).toBeNull();
    expect(api.read).not.toHaveBeenCalled();
    expect(state.snapshotRead).not.toHaveBeenCalled();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it.each([false, true])("자동 진입은 pending을 flush하지 않는다: StrictMode=%s", async (strict) => {
    const state = fixture();
    const content = () => strict ? <StrictMode><Host state={state} automatic /></StrictMode>
      : <Host state={state} automatic />;
    const view = render(content());
    await act(async () => {});
    view.rerender(content());
    await act(async () => {});
    expect(state.flush).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "캡처 상태" })).toBeNull();
    expect(state.pending.current?.strokes).toHaveLength(1);
    expect(api.read).not.toHaveBeenCalled();
    expect(state.snapshotRead).not.toHaveBeenCalled();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.prepare).not.toHaveBeenCalled();
  });

  it("uncertain 캡처를 pending과 함께 다시 열어도 flush·재전송 없이 기존 intent와 PNG를 지킨다", async () => {
    const state = fixture(), nextPending = state.pending.current;
    state.pending.current = null;
    // PNG encoder는 실제 bridge를 거친다. producer 전송 경계만 모의하므로 PNG 내용 해독은 범위 밖이다.
    const png = new Blob(["단위 테스트 PNG 입력"], { type: "image/png" });
    const canvases = state.initial.snapshot.pagesList.map(() => {
      const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 1200;
      vi.spyOn(canvas, "toBlob").mockImplementation((callback) => callback(png));
      return canvas;
    });
    state.bindings.captureAll.mockResolvedValue(canvases);
    api.prepare.mockImplementation(async (input: StudioReviewCaptureInput) => ({ ...input,
      projectId: "graph", artifactId: "artifact", expectedHeadRevisionId: "head", expectedHeadRootGraphHash: "b".repeat(64) }));
    api.produce.mockRejectedValueOnce({ ambiguous: true });
    render(<Host state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    await waitFor(() => expect(screen.getByTestId("capture-state").textContent).toBe("uncertain:request-failed"));
    expect(state.flush).not.toHaveBeenCalled();
    expect(api.produce).toHaveBeenCalledOnce();
    const originalIntent = api.produce.mock.calls[0]?.[0], originalPages = api.produce.mock.calls[0]?.[1];
    expect(originalIntent).toBeDefined(); expect(originalPages).toHaveLength(canvases.length);
    const reads = api.read.mock.calls.length;
    state.pending.current = nextPending;
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    expect(state.flush).not.toHaveBeenCalled();
    expect(state.pending.current).toBe(nextPending);
    expect(screen.getByTestId("capture-state").textContent).toBe("uncertain:request-failed");
    expect(api.read).toHaveBeenCalledTimes(reads);
    expect(api.prepare).toHaveBeenCalledOnce();
    expect(api.produce).toHaveBeenCalledOnce();
    expect(api.produce.mock.calls[0]?.[0]).toBe(originalIntent);
    expect(api.produce.mock.calls[0]?.[1]).toBe(originalPages);
    expect(state.bindings.captureAll).toHaveBeenCalledOnce();
    for (const canvas of canvases) expect(canvas.toBlob).toHaveBeenCalledOnce();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it("checking 중 같은 event tick에서 pending을 설정하고 재진입해도 flush나 두 번째 원고 조회를 하지 않는다", async () => {
    const state = fixture(); state.control.sameTickPending = state.pending.current; state.pending.current = null;
    let resolveRead: (saved: StudioSharedDocument) => void = () => { throw new Error("원고 조회 Promise가 준비되지 않았습니다."); };
    api.read.mockReturnValue(new Promise<StudioSharedDocument>((resolve) => { resolveRead = resolve; }));
    render(<Host state={state} />);
    fireEvent.click(screen.getByRole("button", { name: "검수본 열기", exact: true }));
    expect(state.flush).not.toHaveBeenCalled();
    expect(state.pending.current).toBe(state.control.sameTickPending);
    await waitFor(() => expect(api.read).toHaveBeenCalledOnce());
    expect(screen.getByTestId("capture-state").textContent).toBe("checking:");
    expect(api.prepare).not.toHaveBeenCalled();
    expect(api.produce).not.toHaveBeenCalled();
    expect(state.bindings.save).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    await act(async () => { resolveRead(state.initial.saved); });
    expect(api.read).toHaveBeenCalledOnce();
    expect(api.prepare).not.toHaveBeenCalled();
  });
});
