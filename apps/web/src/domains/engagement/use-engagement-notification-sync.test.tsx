// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { localDateKey, type EngagementNotification } from "./engagement-model";
import { useEngagement } from "./engagement-store";
import { useEngagementNotificationSync } from "./use-engagement-notification-sync";

import { useApp } from "@/shared/lib/store";
import type { Title } from "@/shared/lib/types";
import { getProductionPersonalInbox } from "@/domains/creator/public/production-projects";

const controls = vi.hoisted(() => ({
  appHydrated: true,
  engagementHydrated: true,
  session: {
    ready: true,
    status: "unauthenticated" as "authenticated" | "unauthenticated",
    data: null as { user: { id: string }; token: string | null } | null,
  },
  apiFetch: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock("@/platform/api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/platform/api")>(),
  apiFetch: controls.apiFetch,
}));
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => controls.session,
}));
vi.mock("@/shared/lib/store", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/shared/lib/store")>(),
  useHydrated: () => controls.appHydrated,
}));
vi.mock("./engagement-store", async (importOriginal) => ({
  ...await importOriginal<typeof import("./engagement-store")>(),
  useEngagementHydrated: () => controls.engagementHydrated,
}));
vi.mock("@/domains/creator/public/production-projects", () => ({
  getProductionPersonalInbox: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/platform/creator-marketplace-client", () => ({
  listCreatorMarketplaceCloudLibrary: vi.fn(async () => ({ items: [], hasMore: false })),
}));

