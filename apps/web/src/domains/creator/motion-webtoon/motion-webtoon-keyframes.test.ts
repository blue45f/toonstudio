import { describe, expect, it } from "vitest";

import { bezierEasing, HOLD_EASING, LINEAR_EASING, type MotionEasing } from "./motion-webtoon-easing";
import {
  buildCameraKeyframes,
  cameraTransformCss,
  IDENTITY_TRANSFORM,
  sampleCameraTransform,
  sampleMotionKeyframes,
  type MotionKeyframe,
} from "./motion-webtoon-keyframes";
import { defaultCutDirection, type CutDirection } from "./motion-webtoon-model";

function kf(atSeconds: number, easing: MotionEasing, values: Partial<MotionKeyframe["values"]>): MotionKeyframe {
  return { atSeconds, easing, values: { ...IDENTITY_TRANSFORM, ...values } };
}

describe("sampleMotionKeyframes — 보간 코어", () => {
  const track: MotionKeyframe[] = [
    kf(0, LINEAR_EASING, { x: 0, scale: 1, opacity: 1 }),
    kf(2, LINEAR_EASING, { x: 10, scale: 2, opacity: 0.5 }),
    kf(4, LINEAR_EASING, { x: 10, scale: 2, opacity: 0.5 }),
  ];

  it("빈 트랙은 항등 변환이다", () => {
    expect(sampleMotionKeyframes([], 1)).toEqual(IDENTITY_TRANSFORM);
  });

  it("양끝 밖은 첫/마지막 값으로 클램프한다", () => {
    expect(sampleMotionKeyframes(track, -3).x).toBe(0);
    expect(sampleMotionKeyframes(track, 99).x).toBe(10);
    expect(sampleMotionKeyframes(track, 4).scale).toBe(2);
  });

  it("구간 중간은 채널별로 선형 보간한다", () => {
    const mid = sampleMotionKeyframes(track, 1);
    expect(mid.x).toBeCloseTo(5, 10);
    expect(mid.scale).toBeCloseTo(1.5, 10);
    expect(mid.opacity).toBeCloseTo(0.75, 10);
    expect(mid.rotationDeg).toBe(0);
  });

  it("값이 같은 구간은 내내 같은 값이다", () => {
    expect(sampleMotionKeyframes(track, 3).x).toBe(10);
  });

  it("정렬되지 않은 입력도 시각 순으로 해석한다", () => {
    const shuffled = [track[2]!, track[0]!, track[1]!];
    expect(sampleMotionKeyframes(shuffled, 1).x).toBeCloseTo(5, 10);
  });

  it("hold 구간은 다음 키프레임 시각 직전까지 시작 값을 유지하고, 그 시각에 점프한다", () => {
    const holdTrack = [kf(0, HOLD_EASING, { x: 0 }), kf(2, LINEAR_EASING, { x: 10 })];
    expect(sampleMotionKeyframes(holdTrack, 0).x).toBe(0);
    expect(sampleMotionKeyframes(holdTrack, 1.999).x).toBe(0);
    expect(sampleMotionKeyframes(holdTrack, 2).x).toBe(10);
  });

  it("bezier 이징이 구간 보간에 적용된다 (ease-in 중간값은 선형보다 작다)", () => {
    const eased = [
      kf(0, bezierEasing(0.42, 0, 1, 1), { x: 0 }),
      kf(2, LINEAR_EASING, { x: 10 }),
    ];
    const linearMid = sampleMotionKeyframes(
      [kf(0, LINEAR_EASING, { x: 0 }), kf(2, LINEAR_EASING, { x: 10 })],
      0.5,
    ).x;
    expect(sampleMotionKeyframes(eased, 0.5).x).toBeLessThan(linearMid);
  });
});

