import { describe, expect, it } from "vitest";

import {
  evaluateStudioVrmPoseBalance,
  studioVrmPoseBalanceSignature,
} from "./studio-vrm-pose-balance";
import type { CharacterVector3 } from "../character-platform/pose/character-pose-v2";

/** 똑바로 선 포즈의 본 월드 위치(대략적인 인체 비율, 단위 m). */
function standingBones(overrides: Record<string, CharacterVector3> = {}): Record<string, CharacterVector3> {
  return {
    hips: [0, 0.95, 0],
    spine: [0, 1.1, 0],
    chest: [0, 1.3, 0],
    head: [0, 1.6, 0],
    leftUpperLeg: [-0.1, 0.9, 0],
    leftLowerLeg: [-0.1, 0.45, 0],
    leftFoot: [-0.1, 0.02, 0],
    rightUpperLeg: [0.1, 0.9, 0],
    rightLowerLeg: [0.1, 0.45, 0],
    rightFoot: [0.1, 0.02, 0],
    leftUpperArm: [-0.25, 1.4, 0],
    leftLowerArm: [-0.3, 1.1, 0],
    leftHand: [-0.32, 0.85, 0],
    rightUpperArm: [0.25, 1.4, 0],
    rightLowerArm: [0.3, 1.1, 0],
    rightHand: [0.32, 0.85, 0],
    ...overrides,
  };
}

describe("evaluateStudioVrmPoseBalance", () => {
  it("양발로 선 포즈는 stable이고 ground 접점 2개를 보고한다", () => {
    const report = evaluateStudioVrmPoseBalance(standingBones());
    expect(report.severity).toBe("stable");
    expect(report.warnings).toEqual([]);
    expect(report.groundedBones).toEqual(expect.arrayContaining(["leftFoot", "rightFoot"]));
    expect(report.supportPolygon.length).toBeGreaterThanOrEqual(3);
    expect(report.supportMargin).not.toBeNull();
    expect(report.supportMargin!).toBeGreaterThan(0.04);
    expect(report.centerOfMass).not.toBeNull();
  });

  it("무게중심이 지지 범위 밖으로 기울면 unstable 경고를 낸다", () => {
    // 상체·골반을 지지 범위(+x) 밖으로 크게 이동
    const report = evaluateStudioVrmPoseBalance(standingBones({
      hips: [0.55, 0.95, 0], spine: [0.6, 1.1, 0], chest: [0.65, 1.3, 0], head: [0.7, 1.6, 0],
    }));
    expect(report.severity).toBe("unstable");
    expect(report.supportMargin!).toBeLessThan(0);
    expect(report.warnings.join(" ")).toContain("무게중심이 지지 범위를 벗어났어요");
  });

  it("allowImbalance면 기울어짐 경고를 억제하되 severity는 유지한다", () => {
    const report = evaluateStudioVrmPoseBalance(standingBones({
      hips: [0.55, 0.95, 0], spine: [0.6, 1.1, 0], chest: [0.65, 1.3, 0], head: [0.7, 1.6, 0],
    }), { allowImbalance: true });
    expect(report.severity).toBe("unstable");
    expect(report.warnings).toEqual([]);
  });

  it("발이 지면 아래로 파고들면 관통 경고와 marginal 이상을 보고한다", () => {
    const report = evaluateStudioVrmPoseBalance(standingBones({
      leftFoot: [-0.1, -0.05, 0], rightFoot: [0.1, -0.05, 0],
    }));
    expect(report.penetratingBones).toEqual(expect.arrayContaining(["leftFoot", "rightFoot"]));
    expect(report.warnings.join(" ")).toContain("바닥 아래로 파고들었어요");
    expect(report.severity).not.toBe("stable");
  });

  it("아무것도 지면에 닿지 않으면 airborne이다", () => {
    const report = evaluateStudioVrmPoseBalance(standingBones({
      leftFoot: [-0.1, 0.4, 0], rightFoot: [0.1, 0.4, 0],
      leftLowerLeg: [-0.1, 0.7, 0], rightLowerLeg: [0.1, 0.7, 0],
    }));
    expect(report.severity).toBe("airborne");
    expect(report.groundedBones).toEqual([]);
    expect(report.supportMargin).toBeNull();
    expect(report.warnings.join(" ")).toContain("바닥에 닿은 곳이 없어요");
  });

  it("한쪽 발만 접지하고 다른 발이 살짝 떠 있으면 뜸 경고를 낸다", () => {
    const report = evaluateStudioVrmPoseBalance(standingBones({
      rightFoot: [0.1, 0.06, 0],
    }));
    expect(report.warnings.join(" ")).toContain("한쪽 발이 바닥에서 살짝 떠 있어요");
  });

  it("엎드린 포즈처럼 손이 지면에 닿으면 손도 지지점으로 쓴다", () => {
    const report = evaluateStudioVrmPoseBalance(standingBones({
      leftFoot: [-0.1, 0.5, 0], rightFoot: [0.1, 0.5, 0],
      leftHand: [-0.3, 0.01, 0.2], rightHand: [0.3, 0.01, 0.2],
    }));
    expect(report.groundedBones).toEqual(expect.arrayContaining(["leftHand", "rightHand"]));
    expect(report.severity).not.toBe("airborne");
  });

  it("손이 반대쪽 다리에 닿으면 self 접점, 파묻히면 경고를 낸다", () => {
    const touching = evaluateStudioVrmPoseBalance(standingBones({
      leftHand: [0.12, 0.9, 0.05],
    }));
    expect(touching.contacts.some((contact) => contact.kind === "self" && contact.bone === "leftHand")).toBe(true);
    const buried = evaluateStudioVrmPoseBalance(standingBones({
      leftHand: [0.1, 0.9, 0],
    }));
    expect(buried.warnings.join(" ")).toContain("손이 몸에 파묻혀 보여요");
  });

  it("소품 앵커에 손이 닿으면 prop 접점을 기록한다", () => {
    const report = evaluateStudioVrmPoseBalance(standingBones(), {
      propAnchors: [{ id: "cup", position: [0.34, 0.85, 0] }],
    });
    expect(report.contacts.some((contact) => contact.kind === "prop" && contact.bone === "rightHand")).toBe(true);
  });

  it("위치가 없거나 NaN이면 unknown으로 fail-soft 한다", () => {
    expect(evaluateStudioVrmPoseBalance({}).severity).toBe("unknown");
    expect(evaluateStudioVrmPoseBalance({ hips: [Number.NaN, 0, 0] }).severity).toBe("unknown");
  });

  it("서명은 severity·경고·접지 본이 같으면 동일하다", () => {
    const a = evaluateStudioVrmPoseBalance(standingBones());
    const b = evaluateStudioVrmPoseBalance(standingBones({ head: [0, 1.61, 0] }));
    expect(studioVrmPoseBalanceSignature(a)).toBe(studioVrmPoseBalanceSignature(b));
  });
});
