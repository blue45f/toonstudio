import { afterEach, describe, expect, it } from "vitest";

import {
  getStudioDrawingStabilityTelemetrySnapshot,
  resetStudioDrawingStabilityTelemetryForTests,
} from "./studio-cuttoon-drawing-stability-telemetry";
import {
  createStudioCoalescedFrameBudgetTracker,
  decimateStudioCoalescedPointerBatch,
  STUDIO_COALESCED_CORNER_PRESERVE_DEG,
} from "./studio-cuttoon-coalesced-decimator";

afterEach(() => {
  resetStudioDrawingStabilityTelemetryForTests();
});

interface MockCoalescedSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timeStamp: number;
  readonly shiftKey?: boolean;
}

const identityMapper = {
  pointFor: (sample: PointerEvent) => {
    const s = sample as unknown as MockCoalescedSample;
    return { x: s.x, y: s.y };
  },
};

describe("studio-cuttoon-coalesced-decimator", () => {
  it("프레임 예산이 빡빡할 때(> 6ms 지연 조짐 / 240Hz 고밀도 버스트) 적응형 예산을 활성화한다", () => {
    const tracker = createStudioCoalescedFrameBudgetTracker();

    const calm = tracker.observeDelivery({ nowMs: 100, sampleCount: 2 });
    expect(calm.tightBudget).toBe(false);

    const delayedBatch = tracker.observeDelivery({ nowMs: 108.5, sampleCount: 5 });
    expect(delayedBatch.tightBudget).toBe(true);
    expect(delayedBatch.deliveryDeltaMs).toBeCloseTo(8.5, 5);

    tracker.recordBatchCost(7.4);
    const afterHeavyFrame = tracker.observeDelivery({ nowMs: 112, sampleCount: 3 });
    expect(afterHeavyFrame.tightBudget).toBe(true);
    expect(afterHeavyFrame.lastBatchCostMs).toBeCloseTo(7.4, 5);
  });

  it("일직선 등속·등압 구간의 240Hz 과밀 중복 샘플을 무손실 병합하고 시작점·끝점을 보존한다", () => {
    const samples: MockCoalescedSample[] = Array.from({ length: 13 }, (_, idx) => ({
      x: 10 + idx * 1.2,
      y: 20 + idx * 0.6,
      pressure: 0.5,
      timeStamp: 100 + idx * 4.16,
    }));

    const result = decimateStudioCoalescedPointerBatch(samples, identityMapper, {
      tightBudget: true,
      coordinateScale: 1,
    });

    expect(result.droppedCount).toBeGreaterThanOrEqual(8);
    expect(result.entries[0]?.originalIndex).toBe(0);
    expect(result.entries.at(-1)?.originalIndex).toBe(samples.length - 1);
    expect(getStudioDrawingStabilityTelemetrySnapshot().coalescedSamplesDecimated).toBe(
      result.droppedCount,
    );
  });

  it("방향 전환각 >= 18°인 코너 포인트를 단 하나도 빠뜨리지 않고 100% 보존한다", () => {
    expect(STUDIO_COALESCED_CORNER_PRESERVE_DEG).toBe(18);
    // (0,0) -> (12,0) 수평 진행 후 정확히 20° 꺾여 진행, 다시 65° 지그재그 코너 형성
    const rad20 = (20 * Math.PI) / 180;
    const corner1X = 12;
    const corner1Y = 0;
    const afterCorner1X = corner1X + Math.cos(rad20) * 6;
    const afterCorner1Y = corner1Y + Math.sin(rad20) * 6;
    const corner2X = corner1X + Math.cos(rad20) * 12;
    const corner2Y = corner1Y + Math.sin(rad20) * 12;

    const samples: MockCoalescedSample[] = [
      { x: 0, y: 0, pressure: 0.5, timeStamp: 0 },
      { x: 3, y: 0, pressure: 0.5, timeStamp: 4 },
      { x: 6, y: 0, pressure: 0.5, timeStamp: 8 },
      { x: 9, y: 0, pressure: 0.5, timeStamp: 12 },
      // index 4: 20° 코너 (>= 18°) -> 반드시 보존!
      { x: corner1X, y: corner1Y, pressure: 0.5, timeStamp: 16 },
      { x: afterCorner1X, y: afterCorner1Y, pressure: 0.5, timeStamp: 20 },
      // index 6: 급격한 지그재그 코너 -> 반드시 보존!
      { x: corner2X, y: corner2Y, pressure: 0.5, timeStamp: 24 },
      { x: corner2X + 4, y: corner2Y - 8, pressure: 0.5, timeStamp: 28 },
      { x: corner2X + 8, y: corner2Y - 16, pressure: 0.5, timeStamp: 32 },
    ];

    const result = decimateStudioCoalescedPointerBatch(samples, identityMapper, {
      tightBudget: true,
      coordinateScale: 1,
    });

    const keptIndices = result.entries.map((entry) => entry.originalIndex);
    expect(keptIndices).toContain(0);
    expect(keptIndices).toContain(4);
    expect(keptIndices).toContain(6);
    expect(keptIndices).toContain(8);
    // 수평 직선 구간(1, 2, 3) 등 공선 중복 포인트는 데시메이션된다.
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.preservedCornerCount).toBeGreaterThanOrEqual(2);
  });

  it("완전한 일직선 위에서도 필압 변곡점(피크·밸리)과 기울기 급변점은 100% 보존한다", () => {
    const samples: MockCoalescedSample[] = [
      { x: 0, y: 10, pressure: 0.3, tiltX: 0, timeStamp: 0 },
      { x: 2, y: 10, pressure: 0.3, tiltX: 0, timeStamp: 4 },
      // index 2: 필압 피크 변곡점 (0.3 -> 0.82 -> 0.31)
      { x: 4, y: 10, pressure: 0.82, tiltX: 0, timeStamp: 8 },
      { x: 6, y: 10, pressure: 0.31, tiltX: 0, timeStamp: 12 },
      { x: 8, y: 10, pressure: 0.31, tiltX: 0, timeStamp: 16 },
      // index 5: 필압 밸리 변곡점 (0.31 -> 0.12 -> 0.32)
      { x: 10, y: 10, pressure: 0.12, tiltX: 0, timeStamp: 20 },
      { x: 12, y: 10, pressure: 0.32, tiltX: 0, timeStamp: 24 },
      // index 7: 스타일러스 기울기 변화 (0° -> 12°)
      { x: 14, y: 10, pressure: 0.32, tiltX: 12, timeStamp: 28 },
      { x: 16, y: 10, pressure: 0.32, tiltX: 12, timeStamp: 32 },
    ];

    const result = decimateStudioCoalescedPointerBatch(samples, identityMapper, {
      tightBudget: true,
      coordinateScale: 1,
    });

    const keptIndices = result.entries.map((entry) => entry.originalIndex);
    expect(keptIndices).toContain(2);
    expect(keptIndices).toContain(5);
    expect(keptIndices).toContain(7);
    expect(result.preservedPressureExtremaCount).toBeGreaterThanOrEqual(2);
  });

  it("프레임 예산이 넉넉하거나 bypass 옵션이 켜져 있으면 모든 샘플을 무변형 통과시킨다", () => {
    const samples: MockCoalescedSample[] = Array.from({ length: 6 }, (_, idx) => ({
      x: idx * 2,
      y: 0,
      pressure: 0.5,
      timeStamp: idx * 8,
    }));

    const calmResult = decimateStudioCoalescedPointerBatch(samples, identityMapper, {
      tightBudget: false,
    });
    expect(calmResult.droppedCount).toBe(0);
    expect(calmResult.entries).toHaveLength(6);

    const bypassResult = decimateStudioCoalescedPointerBatch(samples, identityMapper, {
      tightBudget: true,
      bypass: true,
    });
    expect(bypassResult.droppedCount).toBe(0);
    expect(bypassResult.entries).toHaveLength(6);
  });
});
