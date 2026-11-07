import { describe, expect, it } from "vitest";

import { isHumanoidBoneName, isLabFailure } from "../../../contracts";
import { resolveProportions } from "../../../domains/humanoid/proportions";
import { buildHumanoidSkeleton } from "../../../domains/humanoid/skeleton/skeleton-builder";
import { qFromAxisAngle } from "../../../shared/math";

import {
  SHAPER_BUILTIN_BODY_PRESETS,
  SHAPER_BUILTIN_FACE_PRESETS,
  applySymmetryToPose,
  computeVisibleBoneLinks,
  mirrorHumanoidBoneRotation,
  parseShaperNativePreset,
  resolveDragPivotWithMode,
  resolveMirrorHumanoidBone,
} from "./shaper-bone-gizmo";
import { pushShaperHistoryEntry, stepShaperHistoryCursor, visibleHandles } from "./viewport-interactions";

import type { JointDragHandle, LabFailure, Pose, Quat, SkeletonData } from "../../../contracts";

describe("shaper-bone-gizmo — 대칭 조작·피벗 모드·골격 연결선·네이티브 프리셋", () => {
  const skeleton = buildHumanoidSkeleton(resolveProportions({}));

  it("resolveMirrorHumanoidBone: 좌우 팔·다리·손가락·눈 본을 정확히 교환하고 중심선 본은 null이다", () => {
    expect(resolveMirrorHumanoidBone("leftUpperArm")).toBe("rightUpperArm");
    expect(resolveMirrorHumanoidBone("rightLowerLeg")).toBe("leftLowerLeg");
    expect(resolveMirrorHumanoidBone("leftIndexProximal")).toBe("rightIndexProximal");
    expect(resolveMirrorHumanoidBone("rightEye")).toBe("leftEye");
    expect(resolveMirrorHumanoidBone("hips")).toBeNull();
    expect(resolveMirrorHumanoidBone("head")).toBeNull();
  });

  it("mirrorHumanoidBoneRotation: 시상면(YZ) 기준으로 X축 피치는 유지하고 Y·Z 회전 성분은 부호를 반전한다", () => {
    const qZ = qFromAxisAngle([0, 0, 1], 0.4);
    const mirroredZ = mirrorHumanoidBoneRotation(qZ);
    expect(mirroredZ[0]).toBeCloseTo(0, 6);
    expect(mirroredZ[1]).toBeCloseTo(0, 6);
    expect(mirroredZ[2]).toBeCloseTo(-qZ[2], 6);
    expect(mirroredZ[3]).toBeCloseTo(qZ[3], 6);

    const qX = qFromAxisAngle([1, 0, 0], 0.5);
    const mirroredX = mirrorHumanoidBoneRotation(qX);
    expect(mirroredX[0]).toBeCloseTo(qX[0], 6);
    expect(mirroredX[3]).toBeCloseTo(qX[3], 6);
  });

  it("applySymmetryToPose: symmetryEnabled=true일 때 반대쪽 대칭 본에 거울 사원수를 함께 기록한다", () => {
    const rot = qFromAxisAngle([0, 0, 1], 0.35);
    const solo = applySymmetryToPose({}, "leftUpperArm", rot, false);
    expect(solo.leftUpperArm).toEqual(rot);
    expect(solo.rightUpperArm).toBeUndefined();

    const sym = applySymmetryToPose({}, "leftUpperArm", rot, true);
    expect(sym.leftUpperArm).toEqual(rot);
    expect(sym.rightUpperArm).toEqual(mirrorHumanoidBoneRotation(rot));

    const center = applySymmetryToPose({}, "chest", rot, true);
    expect(center.chest).toEqual(rot);
    expect(Object.keys(center)).toEqual(["chest"]);
  });

  it("resolveDragPivotWithMode: parent 모드는 부모 본을, direct 모드는 핸들 본 자체를 피벗으로 선택한다", () => {
    const parentMode = resolveDragPivotWithMode(skeleton, {}, "leftLowerArm", "parent");
    expect(parentMode?.pivotBone).toBe("leftUpperArm");

    const directMode = resolveDragPivotWithMode(skeleton, {}, "leftLowerArm", "direct");
    expect(directMode?.pivotBone).toBe("leftLowerArm");
    expect(directMode?.pivotWorld[0]).toBeGreaterThan(parentMode?.pivotWorld[0] ?? 0);
  });

  it("computeVisibleBoneLinks: 화면에 표시된 관절 핸들 사이의 부모-자식 골격 선분을 측면 태그와 함께 생성한다", () => {
    const rawHandles: JointDragHandle[] = skeleton.bones.map((bone, index) => {
      if (!isHumanoidBoneName(bone.name)) throw new Error("휴머노이드 본 이름이 필요합니다.");
      return {
        bone: bone.name,
        world: [index * 0.05, 1.0, 0],
        screen: [200 + index * 10, 300 + index * 5],
      };
    });
    const handles = visibleHandles(rawHandles, { fingers: false });
    const links = computeVisibleBoneLinks(handles, skeleton);
    expect(links.length).toBeGreaterThanOrEqual(10);
    const leftForearmLink = links.find((seg) => seg.toBone === "leftLowerArm");
    expect(leftForearmLink?.fromBone).toBe("leftUpperArm");
    expect(leftForearmLink?.side).toBe("left");
    const rightHandLink = links.find((seg) => seg.toBone === "rightHand");
    expect(rightHandLink?.fromBone).toBe("rightLowerArm");
    expect(rightHandLink?.side).toBe("right");
  });

  it("parseShaperNativePreset: SHAPER 1.0 두상(mt*0)·체형(mt*7)·포즈(mt*12) 프리셋 포맷을 파싱한다", () => {
    const headPreset = parseShaperNativePreset(
      "1.0\nmt*0,mid*0,name*얼굴형1,v*0/0.5/0,v*0/-0.5/0,v*-0.355/0/0,v*0.355/0/0,v*-0.29/-0.3/0,v*0.29/-0.3/0,v*0/0/-0.44,v*0/0/0.44",
    );
    expect(headPreset?.kind).toBe("head");
    if (headPreset?.kind === "head") {
      expect(headPreset.name).toBe("얼굴형1");
      expect(headPreset.widthToHeight).toBeCloseTo(0.71, 2);
      expect(headPreset.jawToCheekRatio).toBeLessThan(0.85);
    }

    const bodyPreset = parseShaperNativePreset(
      "1.0\nmt*7,name*여성기본,sex*1,muscle*0.1235294,fat*0,bN*BodyHead,bS*1.1277/1.1277/1.1277,bN*BodySpine,bS*0.9999/0.7204/0.7124,bN*BodyLClavicle,bS*0.9718/1/1,bN*BodyLThigh,bS*1.03/0.87/0.87",
    );
    expect(bodyPreset?.kind).toBe("body");
    if (bodyPreset?.kind === "body") {
      expect(bodyPreset.sex).toBe(1);
      expect(bodyPreset.bodyParams.headSize).toBeGreaterThan(0);
      expect(bodyPreset.bodyParams.waist).toBeLessThan(0);
    }

    const posePreset = parseShaperNativePreset(
      "1.0\nmt*12,name*pose1,bN*BodyHub001,bP*0/1.02/0,bA*0/15/0,bN*BodyLUArm,bP*-0.12/0/0,bA*10/20/-35",
    );
    expect(posePreset?.kind).toBe("pose");
    if (posePreset?.kind === "pose") {
      expect(posePreset.pose.hips).toBeDefined();
      expect(posePreset.pose.leftUpperArm).toBeDefined();
    }

    expect(Object.keys(SHAPER_BUILTIN_BODY_PRESETS)).toHaveLength(3);
    expect(Object.keys(SHAPER_BUILTIN_FACE_PRESETS)).toHaveLength(6);
  });
});

