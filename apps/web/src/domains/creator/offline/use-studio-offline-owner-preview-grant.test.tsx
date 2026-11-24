// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioOfflineOwnerPreview } from "./StudioOfflineOwnerPreview";
import { useStudioOfflineOwnerPreviewGrant } from "./use-studio-offline-owner-preview-grant";
import type { StudioOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

const io = vi.hoisted(() => ({
  actor: vi.fn<() => string | null>(),
  listeners: new Set<() => void>(),
  readReceipt: vi.fn<(workId: string, signal: AbortSignal) => Promise<StudioOfflineOwnerReceipt | null>>(),
}));

vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: io.actor, listeners: io.listeners,
}));
vi.mock("./studio-offline-owner-receipt", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-offline-owner-receipt")>(), readOfflineOwnerReceipt: io.readReceipt,
}));

// 실제 figure의 마운트·해제를 검사한다. 원고나 파일을 만들지 않고 워커의 읽기 결과만 제공한다.
vi.mock("../studio-autosave-opfs-session", () => ({
  createStudioAutosaveOpfsSession: () => ({
    readLatest: () => ({
      state: "snapshot", savedAt: "2026-11-23T00:00:00.000Z",
      payload: { sourceWorkId: "work-a", sourceRevision: 1, pagesList: [{ id: "page", elements: [{ id: "s", type: "draw" }] }] },
    }),
    dispose: () => undefined,
  }),
}));
vi.mock("../studio-autosave-sqlite-store", () => ({ acquireStudioAutosaveSqliteStore: () => ({ read: () => null }) }));
vi.mock("../studio-page-lazy-ui", () => ({ StudioPageThumbnail: () => null }));

const onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, "onLine");
function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, value });
}
function receipt(workId = "work-a", expiresAt = Date.now() + 60_000): StudioOfflineOwnerReceipt {
  return { workId, userId: "owner", revision: 1, expiresAt };
}
beforeEach(() => {
  setOnline(false);
  io.actor.mockReturnValue(null);
  io.readReceipt.mockImplementation(async (workId) => receipt(workId));
});
afterEach(() => {
  cleanup();
  io.listeners.clear();
  vi.resetAllMocks();
  vi.useRealTimers();
  if (onlineDescriptor) Object.defineProperty(navigator, "onLine", onlineDescriptor);
  else Reflect.deleteProperty(navigator, "onLine");
});

describe("오프라인 열람 영수증 수명", () => {
  it.each(["missing", "read-error"])("조회 중에는 대기하고 %s 결과에는 열람을 끝낸다", async (outcome) => {
    const late = Promise.withResolvers<StudioOfflineOwnerReceipt | null>();
    io.readReceipt.mockReturnValueOnce(late.promise);
    const { result } = renderHook(() => useStudioOfflineOwnerPreviewGrant("work-a"));
    expect(result.current).toBeUndefined();
    await act(async () => {
      if (outcome === "missing") late.resolve(null);
      else late.reject(new Error("receipt unavailable"));
    });
    expect(result.current).toBeNull();
  });

  it("추가 입력이나 렌더 없이 만료 시각에 열람을 닫는다", async () => {
    vi.useFakeTimers();
    io.readReceipt.mockResolvedValue(receipt("work-a", Date.now() + 100));
    const { result } = renderHook(() => useStudioOfflineOwnerPreviewGrant("work-a"));
    await act(async () => {});
    expect(result.current?.workId).toBe("work-a");
    act(() => { vi.advanceTimersByTime(99); });
    expect(result.current?.workId).toBe("work-a");
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBeNull();
  });

  it.each(["online", "other-actor"])("%s 전환은 이미 보이는 원고 figure를 제거한다", async (event) => {
    render(<StudioOfflineOwnerPreview workId="work-a" />);
    await screen.findByRole("figure");
    await act(async () => {
      if (event === "online") {
        setOnline(true);
        window.dispatchEvent(new Event("online"));
      } else {
        io.actor.mockReturnValue("different-owner");
        io.listeners.forEach((listener) => listener());
      }
    });
    expect(screen.queryByRole("figure")).toBeNull();
    if (event === "other-actor") expect(io.readReceipt).toHaveBeenCalledTimes(2);
  });

  it("다른 원고로 이동한 뒤 늦게 도착한 이전 영수증을 버린다", async () => {
    const late = Promise.withResolvers<StudioOfflineOwnerReceipt | null>();
    io.readReceipt.mockReturnValueOnce(late.promise);
    const { result, rerender } = renderHook(({ workId }) => useStudioOfflineOwnerPreviewGrant(workId), {
      initialProps: { workId: "work-a" },
    });
    const first = io.readReceipt.mock.calls[0]?.[1];
    rerender({ workId: "work-b" });
    expect(first?.aborted).toBe(true);
    await act(async () => late.resolve(receipt("work-a")));
    expect(result.current?.workId).toBe("work-b");
  });

  it("연결 복구와 화면 닫기 뒤에는 대기 중이던 확인이 원고를 다시 열지 못한다", async () => {
    const late = Promise.withResolvers<StudioOfflineOwnerReceipt | null>();
    io.readReceipt.mockReturnValue(late.promise);
    const { result, unmount } = renderHook(() => useStudioOfflineOwnerPreviewGrant("work-a"));
    const first = io.readReceipt.mock.calls[0]?.[1];
    act(() => { setOnline(true); window.dispatchEvent(new Event("online")); });
    expect(first?.aborted).toBe(true);
    await act(async () => late.resolve(receipt()));
    expect(result.current).toBeNull();

    const closing = Promise.withResolvers<StudioOfflineOwnerReceipt | null>();
    io.readReceipt.mockReturnValue(closing.promise);
    act(() => { setOnline(false); window.dispatchEvent(new Event("offline")); });
    const second = io.readReceipt.mock.calls[1]?.[1];
    unmount();
    expect(second?.aborted).toBe(true);
    expect(io.listeners.size).toBe(0);
    await act(async () => closing.resolve(receipt()));
  });
});
