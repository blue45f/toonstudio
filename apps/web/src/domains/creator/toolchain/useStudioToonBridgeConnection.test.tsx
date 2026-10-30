// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { clearStudioToonBridgeSettings, loadStudioToonBridgeSettings } from "./studio-toonbridge-client";
import { useStudioToonBridgeConnection } from "./useStudioToonBridgeConnection";

function deferred<Value>() {
  let resolve: (value: Value) => void = () => { throw new Error("준비 전 Promise"); };
  let reject: (error: Error) => void = () => { throw new Error("준비 전 Promise"); };
  const promise = new Promise<Value>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function pendingFetch() {
  const requests: { readonly url: string; readonly signal: AbortSignal | null | undefined; readonly pending: ReturnType<typeof deferred<Response>> }[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const pending = deferred<Response>();
    requests.push({ url: String(input), signal: init?.signal, pending });
    return pending.promise;
  }));
  const succeed = (offset: number, version: string) => {
    for (const request of requests.slice(offset, offset + 2)) {
      request.pending.resolve(new Response(JSON.stringify(request.url.endsWith("/v2/status") ? {
        protocol: "toonstudio.production-toolchain", version: 2, serviceVersion: version, activeJobs: 0, retainedJobs: 0,
      } : []), { headers: { "content-type": "application/json" } }));
    }
  };
  return { requests, succeed };
}

afterEach(() => { cleanup(); clearStudioToonBridgeSettings(); vi.unstubAllGlobals(); });

describe("ToonBridge 연결 조회의 세대", () => {
  it("연결 해제 뒤 이전 성공 응답이 연결이나 탭 설정을 복원하지 않는다", async () => {
    const network = pendingFetch();
    const hook = renderHook(() => useStudioToonBridgeConnection());
    act(() => hook.result.current.setToken("f".repeat(40)));
    let connecting = Promise.resolve();
    act(() => { connecting = hook.result.current.connect(); });
    expect(network.requests).toHaveLength(2);
    act(() => hook.result.current.disconnect());
    expect(network.requests.every(({ signal }) => signal?.aborted)).toBe(true);
    await act(async () => { network.succeed(0, "old"); await connecting; });
    expect(hook.result.current.connected).toBe(false);
    expect(hook.result.current.settings.token).toBe("");
    expect(hook.result.current.loading).toBe(false);
    expect(loadStudioToonBridgeSettings()).toBeNull();
  });

  it("새 연결 성공 뒤 이전 실패가 현재 상태·오류·저장 설정을 바꾸지 않는다", async () => {
    const network = pendingFetch();
    const hook = renderHook(() => useStudioToonBridgeConnection());
    act(() => hook.result.current.setToken("f".repeat(40)));
    let old = Promise.resolve(), fresh = Promise.resolve();
    act(() => { old = hook.result.current.connect(); });
    act(() => hook.result.current.setBaseUrl("http://127.0.0.1:49632"));
    act(() => { fresh = hook.result.current.connect(); });
    await act(async () => { network.succeed(2, "fresh"); await fresh; });
    await act(async () => {
      network.requests[0]?.pending.reject(new Error("낡은 연결 실패"));
      network.requests[1]?.pending.resolve(new Response("[]"));
      await old;
    });
    expect(hook.result.current.status?.serviceVersion).toBe("fresh");
    expect(hook.result.current.connected).toBe(true);
    expect(hook.result.current.error).toBeNull();
    expect(loadStudioToonBridgeSettings()?.baseUrl).toBe("http://127.0.0.1:49632");
    expect(network.requests.slice(0, 2).every(({ signal }) => signal?.aborted)).toBe(true);
    expect(network.requests.every(({ url }) => /\/v2\/(?:status|tools)$/u.test(url))).toBe(true);
  });

  it("주소 편집과 unmount는 대기 중 성공 응답을 취소하고 자동 재연결하지 않는다", async () => {
    const network = pendingFetch();
    const hook = renderHook(() => useStudioToonBridgeConnection());
    act(() => hook.result.current.setToken("f".repeat(40)));
    let first = Promise.resolve(), second = Promise.resolve();
    act(() => { first = hook.result.current.connect(); });
    act(() => hook.result.current.setBaseUrl("http://127.0.0.1:49632"));
    await act(async () => { network.succeed(0, "old"); await first; });
    expect(hook.result.current.connected).toBe(false);
    expect(hook.result.current.settings.baseUrl).toBe("http://127.0.0.1:49632");
    expect(network.requests).toHaveLength(2);
    act(() => { second = hook.result.current.connect(); });
    hook.unmount();
    await act(async () => { network.succeed(2, "unmounted"); await second; });
    expect(network.requests.slice(2).every(({ signal }) => signal?.aborted)).toBe(true);
    expect(loadStudioToonBridgeSettings()).toBeNull();
  });

  it("현재 세대의 실패는 오류로 표시하고 요청을 다시 보내지 않는다", async () => {
    const network = pendingFetch();
    const hook = renderHook(() => useStudioToonBridgeConnection());
    act(() => hook.result.current.setToken("f".repeat(40)));
    let failed: Promise<unknown> = Promise.resolve();
    act(() => { failed = hook.result.current.connect().catch((cause: unknown) => cause); });
    await act(async () => {
      network.requests[0]?.pending.reject(new Error("현재 연결 실패"));
      await failed;
    });
    expect(hook.result.current.error).toBe("현재 연결 실패");
    expect(hook.result.current.loading).toBe(false);
    expect(network.requests).toHaveLength(2);
    expect(network.requests[1]?.signal?.aborted).toBe(true);
  });
});
