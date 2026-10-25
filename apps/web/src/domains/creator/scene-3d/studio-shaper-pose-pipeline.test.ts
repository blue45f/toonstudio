import { describe, expect, it } from "vitest";

import {
  resolveStudioShaperGarmentFollow,
  resolveStudioShaperPose,
} from "./studio-shaper-pose-pipeline";
import { computeStudioMannequinJointFrames } from "./studio-mannequin-forward-kinematics";
import { buildStudioMannequinSpec } from "./studio-mannequin-model";
import { createStudioMannequinRestPose } from "./studio-mannequin-poses";

describe("studio-shaper-pose-pipeline", () => {
  it("IK 목표가 없으면 정규화 + 접지만 적용한다", () => {
    const result = resolveStudioShaperPose({ pose: createStudioMannequinRestPose() });
    expect(result.ik).toEqual([]);
    expect(result.stance).toBe("standing");
    expect(result.grounded).toBe(false);
  });

  it("닿을 수 있는 손 목표는 IK로 손목을 목표 근처까지 옮긴다", () => {
    const spec = buildStudioMannequinSpec({});
    const frames = computeStudioMannequinJointFrames(spec, createStudioMannequinRestPose());
    const wrist = frames.get("leftHand");
    expect(wrist).toBeDefined();
    if (!wrist) return;
    // rest 손목에서 앞(+Z) 0.25m·위 0.1m 지점 — 팔 길이 안에서 닿는다.
    const target = [wrist.position[0], wrist.position[1] + 0.1, wrist.position[2] + 0.25] as const;
    const result = resolveStudioShaperPose({
      pose: createStudioMannequinRestPose(),
      ikTargets: [{ chainId: "leftArm", target }],
    });
    expect(result.ik).toHaveLength(1);
    expect(result.ik[0]?.reachable).toBe(true);
    expect(result.ik[0]?.reached).toBe(true);
    const after = computeStudioMannequinJointFrames(result.spec, result.pose);
    const moved = after.get("leftHand");
    expect(moved).toBeDefined();
    if (!moved) return;
    const distance = Math.hypot(
      moved.position[0] - target[0],
      moved.position[1] - target[1],
      moved.position[2] - target[2],
    );
    expect(distance).toBeLessThan(0.02);
  });

  it("닿을 수 없는 목표는 reached=false로 보고하고 자세를 망가뜨리지 않는다", () => {
    const result = resolveStudioShaperPose({
      pose: createStudioMannequinRestPose(),
      ikTargets: [{ chainId: "leftArm", target: [0, 5, 5] }],
    });
    expect(result.ik).toHaveLength(1);
    expect(result.ik[0]?.reachable).toBe(false);
    expect(result.ik[0]?.reached).toBe(false);
    expect(result.pose.pelvisOffset[1]).toBeGreaterThanOrEqual(0);
  });

  it("상의 바인딩은 흉곽·허리·골반 배율을 기본 체형 대비로 낸다", () => {
    const binding = resolveStudioShaperGarmentFollow({
      params: { chestWidth: 1.3, waistWidth: 0.7 },
      garmentCategory: "top",
      garmentId: "top-hoodie",
    });
    expect(binding?.binding).toBe("skinned-follow");
    if (binding?.binding !== "skinned-follow") return;
    expect(binding.followsBody).toBe(true);
    expect(binding.regionScales.chest).toBeGreaterThan(1);
    expect(binding.regionScales.waist).toBeLessThan(1);
    expect(binding.regionScales.pelvis).toBeDefined();
  });

  it("기본 체형의 의복 배율은 전부 1이다", () => {
    const binding = resolveStudioShaperGarmentFollow({
      garmentCategory: "bottom",
      garmentId: "bottom-jeans",
    });
    expect(binding?.binding).toBe("skinned-follow");
    if (binding?.binding !== "skinned-follow") return;
    expect(binding.regionScales.pelvis).toBe(1);
    expect(binding.regionScales.thigh).toBe(1);
    expect(binding.regionScales.calf).toBe(1);
  });

  it("상의·하의·신발의 rigid 요청은 거부되고 액세서리만 rigid가 허용된다", () => {
    const rejected = resolveStudioShaperGarmentFollow({
      garmentCategory: "top",
      garmentId: "top-school",
      bindingRequest: "rigid",
    });
    expect(rejected?.binding).toBe("rejected-rigid");
    expect(rejected?.followsBody).toBe(false);
    const accessory = resolveStudioShaperGarmentFollow({
      garmentCategory: "accessories",
      garmentId: "acc-glasses",
      bindingRequest: "rigid",
    });
    expect(accessory?.binding).toBe("rigid-overlay");
  });

  it("알 수 없는 의복 카테고리는 null이다", () => {
    expect(resolveStudioShaperGarmentFollow({
      garmentCategory: "cape",
      garmentId: "cape-1",
    })).toBeNull();
  });
});
