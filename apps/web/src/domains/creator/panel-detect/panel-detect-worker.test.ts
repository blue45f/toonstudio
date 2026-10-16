import { afterEach, describe, expect, it, vi } from "vitest";

import { detectPanelsInBackground, type PanelDetectWorkerLike } from "./panel-detect-client";
import { detectPanels } from "./panel-detect-core";
import { FixtureImage, WHITE } from "./panel-detect-fixtures";
import {
  PANEL_DETECT_WORKER_PROTOCOL_VERSION,
  isPanelDetectWorkerRequest,
  isPanelDetectWorkerResponse,
  parsePanelDetectResult,
  toWorkerOptions,
  type PanelDetectWorkerDetectRequest,
  type PanelDetectWorkerRequest,
} from "./panel-detect-worker-protocol";

import type { PanelDetectResult } from "./panel-detect-types";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function page() {
  const image = new FixtureImage(600, 800, WHITE);
  image.art(30, 30, 540, 340, { seed: 0 });
  image.art(30, 400, 540, 370, { seed: 1 });
  return image;
}

function detectRequest(overrides: Partial<PanelDetectWorkerDetectRequest> = {}): PanelDetectWorkerDetectRequest {
  const image = page();
  return {
    version: PANEL_DETECT_WORKER_PROTOCOL_VERSION,
    kind: "detect",
    requestId: 1,
    width: image.width,
    height: image.height,
    pixels: Uint8ClampedArray.from(image.data).buffer,
    options: { readingOrder: "comic" },
    ...overrides,
  };
}

describe("컷 감지 Worker 메시지 계약", () => {
  it("올바른 요청만 받아들인다", () => {
    expect(isPanelDetectWorkerRequest(detectRequest())).toBe(true);
    expect(isPanelDetectWorkerRequest({ version: 1, kind: "cancel", requestId: 3 })).toBe(true);
    expect(isPanelDetectWorkerRequest(detectRequest({ version: 2 as never }))).toBe(false);
    expect(isPanelDetectWorkerRequest(detectRequest({ requestId: 0 }))).toBe(false);
    expect(isPanelDetectWorkerRequest(detectRequest({ pixels: new ArrayBuffer(12) }))).toBe(false);
    expect(isPanelDetectWorkerRequest(detectRequest({ options: { sensitivity: "extreme" as never } }))).toBe(false);
    expect(isPanelDetectWorkerRequest(detectRequest({ options: { maxDepth: 1.5 } }))).toBe(false);
    expect(isPanelDetectWorkerRequest(null)).toBe(false);
  });

  it("함수형 옵션은 Worker 로 보내지 않는다", () => {
    expect(toWorkerOptions({ readingOrder: "manga", now: () => 1, isCancelled: () => false, timeLimitMs: 500 }))
      .toEqual({ readingOrder: "manga", timeLimitMs: 500 });
  });

  it("응답 모양을 구분한다", () => {
    expect(isPanelDetectWorkerResponse({ version: 1, kind: "result", requestId: 1, result: {} })).toBe(true);
    expect(isPanelDetectWorkerResponse({ version: 1, kind: "error", requestId: 1, code: "timeout", message: "x" })).toBe(true);
    expect(isPanelDetectWorkerResponse({ version: 1, kind: "error", requestId: 1, code: "boom", message: "x" })).toBe(false);
    expect(isPanelDetectWorkerResponse({ version: 1, kind: "progress", requestId: 1 })).toBe(false);
  });
});

describe("감지 결과 검증(신뢰 경계)", () => {
  const image = page();
  const result = detectPanels(image.raster(), { readingOrder: "comic" });
  const dims = { width: image.width, height: image.height };

  it("구조 복제를 거친 실제 결과를 그대로 복원한다", () => {
    expect(parsePanelDetectResult(structuredClone(result), dims)).toEqual(result);
  });

  it("크기가 다르거나 이미지 밖 사각형, 이어지지 않은 id·순서, 모르는 경고는 거절한다", () => {
    // 객체 전개는 인터페이스를 이름 없는 객체 형태로 풀어 주므로 단언 없이 색인 가능한 사본이 된다.
    const clone = (): Record<string, unknown> => ({ ...structuredClone(result) });
    expect(parsePanelDetectResult(result, { width: 10, height: 10 })).toBeNull();
    const outside = clone();
    (outside.panels as { x: number }[])[0].x = 590;
    expect(parsePanelDetectResult(outside, dims)).toBeNull();
    const shuffled = clone();
    (shuffled.panels as { id: string }[])[0].id = "panel-9";
    expect(parsePanelDetectResult(shuffled, dims)).toBeNull();
    const unknownWarning = clone();
    (unknownWarning.panels as { warnings: string[] }[])[0].warnings = ["made-up"];
    expect(parsePanelDetectResult(unknownWarning, dims)).toBeNull();
    const wrongVersion = clone();
    wrongVersion.version = 2;
    expect(parsePanelDetectResult(wrongVersion, dims)).toBeNull();
    expect(parsePanelDetectResult("nope", dims)).toBeNull();
  });
});

