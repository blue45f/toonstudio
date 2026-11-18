import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { observeCompanionRequestTimeline } from "./studio-companion-request-timeline";

import type { Page, Request } from "playwright";

function fixture() {
  const events = new EventEmitter();
  let time = 1_000, url = "http://127.0.0.1:45678/studio/canvas?room=private-room#private-anchor";
  const frame = { url: () => url };
  const page = Object.assign(events, { url: () => url, mainFrame: () => frame }) as unknown as Page;
  const observer = observeCompanionRequestTimeline(page, "primary-goto", () => time);
  const request = (path: string) => ({
    url: () => `http://127.0.0.1:45678${path}`, method: () => "GET", resourceType: () => "fetch",
    failure: () => ({ errorText: "net::ERR_ABORTED" }),
  }) as Request;
  return { events, observer, frame, request, advance: (ms: number) => { time += ms; }, navigate: (next: string) => { url = next; } };
}

describe("companion 요청의 단계별 관측", () => {
  it("같은 요청의 시작과 실패를 연결하고 종료 전후 단계 및 시각을 구분한다", () => {
    const f = fixture(), request = f.request("/audio/playlist.json?catalog=private-catalog#private-hash");
    f.advance(10); f.events.emit("request", request);
    f.observer.markPhase("close-context"); f.advance(25); f.events.emit("requestfailed", request);
    f.events.emit("close");
    expect(f.observer.timeline.events.filter(event => event.request)).toMatchObject([
      { kind: "request", phase: "primary-goto", atMs: 10, request: { id: 1, startedAtMs: 10 } },
      { kind: "requestfailed", phase: "close-context", atMs: 35, request: { id: 1, startedAtMs: 10, error: "net::ERR_ABORTED" } },
    ]);
    expect(f.observer.timeline.failureEvents[0]?.pageUrl).toBe("http://127.0.0.1:45678/studio/canvas");
    expect(f.observer.timeline.failureEvents[0]?.request?.url).toBe("http://127.0.0.1:45678/audio/playlist.json");
    expect(f.observer.timeline.events.at(-1)).toMatchObject({ kind: "close", phase: "close-context", atMs: 35 });
    expect(JSON.stringify(f.observer.timeline)).not.toContain("private-");
  });

  it("요청이 많아도 최근 이벤트는 상한을 지키고 최초 실패는 별도 보존한다", () => {
    const f = fixture();
    for (let i = 0; i < 35; i += 1) f.events.emit("requestfailed", f.request(`/failed-${i}`));
    for (let i = 0; i < 200; i += 1) { const r = f.request(`/ok-${i}`); f.events.emit("request", r); f.events.emit("requestfinished", r); }
    expect(f.observer.timeline.events).toHaveLength(160);
    expect(f.observer.timeline.droppedEvents).toBe(276);
    expect(f.observer.timeline.failureEvents).toHaveLength(32);
    expect(f.observer.timeline.failureEvents[0]?.request?.url).toBe("http://127.0.0.1:45678/failed-0");
    expect(f.observer.timeline.droppedFailureEvents).toBe(3);
    expect(f.observer.timeline.events.at(-1)).toMatchObject({ kind: "requestfinished", request: { url: "http://127.0.0.1:45678/ok-199" } });
  });

  it("실제 최상위 이동만 기록하고 관측 전에 시작한 팝업 요청은 시작 시각을 꾸미지 않는다", () => {
    const f = fixture();
    f.events.emit("framenavigated", { url: () => "https://child.test/?secret=child" });
    f.navigate("http://127.0.0.1:45678/studio/tools-companion?session=private-session#private-view");
    f.observer.markPhase("workspace-open"); f.events.emit("framenavigated", f.frame);
    f.events.emit("requestfinished", f.request("/assets/started-before-observer.js?private-cache=1"));
    expect(f.observer.timeline.events.filter(event => event.kind === "navigation")).toEqual([
      { kind: "navigation", atMs: 0, phase: "workspace-open", pageUrl: "http://127.0.0.1:45678/studio/tools-companion", frameUrl: "http://127.0.0.1:45678/studio/tools-companion" },
    ]);
    expect(f.observer.timeline.events.at(-1)?.request?.startedAtMs).toBeNull();
    expect(JSON.stringify(f.observer.timeline)).not.toContain("private-");
  });

  it("원래 requestfailed 리스너와 실패 판정을 유지하고 자신의 관측만 해제한다", () => {
    const f = fixture(), originalFailure = vi.fn(); f.events.on("requestfailed", originalFailure);
    const failed = f.request("/audio/playlist.json"); f.events.emit("requestfailed", failed);
    expect(originalFailure).toHaveBeenCalledWith(failed);
    expect(f.observer.timeline.failureEvents).toHaveLength(1);
    f.observer.dispose(); const size = f.observer.timeline.events.length;
    f.events.emit("requestfailed", failed);
    expect(originalFailure).toHaveBeenCalledTimes(2);
    expect(f.observer.timeline.events).toHaveLength(size);
    expect(f.events.listenerCount("requestfailed")).toBe(1);
    expect(f.events.listenerCount("framenavigated")).toBe(0);
  });
});
