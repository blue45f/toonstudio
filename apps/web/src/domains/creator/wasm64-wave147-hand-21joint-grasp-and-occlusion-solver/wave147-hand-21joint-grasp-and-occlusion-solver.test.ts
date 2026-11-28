import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAND_CAMERA_SPEC,
  GRASP_PENETRATION_THRESHOLD_MM,
  HAND_21_JOINT_IDS,
  HAND_FINGER_IDS,
  HAND_POSE_PRESETS,
  HAND_PRESET_IDS,
  auditGraspPropPenetration,
  auditHandAnatomicalRom,
  auditHandSelfPenetration,
  auditHandSilhouetteClarity,
  buildHand21JointPose,
  buildHandCapsuleGuideWgsl,
  canonicalJsonStringify,
  computeHandPoseManifestSha256,
  computePropOutwardNormal,
  createHandPresetSpec,
  encodeHandUtf8Bytes,
  escapeSvgXmlText,
  getPresetDefaultProp,
  projectHandPose2D,
  renderHand21JointAuditSvg,
  sampleCapsuleToPropSdf,
  sha256CanonicalObjectHex,
  sha256HandBytesHex,
  signedDistancePointToPropMm,
  solveCollisionFreeHandGrasp,
  summarizeHandPoseAuditKo,
  validateHandCapsuleGuideWgsl,
  vec3,
  type BoxGraspProp,
  type CylinderGraspProp,
  type HandCameraProjectionSpec,
  type HandGuideShaderMode,
  type SphereGraspProp,
} from "./index";

const SIDE_CAMERA: HandCameraProjectionSpec = {
  positionMm: vec3(420, 120, 8),
  targetMm: vec3(0, 120, 0),
  up: vec3(0, 1, 0),
  focalLengthPx: 540,
  viewportWidthPx: 480,
  viewportHeightPx: 480,
};

