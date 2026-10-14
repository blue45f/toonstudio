import { describe, expect, it } from "vitest";

import { computeStudioImageTraceGridJob } from "./studio-image-trace-grid";
import { studioImageTracePreset } from "./studio-image-trace";
import {
  runStudioImageTraceWorker,
  type StudioImageTraceWorkerLike,
} from "./studio-image-trace-worker-client";
import {
  STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
  type StudioImageTraceWorkerResponseMessage,
  type StudioImageTraceWorkerRunMessage,
} from "./studio-image-trace-worker-protocol";

function rgba(pixels: ReadonlyArray<readonly [number, number, number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], index) => {
    data[index * 4] = r;
    data[index * 4 + 1] = g;
    data[index * 4 + 2] = b;
    data[index * 4 + 3] = a;
  });
  return data;
}

const BLACK = [0, 0, 0, 255] as const;
const WHITE = [255, 255, 255, 255] as const;
const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

/**
 * 실제 Worker 의 규약을 그대로 흉내 내는 가짜: 생성 직후 ready 를 보내고,
 * run 을 받으면 같은 순수 코어로 계산해 success 를 돌려준다.
 * 게시 순서를 기록해 핸드셰이크(ready 전 postMessage 금지)를 검증한다.
 */
class FakeTraceWorker implements StudioImageTraceWorkerLike {
  onmessage: StudioImageTraceWorkerLike["onmessage"] = null;
  onerror: StudioImageTraceWorkerLike["onerror"] = null;
  readonly events: string[] = [];
  terminated = false;

  constructor(private readonly behavior: "success" | "failure" = "success") {
    queueMicrotask(() => {
      this.events.push("ready-sent");
      this.onmessage?.({
        data: {
          type: "studio-image-trace/ready",
          version: STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
        },
      } as MessageEvent<StudioImageTraceWorkerResponseMessage>);
    });
  }

  postMessage(message: StudioImageTraceWorkerRunMessage): void {
    this.events.push("run-posted");
    queueMicrotask(() => {
      if (this.behavior === "failure") {
        this.onmessage?.({
          data: {
            type: "studio-image-trace/failure",
            version: STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
            error: { name: "Error", message: "가짜 Worker 실패" },
          },
        } as MessageEvent<StudioImageTraceWorkerResponseMessage>);
        return;
      }
      const { data, width, height, preset } = message.request;
      const job = computeStudioImageTraceGridJob(data, width, height, preset);
      if (!job) throw new Error("job 실패");
      this.onmessage?.({
        data: {
          type: "studio-image-trace/success",
          version: STUDIO_IMAGE_TRACE_WORKER_PROTOCOL_VERSION,
          grid: job.grid,
          layers: job.layers,
        },
      } as MessageEvent<StudioImageTraceWorkerResponseMessage>);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

function sampleRequest() {
  return {
    data: rgba([BLACK, WHITE, RED, BLUE]),
    width: 2,
    height: 2,
    preset: studioImageTracePreset("logo"),
  };
}

describe("runStudioImageTraceWorker — direct 모드", () => {
  it("순수 코어와 같은 격자·레이어를 돌려준다", async () => {
    const request = sampleRequest();
    const expected = computeStudioImageTraceGridJob(
      request.data,
      request.width,
      request.height,
      request.preset,
    );
    const result = await runStudioImageTraceWorker(request, { executionMode: "direct" });
    expect(result.execution).toBe("direct");
    expect([...result.grid.luminance]).toEqual([...expected!.grid.luminance]);
    expect(result.layers.map((layer) => layer.color)).toEqual(
      expected!.layers.map((layer) => layer.color),
    );
    expect(result.layers.map((layer) => [...layer.mask])).toEqual(
      expected!.layers.map((layer) => [...layer.mask]),
    );
  });

  it("격자를 만들 수 없는 입력이면 오류로 끝난다", async () => {
    await expect(
      runStudioImageTraceWorker(
        { data: rgba([BLACK]), width: 4, height: 4, preset: studioImageTracePreset("logo") },
        { executionMode: "direct" },
      ),
    ).rejects.toThrow("트레이싱할 픽셀 격자를 만들지 못했습니다.");
  });
});

describe("runStudioImageTraceWorker — worker 모드", () => {
  it("ready 핸드셰이크 뒤에만 요청을 게시하고 결과가 direct 와 동등하다", async () => {
    const worker = new FakeTraceWorker();
    const request = sampleRequest();
    const result = await runStudioImageTraceWorker(request, { workerFactory: () => worker });
    expect(result.execution).toBe("worker");
    expect(worker.events).toEqual(["ready-sent", "run-posted"]);
    expect(worker.terminated).toBe(true);

    const direct = await runStudioImageTraceWorker(sampleRequest(), { executionMode: "direct" });
    expect([...result.grid.luminance]).toEqual([...direct.grid.luminance]);
    expect(result.layers.map((layer) => layer.color)).toEqual(
      direct.layers.map((layer) => layer.color),
    );
  });

  it("Worker 의 실패 응답은 그 오류 그대로 reject 된다", async () => {
    const worker = new FakeTraceWorker("failure");
    await expect(
      runStudioImageTraceWorker(sampleRequest(), { workerFactory: () => worker }),
    ).rejects.toThrow("가짜 Worker 실패");
  });

  it("Worker 를 만들 수 없으면 unavailable 오류로 끝난다", async () => {
    await expect(
      runStudioImageTraceWorker(sampleRequest(), { workerFactory: () => null }),
    ).rejects.toMatchObject({ name: "StudioImageTraceWorkerUnavailableError" });
    await expect(
      runStudioImageTraceWorker(sampleRequest(), { workerFactory: null }),
    ).rejects.toMatchObject({ name: "StudioImageTraceWorkerUnavailableError" });
  });

  it("시작 전에 중단 신호가 있으면 AbortError 로 끝난다", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      runStudioImageTraceWorker(sampleRequest(), {
        workerFactory: () => new FakeTraceWorker(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