describe("shaper-bone-gizmo — 손상 스켈레톤·비유한 좌표·순환 참조 안전 경계 회귀 검증", () => {
  const validSkeleton = buildHumanoidSkeleton(resolveProportions({}));

  it("resolveDragPivotWithMode: NaN/Infinity restTranslation 및 부모 순환(hips<->spine, a->b->a, aux1<->aux2) 시 예외 없이 null과 LabFailure를 보고한다", () => {
    const nanSkeleton: SkeletonData = Object.freeze({
      bones: Object.freeze(
        validSkeleton.bones.map((bone) =>
          bone.name === "leftUpperArm"
            ? Object.freeze({ ...bone, restTranslation: Object.freeze([Number.NaN, 0.2, 0] as const) })
            : Object.freeze({ ...bone }),
        ),
      ),
    });
    const infSkeleton: SkeletonData = Object.freeze({
      bones: Object.freeze(
        validSkeleton.bones.map((bone) =>
          bone.name === "hips"
            ? Object.freeze({ ...bone, restTranslation: Object.freeze([0, Number.POSITIVE_INFINITY, 0] as const) })
            : Object.freeze({ ...bone }),
        ),
      ),
    });
    const cycleHipsSpine: SkeletonData = Object.freeze({
      bones: Object.freeze([
        Object.freeze({ name: "hips", parent: "spine", restTranslation: [0, 1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
        Object.freeze({ name: "spine", parent: "hips", restTranslation: [0, 0.2, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      ]),
    });
    const cycleAux: SkeletonData = Object.freeze({
      bones: Object.freeze([
        Object.freeze({ name: "hips", parent: null, restTranslation: [0, 1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
        Object.freeze({ name: "aux1", parent: "aux2", restTranslation: [0, 0.1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
        Object.freeze({ name: "aux2", parent: "aux1", restTranslation: [0, 0.1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
        Object.freeze({ name: "spine", parent: "aux1", restTranslation: [0, 0.2, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      ]),
    });

    const frozenPose: Pose = Object.freeze({
      leftUpperArm: Object.freeze(qFromAxisAngle([0, 0, 1], 0.25)),
    });

    for (const mode of ["parent", "direct"] as const) {
      const nanFailures: LabFailure[] = [];
      expect(
        resolveDragPivotWithMode(nanSkeleton, frozenPose, "leftLowerArm", mode, {
          now: 1700000001000,
          onFailure: (f) => nanFailures.push(f),
        }),
      ).toBeNull();
      expect(nanFailures).toHaveLength(1);
      expect(isLabFailure(nanFailures[0])).toBe(true);
      expect(nanFailures[0]?.code).toBe("skeleton-non-finite-rest");

      const infFailures: LabFailure[] = [];
      expect(
        resolveDragPivotWithMode(infSkeleton, frozenPose, "hips", mode, {
          now: 1700000001001,
          onFailure: (f) => infFailures.push(f),
        }),
      ).toBeNull();
      expect(infFailures).toHaveLength(1);
      expect(infFailures[0]?.code).toBe("skeleton-non-finite-rest");

      const cycleFailures: LabFailure[] = [];
      expect(
        resolveDragPivotWithMode(cycleHipsSpine, frozenPose, "spine", mode, {
          now: 1700000001002,
          onFailure: (f) => cycleFailures.push(f),
        }),
      ).toBeNull();
      expect(cycleFailures).toHaveLength(1);
      expect(cycleFailures[0]?.code).toBe("skeleton-cycle");

      const auxFailures: LabFailure[] = [];
      expect(
        resolveDragPivotWithMode(cycleAux, frozenPose, "spine", mode, {
          now: 1700000001003,
          onFailure: (f) => auxFailures.push(f),
        }),
      ).toBeNull();
      expect(auxFailures).toHaveLength(1);
      expect(auxFailures[0]?.code).toBe("skeleton-cycle");
    }

    // 정상 빈 결과(스켈레톤은 유효하나 조회한 본이 존재하지 않는 경우)에서는 onFailure가 호출되지 않는다
    const emptyValidSkeleton: SkeletonData = Object.freeze({ bones: Object.freeze([]) });
    const normalEmptyFailures: LabFailure[] = [];
    expect(
      resolveDragPivotWithMode(emptyValidSkeleton, frozenPose, "leftLowerArm", "direct", {
        onFailure: (f) => normalEmptyFailures.push(f),
      }),
    ).toBeNull();
    expect(
      resolveDragPivotWithMode(emptyValidSkeleton, frozenPose, "leftLowerArm", "parent", {
        onFailure: (f) => normalEmptyFailures.push(f),
      }),
    ).toBeNull();
    expect(normalEmptyFailures).toHaveLength(0);

    // 실패 직후 정상 스켈레톤으로 재호출 시 즉시 정상 피벗을 반환하고 원본 불변을 보장한다
    const recoveredDirect = resolveDragPivotWithMode(validSkeleton, frozenPose, "leftLowerArm", "direct");
    expect(recoveredDirect?.pivotBone).toBe("leftLowerArm");
    expect(Number.isFinite(recoveredDirect?.pivotWorld[0])).toBe(true);
  });

  it("computeVisibleBoneLinks: 부모 순환(a->b->a)·비유한 restTranslation·비유한 화면 픽셀([NaN, 300], [Infinity, -Infinity])에도 무한 루프나 NaN 선분 없이 안전 폴백한다", () => {
    const handles: readonly JointDragHandle[] = Object.freeze([
      Object.freeze({ bone: "hips", world: [0, 1, 0] as const, screen: [400, 500] as const }),
      Object.freeze({ bone: "spine", world: [0, 1.1, 0] as const, screen: [400, 450] as const }),
      Object.freeze({ bone: "chest", world: [0, 1.25, 0] as const, screen: [Number.NaN, 300] as const }),
      Object.freeze({ bone: "head", world: [0, 1.5, 0] as const, screen: [400, 320] as const }),
      Object.freeze({ bone: "leftHand", world: [0.4, 1.0, 0] as const, screen: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY] as const }),
    ]);

    const cyclicSkeleton: SkeletonData = Object.freeze({
      bones: Object.freeze([
        Object.freeze({ name: "hips", parent: "spine", restTranslation: [0, 1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
        Object.freeze({ name: "spine", parent: "hips", restTranslation: [0, 0.1, 0] as const, restRotation: [0, 0, 0, 1] as const }),
        Object.freeze({ name: "head", parent: "spine", restTranslation: [0, 0.4, 0] as const, restRotation: [0, 0, 0, 1] as const }),
      ]),
    });

    const cycleFailures: LabFailure[] = [];
    const segments = computeVisibleBoneLinks(handles, cyclicSkeleton, {
      now: 1700000002000,
      onFailure: (f) => cycleFailures.push(f),
    });
    expect(cycleFailures).toHaveLength(1);
    expect(cycleFailures[0]?.code).toBe("skeleton-cycle");
    // chest([NaN, 300])와 leftHand([Infinity, -Infinity])는 건너뛰고, head는 유효한 조상 spine과 연결된다
    expect(segments.length).toBeGreaterThanOrEqual(2);
    for (const seg of segments) {
      expect(Number.isFinite(seg.x1)).toBe(true);
      expect(Number.isFinite(seg.y1)).toBe(true);
      expect(Number.isFinite(seg.x2)).toBe(true);
      expect(Number.isFinite(seg.y2)).toBe(true);
    }
    expect(segments.find((s) => s.toBone === "head")?.fromBone).toBe("spine");

    // 정상 스켈레톤 전달 시 onFailure는 호출되지 않는다
    const okFailures: LabFailure[] = [];
    const okSegments = computeVisibleBoneLinks(handles, validSkeleton, {
      onFailure: (f) => okFailures.push(f),
    });
    expect(okFailures).toHaveLength(0);
    expect(okSegments.length).toBeGreaterThanOrEqual(2);
  });

  it("applySymmetryToPose: 비유한 사원수·영벡터 입력 시 원본 포즈/선택/Undo 스택을 보존하고 직후 정상 조작·프리셋을 즉시 회복한다", () => {
    const initialRot = Object.freeze(qFromAxisAngle([0, 0, 1], 0.2));
    const basePose: Pose = Object.freeze({
      hips: Object.freeze([0, 0, 0, 1] as const),
      leftUpperArm: initialRot,
    });
    const selectedBone = "leftUpperArm" as const;
    let history = pushShaperHistoryEntry({ entries: [], curPos: -1 }, { type: "selectPoseControlPoints", payload: basePose });

    const nanQuat: Quat = [Number.NaN, 0, 0, 1];
    const infQuat: Quat = [0, Number.POSITIVE_INFINITY, 0, 1];
    const zeroQuat: Quat = [0, 0, 0, 0];

    const afterNan = applySymmetryToPose(basePose, selectedBone, nanQuat, true);
    const afterInf = applySymmetryToPose(basePose, selectedBone, infQuat, false);
    const afterZero = applySymmetryToPose(basePose, selectedBone, zeroQuat, true);

    expect(afterNan).toEqual(basePose);
    expect(afterNan.rightUpperArm).toBeUndefined();
    expect(afterInf).toEqual(basePose);
    expect(afterZero).toEqual(basePose);

    // 실패 직후 정상 사원수 및 네이티브 프리셋 적용이 즉시 동작하며 Undo/Redo 스택이 그대로 유지된다
    const validRot = qFromAxisAngle([0, 0, 1], 0.45);
    const recoveredPose = applySymmetryToPose(basePose, selectedBone, validRot, true);
    expect(recoveredPose.leftUpperArm).toEqual(validRot);
    expect(recoveredPose.rightUpperArm).toEqual(mirrorHumanoidBoneRotation(validRot));

    history = pushShaperHistoryEntry(history, { type: "selectPoseControlPoints", payload: recoveredPose });
    const undoStep = stepShaperHistoryCursor(history, -1);
    expect(undoStep.appliedEntry?.payload).toEqual(basePose);
  });
});

