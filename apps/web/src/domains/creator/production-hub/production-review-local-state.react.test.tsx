// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@/domains/auth/public/session/auth-session-state";
import { addStudioCommentThread, createEmptyStudioCommentsDocument } from "../studio-comments";
import { CompareReviewRoom, type CompareReviewRoomProps } from "./CompareReviewRoom";
import type { CompareSourcePoolStripProps } from "./CompareSourcePoolStrip";
import { ProductionEpisodeReviewRoom } from "./ProductionEpisodeReviewRoom";
import { productionReviewFlowFixture } from "./production-review-flow.test-fixture";
import { addComparePoolItem, createCompareImageAnchor, createEmptyCompareSession, parseCompareSession, poolItemFromExternal,
  serializeCompareSession, type CompareSession } from "./compare-review-model";
import { productionReviewLocalScope, productionReviewLocalScopeKey, productionReviewLocalStorageKey, readProductionReviewLocalState, writeProductionReviewLocalState,
  type ProductionReviewLocalScope } from "./production-review-local-state";
import { compareSendInboxKey, compareSendInboxScope, compareSendInboxToPoolItems, peekCompareSendInbox,
  writeCompareSendInbox, type CompareSendInboxEntry, type CompareSendInboxLockProvider } from "./compare-send-inbox";
import { createCompareSendInboxTestLocks } from "./compare-send-inbox-lock.test-fixture";
import { useProductionReviewLocalComments } from "./use-production-review-local-comments";

const auth = vi.hoisted(() => ({ userId: "account-A" as string | null, listeners: new Set<(session: Session) => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => auth.userId, listeners: auth.listeners }));
vi.mock("@/domains/auth/public/session/use-auth-actor-id", () => ({ useAuthActorId: () => auth.userId }));
vi.mock("./CompareReviewViewer", () => ({ CompareReviewViewer: ({ session }: { readonly session: CompareSession }) =>
  <output data-testid="compare-pool">{session.pool.map((item) => item.label).join(" · ")}</output> }));
vi.mock("./CompareSourcePoolStrip", () => ({ CompareSourcePoolStrip: ({ items, onRemove, readOnly }: CompareSourcePoolStripProps) =>
  readOnly ? null : <>{items.map((item) => <button key={item.id} onClick={() => onRemove(item)}>비교 소스 제거 {item.label}</button>)}</> }));
vi.mock("./ProductionShotGridVersionLineageSuite", () => ({ ProductionShotGridVersionLineageSuite: () => null }));
vi.mock("./ProductionViewerControlsBar", () => ({ ProductionViewerControlsBar: () => null }));
vi.mock("./ProductionWebtoonNowPmsSuite", () => ({ ProductionWebtoonNowPmsSuite: () => null }));
vi.mock("./EpisodeStageHandoffSection", () => ({ EpisodeStageHandoffSection: () => null }));
vi.mock("./use-server-presence-sync", () => ({ useServerPresenceSync: () => undefined }));
vi.mock("./use-pin-task-workspace-sync", () => ({ usePinTaskWorkspaceSync: () => ({ syncPinTasksFromDocument: vi.fn() }) }));
vi.mock("./use-episode-voice-commentary", () => ({ useEpisodeVoiceCommentary: () => ({
  voiceTracks: [], voicePanelOpen: false, setVoicePanelOpen: vi.fn(), voicePinIds: [], voiceListState: "ready",
  captureVoiceView: vi.fn(), applyVoiceView: vi.fn(), handleSaveVoiceTrack: vi.fn(), handleOpenVoicePin: vi.fn(),
}) }));

const NOW = "2026-10-30T00:00:00.000Z";
const image = poolItemFromExternal({ assetId: "private-image", label: "A의 미제출 이미지", imageUrl: "data:image/png;base64,AAAA",
  addedBy: "role-A", addedAt: NOW });
