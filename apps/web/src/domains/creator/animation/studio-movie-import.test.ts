import { describe, expect, it, vi } from "vitest";

import {
  extractVideoFramesWithAdapter,
  planMovieToCelImport,
  type VideoFrameDecodeAdapter,
} from "./studio-movie-import";

describe("studio-movie-import — 동영상 셀 가져오기 플래너 및 어댑터 추출", () => {
  it("원본 FPS를 목표 타임라인 FPS로 매핑하고 트림 구간·상한 경고를 생성한다", () => {
    const plan = planMovieToCelImport({
      sourceDurationSec: 10,
      sourceFps: 30,
      targetTimelineFps: 12,
      inSec: 1,
      outSec: 8,
      maxFramesCap: 24,
      celNamePrefix: "cut01_",
      startTimelineFrame: 4,
    });

    // 7초 * 12fps = 84장 요청이나 상한 24장으로 절단됨
    expect(plan.trimInSec).toBe(1);
    expect(plan.trimOutSec).toBe(8);
    expect(plan.requestedFrameCount).toBe(84);
    expect(plan.truncatedByCap).toBe(true);
    expect(plan.plannedCels).toHaveLength(24);
    expect(plan.warnings.some((w) => w.includes("최대 프레임 한도"))).toBe(true);

    expect(plan.plannedCels[0]).toEqual({
      index: 0,
      celId: "cut01_0001",
      celName: "cut01_0001",
      timelineFrame: 4,
      sampleTimeSec: 1,
      sourceFrameIndex: 30,
    });
    expect(plan.plannedCels[6]!.sampleTimeSec).toBeCloseTo(1.5, 5);
    expect(plan.plannedCels[6]!.sourceFrameIndex).toBe(45);
  });

  it("extractVideoFramesWithAdapter로 프레임을 비동기 추출하며 동일 원본 프레임을 캐시하고 close를 보장한다", async () => {
    // 1초 4fps 원본을 8fps 타임라인으로 가져오면 8장 중 고유 원본 프레임은 4장뿐이다.
    const plan = planMovieToCelImport({
      sourceDurationSec: 1,
      sourceFps: 4,
      targetTimelineFps: 8,
      maxFramesCap: 60,
    });
    expect(plan.plannedCels).toHaveLength(8);
    expect(plan.warnings.some((w) => w.includes("반복 노출"))).toBe(true);

    const decodeCalls: number[] = [];
    const closeSpy = vi.fn();
    const adapter: VideoFrameDecodeAdapter = {
      decodeFrameAt: vi.fn(async (_timeSec, sourceFrameIndex) => {
        decodeCalls.push(sourceFrameIndex);
        return {
          src: `data:image/png;base64,src_${sourceFrameIndex}`,
          width: 1280,
          height: 720,
        };
      }),
      close: closeSpy,
    };

    const progressSteps: [number, number][] = [];
    const result = await extractVideoFramesWithAdapter(plan, adapter, {
      onProgress: (done, total) => progressSteps.push([done, total]),
    });

    expect(result.frames).toHaveLength(8);
    expect(result.keyframes).toHaveLength(8);
    expect(result.decodedUniqueSourceFrames).toBe(4);
    expect(decodeCalls).toEqual([0, 1, 2, 3]);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(progressSteps.at(-1)).toEqual([8, 8]);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it("AbortSignal 취소 시 즉시 중단하고 adapter.close를 호출한다", async () => {
    const plan = planMovieToCelImport({
      sourceDurationSec: 2,
      sourceFps: 12,
      targetTimelineFps: 12,
    });
    const controller = new AbortController();
    controller.abort();
    const closeSpy = vi.fn();
    const adapter: VideoFrameDecodeAdapter = {
      decodeFrameAt: vi.fn(async () => ({ src: "data:x", width: 100, height: 100 })),
      close: closeSpy,
    };

    await expect(
      extractVideoFramesWithAdapter(plan, adapter, { signal: controller.signal }),
    ).rejects.toThrow("취소");
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
