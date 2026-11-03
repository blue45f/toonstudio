import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getProductionProject, getProductionProjectByWork } from "./production-api";

import { api } from "@/platform/api";

// 모델 검증을 대체하지 않는 전송 회귀다. 실제 Ky가 헤더 뒤 본문을 끝까지 읽는지 확인한다.
const payload = {
  aggregate: { projectId: "synthetic-project", workId: "synthetic-work", title: "느린 본문" },
  access: { view: true, edit: false, manage: false },
};
const routes = [
  { name: "프로젝트 ID", read: () => getProductionProject("project/with space"), path: "/api/production/projects/project%2Fwith%20space" },
  { name: "작품 ID", read: () => getProductionProjectByWork("work/with space"), path: "/api/production/works/work%2Fwith%20space/project" },
];

function requestSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal {
  const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
  if (!signal) throw new Error("실제 Ky 요청의 AbortSignal이 필요합니다.");
  return signal;
}

function observe<T>(promise: Promise<T>) {
  let settled = false;
  const outcome = promise.then(
    (value) => { settled = true; return { status: "fulfilled", value } as const; },
    (error: unknown) => { settled = true; return { status: "rejected", error } as const; },
  );
  return { outcome, get settled() { return settled; } };
}

const disposeBodies: Array<() => void> = [];
function streamedResponse(signal: AbortSignal) {
  const text = JSON.stringify(payload);
  const split = Math.floor(text.length / 2);
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let notifyReading: () => void = () => undefined;
  const reading = new Promise<void>((resolve) => { notifyReading = resolve; });
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      value.enqueue(encoder.encode(text.slice(0, split)));
    },
    pull() { notifyReading(); },
  }, { highWaterMark: 0 });
  // 네이티브 fetch와 같이 실제 요청 취소가 진행 중인 본문에도 전달되게 한다.
  const abort = () => controller?.error(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  disposeBodies.push(() => {
    signal.removeEventListener("abort", abort);
    controller?.error(new Error("테스트 스트림 정리"));
  });
  return {
    response: new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }),
    reading,
    signal,
    finish() {
      if (controller === null) throw new Error("본문 스트림이 준비되지 않았습니다.");
      controller.enqueue(encoder.encode(text.slice(split)));
      controller.close();
      signal.removeEventListener("abort", abort);
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "performance"] });
});
afterEach(() => {
  for (const dispose of disposeBodies.splice(0)) dispose();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe.each(routes)("aggregate 읽기 수명: $name", ({ read, path }) => {
  it("200 헤더 뒤 12.23초 걸리는 본문을 한 번의 GET으로 끝까지 읽는다", async () => {
    const received: { stream?: ReturnType<typeof streamedResponse> } = {};
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(input instanceof Request ? input.url : String(input)).pathname).toBe(path);
      received.stream = streamedResponse(requestSignal(input, init));
      return received.stream.response;
    });
    vi.stubGlobal("fetch", fetch);
    const observed = observe(read());
    await vi.advanceTimersByTimeAsync(0);
    const response = received.stream;
    if (!response) throw new Error("응답 헤더가 도착하지 않았습니다.");
    await response.reading;
    await vi.advanceTimersByTimeAsync(12_000);
    expect(observed.settled).toBe(false);
    expect(response.signal.aborted).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(230);
    response.finish();
    expect(await observed.outcome).toEqual({ status: "fulfilled", value: payload });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("헤더에 쓴 10초도 포함해 총 30초에 멈춘 본문을 취소하고 재전송하지 않는다", async () => {
    const received: { stream?: ReturnType<typeof streamedResponse> } = {};
    const fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve) => {
      setTimeout(() => {
        received.stream = streamedResponse(requestSignal(input, init));
        resolve(received.stream.response);
      }, 10_000);
    }));
    vi.stubGlobal("fetch", fetch);
    const observed = observe(read());
    await vi.advanceTimersByTimeAsync(10_000);
    const response = received.stream;
    if (!response) throw new Error("응답 헤더가 도착하지 않았습니다.");
    await response.reading;
    await vi.advanceTimersByTimeAsync(19_999);
    expect(observed.settled).toBe(false);
    expect(response.signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await observed.outcome).toMatchObject({ status: "rejected", error: { name: "AppApiError", kind: "timeout" } });
    expect(response.signal.aborted).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("HTTP 503의 기존 Retry-After 재시도 후 정상 응답을 유지한다", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{"message":"busy"}', { status: 503, headers: { "Content-Type": "application/json", "Retry-After": "1" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const observed = observe(read());
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await observed.outcome).toEqual({ status: "fulfilled", value: payload });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

it("별도 attempt 상한을 꺼도 호출부 signal은 진행 중인 본문을 즉시 취소한다", async () => {
  const controller = new AbortController();
  const received: { stream?: ReturnType<typeof streamedResponse> } = {};
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    received.stream = streamedResponse(requestSignal(input, init));
    return received.stream.response;
  });
  vi.stubGlobal("fetch", fetch);
  const observed = observe(api.get("/production/projects/signal-probe", {
    timeout: false, totalTimeout: 30_000, signal: controller.signal,
  }));
  await vi.advanceTimersByTimeAsync(0);
  const response = received.stream;
  if (!response) throw new Error("응답 헤더가 도착하지 않았습니다.");
  await response.reading;
  controller.abort(new DOMException("읽기 취소", "AbortError"));
  expect(await observed.outcome).toMatchObject({ status: "rejected", error: { name: "AbortError" } });
  expect(response.signal.aborted).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});
