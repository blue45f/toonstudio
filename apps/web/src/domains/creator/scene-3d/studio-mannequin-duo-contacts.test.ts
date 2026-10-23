import { describe, expect, it } from "vitest";

import { getWebtoonPosePresetById } from "./studio-3d-advanced-poses-library";
import {
  computeStudioMannequinJointFrames,
  solveStudioMannequinDuoPlacement,
} from "./studio-mannequin-duo-composition";
import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  buildStudioMannequinSpec,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { createStudioMannequinRestPose, findStudioMannequinPosePreset } from "./studio-mannequin-poses";
import {
  resolveStudioMannequinLibraryPresetPose,
  resolveStudioMannequinWebtoonPresetPose,
} from "./studio-mannequin-preset-application";

type Placement = ReturnType<typeof solveStudioMannequinDuoPlacement>;

function place(presetId: string, params: StudioMannequinBodyParams = STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS): Placement {
  const library = findStudioMannequinPosePreset(presetId);
  const webtoon = library ? null : getWebtoonPosePresetById(presetId);
  const leadPose = library
    ? resolveStudioMannequinLibraryPresetPose(library, params, createStudioMannequinRestPose())
    : webtoon
      ? resolveStudioMannequinWebtoonPresetPose(webtoon, params)
      : null;
  if (!leadPose) throw new Error(`${presetId} 프리셋이 없다`);
  return solveStudioMannequinDuoPlacement({ presetId, leadPose, leadBodyParams: params });
}

function joints(placement: Placement, params: StudioMannequinBodyParams = STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS) {
  const spec = buildStudioMannequinSpec(params);
  const lead = computeStudioMannequinJointFrames(spec, placement.leadPose);
  const partner = computeStudioMannequinJointFrames(
    spec,
    placement.partnerPose,
    placement.partnerOffset,
    placement.partnerYawRad,
  );
  const at = (frames: typeof lead, id: StudioMannequinJointId): StudioMannequinVec3 => {
    const frame = frames.get(id);
    if (!frame) throw new Error(`${id} 관절이 없다`);
    return frame.position;
  };
  return {
    spec,
    lead: (id: StudioMannequinJointId) => at(lead, id),
    partner: (id: StudioMannequinJointId) => at(partner, id),
    partnerForward: [Math.sin(placement.partnerYawRad), 0, Math.cos(placement.partnerYawRad)] as const,
  };
}

