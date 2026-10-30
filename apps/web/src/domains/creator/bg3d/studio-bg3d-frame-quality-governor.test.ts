import { describe, expect, it } from "vitest";

import {
  advanceStudioBg3dFrameQuality,
  createStudioBg3dFrameQualityState,
} from "./studio-bg3d-frame-quality-governor";

function samples(
  count: number,
  deltaSeconds: number,
  initial = createStudioBg3dFrameQualityState(60),
) {
  let state = initial;
  for (let index = 0; index < count; index += 1) {
    state = advanceStudioBg3dFrameQuality(state, { deltaSeconds, targetFps: 60, resolutionPolicy: "adaptive" });
  }
  return state;
}

describe("Studio BG3D frame quality governor", () => {
  it("degrades only after sustained overload and observes a cooldown", () => {
    expect(samples(40, 1 / 24).dprScale).toBe(1);
    const degraded = samples(80, 1 / 24);
    expect(degraded).toMatchObject({ dprStepIndex: 1, dprScale: 0.85 });
    expect(degraded.cooldownSamples).toBeGreaterThan(0);
    expect(samples(60, 1 / 15, degraded).dprStepIndex).toBe(1);
  });

  it("recovers much more slowly than it degrades", () => {
    const degraded = samples(80, 1 / 24);
    const shortHeadroom = samples(250, 1 / 120, degraded);
    expect(shortHeadroom.dprStepIndex).toBe(1);
    expect(samples(200, 1 / 120, shortHeadroom)).toMatchObject({
      dprStepIndex: 0,
      dprScale: 1,
    });
  });

  it("ignores resume outliers and pauses counters during capture", () => {
    const initial = samples(20, 1 / 24);
    expect(advanceStudioBg3dFrameQuality(initial, {
      deltaSeconds: 2,
      targetFps: 60,
      resolutionPolicy: "adaptive",
    })).toMatchObject({ dprScale: 1, overloadSamples: 0, reason: "outlier-ignored" });
    expect(advanceStudioBg3dFrameQuality(initial, {
      deltaSeconds: 1 / 24,
      targetFps: 60,
      paused: true,
      resolutionPolicy: "adaptive",
    })).toMatchObject({ overloadSamples: 0, headroomSamples: 0, reason: "paused" });
  });

  it("기본 정책은 장기 과부하에서도 해상도와 입력 상태를 보존하고 프레임 계측을 유지한다", () => {
    const initial = createStudioBg3dFrameQualityState(60), before = JSON.stringify(initial);
    let state = initial;
    for (let index = 0; index < 5_000; index += 1) {
      state = advanceStudioBg3dFrameQuality(state, { deltaSeconds: 1 / 15, targetFps: 60 });
    }
    expect(state).toMatchObject({ dprStepIndex: 0, dprScale: 1, acceptedSamples: 5_000,
      overloadSamples: 0, headroomSamples: 0, cooldownSamples: 0, reason: "stable" });
    expect(state.smoothedFrameMs).toBeCloseTo(1_000 / 15, 8);
    expect(JSON.stringify(initial)).toBe(before); expect(Object.isFrozen(state)).toBe(true);
  });

  it("명시적 preserve도 이전 저하 상태를 즉시 복원하며 유효 프레임 계측을 계속한다", () => {
    const degraded = samples(80, 1 / 24), before = JSON.stringify(degraded);
    const restored = advanceStudioBg3dFrameQuality(degraded, { deltaSeconds: 1 / 24, targetFps: 60, resolutionPolicy: "preserve" });
    expect(restored).toMatchObject({ dprStepIndex: 0, dprScale: 1, acceptedSamples: degraded.acceptedSamples + 1,
      overloadSamples: 0, headroomSamples: 0, cooldownSamples: 0, reason: "recovered" });
    expect(restored.smoothedFrameMs).toBeGreaterThan(40); expect(JSON.stringify(degraded)).toBe(before);
  });

  it.each([80, 200, 400])("기본 preserve는 adaptive %s회로 생긴 모든 저하 단계에서 scale1로 복원한다", (count) => {
    const degraded = samples(count, 1 / 24), before = JSON.stringify(degraded);
    expect(degraded.dprScale).toBeLessThan(1);
    const restored = advanceStudioBg3dFrameQuality(degraded, { deltaSeconds: 1 / 24, targetFps: 60 });
    expect(restored).toMatchObject({ dprStepIndex: 0, dprScale: 1, cooldownSamples: 0, reason: "recovered" });
    expect(restored.acceptedSamples).toBe(degraded.acceptedSamples + 1); expect(JSON.stringify(degraded)).toBe(before);
  });

  it("capture pause에서도 이전 저하 해상도를 복원하되 계측 표본을 추가하지 않는다", () => {
    const degraded = samples(80, 1 / 24), before = JSON.stringify(degraded);
    expect(advanceStudioBg3dFrameQuality(degraded, { deltaSeconds: 1 / 24, targetFps: 60, paused: true }))
      .toMatchObject({ dprStepIndex: 0, dprScale: 1, acceptedSamples: degraded.acceptedSamples,
        smoothedFrameMs: degraded.smoothedFrameMs, overloadSamples: 0, headroomSamples: 0, cooldownSamples: 0, reason: "paused" });
    expect(JSON.stringify(degraded)).toBe(before);
  });

  it.each([2, 0, Number.NaN])("outlier %s에서도 이전 저하 해상도를 복원하고 오래된 frame 통계를 보존한다", (deltaSeconds) => {
    const degraded = samples(80, 1 / 24), before = JSON.stringify(degraded);
    expect(advanceStudioBg3dFrameQuality(degraded, { deltaSeconds, targetFps: 60 }))
      .toMatchObject({ dprStepIndex: 0, dprScale: 1, acceptedSamples: degraded.acceptedSamples,
        smoothedFrameMs: degraded.smoothedFrameMs, overloadSamples: 0, headroomSamples: 0, cooldownSamples: 0, reason: "outlier-ignored" });
    expect(JSON.stringify(degraded)).toBe(before);
  });

  it("명시적 adaptive는 세 번의 저하 단계와 느린 회복 알고리즘을 그대로 유지한다", () => {
    const degraded = samples(1_000, 1 / 24);
    expect(degraded).toMatchObject({ dprStepIndex: 3, dprScale: 0.55 });
    expect(samples(2_000, 1 / 120, degraded)).toMatchObject({ dprStepIndex: 0, dprScale: 1 });
  });
});