function compareProps(overrides: Partial<CompareReviewRoomProps> = {}): CompareReviewRoomProps {
  return { projectId: "project", workId: "work", episodeId: "episode", seedItems: [image],
    comments: createEmptyStudioCommentsDocument(), onCommentsChange: vi.fn(),
    currentActor: { id: "role-A", displayName: "실제 계정과 다른 검수 역할" }, ...overrides };
}
const room = (props: CompareReviewRoomProps) => <MemoryRouter><CompareReviewRoom {...props} /></MemoryRouter>;
const originalLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, "locks");
let locks: CompareSendInboxLockProvider;
function publishAuth(userId: string | null): void {
  auth.userId = userId;
  const session: Session = userId === null ? null : { user: { id: userId }, token: null };
  auth.listeners.forEach((listener) => listener(session));
}
beforeEach(() => {
  auth.userId = "account-A"; window.localStorage.clear(); vi.stubGlobal("BroadcastChannel", undefined);
  locks = createCompareSendInboxTestLocks();
  Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("단위 검증에서 예상하지 않은 네트워크 요청입니다."))));
});
afterEach(async () => {
  cleanup();
  await act(async () => { await Promise.resolve(); });
  try { expect(globalThis.fetch).not.toHaveBeenCalled(); } finally {
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    if (originalLocksDescriptor) Object.defineProperty(navigator, "locks", originalLocksDescriptor);
    else Reflect.deleteProperty(navigator, "locks");
  }
});

describe("비교 검수의 실제 React scope 전환", () => {
  it.each([false, true])("실제 계정 A→B→A 전환은 이미지 state를 재생성하고 다른 계정 키에 이전 pool을 기록하지 않는다(isDemo=%s)", (isDemo) => {
    const props = compareProps({ isDemo }), view = render(room(props));
    expect(screen.getByTestId("compare-pool").textContent).toBe(image.label);
    const a = productionReviewLocalScope("account-A", "project", "work", "episode");
    const original = readProductionReviewLocalState(a, "compare-session");
    expect(original).not.toBeNull();
    expect(readProductionReviewLocalState(productionReviewLocalScope("role-A", "project", "work", "episode"), "compare-session")).toBeNull();
    auth.userId = "account-B"; view.rerender(room({ ...props, seedItems: [] }));
    expect(screen.getByTestId("compare-pool").textContent).toBe("");
    expect(parseCompareSession(readProductionReviewLocalState(productionReviewLocalScope("account-B", "project", "work", "episode"), "compare-session"), "episode").pool).toEqual([]);
    auth.userId = "account-A"; view.rerender(room({ ...props, seedItems: [] }));
    expect(screen.getByTestId("compare-pool").textContent).toBe(image.label);
    expect(readProductionReviewLocalState(a, "compare-session")).toBe(original);
  });

  it.each(["projectId", "workId", "episodeId"] as const)("%s 변경 때 이전 이미지 state를 새 scope에 저장하지 않는다", (field) => {
    const props = compareProps(), view = render(room(props));
    const a = productionReviewLocalScope("account-A", props.projectId, props.workId, props.episodeId);
    const original = readProductionReviewLocalState(a, "compare-session");
    const next = { ...props, [field]: "other", seedItems: [] };
    view.rerender(room(next));
    expect(screen.getByTestId("compare-pool").textContent).toBe("");
    const scope = productionReviewLocalScope("account-A", next.projectId, next.workId, next.episodeId);
    expect(parseCompareSession(readProductionReviewLocalState(scope, "compare-session"), next.episodeId).pool).toEqual([]);
    expect(readProductionReviewLocalState(a, "compare-session")).toBe(original);
  });
});

function CommentOwner({ scope }: { readonly scope: ProductionReviewLocalScope }) {
  const [comments, setComments] = useProductionReviewLocalComments(scope, false);
  return <><output data-testid="comments">{comments.threads.map((thread) => thread.body).join(" · ")}</output>
    <button onClick={() => setComments((value) => addStudioCommentThread(value, {
      id: "comment-" + auth.userId, anchor: createCompareImageAnchor("private-image", { x: 0.2, y: 0.3 }),
      author: { id: "review-role", displayName: "검수자" }, body: "초안-" + auth.userId,
    }, new Date(NOW)))}>댓글 초안 추가</button></>;
}
const commentsRoom = (scope: ProductionReviewLocalScope) => <CommentOwner key={productionReviewLocalScopeKey(scope)} scope={scope} />;

