import { describe, expect, it } from "vitest";

import { buildStudioMannequinSpec } from "./studio-mannequin-model";
import {
  buildStudioMannequinFootContactSnapshot,
  groundStudioMannequinPose,
} from "./studio-mannequin-foot-grounding";
import { groundStudioMannequinPresetPoseForBody } from "./studio-mannequin-pose-ground-contact";
import {
  STUDIO_MANNEQUIN_POSE_PRESETS,
  createStudioMannequinRestPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

const spec = buildStudioMannequinSpec(undefined);

function poseWithPelvisY(pelvisY: number): StudioMannequinPose {
  return { joints: {}, pelvisOffset: [0, pelvisY, 0] };
}

function deg(rad: number): number {
  return (rad * Math.PI) / 180;
}

describe("buildStudioMannequinFootContactSnapshot", () => {
  it("rest 자세에서는 양발 발끝이 지면(y=0)에 닿는다", () => {
    const snapshot = buildStudioMannequinFootContactSnapshot(spec, createStudioMannequinRestPose());
    expect(snapshot.leftLeg.toe.y).toBeCloseTo(0, 6);
    expect(snapshot.rightLeg.toe.y).toBeCloseTo(0, 6);
    // 발목 관절은 발바닥보다 ankleHeight만큼 위에 있다.
    expect(snapshot.leftLeg.ankle.y).toBeCloseTo(0.32 * spec.headUnit, 6);
    expect(snapshot.pelvis.y).toBeGreaterThan(snapshot.leftLeg.knee.y);
    expect(snapshot.leftLeg.knee.y).toBeGreaterThan(snapshot.leftLeg.ankle.y);
  });

  it("한쪽 다리를 앞으로 차면 그 발은 지면에서 뜨고 반대 발은 접지를 유지한다", () => {
    const pose: StudioMannequinPose = {
      joints: { leftUpperLeg: [deg(-50), 0, 0] },
      pelvisOffset: [0, 0, 0],
    };
    const snapshot = buildStudioMannequinFootContactSnapshot(spec, pose);
    expect(snapshot.leftLeg.toe.y).toBeGreaterThan(0.05);
    expect(snapshot.rightLeg.toe.y).toBeCloseTo(0, 6);
  });
});

describe("groundStudioMannequinPose", () => {
  it("발이 지면을 관통하면 관통 깊이만큼 골반을 들어 발바닥을 밀착시킨다", () => {
    const result = groundStudioMannequinPose(poseWithPelvisY(-0.05), spec);
    expect(result.applied).toBe(true);
    expect(result.pelvisLiftMeters).toBeCloseTo(0.05, 6);
    expect(result.pose.pelvisOffset[1]).toBeCloseTo(0, 6);
    expect(result.groundingState.leftPenetrationDepth).toBeCloseTo(0.05, 6);
    // 보정된 포즈를 다시 스냅샷하면 관통이 사라진다(멱등).
    const again = groundStudioMannequinPose(result.pose, spec);
    expect(again.applied).toBe(false);
    expect(again.groundingState.isLeftGrounded).toBe(true);
    expect(again.groundingState.isRightGrounded).toBe(true);
  });

  it("접지된 rest 자세는 건드리지 않는다", () => {
    const rest = createStudioMannequinRestPose();
    const result = groundStudioMannequinPose(rest, spec);
    expect(result.applied).toBe(false);
    expect(result.pose).toBe(rest);
    expect(result.groundingState.isLeftGrounded).toBe(true);
    expect(result.groundingState.isRightGrounded).toBe(true);
  });

  it("발이 떠 있는 포즈(점프)는 끌어내리지 않는다 — 솔버는 관통만 보정한다", () => {
    const airborne = poseWithPelvisY(0.3);
    const result = groundStudioMannequinPose(airborne, spec);
    expect(result.applied).toBe(false);
    expect(result.pose).toBe(airborne);
    expect(result.groundingState.isLeftGrounded).toBe(false);
    expect(result.groundingState.isRightGrounded).toBe(false);
  });

  it("토글이 꺼져 있으면 관통이 있어도 포즈를 바꾸지 않는다", () => {
    const penetrating = poseWithPelvisY(-0.05);
    const result = groundStudioMannequinPose(penetrating, spec, { enabled: false });
    expect(result.applied).toBe(false);
    expect(result.pose).toBe(penetrating);
    // 판정 자체는 UI 표시용으로 계산된다.
    expect(result.groundingState.leftPenetrationDepth).toBeCloseTo(0.05, 6);
  });

  it("서 있는 자세에서 전체가 가라앉으면(발목까지 잠김) 골반을 들어 올린다", () => {
    // IK 드래그로 발을 바닥 아래로 민 형태 — 골반은 서 있는 높이에 있다.
    const result = groundStudioMannequinPose(poseWithPelvisY(-0.1), spec);
    expect(result.applied).toBe(true);
    expect(result.supportGuardBlocked).toBe(false);
    expect(result.pelvisLiftMeters).toBeCloseTo(0.1, 6);
    expect(result.pose.pelvisOffset[1]).toBeCloseTo(0, 6);
  });

  it("앉기 프리셋은 발이 지지가 아니므로 들어 올리지 않고 판정만 돌려준다", () => {
    const sitChair = STUDIO_MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === "sit-chair");
    expect(sitChair).toBeTruthy();
    const pose = normalizeStudioMannequinPose(sitChair!.pose);
    const result = groundStudioMannequinPose(pose, spec);
    // 앉기 프리셋은 발목까지 지면 아래에 있지만, 지지는 의자이지 발이 아니다.
    expect(result.groundingState.leftPenetrationDepth).toBeGreaterThan(0);
    expect(result.applied).toBe(false);
    expect(result.supportGuardBlocked).toBe(true);
    expect(result.pose).toBe(pose);
  });

  it("뒤꿈치가 들린 걸음 자세에서는 toe roll 각도를 판정으로 돌려준다", () => {
    // 오른다리를 뒤로 14° 빼고 무릎을 28° 굽히면 앞꿈치는 바닥에 닿고 뒤꿈치만 들린다
    // (발바닥 앞뒤 점으로 잰 실제 걸음 자세). 왼발은 평평하게 디딘다.
    const pose: StudioMannequinPose = {
      joints: {
        rightUpperLeg: [deg(14), 0, 0],
        rightLowerLeg: [deg(28), 0, 0],
      },
      pelvisOffset: [0, 0, 0],
    };
    const result = groundStudioMannequinPose(pose, spec);
    expect(result.groundingState.rightToeAngleDeg).toBeGreaterThan(15);
    expect(result.groundingState.leftToeAngleDeg).toBe(0);
    expect(result.groundingState.isLeftGrounded).toBe(true);
    expect(result.groundingState.isRightGrounded).toBe(true);
    expect(result.stance).toBe("stepping");
    // 관통이 없으므로 포즈(관절 회전 포함)는 바꾸지 않는다.
    expect(result.applied).toBe(false);
    expect(result.pose).toBe(pose);
  });

  it("공중으로 든 발은 걸음(toe roll)이 아니다 — 발끝 각도 0, 한 발 접지로 분류", () => {
    // 왼쪽 다리를 앞으로 90° 들고 정강이를 90° 내리면 발이 공중에 뜬다. 예전 판정은 발목
    // 높이를 뒤꿈치 들림으로 읽어 65°(걸음 자세)로 오분류했다.
    const pose: StudioMannequinPose = {
      joints: {
        leftUpperLeg: [deg(-90), 0, 0],
        leftLowerLeg: [deg(90), 0, 0],
      },
      pelvisOffset: [0, 0, 0],
    };
    const result = groundStudioMannequinPose(pose, spec);
    expect(result.groundingState.leftToeAngleDeg).toBe(0);
    expect(result.groundingState.isLeftGrounded).toBe(false);
    expect(result.groundingState.isRightGrounded).toBe(true);
    expect(result.stance).toBe("single-leg");
    expect(result.applied).toBe(false);
  });

  it("서 있는 rest 자세는 양발 평평 접지로 분류한다(발목 높이를 뒤꿈치 들림으로 읽지 않는다)", () => {
    const result = groundStudioMannequinPose(createStudioMannequinRestPose(), spec);
    expect(result.groundingState.leftToeAngleDeg).toBe(0);
    expect(result.groundingState.rightToeAngleDeg).toBe(0);
    expect(result.stance).toBe("standing");
  });

  it("무릎·바닥·공중 자세를 전신 접촉으로 분류한다", () => {
    const presetPose = (id: string) => {
      const preset = STUDIO_MANNEQUIN_POSE_PRESETS.find((entry) => entry.id === id);
      if (!preset) throw new Error(`${id} 프리셋을 찾지 못했습니다.`);
      return groundStudioMannequinPresetPoseForBody(preset.pose, undefined, preset.ground);
    };
    const kneel = groundStudioMannequinPose(presetPose("kneel"), spec);
    expect(kneel.stance).toBe("kneeling");
    // 무릎 꿇은 뒷발의 앞꿈치는 걸음의 뒤꿈치 들림이 아니다.
    expect(kneel.groundingState.leftToeAngleDeg + kneel.groundingState.rightToeAngleDeg).toBe(0);
    expect(groundStudioMannequinPose(presetPose("sit-floor-cross"), spec).stance).toBe("floor");
    expect(groundStudioMannequinPose(presetPose("jump"), spec).stance).toBe("airborne");
    expect(groundStudioMannequinPose(presetPose("sit-chair"), spec).stance).toBe("seated");
  });
});
