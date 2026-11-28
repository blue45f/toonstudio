/**
 * Wave 118 단위 및 시나리오 테스트 (36개 결정적 테스트):
 * 17관절 4종 등신대 리깅 · 5종 액션 포즈 · ROM 역꺾임 감사/클램핑 · 핀홀 24mm/50mm/105mm 원근 단축 ·
 * Winter CoM 균형 분류 · 실루엣 파묻힘/접선 충돌 감사 · 자동 교정 단조 개선 · OKLCH SVG · 한국어 디렉터 브리프
 */

import { describe, expect, it } from "vitest";
import {
  ANATOMY_JOINT_IDS,
  TANGENT_CLASH_THRESHOLD_PX,
  WEBTOON_POSE_PRESETS,
  WEBTOON_PROPORTION_PROFILES,
  WINTER_SEGMENT_MASS_SPECS,
  auditJointRangeOfMotion,
  auditPoseBalanceAndSilhouette,
  buildWebtoonAnatomyPose,
  escapeAnatomyXmlText,
  mergePoseAngles,
  projectAnatomyForeshortening,
  renderAnatomyForeshorteningSvg,
  suggestSilhouetteRefinementPose,
  summarizeAnatomyForeshorteningKo,
  type WebtoonPosePreset,
  type WebtoonProportionPreset,
} from "./index";

const ALL_PROPORTIONS: readonly WebtoonProportionPreset[] = [
  "action-8head",
  "romance-7.5head",
  "slice-of-life-6.5head",
  "chibi-sd-3head",
];

const ALL_POSES: readonly WebtoonPosePreset[] = [
  "standing-neutral",
  "hero-punch-toward-camera",
  "high-kick-low-angle",
  "crouch-ready-sprint",
  "dramatic-fall-high-angle",
];

describe("Wave 118: 17-관절 웹툰 해부학 등신대 리깅 및 5종 포즈", () => {
  it("4종 웹툰 등신대 프리셋(8 / 7.5 / 6.5 / 3등신)을 17관절 3D 계층으로 정확히 구축한다", () => {
    const expectedHeads: Record<WebtoonProportionPreset, number> = {
      "action-8head": 8.0,
      "romance-7.5head": 7.5,
      "slice-of-life-6.5head": 6.5,
      "chibi-sd-3head": 3.0,
    };

    for (const preset of ALL_PROPORTIONS) {
      const pose = buildWebtoonAnatomyPose({
        proportionPreset: preset,
        posePreset: "standing-neutral",
      });
      expect(Object.keys(pose.joints)).toHaveLength(17);
      expect(pose.bones).toHaveLength(16);
      expect(pose.standingHeadRatio).toBeCloseTo(expectedHeads[preset], 1);
      for (const jointId of ANATOMY_JOINT_IDS) {
        const pt = pose.joints[jointId];
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
        expect(Number.isFinite(pt.z)).toBe(true);
      }
    }
  });

  it("액션 8등신은 로맨스·일상 대비 어깨폭이 넓고 SD 3등신은 신장 대비 머리 비율이 가장 크다", () => {
    const action = WEBTOON_PROPORTION_PROFILES["action-8head"];
    const romance = WEBTOON_PROPORTION_PROFILES["romance-7.5head"];
    const daily = WEBTOON_PROPORTION_PROFILES["slice-of-life-6.5head"];
    const sd = WEBTOON_PROPORTION_PROFILES["chibi-sd-3head"];

    expect(action.shoulderHalfWidthM).toBeGreaterThan(romance.shoulderHalfWidthM);
    expect(action.shoulderHalfWidthM).toBeGreaterThan(daily.shoulderHalfWidthM);
    expect(sd.headHeightM / sd.totalHeightM).toBeCloseTo(1 / 3, 4);
    expect(sd.headHeightM / sd.totalHeightM).toBeGreaterThan(action.headHeightM / action.totalHeightM);
  });

  it("5종 정규 웹툰 액션·연출 포즈 모두 ROM 위반 0건과 유한 3D 좌표를 보장한다", () => {
    for (const posePreset of ALL_POSES) {
      const pose = buildWebtoonAnatomyPose({
        proportionPreset: "action-8head",
        posePreset,
      });
      expect(pose.romAudit.isAnatomicallyValid).toBe(true);
      expect(pose.romAudit.hyperextensionViolationCount).toBe(0);
      expect(pose.romAudit.totalViolationCount).toBe(0);
    }
  });

  it("standing-neutral은 발바닥이 지면(y=0)에 접지하고 dramatic-fall-high-angle은 공중 체공 상태다", () => {
    const standing = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
    });
    const falling = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "dramatic-fall-high-angle",
    });

    const minStandingAnkleY = Math.min(standing.joints.leftAnkle.y, standing.joints.rightAnkle.y);
    expect(minStandingAnkleY).toBeCloseTo(standing.profile.footSoleHeightM, 4);
    expect(standing.grounded).toBe(true);

    expect(falling.grounded).toBe(false);
    expect(Math.min(falling.joints.leftAnkle.y, falling.joints.rightAnkle.y)).toBeGreaterThan(0.5);
  });

  it("hero-punch-toward-camera 포즈는 오른주먹이 머리보다 카메라(+Z) 앞으로 크게 뻗어 나온다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });
    expect(pose.joints.rightWrist.z - pose.joints.head.z).toBeGreaterThan(0.55);
    expect(pose.joints.rightWrist.z).toBeGreaterThan(pose.joints.rightElbow.z);
    expect(pose.joints.rightElbow.z).toBeGreaterThan(pose.joints.rightShoulder.z);
  });

  it("high-kick-low-angle 포즈는 오른발목이 골반 높이 이상으로 차올려지고 왼발이 지면을 지지한다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "high-kick-low-angle",
    });
    expect(pose.joints.rightAnkle.y).toBeGreaterThan(pose.joints.pelvis.y);
    expect(pose.joints.leftAnkle.y).toBeCloseTo(pose.profile.footSoleHeightM, 3);
  });

  it("crouch-ready-sprint 포즈는 깊은 무릎 굴곡으로 standing-neutral보다 골반·머리 높이가 낮아진다", () => {
    const standing = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
    });
    const crouch = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "crouch-ready-sprint",
    });
    expect(crouch.joints.pelvis.y).toBeLessThan(standing.joints.pelvis.y - 0.15);
    expect(crouch.joints.head.y).toBeLessThan(standing.joints.head.y - 0.2);
  });
});

