// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  bindStudioVirtualThreeContextRecovery,
  isStudioVirtualThreeLowSpecConstrained,
  resolveStudioVirtualThreeRendererParams,
} from "./studio-virtual-space-three-renderer-recovery";

describe("studio-virtual-space-three-renderer-recovery", () => {
  it("모바일·저사양 신호(저메모리, 저코어, 데이터 절약, 좁은 터치 화면)를 감지한다", () => {
    expect(
      isStudioVirtualThreeLowSpecConstrained({
        deviceMemoryGb: 2,
        hardwareConcurrency: 8,
        coarsePointer: false,
        cssWidth: 1280,
      }),
    ).toBe(true);
    expect(
      isStudioVirtualThreeLowSpecConstrained({
        deviceMemoryGb: 8,
        hardwareConcurrency: 2,
        coarsePointer: false,
        cssWidth: 1280,
      }),
    ).toBe(true);
    expect(
      isStudioVirtualThreeLowSpecConstrained({
        deviceMemoryGb: 8,
        hardwareConcurrency: 8,
        coarsePointer: true,
        cssWidth: 390,
      }),
    ).toBe(true);
    expect(
      isStudioVirtualThreeLowSpecConstrained({
        deviceMemoryGb: 16,
        hardwareConcurrency: 8,
        saveData: false,
        coarsePointer: false,
        cssWidth: 1440,
      }),
    ).toBe(false);
  });

  it("품질 낮춰 다시 열기(low) 시 DPR=1, 안티앨리어싱·그림자·후처리 비활성화로 렌더러 부하를 낮춘다", () => {
    const standard = resolveStudioVirtualThreeRendererParams("standard", 2);
    expect(standard).toEqual({
      qualityMode: "standard",
      antialias: true,
      powerPreference: "high-performance",
      pixelRatio: 2,
      shadowsEnabled: true,
      shadowMapSize: 2048,
      usePostPipeline: true,
    });

    const low = resolveStudioVirtualThreeRendererParams("low", 3);
    expect(low).toEqual({
      qualityMode: "low",
      antialias: false,
      powerPreference: "low-power",
      pixelRatio: 1,
      shadowsEnabled: false,
      shadowMapSize: 512,
      usePostPipeline: false,
    });
  });

  it("webglcontextlost 시 preventDefault를 호출하고 복구/해제 생명주기를 지킨다", () => {
    const canvas = document.createElement("canvas");
    const onContextLost = vi.fn();
    const onContextRestored = vi.fn();
    const binding = bindStudioVirtualThreeContextRecovery(canvas, {
      onContextLost,
      onContextRestored,
    });

    const lostEvent = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(lostEvent);
    expect(lostEvent.defaultPrevented).toBe(true);
    expect(onContextLost).toHaveBeenCalledTimes(1);

    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(onContextRestored).toHaveBeenCalledTimes(1);

    binding.dispose();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(onContextLost).toHaveBeenCalledTimes(1);
  });
});
