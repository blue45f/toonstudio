import { describe, expect, it } from "vitest";

import {
  groundStudioMannequinPose,
  type StudioMannequinFootGroundingResult,
} from "./studio-mannequin-foot-grounding";
import { describeStudioMannequinFootGroundingResult } from "./studio-mannequin-foot-grounding-status-text";
import { buildStudioMannequinSpec } from "./studio-mannequin-model";
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

// 솔버는 발목이 지면에서 2cm 이하일 때만 toe roll 을 0 으로 낸다. 마네킹의 발목은 발바닥보다
// 발목 높이만큼 위에 있어 서 있는 rest 자세도 양수 toe roll 이므로, "양발 접지 중"·"접지 보정
// 없음" 분기는 일반 포즈의 실제 결과로는 도달하지 않는다. 그 두 분기는 실제 결과에서 toe roll 과
// 접지 여부만 바꾼 판정으로 고정하고, 나머지 분기는 접지 어댑터의 실제 결과로 고정한다.
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

  it("뒤꿈치가 들린 걸음 자세는 솔버가 산출한 toe roll 각도를 알려 준다", () => {
    const pose: StudioMannequinPose = {
      joints: {
        leftUpperLeg: [degreesToRadians(-90), 0, 0],
        leftLowerLeg: [degreesToRadians(90), 0, 0],
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
