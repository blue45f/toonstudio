import { describe, expect, it } from "vitest";

import {
  applyMotionEasing,
  bezierEasing,
  buildEasingCurvePath,
  cubicBezierPoint,
  HOLD_EASING,
  LINEAR_EASING,
  MOTION_EASING_PRESETS,
  motionEasingPreset,
  motionEasingToCss,
  resolveMotionEasing,
  solveCubicBezierY,
} from "./motion-webtoon-easing";

describe("applyMotionEasing — linear/hold", () => {
  it("linear는 입력 그대로다", () => {
    expect(applyMotionEasing(LINEAR_EASING, 0)).toBe(0);
    expect(applyMotionEasing(LINEAR_EASING, 0.37)).toBeCloseTo(0.37, 10);
    expect(applyMotionEasing(LINEAR_EASING, 1)).toBe(1);
  });

  it("hold는 구간 끝(t=1)까지 0, 끝에서 1로 점프한다", () => {
    expect(applyMotionEasing(HOLD_EASING, 0)).toBe(0);
    expect(applyMotionEasing(HOLD_EASING, 0.5)).toBe(0);
    expect(applyMotionEasing(HOLD_EASING, 0.999)).toBe(0);
    expect(applyMotionEasing(HOLD_EASING, 1)).toBe(1);
  });

  it("범위 밖 입력은 [0,1]로 눌러 해석한다", () => {
    expect(applyMotionEasing(LINEAR_EASING, -0.5)).toBe(0);
    expect(applyMotionEasing(LINEAR_EASING, 1.5)).toBe(1);
    expect(applyMotionEasing(HOLD_EASING, 2)).toBe(1);
    expect(applyMotionEasing(LINEAR_EASING, Number.NaN)).toBe(0);
  });
});

describe("solveCubicBezierY — 베지어 해법", () => {
  it("양 끝점은 정확히 0과 1이다", () => {
    const curve = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
    expect(solveCubicBezierY(curve, 0)).toBe(0);
    expect(solveCubicBezierY(curve, 1)).toBe(1);
  });

  it("대칭 곡선(ease-in-out)은 중간점에서 0.5를 지난다", () => {
    const curve = { x1: 0.42, y1: 0, x2: 0.58, y2: 1 };
    expect(solveCubicBezierY(curve, 0.5)).toBeCloseTo(0.5, 5);
  });

  it("대각선 제어점(0,0,1,1)은 항등 함수다", () => {
    const curve = { x1: 0, y1: 0, x2: 1, y2: 1 };
    for (const x of [0.1, 0.3, 0.5, 0.77, 0.9]) {
      expect(solveCubicBezierY(curve, x)).toBeCloseTo(x, 4);
    }
  });

  it("ease-in은 전반부에서 선형보다 느리고, ease-out은 빠르다", () => {
    const easeIn = { x1: 0.42, y1: 0, x2: 1, y2: 1 };
    const easeOut = { x1: 0, y1: 0, x2: 0.58, y2: 1 };
    expect(solveCubicBezierY(easeIn, 0.25)).toBeLessThan(0.25);
    expect(solveCubicBezierY(easeOut, 0.25)).toBeGreaterThan(0.25);
  });

  it("단조 곡선은 단조 비내림 결과를 낸다", () => {
    const curve = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 };
    let prev = -Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const y = solveCubicBezierY(curve, i / 20);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });

  it("cubicBezierPoint와 solve가 서로 정합한다 (역함수 관계)", () => {
    const curve = { x1: 0.55, y1: 0.055, x2: 0.675, y2: 0.19 };
    for (const t of [0.15, 0.4, 0.65, 0.9]) {
      const point = cubicBezierPoint(curve, t);
      expect(solveCubicBezierY(curve, point.x)).toBeCloseTo(point.y, 4);
    }
  });

  it("ease-out-back은 중간 이후 1을 overshoot한다", () => {
    const back = bezierEasing(0.34, 1.56, 0.64, 1);
    expect(applyMotionEasing(back, 0.7)).toBeGreaterThan(1);
    expect(applyMotionEasing(back, 1)).toBeCloseTo(1, 6);
  });
});

describe("프리셋 세트", () => {
  it("모든 프리셋 ID가 유일하고 조회된다", () => {
    const ids = MOTION_EASING_PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of MOTION_EASING_PRESETS) {
      expect(motionEasingPreset(preset.id)).toBe(preset);
    }
  });

  it("bezier 프리셋의 제어점 x는 [0,1] 범위다 (함수 보장)", () => {
    for (const preset of MOTION_EASING_PRESETS) {
      if (preset.easing.kind !== "bezier") continue;
      expect(preset.easing.curve.x1).toBeGreaterThanOrEqual(0);
      expect(preset.easing.curve.x1).toBeLessThanOrEqual(1);
      expect(preset.easing.curve.x2).toBeGreaterThanOrEqual(0);
      expect(preset.easing.curve.x2).toBeLessThanOrEqual(1);
    }
  });

  it("미지정·미지의 ID는 기본 프리셋(ease-in-out)으로 떨어진다", () => {
    expect(resolveMotionEasing(undefined).kind).toBe("bezier");
    expect(motionEasingPreset(undefined).id).toBe("ease-in-out");
    expect(motionEasingPreset(null).id).toBe("ease-in-out");
  });

  it("모든 프리셋은 0→0, 1→1을 만족한다", () => {
    for (const preset of MOTION_EASING_PRESETS) {
      expect(applyMotionEasing(preset.easing, 0)).toBeCloseTo(0, 6);
      expect(applyMotionEasing(preset.easing, 1)).toBeCloseTo(1, 6);
    }
  });
});

describe("CSS·미리보기 표현", () => {
  it("motionEasingToCss가 kind별 CSS 타이밍 함수를 만든다", () => {
    expect(motionEasingToCss(LINEAR_EASING)).toBe("linear");
    expect(motionEasingToCss(HOLD_EASING)).toBe("steps(1, end)");
    expect(motionEasingToCss(bezierEasing(0.42, 0, 0.58, 1))).toBe("cubic-bezier(0.42, 0, 0.58, 1)");
  });

  it("커브 path는 왼쪽 아래(0,0 값)에서 시작해 오른쪽 위에서 끝난다", () => {
    const path = buildEasingCurvePath(LINEAR_EASING, 100, 60, 4);
    expect(path.startsWith("M 0.00 60.00")).toBe(true);
    expect(path.endsWith("L 100.00 0.00")).toBe(true);
    expect(path.split("L").length).toBe(5);
  });

  it("hold path는 끝점 전까지 바닥에 붙어 있다가 끝에서 솟는다", () => {
    expect(buildEasingCurvePath(HOLD_EASING, 100, 60, 2)).toBe("M 0.00 60.00 L 50.00 60.00 L 100.00 0.00");
  });
});
