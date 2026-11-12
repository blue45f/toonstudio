/**
 * Studio 3D 데생 인형 v3 — 에코르셰 해부학·프로 키네마틱스·무게중심·작화 보조선·CSP 호환 단위 테스트.
 *
 * WebGL 없이 실행 가능한 순수 결정적 검증으로 다음 계약을 고정한다:
 * 1. 에코르셰 근육·로프트 스펙의 신장 불변식, 비대칭 내·외과 복숭아뼈, 관절 굴곡 능동 팽창.
 * 2. 2D 핸드 셋업 패드(벌림 × 쥐기 × 엄지 대립 × 주먹 스타일 4종 × 손가락 잠금) 및 3D 벌림 체인.
 * 3. 관절 잠금(Joint Lock) 보존 및 견갑상완 리듬(2:1 쇄골 좌우 대칭 자동 동반 회전).
 * 4. 생체역학 무게중심(CoM) 분석 및 원클릭 자동 균형 보정(공중 도약 포즈 보존 포함).
 * 5. Three.js 유기 단면 로프트 지오메트리(스무스 에코르셰 vs 플랫 아사로 다면체) 및 오버레이 정리.
 * 6. 클립스튜디오 `.pep`(56본 포즈 + 손가락 30관절) 및 `.3dp`(체형 비율) 양방향 왕복 호환.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildSplayedHandDigitPrimitives,
  buildStudioMannequinEcorchePrimitives,
  buildStudioMannequinLoftTubes,
  computeStudioMannequinFlexionBulge,
  mergeHandPadIntoFingerPose,
  resolveStudioMannequinHandPadPose,
  resolveStudioMannequinSurfaceMode,
} from "./studio-mannequin-ecorche-anatomy";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  buildStudioMannequinSpec,
  studioMannequinRestStature,
} from "./studio-mannequin-model";
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
  createStudioMannequinProOverlayController,
} from "./studio-mannequin-pro-overlays";

const DEG = Math.PI / 180;

describe("studio-mannequin-ecorche-anatomy (v3 조형 & 능동 근육)", () => {
  it("표면 모드를 안전하게 정규화하고 standard 모드에서는 추가 로프트·근육을 생략한다", () => {
    expect(resolveStudioMannequinSurfaceMode("ecorche")).toBe("ecorche");
    expect(resolveStudioMannequinSurfaceMode("planar")).toBe("planar");
    expect(resolveStudioMannequinSurfaceMode("standard")).toBe("standard");
    expect(resolveStudioMannequinSurfaceMode("invalid")).toBe("ecorche");

    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    expect(buildStudioMannequinLoftTubes(spec, { surfaceMode: "standard" })).toHaveLength(0);
    expect(buildStudioMannequinEcorchePrimitives(spec, { surfaceMode: "standard" })).toHaveLength(0);
  });

  it("에코르셰 프리미티브는 신장 불변식을 깨뜨리지 않으며 비대칭 내·외과 복숭아뼈를 생성한다", () => {
    const spec = buildStudioMannequinSpec({
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      heightCm: 178,
      headCount: 7.6,
    });
    const ecorchePrims = buildStudioMannequinEcorchePrimitives(spec, { surfaceMode: "ecorche" });
    expect(ecorchePrims.length).toBeGreaterThan(24);
    expect(ecorchePrims.some((p) => p.jointId === "head")).toBe(false);
    expect(studioMannequinRestStature(spec)).toBeCloseTo(1.78, 5);

    const leftFootLandmarks = ecorchePrims.filter(
      (p) => p.jointId === "leftFoot" && p.kind === "sphere" && p.materialRole === "landmark",
    );
    expect(leftFootLandmarks).toHaveLength(2);
    const [medial, lateral] = leftFootLandmarks;
    if (medial?.kind === "sphere" && lateral?.kind === "sphere") {
      // 안쪽 복숭아뼈(내과)가 바깥쪽 복숭아뼈(외과)보다 해부학적으로 더 높고 앞쪽에 위치한다.
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
    // 검지는 펴지고 중지·새끼는 말아 쥐며 잠긴 약지는 12로 유지된다.
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

describe("프로 키네마틱스 (관절 잠금 · 견갑상완 리듬 · 무게중심 · 보조선)", () => {
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

    const lockedLeft = applyStudioMannequinScapulohumeralRhythm(raised, { leftShoulder: true });
    expect(lockedLeft.joints.leftShoulder).toBeUndefined();
    expect(lockedLeft.joints.rightShoulder?.[2]).toBeLessThan(-10 * DEG);
  });

  it("무게중심(CoM) 분석기는 전도 위험을 감지하고 원클릭 보정으로 안정 범위 안으로 복원한다", () => {
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const restReport = analyzeStudioMannequinBalance(spec, createStudioMannequinRestPose());
    expect(restReport.state).toBe("balanced");

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

    // 공중 점프 포즈는 airborne으로 판정하고 억지로 수평 이동시키지 않는다.
    const jumpPose = normalizeStudioMannequinPose({
      joints: {},
      pelvisOffset: [0.25, 0.65, 0],
    });
    expect(analyzeStudioMannequinBalance(spec, jumpPose).state).toBe("airborne");
    expect(stabilizeStudioMannequinCenterOfMass(spec, jumpPose)).toEqual(jumpPose);
  });

  it("루미스 두상·정중선·단축 등고선과 Three.js 로프트/오버레이 지오메트리를 누수 없이 생성·해제한다", () => {
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const guides = buildStudioMannequinConstructionGuides(spec);
    expect(guides.some((g) => g.kind === "loomis")).toBe(true);
    expect(guides.some((g) => g.kind === "centerline")).toBe(true);
    expect(guides.some((g) => g.kind === "contour")).toBe(true);

    const smoothTubes = buildStudioMannequinLoftTubes(spec, { surfaceMode: "ecorche" });
    const planarTubes = buildStudioMannequinLoftTubes(spec, { surfaceMode: "planar" });
    const smoothGeom = buildStudioMannequinLoftGeometry(smoothTubes[0]!);
    const planarGeom = buildStudioMannequinLoftGeometry(planarTubes[0]!);
    expect(smoothGeom.index).not.toBeNull();
    expect(planarGeom.index).toBeNull(); // 비공유 평면 법선
    smoothGeom.dispose();
    planarGeom.dispose();

    const joints = new Map(spec.joints.map((j) => [j.id, new THREE.Group()] as const));
    const overlay = createStudioMannequinProOverlayController();
    overlay.rebuildFigureGuides(spec, joints);
    const report = overlay.syncBalanceOverlay(spec, createStudioMannequinRestPose());
    expect(report.state).toBe("balanced");
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
    const pad = resolveStudioMannequinHandPadPose({
      spread: 0.2,
      clench: 0.8,
      fistStyle: "standard",
    });
    const fingerPose = mergeHandPadIntoFingerPose(undefined, "both", pad);

    const xml = exportMannequinPoseToCspPep(pose, "HeroActionPose", fingerPose);
    expect(xml).toContain("HeroActionPose");
    expect(xml).toContain("hips_bb_");
    expect(xml).toContain("lefthandindex1_bb_");

    const restored = importCspPepPoseToMannequin(xml);
    expect(restored.aliasName).toBe("HeroActionPose");
    expect(restored.mappedBoneCount).toBeGreaterThanOrEqual(49);
    expect(restored.pose.joints.rightLowerLeg?.[0]).toBeCloseTo(0.62, 2);
    expect(restored.pose.pelvisOffset[0]).toBeCloseTo(0.05, 3);
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
    expect(xml).toContain("ShapeMuscle");
    const imported = importCsp3dpToMannequinParams(xml, STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    expect(imported.headCount).toBeGreaterThanOrEqual(7.6);
    expect(imported.build).toBeGreaterThan(1.6);
    expect(imported.shoulderWidth).toBeCloseTo(1.18, 2);
  });
});