describe("실제 댓글 저장 hook의 keyed 소유자 경계", () => {
  it("A와 B의 미제출 댓글이 섞이지 않고 A 재로그인 뒤 원래 댓글이 보존된다", () => {
    const a = productionReviewLocalScope("account-A", "project", "work", "episode");
    const view = render(commentsRoom(a)); fireEvent.click(screen.getByRole("button", { name: "댓글 초안 추가" }));
    expect(screen.getByTestId("comments").textContent).toBe("초안-account-A");
    const original = readProductionReviewLocalState(a, "compare-comments");
    auth.userId = "account-B";
    view.rerender(commentsRoom(productionReviewLocalScope("account-B", "project", "work", "episode")));
    expect(screen.getByTestId("comments").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "댓글 초안 추가" }));
    expect(screen.getByTestId("comments").textContent).toBe("초안-account-B");
    auth.userId = "account-A"; view.rerender(commentsRoom(a));
    expect(screen.getByTestId("comments").textContent).toBe("초안-account-A");
    expect(readProductionReviewLocalState(a, "compare-comments")).toBe(original);
  });

  it.each(["projectId", "workId", "episodeId"] as const)("%s 변경은 댓글 state를 새 key에 복사하지 않는다", (field) => {
    const a = productionReviewLocalScope("account-A", "project", "work", "episode"), view = render(commentsRoom(a));
    fireEvent.click(screen.getByRole("button", { name: "댓글 초안 추가" }));
    const original = readProductionReviewLocalState(a, "compare-comments"), next = { ...a, [field]: "other" };
    view.rerender(commentsRoom(next));
    expect(screen.getByTestId("comments").textContent).toBe("");
    expect(readProductionReviewLocalState(next, "compare-comments")).not.toContain("초안-account-A");
    expect(readProductionReviewLocalState(a, "compare-comments")).toBe(original);
  });
});

const transfer = (overrides: Partial<CompareSendInboxEntry> = {}): CompareSendInboxEntry => ({
  id: "transfer-1", pageId: "page-1", pageLabel: "전송받은 원본 PNG", imageUrl: "data:image/png;base64,AAAA", sentAt: NOW, ...overrides,
});
const transferScope = () => compareSendInboxScope("account-A", "work");
const transferDraftScope = () => productionReviewLocalScope("account-A", "project", "work", "episode");

function deferredVoid() {
  let accept: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => { accept = resolve; });
  return { promise, resolve: () => { if (!accept) throw new Error("대기 Promise가 초기화되지 않았습니다."); accept(); } };
}

async function holdTransferInbox() {
  const entered = deferredVoid(), released = deferredVoid(), key = compareSendInboxKey(transferScope());
  const settled = locks.request(key, { mode: "exclusive" }, async () => { entered.resolve(); await released.promise; });
  await entered.promise;
  let finished = false;
  return { finish: async () => {
    if (finished) return;
    finished = true;
    released.resolve();
    await settled;
    // 앞서 대기하던 ACK까지 실제 큐를 통과한 뒤 삭제되지 않았음을 검사한다.
    await locks.request(key, { mode: "exclusive" }, () => undefined);
  } };
}

