import { describe, expect, it } from "vitest";

import { DEFAULT_FRAMING } from "../contracts";

import { DEFAULT_VERTICAL_FOV, FALLBACK_BOUNDS, resolveFraming } from "./camera-framing";
import {
  KEYBOARD_ORBIT_STEP_RAD,
  ORBIT_LOWER_HEIGHT_RATIO,
  ORBIT_PAN_MARGIN_RATIO,
  WHEEL_MAX_NOTCHES_PER_EVENT,
  WHEEL_ZOOM_PER_NOTCH,
  clampPanTarget,
  keyboardOrbitAction,
  resolveOrbitLimits,
  screenPanOffset,
  wheelZoomRadius,
} from "./viewport-orbit";

import type { WorldBounds } from "./camera-framing";
import type { CameraFraming } from "../contracts";

/** 키 1.65 m 인체 bbox(A 포즈, 팔 포함 폭 0.6 m) */
const BODY: WorldBounds = { min: [-0.3, 0, -0.15], max: [0.3, 1.65, 0.15] };
const MODES: ReadonlyArray<CameraFraming["mode"]> = ["full-body", "bust", "face"];

describe("render/viewport-orbit 궤도 한계(F-01)", () => {
  it("얼굴 프레이밍의 최소 거리는 머리 안으로 들어가지 않는다(키 × 0.15, 이전 고정 0.15 m보다 멀다)", () => {
    const limits = resolveOrbitLimits({ ...DEFAULT_FRAMING, mode: "face" }, BODY);
    expect(limits.lowerRadius).toBeCloseTo(1.65 * ORBIT_LOWER_HEIGHT_RATIO, 6);
    expect(limits.lowerRadius).toBeGreaterThan(0.15);
    // 머리 중심 → 코끝(약 0.1 m) + 근평면(0.05 m)보다 멀다
    expect(limits.lowerRadius).toBeGreaterThan(0.15 + 0.02);
  });

  it("세 프레이밍 모두 프레이밍 반경이 [하한, 상한] 안이다(캡처 카메라에 걸어도 결과가 바뀌지 않는다)", () => {
    for (const mode of MODES) {
      for (const distanceScale of [0.1, 1, 10]) {
        const framing = { ...DEFAULT_FRAMING, mode, distanceScale };
        const limits = resolveOrbitLimits(framing, BODY, DEFAULT_VERTICAL_FOV, 1.4);
        const radius = resolveFraming(framing, BODY, DEFAULT_VERTICAL_FOV, 1.4).radius;
        expect(limits.lowerRadius).toBeLessThanOrEqual(radius + 1e-9);
        expect(limits.upperRadius).toBeGreaterThanOrEqual(radius - 1e-9);
      }
    }
  });

  it("최대 거리는 전신 프레이밍 거리의 2.5배(모드와 무관)이고 팬 범위는 캐릭터 경계 상자를 키 × 5 %만큼 넓힌 것이다", () => {
    const full = resolveFraming({ ...DEFAULT_FRAMING, mode: "full-body" }, BODY).radius;
    const margin = 1.65 * ORBIT_PAN_MARGIN_RATIO;
    for (const mode of MODES) {
      const limits = resolveOrbitLimits({ ...DEFAULT_FRAMING, mode }, BODY);
      expect(limits.upperRadius).toBeCloseTo(full * 2.5, 6);
      expect(limits.panBounds.min[0]).toBeCloseTo(-0.3 - margin, 9);
      expect(limits.panBounds.min[1]).toBeCloseTo(-margin, 9);
      expect(limits.panBounds.max[1]).toBeCloseTo(1.65 + margin, 9);
      expect(limits.panBounds.max[2]).toBeCloseTo(0.15 + margin, 9);
    }
    // bbox가 없을 때(소스 전)도 같은 규칙(1.7 m 인체)
    expect(resolveOrbitLimits(DEFAULT_FRAMING).panBounds.max[1]).toBeCloseTo(FALLBACK_BOUNDS.max[1] + (FALLBACK_BOUNDS.max[1] - FALLBACK_BOUNDS.min[1]) * ORBIT_PAN_MARGIN_RATIO, 9);
  });
});