interface FakeWorker extends PanelDetectWorkerLike {
  readonly posted: PanelDetectWorkerRequest[];
  readonly transfers: Transferable[][];
  terminated: number;
  emit(data: unknown): void;
  emitError(): void;
}

type FakeListener = (event: { data: unknown; preventDefault?(): void }) => void;

function fakeWorker(onRequest?: (worker: FakeWorker, request: PanelDetectWorkerRequest) => void): FakeWorker {
  const messageListeners = new Set<FakeListener>();
  const errorListeners = new Set<FakeListener>();
  const worker: FakeWorker = {
    posted: [],
    transfers: [],
    terminated: 0,
    postMessage(message, transfer) {
      worker.posted.push(message);
      worker.transfers.push(transfer ?? []);
      onRequest?.(worker, message);
    },
    addEventListener(type: string, listener: FakeListener) {
      if (type === "message") messageListeners.add(listener);
      else errorListeners.add(listener);
    },
    removeEventListener(type: string, listener: FakeListener) {
      if (type === "message") messageListeners.delete(listener);
      else errorListeners.delete(listener);
    },
    terminate() {
      worker.terminated += 1;
    },
    emit(data) {
      for (const listener of [...messageListeners]) listener({ data });
    },
    emitError() {
      for (const listener of [...errorListeners]) listener({ data: undefined });
    },
  };
  return worker;
}

function respondWithRealResult(worker: FakeWorker, request: PanelDetectWorkerRequest): void {
  if (request.kind !== "detect") return;
  queueMicrotask(() => {
    const result = detectPanels(
      { width: request.width, height: request.height, data: new Uint8ClampedArray(request.pixels) },
      request.options,
    );
    worker.emit({ version: 1, kind: "result", requestId: request.requestId, result: structuredClone(result) });
  });
}

describe("컷 감지 클라이언트 — Worker 백엔드", () => {
  it("픽셀을 전송하고 응답 하나를 검증해 돌려준 뒤 Worker 를 종료한다", async () => {
    const worker = fakeWorker(respondWithRealResult);
    const raster = page().raster();
    const result = await detectPanelsInBackground(raster, {
      executionBackend: "worker",
      readingOrder: "comic",
      workerFactory: () => worker,
    });
    expect(result.panels).toHaveLength(2);
    expect(result).toEqual(detectPanels(raster, { readingOrder: "comic" }));
    expect(worker.transfers[0]).toHaveLength(1);
    expect(worker.terminated).toBe(1);
  });

  it("transferInput 이면 복사 없이 같은 버퍼를 전송한다", async () => {
    const worker = fakeWorker(respondWithRealResult);
    const image = page();
    const buffer = image.data.buffer;
    await detectPanelsInBackground(image.raster(), { executionBackend: "worker", transferInput: true, workerFactory: () => worker });
    const request = worker.posted[0];
    expect(request.kind === "detect" && request.pixels === buffer).toBe(true);
  });

  it("Worker 가 보낸 오류 코드를 그대로 전한다", async () => {
    const worker = fakeWorker((self, request) => {
      if (request.kind === "detect") {
        queueMicrotask(() => self.emit({ version: 1, kind: "error", requestId: 1, code: "too-many-panels", message: "x" }));
      }
    });
    await expect(detectPanelsInBackground(page().raster(), { executionBackend: "worker", workerFactory: () => worker }))
      .rejects.toMatchObject({ code: "too-many-panels" });
    expect(worker.terminated).toBe(1);
  });

  it("계약을 어긴 응답(다른 requestId, 깨진 결과)은 worker-protocol 로 끝낸다", async () => {
    const wrongId = fakeWorker((self) => queueMicrotask(() => self.emit({ version: 1, kind: "result", requestId: 9, result: {} })));
    await expect(detectPanelsInBackground(page().raster(), { executionBackend: "worker", workerFactory: () => wrongId }))
      .rejects.toMatchObject({ code: "worker-protocol" });
    const broken = fakeWorker((self) => queueMicrotask(() => self.emit({ version: 1, kind: "result", requestId: 1, result: { version: 1 } })));
    await expect(detectPanelsInBackground(page().raster(), { executionBackend: "worker", workerFactory: () => broken }))
      .rejects.toMatchObject({ code: "worker-protocol" });
    expect(broken.terminated).toBe(1);
  });

  it("취소하면 cancel 메시지를 보내고 Worker 를 종료하며 cancelled 로 끝난다", async () => {
    const worker = fakeWorker();
    const controller = new AbortController();
    const run = detectPanelsInBackground(page().raster(), {
      executionBackend: "worker",
      signal: controller.signal,
      workerFactory: () => worker,
    });
    controller.abort();
    await expect(run).rejects.toMatchObject({ code: "cancelled" });
    expect(worker.posted.map((message) => message.kind)).toEqual(["detect", "cancel"]);
    expect(worker.terminated).toBe(1);
  });

  it("이미 취소된 신호는 Worker 를 만들지 않는다", async () => {
    const factory = vi.fn(() => fakeWorker());
    const controller = new AbortController();
    controller.abort();
    await expect(detectPanelsInBackground(page().raster(), { executionBackend: "worker", signal: controller.signal, workerFactory: factory }))
      .rejects.toMatchObject({ code: "cancelled" });
    expect(factory).not.toHaveBeenCalled();
  });

  it("응답이 없으면 바깥 타이머가 Worker 를 종료하고 timeout 으로 끝낸다", async () => {
    vi.useFakeTimers();
    const worker = fakeWorker();
    const run = detectPanelsInBackground(page().raster(), { executionBackend: "worker", timeLimitMs: 1_000, workerFactory: () => worker });
    const assertion = expect(run).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(3_001);
    await assertion;
    expect(worker.terminated).toBe(1);
  });

  it("Worker 생성 실패와 실행 중 오류는 메인 스레드로 몰래 다시 시도하지 않고 실패로 끝낸다", async () => {
    await expect(detectPanelsInBackground(page().raster(), {
      executionBackend: "worker",
      workerFactory: () => { throw new Error("no worker"); },
    })).rejects.toMatchObject({ code: "worker-unavailable" });
    const crashing = fakeWorker((self) => queueMicrotask(() => self.emitError()));
    await expect(detectPanelsInBackground(page().raster(), { executionBackend: "worker", workerFactory: () => crashing }))
      .rejects.toMatchObject({ code: "worker-failed" });
    expect(crashing.terminated).toBe(1);
  });

  it("잘못된 입력은 Worker 를 만들기 전에 거절한다", async () => {
    const factory = vi.fn(() => fakeWorker());
    await expect(detectPanelsInBackground({ width: 4, height: 4, data: new Uint8ClampedArray(8) }, { executionBackend: "worker", workerFactory: factory }))
      .rejects.toMatchObject({ code: "invalid-input" });
    expect(factory).not.toHaveBeenCalled();
  });
});

