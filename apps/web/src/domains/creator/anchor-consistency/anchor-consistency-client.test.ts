import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ANCHOR_FEATURE_TIMEOUT_MS,
  extractAnchorFeaturesInBackground,
  type AnchorFeatureWorkerLike,
} from "./anchor-consistency-client";
import {
  ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION,
  type AnchorFeatureWorkerRequest,
} from "./anchor-consistency-worker-protocol";
import { extractAnchorFeatures } from "./anchor-image-features";
import { AnchorFeatureError, type AnchorRaster } from "./anchor-raster";
import { figureRaster } from "./anchor-synthetic-raster";

interface MessageEventLike {
  readonly data: unknown;
}

interface ErrorEventLike {
  preventDefault?(): void;
}

/** 두 종류의 이벤트를 한 목록에 보관하기 위한 합친 모양. */
type FakeEvent = MessageEventLike & ErrorEventLike;

/** 실제 Worker 없이 메시지·오류 이벤트를 직접 흘려 보내는 가짜. 네트워크도 스레드도 쓰지 않는다. */
class FakeWorker implements AnchorFeatureWorkerLike {
  readonly requests: AnchorFeatureWorkerRequest[] = [];
  readonly transfers: Transferable[][] = [];
  readonly messageListeners = new Set<(event: FakeEvent) => void>();
  readonly errorListeners = new Set<(event: FakeEvent) => void>();
  readonly protocolErrorListeners = new Set<(event: FakeEvent) => void>();
  terminateCalls = 0;
  throwOnPost = false;

  postMessage(message: AnchorFeatureWorkerRequest, transfer?: Transferable[]): void {
    if (this.throwOnPost) throw new Error("structured clone failed");
    this.requests.push(message);
    this.transfers.push(transfer ?? []);
  }

  addEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: ErrorEventLike) => void): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: (event: FakeEvent) => void): void {
    this.listenersFor(type).add(listener);
  }

  removeEventListener(type: "message", listener: (event: MessageEventLike) => void): void;
  removeEventListener(type: "error" | "messageerror", listener: (event: ErrorEventLike) => void): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: (event: FakeEvent) => void): void {
    this.listenersFor(type).delete(listener);
  }

  terminate(): void {
    this.terminateCalls += 1;
  }

  emit(data: unknown): void {
    for (const listener of [...this.messageListeners]) listener({ data });
  }

  emitError(type: "error" | "messageerror" = "error"): void {
    const event = { data: undefined, preventDefault: vi.fn() };
    for (const listener of [...this.listenersFor(type)]) listener(event);
  }

  listenerCount(): number {
    return this.messageListeners.size + this.errorListeners.size + this.protocolErrorListeners.size;
  }

  private listenersFor(type: "message" | "error" | "messageerror"): Set<(event: FakeEvent) => void> {
    if (type === "message") return this.messageListeners;
    return type === "error" ? this.errorListeners : this.protocolErrorListeners;
  }
}

function resultMessage(requestId: number, features: unknown): unknown {
  return { version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION, kind: "result", requestId, features };
}

/** 던져진 AnchorFeatureError 의 코드(없으면 null, 다른 오류면 "other"). */
async function rejectionCode(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof AnchorFeatureError ? error.code : "other";
  }
}

