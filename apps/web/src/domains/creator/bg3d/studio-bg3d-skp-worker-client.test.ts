import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES,
  StudioBg3dSkpConversionError,
  StudioBg3dSkpConverterUnavailableError,
  StudioBg3dSkpParseError,
  type StudioBg3dSkpStageProgress,
} from "./studio-bg3d-skp-contract";
import { convertStudioBg3dSkpBytes } from "./studio-bg3d-skp-conversion-core";
import { convertStudioBg3dSkp, type StudioBg3dSkpWorkerLike } from "./studio-bg3d-skp-worker-client";
import {
  STUDIO_BG3D_SKP_WORKER_PROTOCOL_VERSION as VERSION,
  type StudioBg3dSkpWorkerRequest,
} from "./studio-bg3d-skp-worker-protocol";
import {
  createBoxPrimitive,
  createFakeOpenSkpModule,
  createSkpHeaderBytes,
  createSkpVffBytes,
} from "./studio-bg3d-skp.test-fixture";

/** 클라이언트가 읽는 필드만 가진 가짜 이벤트: 메시지는 data, 오류는 preventDefault. */
interface FakeWorkerEvent {
  readonly data?: unknown;
  preventDefault?(): void;
}

/** 메시지·오류 리스너 오버로드가 둘 다 받을 수 있도록 두 필드를 함께 받는 한 모양으로 둔다. */
type Listener = (event: { readonly data: unknown; preventDefault?(): void }) => void;

class FakeWorker implements StudioBg3dSkpWorkerLike {
  readonly posted: StudioBg3dSkpWorkerRequest[] = [];
  readonly transferred: Transferable[][] = [];
  readonly listeners: Record<"message" | "error" | "messageerror", Set<Listener>> = {
    message: new Set(),
    error: new Set(),
    messageerror: new Set(),
  };
  terminated = false;
  throwOnPost = false;

  postMessage(message: StudioBg3dSkpWorkerRequest, transfer?: Transferable[]): void {
    if (this.throwOnPost) throw new Error("DataCloneError");
    this.posted.push(message);
    this.transferred.push(transfer ?? []);
  }

  addEventListener(type: "message" | "error" | "messageerror", listener: Listener): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: "message" | "error" | "messageerror", listener: Listener): void {
    this.listeners[type].delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(type: "message" | "error" | "messageerror", event: FakeWorkerEvent): void {
    const delivered = { data: event.data, preventDefault: event.preventDefault };
    for (const listener of [...this.listeners[type]]) listener(delivered);
  }

  respond(data: unknown): void {
    this.emit("message", { data });
  }
}

const VFF_BYTES = createSkpHeaderBytes({ version: "{21.0.339}", container: "vff", byteLength: 2048 });

/** 실제 변환 코어에 가짜 모듈을 물려 유효한 보고서와 GLB 를 만든다. */
async function validOutput() {
  const { module } = createFakeOpenSkpModule({ scene: { glbPrimitives: [createBoxPrimitive({ size: 3 })], textures: [] } });
  return convertStudioBg3dSkpBytes(VFF_BYTES, {
    loadModule: () => Promise.resolve(module),
    execution: "worker",
    maxBytes: 1_000_000,
  });
}

async function resultMessage(requestId = 1) {
  const { glb, report } = await validOutput();
  return { version: VERSION, kind: "result", requestId, glb: glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), report };
}

async function failureOf(promise: Promise<unknown>): Promise<StudioBg3dSkpConversionError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof StudioBg3dSkpConversionError) return error;
    throw error;
  }
  throw new Error("실패해야 하는 호출이 성공했습니다.");
}