describe("컷 감지 클라이언트 — direct 백엔드", () => {
  it("Worker 가 없는 환경에서만 메인 스레드로 실행하고, 명시하면 항상 메인 스레드로 실행한다", async () => {
    const factory = vi.fn(() => fakeWorker());
    const raster = page().raster();
    const noWorker = await detectPanelsInBackground(raster, { isWorkerAvailable: () => false, workerFactory: factory, readingOrder: "comic" });
    const direct = await detectPanelsInBackground(raster, { executionBackend: "direct", workerFactory: factory, readingOrder: "comic" });
    expect(noWorker).toEqual(direct);
    expect(direct.panels).toHaveLength(2);
    expect(factory).not.toHaveBeenCalled();
  });

  it("취소 신호가 켜지면 cancelled 로 끝난다", async () => {
    const controller = new AbortController();
    const run = detectPanelsInBackground(page().raster(), { executionBackend: "direct", signal: controller.signal });
    controller.abort();
    await expect(run).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("컷 감지 Worker 진입점", () => {
  async function loadWorker() {
    const listeners: ((event: { data: unknown }) => void)[] = [];
    const posted: unknown[] = [];
    vi.stubGlobal("self", {
      addEventListener: (_type: string, listener: (event: { data: unknown }) => void) => { listeners.push(listener); },
      postMessage: (message: unknown) => { posted.push(message); },
    });
    await import("./panel-detect.worker");
    const send = (data: unknown): void => { for (const listener of listeners) listener({ data }); };
    const waitForResponse = async (): Promise<unknown> => {
      for (let attempt = 0; attempt < 200 && posted.length === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
      return posted[0];
    };
    return { send, posted, waitForResponse };
  }

  it("감지 요청을 처리해 검증 가능한 결과를 돌려준다", async () => {
    const { send, waitForResponse } = await loadWorker();
    const request = detectRequest();
    send(request);
    const response = await waitForResponse();
    expect(isPanelDetectWorkerResponse(response)).toBe(true);
    const result = response && typeof response === "object" && "result" in response ? (response as { result: unknown }).result : null;
    const parsed: PanelDetectResult | null = parsePanelDetectResult(result, { width: request.width, height: request.height });
    expect(parsed?.panels).toHaveLength(2);
  });

  it("먼저 도착한 cancel 은 감지를 cancelled 오류로 끝낸다", async () => {
    const { send, waitForResponse } = await loadWorker();
    send({ version: 1, kind: "cancel", requestId: 1 });
    send(detectRequest());
    const response = await waitForResponse();
    expect(response).toMatchObject({ kind: "error", code: "cancelled", requestId: 1 });
  });

  it("계약에 맞지 않는 메시지는 무시한다", async () => {
    const { send, posted } = await loadWorker();
    send({ nonsense: true });
    send(detectRequest({ pixels: new ArrayBuffer(8) }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(posted).toEqual([]);
  });
});
