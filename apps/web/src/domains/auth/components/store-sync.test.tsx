// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StoreSync } from "./store-sync";

import { useApp } from "@/shared/lib/store";
import { hasPendingSubscriptionWrites } from "@/shared/lib/store-api-post";

const session = vi.hoisted(() => ({
  value: {
    data: {
      user: { id: "owner-store-sync" },
      token: "session-store-sync" as string | null,
    },
    ready: true,
    status: "authenticated" as "authenticated" | "unauthenticated",
  },
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => session.value,
}));

vi.mock("@/shared/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/store")>();
  return { ...actual, useHydrated: () => true };
});

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function resetStore() {
  useApp.setState({
    ratings: {},
    reviews: {},
    reads: {},
    likedReviews: {},
    subscriptions: {},
    collections: [],
    collectionOutbox: [],
    userId: null,
    sessionToken: null,
    libraryOwnerId: null,
    libraryMergeOwnerId: null,
    authGeneration: 0,
    collectionRevision: 0,
  });
}

describe("StoreSync collection reconciliation", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    session.value.data.token = "session-store-sync";
    session.value.ready = true;
    session.value.status = "authenticated";
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it.each((["reads", "ratings", "reviews", "likedReviews"] as const).flatMap((slice) =>
    [false, true].map((writeFinished) => ({ slice, writeFinished })),
  ))("복귀 조회 중 변경한 $slice를 보호한다 (쓰기 선완료: $writeFinished)", async ({ slice, writeFinished }) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const snapshot = deferredResponse();
    const write = deferredResponse();
    const empty = { ratings: {}, reads: {}, subscriptions: {}, reviews: {}, likedReviews: {}, collections: [] };
    let reads = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/me") return write.promise;
      reads += 1;
      return reads === 2 ? snapshot.promise : response(empty);
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({ libraryOwnerId: "owner-store-sync" });
    render(<StoreSync />);
    await waitFor(() => expect(useApp.getState().userId).toBe("owner-store-sync"));
    await act(async () => { await Promise.resolve(); });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(reads).toBe(2));
    await act(async () => {
      const store = useApp.getState();
      if (slice === "reads") store.setRead("saved", "reading");
      if (slice === "ratings") store.setRating("saved", 4);
      if (slice === "reviews") store.upsertReview({
        titleId: "saved", rating: 4, text: "새 리뷰", tags: [], spoiler: false, createdAt: "2026-11-05T00:00:00Z",
      });
      if (slice === "likedReviews") store.toggleLikeReview("saved");
    });
    const edited = useApp.getState()[slice];
    if (writeFinished) await act(async () => { write.resolve(response({ ok: true })); });
    await act(async () => { snapshot.resolve(response(empty)); });
    expect(useApp.getState()[slice]).toEqual(edited);
    if (!writeFinished) await act(async () => { write.resolve(response({ ok: true })); });
  });

  it("읽기 쓰기가 진행 중이면 복귀 조회를 기다렸다가 완료 후 재시도한다", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const write = deferredResponse();
    let snapshots = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/me/read") return write.promise;
      snapshots += 1;
      return response({ ratings: {}, reads: snapshots === 1 ? {} : { saved: "reading" }, subscriptions: {}, reviews: {}, likedReviews: {}, collections: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({ libraryOwnerId: "owner-store-sync" });
    render(<StoreSync />);
    await waitFor(() => expect(snapshots).toBe(1));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      useApp.getState().setRead("saved", "reading");
      window.dispatchEvent(new Event("focus"));
    });
    expect(snapshots).toBe(1);
    await act(async () => { write.resolve(response({ ok: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(snapshots).toBe(2);
    expect(useApp.getState().reads).toEqual({ saved: "reading" });
  });

  it("다른 기기의 구독 변경을 화면 복귀 시 교체하고 같은 복귀 이벤트를 합친다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    let subscriptions: Record<string, boolean> = { original: true };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/me");
      return response({ ratings: {}, reads: {}, subscriptions, reviews: {}, likedReviews: {}, collections: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({ libraryOwnerId: "owner-store-sync" });

    render(<StoreSync />);
    await waitFor(() => expect(useApp.getState().subscriptions).toEqual({ original: true }));

    subscriptions = { remote: true };
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(useApp.getState().subscriptions).toEqual({ remote: true }));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    visibility = "hidden";
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    subscriptions = {};
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    await waitFor(() => expect(useApp.getState().subscriptions).toEqual({}));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("동기화 중 복귀 이벤트는 요청을 겹치지 않고 한 번만 재실행한다", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const first = deferredResponse();
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(response({
        ratings: {}, reads: {}, subscriptions: { remote: true }, reviews: {}, likedReviews: {}, collections: [],
      }));
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({ libraryOwnerId: "owner-store-sync" });

    render(<StoreSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    first.resolve(response({
      ratings: {}, reads: {}, subscriptions: { original: true }, reviews: {}, likedReviews: {}, collections: [],
    }));
    await waitFor(() => expect(useApp.getState().subscriptions).toEqual({ remote: true }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("해제 후 복귀 이벤트와 지연 응답이 구독을 변경하지 않는다", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const pending = deferredResponse();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const removeWindowListener = vi.spyOn(window, "removeEventListener");
    const removeDocumentListener = vi.spyOn(document, "removeEventListener");
    useApp.setState({ libraryOwnerId: "owner-store-sync", subscriptions: { saved: true } });

    const view = render(<StoreSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    view.unmount();
    expect(removeWindowListener).toHaveBeenCalledWith("focus", expect.any(Function));
    expect(removeDocumentListener).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
      pending.resolve(response({
        ratings: {}, reads: {}, subscriptions: { stale: true }, reviews: {}, likedReviews: {}, collections: [],
      }));
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(useApp.getState().subscriptions).toEqual({ saved: true });
  });

  it("세션 확인 전에는 기존 계정 구독을 보존하고 확인 후 동기화한다", async () => {
    session.value.ready = false;
    session.value.status = "unauthenticated";
    useApp.setState({
      userId: "owner-store-sync",
      libraryOwnerId: "owner-store-sync",
      subscriptions: { saved: true },
    });
    const fetchMock = vi.fn(async () => response({
      ratings: {}, reads: {}, subscriptions: { remote: true }, reviews: {}, likedReviews: {}, collections: [],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<StoreSync />);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useApp.getState().subscriptions).toEqual({ saved: true });
    expect(useApp.getState().userId).toBe("owner-store-sync");

    session.value.ready = true;
    session.value.status = "authenticated";
    view.rerender(<StoreSync />);
    await waitFor(() => expect(useApp.getState().subscriptions).toEqual({ remote: true }));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([false, true])("복귀 조회 중 바꾼 구독은 늦은 스냅샷에 덮이지 않는다 (쓰기 선완료: %s)", async (writeFinished) => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const snapshot = deferredResponse();
    const write = deferredResponse();
    let snapshotRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/me/subscription") return write.promise;
      expect(String(input)).toBe("/api/me");
      snapshotRequests += 1;
      if (snapshotRequests === 2) return snapshot.promise;
      return response({
        ratings: {}, reads: {}, subscriptions: { saved: snapshotRequests === 1 },
        reviews: {}, likedReviews: {}, collections: [],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({ libraryOwnerId: "owner-store-sync" });
    render(<StoreSync />);
    await waitFor(() => expect(useApp.getState().subscriptions).toEqual({ saved: true }));

    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(snapshotRequests).toBe(2));
    vi.useFakeTimers();
    act(() => useApp.getState().toggleSubscription("saved"));
    expect(hasPendingSubscriptionWrites()).toBe(true);
    if (writeFinished) {
      await act(async () => {
        write.resolve(response({ ok: true, subscribed: false }));
      });
      expect(hasPendingSubscriptionWrites()).toBe(false);
    }
    await act(async () => {
      snapshot.resolve(response({
        ratings: {}, reads: {}, subscriptions: { saved: true }, reviews: {}, likedReviews: {}, collections: [],
      }));
    });
    expect(useApp.getState().subscriptions).toEqual({ saved: false });

    if (!writeFinished) {
      await act(async () => window.dispatchEvent(new Event("focus")));
      expect(snapshotRequests).toBe(2);
      await act(async () => {
        write.resolve(response({ ok: true, subscribed: false }));
      });
    }
    expect(hasPendingSubscriptionWrites()).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(snapshotRequests).toBe(3);
    expect(useApp.getState().subscriptions).toEqual({ saved: false });
  });

  it.each([false, true])("구독 쓰기 성공·실패 후 진행 상태를 정리한다 (실패: %s)", async (failed) => {
    const write = deferredResponse();
    vi.stubGlobal("fetch", vi.fn(() => write.promise));
    useApp.getState().setSessionIdentity("owner-store-sync", "session-store-sync");
    useApp.getState().toggleSubscription("saved");
    expect(hasPendingSubscriptionWrites()).toBe(true);

    await act(async () => {
      if (failed) write.reject(new TypeError("연결 실패"));
      else write.resolve(response({ ok: true, subscribed: true }));
    });
    expect(hasPendingSubscriptionWrites()).toBe(false);
    expect(useApp.getState().subscriptions).toEqual({ saved: true });
  });

  it("이전 계정·세션의 구독 쓰기는 새 세션 동기화를 막지 않는다", async () => {
    const write = deferredResponse();
    vi.stubGlobal("fetch", vi.fn(() => write.promise));
    useApp.getState().setSessionIdentity("owner-store-sync", "previous-session");
    useApp.getState().toggleSubscription("saved");
    expect(hasPendingSubscriptionWrites()).toBe(true);

    useApp.getState().setSessionIdentity("owner-store-sync", "next-session");
    expect(hasPendingSubscriptionWrites()).toBe(false);
    useApp.getState().setSessionIdentity("another-owner", "another-session");
    expect(hasPendingSubscriptionWrites()).toBe(false);
    await act(async () => write.resolve(response({ ok: true, subscribed: true })));
    expect(hasPendingSubscriptionWrites()).toBe(false);
  });

  it("로그인 병합 도중 바꾼 구독은 보존하고 쓰기 완료 후 서버 스냅샷으로 교체한다", async () => {
    vi.useFakeTimers();
    const merge = deferredResponse();
    const write = deferredResponse();
    const serverCollection = {
      id: "server-existing", name: "서버 서재", emoji: "📚", titleIds: [], createdAt: "2026-11-06T00:00:00.000Z",
    };
    let snapshotRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/me/merge") {
        expect(JSON.parse(String(init?.body)).subscriptions).toEqual({ saved: true });
        return merge.promise;
      }
      if (String(input) === "/api/me/subscription") return write.promise;
      expect(String(input)).toBe("/api/me");
      snapshotRequests += 1;
      return response({
        ratings: {}, reads: {}, subscriptions: { remote: true }, reviews: {}, likedReviews: {}, collections: [serverCollection],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({ subscriptions: { saved: true } });

    render(<StoreSync />);
    expect(fetchMock).toHaveBeenCalledOnce();
    act(() => useApp.getState().toggleSubscription("saved"));
    await act(async () => {
      merge.resolve(response({
        ratings: {}, reads: {}, subscriptions: { saved: true }, reviews: {}, likedReviews: {}, collections: [serverCollection],
      }));
    });
    expect(useApp.getState().subscriptions).toEqual({ saved: false });
    expect(useApp.getState().collections).toEqual([serverCollection]);
    expect(useApp.getState().libraryOwnerId).toBe("owner-store-sync");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(snapshotRequests).toBe(0);
    await act(async () => {
      write.resolve(response({ ok: true, subscribed: false }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(snapshotRequests).toBe(1);
    expect(useApp.getState().subscriptions).toEqual({ remote: true });
    expect(useApp.getState().collections).toEqual([serverCollection]);
  });

  it("keeps local collection authority offline and resumes sync on reconnect", async () => {
    let online = false;
    vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
    const fetchMock = vi.fn(async () => response({
      ratings: {},
      reads: {},
      subscriptions: {},
      reviews: {},
      likedReviews: {},
      collections: [],
      collectionIdMap: {},
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<StoreSync />);
    await waitFor(() => expect(useApp.getState().userId).toBe("owner-store-sync"));
    expect(fetchMock).not.toHaveBeenCalled();

    online = true;
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("retries a failed guest merge on reconnect before replaying remapped edits", async () => {
    const guestId = "550e8400-e29b-41d4-a716-446655440000";
    const serverId = "server-existing-collection";
    const secondMerge = deferredResponse();
    const collectionCommands: Array<Record<string, unknown>> = [];
    let mergeAttempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === "/api/me/merge") {
        mergeAttempts += 1;
        return mergeAttempts === 1
          ? response({ message: "offline" }, 503)
          : secondMerge.promise;
      }
      if (path === "/api/me/collection") {
        const command = JSON.parse(String(init?.body)) as Record<string, unknown>;
        collectionCommands.push(command);
        return response({ ok: true, ...command });
      }
      throw new Error(`unexpected request: ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({
      collections: [{
        id: guestId,
        name: "게스트 이름",
        emoji: "📚",
        titleIds: [],
        createdAt: "2026-07-20T00:00:00.000Z",
      }],
    });

    render(<StoreSync />);
    await waitFor(() => expect(mergeAttempts).toBe(1));
    act(() => useApp.getState().renameCollection(guestId, "연결 복구 이름"));
    await waitFor(() => expect(useApp.getState().collectionOutbox).toHaveLength(2));
    expect(collectionCommands).toEqual([]);

    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(mergeAttempts).toBe(2));
    secondMerge.resolve(response({
      ratings: {},
      reads: {},
      subscriptions: {},
      reviews: {},
      likedReviews: {},
      collections: [
        {
          id: "pre-existing-server-collection",
          name: "서버 기존",
          emoji: "⭐",
          titleIds: [],
          createdAt: "2026-07-19T00:00:00.000Z",
        },
        {
          id: serverId,
          name: "게스트 이름",
          emoji: "📚",
          titleIds: [],
          createdAt: "2026-07-20T00:00:00.000Z",
        },
      ],
      collectionIdMap: { [guestId]: serverId },
    }));

    await waitFor(() => expect(collectionCommands).toHaveLength(1));
    expect(collectionCommands[0]).toMatchObject({
      action: "rename",
      id: serverId,
      name: "연결 복구 이름",
    });
    expect(useApp.getState().collections.map((collection) => collection.id)).toEqual([
      "pre-existing-server-collection",
      serverId,
    ]);
    expect(useApp.getState().collections[1]).toMatchObject({
      id: serverId,
      name: "연결 복구 이름",
    });
    expect(useApp.getState().collectionOutbox).toEqual([]);
  });

  it("does not hydrate a merge response that resolves after cleanup", async () => {
    const guestId = "550e8400-e29b-41d4-a716-446655440001";
    const merge = deferredResponse();
    vi.stubGlobal("fetch", vi.fn(() => merge.promise));
    useApp.setState({
      collections: [{
        id: guestId,
        name: "로컬 유지",
        emoji: "📚",
        titleIds: [],
        createdAt: "2026-07-20T00:00:00.000Z",
      }],
    });

    const view = render(<StoreSync />);
    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    view.unmount();
    merge.resolve(response({
      ratings: {}, reads: {}, subscriptions: {}, reviews: {}, likedReviews: {}, collections: [],
      collectionIdMap: { [guestId]: "server-late" },
    }));
    await act(async () => { await Promise.resolve(); });

    expect(useApp.getState().libraryOwnerId).toBeNull();
    expect(useApp.getState().collections[0]?.id).toBe(guestId);
  });

  it("does not hydrate a merge body that resolves after cleanup", async () => {
    const guestId = "550e8400-e29b-41d4-a716-446655440008";
    let resolveJson!: (value: unknown) => void;
    const json = new Promise<unknown>((resolve) => {
      resolveJson = resolve;
    });
    const jsonMock = vi.fn(() => json);
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: jsonMock,
    }) as unknown as Response));
    useApp.setState({
      collections: [{
        id: guestId,
        name: "본문 대기 중",
        emoji: "📚",
        titleIds: [],
        createdAt: "2026-07-20T00:00:00.000Z",
      }],
    });

    const view = render(<StoreSync />);
    await waitFor(() => expect(jsonMock).toHaveBeenCalledOnce());
    view.unmount();
    resolveJson({
      ratings: {}, reads: {}, subscriptions: {}, reviews: {}, likedReviews: {}, collections: [],
      collectionIdMap: { [guestId]: "server-late-body" },
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(useApp.getState().libraryOwnerId).toBeNull();
    expect(useApp.getState().collections[0]?.id).toBe(guestId);
  });

  it("coalesces an online event received while a failing merge is still running", async () => {
    const firstMerge = deferredResponse();
    let attempts = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      attempts += 1;
      return attempts === 1
        ? firstMerge.promise
        : Promise.resolve(response({
            ratings: {},
            reads: {},
            subscriptions: {},
            reviews: {},
            likedReviews: {},
            collections: [],
            collectionIdMap: {},
          }));
    }));

    render(<StoreSync />);
    await waitFor(() => expect(attempts).toBe(1));
    act(() => window.dispatchEvent(new Event("online")));
    firstMerge.resolve(response({ message: "failed" }, 503));

    await waitFor(() => expect(attempts).toBe(2));
    await waitFor(() => expect(useApp.getState().libraryOwnerId).toBe("owner-store-sync"));
  });

  it("times out a hung merge and honors an online rerun request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<StoreSync />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("online")));

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("times out a hung response body and honors an online rerun request", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: () => new Promise<never>(() => {}),
    }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<StoreSync />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event("online")));

    await act(async () => {
      vi.advanceTimersByTime(15_000);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("rebuilds recovery-only guest collections through the merge graph", async () => {
    const guestId = "550e8400-e29b-41d4-a716-446655440009";
    const serverId = "server-recovered-collection";
    let mergeBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) !== "/api/me/merge") {
        throw new Error(`unexpected request: ${String(input)}`);
      }
      mergeBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response({
        ratings: {},
        reads: {},
        subscriptions: {},
        reviews: {},
        likedReviews: {},
        collections: [{
          id: serverId,
          name: "복구한 게스트",
          emoji: "📚",
          titleIds: ["title-recovery"],
          createdAt: "2026-07-20T00:00:00.000Z",
        }],
        collectionIdMap: { [guestId]: serverId },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({
      collections: [],
      libraryOwnerId: null,
      libraryMergeOwnerId: null,
      collectionOutbox: [
        {
          mutationId: "recovery-create",
          ownerId: "owner-store-sync",
          command: {
            action: "create",
            id: guestId,
            name: "복구한 게스트",
            emoji: "📚",
          },
          rollback: { kind: "create" },
          recovery: true,
        },
        {
          mutationId: "recovery-item",
          ownerId: "owner-store-sync",
          command: {
            action: "set-item",
            id: guestId,
            titleId: "title-recovery",
            included: true,
          },
          rollback: {
            kind: "set-item",
            titleId: "title-recovery",
            previousIncluded: true,
            intendedIncluded: true,
          },
          recovery: true,
        },
      ],
    });

    render(<StoreSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(useApp.getState().collectionOutbox).toEqual([]));

    expect(mergeBody?.collections).toEqual([{
      id: guestId,
      name: "복구한 게스트",
      emoji: "📚",
      titleIds: ["title-recovery"],
      createdAt: expect.any(String),
    }]);
    expect(useApp.getState().collections).toEqual([expect.objectContaining({
      id: serverId,
      titleIds: ["title-recovery"],
    })]);
  });

  it("refetches after a stale account snapshot instead of reviving a completed delete", async () => {
    const snapshot = deferredResponse();
    let snapshotRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/me") {
        snapshotRequests += 1;
        if (snapshotRequests === 1) return snapshot.promise;
        return response({
          ratings: {},
          reads: {},
          subscriptions: {},
          reviews: {},
          likedReviews: {},
          collections: [{
            id: "remote-added",
            name: "서버 최신",
            emoji: "⭐",
            titleIds: [],
            createdAt: "2026-07-20T00:00:00.000Z",
          }],
        });
      }
      const command = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return response({ ok: true, ...command });
    });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({
      libraryOwnerId: "owner-store-sync",
      collections: [{
        id: "existing-edit",
        name: "이전 이름",
        emoji: "📚",
        titleIds: [],
        createdAt: "2026-07-20T00:00:00.000Z",
      }],
    });

    render(<StoreSync />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    act(() => useApp.getState().deleteCollection("existing-edit"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(useApp.getState().collectionOutbox).toEqual([]));

    snapshot.resolve(response({
      ratings: {},
      reads: {},
      subscriptions: {},
      reviews: {},
      likedReviews: {},
      collections: [
        {
          id: "existing-edit",
          name: "삭제 전 이름",
          emoji: "📚",
          titleIds: [],
          createdAt: "2026-07-20T00:00:00.000Z",
        },
        {
          id: "remote-added",
          name: "서버 추가",
          emoji: "⭐",
          titleIds: [],
          createdAt: "2026-07-20T00:00:00.000Z",
        },
      ],
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(useApp.getState().collections.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "remote-added", name: "서버 최신" },
    ]);
  });

  it("hydrates with the HttpOnly cookie when no readable session token exists", async () => {
    session.value.data.token = null;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).has("x-user-id")).toBe(false);
      return response({
        ratings: {},
        reads: {},
        subscriptions: {},
        reviews: {},
        likedReviews: {},
        collections: [],
        collectionIdMap: {},
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<StoreSync />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await waitFor(() => expect(useApp.getState().libraryOwnerId).toBe("owner-store-sync"));
    expect(useApp.getState().userId).toBe("owner-store-sync");
    expect(useApp.getState().sessionToken).toBeNull();
  });
});