describe("실제 비교 탭의 전송 원문 보존·전달 확인", () => {
  it("실제 회차의 기본 viewer를 열고 떠나도 수신함을 읽거나 지우지 않고 비교 탭을 열 때만 전달 확인한다", async () => {
    const fixture = productionReviewFlowFixture(), scope = compareSendInboxScope("account-A", fixture.aggregate.workId);
    await writeCompareSendInbox(window.localStorage, scope, transfer());
    const key = compareSendInboxKey(scope), original = window.localStorage.getItem(key);
    const reads = vi.spyOn(Storage.prototype, "getItem");
    const element = <MemoryRouter><ProductionEpisodeReviewRoom aggregate={fixture.aggregate} episodeId={fixture.scope.id}
      isDemo={false} canEdit={false} roleLens="art" viewerAssignmentId={null} onApproveLane={vi.fn()} /></MemoryRouter>;
    const first = render(element);
    expect(screen.queryByTestId("compare-pool")).toBeNull();
    expect(reads.mock.calls.some(([requested]) => requested === key)).toBe(false);
    first.unmount();
    expect(window.localStorage.getItem(key)).toBe(original);
    render(element);
    fireEvent.click(screen.getByRole("tab", { name: /버전 비교|Compare versions/u }));
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    await waitFor(() => expect(peekCompareSendInbox(window.localStorage, scope)).toEqual([]));
  });

  it("StrictMode 비교 mount와 실제 unmount/remount는 원본 PNG를 한 번만 합치고 저장 확인 뒤 ACK한다", async () => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const props = compareProps({ seedItems: [] }), first = render(<StrictMode>{room(props)}</StrictMode>);
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    await waitFor(() => expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([]));
    const saved = parseCompareSession(readProductionReviewLocalState(transferDraftScope(), "compare-session"), "episode");
    expect(saved.pool).toEqual(compareSendInboxToPoolItems([transfer()], "work"));
    first.unmount(); render(<StrictMode>{room(props)}</StrictMode>);
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    expect(parseCompareSession(readProductionReviewLocalState(transferDraftScope(), "compare-session"), "episode").pool).toHaveLength(1);
  });

  it("기기 저장 실패는 비교 화면과 경고를 유지하고 원문은 남기며 재진입 저장 성공 뒤 경고를 해제한다", async () => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const key = productionReviewLocalStorageKey(transferDraftScope(), "compare-session"), originalSet = Storage.prototype.setItem;
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, requested, value) {
      if (requested === key) throw new DOMException("저장 공간 부족", "QuotaExceededError");
      originalSet.call(this, requested, value);
    });
    const props = compareProps({ seedItems: [] }), first = render(room(props));
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    expect(screen.getByRole("alert").textContent).toMatch(/기기 저장|saving on this device/u);
    expect(screen.getByRole("alert").textContent).toMatch(/수신함|inbox/u);
    expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([transfer()]);
    first.unmount(); writes.mockRestore(); render(room(props));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    await waitFor(() => expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([]));
  });

  it("저장 직후 같은 원문을 다시 읽지 못하면 수신함을 ACK하지 않고 경고한다", async () => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const key = productionReviewLocalStorageKey(transferDraftScope(), "compare-session");
    const originalSet = Storage.prototype.setItem, originalGet = Storage.prototype.getItem; let written = false;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, requested, value) {
      originalSet.call(this, requested, value); if (requested === key) written = true;
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, requested) {
      return requested === key && written ? null : originalGet.call(this, requested);
    });
    render(room(compareProps({ seedItems: [] })));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([transfer()]);
  });

  it.each(["new", "replacement"] as const)("저장 확인 중 도착한 %s 전송본은 이전 원문의 ACK로 지우지 않는다", async (kind) => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const next = kind === "new" ? transfer({ id: "transfer-2", pageId: "page-2", pageLabel: "새 전송본" })
      : transfer({ imageUrl: "data:image/png;base64,BBBB", pageLabel: "교체 전송본" });
    const key = productionReviewLocalStorageKey(transferDraftScope(), "compare-session"), originalSet = Storage.prototype.setItem;
    let added = false, pendingSend: ReturnType<typeof writeCompareSendInbox> | undefined;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, requested, value) {
      originalSet.call(this, requested, value);
      if (requested === key && !added) { added = true; pendingSend = writeCompareSendInbox(window.localStorage, transferScope(), next); }
    });
    render(room(compareProps({ seedItems: [] })));
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    await act(async () => { await pendingSend; });
    await waitFor(() => expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([next]));
  });

  it("pool이 같은 source ID의 다른 이미지라면 원본 전송을 전달 확인한 것으로 보지 않는다", async () => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const [conflict] = compareSendInboxToPoolItems([transfer({ imageUrl: "data:image/png;base64,BBBB", pageLabel: "다른 이미지" })], "work");
    if (!conflict) throw new Error("같은 source의 충돌 fixture가 없습니다.");
    writeProductionReviewLocalState(transferDraftScope(), "compare-session", serializeCompareSession(addComparePoolItem(createEmptyCompareSession("episode"), conflict)));
    render(room(compareProps({ seedItems: [] })));
    expect(screen.getByTestId("compare-pool").textContent).toBe("다른 이미지");
    expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([transfer()]);
  });

  it("저장 중 계정이 바뀌면 A 수신함을 남기고 B에는 표시하지 않으며 A 재진입 때 중복 없이 복원한다", async () => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const key = productionReviewLocalStorageKey(transferDraftScope(), "compare-session"), originalSet = Storage.prototype.setItem; let switched = false;
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, requested, value) {
      originalSet.call(this, requested, value);
      if (requested === key && !switched) { switched = true; auth.userId = "account-B"; }
    });
    const props = compareProps({ seedItems: [] }), view = render(room(props));
    writes.mockRestore(); view.rerender(room(props));
    expect(screen.getByTestId("compare-pool").textContent).toBe("");
    auth.userId = "account-A";
    expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([transfer()]);
    view.rerender(room(props));
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    await waitFor(() => expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([]));
    expect(parseCompareSession(readProductionReviewLocalState(transferDraftScope(), "compare-session"), "episode").pool).toHaveLength(1);
  });

  it("샘플 비교는 기존 정책대로 수신함을 읽거나 전달 확인하지 않는다", async () => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    render(room(compareProps({ isDemo: true, seedItems: [] })));
    expect(screen.getByTestId("compare-pool").textContent).toBe("");
    expect(peekCompareSendInbox(window.localStorage, transferScope())).toEqual([transfer()]);
  });

  it.each(["missing-locks", "storage"] as const)("ACK의 %s 실패는 비교 화면과 저장된 초안을 유지하고 원문 보관을 알린다", async (failure) => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const key = compareSendInboxKey(transferScope()), original = window.localStorage.getItem(key);
    if (failure === "missing-locks") Object.defineProperty(navigator, "locks", { configurable: true, value: null });
    else {
      const originalSet = Storage.prototype.setItem;
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, requested, value) {
        if (requested === key) throw new DOMException("ACK 저장 차단", "QuotaExceededError");
        originalSet.call(this, requested, value);
      });
    }
    render(room(compareProps({ seedItems: [] })));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/기기 저장 또는 전달 확인|saving on this device or confirming/u));
    expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
    expect(window.localStorage.getItem(key)).toBe(original);
    const saved = parseCompareSession(readProductionReviewLocalState(transferDraftScope(), "compare-session"), "episode");
    expect(saved.pool).toEqual(compareSendInboxToPoolItems([transfer()], "work"));
  });

  it.each(["account", "account-aba", "unmount", "episode"] as const)("ACK 락 대기 중 %s 전환은 늦은 삭제와 새 화면의 상태 변경을 막는다", async (change) => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const key = compareSendInboxKey(transferScope()), original = window.localStorage.getItem(key), held = await holdTransferInbox();
    let inboxWrites = 0;
    const nextDraftKey = productionReviewLocalStorageKey(productionReviewLocalScope("account-A", "project", "work", "episode-2"), "compare-session");
    const originalSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, requested, value) {
      if (requested === key) inboxWrites += 1;
      // 새 회차도 같은 work 수신함을 읽으므로 새 회차 자신의 ACK는 저장 실패로 막는다.
      if (change === "episode" && requested === nextDraftKey) throw new DOMException("새 회차 저장 차단", "QuotaExceededError");
      originalSet.call(this, requested, value);
    });
    try {
      const props = compareProps({ seedItems: [] }), view = render(room(props));
      expect(screen.getByTestId("compare-pool").textContent).toBe(transfer().pageLabel);
      if (change === "account") { act(() => publishAuth("account-B")); view.rerender(room(props)); }
      else if (change === "account-aba") act(() => { publishAuth("account-B"); publishAuth("account-A"); });
      else if (change === "unmount") view.unmount();
      else view.rerender(room({ ...props, episodeId: "episode-2" }));
      await act(held.finish);
      expect(window.localStorage.getItem(key)).toBe(original);
      expect(inboxWrites).toBe(0);
      if (change === "account") {
        expect(screen.getByTestId("compare-pool").textContent).toBe("");
        expect(screen.queryByRole("alert")).toBeNull();
      } else if (change === "unmount") {
        expect(screen.queryByTestId("crv-room")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
      } else {
        expect(screen.getByRole("alert").textContent).toMatch(/기기 저장|saving on this device/u);
      }
    } finally { await act(held.finish); }
  });

  it("ACK 락 대기 중 현재 session에서 원본을 제거하면 이전 session의 ACK가 수신함을 지우지 않는다", async () => {
    await writeCompareSendInbox(window.localStorage, transferScope(), transfer());
    const key = compareSendInboxKey(transferScope()), original = window.localStorage.getItem(key), held = await holdTransferInbox();
    try {
      render(room(compareProps({ seedItems: [] })));
      fireEvent.click(screen.getByRole("button", { name: "비교 소스 제거 " + transfer().pageLabel }));
      expect(screen.getByTestId("compare-pool").textContent).toBe("");
      await act(held.finish);
      expect(window.localStorage.getItem(key)).toBe(original);
      expect(screen.queryByRole("alert")).toBeNull();
      const saved = parseCompareSession(readProductionReviewLocalState(transferDraftScope(), "compare-session"), "episode");
      expect(saved.pool).toEqual([]);
    } finally { await act(held.finish); }
  });
});