describe("Wave 118: 해부학 ROM 가동 범위 감사 및 역꺾임 클램핑", () => {
  it("양쪽 팔꿈치 역꺾임(< 0°)을 정확히 검출하고 0° 이상으로 클램핑한다", () => {
    const badAngles = mergePoseAngles(WEBTOON_POSE_PRESETS["standing-neutral"], {
      leftElbowFlexDeg: -24,
      rightElbowFlexDeg: -38,
    });
    const audit = auditJointRangeOfMotion(badAngles);

    expect(audit.isAnatomicallyValid).toBe(false);
    expect(audit.hyperextensionViolationCount).toBe(2);
    expect(audit.violations.filter((v) => v.kind === "elbow-hyperextension")).toHaveLength(2);
    expect(audit.clampedAngles.leftElbowFlexDeg).toBe(0);
    expect(audit.clampedAngles.rightElbowFlexDeg).toBe(0);
  });

  it("무릎 역꺾임(< 0°)을 검출하고 clampToRom: true 빌드 시 정상 3D 관절로 복구한다", () => {
    const unclamped = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: { leftKneeFlexDeg: -22, rightKneeFlexDeg: -15 },
      clampToRom: false,
    });
    const clamped = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: { leftKneeFlexDeg: -22, rightKneeFlexDeg: -15 },
      clampToRom: true,
    });

    expect(unclamped.romAudit.hyperextensionViolationCount).toBe(2);
    expect(unclamped.appliedAngles.leftKneeFlexDeg).toBe(-22);
    expect(clamped.clampApplied).toBe(true);
    expect(clamped.romAudit.hyperextensionViolationCount).toBe(2);
    expect(clamped.appliedAngles.leftKneeFlexDeg).toBe(0);
    expect(clamped.appliedAngles.rightKneeFlexDeg).toBe(0);
    // 역꺾임 시 발목이 앞(+Z)으로 튀어나오던 것이 클램핑 후 수직 정렬로 복구됨
    expect(unclamped.joints.leftAnkle.z).toBeGreaterThan(clamped.joints.leftAnkle.z + 0.08);
  });

  it("어깨·고관절 비자연 비틀림 및 과굴곡을 검출하고 안전한 ROM 범위로 제한한다", () => {
    const badAngles = mergePoseAngles(WEBTOON_POSE_PRESETS["standing-neutral"], {
      leftShoulder: { twistDeg: 135, abductionDeg: 205 },
      rightHip: { twistDeg: -90 },
      spineYawDeg: 78,
    });
    const audit = auditJointRangeOfMotion(badAngles);

    expect(audit.twistViolationCount).toBe(2);
    expect(audit.totalViolationCount).toBeGreaterThanOrEqual(4);
    expect(audit.clampedAngles.leftShoulder.twistDeg).toBe(95);
    expect(audit.clampedAngles.leftShoulder.abductionDeg).toBe(175);
    expect(audit.clampedAngles.rightHip.twistDeg).toBe(-55);
    expect(audit.clampedAngles.spineYawDeg).toBe(45);
  });
});