const sub = (a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: StudioMannequinVec3, b: StudioMannequinVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const dist = (a: StudioMannequinVec3, b: StudioMannequinVec3): number => Math.hypot(...sub(a, b));

describe("2인 구도 손 접촉(B-02 — 브라우저에서 손이 상대를 뚫던 회귀)", () => {
  it("마주 안기: 주인공 손은 상대 등 뒤, 상대 손은 주인공 등 뒤에 닿는다", () => {
    const placement = place("couple-hug-front");
    expect(placement.corrections.handContacts.count).toBe(4);
    expect(placement.corrections.handContacts.maxErrorM).toBeLessThan(0.03);
    const j = joints(placement);
    const partnerBack = j.partner("chest");
    for (const hand of ["leftHand", "rightHand"] as const) {
      // 상대 정면 방향으로 보면 손이 상대 가슴보다 뒤(음수)에 있다 — 몸을 감싼다.
      expect(dot(sub(j.lead(hand), partnerBack), j.partnerForward), hand).toBeLessThan(0);
      expect(j.partner(hand)[2], hand).toBeLessThan(j.lead("spine")[2]);
    }
  });

  it("백허그: 뒤에 선 주인공의 두 손이 앞사람 배 앞에 모인다", () => {
    const placement = place("couple-back-hug");
    expect(placement.corrections.handContacts.maxErrorM).toBeLessThan(0.03);
    const j = joints(placement);
    for (const hand of ["leftHand", "rightHand"] as const) {
      expect(dot(sub(j.lead(hand), j.partner("spine")), j.partnerForward), hand).toBeGreaterThan(0.05);
    }
    expect(dist(j.lead("leftHand"), j.lead("rightHand"))).toBeLessThan(j.spec.headUnit * 0.6);
  });

  it("손잡고 걷기·하이파이브: 맞닿는 두 손목이 몇 cm 안에 모인다", () => {
    const hold = joints(place("couple-hand-hold-walk"));
    expect(dist(hold.lead("rightHand"), hold.partner("leftHand"))).toBeLessThan(0.05);
    const fivePlacement = place("couple-high-five");
    const five = joints(fivePlacement);
    expect(dist(five.lead("rightHand"), five.partner("leftHand"))).toBeLessThan(0.07);
    // 손은 머리 위로 든 채 마주친다.
    expect(five.lead("rightHand")[1]).toBeGreaterThan(five.lead("head")[1]);
  });

  it("팔짱: 서로의 안쪽 손이 상대 팔꿈치 앞에 걸린다", () => {
    const j = joints(place("couple-arm-link"));
    expect(dist(j.lead("rightHand"), j.partner("leftLowerArm"))).toBeLessThan(0.12);
    expect(dist(j.partner("leftHand"), j.lead("rightLowerArm"))).toBeLessThan(0.12);
  });

  it("벽치기: 든 손이 상대 뒤통수 뒤, 머리 옆 벽면을 짚는다", () => {
    const placement = place("dramatic-wall-slam-kabe-don");
    expect(placement.corrections.handContacts.count).toBe(1);
    const j = joints(placement);
    const hand = j.lead("rightHand")[1] >= j.lead("leftHand")[1] ? j.lead("rightHand") : j.lead("leftHand");
    const fromHead = sub(hand, j.partner("head"));
    expect(dot(fromHead, j.partnerForward)).toBeLessThan(0);
    expect(Math.abs(fromHead[0])).toBeGreaterThan(j.spec.headUnit * 0.4);
    expect(placement.corrections.handContacts.maxErrorM).toBeLessThan(0.05);
  });

  it("어깨 기대기: 주인공 머리가 상대 쪽(+X)으로 기울고 기대는 손이 상대 팔꿈치에 걸친다", () => {
    const placement = place("couple-shoulder-lean");
    expect(placement.partnerOffset[0]).toBeGreaterThan(0);
    const j = joints(placement);
    expect(j.lead("head")[0]).toBeGreaterThan(j.lead("pelvis")[0] + 0.05);
    expect(dist(j.lead("leftHand"), j.partner("rightLowerArm"))).toBeLessThan(0.1);
  });

  it("추가 2인 포즈: 우산은 두 머리 사이 위, 어깨동무는 서로의 바깥 어깨, 등 맞대기는 등끼리 붙는다", () => {
    const umbrellaPlacement = place("couple-umbrella-share");
    expect(umbrellaPlacement.compositionId).toBe("duo-umbrella-share");
    const umbrella = joints(umbrellaPlacement);
    const umbrellaHand = umbrella.lead("rightHand");
    expect(umbrellaHand[1]).toBeGreaterThan(Math.max(umbrella.lead("head")[1], umbrella.partner("head")[1]));
    expect(umbrellaHand[0]).toBeLessThan(umbrella.lead("head")[0]);
    expect(umbrellaHand[0]).toBeGreaterThan(umbrella.partner("head")[0]);

    const shoulderPlacement = place("couple-shoulder-arm");
    const shoulder = joints(shoulderPlacement);
    expect(shoulderPlacement.corrections.handContacts.maxErrorM).toBeLessThan(0.03);
    expect(dist(shoulder.lead("leftHand"), shoulder.partner("leftUpperArm"))).toBeLessThan(0.09);
    expect(dist(shoulder.partner("rightHand"), shoulder.lead("rightUpperArm"))).toBeLessThan(0.09);

    const backPlacement = place("couple-back-to-back");
    expect(backPlacement.arrangement).toBe("back-to-back");
    expect(backPlacement.partnerOffset[2]).toBeLessThan(0);
    expect(Math.cos(backPlacement.partnerYawRad)).toBeCloseTo(-1, 4);
    const back = joints(backPlacement);
    // 두 사람의 가슴 관절 사이가 몸통 두께 두 배 남짓 — 등이 맞닿는다.
    expect(Math.abs(back.lead("chest")[2] - back.partner("chest")[2])).toBeLessThan(0.4);
  });

  it("귓속말: 기울이는 쪽에 상대가 서고(라이브러리 오른쪽·웹툰 왼쪽) 손이 두 머리 사이 입 높이에 온다", () => {
    for (const [presetId, side] of [["dialogue-whisper", -1], ["dialogue-whisper-secret", 1]] as const) {
      const placement = place(presetId);
      expect(placement.compositionId, presetId).not.toBe("duo-fallback-face-to-face");
      expect(Math.sign(placement.partnerOffset[0]), presetId).toBe(side);
      expect(placement.partnerYawRad, presetId).toBe(0);
      const j = joints(placement);
      // 주인공 머리는 상대 쪽으로 기울어 있다.
      expect(Math.sign(j.lead("head")[0] - j.lead("pelvis")[0]), presetId).toBe(side);
      // 상대 쪽 손이 입을 가린다(오른쪽 상대 → 오른손, 왼쪽 상대 → 왼손).
      const hand = side < 0 ? j.lead("rightHand") : j.lead("leftHand");
      const leadHead = j.lead("head");
      const partnerHead = j.partner("head");
      expect(hand[0], presetId).toBeGreaterThan(Math.min(leadHead[0], partnerHead[0]));
      expect(hand[0], presetId).toBeLessThan(Math.max(leadHead[0], partnerHead[0]));
      expect(Math.abs(hand[1] - leadHead[1]), presetId).toBeLessThan(j.spec.headUnit);
      expect(placement.corrections.handContacts.maxErrorM, presetId).toBeLessThan(0.05);
    }
  });

  it("체형이 달라도(여성 체형) 손 접촉이 목표에 닿는다", () => {
    const params = STUDIO_MANNEQUIN_BODY_PRESETS.female.params;
    for (const presetId of ["couple-hug-front", "couple-back-hug", "couple-high-five", "couple-hand-hold-walk"]) {
      const placement = place(presetId, params);
      expect(placement.corrections.handContacts.maxErrorM, presetId).toBeLessThan(0.05);
    }
  });
});