describe("convertStudioBg3dSkp — Worker path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function start(worker: FakeWorker, extra: Parameters<typeof convertStudioBg3dSkp>[1] = {}) {
    return convertStudioBg3dSkp(VFF_BYTES, {
      workerFactory: () => worker,
      isWorkerAvailable: () => true,
      maxBytes: 4096,
      ...extra,
    });
  }

  it("posts one convert request, relays progress and resolves with the validated report", async () => {
    const worker = new FakeWorker();
    const stages: StudioBg3dSkpStageProgress[] = [];
    const pending = start(worker, { onStage: (progress) => stages.push(progress) });
    expect(worker.posted).toHaveLength(1);
    expect(worker.posted[0]).toMatchObject({ version: VERSION, kind: "convert", requestId: 1, maxBytes: 4096 });
    expect(worker.posted[0].bytes.byteLength).toBe(VFF_BYTES.byteLength);

    worker.respond({ version: VERSION, kind: "progress", requestId: 1, stage: "building-scene", fraction: 0.4 });
    worker.respond(await resultMessage());
    const output = await pending;

    expect(stages).toEqual([{ stage: "building-scene", fraction: 0.4, execution: "worker" }]);
    expect([...output.glb.subarray(0, 4)]).toEqual([0x67, 0x6c, 0x54, 0x46]);
    expect(output.report.conversion.execution).toBe("worker");
    expect(worker.terminated).toBe(true);
    expect(worker.listeners.message.size).toBe(0);
  });

  it("copies the input by default and transfers it only when the caller hands it over", async () => {
    const owned = VFF_BYTES.slice().buffer;
    const copied = new FakeWorker();
    const first = start(copied);
    copied.respond(await resultMessage());
    await first;
    expect(copied.posted[0].bytes).not.toBe(VFF_BYTES.buffer);
    expect(copied.transferred[0]).toEqual([copied.posted[0].bytes]);

    const handedOver = new FakeWorker();
    const second = convertStudioBg3dSkp(owned, {
      workerFactory: () => handedOver,
      isWorkerAvailable: () => true,
      transferInput: true,
    });
    handedOver.respond(await resultMessage());
    await second;
    expect(handedOver.posted[0].bytes).toBe(owned);
  });

  it("terminates the Worker and fails with skp-timeout when the time limit passes", async () => {
    const worker = new FakeWorker();
    const pending = start(worker, { timeoutMs: 30_000 });
    const failure = failureOf(pending);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const error = await failure;
    expect(error.code).toBe("skp-timeout");
    expect(error.reason).toBe("timeout");
    expect(error.detail).toEqual({ timeoutMs: 30_000 });
    expect(worker.terminated).toBe(true);
  });

  it("ignores a late result after a timeout instead of resolving twice", async () => {
    const worker = new FakeWorker();
    const failure = failureOf(start(worker, { timeoutMs: 1_000 }));
    await vi.advanceTimersByTimeAsync(1_001);
    await failure;
    worker.respond(await resultMessage());
    expect(worker.terminated).toBe(true);
  });

  it("cancels by terminating the Worker when the caller aborts mid-flight", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const failure = failureOf(start(worker, { signal: controller.signal }));
    controller.abort();
    const error = await failure;
    expect(error.code).toBe("skp-cancelled");
    expect(error.name).toBe("AbortError");
    expect(worker.terminated).toBe(true);
  });

  it("never creates a Worker for an already-aborted signal", async () => {
    const workerFactory = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const error = await failureOf(convertStudioBg3dSkp(VFF_BYTES, {
      signal: controller.signal,
      workerFactory,
      isWorkerAvailable: () => true,
    }));
    expect(error.code).toBe("skp-cancelled");
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it("fails at once, without creating a Worker, when the bytes do not start with the SketchUp signature", async () => {
    const workerFactory = vi.fn();
    const junk = new Uint8Array(512).fill(7);
    const error = await failureOf(convertStudioBg3dSkp(junk, { workerFactory, isWorkerAvailable: () => true }));
    expect(error).toBeInstanceOf(StudioBg3dSkpParseError);
    expect(error.code).toBe("skp-parse-failed");
    expect(error.reason).toBe("invalid-signature");
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it("fails at once, without creating a Worker, for a file saved before 2013 or above the size limit", async () => {
    const workerFactory = vi.fn();
    const worker = { workerFactory, isWorkerAvailable: () => true };
    const old = createSkpHeaderBytes({ version: "{12.0.5}", container: "legacy" });
    const unsupported = await failureOf(convertStudioBg3dSkp(old, worker));
    expect(unsupported.code).toBe("skp-unsupported-version");
    const tooLarge = await failureOf(convertStudioBg3dSkp(VFF_BYTES, { ...worker, maxBytes: VFF_BYTES.byteLength - 1 }));
    expect(tooLarge.code).toBe("skp-too-large");
    expect(tooLarge.reason).toBe("source-limit");
    const empty = await failureOf(convertStudioBg3dSkp(new Uint8Array(0), worker));
    expect(empty.code).toBe("skp-parse-failed");
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it("fails at once, without creating a Worker, when the model data would expand past the limit", async () => {
    const workerFactory = vi.fn();
    const bytes = createSkpVffBytes([{ name: "model.dat", uncompressedSize: 5_000 }]);
    const error = await failureOf(convertStudioBg3dSkp(bytes, {
      workerFactory,
      isWorkerAvailable: () => true,
      maxBytes: 4_096,
    }));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("model-data-limit");
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it("reports converter-unavailable when the Worker script fails or crashes", async () => {
    const worker = new FakeWorker();
    const failure = failureOf(start(worker));
    const preventDefault = vi.fn();
    worker.emit("error", { preventDefault });
    const error = await failure;
    expect(error.code).toBe("skp-converter-unavailable");
    expect(error.reason).toBe("worker-failed");
    expect(preventDefault).toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
  });

  it("treats unreadable messages and mismatched request ids as protocol failures", async () => {
    for (const bad of [
      { garbage: true },
      { version: VERSION, kind: "progress", requestId: 99, stage: "validating", fraction: null },
    ]) {
      const worker = new FakeWorker();
      const failure = failureOf(start(worker));
      worker.respond(bad);
      const error = await failure;
      expect(error.code).toBe("skp-converter-unavailable");
      expect(error.reason).toBe("worker-protocol");
      expect(worker.terminated).toBe(true);
    }
    const worker = new FakeWorker();
    const failure = failureOf(start(worker));
    worker.emit("messageerror", {});
    expect((await failure).reason).toBe("worker-protocol");
  });

  it("rejects a result whose report fails schema validation", async () => {
    const worker = new FakeWorker();
    const failure = failureOf(start(worker));
    const message = await resultMessage();
    worker.respond({ ...message, report: { ...(message.report as object), version: 2 } });
    expect((await failure).reason).toBe("worker-protocol");
  });

  it("turns an error response back into a typed error, attaching a valid report", async () => {
    const worker = new FakeWorker();
    const failure = failureOf(start(worker));
    const { report } = await validOutput();
    worker.respond({
      version: VERSION,
      kind: "error",
      requestId: 1,
      code: "skp-empty-scene",
      message: "형상이 없습니다",
      reason: "no-geometry",
      detail: { triangles: 0 },
      report,
    });
    const error = await failure;
    expect(error.code).toBe("skp-empty-scene");
    expect(error.message).toBe("형상이 없습니다");
    expect(error.detail).toEqual({ triangles: 0 });
    expect(error.report).toEqual(report);
    expect(worker.terminated).toBe(true);
  });

  it("keeps the diagnostic reason of an error response and restores the legacy error classes", async () => {
    const worker = new FakeWorker();
    const parse = failureOf(start(worker));
    worker.respond({
      version: VERSION,
      kind: "error",
      requestId: 1,
      code: "skp-parse-failed",
      message: "구조를 해석하지 못했습니다",
      reason: "invalid-signature",
      detail: null,
      report: null,
    });
    const parseError = await parse;
    expect(parseError).toBeInstanceOf(StudioBg3dSkpParseError);
    expect(parseError.reason).toBe("invalid-signature");

    const unavailableWorker = new FakeWorker();
    const unavailable = failureOf(start(unavailableWorker));
    unavailableWorker.respond({
      version: VERSION,
      kind: "error",
      requestId: 1,
      code: "skp-converter-unavailable",
      message: "변환기를 불러오지 못했습니다",
      reason: "loader-failed",
      detail: null,
      report: null,
    });
    const unavailableError = await unavailable;
    expect(unavailableError).toBeInstanceOf(StudioBg3dSkpConverterUnavailableError);
    expect(unavailableError.reason).toBe("loader-failed");
  });

  it("ignores a diagnostic reason it does not know instead of passing it on", async () => {
    const worker = new FakeWorker();
    const failure = failureOf(start(worker));
    worker.respond({
      version: VERSION,
      kind: "error",
      requestId: 1,
      code: "skp-timeout",
      message: "시간 초과",
      reason: "not-a-known-reason",
      detail: null,
      report: null,
    });
    expect((await failure).reason).toBeUndefined();
  });

  it("drops a malformed report from an error response instead of trusting it", async () => {
    const worker = new FakeWorker();
    const failure = failureOf(start(worker));
    worker.respond({
      version: VERSION,
      kind: "error",
      requestId: 1,
      code: "skp-parse-failed",
      message: "x",
      reason: null,
      detail: null,
      report: { not: "a report" },
    });
    expect((await failure).report).toBeUndefined();
  });

  it("fails honestly when the Worker cannot be constructed or the request cannot be posted", async () => {
    const throwing = await failureOf(convertStudioBg3dSkp(VFF_BYTES, {
      workerFactory: () => { throw new Error("blocked by CSP"); },
      isWorkerAvailable: () => true,
    }));
    expect(throwing.code).toBe("skp-converter-unavailable");
    expect(throwing.reason).toBe("worker-failed");

    const worker = new FakeWorker();
    worker.throwOnPost = true;
    const posting = await failureOf(start(worker));
    expect(posting.reason).toBe("worker-failed");
    expect(worker.terminated).toBe(true);
  });

  it("does not silently retry on the main thread after a Worker failure", async () => {
    const loadModule = vi.fn();
    const worker = new FakeWorker();
    const failure = failureOf(start(worker, { loadModule }));
    worker.emit("error", {});
    await failure;
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("rejects an unknown execution backend as a programming error", async () => {
    await expect(convertStudioBg3dSkp(VFF_BYTES, {
      executionBackend: "gpu" as unknown as "worker",
    })).rejects.toThrow(TypeError);
  });
});

describe("convertStudioBg3dSkp — main-thread paths", () => {
  function fakeLoader() {
    const fake = createFakeOpenSkpModule({ scene: { glbPrimitives: [createBoxPrimitive({ size: 3 })], textures: [] } });
    return { fake, loadModule: () => Promise.resolve(fake.module) };
  }

  it("falls back to the main thread only when no Worker exists, and records that in the report", async () => {
    const workerFactory = vi.fn();
    const { loadModule } = fakeLoader();
    const output = await convertStudioBg3dSkp(VFF_BYTES, { isWorkerAvailable: () => false, workerFactory, loadModule });
    expect(workerFactory).not.toHaveBeenCalled();
    expect(output.report.conversion.execution).toBe("main-thread");
    expect(output.report.warnings.map((warning) => warning.code)).toContain("main-thread-fallback");
  });

  it("uses the main thread when the caller explicitly selects direct, even if a Worker exists", async () => {
    const workerFactory = vi.fn();
    const { loadModule } = fakeLoader();
    const output = await convertStudioBg3dSkp(VFF_BYTES, {
      executionBackend: "direct",
      isWorkerAvailable: () => true,
      workerFactory,
      loadModule,
    });
    expect(workerFactory).not.toHaveBeenCalled();
    expect(output.report.conversion.execution).toBe("main-thread");
  });

  it("refuses files above the main-thread cap with skp-too-large instead of freezing the page", async () => {
    const { fake, loadModule } = fakeLoader();
    const big = createSkpHeaderBytes({ byteLength: STUDIO_BG3D_SKP_MAIN_THREAD_MAX_BYTES + 1 });
    const error = await failureOf(convertStudioBg3dSkp(big, { isWorkerAvailable: () => false, loadModule }));
    expect(error.code).toBe("skp-too-large");
    expect(error.reason).toBe("main-thread-limit");
    expect(fake.calls.build).toHaveLength(0);
  });

  it("honours cancellation before and during a main-thread conversion", async () => {
    const { loadModule } = fakeLoader();
    const early = new AbortController();
    early.abort();
    expect((await failureOf(convertStudioBg3dSkp(VFF_BYTES, {
      isWorkerAvailable: () => false,
      loadModule,
      signal: early.signal,
    }))).code).toBe("skp-cancelled");

    const late = new AbortController();
    const error = await failureOf(convertStudioBg3dSkp(VFF_BYTES, {
      isWorkerAvailable: () => false,
      loadModule,
      signal: late.signal,
      onStage: (progress) => {
        if (progress.stage === "building-scene") late.abort();
      },
    }));
    expect(error.code).toBe("skp-cancelled");
  });

  it("relays stage progress with the main-thread execution label", async () => {
    const { loadModule } = fakeLoader();
    const stages: string[] = [];
    await convertStudioBg3dSkp(VFF_BYTES, {
      isWorkerAvailable: () => false,
      loadModule,
      onStage: (progress) => stages.push(`${progress.stage}:${progress.execution}`),
    });
    expect(stages[0]).toBe("validating:main-thread");
    expect(stages).toContain("writing-glb:main-thread");
  });

  it("still maps a loader failure to converter-unavailable on the main thread", async () => {
    const error = await failureOf(convertStudioBg3dSkp(VFF_BYTES, {
      isWorkerAvailable: () => false,
      loadModule: () => Promise.reject(new Error("chunk 404")),
    }));
    expect(error.code).toBe("skp-converter-unavailable");
  });
});
