import { describe, expect, it } from "vitest";

import {
  buildStudioMannequinSpec,
  clampStudioMannequinJointRotation,
  isStudioMannequinJointId,
  studioMannequinRestJointPosition,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
} from "./studio-mannequin-model";
import {
  createStudioMannequinRestPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";
import {
  STUDIO_MANNEQUIN_DUO_COMPOSITIONS,
  computeStudioMannequinJointFrames,
  describeStudioMannequinDuoPlacement,
  findStudioMannequinDuoComposition,
  solveStudioMannequinDuoPlacement,
} from "./studio-mannequin-duo-composition";

function deg3(x: number, y: number, z: number): readonly [number, number, number] {
  return [(x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180];
}

/** 마주 안기 주인공 포즈(커플 프리셋과 같은 감각으로 테스트에서 직접 저작). */
const HUG_LEAD_POSE: StudioMannequinPose = {
  joints: {
    spine: deg3(6, 0, 0),
    chest: deg3(4, 0, 0),
    head: deg3(-4, 0, 4),
    leftUpperArm: deg3(-56, -18, 36),
    leftLowerArm: deg3(-64, 0, 0),
    rightUpperArm: deg3(-56, 18, -36),
    rightLowerArm: deg3(-64, 0, 0),
  },
  pelvisOffset: [0, 0, 0],
};

/** 상대 발바닥 최저 높이 — 접지 보정이 맞으면 0이어야 한다. */
function partnerLowestFootBottomY(
  placement: ReturnType<typeof solveStudioMannequinDuoPlacement>,
  partnerParams: unknown = STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
): number {
  const spec = buildStudioMannequinSpec(partnerParams);
  const frames = computeStudioMannequinJointFrames(
    spec,
    placement.partnerPose,
    placement.partnerOffset,
    placement.partnerYawRad,
  );
  const clearance = studioMannequinRestJointPosition(spec, "leftFoot")[1];
  const left = frames.get("leftFoot");
  const right = frames.get("rightFoot");
  return Math.min(left?.position[1] ?? 0, right?.position[1] ?? 0) - clearance;
}

describe("studio-mannequin-duo-composition 구도 스펙", () => {
  it("커플·벽치기 프리셋 id로 구도를 찾고, 모르는 id는 null이다", () => {
    expect(findStudioMannequinDuoComposition("couple-hug-front")?.id).toBe("duo-hug-front");
    expect(findStudioMannequinDuoComposition("dramatic-wall-slam-kabe-don")?.id).toBe(
      "duo-wall-slam",
    );
    expect(findStudioMannequinDuoComposition("couple-back-hug")?.id).toBe("duo-back-hug");
    expect(findStudioMannequinDuoComposition("stand")).toBeNull();
    expect(findStudioMannequinDuoComposition(null)).toBeNull();
    expect(findStudioMannequinDuoComposition(42)).toBeNull();
  });

  it("구도 id가 유일하고 프리셋 id가 겹치지 않는다", () => {
    const ids = STUDIO_MANNEQUIN_DUO_COMPOSITIONS.map((spec) => spec.id);
    expect(new Set(ids).size).toBe(ids.length);
    const presetIds = STUDIO_MANNEQUIN_DUO_COMPOSITIONS.flatMap((spec) => spec.presetIds);
    expect(new Set(presetIds).size).toBe(presetIds.length);
  });
});

describe("studio-mannequin-duo-composition FK", () => {
  it("rest 포즈에서 발목은 지면 여유만큼 떠 있고 머리는 키 근처에 있다", () => {
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const frames = computeStudioMannequinJointFrames(spec, createStudioMannequinRestPose());
    const clearance = studioMannequinRestJointPosition(spec, "leftFoot")[1];
    expect(frames.get("leftFoot")?.position[1]).toBeCloseTo(clearance, 6);
    expect(frames.get("head")?.position[1]).toBeGreaterThan(spec.heightM * 0.8);
  });
});

describe("studio-mannequin-duo-composition 솔버", () => {
  it("마주 안기: 상대가 마주 보고(요 π) 앞에 서며 발바닥이 지면에 닿는다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "couple-hug-front",
      leadPose: HUG_LEAD_POSE,
    });
    expect(placement.compositionId).toBe("duo-hug-front");
    expect(placement.partnerYawRad).toBeCloseTo(Math.PI, 4);
    expect(placement.partnerOffset[2]).toBeCloseTo(placement.distanceM, 4);
    expect(placement.partnerOffset[0]).toBe(0);
    expect(placement.distanceM).toBeGreaterThan(0.05);
    expect(placement.distanceM).toBeLessThan(0.6);
    expect(Math.abs(partnerLowestFootBottomY(placement))).toBeLessThan(1e-3);
  });

  it("충돌 보정: 몸통이 큰 체형이면 거리가 벌어지고 밀어낸 양이 영수증에 남는다", () => {
    const wide = {
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      shoulderWidth: 1.3,
      chestWidth: 1.4,
      pelvisWidth: 1.3,
    };
    const slim = solveStudioMannequinDuoPlacement({
      presetId: "couple-shoulder-lean",
      leadPose: HUG_LEAD_POSE,
    });
    const bulky = solveStudioMannequinDuoPlacement({
      presetId: "couple-shoulder-lean",
      leadPose: HUG_LEAD_POSE,
      leadBodyParams: wide,
      partnerBodyParams: wide,
    });
    expect(bulky.distanceM).toBeGreaterThan(slim.distanceM);
    expect(bulky.corrections.collisionPushM).toBeGreaterThan(0);
  });

  it("시선 보정: 마주 안기에서 두 얼굴이 서로를 향하고 오차가 작다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "couple-hug-front",
      leadPose: HUG_LEAD_POSE,
    });
    expect(placement.corrections.gaze.errorDeg).toBeLessThan(20);
    // 주인공 포즈에 시선 보정이 실제로 얹혔다(목/머리 중 하나는 원본과 다르다).
    const leadNeck = placement.leadPose.joints.neck ?? [0, 0, 0];
    const leadHead = placement.leadPose.joints.head ?? [0, 0, 0];
    const originalHead = HUG_LEAD_POSE.joints.head ?? [0, 0, 0];
    expect(
      Math.abs(leadNeck[1]) + Math.abs(leadHead[0] - originalHead[0]) + Math.abs(leadHead[1] - originalHead[1]),
    ).toBeGreaterThan(0.001);
  });

  it("백허그: 상대는 주인공 앞에 같은 방향으로 서고, 주인공 시선이 상대에게 향한다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "couple-back-hug",
      leadPose: HUG_LEAD_POSE,
      partnerHeightCm: 150,
    });
    expect(placement.partnerYawRad).toBe(0);
    expect(placement.partnerOffset[2]).toBeGreaterThan(0);
    // 키 작은 상대를 내려다보는 피치가 양(+)의 숙임으로 잡힌다(X 회전 델타 보고).
    expect(placement.corrections.gaze.leadPitchDeg).toBeGreaterThan(1);
    expect(Math.abs(partnerLowestFootBottomY(placement, {
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      heightCm: 150,
    }))).toBeLessThan(1e-3);
  });

  it("손잡고 걷기: 상대는 주인공 오른쪽(−X)에 나란히 서고 시선 보정은 없다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "couple-hand-hold-walk",
      leadPose: HUG_LEAD_POSE,
    });
    expect(placement.partnerOffset[0]).toBeLessThan(0);
    expect(placement.partnerOffset[2]).toBe(0);
    expect(placement.partnerYawRad).toBe(0);
    expect(placement.corrections.gaze.errorDeg).toBe(0);
  });

  it("어깨 기대기: 상대는 주인공 왼쪽(+X)에 선다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "couple-shoulder-lean",
      leadPose: HUG_LEAD_POSE,
    });
    expect(placement.partnerOffset[0]).toBeGreaterThan(0);
    expect(placement.partnerYawRad).toBe(0);
  });

  it("벽치기: 상대 포즈가 저작본(벽에 기댄 자세)이고 마주 본다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "dramatic-wall-slam-kabe-don",
      leadPose: HUG_LEAD_POSE,
    });
    expect(placement.compositionId).toBe("duo-wall-slam");
    expect(placement.partnerYawRad).toBeCloseTo(Math.PI, 4);
    // 저작본의 머리 돌림이 시선 보정 후에도 부호를 유지한다(완전히 덮지 않는다).
    expect(placement.partnerPose.joints.head).toBeDefined();
  });

  it("스펙 없는 2인 프리셋은 기본 마주 보기 구도로 떨어진다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "unknown-duo-preset",
      leadPose: HUG_LEAD_POSE,
    });
    expect(placement.compositionId).toBe("duo-fallback-face-to-face");
    expect(placement.partnerYawRad).toBeCloseTo(Math.PI, 4);
  });

  it("키 차이가 크면 경고가 남고, 상대 포즈는 관절 한계 안으로 정규화된다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "couple-hug-front",
      leadPose: HUG_LEAD_POSE,
      leadBodyParams: { ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS, heightCm: 195 },
      partnerHeightCm: 140,
    });
    expect(placement.warnings.some((warning) => warning.includes("키 차이"))).toBe(true);
    for (const [jointId, rotation] of Object.entries(placement.partnerPose.joints)) {
      expect(isStudioMannequinJointId(jointId)).toBe(true);
      const clamped = clampStudioMannequinJointRotation(jointId, rotation);
      for (let axis = 0; axis < 3; axis += 1) {
        expect(Math.abs(clamped[axis] - (rotation?.[axis] ?? 0))).toBeLessThan(1e-6);
      }
    }
    expect(placement.partnerPose).toEqual(normalizeStudioMannequinPose(placement.partnerPose));
  });

  it("결정적이다 — 같은 입력은 같은 배치를 낸다", () => {
    const input = { presetId: "couple-high-five", leadPose: HUG_LEAD_POSE };
    expect(solveStudioMannequinDuoPlacement(input)).toEqual(
      solveStudioMannequinDuoPlacement(input),
    );
  });

  it("요약 문구는 거리와 구도 이름을 담는다", () => {
    const placement = solveStudioMannequinDuoPlacement({
      presetId: "couple-hug-front",
      leadPose: HUG_LEAD_POSE,
    });
    const summary = describeStudioMannequinDuoPlacement(placement);
    expect(summary).toContain("상대 자동 배치");
    expect(summary).toContain("마주 안기");
    expect(summary).toContain(`${placement.distanceM.toFixed(2)}m`);
  });

  it("전 구도 공통: 상대는 접지되고 거리는 양수이며 상대 포즈가 비어 있지 않다", () => {
    for (const spec of STUDIO_MANNEQUIN_DUO_COMPOSITIONS) {
      const placement = solveStudioMannequinDuoPlacement({
        compositionId: spec.id,
        leadPose: HUG_LEAD_POSE,
      });
      expect(placement.distanceM).toBeGreaterThan(0);
      expect(Math.abs(partnerLowestFootBottomY(placement))).toBeLessThan(1e-3);
      expect(Object.keys(placement.partnerPose.joints).length).toBeGreaterThan(0);
    }
  });
});
