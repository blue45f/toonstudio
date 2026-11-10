// @vitest-environment jsdom

import { StrictMode, createElement, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PersonalCloudConnectionStatus, PersonalCloudProviderId } from "../save-first/personal-cloud-client";
import { PERSONAL_CLOUD_CONNECTION_PROVIDER_ORDER, usePersonalCloudConnections } from "./usePersonalCloudConnections";

const scheduleMacrotask = globalThis.setTimeout;

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const cloudMocks = vi.hoisted(() => ({
  listPersonalCloudConnections: vi.fn(),
  startPersonalCloudConnection: vi.fn(),
  disconnectPersonalCloud: vi.fn(),
}));

vi.mock("../save-first/personal-cloud-client", () => ({
  PERSONAL_CLOUD_PROVIDER_IDS: ["google-drive", "dropbox", "onedrive"] as const,
  listPersonalCloudConnections: cloudMocks.listPersonalCloudConnections,
  startPersonalCloudConnection: cloudMocks.startPersonalCloudConnection,
  disconnectPersonalCloud: cloudMocks.disconnectPersonalCloud,
}));

function makeConnection(
  provider: PersonalCloudProviderId,
  overrides: Partial<PersonalCloudConnectionStatus> = {},
): PersonalCloudConnectionStatus {
  const label = provider === "google-drive" ? "Google Drive" : provider === "dropbox" ? "Dropbox" : "OneDrive";
  return Object.freeze({
    provider,
    label,
    configured: true,
    connected: false,
    reason: null,
    accountLabel: null,
    scope: Object.freeze([]),
    accessTokenExpiresAt: null,
    updatedAt: "2026-11-10T00:00:00.000Z",
    lastUsedAt: null,
    ...overrides,
  });
}

async function flushMicrotasks(ticks = 4): Promise<void> {
  for (let index = 0; index < ticks; index += 1) await Promise.resolve();
}

async function flushEventLoopTurns(turns = 3): Promise<void> {
  for (let index = 0; index < turns; index += 1) {
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      scheduleMacrotask(resolve, 0);
    });
  }
  await Promise.resolve();
}

type WindowlessErrorOrigin = "hook-state-setter" | "react-passive-scheduler" | "other";

interface ClassifiedWindowlessError {
  readonly name: string;
  readonly message: string;
  readonly origin: WindowlessErrorOrigin;
  readonly stack: string;
}

function classifyWindowlessError(reason: unknown): ClassifiedWindowlessError {
  const name = reason instanceof Error ? reason.name : typeof reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? (reason.stack ?? `${name}: ${message}`) : message;
  const isHookSetter = /usePersonalCloudConnections|dispatchSetState|dispatchReducerAction|requestUpdateLane|resolveUpdatePriority/u.test(stack);
  const isReactPassiveScheduler = /flushWork|performWorkUntilDeadline|flushPassiveEffects|processRootScheduleInImmediateTask|performWorkOnRootViaSchedulerTask|scheduleImmediateRootScheduleTask/u.test(stack);
  return {
    name,
    message,
    origin: isHookSetter ? "hook-state-setter" : isReactPassiveScheduler ? "react-passive-scheduler" : "other",
    stack,
  };
}

interface WindowlessSettlement<T> {
  readonly outcome: PromiseSettledResult<Awaited<T>>;
  readonly unhandledRejections: readonly ClassifiedWindowlessError[];
  readonly uncaughtExceptions: readonly ClassifiedWindowlessError[];
}

/**
 * window 제거 상태에서 실제 Promise 정착과 복수의 매크로태스크 턴을 관찰하며,
 * 포착된 예외·미처리 rejection을 stack 기준으로 hook setter와 React 패시브 스케줄러로 구분한다.
 */
async function settleWithoutWindow<T>(task: () => Promise<T> | T): Promise<WindowlessSettlement<T>> {
  const unhandledRejections: ClassifiedWindowlessError[] = [];
  const uncaughtExceptions: ClassifiedWindowlessError[] = [];
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(classifyWindowlessError(reason));
  };
  const onUncaughtException = (error: Error) => {
    uncaughtExceptions.push(classifyWindowlessError(error));
  };
  process.on("unhandledRejection", onUnhandledRejection);
  process.on("uncaughtException", onUncaughtException);
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Reflect.deleteProperty(globalThis, "window");
    expect(typeof window).toBe("undefined");
    const execution = Promise.resolve().then(task);
    const [outcome] = await Promise.allSettled([execution]);
    await flushEventLoopTurns(3);
    return { outcome, unhandledRejections, uncaughtExceptions };
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor);
    process.off("unhandledRejection", onUnhandledRejection);
    process.off("uncaughtException", onUncaughtException);
  }
}