function title(id: string, overrides: Partial<Title> = {}): Title {
  return {
    id, slug: id, type: "webtoon", title: `작품 ${id}`, author: "작가",
    genres: [], tags: [], synopsis: "소개", cover: ["#111111", "#222222"],
    status: "ongoing", ageRating: "12", releaseYear: 2026, updateDays: ["금"],
    availability: [{ platformId: "naver-webtoon", pricing: "free" }],
    stats: {
      views: 1, likes: 1, bookmarks: 1, ratingAvg: 4, ratingCount: 1,
      ratingDist: [0, 0, 0, 1, 0], rankDelta: 0, trendingScore: 50,
      completionRate: 50, bingeIndex: 50,
    },
    ...overrides,
  };
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function deferredResponse() {
  let resolve: (value: Response) => void = () => { throw new Error("요청이 시작되지 않았습니다."); };
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve: (value: Response) => resolve(value) };
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function releases(): readonly EngagementNotification[] {
  return useEngagement.getState().notifications.filter((item) => item.category === "release");
}

function bindOwner(id: string | null): void {
  controls.session.data = id ? { user: { id }, token: null } : null;
  controls.session.status = id ? "authenticated" : "unauthenticated";
  useApp.getState().setSessionIdentity(id, null);
  useApp.setState({ libraryOwnerId: id });
  useEngagement.getState().bindEngagementOwner(id);
}

describe("구독 작품의 오늘 연재 예정 다이제스트", () => {
  let catalog: Title[];

  beforeEach(async () => {
    localStorage.clear();
    await useEngagement.persist.rehydrate();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 6, 10));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    controls.appHydrated = true;
    controls.engagementHydrated = true;
    controls.session.ready = true;
    controls.session.status = "unauthenticated";
    controls.session.data = null;
    useApp.setState({
      subscriptions: {}, userId: null, sessionToken: null, libraryOwnerId: null,
      libraryMergeOwnerId: null, authGeneration: 0, collectionOutbox: [],
    });
    useEngagement.getState().resetEngagementData();
    useEngagement.setState({ activeOwnerId: null, ownerPartitions: {} });
    catalog = [title("one")];
    controls.apiFetch.mockReset();
    controls.apiFetch.mockImplementation(async (url) => {
      const requested = new URL(url, "https://toonstudio.test").searchParams.get("ids")?.split(",") ?? [];
      return response({ items: catalog.filter((item) => requested.includes(item.id)) });
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("오늘 연재 요일인 진행 중 구독 작품만 예정 문구와 상세 링크로 전달한다", async () => {
    catalog = [title("one"), title("other-day", { updateDays: ["토"] }), title("finished", { status: "completed" })];
    useApp.setState({ subscriptions: { one: true, "other-day": true, finished: true, ignored: false } });
    renderHook(useEngagementNotificationSync);
    await flush();
    expect(releases()).toHaveLength(1);
    expect(releases()[0]).toMatchObject({ title: "작품 one 오늘 연재 예정", href: "/title/one" });
    expect(releases()[0]?.body).toContain("공개 여부");
    expect(releases()[0]?.title).not.toContain("업데이트 완료");
  });

  it("마지막 구독을 해제하면 추가 응답 없이 예정 목록을 즉시 비운다", async () => {
    useApp.setState({ subscriptions: { one: true } });
    renderHook(useEngagementNotificationSync);
    await flush();
    expect(releases()).toHaveLength(1);
    act(() => useApp.setState({ subscriptions: { one: false } }));
    expect(releases()).toHaveLength(0);
    expect(controls.apiFetch).toHaveBeenCalledTimes(1);
  });

  it("다른 기기에서 동기화된 구독 스냅샷으로 추가와 해제를 함께 반영한다", async () => {
    bindOwner("owner");
    catalog = [title("one"), title("remote")];
    useApp.setState({ subscriptions: { one: true } });
    renderHook(useEngagementNotificationSync);
    await flush();
    act(() => useApp.getState().hydrateFromServer({
      ratings: {}, reads: {}, subscriptions: { remote: true }, reviews: {}, likedReviews: {}, collections: [],
    }, { ownerId: "owner" }));
    await flush();
    expect(releases().map((item) => item.href)).toEqual(["/title/remote"]);
  });

  it.each(["focus", "visibilitychange", "online"])("%s 복귀 때 변경된 연재 요일을 다시 읽는다", async (event) => {
    useApp.setState({ subscriptions: { one: true } });
    renderHook(useEngagementNotificationSync);
    await flush();
    expect(releases()).toHaveLength(1);
    catalog = [title("one", { updateDays: ["토"] })];
    act(() => (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)));
    await flush();
    expect(releases()).toHaveLength(0);
    catalog = [title("one")];
    act(() => (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)));
    await flush();
    expect(releases()).toHaveLength(1);
  });

  it("앱을 열어 둔 채 자정이 지나면 전날 목록을 오늘 요일 목록으로 교체한다", async () => {
    vi.setSystemTime(new Date(2026, 10, 6, 23, 59, 59));
    catalog = [title("friday"), title("saturday", { updateDays: ["토"] })];
    useApp.setState({ subscriptions: { friday: true, saturday: true } });
    renderHook(useEngagementNotificationSync);
    await flush();
    expect(releases().map((item) => item.href)).toEqual(["/title/friday"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    await flush();
    expect(releases().map((item) => item.href)).toEqual(["/title/saturday"]);
    expect(releases()[0]?.id).toContain(localDateKey(new Date()));
  });

  it("세션과 두 저장소의 복원 및 소유자가 일치할 때까지 조회를 기다린다", async () => {
    controls.session.ready = false;
    controls.appHydrated = false;
    controls.engagementHydrated = false;
    useApp.setState({ subscriptions: { one: true } });
    const view = renderHook(useEngagementNotificationSync);
    await flush();
    expect(controls.apiFetch).not.toHaveBeenCalled();
    controls.session.ready = true;
    controls.appHydrated = true;
    view.rerender();
    await flush();
    expect(controls.apiFetch).not.toHaveBeenCalled();
    controls.engagementHydrated = true;
    controls.session.data = { user: { id: "owner" }, token: null };
    controls.session.status = "authenticated";
    view.rerender();
    await flush();
    expect(controls.apiFetch).not.toHaveBeenCalled();
    act(() => {
      bindOwner("owner");
      useApp.setState({ subscriptions: { one: true } });
    });
    view.rerender();
    await flush();
    expect(releases()).toHaveLength(1);
  });

  it("구독 해제 전 시작된 요청이 취소를 무시해도 알림을 되살리지 않는다", async () => {
    const pending = deferredResponse();
    controls.apiFetch.mockReturnValueOnce(pending.promise);
    useApp.setState({ subscriptions: { one: true } });
    renderHook(useEngagementNotificationSync);
    act(() => useApp.setState({ subscriptions: {} }));
    pending.resolve(response({ items: [title("one")] }));
    await flush();
    expect(releases()).toHaveLength(0);
  });

  it.each(["other-owner", null])("계정이 %s로 바뀐 뒤 이전 계정의 지연 응답을 버린다", async (nextOwner) => {
    bindOwner("original-owner");
    useApp.setState({ subscriptions: { one: true } });
    const pending = deferredResponse();
    controls.apiFetch.mockReturnValueOnce(pending.promise);
    const view = renderHook(useEngagementNotificationSync);
    catalog = [title("next")];
    act(() => {
      bindOwner(nextOwner);
      useApp.setState({ subscriptions: { next: true } });
    });
    view.rerender();
    await flush();
    pending.resolve(response({ items: [title("one")] }));
    await flush();
    expect(releases().map((item) => item.href)).toEqual(["/title/next"]);
    expect(useEngagement.getState().activeOwnerId).toBe(nextOwner);
  });

  it.each(["http", "invalid"])("%s 실패 때 저장된 예정 목록을 보존하고 재시도한다", async (failure) => {
    useApp.setState({ subscriptions: { one: true } });
    renderHook(useEngagementNotificationSync);
    await flush();
    const original = releases()[0];
    controls.apiFetch.mockResolvedValueOnce(failure === "http" ? response({}, 503) : response({}));
    act(() => { useEngagement.getState().requestNotificationSyncRetry(); });
    await flush();
    expect(releases()[0]).toEqual(original);
    expect(useEngagement.getState().notificationSyncStatus).toBe("error");
    act(() => { useEngagement.getState().requestNotificationSyncRetry(); });
    await flush();
    expect(releases()).toHaveLength(1);
    expect(useEngagement.getState().notificationSyncStatus).toBe("idle");
  });

  it("메타데이터 갱신에서 읽음·보관·미루기와 다른 종류 알림을 보존한다", async () => {
    bindOwner("owner");
    useApp.setState({ subscriptions: { one: true } });
    renderHook(useEngagementNotificationSync);
    await flush();
    const releaseId = releases()[0]?.id;
    if (!releaseId) throw new Error("연재 예정 알림이 생성되지 않았습니다.");
    const others: EngagementNotification[] = (["production", "market", "community", "availability"] as const).map((category) => ({
      id: category, category, title: "기존 알림", body: "기존 본문", href: "/notifications",
      createdAt: new Date().toISOString(), readAt: null, archivedAt: null, snoozedUntil: null,
      sourceKey: category === "production" ? "production-inbox:other"
        : category === "market" ? "market-library-update:other" : `${category}:other`,
    }));
    act(() => {
      useEngagement.getState().markNotificationRead(releaseId);
      useEngagement.getState().archiveNotification(releaseId);
      useEngagement.getState().snoozeNotification(releaseId, "2099-01-01T00:00:00Z");
      useEngagement.getState().upsertNotifications(others);
    });
    const saved = releases()[0];
    act(() => window.dispatchEvent(new Event("focus")));
    await flush();
    expect(releases()[0]).toEqual(saved);
    expect(useEngagement.getState().notifications).toEqual(expect.arrayContaining(others));
  });

  it("일시 조회 실패 뒤 화면 복귀가 성공하면 오류 상태를 해제한다", async () => {
    useApp.setState({ subscriptions: { one: true } });
    controls.apiFetch.mockResolvedValueOnce(response({}, 503));
    renderHook(useEngagementNotificationSync);
    await flush();
    expect(useEngagement.getState().notificationSyncStatus).toBe("error");
    act(() => { window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(releases()).toHaveLength(1);
    expect(useEngagement.getState().notificationSyncStatus).toBe("idle");
  });

  it("연재 예정 재조회 성공이 다른 알림 소스의 실패를 숨기지 않는다", async () => {
    bindOwner("owner");
    useApp.setState({ subscriptions: { one: true } });
    vi.mocked(getProductionPersonalInbox).mockRejectedValueOnce(new Error("제작 알림 조회 실패"));
    renderHook(useEngagementNotificationSync);
    await flush();
    expect(useEngagement.getState().notificationSyncStatus).toBe("error");
    act(() => { window.dispatchEvent(new Event("focus")); });
    await flush();
    expect(releases()).toHaveLength(1);
    expect(useEngagement.getState().notificationSyncStatus).toBe("error");
    act(() => { useEngagement.getState().requestNotificationSyncRetry(); });
    await flush();
    expect(useEngagement.getState().notificationSyncStatus).toBe("idle");
  });

  it("조회에 실패한 마지막 구독을 해제하면 더 조회할 예정 목록의 오류도 정리한다", async () => {
    useApp.setState({ subscriptions: { one: true } });
    controls.apiFetch.mockResolvedValueOnce(response({}, 503));
    renderHook(useEngagementNotificationSync);
    await flush();
    expect(useEngagement.getState().notificationSyncStatus).toBe("error");
    act(() => { useApp.setState({ subscriptions: { one: false } }); });
    await flush();
    expect(releases()).toHaveLength(0);
    expect(useEngagement.getState().notificationSyncStatus).toBe("idle");
  });
});
