import { describe, expect, it } from "vitest";

import {
  FUNCTION_CURVE_CHANNELS,
  computeFritschCarlsonTangents,
  createEmptyFunctionCurveChannel,
  createMultiChannelFunctionCurveSet,
  evaluateFunctionCurveChannel,
  evaluateMultiChannelFunctionCurves,
  mapNamedEaseToSegmentHandles,
  matchNamedEaseFromSegmentHandles,
  removeFunctionCurveKeyframe,
  snapFunctionCurvePoint,
  solveCubicBezierParameterForX,
  updateFunctionCurveHandle,
  upsertFunctionCurveKeyframe,
} from "./studio-function-curve";

import type { StudioAnimEase } from "../studio-anim-tracks";

describe("studio-function-curve — 다중 채널 함수 곡선 편집기", () => {
  it("constant, linear, smooth(Fritsch-Carlson 단조 3차) 보간을 정확히 평가하고 오버슈트를 방지한다", () => {
    expect(FUNCTION_CURVE_CHANNELS).toEqual([
      "x",
      "y",
      "scaleX",
      "scaleY",
      "rotationDeg",
      "opacity",
    ]);

    // 단조 증가 후 평탄 구간이 있는 키프레임: Fritsch-Carlson이 [0, 100] 범위를 절대 넘지 않아야 한다.
    let ch = createEmptyFunctionCurveChannel("x", 0);
    ch = upsertFunctionCurveKeyframe(ch, {
      frame: 0,
      value: 0,
      interpolation: "smooth",
      handleMode: "auto-monotone",
    });
    ch = upsertFunctionCurveKeyframe(ch, {
      frame: 10,
      value: 100,
      interpolation: "smooth",
      handleMode: "auto-monotone",
    });
    ch = upsertFunctionCurveKeyframe(ch, {
      frame: 20,
      value: 100,
      interpolation: "constant",
      handleMode: "auto-monotone",
    });
    ch = upsertFunctionCurveKeyframe(ch, {
      frame: 30,
      value: 50,
      interpolation: "linear",
      handleMode: "auto-monotone",
    });

    const tangents = computeFritschCarlsonTangents(ch.keyframes);
    // 평탄 구간(10~20f, value=100) 시작점의 접선은 0이어야 오버슈트가 없다.
    expect(tangents[1]).toBe(0);

    let prev = -Infinity;
    for (let f = 0; f <= 10; f += 0.5) {
      const val = evaluateFunctionCurveChannel(ch, f);
      expect(val).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(val).toBeLessThanOrEqual(100 + 1e-9);
      prev = val;
    }

    // 20~30f는 constant 보간이므로 29.9f에서도 100 유지, 30f에서 50 도달
    expect(evaluateFunctionCurveChannel(ch, 25)).toBe(100);
    expect(evaluateFunctionCurveChannel(ch, 30)).toBe(50);

    const removed = removeFunctionCurveKeyframe(ch, 20);
    expect(removed.keyframes).toHaveLength(3);
  });

  it("Newton-Raphson + 이분법 x(u) 솔버가 비대칭 베지어 시간축을 1e-6 정밀도로 역산한다", () => {
    const x0 = 0;
    const x1 = 9.5;
    const x2 = 9.9;
    const x3 = 10;
    for (const targetX of [0, 0.25, 2.5, 5, 8.75, 9.99, 10]) {
      const u = solveCubicBezierParameterForX(x0, x1, x2, x3, targetX);
      const inv = 1 - u;
      const reconstructed =
        inv * inv * inv * x0 +
        3 * inv * inv * u * x1 +
        3 * inv * u * u * x2 +
        u * u * u * x3;
      expect(reconstructed).toBeCloseTo(targetX, 5);
    }
  });

  it("linked 핸들은 좌우 접선 기울기를 공선(collinear) 연동하고 broken 핸들은 독립 조작된다", () => {
    let ch = createEmptyFunctionCurveChannel("y", 0);
    for (const [frame, value] of [
      [0, 0],
      [12, 60],
      [24, 20],
    ] as const) {
      ch = upsertFunctionCurveKeyframe(ch, {
        frame,
        value,
        interpolation: "smooth",
        handleMode: "linked",
      });
    }

    // 12f 키프레임의 outHandle을 (dx=4, dy=20, 기울기 +5)로 변경 → linked이므로 inHandle 기울기도 +5
    ch = updateFunctionCurveHandle(ch, 12, "out", { dx: 4, dy: 20 }, "linked");
    const linkedKf = ch.keyframes[1]!;
    expect(linkedKf.outHandle).toEqual({ dx: 4, dy: 20 });
    expect(linkedKf.inHandle!.dy / linkedKf.inHandle!.dx).toBeCloseTo(5, 6);

    // broken 모드로 inHandle만 꺾으면 outHandle은 그대로 유지된다
    ch = updateFunctionCurveHandle(ch, 12, "in", { dx: -3, dy: 30 }, "broken");
    const brokenKf = ch.keyframes[1]!;
    expect(brokenKf.handleMode).toBe("broken");
    expect(brokenKf.inHandle).toEqual({ dx: -3, dy: 30 });
    expect(brokenKf.outHandle).toEqual({ dx: 4, dy: 20 });
  });

  it("X/Y 격자 스냅과 기존 StudioAnimEase 명명 프리셋 4종의 무손실 왕복 변환을 보장한다", () => {
    expect(
      snapFunctionCurvePoint({ frame: 3.74, value: 14.3 }, { frameStep: 1, valueStep: 5 }),
    ).toEqual({ frame: 4, value: 15 });

    const presets: readonly StudioAnimEase[] = [
      "linear",
      "ease-in",
      "ease-out",
      "ease-in-out",
    ];
    for (const ease of presets) {
      const mapped = mapNamedEaseToSegmentHandles(ease, 0, 10, 24, 110);
      const k0 = {
        frame: 0,
        value: 10,
        interpolation: mapped.interpolation,
        handleMode: "linked" as const,
        outHandle: mapped.outHandle,
      };
      const k1 = {
        frame: 24,
        value: 110,
        interpolation: "linear" as const,
        handleMode: "linked" as const,
        inHandle: mapped.nextInHandle,
      };
      expect(matchNamedEaseFromSegmentHandles(k0, k1)).toBe(ease);
    }

    const multi = createMultiChannelFunctionCurveSet();
    const pose = evaluateMultiChannelFunctionCurves(multi, 5);
    expect(pose).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      opacity: 1,
    });
  });
});