describe("Wave 147 — 21-관절 손 해부학 기구학 & ROM 감사기", () => {
  it("1. 정본 21개 관절과 20개 캡슐 뼈대 트리를 정확히 생성한다", () => {
    const pose = buildHand21JointPose(createHandPresetSpec("open-palm", "right"));
    expect(pose.joints).toHaveLength(21);
    expect(pose.capsules).toHaveLength(20);
    expect(pose.joints.map((j) => j.id)).toEqual(HAND_21_JOINT_IDS);
    expect(pose.jointMap.wrist.parentId).toBeNull();
    for (let i = 1; i < pose.joints.length; i += 1) {
      expect(pose.joints[i]?.parentId).not.toBeNull();
    }
    for (const cap of pose.capsules) {
      expect(cap.lengthMm).toBeGreaterThan(10);
      expect(cap.radiusMm).toBeGreaterThan(4);
    }
  });

  it("2. 5개 손가락(엄지~소지)마다 정확히 4관절과 4캡슐이 배정된다", () => {
    const pose = buildHand21JointPose(createHandPresetSpec("open-palm", "right"));
    for (const finger of HAND_FINGER_IDS) {
      expect(pose.joints.filter((j) => j.finger === finger)).toHaveLength(4);
      expect(pose.capsules.filter((c) => c.finger === finger)).toHaveLength(4);
    }
  });

  it("3. 좌수(left)와 우수(right)는 6종 프리셋 21관절 전원 X축 미러 대칭을 만족한다", () => {
    for (const presetId of HAND_PRESET_IDS) {
      const rPose = buildHand21JointPose(createHandPresetSpec(presetId, "right"));
      const lPose = buildHand21JointPose(createHandPresetSpec(presetId, "left"));
      for (let i = 0; i < 21; i += 1) {
        const r = rPose.joints[i]?.positionMm;
        const l = lPose.joints[i]?.positionMm;
        expect(r).toBeDefined();
        expect(l).toBeDefined();
        if (r !== undefined && l !== undefined) {
          expect(l.x).toBeCloseTo(-r.x, 3);
          expect(l.y).toBeCloseTo(r.y, 3);
          expect(l.z).toBeCloseTo(r.z, 3);
        }
      }
    }
  });

  it("4. 손바닥 너비 비율 스케일링과 중지 최장·소지 최단 해부학 비율을 유지한다", () => {
    const basePose = buildHand21JointPose(createHandPresetSpec("open-palm", "right", 84));
    const smallPose = buildHand21JointPose(createHandPresetSpec("open-palm", "right", 63));
    const fingerLen = (pose: ReturnType<typeof buildHand21JointPose>, finger: string): number =>
      pose.capsules
        .filter((c) => c.finger === finger && c.kind !== "metacarpal")
        .reduce((acc, c) => acc + c.lengthMm, 0);

    expect(fingerLen(basePose, "middle")).toBeGreaterThan(fingerLen(basePose, "index"));
    expect(fingerLen(basePose, "middle")).toBeGreaterThan(fingerLen(basePose, "ring"));
    expect(fingerLen(basePose, "ring")).toBeGreaterThan(fingerLen(basePose, "pinky"));
    expect(fingerLen(smallPose, "middle") / fingerLen(basePose, "middle")).toBeCloseTo(0.75, 2);
  });

  it("5. 웹툰 실무 6종 프리셋 전원이 ROM 위반 0건과 자체 관통 0건을 만족한다", () => {
    expect(HAND_PRESET_IDS).toHaveLength(6);
    for (const presetId of HAND_PRESET_IDS) {
      const spec = createHandPresetSpec(presetId, "right");
      const romAudit = auditHandAnatomicalRom(spec);
      const selfAudit = auditHandSelfPenetration(buildHand21JointPose(spec));
      expect(romAudit.passed, `${presetId} ROM 위반`).toBe(true);
      expect(romAudit.violationCount).toBe(0);
      expect(selfAudit.selfPenetrationCount, `${presetId} 자체 관통`).toBe(0);
      expect(HAND_POSE_PRESETS[presetId].labelKo.length).toBeGreaterThan(0);
    }
  });

  it("6. 인위적 손가락 PIP/DIP 역꺾임(-40°)을 탐지하고 클램핑으로 복구한다", () => {
    const base = createHandPresetSpec("open-palm", "right");
    const audit = auditHandAnatomicalRom({
      ...base,
      fingers: { ...base.fingers, index: { ...base.fingers.index, pipFlexDeg: -40, dipFlexDeg: -32 } },
    });
    expect(audit.passed).toBe(false);
    expect(audit.hyperextensionCount).toBe(2);
    expect(audit.clampedSpec.fingers.index.pipFlexDeg).toBe(-5);
    expect(audit.clampedSpec.fingers.index.dipFlexDeg).toBe(-5);
    expect(audit.clampedPose.joints).toHaveLength(21);
    expect(auditHandAnatomicalRom(audit.clampedSpec).passed).toBe(true);
  });

  it("7. PIP 과굴곡(>115°) 및 DIP 과굴곡(>90°) 위반을 탐지하고 상한으로 클램핑한다", () => {
    const base = createHandPresetSpec("clenched-fist", "right");
    const audit = auditHandAnatomicalRom({
      ...base,
      fingers: { ...base.fingers, middle: { ...base.fingers.middle, pipFlexDeg: 142, dipFlexDeg: 124 } },
    });
    expect(audit.passed).toBe(false);
    expect(audit.overflexionCount).toBe(2);
    expect(audit.maxExcessDeg).toBeGreaterThanOrEqual(27);
    expect(audit.clampedSpec.fingers.middle.pipFlexDeg).toBe(115);
    expect(audit.clampedSpec.fingers.middle.dipFlexDeg).toBe(90);
  });

  it("8. 손목 가동범위·외전 한계·엄지 대립각 이탈을 각각 탐지하고 클램핑한다", () => {
    const base = createHandPresetSpec("open-palm", "right");
    const audit = auditHandAnatomicalRom({
      ...base,
      wristAngles: { flexionDeg: 110, radialUlnarDeg: -60, pronationDeg: 125 },
      fingers: {
        ...base.fingers,
        thumb: { ...base.fingers.thumb, oppositionDeg: 98 },
        pinky: { ...base.fingers.pinky, mcpAbductDeg: 55 },
      },
    });
    expect(audit.violationCount).toBe(5);
    expect(audit.violations.some((v) => v.kind === "wrist-limit")).toBe(true);
    expect(audit.violations.some((v) => v.kind === "opposition-limit")).toBe(true);
    expect(audit.violations.some((v) => v.kind === "abduction-limit")).toBe(true);
    expect(auditHandAnatomicalRom(audit.clampedSpec).passed).toBe(true);
  });

  it("9. clampToRom: true 옵션으로 빌드하면 위반 각도가 즉시 해부학 범위로 교정된다", () => {
    const base = createHandPresetSpec("pointing-accusation", "right");
    const pose = buildHand21JointPose({
      ...base,
      clampToRom: true,
      fingers: { ...base.fingers, index: { ...base.fingers.index, pipFlexDeg: -45 } },
    });
    expect(pose.fingerAngles.index.pipFlexDeg).toBe(-5);
  });

  it("10. 관절이 구부러져도 20개 지골 뼈 길이는 불변으로 유지된다", () => {
    const openPose = buildHand21JointPose(createHandPresetSpec("open-palm", "right"));
    const fistPose = buildHand21JointPose(createHandPresetSpec("clenched-fist", "right"));
    for (let i = 0; i < 20; i += 1) {
      expect(fistPose.capsules[i]?.lengthMm).toBeCloseTo(openPose.capsules[i]?.lengthMm ?? 0, 2);
    }
  });
});