describe("Wave 118: 핀홀 3D 원근 단축(Foreshortening) 투영 및 원통 겹침 링", () => {
  it("24mm 광각에서 hero-punch 주먹의 근경 확대 비율(wristToHeadScaleRatio)이 50mm·105mm 대비 단조적으로 훨씬 크다", () => {
    const punchPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });

    const proj24 = projectAnatomyForeshortening(punchPose, {
      focalLengthMm: 24,
      cameraYawDeg: 0,
      cameraPitchDeg: 0,
      cameraDistanceM: 2.8,
    });
    const proj50 = projectAnatomyForeshortening(punchPose, {
      focalLengthMm: 50,
      cameraYawDeg: 0,
      cameraPitchDeg: 0,
      cameraDistanceM: 2.8,
    });
    const proj105 = projectAnatomyForeshortening(punchPose, {
      focalLengthMm: 105,
      cameraYawDeg: 0,
      cameraPitchDeg: 0,
      cameraDistanceM: 2.8,
    });

    expect(proj24.nearestWristJointId).toBe("rightWrist");
    expect(proj24.wristToHeadScaleRatio).toBeGreaterThan(2.0);
    expect(proj24.wristToHeadScaleRatio).toBeGreaterThan(proj50.wristToHeadScaleRatio * 1.35);
    expect(proj50.wristToHeadScaleRatio).toBeGreaterThan(proj105.wristToHeadScaleRatio);
    expect(proj105.wristToHeadScaleRatio).toBeLessThan(1.25);
  });

  it("24mm 광각에서 화면 투영 주먹/머리 반경 비율(projectedWristToHeadRadiusRatio)도 105mm 망원 대비 현저히 크다", () => {
    const punchPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });
    const wide = projectAnatomyForeshortening(punchPose, { focalLengthMm: 24, cameraDistanceM: 2.8 });
    const tele = projectAnatomyForeshortening(punchPose, { focalLengthMm: 105, cameraDistanceM: 2.8 });

    expect(wide.projectedWristToHeadRadiusRatio).toBeGreaterThan(
      tele.projectedWristToHeadRadiusRatio * 1.6,
    );
  });

  it("카메라를 향해 뻗은 오른전완의 foreshorteningRatio가 정면 중립 자세 대비 강하게 단축된다", () => {
    const neutral = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
    });
    const punch = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });

    const pNeutral = projectAnatomyForeshortening(neutral, { focalLengthMm: 35 });
    const pPunch = projectAnatomyForeshortening(punch, { focalLengthMm: 35 });

    const neutralForearm = pNeutral.segmentsNearToFar.find((s) => s.boneId === "rightForearm");
    const punchForearm = pPunch.segmentsNearToFar.find((s) => s.boneId === "rightForearm");

    expect(neutralForearm).toBeDefined();
    expect(punchForearm).toBeDefined();
    expect(punchForearm!.foreshorteningRatio).toBeLessThan(0.45);
    expect(neutralForearm!.foreshorteningRatio).toBeGreaterThan(0.85);
    expect(punchForearm!.foreshorteningStrength).toBeGreaterThan(0.55);
  });

  it("segmentsNearToFar는 근경→원경(midDepthM 오름차순), segmentsFarToNear는 정확히 역순으로 정렬된다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });
    const proj = projectAnatomyForeshortening(pose, { focalLengthMm: 28, cameraYawDeg: 10 });

    for (let i = 1; i < proj.segmentsNearToFar.length; i += 1) {
      expect(proj.segmentsNearToFar[i].midDepthM).toBeGreaterThanOrEqual(
        proj.segmentsNearToFar[i - 1].midDepthM - 1e-6,
      );
      expect(proj.segmentsNearToFar[i].nearToFarIndex).toBe(i);
    }
    expect(proj.segmentsNearToFar[0].boneId).toBe("rightForearm");
    expect(proj.segmentsFarToNear.map((s) => s.boneId)).toEqual(
      [...proj.segmentsNearToFar].reverse().map((s) => s.boneId),
    );
  });

  it("단축 원통 겹침 링(overlapRings)은 근경이 원경을 감싸는 방향과 단축률에 비례한 타원 곡률을 산출한다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });
    const proj = projectAnatomyForeshortening(pose, { focalLengthMm: 24 });

    const punchForearm = proj.segmentsNearToFar.find((s) => s.boneId === "rightForearm");
    const torso = proj.segmentsNearToFar.find((s) => s.boneId === "upperTorso");
    expect(punchForearm?.overlapRings).toHaveLength(3);
    expect(torso?.overlapRings).toHaveLength(3);

    for (const ring of punchForearm!.overlapRings) {
      expect(ring.enclosingOrder).toBe("near-encloses-far");
      expect(ring.nearJointId).toBe("rightWrist");
      expect(ring.farJointId).toBe("rightElbow");
      expect(Math.hypot(ring.visibleArcDirection2D.x, ring.visibleArcDirection2D.y)).toBeCloseTo(1, 4);
      expect(ring.curvatureRatio).toBeGreaterThan(0.8);
      expect(ring.ryPx).toBeLessThanOrEqual(ring.rxPx + 1e-5);
    }
    // 강하게 단축된 주먹 팔뚝이 정면 상체보다 훨씬 둥근(높은 곡률의) 겹침 링을 가진다
    expect(punchForearm!.overlapRings[1].curvatureRatio).toBeGreaterThan(
      torso!.overlapRings[1].curvatureRatio,
    );
  });

  it("로우 앵글(cameraPitchDeg: -20) high-kick에서 발차기 발목이 머리보다 근경으로 확대 투영된다", () => {
    const kick = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "high-kick-low-angle",
    });
    const proj = projectAnatomyForeshortening(kick, {
      focalLengthMm: 24,
      cameraPitchDeg: -20,
      cameraYawDeg: 8,
    });
    expect(proj.ankleToHeadScaleRatio).toBeGreaterThan(1.3);
    expect(proj.joints2D.rightAnkle.depthM).toBeLessThan(proj.joints2D.head.depthM);
  });

  it("하이 앵글(cameraPitchDeg: +34) dramatic-fall에서 위쪽 손·머리가 발목보다 카메라에 가깝다", () => {
    const fall = buildWebtoonAnatomyPose({
      proportionPreset: "romance-7.5head",
      posePreset: "dramatic-fall-high-angle",
    });
    const proj = projectAnatomyForeshortening(fall, {
      focalLengthMm: 28,
      cameraPitchDeg: 34,
      cameraYawDeg: -10,
    });
    expect(proj.joints2D.head.depthM).toBeLessThan(proj.joints2D.leftAnkle.depthM);
    expect(proj.joints2D.rightWrist.depthM).toBeLessThan(proj.joints2D.leftAnkle.depthM);
  });

  it("동일 주먹 포즈를 정면(yaw=0°)에서 측면(yaw=90°)으로 돌리면 전완의 foreshorteningRatio가 1에 가깝게 풀린다", () => {
    const punch = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });
    const front = projectAnatomyForeshortening(punch, { focalLengthMm: 35, cameraYawDeg: 0 });
    const side = projectAnatomyForeshortening(punch, { focalLengthMm: 35, cameraYawDeg: 90 });

    const frontForearm = front.segmentsNearToFar.find((s) => s.boneId === "rightForearm");
    const sideForearm = side.segmentsNearToFar.find((s) => s.boneId === "rightForearm");
    expect(frontForearm!.foreshorteningRatio).toBeLessThan(0.45);
    expect(sideForearm!.foreshorteningRatio).toBeGreaterThan(0.85);
  });

  it("fixed-physical 거리 모드에서는 유효 카메라 거리가 요청 거리를 그대로 유지한다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
    });
    const proj = projectAnatomyForeshortening(pose, {
      focalLengthMm: 24,
      cameraDistanceM: 3.4,
      cameraDistanceMode: "fixed-physical",
    });
    expect(proj.cameraDistanceMode).toBe("fixed-physical");
    expect(proj.effectiveCameraDistanceM).toBeCloseTo(3.4, 4);
  });
});

