import { describe, expect, it } from "vitest";

import {
  SHAPER_DUO_INTERACTION_PRESETS,
  SHAPER_HAND_SOCKET_PROPS,
  SHAPER_MANGA_PERSPECTIVE_PRESETS,
  SHAPER_PRO_REA_EVIDENCE,
  computeShaperHandSocketGrip,
  computeWebtoonPerspectiveAndLineWeight,
  resolveShaperDuoInteractionPose,
  solveShaperFootGroundAndLookAtIk,
} from "./shaper-pro-ik-pose-engine";

describe("shaper-pro-ik-pose-engine (HORANG SHAPER v1.05 REA Pro)", () => {
  it("FinalIK 325개 타입 기반 REA 메타데이터와 6종 소품 소켓 자동 그립 IK를 정확히 계산한다", () => {
    expect(SHAPER_PRO_REA_EVIDENCE.finalIkTypeCount).toBe(325);
    expect(SHAPER_HAND_SOCKET_PROPS).toHaveLength(6);

    for (const spec of SHAPER_HAND_SOCKET_PROPS) {
      const result = computeShaperHandSocketGrip({
        propKind: spec.kind,
        dominantHand: "right",
        twoHanded: spec.supportsTwoHanded,
      });

      expect(result.primaryHand.side).toBe("right");
      expect(result.primaryHand.residualMeters).toBeLessThan(0.02);
      expect(result.primaryHand.fingerCurlDeg.index).toBeGreaterThan(0);
      if (spec.supportsTwoHanded) {
        expect(result.twoHandedActive).toBe(true);
        expect(result.secondaryHand).not.toBeNull();
        expect(result.secondaryHand?.side).toBe("left");
      } else {
        expect(result.twoHandedActive).toBe(false);
        expect(result.secondaryHand).toBeNull();
      }
    }

    // 왼손 주 손 전환 시 미러링과 양손 검 그립 검증
    const leftSword = computeShaperHandSocketGrip({
      propKind: "sword",
      dominantHand: "left",
      twoHanded: true,
    });
    expect(leftSword.primaryHand.side).toBe("left");
    expect(leftSword.secondaryHand?.side).toBe("right");
    expect(leftSword.dynamicBoneSwing.enabled).toBe(true);
  });

  it("바닥 발 접지 FootIK가 공중 부양·경사면 발목을 보정하고 LookAt IK가 척추·목·머리·안구 시선을 분배한다", () => {
    // 발이 바닥(y=0)에서 18cm 떠 있는 상태에서 골반 하강 및 발 접지 검증
    const grounded = solveShaperFootGroundAndLookAtIk({
      floorY: 0,
      soleHeightMeters: 0.08,
      pelvisWorld: [0, 1.12, 0],
      leftLeg: {
        hipWorld: [0.095, 1.12, 0],
        kneeWorld: [0.1, 0.68, 0.03],
        footWorld: [0.1, 0.26, 0],
        floorHeightY: 0,
        floorNormal: [0, 0.96, 0.28],
      },
      rightLeg: {
        hipWorld: [-0.095, 1.12, 0],
        kneeWorld: [-0.1, 0.68, 0.03],
        footWorld: [-0.1, 0.26, 0],
        floorHeightY: 0.06,
      },
      lookAt: {
        headWorld: [0, 1.52, 0],
        targetWorld: [0.85, 1.82, 1.6],
      },
    });

    expect(grounded.pelvisDeltaY).toBeLessThan(0);
    expect(grounded.leftFoot.grounded).toBe(true);
    expect(grounded.rightFoot.grounded).toBe(true);
    expect(grounded.maxGroundResidualMeters).toBeLessThanOrEqual(0.012);
    expect(grounded.leftFoot.anklePitchDeg).toBeGreaterThan(10);

    // 시선 추적: 우측 상단 타깃이므로 yaw/pitch가 모두 양수이며 척추→목→머리→안구 순으로 합산 분배
    expect(grounded.lookAt.inComfortCone).toBe(true);
    expect(grounded.lookAt.rawYawDeg).toBeGreaterThan(20);
    expect(grounded.lookAt.rawPitchDeg).toBeGreaterThan(5);
    expect(grounded.lookAt.boneAnglesDeg.head[0]).toBeGreaterThan(grounded.lookAt.boneAnglesDeg.spine[0]);
    expect(Math.abs(grounded.lookAt.boneAnglesDeg.eyes[0])).toBeLessThanOrEqual(28);
  });

  it("2인 인터랙션 웹툰 포즈 12종이 두 캐릭터 신장차에 따라 접촉 높이·척추 숙임·시선 피치를 자동 보정한다", () => {
    expect(SHAPER_DUO_INTERACTION_PRESETS).toHaveLength(12);
    const labels = SHAPER_DUO_INTERACTION_PRESETS.map((p) => p.labelKo);
    expect(labels).toContain("벽치기");
    expect(labels).toContain("어깨동무");
    expect(labels).toContain("결투 대치");
    expect(labels).toContain("손잡고 달리기");
    expect(labels).toContain("카페 마주앉기");
    expect(labels).toContain("등맞대기");

    // 벽치기: 상대역이 작아질수록 접촉 손 높이가 내려가고 주연의 숙임이 커진다
    const kabedonTallB = resolveShaperDuoInteractionPose({
      presetId: "kabedon",
      actorAHeightCm: 185,
      actorBHeightCm: 175,
    });
    const kabedonShortB = resolveShaperDuoInteractionPose({
      presetId: "kabedon",
      actorAHeightCm: 185,
      actorBHeightCm: 155,
    });
    expect(kabedonShortB.contactAnchorWorld[1]).toBeLessThan(kabedonTallB.contactAnchorWorld[1]);
    expect(kabedonShortB.actorA.spinePitchDeg).toBeGreaterThan(kabedonTallB.actorA.spinePitchDeg);
    expect(kabedonShortB.actorA.gazePitchDeg).toBeLessThan(0);
    expect(kabedonShortB.actorB.gazePitchDeg).toBeGreaterThan(0);

    // 이마 맞대기: 키 큰 쪽이 숙이고 작은 쪽은 덜 숙이거나 올려다본다
    const forehead = resolveShaperDuoInteractionPose({
      presetId: "forehead-touch",
      actorAHeightCm: 188,
      actorBHeightCm: 160,
    });
    expect(forehead.actorA.spinePitchDeg).toBeGreaterThan(0);
    expect(forehead.actorB.spinePitchDeg).toBeLessThan(0);

    // 공주님 안기: 상대역 골반이 바닥 위로 들어올려진다
    const carry = resolveShaperDuoInteractionPose({
      presetId: "princess-carry",
      actorAHeightCm: 186,
      actorBHeightCm: 162,
    });
    expect(carry.actorB.hipLiftMeters).toBeGreaterThan(0.25);
    expect(carry.actorB.position[1]).toBeGreaterThan(0.25);
  });

  it("웹툰 컷 과장 원근(18mm~135mm)과 거리 감쇠 선화 두께 계산기가 렌즈별 FOV·과장 배율·선화 두께를 정확히 산출한다", () => {
    expect(SHAPER_MANGA_PERSPECTIVE_PRESETS[0]?.focalMm).toBe(18);
    expect(SHAPER_MANGA_PERSPECTIVE_PRESETS[SHAPER_MANGA_PERSPECTIVE_PRESETS.length - 1]?.focalMm).toBe(135);

    const wide18Close = computeWebtoonPerspectiveAndLineWeight({
      focalMm: 18,
      cameraDistanceMeters: 1.2,
      baseStrokePx: 2.0,
      mangaExaggeration: 0.9,
      outlinePressure: true,
    });
    const tele135Far = computeWebtoonPerspectiveAndLineWeight({
      focalMm: 135,
      cameraDistanceMeters: 5.5,
      baseStrokePx: 2.0,
      mangaExaggeration: 0.9,
      outlinePressure: true,
    });

    expect(wide18Close.verticalFovDeg).toBeGreaterThan(60);
    expect(tele135Far.verticalFovDeg).toBeLessThan(12);
    expect(wide18Close.foreshorteningBoost).toBeGreaterThan(1.5);
    expect(tele135Far.foreshorteningBoost).toBe(1);
    expect(tele135Far.telephotoCompression).toBe(1);
    expect(wide18Close.effectiveStrokePx).toBeGreaterThan(tele135Far.effectiveStrokePx);
    expect(wide18Close.partLineMultipliers.foregroundLimb).toBeGreaterThan(wide18Close.partLineMultipliers.faceContour);
    expect(wide18Close.partLineMultipliers.hairInline).toBe(0.35);
    expect(tele135Far.worldOutlineWidthFactor).toBeGreaterThan(0);
    expect(tele135Far.screenOutlineWidthFactor).toBeGreaterThan(0);
  });
});
