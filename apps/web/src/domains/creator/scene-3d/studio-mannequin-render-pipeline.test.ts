import { describe, expect, it } from "vitest";

import {
  resolveStudioMannequinRenderFrame,
  summarizeStudioMannequinRenderVolume,
} from "./studio-mannequin-render-pipeline";
import { buildStudioMannequinSpec } from "./studio-mannequin-model";
import { createStudioMannequinRestPose } from "./studio-mannequin-poses";

describe("studio-mannequin-render-pipeline", () => {
  it("기본 체형의 볼륨 요약은 테이퍼 캡슐을 포함한다", () => {
    const spec = buildStudioMannequinSpec({});
    const volume = summarizeStudioMannequinRenderVolume(spec);
    expect(volume.primitiveCount).toBeGreaterThan(0);
    expect(volume.taperedCapsuleCount).toBeGreaterThan(0);
    expect(volume.bodyPrimitiveCount).toBeGreaterThan(0);
    expect(volume.maxRadiusM).toBeGreaterThan(volume.minRadiusM);
    expect(volume.maxRadiusM).toBeGreaterThan(0);
  });

  it("서 있는 rest 포즈는 접지 보정 없이 서기 자세로 판정된다", () => {
    const frame = resolveStudioMannequinRenderFrame({
      pose: createStudioMannequinRestPose(),
    });
    expect(frame.mirrored).toBe(false);
    expect(frame.grounded).toBe(false);
    expect(frame.pelvisLiftMeters).toBe(0);
    expect(frame.stance).toBe("standing");
    expect(frame.outline.mode).toBe("auto");
    // auto + shaded면 몸통 윤곽이 보인다(기존 readability 규칙).
    expect(frame.outline.bodyVisible).toBe(true);
    expect(frame.outline.jointVisible).toBe(true);
    expect(frame.rangeArcSegments).toBe(24);
    expect(frame.jointGuide).toBeNull();
  });

  it("미러는 좌우 관절을 바꾸고 한계 안에서 다시 정규화된다", () => {
    const deg = (value: number): number => (value * Math.PI) / 180;
    const frame = resolveStudioMannequinRenderFrame({
      pose: {
        joints: { leftUpperArm: [deg(-4), 0, deg(8)] },
        pelvisOffset: [0, 0, 0],
      },
      mirror: true,
    });
    expect(frame.mirrored).toBe(true);
    // 왼쪽 어깨 회전이 오른쪽으로 미러되고 Z 부호가 반전된다.
    expect(frame.pose.joints.rightUpperArm).toBeDefined();
    expect(frame.pose.joints.leftUpperArm).toBeUndefined();
    const mirrored = frame.pose.joints.rightUpperArm;
    if (mirrored) {
      expect(mirrored[0]).toBeCloseTo(deg(-4), 6);
      expect(mirrored[2]).toBeCloseTo(deg(-8), 6);
    }
  });

  it("미러를 두 번 하면 원래 포즈로 돌아온다", () => {
    const deg = (value: number): number => (value * Math.PI) / 180;
    const pose = {
      joints: {
        leftUpperArm: [deg(-4), 0, deg(8)] as const,
        spine: [deg(2), 0, 0] as const,
      },
      pelvisOffset: [0, 0, 0] as const,
    };
    const once = resolveStudioMannequinRenderFrame({ pose, mirror: true });
    const twice = resolveStudioMannequinRenderFrame({ pose: once.pose, mirror: true });
    expect(twice.pose.joints.leftUpperArm?.[2]).toBeCloseTo(deg(8), 6);
    expect(twice.pose.joints.rightUpperArm).toBeUndefined();
  });

  it("관절 가이드는 요청한 관절의 가동범위 아크를 만든다", () => {
    const restFrame = resolveStudioMannequinRenderFrame({
      pose: createStudioMannequinRestPose(),
      guideJointId: "leftLowerArm",
    });
    expect(restFrame.jointGuide?.jointId).toBe("leftLowerArm");
    expect(restFrame.jointGuide?.points.length).toBe(25);
    expect(restFrame.jointGuide?.limitState).toBe("near-limit");

    const flexedFrame = resolveStudioMannequinRenderFrame({
      pose: {
        joints: { leftLowerArm: [-0.8, 0, 0] },
        pelvisOffset: [0, 0, 0],
      },
      guideJointId: "leftLowerArm",
    });
    expect(flexedFrame.jointGuide?.limitState).toBe("within");
  });

  it("윤곽 off면 어떤 재질에서도 윤곽이 보이지 않는다", () => {
    const frame = resolveStudioMannequinRenderFrame({
      pose: createStudioMannequinRestPose(),
      outlineMode: "off",
      materialStyle: "skin",
    });
    expect(frame.outline.bodyVisible).toBe(false);
    expect(frame.outline.jointVisible).toBe(false);
  });
});
