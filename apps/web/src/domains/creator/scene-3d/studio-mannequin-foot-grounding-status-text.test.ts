import { describe, expect, it } from "vitest";

import {
  groundStudioMannequinPose,
  type StudioMannequinFootGroundingResult,
} from "./studio-mannequin-foot-grounding";
import { describeStudioMannequinFootGroundingResult } from "./studio-mannequin-foot-grounding-status-text";
import { buildStudioMannequinSpec } from "./studio-mannequin-model";
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

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// 접지 어댑터는 발바닥 앞뒤 점으로 접촉을 다시 재므로(뒤꿈치가 들리고 앞꿈치가 닿을 때만
// toe roll) 모든 분기가 실제 포즈 결과로 도달한다. "양발 접지 중"·"접지 보정 없음" 분기는
// 판정 필드만 바꾼 결과로도 한 번 더 고정해 문구 계약을 분리 검증한다.
function withGroundingState(
  base: StudioMannequinFootGroundingResult,
  patch: Partial<StudioMannequinFootGroundingResult["groundingState"]>,
): StudioMannequinFootGroundingResult {
  return { ...base, groundingState: { ...base.groundingState, ...patch } };
}

describe("describeStudioMannequinFootGroundingResult", () => {
  it("골반을 들어 올렸으면 올린 높이를 cm 단위로 알려 준다", () => {
    const result = groundStudioMannequinPose(poseWithPelvisY(-0.05), spec);
    expect(result.applied).toBe(true);
    expect(describeStudioMannequinFootGroundingResult(result)).toBe(
      "자동 접지: 발바닥 밀착을 위해 골반을 5.0cm 올렸어요",
    );
  });

  it("지지 가드가 막은 앉은 자세는 발 관통을 그대로 뒀다고 알려 준다", () => {
    const sitChair = STUDIO_MANNEQUIN_POSE_PRESETS.find((preset) => preset.id === "sit-chair");
    if (!sitChair) throw new Error("sit-chair 프리셋을 찾지 못했습니다.");
    const result = groundStudioMannequinPose(normalizeStudioMannequinPose(sitChair.pose), spec);
    expect(result.supportGuardBlocked).toBe(true);
    expect(describeStudioMannequinFootGroundingResult(result)).toBe(
      "자동 접지: 앉은 자세로 보고 발 관통을 그대로 뒀어요",
    );
  });

  it("뒤꿈치가 들린 걸음 자세는 발바닥으로 잰 toe roll 각도를 알려 준다", () => {
    // 오른다리를 뒤로 빼 앞꿈치만 바닥에 닿은 실제 걸음 자세(왼발은 평평).
    const pose: StudioMannequinPose = {
      joints: {
        rightUpperLeg: [degreesToRadians(14), 0, 0],
        rightLowerLeg: [degreesToRadians(28), 0, 0],
      },
      pelvisOffset: [0, 0, 0],
    };
    const result = groundStudioMannequinPose(pose, spec);
    const { leftToeAngleDeg, rightToeAngleDeg } = result.groundingState;
    const toeRoll = Math.max(leftToeAngleDeg, rightToeAngleDeg);
    expect(result.applied).toBe(false);
    expect(result.supportGuardBlocked).toBe(false);
    expect(toeRoll).toBeGreaterThan(0);
    expect(describeStudioMannequinFootGroundingResult(result)).toBe(
      `자동 접지: toe roll ${toeRoll}° (걸음 자세)`,
    );
  });

  it("서 있는 rest 자세는 실제 판정으로 양발 접지 중이라고 알려 준다(걸음 자세 오분류 회귀)", () => {
    const rest = groundStudioMannequinPose(createStudioMannequinRestPose(), spec);
    expect(describeStudioMannequinFootGroundingResult(rest)).toBe("자동 접지: 양발 접지 중");
  });

  it("공중에 든 발은 걸음 자세가 아니라 접지 보정 없음으로 알려 준다", () => {
    const raisedKnee: StudioMannequinPose = {
      joints: {
        leftUpperLeg: [degreesToRadians(-90), 0, 0],
        leftLowerLeg: [degreesToRadians(90), 0, 0],
      },
      pelvisOffset: [0, 0, 0],
    };
    const result = groundStudioMannequinPose(raisedKnee, spec);
    expect(describeStudioMannequinFootGroundingResult(result)).toBe("자동 접지: 접지 보정 없음");
  });

  it("무릎·바닥·공중 자세는 전신 접촉 분류로 알려 준다", () => {
    const presetResult = (id: string) => {
      const preset = STUDIO_MANNEQUIN_POSE_PRESETS.find((entry) => entry.id === id);
      if (!preset) throw new Error(`${id} 프리셋을 찾지 못했습니다.`);
      return groundStudioMannequinPose(
        groundStudioMannequinPresetPoseForBody(preset.pose, undefined, preset.ground),
        spec,
      );
    };
    expect(describeStudioMannequinFootGroundingResult(presetResult("hero-landing"))).toBe(
      "자동 접지: 무릎을 바닥에 댄 자세예요",
    );
    expect(describeStudioMannequinFootGroundingResult(presetResult("sit-floor-cross"))).toBe(
      "자동 접지: 바닥에 앉거나 누운 자세예요",
    );
    expect(describeStudioMannequinFootGroundingResult(presetResult("jump"))).toBe(
      "자동 접지: 공중 자세라 바닥으로 내리지 않았어요",
    );
  });

  it("toe roll 이 없고 양발이 접지했으면 양발 접지 중이라고 알려 준다", () => {
    const rest = groundStudioMannequinPose(createStudioMannequinRestPose(), spec);
    const flat = withGroundingState(rest, {
      isLeftGrounded: true,
      isRightGrounded: true,
      leftToeAngleDeg: 0,
      rightToeAngleDeg: 0,
    });
    expect(flat.applied).toBe(false);
    expect(flat.supportGuardBlocked).toBe(false);
    expect(describeStudioMannequinFootGroundingResult(flat)).toBe("자동 접지: 양발 접지 중");
  });

  it("toe roll 이 없고 한 발이라도 떠 있으면 접지 보정 없음이라고 알려 준다", () => {
    const rest = groundStudioMannequinPose(createStudioMannequinRestPose(), spec);
    const oneFootUp = withGroundingState(rest, {
      isLeftGrounded: true,
      isRightGrounded: false,
      leftToeAngleDeg: 0,
      rightToeAngleDeg: 0,
    });
    expect(describeStudioMannequinFootGroundingResult(oneFootUp)).toBe("자동 접지: 접지 보정 없음");
  });
});