describe("Wave 147 — 3D 소품 SDF & 물체 파지 관통 제로 솔버", () => {
  it("11. 원통·직육면체·구 3종 소품의 점 SDF가 내부 음수·표면 0·외부 양수를 반환한다", () => {
    const cyl: CylinderGraspProp = { id: "c1", labelKo: "검 자루", kind: "cylinder", centerMm: vec3(0, 0, 0), radiusMm: 16, lengthMm: 120, axis: vec3(1, 0, 0) };
    const box: BoxGraspProp = { id: "b1", labelKo: "스마트폰", kind: "box", centerMm: vec3(0, 0, 0), sizeMm: vec3(70, 140, 10) };
    const sph: SphereGraspProp = { id: "s1", labelKo: "찻잔", kind: "sphere", centerMm: vec3(0, 0, 0), radiusMm: 20 };

    expect(signedDistancePointToPropMm(vec3(0, 0, 0), cyl)).toBeCloseTo(-16, 4);
    expect(signedDistancePointToPropMm(vec3(0, 16, 0), cyl)).toBeCloseTo(0, 4);
    expect(signedDistancePointToPropMm(vec3(0, 26, 0), cyl)).toBeCloseTo(10, 4);
    expect(signedDistancePointToPropMm(vec3(0, 0, 0), box)).toBeCloseTo(-5, 4);
    expect(signedDistancePointToPropMm(vec3(0, 0, 5), box)).toBeCloseTo(0, 4);
    expect(signedDistancePointToPropMm(vec3(0, 0, 12), box)).toBeCloseTo(7, 4);
    expect(signedDistancePointToPropMm(vec3(0, 0, 0), sph)).toBeCloseTo(-20, 4);
    expect(signedDistancePointToPropMm(vec3(20, 0, 0), sph)).toBeCloseTo(0, 4);
    expect(signedDistancePointToPropMm(vec3(28, 0, 0), sph)).toBeCloseTo(8, 4);
  });

  it("12. 소품 외향 법선과 캡슐 SDF 최소 관통 깊이가 정확히 계산된다", () => {
    const sph: SphereGraspProp = { id: "s-norm", labelKo: "구", kind: "sphere", centerMm: vec3(10, 20, 30), radiusMm: 15 };
    expect(computePropOutwardNormal(vec3(10, 20, 45), sph).z).toBeCloseTo(1, 3);
    const hit = sampleCapsuleToPropSdf(vec3(0, 20, 46), vec3(20, 20, 46), 6, sph);
    expect(hit.penetrationDepthMm).toBeCloseTo(5, 2);
    expect(hit.signedDistanceMm).toBeCloseTo(-5, 2);
  });

  it("13. 검 자루(원통) 파지 시 의도적 관통 주입 후 솔버가 관통 0건(<0.05mm)으로 교정한다", () => {
    const prop: CylinderGraspProp = { id: "katana-hilt", labelKo: "검 자루(원통)", kind: "cylinder", centerMm: vec3(0, 82, 34), radiusMm: 17, lengthMm: 150, axis: vec3(1, 0, 0) };
    const base = createHandPresetSpec("sword-hilt-grip", "right");
    const penetratingSpec = {
      ...base,
      fingers: {
        ...base.fingers,
        index: { mcpFlexDeg: 86, mcpAbductDeg: 4, pipFlexDeg: 94, dipFlexDeg: 68 },
        middle: { mcpFlexDeg: 88, mcpAbductDeg: 0, pipFlexDeg: 98, dipFlexDeg: 70 },
        ring: { mcpFlexDeg: 86, mcpAbductDeg: 4, pipFlexDeg: 94, dipFlexDeg: 66 },
        pinky: { mcpFlexDeg: 80, mcpAbductDeg: 8, pipFlexDeg: 88, dipFlexDeg: 62 },
      },
    };
    const beforeAudit = auditGraspPropPenetration(buildHand21JointPose(penetratingSpec), prop);
    expect(beforeAudit.penetrationCount).toBeGreaterThan(0);
    expect(beforeAudit.maxPenetrationMm).toBeGreaterThan(3);

    const solved = solveCollisionFreeHandGrasp(penetratingSpec, prop);
    expect(solved.converged).toBe(true);
    expect(solved.afterPropAudit.penetrationCount).toBe(0);
    expect(solved.afterPropAudit.maxPenetrationMm).toBeLessThan(GRASP_PENETRATION_THRESHOLD_MM);
    expect(solved.afterSelfAudit.selfPenetrationCount).toBe(0);
    expect(solved.afterRomAudit.passed).toBe(true);
  });

  it("14. 스마트폰(직육면체) 파지 시 의도적 관통 주입 후 솔버가 관통 0건으로 교정한다", () => {
    const prop: BoxGraspProp = { id: "phone-box", labelKo: "스마트폰(직육면체)", kind: "box", centerMm: vec3(0, 96, 36), sizeMm: vec3(72, 146, 10) };
    const base = createHandPresetSpec("smartphone-hold", "right");
    const penetratingSpec = {
      ...base,
      fingers: {
        ...base.fingers,
        index: { mcpFlexDeg: 52, mcpAbductDeg: 8, pipFlexDeg: 48, dipFlexDeg: 32 },
        middle: { mcpFlexDeg: 54, mcpAbductDeg: 0, pipFlexDeg: 50, dipFlexDeg: 34 },
        ring: { mcpFlexDeg: 52, mcpAbductDeg: 8, pipFlexDeg: 48, dipFlexDeg: 32 },
        pinky: { mcpFlexDeg: 48, mcpAbductDeg: 12, pipFlexDeg: 46, dipFlexDeg: 30 },
      },
    };
    expect(auditGraspPropPenetration(buildHand21JointPose(penetratingSpec), prop).penetrationCount).toBeGreaterThan(0);

    const solved = solveCollisionFreeHandGrasp(penetratingSpec, prop);
    expect(solved.converged).toBe(true);
    expect(solved.afterPropAudit.penetrationCount).toBe(0);
    expect(solved.afterPropAudit.maxPenetrationMm).toBeLessThan(GRASP_PENETRATION_THRESHOLD_MM);
    expect(solved.afterSelfAudit.selfPenetrationCount).toBe(0);
    expect(solved.afterRomAudit.passed).toBe(true);
  });

  it("15. 찻잔(구형 손잡이) 집기 관통 주입 시 관통 0건으로 수렴한다", () => {
    const prop: SphereGraspProp = { id: "teacup-sphere", labelKo: "찻잔 손잡이(구)", kind: "sphere", centerMm: vec3(28, 134, 48), radiusMm: 18 };
    const base = createHandPresetSpec("teacup-pinch", "right");
    const penetratingSpec = {
      ...base,
      fingers: {
        ...base.fingers,
        thumb: { mcpFlexDeg: 36, mcpAbductDeg: 22, pipFlexDeg: 32, dipFlexDeg: 28, oppositionDeg: 55 },
        index: { mcpFlexDeg: 52, mcpAbductDeg: 4, pipFlexDeg: 48, dipFlexDeg: 36 },
      },
    };
    expect(auditGraspPropPenetration(buildHand21JointPose(penetratingSpec), prop).penetrationCount).toBeGreaterThan(0);

    const solved = solveCollisionFreeHandGrasp(penetratingSpec, prop);
    expect(solved.converged).toBe(true);
    expect(solved.afterPropAudit.penetrationCount).toBe(0);
    expect(solved.afterPropAudit.maxPenetrationMm).toBeLessThan(GRASP_PENETRATION_THRESHOLD_MM);
    expect(solved.afterRomAudit.passed).toBe(true);
  });

  it("16. 손바닥 중수골 자체가 소품에 파묻힌 경우 최소 손목 이동으로 완전 복구한다", () => {
    const prop: CylinderGraspProp = { id: "deep-palm-hilt", labelKo: "밀착 검 자루", kind: "cylinder", centerMm: vec3(0, 62, 12), radiusMm: 18, lengthMm: 140, axis: vec3(1, 0, 0) };
    const solved = solveCollisionFreeHandGrasp(createHandPresetSpec("sword-hilt-grip", "right"), prop);
    expect(solved.beforePropAudit.penetrationCount).toBeGreaterThan(0);
    expect(solved.converged).toBe(true);
    expect(solved.afterPropAudit.penetrationCount).toBe(0);
    expect(Math.hypot(solved.wristOffsetAppliedMm.x, solved.wristOffsetAppliedMm.y, solved.wristOffsetAppliedMm.z)).toBeGreaterThan(1);
  });

  it("17. 손가락 간 자체 관통을 주입하면 감사기가 탐지하고 솔버가 0건으로 해소한다", () => {
    const base = createHandPresetSpec("open-palm", "right");
    const crossedSpec = {
      ...base,
      fingers: {
        ...base.fingers,
        index: { mcpFlexDeg: 10, mcpAbductDeg: -12, pipFlexDeg: 12, dipFlexDeg: 8 },
        middle: { mcpFlexDeg: 10, mcpAbductDeg: 14, pipFlexDeg: 12, dipFlexDeg: 8 },
      },
    };
    expect(auditHandSelfPenetration(buildHand21JointPose(crossedSpec)).selfPenetrationCount).toBeGreaterThan(0);
    const distantProp: SphereGraspProp = { id: "far", labelKo: "보조구", kind: "sphere", centerMm: vec3(0, 260, 200), radiusMm: 10 };
    const solved = solveCollisionFreeHandGrasp(crossedSpec, distantProp);
    expect(solved.afterSelfAudit.selfPenetrationCount).toBe(0);
    expect(solved.afterRomAudit.passed).toBe(true);
  });

  it("18. 왼손(left) 대칭 검 자루 파지 관통도 솔버가 0건으로 교정한다", () => {
    const prop = getPresetDefaultProp("sword-hilt-grip", "left");
    expect(prop).not.toBeNull();
    const base = createHandPresetSpec("sword-hilt-grip", "left");
    const squeezed = {
      ...base,
      fingers: {
        ...base.fingers,
        index: { mcpFlexDeg: 84, mcpAbductDeg: 4, pipFlexDeg: 92, dipFlexDeg: 64 },
        middle: { mcpFlexDeg: 86, mcpAbductDeg: 0, pipFlexDeg: 96, dipFlexDeg: 68 },
      },
    };
    if (prop !== null) {
      const solved = solveCollisionFreeHandGrasp(squeezed, prop);
      expect(solved.converged).toBe(true);
      expect(solved.afterPropAudit.penetrationCount).toBe(0);
      expect(solved.afterSelfAudit.selfPenetrationCount).toBe(0);
    }
  });

  it("19. 회전된 직육면체 스마트폰 소품에서도 관통 0건 솔버가 정상 동작한다", () => {
    const tiltedPhone: BoxGraspProp = { id: "tilted-phone", labelKo: "기울어진 스마트폰", kind: "box", centerMm: vec3(4, 92, 34), sizeMm: vec3(72, 146, 9), rotationDeg: vec3(8, -12, 6) };
    const base = createHandPresetSpec("smartphone-hold", "right");
    const overCurled = {
      ...base,
      fingers: {
        ...base.fingers,
        index: { mcpFlexDeg: 58, mcpAbductDeg: 4, pipFlexDeg: 60, dipFlexDeg: 40 },
        middle: { mcpFlexDeg: 60, mcpAbductDeg: 0, pipFlexDeg: 62, dipFlexDeg: 42 },
      },
    };
    const solved = solveCollisionFreeHandGrasp(overCurled, tiltedPhone);
    expect(solved.converged).toBe(true);
    expect(solved.afterPropAudit.penetrationCount).toBe(0);
    expect(solved.afterPropAudit.maxPenetrationMm).toBeLessThan(GRASP_PENETRATION_THRESHOLD_MM);
  });

  it("20. 파지 솔버에 ROM 위반 포즈가 입력되어도 결과는 항상 ROM 통과 및 관통 0건이다", () => {
    const prop = getPresetDefaultProp("sword-hilt-grip", "right");
    expect(prop).not.toBeNull();
    const base = createHandPresetSpec("sword-hilt-grip", "right");
    if (prop !== null) {
      const solved = solveCollisionFreeHandGrasp(
        { ...base, fingers: { ...base.fingers, ring: { mcpFlexDeg: 112, mcpAbductDeg: 35, pipFlexDeg: 140, dipFlexDeg: -25 } } },
        prop,
      );
      expect(solved.beforeRomAudit.passed).toBe(false);
      expect(solved.afterRomAudit.passed).toBe(true);
      expect(solved.afterPropAudit.penetrationCount).toBe(0);
    }
  });
});