describe("Wave 118: Winter 무게중심(CoM) 균형 & 실루엣 가독성·접선 충돌 감사", () => {
  it("Winter 인체 세그먼트 질량 분포 합계는 1.000 ± 1e-6이다", () => {
    const sum = WINTER_SEGMENT_MASS_SPECS.reduce((acc, s) => acc + s.massFraction, 0);
    expect(Math.abs(sum - 1.0)).toBeLessThan(1e-6);
  });

  it("4종 등신대의 standing-neutral 포즈는 모두 무게중심이 지지 발판 안에 들어와 static-balanced로 판정된다", () => {
    for (const preset of ALL_PROPORTIONS) {
      const pose = buildWebtoonAnatomyPose({
        proportionPreset: preset,
        posePreset: "standing-neutral",
      });
      const proj = projectAnatomyForeshortening(pose, { focalLengthMm: 50 });
      const audit = auditPoseBalanceAndSilhouette(proj);

      expect(Math.abs(audit.balance.massWeightSum - 1.0)).toBeLessThan(1e-6);
      expect(audit.balance.groundedFootCount).toBe(2);
      expect(audit.balance.centerOfMass3DM.x).toBeGreaterThanOrEqual(audit.balance.baseOfSupportXMin);
      expect(audit.balance.centerOfMass3DM.x).toBeLessThanOrEqual(audit.balance.baseOfSupportXMax);
      expect(audit.balance.classification).toBe("static-balanced");
    }
  });

  it("공중 낙하 포즈(dramatic-fall-high-angle)는 dynamic-action-lean으로 분류된다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "dramatic-fall-high-angle",
    });
    const proj = projectAnatomyForeshortening(pose, { focalLengthMm: 28, cameraPitchDeg: 30 });
    const audit = auditPoseBalanceAndSilhouette(proj);

    expect(audit.balance.groundedFootCount).toBe(0);
    expect(audit.balance.classification).toBe("dynamic-action-lean");
  });

  it("좁은 스탠스에서 상체를 한쪽으로 과도하게 기울이면 unintentional-tip-risk를 검출한다", () => {
    const tippingPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: {
        pelvisRollDeg: 34,
        spineRollDeg: 26,
        leftHip: { abductionDeg: 2 },
        rightHip: { abductionDeg: 2 },
      },
    });
    const proj = projectAnatomyForeshortening(tippingPose, { focalLengthMm: 50 });
    const audit = auditPoseBalanceAndSilhouette(proj);

    expect(audit.balance.classification).toBe("unintentional-tip-risk");
    expect(audit.balance.distanceOutsideSupportM).toBeGreaterThan(0.12);
    expect(audit.balance.lateralOffsetFromSupportM).toBeGreaterThan(0.12);
  });

  it("역동적 전진 크라우치(crouch-ready-sprint)는 앞쪽으로 쏠린 추진력을 안정 또는 dynamic-action-lean으로 분류한다", () => {
    const sprint = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "crouch-ready-sprint",
    });
    const proj = projectAnatomyForeshortening(sprint, { focalLengthMm: 35, cameraYawDeg: 25 });
    const audit = auditPoseBalanceAndSilhouette(proj);

    expect(["static-balanced", "dynamic-action-lean"]).toContain(audit.balance.classification);
    expect(audit.balance.classification).not.toBe("unintentional-tip-risk");
  });

  it("팔꿈치와 손목이 몸통 윤곽선 안으로 파묻힌 포즈에서 tucked-limb-muddy를 정확히 검출한다", () => {
    const tuckedPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: {
        leftShoulder: { pitchDeg: 8, abductionDeg: -14, twistDeg: 0 },
        leftElbowFlexDeg: 18,
        rightShoulder: { pitchDeg: 8, abductionDeg: -14, twistDeg: 0 },
        rightElbowFlexDeg: 18,
      },
    });
    const proj = projectAnatomyForeshortening(tuckedPose, { focalLengthMm: 50 });
    const audit = auditPoseBalanceAndSilhouette(proj);

    expect(audit.tuckedLimbCount).toBeGreaterThanOrEqual(2);
    expect(audit.silhouetteIssues.some((i) => i.kind === "tucked-limb-muddy")).toBe(true);
    expect(audit.isSilhouetteClean).toBe(false);
    expect(audit.silhouetteClarityScore).toBeLessThan(65);
  });

  it("서로 다른 사지 끝단(양손목)이 화면 2D 좌표에서 12px 이내로 스치면 silhouette-tangent-clash를 검출한다", () => {
    // 두 팔을 몸 앞 중앙으로 모아 양손목 2D 거리가 <= 12px이 되도록 유도
    const tangentPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: {
        leftShoulder: { pitchDeg: 32, abductionDeg: -26, twistDeg: 0 },
        leftElbowFlexDeg: 36,
        rightShoulder: { pitchDeg: 32, abductionDeg: -26, twistDeg: 0 },
        rightElbowFlexDeg: 36,
      },
    });
    const proj = projectAnatomyForeshortening(tangentPose, { focalLengthMm: 50 });
    const lw = proj.joints2D.leftWrist;
    const rw = proj.joints2D.rightWrist;
    const wristDistPx = Math.hypot(lw.screenX - rw.screenX, lw.screenY - rw.screenY);
    const audit = auditPoseBalanceAndSilhouette(proj);

    expect(wristDistPx).toBeLessThanOrEqual(TANGENT_CLASH_THRESHOLD_PX);
    expect(audit.tangentClashCount).toBeGreaterThanOrEqual(1);
    const wristTangent = audit.silhouetteIssues.find(
      (i) =>
        i.kind === "silhouette-tangent-clash" &&
        ((i.primaryJoint === "leftWrist" && i.secondaryJoint === "rightWrist") ||
          (i.primaryJoint === "rightWrist" && i.secondaryJoint === "leftWrist")),
    );
    expect(wristTangent).toBeDefined();
    expect(wristTangent!.clearancePx).toBeLessThanOrEqual(TANGENT_CLASH_THRESHOLD_PX);
  });

  it("자동 교정 포즈(suggestSilhouetteRefinementPose)가 팔 파묻힘 포즈의 silhouetteClarityScore를 단조 개선한다", () => {
    const tuckedPose = buildWebtoonAnatomyPose({
      proportionPreset: "slice-of-life-6.5head",
      posePreset: "standing-neutral",
      customAngles: {
        leftShoulder: { pitchDeg: 6, abductionDeg: -14, twistDeg: 0 },
        rightShoulder: { pitchDeg: 6, abductionDeg: -14, twistDeg: 0 },
      },
    });
    const camera = { focalLengthMm: 50, cameraYawDeg: 0, cameraPitchDeg: 0 };
    const refined = suggestSilhouetteRefinementPose(tuckedPose, camera);

    expect(refined.refinedClarityScore).toBeGreaterThan(refined.originalClarityScore + 20);
    expect(refined.clarityScoreDelta).toBeGreaterThan(20);
    expect(refined.refinedIssueCount).toBeLessThan(refined.originalIssueCount);
    expect(refined.refinedAudit.tuckedLimbCount).toBe(0);
    expect(refined.refinedPose.romAudit.isAnatomicallyValid).toBe(true);
    expect(refined.appliedAdjustmentsKo.length).toBeGreaterThan(0);
  });

  it("자동 교정 포즈가 양손목 접선 충돌 포즈의 점수를 높이고 접선 충돌을 해소한다", () => {
    const tangentPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: {
        leftShoulder: { pitchDeg: 32, abductionDeg: -26, twistDeg: 0 },
        leftElbowFlexDeg: 36,
        rightShoulder: { pitchDeg: 32, abductionDeg: -26, twistDeg: 0 },
        rightElbowFlexDeg: 36,
      },
    });
    const camera = { focalLengthMm: 50 };
    const refined = suggestSilhouetteRefinementPose(tangentPose, camera);

    expect(refined.refinedClarityScore).toBeGreaterThan(refined.originalClarityScore);
    expect(refined.refinedAudit.tangentClashCount).toBe(0);
    expect(refined.refinedIssueCount).toBeLessThan(refined.originalIssueCount);
  });

  it("자동 교정 포즈가 역꺾임 + 넘어짐 위험 + 팔 파묻힘 복합 불량 포즈를 동시에 복구한다", () => {
    const brokenPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: {
        pelvisRollDeg: 34,
        spineRollDeg: 24,
        leftElbowFlexDeg: -28,
        rightKneeFlexDeg: -18,
        leftShoulder: { abductionDeg: -14 },
        rightShoulder: { abductionDeg: -14 },
      },
    });
    const refined = suggestSilhouetteRefinementPose(brokenPose, { focalLengthMm: 50 });

    expect(refined.refinedClarityScore).toBeGreaterThan(refined.originalClarityScore);
    expect(refined.refinedPose.romAudit.hyperextensionViolationCount).toBe(0);
    expect(refined.refinedAudit.balance.classification).not.toBe("unintentional-tip-risk");
  });

  it("이미 깨끗한 standing-neutral 포즈에서도 자동 교정은 단조 비감소(refined >= original)를 유지한다", () => {
    const cleanPose = buildWebtoonAnatomyPose({
      proportionPreset: "romance-7.5head",
      posePreset: "standing-neutral",
    });
    const refined = suggestSilhouetteRefinementPose(cleanPose, { focalLengthMm: 50 });

    expect(refined.refinedClarityScore).toBeGreaterThanOrEqual(refined.originalClarityScore);
    expect(refined.clarityScoreDelta).toBeGreaterThanOrEqual(0);
  });
});

