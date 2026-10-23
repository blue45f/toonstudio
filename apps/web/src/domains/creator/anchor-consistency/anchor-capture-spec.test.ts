import { describe, expect, it } from "vitest";

import {
  ANCHOR_ANGLE_IDS,
  ANCHOR_ANGLE_SPECS,
  ANCHOR_CAPTURE_CONVENTION,
  ANCHOR_LIMITS,
  ANCHOR_MIRROR_PAIRS,
  anchorAngleSpec,
  anchorCameraDistance,
  anchorCameraPose,
  anchorImageExtension,
  anchorMirrorOf,
  isAnchorAngleId,
  isAnchorImageMimeType,
  isValidAnchorCharacterId,
  isValidAnchorId,
  sortAnchorAngles,
} from "./anchor-capture-spec";

describe("앵커 각도 사양", () => {
  it("정면·좌 3/4·좌측·후면·우측·우 3/4 여섯 각도를 정본 순서로 고정한다", () => {
    expect([...ANCHOR_ANGLE_IDS]).toEqual(["front", "left-34", "left", "back", "right", "right-34"]);
    expect(ANCHOR_ANGLE_SPECS.map((spec) => spec.id)).toEqual([...ANCHOR_ANGLE_IDS]);
    expect(ANCHOR_ANGLE_SPECS.map((spec) => spec.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("방위각은 캐릭터 기준이며 정면 0°, 오른쪽 +, 왼쪽 -, 후면 180° 이다", () => {
    const azimuth = Object.fromEntries(ANCHOR_ANGLE_SPECS.map((spec) => [spec.id, spec.azimuthDeg]));
    expect(azimuth).toEqual({ front: 0, "left-34": -45, left: -90, back: 180, right: 90, "right-34": 45 });
    expect(ANCHOR_ANGLE_SPECS.every((spec) => spec.elevationDeg === 0)).toBe(true);
  });

  it("반측 쌍 규칙: 3/4 와 옆은 좌우 짝이며 방위각 부호만 반대다", () => {
    expect(ANCHOR_MIRROR_PAIRS.map((pair) => [...pair])).toEqual([["left-34", "right-34"], ["left", "right"]]);
    for (const [left, right] of ANCHOR_MIRROR_PAIRS) {
      expect(anchorMirrorOf(left)).toBe(right);
      expect(anchorMirrorOf(right)).toBe(left);
      expect(anchorAngleSpec(left).azimuthDeg).toBe(-anchorAngleSpec(right).azimuthDeg);
      expect(anchorAngleSpec(left).kind).toBe(anchorAngleSpec(right).kind);
    }
    expect(anchorMirrorOf("front")).toBeNull();
    expect(anchorMirrorOf("back")).toBeNull();
  });

  it("정본 순서로 정렬하고 중복·알 수 없는 값은 받지 않는다", () => {
    expect(sortAnchorAngles(["right-34", "front", "left", "front"])).toEqual(["front", "left", "right-34"]);
    expect(isAnchorAngleId("back")).toBe(true);
    expect(isAnchorAngleId("top")).toBe(false);
    expect(isAnchorAngleId(undefined)).toBe(false);
    expect(() => anchorAngleSpec("top" as never)).toThrow(RangeError);
  });
});

describe("앵커 캡처 규약", () => {
  it("해상도·시야각·배경·조명을 한 곳에서 고정한다", () => {
    expect(ANCHOR_CAPTURE_CONVENTION.frame).toEqual({ width: 768, height: 1152 });
    expect(ANCHOR_CAPTURE_CONVENTION.frame.width / ANCHOR_CAPTURE_CONVENTION.frame.height).toBeCloseTo(2 / 3, 10);
    expect(ANCHOR_CAPTURE_CONVENTION.camera.verticalFovDeg).toBe(30);
    expect(ANCHOR_CAPTURE_CONVENTION.camera.elevationDeg).toBe(0);
    expect(ANCHOR_CAPTURE_CONVENTION.background.hex).toBe("#bfbfbf");
    expect(ANCHOR_CAPTURE_CONVENTION.background.rgb).toEqual([191, 191, 191]);
    expect(ANCHOR_CAPTURE_CONVENTION.shadows).toBe("none");
    expect(ANCHOR_CAPTURE_CONVENTION.image.alpha).toBe("none");
  });

  it("한도는 참조 이미지 한 장 12MiB 와 전체 50MiB 예산 안쪽이다", () => {
    expect(ANCHOR_LIMITS.maxImageBytes).toBeLessThan(12 * 1024 * 1024);
    expect(ANCHOR_LIMITS.maxSetBytes).toBeLessThan(50 * 1024 * 1024);
    expect(ANCHOR_LIMITS.maxSetBytes).toBeGreaterThanOrEqual(ANCHOR_LIMITS.maxImageBytes);
    expect(ANCHOR_LIMITS.maxEdgePx * ANCHOR_LIMITS.maxEdgePx).toBeGreaterThanOrEqual(ANCHOR_LIMITS.maxPixels);
  });

  it("카메라 거리는 키가 프레임의 (1 - 2×여백) 만큼 차지하는 값이다", () => {
    const distance = anchorCameraDistance(1);
    // 1 / (2 × tan(15°) × 0.88) ≈ 2.1205
    expect(distance).toBeCloseTo(2.1205, 3);
    const visibleHeight = 2 * distance * Math.tan((ANCHOR_CAPTURE_CONVENTION.camera.verticalFovDeg * Math.PI) / 360);
    expect(1 / visibleHeight).toBeCloseTo(1 - 2 * ANCHOR_CAPTURE_CONVENTION.camera.framingMargin, 6);
    expect(anchorCameraDistance(2)).toBeCloseTo(distance * 2, 9);
  });

  it("키가 0 이하이거나 유한하지 않으면 거리를 계산하지 않는다", () => {
    expect(() => anchorCameraDistance(0)).toThrow(RangeError);
    expect(() => anchorCameraDistance(-1)).toThrow(RangeError);
    expect(() => anchorCameraDistance(Number.NaN)).toThrow(RangeError);
    expect(() => anchorCameraDistance(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => anchorCameraDistance(1, { verticalFovDeg: 30, framingMargin: 0.5 })).toThrow(RangeError);
    expect(() => anchorCameraDistance(1, { verticalFovDeg: 0, framingMargin: 0.06 })).toThrow(RangeError);
  });

  it("캐릭터가 +z 를 볼 때 정면은 +z, 후면은 -z, 캐릭터의 오른쪽은 -x 에 카메라를 둔다", () => {
    const subject = { height: 1.6 };
    const front = anchorCameraPose("front", subject);
    const back = anchorCameraPose("back", subject);
    const right = anchorCameraPose("right", subject);
    const left = anchorCameraPose("left", subject);
    const distance = anchorCameraDistance(1.6);
    expect(front.position[0]).toBe(0);
    expect(front.position[2]).toBeCloseTo(distance, 5);
    expect(back.position[2]).toBeCloseTo(-distance, 5);
    expect(right.position[0]).toBeCloseTo(-distance, 5);
    expect(left.position[0]).toBeCloseTo(distance, 5);
    expect(front.target).toEqual([0, 0.8, 0]);
    expect(front.up).toEqual([0, 1, 0]);
    expect(front.aspect).toBeCloseTo(2 / 3, 10);
  });

  it("모든 각도가 목표점에서 같은 거리·같은 눈높이이고 좌우 짝은 거울 위치다", () => {
    const subject = { height: 1.72, baseY: 0.1, center: [2, -3] as const };
    const poses = ANCHOR_ANGLE_IDS.map((id) => anchorCameraPose(id, subject));
    const expected = anchorCameraDistance(1.72);
    for (const pose of poses) {
      const dx = pose.position[0] - pose.target[0];
      const dz = pose.position[2] - pose.target[2];
      expect(Math.hypot(dx, dz)).toBeCloseTo(expected, 4);
      expect(pose.position[1]).toBe(pose.target[1]);
    }
    for (const [leftId, rightId] of ANCHOR_MIRROR_PAIRS) {
      const leftPose = anchorCameraPose(leftId, subject);
      const rightPose = anchorCameraPose(rightId, subject);
      expect(leftPose.position[0] - leftPose.target[0]).toBeCloseTo(-(rightPose.position[0] - rightPose.target[0]), 5);
      expect(leftPose.position[2]).toBeCloseTo(rightPose.position[2], 5);
    }
    expect(poses[0]?.target).toEqual([2, 0.96, -3]);
  });
});

describe("앵커 식별자와 형식", () => {
  it("앵커 id 는 소문자·숫자·하이픈 1~40자이고 점을 쓰지 않는다", () => {
    for (const ok of ["a", "hero-01", "x1", "0abc", "a".repeat(40)]) expect(isValidAnchorId(ok), ok).toBe(true);
    for (const bad of ["", "-a", "a-", "Hero", "hero.01", "hero_01", "a".repeat(41), "한글", " a", 3, null]) {
      expect(isValidAnchorId(bad), String(bad)).toBe(false);
    }
  });

  it("원본 캐릭터 id 는 ASCII 식별자 1~64자다", () => {
    for (const ok of ["char-1", "Hero_01", "project:7.char", "a".repeat(64)]) expect(isValidAnchorCharacterId(ok), ok).toBe(true);
    for (const bad of ["", "-x", "a b", "한글", "a".repeat(65), undefined]) expect(isValidAnchorCharacterId(bad), String(bad)).toBe(false);
  });

  it("PNG·JPEG·WebP 만 받고 확장자를 정한다", () => {
    expect(isAnchorImageMimeType("image/png")).toBe(true);
    expect(isAnchorImageMimeType("image/gif")).toBe(false);
    expect(isAnchorImageMimeType("image/svg+xml")).toBe(false);
    expect(anchorImageExtension("image/png")).toBe("png");
    expect(anchorImageExtension("image/jpeg")).toBe("jpg");
    expect(anchorImageExtension("image/webp")).toBe("webp");
  });
});