describe("Wave 147 — 핀홀 3D->2D 투영 & 5손가락 실루엣 분리도 감사·개선", () => {
  it("21. 정면 카메라에서 편 손(open-palm)은 21관절 투영과 5손가락 끝 겹침 0쌍을 만족한다", () => {
    const pose = buildHand21JointPose(createHandPresetSpec("open-palm", "right"));
    expect(projectHandPose2D(pose, DEFAULT_HAND_CAMERA_SPEC)).toHaveLength(21);
    const audit = auditHandSilhouetteClarity(pose, DEFAULT_HAND_CAMERA_SPEC);
    expect(audit.tipSeparations).toHaveLength(10);
    expect(audit.overlappingTipPairs).toHaveLength(0);
    expect(audit.hasAmbiguousOverlap).toBe(false);
    expect(audit.silhouetteClarityScore).toBeGreaterThanOrEqual(80);
  });

  it("22. 측면(프로필) 카메라에서 겹쳐 뭉개진 5손가락 끝을 탐지하고 미세 회전/외전으로 개선한다", () => {
    const base = createHandPresetSpec("open-palm", "right");
    const flatAligned = buildHand21JointPose({
      ...base,
      fingers: {
        thumb: { mcpFlexDeg: 2, mcpAbductDeg: 14, pipFlexDeg: 2, dipFlexDeg: 2, oppositionDeg: 4 },
        index: { mcpFlexDeg: 4, mcpAbductDeg: 0, pipFlexDeg: 4, dipFlexDeg: 2 },
        middle: { mcpFlexDeg: 4, mcpAbductDeg: 0, pipFlexDeg: 4, dipFlexDeg: 2 },
        ring: { mcpFlexDeg: 4, mcpAbductDeg: 0, pipFlexDeg: 4, dipFlexDeg: 2 },
        pinky: { mcpFlexDeg: 4, mcpAbductDeg: 0, pipFlexDeg: 4, dipFlexDeg: 2 },
      },
    });
    const audit = auditHandSilhouetteClarity(flatAligned, SIDE_CAMERA);
    expect(audit.hasAmbiguousOverlap).toBe(true);
    expect(audit.overlappingTipPairs.length).toBeGreaterThanOrEqual(2);
    expect(audit.refinement.applied).toBe(true);
    expect(audit.refinement.afterScore).toBeGreaterThan(audit.refinement.beforeScore);
    expect(audit.refinement.afterOverlapCount).toBeLessThan(audit.refinement.beforeOverlapCount);
    expect(auditHandAnatomicalRom(audit.refinement.refinedSpec).passed).toBe(true);
  });

  it("23. autoRefine: false 옵션일 때는 개선 탐색을 건너뛰고 원본 점수를 유지한다", () => {
    const pose = buildHand21JointPose(createHandPresetSpec("clenched-fist", "right"));
    const audit = auditHandSilhouetteClarity(pose, SIDE_CAMERA, { autoRefine: false });
    expect(audit.refinement.applied).toBe(false);
    expect(audit.refinement.afterScore).toBe(audit.refinement.beforeScore);
  });

  it("24. 소품 제약을 함께 넘겨 실루엣을 보정할 때도 소품 관통 0건을 유지한다", () => {
    const prop = getPresetDefaultProp("teacup-pinch", "right");
    expect(prop).not.toBeNull();
    if (prop !== null) {
      const solved = solveCollisionFreeHandGrasp(createHandPresetSpec("teacup-pinch", "right"), prop);
      const audit = auditHandSilhouetteClarity(solved.solvedPose, SIDE_CAMERA, { prop, autoRefine: true });
      expect(auditGraspPropPenetration(audit.refinement.refinedPose, prop).penetrationCount).toBe(0);
    }
  });
});