let originalLocationDescriptor: PropertyDescriptor | undefined;
const assignSpy = vi.fn();

beforeEach(() => {
  cloudMocks.listPersonalCloudConnections.mockReset();
  cloudMocks.startPersonalCloudConnection.mockReset();
  cloudMocks.disconnectPersonalCloud.mockReset();
  assignSpy.mockReset();
  originalLocationDescriptor = Object.getOwnPropertyDescriptor(window, "location");
  Object.defineProperty(window, "location", {
    value: { ...window.location, assign: assignSpy },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  cleanup();
  if (originalLocationDescriptor && typeof window !== "undefined") {
    Object.defineProperty(window, "location", originalLocationDescriptor);
  }
  vi.restoreAllMocks();
});

describe("usePersonalCloudConnections", () => {
  it("정상 성공 시 초기 연결 상태를 조회하고 provider별 조회·연결·해제를 수행한다", async () => {
    const initialLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections.mockReturnValueOnce(initialLoad.promise);

    const { result } = renderHook(() => usePersonalCloudConnections());
    expect(PERSONAL_CLOUD_CONNECTION_PROVIDER_ORDER).toEqual(["google-drive", "dropbox", "onedrive"]);
    expect(result.current.loading).toBe(true);
    expect(result.current.connections).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.busyProvider).toBeNull();

    const driveConnected = makeConnection("google-drive", { connected: true, accountLabel: "creator@example.test" });
    const dropboxConfigured = makeConnection("dropbox", { connected: false });
    await act(async () => {
      initialLoad.resolve([driveConnected, dropboxConfigured]);
      await initialLoad.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.connections).toEqual([driveConnected, dropboxConfigured]);
    expect(result.current.statusFor("google-drive")).toEqual(driveConnected);
    expect(result.current.statusFor("dropbox")).toEqual(dropboxConfigured);
    expect(result.current.statusFor("onedrive")).toBeNull();

    const startDeferred = createDeferred<{ authorizeUrl: string; expiresInMs: number }>();
    cloudMocks.startPersonalCloudConnection.mockReturnValueOnce(startDeferred.promise);
    let connectPromise!: Promise<void>;
    act(() => {
      connectPromise = result.current.connect("dropbox", "/studio?view=storage&project=p-1");
    });
    expect(result.current.busyProvider).toBe("dropbox");
    expect(cloudMocks.startPersonalCloudConnection).toHaveBeenCalledWith("dropbox", "/studio?view=storage&project=p-1");

    await act(async () => {
      startDeferred.resolve({ authorizeUrl: "https://auth.example.test/oauth/dropbox", expiresInMs: 300_000 });
      await connectPromise;
    });
    expect(assignSpy).toHaveBeenCalledWith("https://auth.example.test/oauth/dropbox");

    const disconnectDeferred = createDeferred<boolean>();
    const reloadAfterDisconnect = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.disconnectPersonalCloud.mockReturnValueOnce(disconnectDeferred.promise);
    cloudMocks.listPersonalCloudConnections.mockReturnValueOnce(reloadAfterDisconnect.promise);
    let disconnectPromise!: Promise<void>;
    act(() => {
      disconnectPromise = result.current.disconnect("google-drive");
    });
    expect(result.current.busyProvider).toBe("google-drive");

    const driveDisconnected = makeConnection("google-drive", { connected: false });
    await act(async () => {
      disconnectDeferred.resolve(true);
      await flushMicrotasks();
      reloadAfterDisconnect.resolve([driveDisconnected, dropboxConfigured]);
      await disconnectPromise;
    });
    expect(cloudMocks.disconnectPersonalCloud).toHaveBeenCalledWith("google-drive");
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.statusFor("google-drive")).toEqual(driveDisconnected);
  });

  it("정상 실패 시 오류 문구·폴백·길이 제한을 적용하고 재시도 성공 시 오류를 지운다", async () => {
    const firstLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections.mockReturnValueOnce(firstLoad.promise);

    const { result } = renderHook(() => usePersonalCloudConnections());
    await act(async () => {
      firstLoad.reject(new Error("  연결 상태 서버 점검 중  "));
      await flushMicrotasks();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toEqual([]);
    expect(result.current.error).toBe("연결 상태 서버 점검 중");

    cloudMocks.listPersonalCloudConnections.mockRejectedValueOnce("non-error-rejection");
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("개인 저장소 연결 상태를 확인하지 못했습니다.");

    cloudMocks.listPersonalCloudConnections.mockRejectedValueOnce(new Error("오".repeat(600)));
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.error).toHaveLength(500);

    const recovered = [makeConnection("onedrive", { connected: true })];
    cloudMocks.listPersonalCloudConnections.mockResolvedValueOnce(recovered);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.connections).toEqual(recovered);

    cloudMocks.startPersonalCloudConnection.mockRejectedValueOnce(new Error("OAuth 시작 거부"));
    await act(async () => {
      await result.current.connect("google-drive");
    });
    expect(result.current.error).toBe("OAuth 시작 거부");
    expect(result.current.busyProvider).toBeNull();
    expect(assignSpy).not.toHaveBeenCalled();

    cloudMocks.disconnectPersonalCloud.mockRejectedValueOnce(new Error("   "));
    await act(async () => {
      await result.current.disconnect("onedrive");
    });
    expect(result.current.error).toBe("개인 저장소 연결을 해제하지 못했습니다.");
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.connections).toEqual(recovered);
  });

  it("mount → unmount → window 제거 후 초기 effect와 명령형 reload의 지연 성공·실패를 event loop 턴까지 안전하게 무시한다", async () => {
    // 0) 대조 검증: 수명주기 보호가 없는 setter는 동일 raw unmount 후 window 제거 시 hook-state-setter stack 예외를 발생시킴
    const canaryDeferred = createDeferred<void>();
    let canarySettled!: Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: unknown }>;
    function UnguardedSetterCanary() {
      const [, setLoading] = useState(true);
      useEffect(() => {
        canarySettled = canaryDeferred.promise
          .finally(() => setLoading(false))
          .then(() => ({ ok: true as const }), (reason: unknown) => ({ ok: false as const, reason }));
      }, []);
      return null;
    }
    const canaryContainer = document.createElement("div");
    document.body.appendChild(canaryContainer);
    const canaryRoot = createRoot(canaryContainer);
    act(() => canaryRoot.render(createElement(UnguardedSetterCanary)));
    canaryRoot.unmount();
    await flushEventLoopTurns(1);
    canaryContainer.remove();

    const canarySettlement = await settleWithoutWindow(async () => {
      canaryDeferred.resolve();
      return canarySettled;
    });
    expect(canarySettlement.unhandledRejections).toEqual([]);
    expect(canarySettlement.uncaughtExceptions).toEqual([]);
    expect(canarySettlement.outcome.status).toBe("fulfilled");
    if (canarySettlement.outcome.status === "fulfilled") {
      expect(canarySettlement.outcome.value.ok).toBe(false);
      if (!canarySettlement.outcome.value.ok) {
        const classified = classifyWindowlessError(canarySettlement.outcome.value.reason);
        expect(classified.name).toBe("ReferenceError");
        expect(classified.message).toMatch(/window is not defined/u);
        expect(classified.origin).toBe("hook-state-setter");
      }
    }

    function Probe() {
      usePersonalCloudConnections();
      return null;
    }

    // 1) raw createRoot + act 없는 root.unmount() → passive unmount 턴 완료 후 window 제거 및 지연 성공
    const pendingEffectSuccess = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections.mockReturnValueOnce(pendingEffectSuccess.promise);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(createElement(Probe)));
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(1);
    root.unmount();
    await flushEventLoopTurns(1);
    container.remove();

    const effectSuccessSettlement = await settleWithoutWindow(async () => {
      pendingEffectSuccess.resolve([makeConnection("google-drive", { connected: true })]);
      return pendingEffectSuccess.promise;
    });
    expect(effectSuccessSettlement.outcome.status).toBe("fulfilled");
    expect(effectSuccessSettlement.unhandledRejections).toEqual([]);
    expect(effectSuccessSettlement.uncaughtExceptions).toEqual([]);

    // 2) raw createRoot + act(() => root.unmount()) 직후 즉시 window 제거 및 지연 성공
    const pendingActUnmountSuccess = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections.mockReturnValueOnce(pendingActUnmountSuccess.promise);
    const actContainer = document.createElement("div");
    document.body.appendChild(actContainer);
    const actRoot = createRoot(actContainer);
    act(() => actRoot.render(createElement(Probe)));
    act(() => actRoot.unmount());
    actContainer.remove();

    const actUnmountSettlement = await settleWithoutWindow(async () => {
      pendingActUnmountSuccess.resolve([makeConnection("onedrive", { connected: true })]);
      return pendingActUnmountSuccess.promise;
    });
    expect(actUnmountSettlement.outcome.status).toBe("fulfilled");
    expect(actUnmountSettlement.unhandledRejections).toEqual([]);
    expect(actUnmountSettlement.uncaughtExceptions).toEqual([]);

    // 3) 초기 useEffect의 void reload() 지연 실패 + 진행 중 명령형 reload()의 실제 Promise 정착 검증
    const pendingEffectFailure = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const pendingManualReload = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections
      .mockReturnValueOnce(pendingEffectFailure.promise)
      .mockReturnValueOnce(pendingManualReload.promise);

    const { result, unmount } = renderHook(() => usePersonalCloudConnections());
    let manualReloadPromise!: Promise<void>;
    act(() => {
      manualReloadPromise = result.current.reload();
    });
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(4);
    unmount();

    const combinedSettlement = await settleWithoutWindow(async () => {
      pendingEffectFailure.reject(new Error("jsdom 종료 후 초기 조회 실패"));
      pendingManualReload.resolve([makeConnection("dropbox", { connected: true })]);
      await pendingEffectFailure.promise.catch(() => undefined);
      return manualReloadPromise;
    });
    expect(combinedSettlement.outcome).toEqual({ status: "fulfilled", value: undefined });
    expect(combinedSettlement.unhandledRejections).toEqual([]);
    expect(combinedSettlement.uncaughtExceptions).toEqual([]);
  });

  it("connect·disconnect 및 후속 reload 진행 중 unmount·window 제거 후 지연 완료를 모두 안전하게 무시한다", async () => {
    for (const outcome of ["resolve", "reject"] as const) {
      cloudMocks.listPersonalCloudConnections.mockResolvedValueOnce([]);
      const pendingConnect = createDeferred<{ authorizeUrl: string; expiresInMs: number }>();
      cloudMocks.startPersonalCloudConnection.mockReturnValueOnce(pendingConnect.promise);

      const { result, unmount } = renderHook(() => usePersonalCloudConnections());
      await act(async () => flushMicrotasks());
      let connectTask!: Promise<void>;
      act(() => {
        connectTask = result.current.connect("google-drive");
      });
      unmount();

      const settlement = await settleWithoutWindow(async () => {
        if (outcome === "resolve") {
          pendingConnect.resolve({ authorizeUrl: "https://auth.example.test/late", expiresInMs: 60_000 });
        } else {
          pendingConnect.reject(new Error("late connect error"));
        }
        return connectTask;
      });
      expect(settlement.outcome).toEqual({ status: "fulfilled", value: undefined });
      expect(settlement.unhandledRejections).toEqual([]);
      expect(settlement.uncaughtExceptions).toEqual([]);
      expect(assignSpy).not.toHaveBeenCalled();
    }

    for (const outcome of ["resolve", "reject"] as const) {
      cloudMocks.listPersonalCloudConnections.mockReset();
      cloudMocks.listPersonalCloudConnections.mockResolvedValueOnce([makeConnection("dropbox", { connected: true })]);
      const pendingDisconnect = createDeferred<boolean>();
      cloudMocks.disconnectPersonalCloud.mockReturnValueOnce(pendingDisconnect.promise);

      const { result, unmount } = renderHook(() => usePersonalCloudConnections());
      await act(async () => flushMicrotasks());
      expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(1);

      let disconnectTask!: Promise<void>;
      act(() => {
        disconnectTask = result.current.disconnect("dropbox");
      });
      const retainedController = result.current;
      unmount();

      const settlement = await settleWithoutWindow(async () => {
        if (outcome === "resolve") pendingDisconnect.resolve(true);
        else pendingDisconnect.reject(new Error("late disconnect error"));
        await disconnectTask;
        await retainedController.reload();
        await retainedController.connect("dropbox");
        await retainedController.disconnect("dropbox");
      });
      expect(settlement.outcome).toEqual({ status: "fulfilled", value: undefined });
      expect(settlement.unhandledRejections).toEqual([]);
      expect(settlement.uncaughtExceptions).toEqual([]);
      expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(1);
    }

    cloudMocks.listPersonalCloudConnections.mockReset();
    const reloadDuringDisconnect = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections
      .mockResolvedValueOnce([makeConnection("onedrive", { connected: true })])
      .mockReturnValueOnce(reloadDuringDisconnect.promise);
    cloudMocks.disconnectPersonalCloud.mockResolvedValueOnce(true);

    const { result, unmount } = renderHook(() => usePersonalCloudConnections());
    await act(async () => flushMicrotasks());
    let disconnectWithPendingReload!: Promise<void>;
    await act(async () => {
      disconnectWithPendingReload = result.current.disconnect("onedrive");
      await flushMicrotasks();
    });
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(2);
    unmount();

    const innerReloadSettlement = await settleWithoutWindow(async () => {
      reloadDuringDisconnect.resolve([makeConnection("onedrive", { connected: false })]);
      return disconnectWithPendingReload;
    });
    expect(innerReloadSettlement.outcome).toEqual({ status: "fulfilled", value: undefined });
    expect(innerReloadSettlement.unhandledRejections).toEqual([]);
    expect(innerReloadSettlement.uncaughtExceptions).toEqual([]);
  });

  it("StrictMode 이중 마운트에서 이전 마운트 요청의 지연 성공·실패를 무시하고 최신 요청만 반영한다", async () => {
    const firstMountLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const remountLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections
      .mockReturnValueOnce(firstMountLoad.promise)
      .mockReturnValueOnce(remountLoad.promise);

    const { result } = renderHook(() => usePersonalCloudConnections(), { reactStrictMode: true });
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      firstMountLoad.reject(new Error("stale strict-mode mount error"));
      await flushMicrotasks();
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.connections).toEqual([]);

    const freshConnections = [makeConnection("google-drive", { connected: true })];
    await act(async () => {
      remountLoad.resolve(freshConnections);
      await remountLoad.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.connections).toEqual(freshConnections);
  });

  it("StrictMode에서 재마운트 요청이 먼저 완료된 뒤 첫 마운트 요청이 뒤늦게 성공해도 덮어쓰지 않는다", async () => {
    const firstMountLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const remountLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const rootFirstLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const rootRemountLoad = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections
      .mockReturnValueOnce(firstMountLoad.promise)
      .mockReturnValueOnce(remountLoad.promise)
      .mockReturnValueOnce(rootFirstLoad.promise)
      .mockReturnValueOnce(rootRemountLoad.promise);

    const { result } = renderHook(() => usePersonalCloudConnections(), { reactStrictMode: true });
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(2);
    const latest = [makeConnection("onedrive", { connected: true, accountLabel: "latest@example.test" })];
    const stale = [makeConnection("onedrive", { connected: false })];

    await act(async () => {
      remountLoad.resolve(latest);
      await remountLoad.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toEqual(latest);

    await act(async () => {
      firstMountLoad.resolve(stale);
      await firstMountLoad.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toEqual(latest);

    const strictContainer = document.createElement("div");
    document.body.appendChild(strictContainer);
    const strictRoot = createRoot(strictContainer);
    function StrictRootProbe() {
      usePersonalCloudConnections();
      return null;
    }
    act(() => strictRoot.render(createElement(StrictMode, null, createElement(StrictRootProbe))));
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(4);
    act(() => strictRoot.unmount());
    strictContainer.remove();
    rootFirstLoad.resolve(stale);
    rootRemountLoad.resolve(latest);
    await flushMicrotasks();
  });

  it("중첩 reload 호출 시 이전 요청의 조기·지연 성공 및 지연 실패를 모두 차단하고 마지막 요청만 커밋한다", async () => {
    const reload1 = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const reload2 = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const reload3 = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const reload4 = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections
      .mockReturnValueOnce(reload1.promise)
      .mockReturnValueOnce(reload2.promise)
      .mockReturnValueOnce(reload3.promise)
      .mockReturnValueOnce(reload4.promise);

    const { result } = renderHook(() => usePersonalCloudConnections());
    let secondPromise!: Promise<void>;
    act(() => {
      secondPromise = result.current.reload();
    });
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(2);

    const staleConnections = [makeConnection("google-drive", { connected: false })];
    const freshConnections = [makeConnection("google-drive", { connected: true, accountLabel: "fresh@example.test" })];
    await act(async () => {
      reload1.resolve(staleConnections);
      await reload1.promise;
    });
    expect(result.current.loading).toBe(true);
    expect(result.current.connections).toEqual([]);

    await act(async () => {
      reload2.resolve(freshConnections);
      await secondPromise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toEqual(freshConnections);
    expect(result.current.error).toBeNull();

    let thirdPromise!: Promise<void>;
    let fourthPromise!: Promise<void>;
    act(() => {
      thirdPromise = result.current.reload();
      fourthPromise = result.current.reload();
    });
    expect(result.current.loading).toBe(true);

    const newestConnections = [
      makeConnection("google-drive", { connected: true }),
      makeConnection("dropbox", { connected: true }),
    ];
    await act(async () => {
      reload4.resolve(newestConnections);
      await fourthPromise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toEqual(newestConnections);
    expect(result.current.error).toBeNull();

    await act(async () => {
      reload3.reject(new Error("late nested reload failure"));
      await thirdPromise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toEqual(newestConnections);
    expect(result.current.error).toBeNull();
  });

  it("서로 다른 provider의 disconnect A·B가 순서 역전으로 완료될 때 늦게 성공한 A도 서버 상태를 재검증하고 오래된 busy·오류는 억제한다", async () => {
    const bothConnected = [
      makeConnection("google-drive", { connected: true }),
      makeConnection("dropbox", { connected: true }),
    ];
    const onlyDropboxDisconnected = [
      makeConnection("google-drive", { connected: true }),
      makeConnection("dropbox", { connected: false }),
    ];
    const bothDisconnected = [
      makeConnection("google-drive", { connected: false }),
      makeConnection("dropbox", { connected: false }),
    ];
    const disconnectDriveA = createDeferred<boolean>();
    const disconnectDropboxB = createDeferred<boolean>();
    const reloadAfterB = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const reloadAfterLateA = createDeferred<readonly PersonalCloudConnectionStatus[]>();

    cloudMocks.listPersonalCloudConnections
      .mockResolvedValueOnce(bothConnected)
      .mockReturnValueOnce(reloadAfterB.promise)
      .mockReturnValueOnce(reloadAfterLateA.promise);
    cloudMocks.disconnectPersonalCloud
      .mockReturnValueOnce(disconnectDriveA.promise)
      .mockReturnValueOnce(disconnectDropboxB.promise);

    const { result } = renderHook(() => usePersonalCloudConnections());
    await act(async () => flushMicrotasks());
    expect(result.current.connections).toEqual(bothConnected);

    let taskA!: Promise<void>;
    let taskB!: Promise<void>;
    act(() => {
      taskA = result.current.disconnect("google-drive");
      taskB = result.current.disconnect("dropbox");
    });
    expect(result.current.busyProvider).toBe("dropbox");

    await act(async () => {
      disconnectDropboxB.resolve(true);
      await flushMicrotasks();
      reloadAfterB.resolve(onlyDropboxDisconnected);
      await taskB;
    });
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.connections).toEqual(onlyDropboxDisconnected);
    expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(2);

    await act(async () => {
      disconnectDriveA.resolve(true);
      await flushMicrotasks();
      expect(cloudMocks.listPersonalCloudConnections).toHaveBeenCalledTimes(3);
      expect(result.current.busyProvider).toBeNull();
      reloadAfterLateA.resolve(bothDisconnected);
      await taskA;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.connections).toEqual(bothDisconnected);

    const disconnectDriveC = createDeferred<boolean>();
    const disconnectDropboxD = createDeferred<boolean>();
    cloudMocks.disconnectPersonalCloud
      .mockReturnValueOnce(disconnectDriveC.promise)
      .mockReturnValueOnce(disconnectDropboxD.promise);
    const afterLateCSuccess = [
      makeConnection("google-drive", { connected: false }),
      makeConnection("dropbox", { connected: true }),
    ];
    cloudMocks.listPersonalCloudConnections.mockResolvedValueOnce(afterLateCSuccess);

    let taskC!: Promise<void>;
    let taskD!: Promise<void>;
    act(() => {
      taskC = result.current.disconnect("google-drive");
      taskD = result.current.disconnect("dropbox");
    });
    await act(async () => {
      disconnectDropboxD.reject(new Error("Dropbox 최신 해제 실패"));
      await taskD;
    });
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.error).toBe("Dropbox 최신 해제 실패");

    await act(async () => {
      disconnectDriveC.resolve(true);
      await taskC;
    });
    expect(result.current.connections).toEqual(afterLateCSuccess);
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.error).toBe("Dropbox 최신 해제 실패");
  });

  it("reload와 connect·disconnect 사이의 양방향 오류 경합에서 항상 더 최신 요청의 오류 우선순위를 유지한다", async () => {
    const olderReload1 = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    const olderReload2 = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.listPersonalCloudConnections
      .mockReturnValueOnce(olderReload1.promise)
      .mockReturnValueOnce(olderReload2.promise);
    cloudMocks.startPersonalCloudConnection.mockRejectedValueOnce(new Error("최신 connect 오류"));
    cloudMocks.disconnectPersonalCloud.mockRejectedValueOnce(new Error("최신 disconnect 오류"));

    const { result } = renderHook(() => usePersonalCloudConnections());
    await act(async () => {
      await result.current.connect("google-drive");
    });
    expect(result.current.error).toBe("최신 connect 오류");
    expect(result.current.busyProvider).toBeNull();

    const loaded = [makeConnection("google-drive", { connected: true })];
    await act(async () => {
      olderReload1.resolve(loaded);
      await olderReload1.promise;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.connections).toEqual(loaded);
    expect(result.current.error).toBe("최신 connect 오류");

    let staleReloadTask!: Promise<void>;
    act(() => {
      staleReloadTask = result.current.reload();
    });
    await act(async () => {
      await result.current.disconnect("google-drive");
    });
    expect(result.current.error).toBe("최신 disconnect 오류");

    await act(async () => {
      olderReload2.reject(new Error("오래된 reload 오류"));
      await staleReloadTask;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("최신 disconnect 오류");

    const olderConnect = createDeferred<{ authorizeUrl: string; expiresInMs: number }>();
    const newerReloadAfterConnect = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.startPersonalCloudConnection.mockReturnValueOnce(olderConnect.promise);
    cloudMocks.listPersonalCloudConnections.mockReturnValueOnce(newerReloadAfterConnect.promise);

    let olderConnectTask!: Promise<void>;
    let newerReloadTask1!: Promise<void>;
    act(() => {
      olderConnectTask = result.current.connect("dropbox");
      newerReloadTask1 = result.current.reload();
    });
    expect(result.current.busyProvider).toBe("dropbox");
    expect(result.current.error).toBeNull();

    await act(async () => {
      newerReloadAfterConnect.reject(new Error("최신 reload 상태 조회 오류 (connect 경합)"));
      await newerReloadTask1;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("최신 reload 상태 조회 오류 (connect 경합)");
    expect(result.current.busyProvider).toBe("dropbox");

    await act(async () => {
      olderConnect.reject(new Error("오래된 connect 실패"));
      await olderConnectTask;
    });
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.error).toBe("최신 reload 상태 조회 오류 (connect 경합)");

    const olderDisconnect = createDeferred<boolean>();
    const newerReloadAfterDisconnect = createDeferred<readonly PersonalCloudConnectionStatus[]>();
    cloudMocks.disconnectPersonalCloud.mockReturnValueOnce(olderDisconnect.promise);
    cloudMocks.listPersonalCloudConnections.mockReturnValueOnce(newerReloadAfterDisconnect.promise);

    let olderDisconnectTask!: Promise<void>;
    let newerReloadTask2!: Promise<void>;
    act(() => {
      olderDisconnectTask = result.current.disconnect("google-drive");
      newerReloadTask2 = result.current.reload();
    });
    expect(result.current.busyProvider).toBe("google-drive");
    expect(result.current.error).toBeNull();

    await act(async () => {
      newerReloadAfterDisconnect.reject(new Error("최신 reload 상태 조회 오류 (disconnect 경합)"));
      await newerReloadTask2;
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe("최신 reload 상태 조회 오류 (disconnect 경합)");
    expect(result.current.busyProvider).toBe("google-drive");

    await act(async () => {
      olderDisconnect.reject(new Error("오래된 disconnect 실패"));
      await olderDisconnectTask;
    });
    expect(result.current.busyProvider).toBeNull();
    expect(result.current.error).toBe("최신 reload 상태 조회 오류 (disconnect 경합)");
  });
});
