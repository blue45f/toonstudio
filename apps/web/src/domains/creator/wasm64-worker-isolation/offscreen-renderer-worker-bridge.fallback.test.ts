import { describe, expect, it, vi } from "vitest";

import { OffscreenRendererWorkerBridge, type Canvas2DContextLike, type DispatchedPointerBatch } from "./offscreen-renderer-worker-bridge";

function recordingBridge(maxBatchPoints = 256) {
  const segments: number[][] = [];
  const batches: DispatchedPointerBatch[] = [];
  let currentX = 0;
  let currentY = 0;
  const context: Canvas2DContextLike = {
    beginPath() {},
    moveTo(x, y) { currentX = x; currentY = y; },
    lineTo(x, y) {
      segments.push([currentX, currentY, x, y]);
      currentX = x; currentY = y;
    },
    stroke() {},
  };
  const bridge = new OffscreenRendererWorkerBridge({
    forceFallback: true, maxBatchPoints, onFallbackBatch: (batch) => batches.push(batch),
  });
  bridge.attachCanvas({ width: 256, height: 128, getContext: () => context });
  return { bridge, segments, batches };
}

describe("폴백 렌더러의 스트로크 배치 연속성", () => {
  it("버퍼가 가득 차 나뉜 배치 사이의 선분도 그린다", () => {
    const { bridge, segments } = recordingBridge(2);
    for (const x of [0, 10, 20, 30]) bridge.enqueuePointerPoint({ x, y: 5 }, 7);
    expect(segments).toEqual([[0, 5, 10, 5], [10, 5, 20, 5], [20, 5, 30, 5]]);
    expect(bridge.getTelemetry()).toMatchObject({ submittedPoints: 4, submittedBatches: 2 });
    bridge.dispose();
  });

  it("프레임마다 한 점을 flush해도 원본 점 수를 유지하며 연결한다", () => {
    const { bridge, segments, batches } = recordingBridge();
    for (const x of [0, 10, 20, 30]) {
      bridge.enqueuePointerPoint({ x, y: 5 }, 7);
      bridge.flushPointerBatch();
    }
    expect(segments).toEqual([[0, 5, 10, 5], [10, 5, 20, 5], [20, 5, 30, 5]]);
    expect(batches.map((batch) => batch.pointCount)).toEqual([1, 1, 1, 1]);
    bridge.dispose();
  });

  it("서로 다른 스트로크의 끝과 시작은 연결하지 않는다", () => {
    const { bridge, segments } = recordingBridge(2);
    for (const x of [0, 10]) bridge.enqueuePointerPoint({ x, y: 5 }, 7);
    for (const x of [100, 110]) bridge.enqueuePointerPoint({ x, y: 9 }, 8);
    expect(segments).toEqual([[0, 5, 10, 5], [100, 9, 110, 9]]);
    bridge.dispose();
  });

  it("대기 중인 점이 있는 상태에서 스트로크가 바뀌면 이전 배치를 먼저 보낸다", () => {
    const { bridge, segments, batches } = recordingBridge();
    for (const x of [0, 10]) bridge.enqueuePointerPoint({ x, y: 5 }, 7);
    for (const x of [100, 110]) bridge.enqueuePointerPoint({ x, y: 9 }, 8);
    bridge.flushPointerBatch();
    expect(batches.map((batch) => [batch.strokeId, batch.pointCount])).toEqual([[7, 2], [8, 2]]);
    expect(segments).toEqual([[0, 5, 10, 5], [100, 9, 110, 9]]);
    bridge.dispose();
  });

  it("워커 경로도 스트로크마다 별도 원본 점 배치를 전송한다", () => {
    const postMessage = vi.fn<(message: unknown, transfer?: Transferable[]) => void>();
    const bridge = new OffscreenRendererWorkerBridge({ worker: { postMessage, terminate() {} } });
    bridge.attachCanvas({
      width: 256, height: 128, transferControlToOffscreen: () => ({ width: 256, height: 128 }),
    });
    for (const x of [0, 10]) bridge.enqueuePointerPoint({ x, y: 5 }, 7);
    for (const x of [100, 110]) bridge.enqueuePointerPoint({ x, y: 9 }, 8);
    bridge.flushPointerBatch();
    expect(postMessage.mock.calls.map(([message]) => message)).toMatchObject([
      { type: "init" },
      { type: "pointer-batch", strokeId: 7, pointCount: 2 },
      { type: "pointer-batch", strokeId: 8, pointCount: 2 },
    ]);
    bridge.dispose();
  });
});