describe("Wave 147 — WebGPU WGSL 21-관절 손 캡슐 SDF 셰이더 생성 및 검증", () => {
  it("25. 3종 가이드 모드 WGSL이 모두 16B 정렬(64B)·20캡슐·바인딩·괄호 검증을 통과한다", () => {
    const modes: readonly HandGuideShaderMode[] = ["silhouette-outline", "penetration-heatmap", "anatomy-wireframe"];
    for (const mode of modes) {
      const artifact = buildHandCapsuleGuideWgsl(mode);
      const report = validateHandCapsuleGuideWgsl(artifact);
      expect(report.valid, `${mode}: ${report.errors.join("; ")}`).toBe(true);
      expect(report.errors).toHaveLength(0);
      expect(artifact.uniformBufferByteLength).toBe(64);
      expect(artifact.uniformBufferByteLength % 16).toBe(0);
      expect(artifact.capsuleSegmentCount).toBe(20);
      expect(artifact.jointMarkerCount).toBe(21);
      expect(artifact.bindings).toHaveLength(4);
    }
  });

  it("26. 16바이트 비정렬 유니폼 및 잘못된 캡슐 개수를 검증기가 거부한다", () => {
    const base = buildHandCapsuleGuideWgsl("silhouette-outline");
    const report = validateHandCapsuleGuideWgsl({ ...base, uniformBufferByteLength: 52, capsuleSegmentCount: 18 });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("16바이트"))).toBe(true);
    expect(report.errors.some((e) => e.includes("20개"))).toBe(true);
  });

  it("27. 괄호 불균형 및 누락된 바인딩 선언을 검증기가 정확히 잡아낸다", () => {
    const base = buildHandCapsuleGuideWgsl("silhouette-outline");
    const brokenWgsl = base.wgsl
      .replace("@group(0) @binding(2)", "@group(0) @binding(9)")
      .concat("\nfn broken_brace(x: f32) -> f32 { return x;\n");
    const report = validateHandCapsuleGuideWgsl({ ...base, wgsl: brokenWgsl });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("괄호"))).toBe(true);
    expect(report.errors.some((e) => e.includes("@binding(2)"))).toBe(true);
  });

  it("28. GLSL 금지어(gl_FragCoord, sampler2D, vec3(, #version)를 검증기가 차단한다", () => {
    const base = buildHandCapsuleGuideWgsl("anatomy-wireframe");
    const glslContaminated =
      "#version 450\n" +
      base.wgsl +
      "\nfn bad() { let p = gl_FragCoord.xy; let v = vec3(1.0); let s = sampler2D; }\n";
    const report = validateHandCapsuleGuideWgsl({ ...base, wgsl: glslContaminated });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("gl_FragCoord"))).toBe(true);
    expect(report.errors.some((e) => e.includes("GLSL vec2/3/4"))).toBe(true);
    expect(report.errors.some((e) => e.includes("sampler2D"))).toBe(true);
    expect(report.errors.some((e) => e.includes("#version"))).toBe(true);
  });
});

