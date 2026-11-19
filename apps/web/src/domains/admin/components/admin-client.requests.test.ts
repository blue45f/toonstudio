// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { adminFetch, adminFetchText } from "./admin-client";
import { ADMIN_READ_TIMEOUT_MS } from "./admin-read-request";

import { persistSession } from "@/domains/auth/public/session/auth-session-state";
import { api } from "@/platform/api";

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}

function login(id = "admin-1", role = "admin") {
  persistSession({ user: { id, role, name: null, email: null, image: null }, token: null });
}

describe("관리자 GET 요청의 공유·기한·인증 경계", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    login();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    persistSession(null);
  });

  it("진행 중인 동일 조회는 한 번 전송하고 각 호출자에게 별도 JSON 객체를 돌려준다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValue(pending.promise as ReturnType<typeof api.raw>);
    const first = adminFetch<{ count: number }>("/traffic/pulse", "admin-1");
    const second = adminFetch<{ count: number }>("/traffic/pulse", "admin-1");
    const text = adminFetchText("/traffic/pulse", "admin-1");
    await Promise.resolve();
    expect(raw).toHaveBeenCalledTimes(1);
    expect(raw.mock.calls[0]?.[1]).toMatchObject({ timeout: 30_000, totalTimeout: 30_000, retry: 0 });
    pending.resolve(Response.json({ count: 3 }));
    const [left, right, string] = await Promise.all([first, second, text]);
    expect(left).toEqual({ count: 3 });
    expect(left).not.toBe(right);
    expect(string).toBe('{"count":3}');

    raw.mockResolvedValueOnce(Response.json({ count: 4 }));
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toEqual({ count: 4 });
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it("다른 계정·조회 조건·헤더는 진행 중이어도 공유하지 않는다", async () => {
    const raw = vi.spyOn(api, "raw");
    for (let index = 0; index < 4; index += 1) raw.mockResolvedValueOnce(Response.json({ count: 1 }));
    await Promise.all([
      adminFetch("/traffic?days=7", "admin-1"),
      adminFetch("/traffic?days=30", "admin-1"),
      adminFetch("/traffic?days=7", "admin-2"),
      adminFetch("/traffic?days=7", "admin-1", { headers: { Accept: "text/plain" } }),
    ]);
    expect(raw).toHaveBeenCalledTimes(4);
  });

  it("한 화면의 취소는 같은 조회를 기다리는 다른 화면에 전파하지 않는다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValue(pending.promise as ReturnType<typeof api.raw>);
    const controller = new AbortController();
    const first = adminFetch("/system/health", "admin-1", { signal: controller.signal });
    const firstResult = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = adminFetch("/system/health", "admin-1");
    await Promise.resolve();
    controller.abort();
    await firstResult;
    expect(raw.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    pending.resolve(Response.json({ status: "healthy" }));
    await expect(second).resolves.toEqual({ status: "healthy" });
  });

  it("마지막 호출자가 취소하면 전송을 중단하고 즉시 새 조회를 허용한다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(pending.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(Response.json({ count: 2 }));
    const controller = new AbortController();
    const first = adminFetch("/traffic/pulse", "admin-1", { signal: controller.signal });
    const result = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    controller.abort();
    await result;
    expect(raw.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toEqual({ count: 2 });
    expect(raw).toHaveBeenCalledTimes(2);
    pending.resolve(Response.json({ count: 1 }));
  });

  it.each(["headers", "body"])("%s 수신이 멈춰도 30초 뒤 실패하고 다음 요청으로 복구한다", async (stage) => {
    const pending = deferred<Response>();
    const body = deferred<string>();
    const response = new Response(null);
    vi.spyOn(response, "text").mockReturnValue(body.promise);
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(
      (stage === "headers" ? pending.promise : Promise.resolve(response)) as ReturnType<typeof api.raw>,
    ).mockResolvedValueOnce(Response.json({ recovered: true }));
    const result = expect(adminFetch("/dashboard", "admin-1")).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(ADMIN_READ_TIMEOUT_MS);
    await result;
    expect(raw.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    await expect(adminFetch("/dashboard", "admin-1")).resolves.toEqual({ recovered: true });
    pending.resolve(Response.json({ stale: true }));
    body.resolve('{"stale":true}');
  });

  it.each(["logout", "switch", "role"])("%s 뒤 이전 인증 세대의 성공 응답을 전달하지 않는다", async (change) => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(pending.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(Response.json({ current: true }));
    const first = adminFetch("/system/health", "admin-1");
    const result = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    if (change === "logout") persistSession(null);
    else login(change === "switch" ? "admin-2" : "admin-1", change === "role" ? "user" : "admin");
    const second = adminFetch("/system/health", change === "switch" ? "admin-2" : "admin-1");
    pending.resolve(Response.json({ stale: true }));
    await result;
    await expect(second).resolves.toEqual({ current: true });
    expect(raw).toHaveBeenCalledTimes(2);
  });

  it("전송 전에 취소된 호출은 네트워크를 시작하지 않는다", async () => {
    const raw = vi.spyOn(api, "raw");
    const controller = new AbortController();
    controller.abort();
    await expect(adminFetch("/traffic/pulse", "admin-1", { signal: controller.signal }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(raw).not.toHaveBeenCalled();
  });

  it("빈 응답과 잘못된 JSON의 기존 계약을 유지한다", async () => {
    vi.spyOn(api, "raw").mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(" "))
      .mockResolvedValueOnce(new Response("not json"));
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toBeUndefined();
    await expect(adminFetch("/traffic/pulse", "admin-1")).resolves.toBeUndefined();
    await expect(adminFetch("/traffic/pulse", "admin-1")).rejects.toMatchObject({ status: 502 });
  });

  it("쓰기 요청은 공유하거나 자동 재시도하지 않고 FormData 헤더를 보존한다", async () => {
    const pending = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(pending.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const body = new FormData();
    body.set("file", "fixture");
    const first = adminFetch("/imports", "admin-1", { method: "POST", body });
    const second = adminFetch("/imports", "admin-1", { method: "POST", body });
    expect(raw).toHaveBeenCalledTimes(2);
    for (const call of raw.mock.calls) {
      expect(call[1]?.retry).toBe(0);
      expect(call[1]?.timeout).toBeUndefined();
      expect(call[1]?.headers).toEqual(new Headers());
    }
    pending.resolve(new Response(null, { status: 204 }));
    await Promise.all([first, second]);
  });

  it("쓰기 완료 후 새로고침은 쓰기 전에 시작한 GET 응답을 공유하지 않는다", async () => {
    const previous = deferred<Response>();
    const raw = vi.spyOn(api, "raw").mockReturnValueOnce(previous.promise as ReturnType<typeof api.raw>)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ enabled: false }));
    const oldRead = adminFetch("/promos", "admin-1");
    await Promise.resolve();
    await adminFetch("/promos/fixture", "admin-1", { method: "DELETE" });
    await expect(adminFetch("/promos", "admin-1")).resolves.toEqual({ enabled: false });
    expect(raw).toHaveBeenCalledTimes(3);
    previous.resolve(Response.json({ enabled: true }));
    await expect(oldRead).resolves.toEqual({ enabled: true });
  });

  it.each([401, 403])("HTTP %s의 권한 오류를 성공 응답이나 공유 캐시로 바꾸지 않는다", async (status) => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(
      { message: "관리자 권한을 확인해 주세요." }, { status },
    ));
    await expect(adminFetch("/me", "admin-1")).rejects.toMatchObject({
      name: "AdminApiError", status, message: "관리자 권한을 확인해 주세요.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
