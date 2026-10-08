// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  holdStudioLocalDraftOwnership,
  STUDIO_LOCAL_DRAFT_OWNER_PREFIX,
  studioLocalDraftOwnerScope,
} from "../live/studio-live-local-draft-owner";
import { useStudioLocalDraftOwner } from "./useStudioLocalDraftOwner";

/**
 * F-B04-1 회귀 고정: 게스트 로컬 문서의 재진입 동선(문서 경로·스튜디오 홈 "이어서 작업"
 * resume=latest)은 룸 파라미터를 싣지 않는다. 그 동선에서도 직전 룸으로 해석돼야
 * 그 룸에 키잉된 복구 계층(CRDT 복구 보관소 등)이 다시 닿는다.
 */

const PREVIOUS_ROOM = "work-instant-prev-1234";
const FRESH_ROOM = "work-instant-fresh-5678";
const SCOPE = studioLocalDraftOwnerScope({
  ownerId: "guest-user",
  projectId: "project-1",
  documentId: "doc-1",
  draftId: null,
});
const RECEIPT_KEY = STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(SCOPE);
const LEASE_NAME = STUDIO_LOCAL_DRAFT_OWNER_PREFIX + JSON.stringify([SCOPE, PREVIOUS_ROOM]);
const FRESH_LEASE_NAME = STUDIO_LOCAL_DRAFT_OWNER_PREFIX + JSON.stringify([SCOPE, FRESH_ROOM]);

/**
 * Web Locks 의미를 따른다: 점유 중이면 ifAvailable은 즉시 null, 대기 요청은 해제 시 원자적으로 넘겨받고
 * signal이 중단되면 대기열에서 빠진다. 해제는 브라우저처럼 콜백의 promise가 끝난 뒤에 일어난다.
 */
class FakeLockManager {
  readonly held = new Set<string>();
  private readonly waiting = new Map<string, (() => void)[]>();

  async request(
    name: string,
    options: { ifAvailable: true } | { signal: AbortSignal },
    callback: (lock: unknown | null) => Promise<void>,
  ): Promise<void> {
    const signal = "signal" in options ? options.signal : null;
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (!this.held.has(name)) {
      this.held.add(name);
    } else if (!signal) {
      await callback(null);
      return;
    } else {
      await new Promise<void>((resolve, reject) => {
        const grant = () => {
          signal.removeEventListener("abort", cancel);
          resolve();
        };
        const cancel = () => {
          this.waiting.set(name, (this.waiting.get(name) ?? []).filter((entry) => entry !== grant));
          reject(new DOMException("aborted", "AbortError"));
        };
        signal.addEventListener("abort", cancel, { once: true });
        this.waiting.set(name, [...(this.waiting.get(name) ?? []), grant]);
      });
    }
    try {
      await callback({ name });
    } finally {
      const next = this.waiting.get(name)?.shift();
      if (next) next();
      else this.held.delete(name);
    }
  }
}

let locks: FakeLockManager;

function seedReceipt(room: string): void {
  window.localStorage.setItem(RECEIPT_KEY, JSON.stringify({ v: 1, scope: SCOPE, room }));
}

function readReceiptRoom(): string | null {
  const raw = window.localStorage.getItem(RECEIPT_KEY);
  if (!raw) return null;
  return (JSON.parse(raw) as { room?: unknown }).room as string;
}

function renderOwner(overrides: Partial<Parameters<typeof useStudioLocalDraftOwner>[0]> = {}) {
  return renderHook(() => useStudioLocalDraftOwner({
    initialInstantWorkId: FRESH_ROOM,
    roomId: null,
    workId: null,
    remixId: null,
    ownerId: "guest-user",
    projectId: "project-1",
    documentId: "doc-1",
    draftId: null,
    ...overrides,
  }));
}