describe("Wave 147 — 순수 OKLCH SVG 렌더러 · XSS 이스케이프 · 한국어 QA 브리프", () => {
  it("29. 라이트/다크 테마 SVG가 순수 oklch(...)만 사용하고 원시 hex/rgb/hsl을 포함하지 않는다", () => {
    const spec = createHandPresetSpec("sword-hilt-grip", "right");
    const prop = getPresetDefaultProp("sword-hilt-grip", "right") ?? undefined;
    const pose = buildHand21JointPose(spec);
    const romAudit = auditHandAnatomicalRom(spec);
    const propAudit = prop ? auditGraspPropPenetration(pose, prop) : undefined;
    const selfAudit = auditHandSelfPenetration(pose);

    for (const theme of ["light", "dark"] as const) {
      const svg = renderHand21JointAuditSvg(pose, { theme, prop, romAudit, propAudit, selfAudit });
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\brgba?\s*\(/i);
      expect(svg).not.toMatch(/\bhsla?\s*\(/i);
      expect(svg).not.toContain("NaN");
      expect(svg).not.toContain("Infinity");
    }
  });

  it("30. 직육면체 스마트폰과 구형 찻잔 소품 윤곽도 OKLCH SVG에 정상 렌더링된다", () => {
    const phoneSvg = renderHand21JointAuditSvg(
      buildHand21JointPose(createHandPresetSpec("smartphone-hold", "right")),
      { prop: getPresetDefaultProp("smartphone-hold", "right") ?? undefined },
    );
    expect(phoneSvg).toContain("<polygon");
    expect(phoneSvg).toContain("스마트폰");

    const cupSvg = renderHand21JointAuditSvg(
      buildHand21JointPose(createHandPresetSpec("teacup-pinch", "right")),
      { prop: getPresetDefaultProp("teacup-pinch", "right") ?? undefined },
    );
    expect(cupSvg).toContain("<circle");
    expect(cupSvg).toContain("찻잔");
  });

  it("31. SVG 제목과 소품 이름의 악성 XML/XSS 페이로드를 안전하게 이스케이프한다", () => {
    const payload = `<script>alert("xss"&'1')</script>`;
    expect(escapeSvgXmlText(payload)).toBe("&lt;script&gt;alert(&quot;xss&quot;&amp;&#39;1&#39;)&lt;/script&gt;");
    const pose = buildHand21JointPose(createHandPresetSpec("open-palm", "right"));
    const evilProp: SphereGraspProp = { id: "evil", labelKo: `<img src=x onerror="alert(1)">`, kind: "sphere", centerMm: vec3(20, 120, 40), radiusMm: 12 };
    const svg = renderHand21JointAuditSvg(pose, { title: payload, prop: evilProp });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("32. 통과/경고/실패 3가지 상태의 한국어 QA 브리프가 번역투 없이 생성된다", () => {
    const cleanSpec = createHandPresetSpec("open-palm", "right");
    const cleanPose = buildHand21JointPose(cleanSpec);
    const passReport = summarizeHandPoseAuditKo({
      pose: cleanPose,
      romAudit: auditHandAnatomicalRom(cleanSpec),
      selfAudit: auditHandSelfPenetration(cleanPose),
      silhouetteAudit: auditHandSilhouetteClarity(cleanPose, DEFAULT_HAND_CAMERA_SPEC),
    });
    expect(passReport.verdict).toBe("pass");
    expect(passReport.verdictLabelKo).toBe("작화 투입 가능");
    expect(passReport.handPoseSha256Hex).toMatch(/^[0-9a-f]{64}$/);

    const brokenSpec = { ...cleanSpec, fingers: { ...cleanSpec.fingers, index: { ...cleanSpec.fingers.index, pipFlexDeg: -38 } } };
    const failReport = summarizeHandPoseAuditKo({ pose: buildHand21JointPose(brokenSpec), romAudit: auditHandAnatomicalRom(brokenSpec) });
    expect(failReport.verdict).toBe("fail");
    expect(failReport.verdictLabelKo).toBe("해부학·관통 수정 필요");

    const warnReport = summarizeHandPoseAuditKo({
      pose: cleanPose,
      romAudit: auditHandAnatomicalRom(cleanSpec),
      selfAudit: auditHandSelfPenetration(cleanPose),
      silhouetteAudit: auditHandSilhouetteClarity(cleanPose, SIDE_CAMERA),
    });
    expect(warnReport.verdict).toBe("warn");
    expect(warnReport.verdictLabelKo).toBe("실루엣 보정 권장");

    for (const text of [passReport.summaryParagraphKo, warnReport.summaryParagraphKo, failReport.summaryParagraphKo]) {
      expect(text).not.toContain("가능하게 합니다");
      expect(text).not.toContain("직관적인 경험을 제공");
      expect(text).not.toContain("원활한 워크플로우");
    }
  });
});

describe("Wave 147 — 순수 ES2017 FIPS 180-4 SHA-256 결정론 검증", () => {
  it("33. NIST FIPS 180-4 공식 SHA-256 벡터(빈 문자열·abc)와 정확히 일치한다", () => {
    expect(sha256HandBytesHex(encodeHandUtf8Bytes(""))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256HandBytesHex(encodeHandUtf8Bytes("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("34. 정규 JSON 직렬화는 객체 키 순서가 달라도 동일한 SHA-256 지문을 생성한다", () => {
    const a = { b: 2, a: 1, nested: { z: true, m: "손" } };
    const b = { nested: { m: "손", z: true }, a: 1, b: 2 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(sha256CanonicalObjectHex(a)).toBe(sha256CanonicalObjectHex(b));
  });

  it("35. 동일 21-관절 손 포즈의 handPoseSha256Hex는 결정론적이고 각도 변경 시 달라진다", () => {
    const specA = createHandPresetSpec("sword-hilt-grip", "right");
    const prop = getPresetDefaultProp("sword-hilt-grip", "right") ?? undefined;
    const h1 = computeHandPoseManifestSha256(buildHand21JointPose(specA), prop);
    const h2 = computeHandPoseManifestSha256(buildHand21JointPose(specA), prop);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2);

    const specB = { ...specA, fingers: { ...specA.fingers, index: { ...specA.fingers.index, dipFlexDeg: specA.fingers.index.dipFlexDeg + 1 } } };
    expect(computeHandPoseManifestSha256(buildHand21JointPose(specB), prop)).not.toBe(h1);
  });

  it("36. 스마트폰 파지 솔버 결과의 handPoseSha256Hex가 재실행 시 100% 결정론적으로 일치한다", () => {
    const prop = getPresetDefaultProp("smartphone-hold", "right");
    expect(prop).not.toBeNull();
    if (prop !== null) {
      const base = createHandPresetSpec("smartphone-hold", "right");
      const injected = { ...base, fingers: { ...base.fingers, middle: { mcpFlexDeg: 58, mcpAbductDeg: 0, pipFlexDeg: 54, dipFlexDeg: 38 } } };
      const run1 = solveCollisionFreeHandGrasp(injected, prop);
      const run2 = solveCollisionFreeHandGrasp(injected, prop);
      expect(run1.converged).toBe(true);
      expect(run1.handPoseSha256Hex).toBe(run2.handPoseSha256Hex);
      expect(run1.afterPropAudit.penetrationCount).toBe(0);
      expect(run1.afterPropAudit.maxPenetrationMm).toBeLessThan(GRASP_PENETRATION_THRESHOLD_MM);
    }
  });
});
