/**
 * Studio 3D 데생 인형 v5 — 연속 몸통 스키닝·손발 접촉 솔버·콘트라포스토 접지·사면도 픽킹·CSP 호환 단위 테스트.
 *
 * WebGL 없이 실행 가능한 순수 결정적 검증으로 다음 계약을 고정한다:
 * 1. 에코르셰·아사로 다면체 싱글스킨 필터링, 3본 연속 몸통 SkinnedMesh 웨이트 합(=1.0), 신장 불변식, 비대칭 복숭아뼈, 능동 근육 팽창.
 * 2. 2D 핸드 셋업 패드(벌림 × 쥐기 × 엄지 대립 × 주먹 스타일 4종 × 손가락 잠금) 및 3D 벌림 체인.
 * 3. 관절 잠금(Joint Lock) 보존 및 견갑상완 리듬(2:1 쇄골 좌우 대칭 자동 동반 회전).
 * 4. 생체역학 무게중심(CoM) 분석, 좌/우 콘트라포스토 상지 카운터밸런스 + 정밀 바닥 접지(`lowestY === 0`).
 * 5. v5 1인 체형 적응형 손-신체/손-바닥 접촉 IK 솔버(`hip`, `chin`, `chest`, `occiput`, `ground`) 잔차 및 지면 비관통 검증.
 * 6. v5 4분할 사면도(Quad View) 분할 영역 무결성, 서브패널 포인터 픽킹 NDC 역투영(`resolveStudioMannequinQuadPointerNdc`), 화각 클램핑.
 * 7. 클립스튜디오 `.pep`(56본 포즈 + 손가락 30관절) 및 `.3dp`(체형 비율) 양방향 왕복 호환.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildSplayedHandDigitPrimitives,
  buildStudioMannequinEcorchePrimitives,
  buildStudioMannequinLoftTubes,
  buildStudioMannequinSkinnedTorsoSpec,
  computeStudioMannequinFlexionBulge,
  mergeHandPadIntoFingerPose,
  resolveStudioMannequinHandPadPose,
  resolveStudioMannequinSurfaceMode,
  shouldSkipLegacyCoreBodyPrimitive,
} from "./studio-mannequin-ecorche-anatomy";
import {
  STUDIO_MANNEQUIN_HAND_CONTACT_TARGETS,
  analyzeStudioMannequinGesture,
  applyStudioMannequinBreathingParams,
  applyStudioMannequinGazeTarget,
  applyStudioMannequinHandContact,
  buildStudioMannequinContrappostoPose,
} from "./studio-mannequin-gesture-dynamics";
import {
  STUDIO_MANNEQUIN_ARCHETYPE_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  buildStudioMannequinSpec,
  resolveStudioMannequinArchetypeParams,
  studioMannequinRestStature,
  type StudioMannequinArchetypePresetId,
} from "./studio-mannequin-model";
import { measureStudioMannequinBodyFloor } from "./studio-mannequin-pose-ground-contact";
import { createStudioMannequinRestPose, normalizeStudioMannequinPose } from "./studio-mannequin-poses";
import {
  analyzeStudioMannequinBalance,
  applyStudioMannequinJointLocks,
  applyStudioMannequinScapulohumeralRhythm,
  buildStudioMannequinConstructionGuides,
  countStudioMannequinLockedJoints,
  exportMannequinParamsToCsp3dp,
  exportMannequinPoseToCspPep,
  importCsp3dpToMannequinParams,
  importCspPepPoseToMannequin,
  stabilizeStudioMannequinCenterOfMass,
  toggleStudioMannequinJointLock,
} from "./studio-mannequin-pro-kinematics";
import {
  buildStudioMannequinLoftGeometry,
  buildStudioMannequinSkinnedTorsoGeometry,
  createStudioMannequinProOverlayController,
} from "./studio-mannequin-pro-overlays";
import {
  STUDIO_MANNEQUIN_FOV_DEFAULT_DEG,
  STUDIO_MANNEQUIN_FOV_MAX_DEG,
  STUDIO_MANNEQUIN_FOV_MIN_DEG,
  clampStudioMannequinFovDeg,
  computeStudioMannequinQuadViewRects,
  resolveStudioMannequinQuadPointerNdc,
} from "./studio-mannequin-quad-view";

const DEG = Math.PI / 180;

describe("studio-mannequin-ecorche-anatomy (v5 연속 몸통 스키닝 & 능동 근육)", () => {
  it("표면 모드를 안전하게 정규화하고 standard 모드에서는 추가 로프트·근육·연속 몸통 스키닝을 생략한다", () => {
    expect(resolveStudioMannequinSurfaceMode("ecorche")).toBe("ecorche");
    expect(resolveStudioMannequinSurfaceMode("planar")).toBe("planar");
    expect(resolveStudioMannequinSurfaceMode("standard")).toBe("standard");
    expect(resolveStudioMannequinSurfaceMode("invalid")).toBe("ecorche");

    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    expect(buildStudioMannequinLoftTubes(spec, { surfaceMode: "standard" })).toHaveLength(0);
    expect(buildStudioMannequinEcorchePrimitives(spec, { surfaceMode: "standard" })).toHaveLength(0);
    expect(buildStudioMannequinSkinnedTorsoSpec(spec, { surfaceMode: "standard" })).toBeNull();
    expect(spec.primitives.some((p) => shouldSkipLegacyCoreBodyPrimitive(p, "standard"))).toBe(false);
  });

  it("ecorche·planar 모드에서 골반→요추→흉곽 단일 연속 3본 SkinnedMesh 웨이트 합이 모든 정점에서 정확히 1.0이다", () => {
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const skippedEcorche = spec.primitives.filter((p) => shouldSkipLegacyCoreBodyPrimitive(p, "ecorche"));
    const skippedPlanar = spec.primitives.filter((p) => shouldSkipLegacyCoreBodyPrimitive(p, "planar"));
    expect(skippedEcorche.length).toBeGreaterThan(10);
    expect(skippedPlanar.length).toBeGreaterThan(skippedEcorche.length);
    expect(spec.primitives.filter((p) => p.materialRole !== "body").some((p) => shouldSkipLegacyCoreBodyPrimitive(p, "planar"))).toBe(false);

    const planarTubes = buildStudioMannequinLoftTubes(spec, { surfaceMode: "planar" });
    expect(planarTubes.some((t) => t.id === "loft-head-asaro")).toBe(true);
    expect(planarTubes.some((t) => t.id === "loft-spine-waist")).toBe(false);

    for (const mode of ["ecorche", "planar"] as const) {
      const torsoSpec = buildStudioMannequinSkinnedTorsoSpec(spec, { surfaceMode: mode });
      expect(torsoSpec).not.toBeNull();
      expect(torsoSpec!.sections.length).toBe(9);
      const geom = buildStudioMannequinSkinnedTorsoGeometry(torsoSpec!);
      const skinWeights = geom.getAttribute("skinWeight");
      const skinIndices = geom.getAttribute("skinIndex");
      expect(skinWeights).toBeDefined();
      expect(skinIndices).toBeDefined();
      for (let i = 0; i < skinWeights.count; i += 1) {
        const sum = skinWeights.getX(i) + skinWeights.getY(i) + skinWeights.getZ(i) + skinWeights.getW(i);
        expect(sum).toBeCloseTo(1, 5);
      }
      geom.dispose();
    }
  });

  it("모든 6종 웹툰 원형(Archetype)과 에코르셰 모드에서 신장 불변식과 비대칭 복숭아뼈를 보장한다", () => {
    for (const id of Object.keys(STUDIO_MANNEQUIN_ARCHETYPE_PRESETS) as StudioMannequinArchetypePresetId[]) {
      const archetypeParams = resolveStudioMannequinArchetypeParams(id);
      const spec = buildStudioMannequinSpec(archetypeParams);
      expect(studioMannequinRestStature(spec)).toBeCloseTo(archetypeParams.heightCm / 100, 5);
    }

    const spec = buildStudioMannequinSpec({
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      heightCm: 178,
      headCount: 7.6,
    });
    const ecorchePrims = buildStudioMannequinEcorchePrimitives(spec, { surfaceMode: "ecorche" });
    expect(ecorchePrims.length).toBeGreaterThan(24);

    const leftFootLandmarks = ecorchePrims.filter(
      (p) => p.jointId === "leftFoot" && p.kind === "sphere" && p.materialRole === "landmark",
    );
    expect(leftFootLandmarks).toHaveLength(2);
    const [medial, lateral] = leftFootLandmarks;
    if (medial?.kind === "sphere" && lateral?.kind === "sphere") {
      expect(medial.center[1]).toBeGreaterThan(lateral.center[1]);
      expect(medial.center[2]).toBeGreaterThan(lateral.center[2]);
    }
  });

  it("팔꿈치·무릎 굴곡 시 이두박근·비복근 능동 팽창 배율이 단조 증가한다", () => {
    const rest = computeStudioMannequinFlexionBulge(createStudioMannequinRestPose(), 1);
    expect(rest.leftBicepScale).toBe(1);
    expect(rest.leftCalfScale).toBe(1);

    const flexedPose = normalizeStudioMannequinPose({
      joints: {
        leftLowerArm: [-120 * DEG, 0, 0],
        rightLowerArm: [-30 * DEG, 0, 0],
        leftLowerLeg: [130 * DEG, 0, 0],
      },
      pelvisOffset: [0, 0, 0],
    });
    const flexed = computeStudioMannequinFlexionBulge(flexedPose, 1.2);
    expect(flexed.leftBicepScale).toBeGreaterThan(flexed.rightBicepScale);
    expect(flexed.rightBicepScale).toBeGreaterThan(1);
    expect(flexed.leftCalfScale).toBeGreaterThan(1.15);
  });
});

describe("2D 핸드 셋업 패드 & 손가락 벌림(Splay)", () => {
  it("벌림·쥐기·엄지 대립·잠긴 손가락을 반영하고 주먹 스타일마다 차별화된 굴곡을 산출한다", () => {
    const openSpread = resolveStudioMannequinHandPadPose({
      spread: 1,
      clench: 0,
      thumbOpposition: 0,
      fistStyle: "standard",
    });
    expect(openSpread.splayDeg.index).toBeGreaterThan(10);
    expect(openSpread.splayDeg.little).toBeLessThan(-15);
    expect(openSpread.segmentCurls.index).toEqual([0, 0, 0]);

    const pointPose = resolveStudioMannequinHandPadPose({
      spread: 0.4,
      clench: 0.95,
      thumbOpposition: 0.5,
      fistStyle: "pinchPoint",
      lockedFingerCurls: { ring: 12 },
    });
    expect(pointPose.segmentCurls.index[0]).toBeLessThan(15);
    expect(pointPose.segmentCurls.middle[1]).toBeGreaterThan(80);
    expect(pointPose.segmentCurls.ring).toEqual([12, 12, 12]);

    const merged = mergeHandPadIntoFingerPose(undefined, "left", pointPose);
    expect(merged.left.middle[1]).toBeGreaterThan(80);
    expect(merged.right.middle[1]).toBe(0);

    const digits = buildSplayedHandDigitPrimitives("leftHand", 0.16, 1, merged.left, openSpread.splayDeg);
    expect(digits.length).toBe(25);
  });
});

describe("프로 키네마틱스 · 손발 접촉 솔버 · 사면도 픽킹 (v5 실사용 검증)", () => {
  it("잠긴 관절은 새 포즈 적용 시 기존 회전과 골반 위치를 보존한다", () => {
    let locks = toggleStudioMannequinJointLock({}, "leftUpperArm");
    locks = toggleStudioMannequinJointLock(locks, "pelvis");
    expect(countStudioMannequinLockedJoints(locks)).toBe(2);

    const base = normalizeStudioMannequinPose({
      joints: { leftUpperArm: [-0.5, 0.1, 0.4], rightUpperArm: [0, 0, 0] },
      pelvisOffset: [0.12, -0.04, 0.05],
    });
    const next = normalizeStudioMannequinPose({
      joints: { leftUpperArm: [0.2, 0, 0], rightUpperArm: [-0.8, 0, -0.6] },
      pelvisOffset: [-0.3, 0.2, 0],
    });
    const resolved = applyStudioMannequinJointLocks(base, next, locks);
    expect(resolved.joints.leftUpperArm).toEqual(base.joints.leftUpperArm);
    expect(resolved.joints.rightUpperArm).toEqual(next.joints.rightUpperArm);
    expect(resolved.pelvisOffset).toEqual(base.pelvisOffset);
  });

  it("견갑상완 리듬은 양팔 거상 시 좌우 대칭 부호로 쇄골을 상방 회전시키고 잠긴 어깨는 건드리지 않는다", () => {
    const raised = normalizeStudioMannequinPose({
      joints: {
        leftUpperArm: [-70 * DEG, 0, 85 * DEG],
        rightUpperArm: [-70 * DEG, 0, -85 * DEG],
      },
      pelvisOffset: [0, 0, 0],
    });
    const coupled = applyStudioMannequinScapulohumeralRhythm(raised);
    const lClav = coupled.joints.leftShoulder ?? [0, 0, 0];
    const rClav = coupled.joints.rightShoulder ?? [0, 0, 0];
    expect(lClav[2]).toBeGreaterThan(10 * DEG);
    expect(rClav[2]).toBeCloseTo(-lClav[2], 5);
    expect(rClav[1]).toBeCloseTo(-lClav[1], 5);
  });

  it("무게중심(CoM) 분석기는 전도 위험을 감지하고 원클릭 보정으로 안정 범위 안으로 복원한다", () => {
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    expect(analyzeStudioMannequinBalance(spec, createStudioMannequinRestPose()).state).toBe("balanced");

    const leaning = normalizeStudioMannequinPose({
      joints: { spine: [0, 0, 0.42], chest: [0.35, 0, 0.35] },
      pelvisOffset: [0.38, 0, 0.28],
    });
    const offReport = analyzeStudioMannequinBalance(spec, leaning);
    expect(offReport.state).toBe("off-balance");

    const stabilized = stabilizeStudioMannequinCenterOfMass(spec, leaning);
    const afterReport = analyzeStudioMannequinBalance(spec, stabilized);
    expect(afterReport.horizontalOffsetCm).toBeLessThan(offReport.horizontalOffsetCm * 0.25);
    expect(afterReport.state).toBe("balanced");

    const jumpPose = normalizeStudioMannequinPose({ joints: {}, pelvisOffset: [0.25, 0.65, 0] });
    expect(analyzeStudioMannequinBalance(spec, jumpPose).state).toBe("airborne");
    expect(stabilizeStudioMannequinCenterOfMass(spec, jumpPose)).toEqual(jumpPose);
  });

  it("좌·우 콘트라포스토는 S-리듬·상지 카운터밸런스·정확한 지면 발바닥 접지(y=0)를 모두 달성한다", () => {
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const rest = createStudioMannequinRestPose();
    const leftPose = buildStudioMannequinContrappostoPose(spec, rest, "left", 0.85);
    const rightPose = buildStudioMannequinContrappostoPose(spec, rest, "right", 0.85);
    const leftGesture = analyzeStudioMannequinGesture(spec, leftPose);
    const rightGesture = analyzeStudioMannequinGesture(spec, rightPose);

    expect(leftGesture.hasCounterTilt).toBe(true);
    expect(rightGesture.hasCounterTilt).toBe(true);
    expect(leftGesture.contrappostoAngleDeg).toBeGreaterThan(8);
    expect(analyzeStudioMannequinBalance(spec, leftPose).state).toBe("balanced");
    expect(measureStudioMannequinBodyFloor(spec, leftPose)).toBeCloseTo(0, 4);
    expect(measureStudioMannequinBodyFloor(spec, rightPose)).toBeCloseTo(0, 4);
    expect(leftPose.joints.leftLowerArm?.[0]).toBeLessThan(0);
  });

  it("1인 손 신체·바닥 접촉 IK 솔버는 다양한 체형 원형에서 5종 목표 표면에 침투 없이 밀착한다", () => {
    for (const archetypeId of ["sd5", "hero8", "muscleVillain"] as const) {
      const params = resolveStudioMannequinArchetypeParams(archetypeId);
      const spec = buildStudioMannequinSpec(params);
      const rest = createStudioMannequinRestPose();
      for (const target of STUDIO_MANNEQUIN_HAND_CONTACT_TARGETS) {
        const res = applyStudioMannequinHandContact(spec, rest, "right", target.id);
        expect(res.residualDistanceM).toBeLessThan(0.035);
        expect(measureStudioMannequinBodyFloor(spec, res.pose)).toBeGreaterThanOrEqual(-1e-3);
      }
    }
  });

  it("시선 응시(15/35/50 배분)·호흡 확장 및 4분할 사면도 서브뷰 포인터 NDC 역투영이 정확하다", () => {
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const rest = createStudioMannequinRestPose();
    const looked = applyStudioMannequinGazeTarget(spec, rest, [1.5, 2.1, 2.2], { chest: false });
    expect(looked.joints.head?.[1] ?? 0).toBeGreaterThan(looked.joints.neck?.[1] ?? 0);
    expect(looked.joints.neck?.[1] ?? 0).toBeGreaterThan(looked.joints.chest?.[1] ?? 0);

    expect(applyStudioMannequinBreathingParams(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS, 0)).toBe(
      STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
    );
    expect(clampStudioMannequinFovDeg(5)).toBe(STUDIO_MANNEQUIN_FOV_MIN_DEG);
    expect(clampStudioMannequinFovDeg(140)).toBe(STUDIO_MANNEQUIN_FOV_MAX_DEG);
    expect(clampStudioMannequinFovDeg(Number.NaN)).toBe(STUDIO_MANNEQUIN_FOV_DEFAULT_DEG);

    const rects = computeStudioMannequinQuadViewRects(800, 600);
    expect(rects).toHaveLength(4);
    // 좌상단(main: x=200, y=150 in CSS top-origin) -> 서브패널 정중앙 NDC (0, 0)
    const mainPick = resolveStudioMannequinQuadPointerNdc(200, 150, 800, 600);
    expect(mainPick?.slot).toBe("main");
    expect(mainPick?.ndcX).toBeCloseTo(0, 5);
    expect(mainPick?.ndcY).toBeCloseTo(0, 5);
    // 우하단(top: x=600, y=450 in CSS top-origin) -> 서브패널 정중앙 NDC (0, 0)
    const topPick = resolveStudioMannequinQuadPointerNdc(600, 450, 800, 600);
    expect(topPick?.slot).toBe("top");
    expect(topPick?.ndcX).toBeCloseTo(0, 5);
    expect(topPick?.ndcY).toBeCloseTo(0, 5);

    const guides = buildStudioMannequinConstructionGuides(spec);
    expect(guides.some((g) => g.kind === "loomis")).toBe(true);
    const smoothTubes = buildStudioMannequinLoftTubes(spec, { surfaceMode: "ecorche" });
    const planarTubes = buildStudioMannequinLoftTubes(spec, { surfaceMode: "planar" });
    const smoothGeom = buildStudioMannequinLoftGeometry(smoothTubes[0]!);
    const planarGeom = buildStudioMannequinLoftGeometry(planarTubes[0]!);
    expect(smoothGeom.index).not.toBeNull();
    expect(planarGeom.index).toBeNull();
    smoothGeom.dispose();
    planarGeom.dispose();

    const joints = new Map(spec.joints.map((j) => [j.id, new THREE.Group()] as const));
    const overlay = createStudioMannequinProOverlayController();
    overlay.rebuildFigureGuides(spec, joints);
    overlay.syncBalanceOverlay(spec, buildStudioMannequinContrappostoPose(spec, rest, "left"));
    overlay.setCaptureHidden(true);
    expect(overlay.rootGroup.visible).toBe(false);
    overlay.setCaptureHidden(false);
    expect(overlay.rootGroup.visible).toBe(true);
    overlay.dispose();
  });
});

describe("클립스튜디오 .pep / .3dp 양방향 호환 브리지", () => {
  it("포즈와 양손 30마디 굴곡을 .pep XML로 직렬화하고 다시 가져와 복원한다", () => {
    const pose = normalizeStudioMannequinPose({
      joints: {
        chest: [0.18, -0.12, 0.08],
        leftUpperArm: [-0.45, 0.2, 0.55],
        rightLowerLeg: [0.62, 0, 0],
      },
      pelvisOffset: [0.05, -0.03, 0.02],
    });
    const pad = resolveStudioMannequinHandPadPose({ spread: 0.2, clench: 0.8, fistStyle: "standard" });
    const fingerPose = mergeHandPadIntoFingerPose(undefined, "both", pad);

    const xml = exportMannequinPoseToCspPep(pose, "HeroActionPose", fingerPose);
    const restored = importCspPepPoseToMannequin(xml);
    expect(restored.aliasName).toBe("HeroActionPose");
    expect(restored.mappedBoneCount).toBeGreaterThanOrEqual(49);
    expect(restored.pose.joints.rightLowerLeg?.[0]).toBeCloseTo(0.62, 2);
    expect(restored.fingerPose.left.index[0]).toBeGreaterThan(60);
  });

  it("체형 비율 파라미터를 .3dp XML로 내보내고 다시 가져와 등신·근육 경향을 보존한다", () => {
    const athletic = {
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      heightCm: 186,
      headCount: 8.0,
      build: 2.2,
      shoulderWidth: 1.18,
      legLength: 1.12,
    };
    const xml = exportMannequinParamsToCsp3dp(athletic);
    const imported = importCsp3dpToMannequinParams(xml, STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    expect(imported.headCount).toBeGreaterThanOrEqual(7.6);
    expect(imported.build).toBeGreaterThan(1.6);
    expect(imported.shoulderWidth).toBeCloseTo(1.18, 2);
  });
});
