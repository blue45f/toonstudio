import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { observeStudioPreviewNavigationRequests } from "./studio-preview-navigation-settlement";

import type { Page, Request } from "playwright";

const origin = "http://127.0.0.1:45678";
const request = (path: string, resourceType = "script", method = "GET") => ({
  url: () => `${origin}${path}`, resourceType: () => resourceType, method: () => method,
  failure: () => ({ errorText: "net::ERR_ABORTED" }),
}) as Request;
function fixture() {
  vi.useFakeTimers();
  const events = new EventEmitter();
  const settlement = observeStudioPreviewNavigationRequests(events as unknown as Page, origin);
  return { events, settlement };
}
afterEach(() => { vi.useRealTimers(); });

describe("검사기가 이동하기 전 관측 요청의 종료 증거", () => {
  it("대기 중인 자산과 그 뒤의 의존 요청이 끝나기 전에는 reload 준비를 끝내지 않는다", async () => {
    const { events, settlement } = fixture();
    const parent = request("/assets/parent.js"), child = request("/assets/child.js");
    events.emit("request", parent);
    const done = vi.fn();
    const waiting = settlement.settle("checkpoint-before-reload").then(result => { done(); return result; });
    await vi.advanceTimersByTimeAsync(100);
    expect(done).not.toHaveBeenCalled();
    events.emit("requestfinished", parent);
    await vi.advanceTimersByTimeAsync(50);
    events.emit("request", child);
    await vi.advanceTimersByTimeAsync(100);
    expect(done).not.toHaveBeenCalled();
    events.emit("requestfinished", child);
    await vi.advanceTimersByTimeAsync(100);
    expect(await waiting).toMatchObject({ outcome: "settled", pendingAtEnd: [], failed: [],
      pendingAtStart: [{ url: `${origin}/assets/parent.js` }],
      completed: [{ url: `${origin}/assets/parent.js` }, { url: `${origin}/assets/child.js` }] });
  });

  it("원래 requestfailed 리스너와 실패 receipt를 모두 유지한다", async () => {
    const { events, settlement } = fixture(), error = request("/api/health/capabilities", "fetch");
    const originalFailure = vi.fn(); events.on("requestfailed", originalFailure);
    events.emit("request", error);
    const waiting = settlement.settle("complete-before-close");
    events.emit("requestfailed", error);
    await vi.advanceTimersByTimeAsync(100);
    expect(originalFailure).toHaveBeenCalledWith(error);
    expect((await waiting).failed).toEqual([{ url: error.url(), resourceType: "fetch", error: "net::ERR_ABORTED" }]);
  });

  it("끝나지 않은 요청은 deadline에서 실패시키고 pending 증거를 남긴다", async () => {
    const { events, settlement } = fixture(); events.emit("request", request("/assets/hung.js"));
    const waiting = expect(settlement.settle("before-close", { timeoutMs: 200, quietMs: 50 })).rejects.toThrow("200ms");
    await vi.advanceTimersByTimeAsync(200); await waiting;
    expect(settlement.receipts[0]).toMatchObject({ outcome: "timeout", pendingAtEnd: [{ url: `${origin}/assets/hung.js` }] });
  });

  it("미디어 스트림·Socket.IO·POST는 유한 GET 대기와 분리하되 진단 리스너는 건드리지 않는다", async () => {
    const { events, settlement } = fixture();
    events.emit("request", request("/audio/song.mp3", "media"));
    events.emit("request", request("/socket.io/?EIO=4&transport=polling", "xhr"));
    events.emit("request", request("/api/analytics/traffic/page-view", "fetch", "POST"));
    const waiting = settlement.settle("before-close");
    await vi.advanceTimersByTimeAsync(100);
    expect(await waiting).toMatchObject({ outcome: "settled", pendingAtStart: [], pendingAtEnd: [] });
    settlement.dispose();
    expect(events.listenerCount("request")).toBe(0);
  });
});