beforeEach(() => {
  locks = new FakeLockManager();
  Object.defineProperty(window.navigator, "locks", { configurable: true, value: locks });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window.navigator, "locks", { configurable: true, value: undefined });
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("useStudioLocalDraftOwner — 룸 없는 재진입의 직전 룸 해석", () => {
  it("resume=latest처럼 룸 없이 재진입하면 원점 영수증의 직전 룸으로 해석된다", async () => {
    seedReceipt(PREVIOUS_ROOM);
    const { result } = renderOwner();
    await waitFor(() => expect(result.current).toBe(PREVIOUS_ROOM));
    expect(readReceiptRoom()).toBe(PREVIOUS_ROOM);
  });

  it("직전 룸의 리스가 아직 살아 있으면 채택하지 않고 영수증도 덮지 않는다", async () => {
    seedReceipt(PREVIOUS_ROOM);
    locks.held.add(LEASE_NAME);
    const { result } = renderOwner();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBe(FRESH_ROOM);
    expect(readReceiptRoom()).toBe(PREVIOUS_ROOM);
  });

  it("영수증이 없으면 새 룸이 원점이 되어 영수증에 등록된다", async () => {
    const { result } = renderOwner();
    await waitFor(() => expect(readReceiptRoom()).toBe(FRESH_ROOM));
    expect(result.current).toBe(FRESH_ROOM);
  });

  it("손상된 영수증은 직전 룸으로 취급하지 않고 새 룸으로 다시 등록한다", async () => {
    window.localStorage.setItem(RECEIPT_KEY, "corrupt");
    const { result } = renderOwner();
    await waitFor(() => expect(readReceiptRoom()).toBe(FRESH_ROOM));
    expect(result.current).toBe(FRESH_ROOM);
  });

  it("서버 작업(workId)이 있으면 영수증이 있어도 룸 채택을 하지 않는다", async () => {
    seedReceipt(PREVIOUS_ROOM);
    const { result } = renderOwner({ workId: "server-work-1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBe(FRESH_ROOM);
    expect(readReceiptRoom()).toBe(PREVIOUS_ROOM);
  });

  it("URL이 룸을 싣고 오면 기존대로 그 룸의 원점 회복을 검증한다", async () => {
    seedReceipt(PREVIOUS_ROOM);
    const { result } = renderOwner({ roomId: PREVIOUS_ROOM });
    await waitFor(() => expect(result.current).toBe(PREVIOUS_ROOM));
  });

  it("다른 문서의 영수증은 이 문서의 직전 룸으로 해석되지 않는다", async () => {
    seedReceipt(PREVIOUS_ROOM);
    const { result } = renderOwner({ documentId: "doc-2" });
    await waitFor(() => expect(readReceiptRoom()).toBe(PREVIOUS_ROOM));
    expect(result.current).toBe(FRESH_ROOM);
  });
});

describe("useStudioLocalDraftOwner — 소유 탭 리스의 연속성", () => {
  it("자기 룸을 ?room=으로 게시해 효과가 다시 돌아도 리스를 놓지 않아 복제 탭이 원점을 회복하지 못한다", async () => {
    const { result, rerender } = renderHook(
      ({ roomId }: { roomId: string | null }) => useStudioLocalDraftOwner({
        initialInstantWorkId: FRESH_ROOM,
        roomId,
        workId: null,
        remixId: null,
        ownerId: "guest-user",
        projectId: "project-1",
        documentId: "doc-1",
        draftId: null,
      }),
      { initialProps: { roomId: null as string | null } },
    );
    await waitFor(() => expect(locks.held.has(FRESH_LEASE_NAME)).toBe(true));
    expect(readReceiptRoom()).toBe(FRESH_ROOM);

    // StudioDocumentLayout이 이 탭의 instant id를 ?room=으로 게시한 직후의 재렌더.
    rerender({ roomId: FRESH_ROOM });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(locks.held.has(FRESH_LEASE_NAME)).toBe(true);

    // sessionStorage가 복제된 탭은 같은 원점 영수증을 보지만, 살아 있는 소유 탭의 리스를 얻지 못한다.
    const onDuplicateRecovered = vi.fn();
    const closeDuplicate = holdStudioLocalDraftOwnership({
      scope: SCOPE,
      room: FRESH_ROOM,
      knownTabOwner: false,
      workId: null,
      remixId: null,
      storage: window.localStorage,
      locks,
      onRecovered: onDuplicateRecovered,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDuplicateRecovered).not.toHaveBeenCalled();
    expect(result.current).toBe(FRESH_ROOM);
    closeDuplicate();
  });

  it("룸 없는 재진입으로 회복한 직전 룸도 ?room= 게시 뒤 리스를 놓지 않는다", async () => {
    seedReceipt(PREVIOUS_ROOM);
    const { result, rerender } = renderHook(
      ({ roomId }: { roomId: string | null }) => useStudioLocalDraftOwner({
        initialInstantWorkId: FRESH_ROOM,
        roomId,
        workId: null,
        remixId: null,
        ownerId: "guest-user",
        projectId: "project-1",
        documentId: "doc-1",
        draftId: null,
      }),
      { initialProps: { roomId: null as string | null } },
    );
    await waitFor(() => expect(result.current).toBe(PREVIOUS_ROOM));

    // StudioDocumentLayout이 회복한 룸을 ?room=으로 게시한 직후의 재렌더.
    rerender({ roomId: PREVIOUS_ROOM });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(locks.held.has(LEASE_NAME)).toBe(true);
    expect(result.current).toBe(PREVIOUS_ROOM);

    const onDuplicateRecovered = vi.fn();
    const closeDuplicate = holdStudioLocalDraftOwnership({
      scope: SCOPE,
      room: PREVIOUS_ROOM,
      knownTabOwner: false,
      workId: null,
      remixId: null,
      storage: window.localStorage,
      locks,
      onRecovered: onDuplicateRecovered,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onDuplicateRecovered).not.toHaveBeenCalled();
    closeDuplicate();
  });
});