describe("render/viewport-orbit 휠 줌(F-01)", () => {
  const limits = { lowerRadius: 0.2, upperRadius: 6 };

  it("휠 한 칸(deltaY ±100 px)은 반경을 정확히 ±12 % 바꾼다(관성 누적 없음)", () => {
    expect(wheelZoomRadius(1, 100, 0, limits)).toBeCloseTo(1 + WHEEL_ZOOM_PER_NOTCH, 9);
    expect(wheelZoomRadius(1, -100, 0, limits)).toBeCloseTo(1 / (1 + WHEEL_ZOOM_PER_NOTCH), 9);
    // 왕복하면 제자리
    expect(wheelZoomRadius(wheelZoomRadius(1, 100, 0, limits), -100, 0, limits)).toBeCloseTo(1, 9);
  });

  it("트랙패드의 작은 델타는 비례하고, 줄·페이지 단위(deltaMode 1·2)는 픽셀로 환산한다", () => {
    const tenSmall = Array.from({ length: 25 }).reduce<number>((radius) => wheelZoomRadius(radius, 4, 0, limits), 1);
    expect(tenSmall).toBeCloseTo(wheelZoomRadius(1, 100, 0, limits), 9);
    expect(wheelZoomRadius(1, 3, 1, limits)).toBeCloseTo(1 + WHEEL_ZOOM_PER_NOTCH, 9);
    expect(wheelZoomRadius(1, 1, 2, { lowerRadius: 0.01, upperRadius: 100 })).toBeCloseTo(Math.pow(1 + WHEEL_ZOOM_PER_NOTCH, WHEEL_MAX_NOTCHES_PER_EVENT), 9);
  });

  it("한 이벤트는 최대 3칸이고 결과는 하한·상한으로 묶인다(입 속·점 방지)", () => {
    expect(wheelZoomRadius(1, 10_000, 0, { lowerRadius: 0.01, upperRadius: 100 })).toBeCloseTo(Math.pow(1.12, 3), 9);
    // 하한 바로 위에서 한 칸 더 들어가면 하한에서 멈춘다(0.21 ÷ 1.12 = 0.1875 → 0.2)
    expect(wheelZoomRadius(0.21, -100, 0, limits)).toBe(0.2);
    let radius = 0.54;
    for (let notch = 0; notch < 40; notch += 1) radius = wheelZoomRadius(radius, -100, 0, limits);
    expect(radius).toBe(0.2);
    for (let notch = 0; notch < 80; notch += 1) radius = wheelZoomRadius(radius, 100, 0, limits);
    expect(radius).toBe(6);
    expect(wheelZoomRadius(Number.NaN, 100, 0, limits)).toBe(0.2);
    expect(wheelZoomRadius(1, Number.NaN, 0, limits)).toBe(1);
  });
});

describe("render/viewport-orbit 팬(F-01)", () => {
  it("화면 고정: 타깃 깊이에서 끈 픽셀만큼 움직인다(높이 800 px·반경 2 m·fov 0.8)", () => {
    const offset = screenPanOffset(300, 0, 2, 0.8, 800);
    const metersPerPixel = (2 * 2 * Math.tan(0.4)) / 800;
    expect(offset.right).toBeCloseTo(-300 * metersPerPixel, 9);
    expect(offset.up).toBe(0);
    // 300 px 드래그 = 화면 폭의 일부만큼(관성 10배 누적 없음): 1 m 미만
    expect(Math.abs(offset.right)).toBeLessThan(1);
    expect(screenPanOffset(0, -100, 2, 0.8, 800).up).toBeCloseTo(-100 * metersPerPixel, 9);
    expect(screenPanOffset(10, 10, 2, 0.8, 0)).toEqual({ right: 0, up: 0 });
  });

  it("팬 타깃은 팬 범위(캐릭터 경계 상자) 안으로 축마다 잘린다 — 화면 중심이 캐릭터를 벗어나지 않는다", () => {
    expect(clampPanTarget([0.1, 1, 0], BODY)).toEqual([0.1, 1, 0]);
    expect(clampPanTarget([3, -2, 4], BODY)).toEqual([0.3, 0, 0.15]);
    expect(clampPanTarget([-3, 9, -4], BODY)).toEqual([-0.3, 1.65, -0.15]);
  });
});

describe("render/viewport-orbit 키보드(H-03)", () => {
  it("방향키는 5° 회전(Shift 3배), +/- 줌, 0·Home 초기화이고 수정 키 조합은 양보한다", () => {
    expect(keyboardOrbitAction("ArrowLeft")).toEqual({ kind: "orbit", alpha: -KEYBOARD_ORBIT_STEP_RAD, beta: 0 });
    expect(keyboardOrbitAction("ArrowRight", { shift: true })).toEqual({ kind: "orbit", alpha: KEYBOARD_ORBIT_STEP_RAD * 3, beta: 0 });
    expect(keyboardOrbitAction("ArrowUp")).toEqual({ kind: "orbit", alpha: 0, beta: -KEYBOARD_ORBIT_STEP_RAD });
    expect(keyboardOrbitAction("ArrowDown")).toEqual({ kind: "orbit", alpha: 0, beta: KEYBOARD_ORBIT_STEP_RAD });
    expect(keyboardOrbitAction("+")).toEqual({ kind: "zoom", notches: -1 });
    expect(keyboardOrbitAction("=")).toEqual({ kind: "zoom", notches: -1 });
    expect(keyboardOrbitAction("-")).toEqual({ kind: "zoom", notches: 1 });
    expect(keyboardOrbitAction("0")).toEqual({ kind: "reset" });
    expect(keyboardOrbitAction("Home")).toEqual({ kind: "reset" });
    expect(keyboardOrbitAction("ArrowLeft", { ctrl: true })).toBeNull();
    expect(keyboardOrbitAction("+", { meta: true })).toBeNull();
    expect(keyboardOrbitAction("a")).toBeNull();
  });
});
