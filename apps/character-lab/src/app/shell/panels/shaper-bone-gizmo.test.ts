import { describe, expect, it } from "vitest";

import { isHumanoidBoneName } from "../../../contracts";
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
import { visibleHandles } from "./viewport-interactions";

import type { JointDragHandle } from "../../../contracts";

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
    const rawHandles = skeleton.bones.flatMap<JointDragHandle>((bone, index) => isHumanoidBoneName(bone.name) ? [{
      bone: bone.name,
      world: [index * 0.05, 1.0, 0],
      screen: [200 + index * 10, 300 + index * 5],
    }] : []);
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