describe("buildCameraKeyframes — 카메라 무브 프리셋 트랙", () => {
  it("static은 항등 변환 단일 키프레임이다", () => {
    const direction: CutDirection = { ...defaultCutDirection(), cameraMove: "static" };
    const frames = buildCameraKeyframes(direction);
    expect(frames).toHaveLength(1);
    expect(sampleCameraTransform(direction, 3)).toEqual(IDENTITY_TRANSFORM);
  });

  it("zoom-in은 강도 0.5에서 기존 CSS와 같은 1 → 1.18이다", () => {
    const direction: CutDirection = { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5 };
    expect(sampleCameraTransform(direction, 0).scale).toBeCloseTo(1, 10);
    expect(sampleCameraTransform(direction, 6).scale).toBeCloseTo(1.18, 10);
    // 기본 이징(ease-in-out)의 중간점은 대칭이라 1.09
    expect(sampleCameraTransform(direction, 3).scale).toBeCloseTo(1.09, 6);
  });

  it("zoom-in 선형 이징이면 중간 scale이 정확히 중간값이다", () => {
    const direction: CutDirection = { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5, easing: "linear" };
    expect(sampleCameraTransform(direction, 3).scale).toBeCloseTo(1.09, 10);
    expect(sampleCameraTransform(direction, 1.5).scale).toBeCloseTo(1.045, 10);
  });

  it("hold 이징이면 컷 끝까지 시작 scale을 유지한다", () => {
    const direction: CutDirection = { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5, easing: "hold" };
    expect(sampleCameraTransform(direction, 5.999).scale).toBe(1);
    expect(sampleCameraTransform(direction, 6).scale).toBeCloseTo(1.18, 10);
  });

  it("pan-left는 +4%에서 −4%로, scale 1.15를 유지한다 (강도 0.5)", () => {
    const direction: CutDirection = { cameraMove: "pan-left", durationSeconds: 4, intensity: 0.5 };
    const start = sampleCameraTransform(direction, 0);
    const end = sampleCameraTransform(direction, 4);
    expect(start.x).toBeCloseTo(4, 10);
    expect(end.x).toBeCloseTo(-4, 10);
    expect(start.scale).toBeCloseTo(1.15, 10);
    expect(end.scale).toBeCloseTo(1.15, 10);
  });

  it("pan 방향 부호가 서로 반대다 (left/right, up/down)", () => {
    const base = { durationSeconds: 4, intensity: 0.5, easing: "linear" as const };
    expect(sampleCameraTransform({ ...base, cameraMove: "pan-right" }, 0).x).toBeCloseTo(-4, 10);
    expect(sampleCameraTransform({ ...base, cameraMove: "pan-up" }, 0).y).toBeCloseTo(4, 10);
    expect(sampleCameraTransform({ ...base, cameraMove: "pan-down" }, 0).y).toBeCloseTo(-4, 10);
  });

  it("강도가 진폭을 조절한다 (zoom-in 강도 1이면 1.36)", () => {
    const direction: CutDirection = { cameraMove: "zoom-in", durationSeconds: 6, intensity: 1 };
    expect(sampleCameraTransform(direction, 6).scale).toBeCloseTo(1.36, 10);
    const still: CutDirection = { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0 };
    expect(sampleCameraTransform(still, 6).scale).toBeCloseTo(1, 10);
  });

  it("shake는 시작·끝이 원점이고 중간에 CSS 오프셋을 지난다", () => {
    const direction: CutDirection = { cameraMove: "shake", durationSeconds: 5, intensity: 0.5 };
    expect(sampleCameraTransform(direction, 0)).toMatchObject({ x: 0, y: 0 });
    expect(sampleCameraTransform(direction, 5)).toMatchObject({ x: 0, y: 0 });
    const at20 = sampleCameraTransform(direction, 1); // 20% 지점
    expect(at20.x).toBeCloseTo(-1.2, 10);
    expect(at20.y).toBeCloseTo(0.8, 10);
  });
});

describe("cameraTransformCss", () => {
  it("translate %·scale·rotate 문자열을 만든다", () => {
    expect(cameraTransformCss({ x: 4, y: -2, scale: 1.15, rotationDeg: 0, opacity: 1 })).toBe(
      "translate(4%, -2%) scale(1.15) rotate(0deg)",
    );
    expect(cameraTransformCss(IDENTITY_TRANSFORM)).toBe("translate(0%, 0%) scale(1) rotate(0deg)");
  });
});