describe("Wave 118: 결정론 · 순수 OKLCH SVG 대조 뷰 · 자연 한국어 디렉터 브리프", () => {
  it("동일 입력으로 파이프라인 전체를 반복 실행하면 완전히 동일한 출력을 반환한다(결정론)", () => {
    const runPipeline = () => {
      const pose = buildWebtoonAnatomyPose({
        proportionPreset: "action-8head",
        posePreset: "hero-punch-toward-camera",
      });
      const proj = projectAnatomyForeshortening(pose, {
        focalLengthMm: 24,
        cameraYawDeg: 5,
        cameraPitchDeg: -6,
      });
      const audit = auditPoseBalanceAndSilhouette(proj);
      const refined = suggestSilhouetteRefinementPose(pose, {
        focalLengthMm: 24,
        cameraYawDeg: 5,
        cameraPitchDeg: -6,
      });
      const svg = renderAnatomyForeshorteningSvg(proj, audit);
      const report = summarizeAnatomyForeshorteningKo(proj, audit, refined);
      return { proj, audit, refined, svg, report };
    };

    const first = runPipeline();
    const second = runPipeline();
    expect(second).toEqual(first);
  });

  it("SVG가 좌측(원근 단축 원통 링·뼈대·CoM 수직선·지지 발판)과 우측(순수 단색 실루엣)을 모두 포함한다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "hero-punch-toward-camera",
    });
    const proj = projectAnatomyForeshortening(pose, { focalLengthMm: 24 });
    const audit = auditPoseBalanceAndSilhouette(proj);
    const svg = renderAnatomyForeshorteningSvg(proj, audit);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('data-view="anatomy-foreshortening"');
    expect(svg).toContain('data-view="pure-silhouette"');
    expect(svg).toContain('data-overlap-ring="rightForearm"');
    expect(svg).toContain('data-enclosing="near-encloses-far"');
    expect(svg).toContain('data-com-plumb="true"');
    expect(svg).toContain('data-support-base="true"');
    expect(svg).toContain('data-pure-silhouette="true"');
  });

  it("SVG 라이트·다크 테마 모두 100% oklch(...)만 사용하고 원시 hex/rgb/hsl 및 NaN/Infinity가 0건이다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "chibi-sd-3head",
      posePreset: "high-kick-low-angle",
    });
    const proj = projectAnatomyForeshortening(pose, { focalLengthMm: 24, cameraPitchDeg: -15 });
    const audit = auditPoseBalanceAndSilhouette(proj);

    for (const theme of ["light", "dark"] as const) {
      const svg = renderAnatomyForeshorteningSvg(proj, audit, { theme });
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    }
  });

  it("SVG 제목에 포함된 XML 특수문자(<, >, &, \", ')를 안전하게 이스케이프한다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
    });
    const proj = projectAnatomyForeshortening(pose, { focalLengthMm: 50 });
    const audit = auditPoseBalanceAndSilhouette(proj);
    const malicious = `<script>alert("xss")</script> & '컷'`;
    const svg = renderAnatomyForeshorteningSvg(proj, audit, { title: malicious });

    expect(escapeAnatomyXmlText(malicious)).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;컷&apos;",
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &apos;컷&apos;");
  });

  it("한국어 작화 디렉터 브리프는 pass/warn/fail 3단계 판정을 정확히 분류하고 번역투를 쓰지 않는다", () => {
    const cleanPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
    });
    const cleanProj = projectAnatomyForeshortening(cleanPose, { focalLengthMm: 50 });
    const cleanAudit = auditPoseBalanceAndSilhouette(cleanProj);
    const passReport = summarizeAnatomyForeshorteningKo(cleanProj, cleanAudit);

    const brokenPose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: {
        rightElbowFlexDeg: -30,
        pelvisRollDeg: 34,
        spineRollDeg: 26,
      },
    });
    const brokenProj = projectAnatomyForeshortening(brokenPose, { focalLengthMm: 50 });
    const brokenAudit = auditPoseBalanceAndSilhouette(brokenProj);
    const failReport = summarizeAnatomyForeshorteningKo(brokenProj, brokenAudit);

    expect(passReport.verdict).toBe("pass");
    expect(passReport.verdictLabelKo).toBe("작화 검수 통과");
    expect(failReport.verdict).toBe("fail");
    expect(failReport.verdictLabelKo).toBe("해부학·실루엣 즉시 수정 필요");
    expect(failReport.actionableDirectivesKo.length).toBeGreaterThanOrEqual(2);

    const combinedText = [
      passReport.headlineKo,
      passReport.summaryParagraphKo,
      ...passReport.bulletLinesKo,
      ...passReport.actionableDirectivesKo,
      failReport.headlineKo,
      failReport.summaryParagraphKo,
      ...failReport.bulletLinesKo,
      ...failReport.actionableDirectivesKo,
    ].join(" ");

    const bannedTranslationese = [
      "하는 것을 가능하게 합니다",
      "직관적인 경험을 제공합니다",
      "원활한 워크플로우를 보장합니다",
      "제공합니다",
      "보장합니다",
    ];
    for (const phrase of bannedTranslationese) {
      expect(combinedText).not.toContain(phrase);
    }
  });

  it("NaN·Infinity 등 비정상 카메라·각도 입력이 들어와도 유한한 결과와 안전한 SVG를 반환한다", () => {
    const pose = buildWebtoonAnatomyPose({
      proportionPreset: "action-8head",
      posePreset: "standing-neutral",
      customAngles: {
        pelvisPitchDeg: Number.NaN,
        leftElbowFlexDeg: Number.POSITIVE_INFINITY,
      },
      clampToRom: true,
    });
    const proj = projectAnatomyForeshortening(pose, {
      focalLengthMm: Number.NaN,
      cameraYawDeg: Number.POSITIVE_INFINITY,
      cameraPitchDeg: Number.NEGATIVE_INFINITY,
      cameraDistanceM: Number.NaN,
    });
    const audit = auditPoseBalanceAndSilhouette(proj);
    const svg = renderAnatomyForeshorteningSvg(proj, audit);

    expect(Number.isFinite(proj.wristToHeadScaleRatio)).toBe(true);
    expect(Number.isFinite(audit.silhouetteClarityScore)).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });
});