function startWorkerRun(worker: FakeWorker, raster: AnchorRaster = figureRaster(), extra: Partial<Parameters<typeof extractAnchorFeaturesInBackground>[1]> = {}) {
  const factory = vi.fn(() => worker);
  const promise = extractAnchorFeaturesInBackground(raster, { executionBackend: "worker", workerFactory: factory, ...extra });
  return { promise, factory };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("백그라운드 특징 분석 — 실행 위치", () => {
  it("direct 로 지정하면 Worker 를 만들지 않고 같은 결과를 낸다", async () => {
    const factory = vi.fn(() => new FakeWorker());
    const raster = figureRaster();
    const features = await extractAnchorFeaturesInBackground(raster, { executionBackend: "direct", workerFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    expect(features).toEqual(extractAnchorFeatures(raster));
  });

  it("지정하지 않으면 Worker 생성자가 없는 환경에서만 direct 로 실행한다", async () => {
    const factory = vi.fn(() => new FakeWorker());
    const withoutWorker = await extractAnchorFeaturesInBackground(figureRaster(), { isWorkerAvailable: () => false, workerFactory: factory });
    expect(factory).not.toHaveBeenCalled();
    expect(withoutWorker.subject.mode).toBe("background");
    const worker = new FakeWorker();
    const { promise, factory: workerFactory } = startWorkerRun(worker, figureRaster(), { executionBackend: undefined, isWorkerAvailable: () => true });
    expect(workerFactory).toHaveBeenCalledTimes(1);
    worker.emit(resultMessage(1, extractAnchorFeatures(figureRaster())));
    await expect(promise).resolves.toEqual(extractAnchorFeatures(figureRaster()));
  });

  it("direct 실행도 취소 신호를 따른다", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await rejectionCode(extractAnchorFeaturesInBackground(figureRaster(), { executionBackend: "direct", signal: controller.signal }))).toBe("cancelled");
  });
});

describe("백그라운드 특징 분석 — Worker 경로", () => {
  it("요청을 보내고 검증된 결과를 돌려주며 Worker 를 정리한다", async () => {
    const worker = new FakeWorker();
    const raster = figureRaster();
    const { promise } = startWorkerRun(worker, raster, { maxEdge: 128 });
    expect(worker.requests).toHaveLength(1);
    const request = worker.requests[0];
    expect(request?.version).toBe(ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION);
    expect(request?.kind).toBe("extract");
    expect(request?.width).toBe(raster.width);
    expect(request?.height).toBe(raster.height);
    expect(request?.maxEdge).toBe(128);
    expect(request?.pixels.byteLength).toBe(raster.data.byteLength);
    const expected = extractAnchorFeatures(raster);
    worker.emit(resultMessage(request?.requestId ?? -1, JSON.parse(JSON.stringify(expected)) as unknown));
    await expect(promise).resolves.toEqual(expected);
    expect(worker.terminateCalls).toBe(1);
    expect(worker.listenerCount()).toBe(0);
  });

  it("호출자의 픽셀 버퍼는 건드리지 않고 복사본을 전송한다", async () => {
    const worker = new FakeWorker();
    const raster = figureRaster();
    const before = Uint8ClampedArray.from(raster.data);
    const { promise } = startWorkerRun(worker, raster);
    const sent = worker.requests[0]?.pixels;
    expect(sent).not.toBe(raster.data.buffer);
    expect(worker.transfers[0]).toEqual([sent]);
    expect(raster.data.byteLength).toBe(before.byteLength);
    expect(Array.from(raster.data)).toEqual(Array.from(before));
    worker.emit(resultMessage(1, extractAnchorFeatures(raster)));
    await promise;
  });

  it("maxEdge 를 주지 않으면 요청에도 싣지 않는다", async () => {
    const worker = new FakeWorker();
    const { promise } = startWorkerRun(worker);
    expect(worker.requests[0] && "maxEdge" in worker.requests[0]).toBe(false);
    worker.emit(resultMessage(1, extractAnchorFeatures(figureRaster())));
    await promise;
  });

  it("Worker 가 알린 오류 코드를 그대로 전한다", async () => {
    const worker = new FakeWorker();
    const { promise } = startWorkerRun(worker);
    worker.emit({ version: ANCHOR_FEATURE_WORKER_PROTOCOL_VERSION, kind: "error", requestId: 1, code: "empty-image" });
    expect(await rejectionCode(promise)).toBe("empty-image");
    expect(worker.terminateCalls).toBe(1);
  });

  it("모양이 다른 응답은 worker-protocol 오류다", async () => {
    const garbage = new FakeWorker();
    const first = startWorkerRun(garbage);
    garbage.emit({ hello: "world" });
    expect(await rejectionCode(first.promise)).toBe("worker-protocol");
    expect(garbage.terminateCalls).toBe(1);

    const wrongId = new FakeWorker();
    const second = startWorkerRun(wrongId);
    wrongId.emit(resultMessage(99, extractAnchorFeatures(figureRaster())));
    expect(await rejectionCode(second.promise)).toBe("worker-protocol");

    const badFeatures = new FakeWorker();
    const third = startWorkerRun(badFeatures);
    badFeatures.emit(resultMessage(1, { version: 1, width: 10 }));
    expect(await rejectionCode(third.promise)).toBe("worker-protocol");
  });

  it("error 이벤트는 worker-failed, messageerror 는 worker-protocol 이다", async () => {
    const failing = new FakeWorker();
    const first = startWorkerRun(failing);
    failing.emitError("error");
    expect(await rejectionCode(first.promise)).toBe("worker-failed");

    const unreadable = new FakeWorker();
    const second = startWorkerRun(unreadable);
    unreadable.emitError("messageerror");
    expect(await rejectionCode(second.promise)).toBe("worker-protocol");
  });

  it("Worker 가 실패해도 메인 스레드로 몰래 다시 시도하지 않는다", async () => {
    const worker = new FakeWorker();
    const { promise, factory } = startWorkerRun(worker);
    worker.emitError("error");
    expect(await rejectionCode(promise)).toBe("worker-failed");
    expect(factory).toHaveBeenCalledTimes(1);
    expect(worker.requests).toHaveLength(1);
  });

  it("Worker 를 만들 수 없거나 전송에 실패하면 코드가 있는 오류로 끝난다", async () => {
    const unavailable = extractAnchorFeaturesInBackground(figureRaster(), {
      executionBackend: "worker",
      workerFactory: () => {
        throw new Error("blocked by policy");
      },
    });
    expect(await rejectionCode(unavailable)).toBe("worker-unavailable");

    const broken = new FakeWorker();
    broken.throwOnPost = true;
    const { promise } = startWorkerRun(broken);
    expect(await rejectionCode(promise)).toBe("worker-failed");
    expect(broken.terminateCalls).toBe(1);
  });

  it("완료된 뒤 들어오는 메시지는 무시한다", async () => {
    const worker = new FakeWorker();
    const { promise } = startWorkerRun(worker);
    worker.emit(resultMessage(1, extractAnchorFeatures(figureRaster())));
    await promise;
    worker.emit({ hello: "late" });
    worker.emitError("error");
    expect(worker.terminateCalls).toBe(1);
  });
});

describe("백그라운드 특징 분석 — 취소·시간 상한·입력 검사", () => {
  it("진행 중 취소하면 Worker 를 종료하고 cancelled 로 끝난다", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const { promise } = startWorkerRun(worker, figureRaster(), { signal: controller.signal });
    controller.abort();
    expect(await rejectionCode(promise)).toBe("cancelled");
    expect(worker.terminateCalls).toBe(1);
    expect(worker.listenerCount()).toBe(0);
  });

  it("시작 전에 이미 취소됐으면 Worker 를 만들지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const factory = vi.fn(() => new FakeWorker());
    const code = await rejectionCode(extractAnchorFeaturesInBackground(figureRaster(), { executionBackend: "worker", workerFactory: factory, signal: controller.signal }));
    expect(code).toBe("cancelled");
    expect(factory).not.toHaveBeenCalled();
  });

  it("응답이 없으면 시간 상한 뒤 timeout 으로 끝나고 Worker 를 종료한다", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const { promise } = startWorkerRun(worker);
    const outcome = rejectionCode(promise);
    await vi.advanceTimersByTimeAsync(ANCHOR_FEATURE_TIMEOUT_MS - 1);
    expect(worker.terminateCalls).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    expect(await outcome).toBe("timeout");
    expect(worker.terminateCalls).toBe(1);
  });

  it("시간 상한은 옵션으로 줄일 수 있다", async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const { promise } = startWorkerRun(worker, figureRaster(), { timeoutMs: 500 });
    const outcome = rejectionCode(promise);
    await vi.advanceTimersByTimeAsync(501);
    expect(await outcome).toBe("timeout");
  });

  it("잘못된 래스터는 Worker 를 만들기 전에 invalid-raster 로 끝난다", async () => {
    const factory = vi.fn(() => new FakeWorker());
    const bad: AnchorRaster = { width: 32, height: 32, data: new Uint8ClampedArray(12) };
    expect(await rejectionCode(extractAnchorFeaturesInBackground(bad, { executionBackend: "worker", workerFactory: factory }))).toBe("invalid-raster");
    expect(factory).not.toHaveBeenCalled();
  });

  it("너무 작은 이미지는 raster-too-small 로 끝난다", async () => {
    const tiny: AnchorRaster = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
    expect(await rejectionCode(extractAnchorFeaturesInBackground(tiny, { executionBackend: "direct" }))).toBe("raster-too-small");
  });
});
