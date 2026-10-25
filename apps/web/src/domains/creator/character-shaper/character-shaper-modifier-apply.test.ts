import { describe, expect, it } from "vitest";

import {
  SHAPER_MODIFIER_LABELS,
  applyShaperPartPresetWithModifiers,
  applyShaperPosePresetWithModifiers,
  resolveShaperPartModifierFromInput,
  resolveShaperPoseModifierFromInput,
} from "./character-shaper-modifier-apply";
import { parseShaperNativePreset } from "./character-shaper-native-preset-codec";

import type { ShaperPoseSceneState } from "./character-shaper-modifier-apply";

describe("character-shaper-modifier-apply", () => {
  const targetHeadRaw = [
    "1.0",
    "mt*head,mid*head_01,name*current_head,v*0.4/0/0.1,l*,lt*2/1/0/0.1/0.1/0.1/1/1,lp*0.1/1.2/0.3,lpt*2/0.2/0.3/0/0/1/head/m0/head_01",
  ].join("\n");

  const presetHeadRaw = [
    "1.0",
    "mt*head,mid*head_05,name*new_sharp_head,v*0.55/-0.1/0.15,l*,lt*3/1/0/0.2/0.2/0.2/1/2,lp*0.2/1.1/0.35,lpt*3/0.4/0.5/0/0/1/head/m0/head_05,l*,lt*1.5/1/0/0/0/0/1/3,lp*-0.15/1.05/0.3,lpt*1.5/0.6/0.7/0/0/1/head/m0/head_05",
  ].join("\n");

  it("파츠 프리셋: 기본 클릭 시 메쉬와 프리셋 3D 펜 라인으로 교체한다", () => {
    const targetParsed = parseShaperNativePreset(targetHeadRaw);
    const presetParsed = parseShaperNativePreset(presetHeadRaw);
    expect(targetParsed.ok && presetParsed.ok).toBe(true);
    if (!targetParsed.ok || !presetParsed.ok) return;

    const result = applyShaperPartPresetWithModifiers(
      targetParsed.document,
      presetParsed.document,
      resolveShaperPartModifierFromInput({}),
    );

    expect(result.document.baseMeshId).toBe("head_05");
    expect(result.document.name).toBe("new_sharp_head");
    expect(result.preservedTargetLineCount).toBe(0);
    expect(result.importedPresetLineCount).toBe(2);
    expect(result.document.lines).toHaveLength(2);
    expect(result.activeDescriptions).toEqual([]);
  });

  it("파츠 프리셋: [Alt]+클릭 시 프리셋 펜선을 제외하고 메쉬 변형만 가져온다", () => {
    const targetParsed = parseShaperNativePreset(targetHeadRaw);
    const presetParsed = parseShaperNativePreset(presetHeadRaw);
    if (!targetParsed.ok || !presetParsed.ok) return;

    const result = applyShaperPartPresetWithModifiers(
      targetParsed.document,
      presetParsed.document,
      resolveShaperPartModifierFromInput({ altKey: true }),
    );

    expect(result.document.baseMeshId).toBe("head_05");
    expect(result.preservedTargetLineCount).toBe(0);
    expect(result.importedPresetLineCount).toBe(0);
    expect(result.document.lines).toHaveLength(0);
    expect(result.activeDescriptions).toEqual([SHAPER_MODIFIER_LABELS.omitPresetLines]);
  });

  it("파츠 프리셋: [Shift]+클릭 시 대상 파츠의 기존 펜선을 새 베이스 메쉬로 재투영 보존하고 프리셋 펜선과 병합한다", () => {
    const targetParsed = parseShaperNativePreset(targetHeadRaw);
    const presetParsed = parseShaperNativePreset(presetHeadRaw);
    if (!targetParsed.ok || !presetParsed.ok) return;

    const result = applyShaperPartPresetWithModifiers(
      targetParsed.document,
      presetParsed.document,
      resolveShaperPartModifierFromInput({ shiftKey: true }),
    );

    expect(result.preservedTargetLineCount).toBe(1);
    expect(result.importedPresetLineCount).toBe(2);
    expect(result.reprojectedLineCount).toBe(1);
    expect(result.document.lines).toHaveLength(3);
    expect(result.appliedLines[0]?.source).toBe("target-preserved");
    expect(result.appliedLines[0]?.reprojectedToNewMesh).toBe(true);
    expect(result.appliedLines[0]?.points[0]?.partBaseMeshId).toBe("head_05");
    expect(result.activeDescriptions).toEqual([SHAPER_MODIFIER_LABELS.preserveTargetLines]);
  });

  it("파츠 프리셋: [Alt]+[Shift]+클릭 조합 시 기존 펜선만 보존하고 프리셋 펜선은 제외한다", () => {
    const targetParsed = parseShaperNativePreset(targetHeadRaw);
    const presetParsed = parseShaperNativePreset(presetHeadRaw);
    if (!targetParsed.ok || !presetParsed.ok) return;

    const result = applyShaperPartPresetWithModifiers(
      targetParsed.document,
      presetParsed.document,
      resolveShaperPartModifierFromInput({ altKey: true, shiftKey: true }),
    );

    expect(result.preservedTargetLineCount).toBe(1);
    expect(result.importedPresetLineCount).toBe(0);
    expect(result.document.lines).toHaveLength(1);
    expect(result.activeDescriptions).toEqual([
      SHAPER_MODIFIER_LABELS.omitPresetLines,
      SHAPER_MODIFIER_LABELS.preserveTargetLines,
    ]);
  });

  it("포즈 프리셋: 기본 클릭·[Alt] 대칭·[Shift] 카메라 제외·[Ctrl] 카메라만 적용을 검증한다", () => {
    const currentState: ShaperPoseSceneState = {
      bones: [
        { boneName: "LeftArm", position: { x: -0.2, y: 1.3, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
        { boneName: "RightArm", position: { x: 0.2, y: 1.3, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      ],
      camera: { position: { x: 0, y: 1.4, z: -3 }, rotation: { x: 0, y: 0, z: 0 }, fov: 40 },
    };

    const posePresetRaw = [
      "1.0",
      "mt*pose,name*look_left,sposC*0.05/1.2/0.3,sposL*-0.35/1.15/0.2,sposR*0.4/1.18/0.22,eblt*0/-10/3,ebrt*0/6/-2,bN*LeftArm,bP*-0.3/1.35/0.1,bA*12/-25/40,bN*RightArm,bP*0.25/1.25/-0.05,bA*5/15/-20,camP*0.5/1.5/-2.4,camR*6/-18/2,camFov*30",
    ].join("\n");
    const parsedPose = parseShaperNativePreset(posePresetRaw);
    expect(parsedPose.ok).toBe(true);
    if (!parsedPose.ok) return;

    // 1. 기본 클릭: 본 + 카메라 동시 적용
    const baseResult = applyShaperPosePresetWithModifiers(
      currentState,
      parsedPose.document,
      resolveShaperPoseModifierFromInput({}),
    );
    expect(baseResult.appliedBoneCount).toBe(2);
    expect(baseResult.cameraUpdated).toBe(true);
    expect(baseResult.state.camera?.fov).toBe(30);

    // 2. [Alt]+클릭: 좌/우 본·심·안구 회전 스왑 및 X축 반전 미러링
    const mirroredResult = applyShaperPosePresetWithModifiers(
      currentState,
      parsedPose.document,
      resolveShaperPoseModifierFromInput({ altKey: true }),
    );
    expect(mirroredResult.mirrored).toBe(true);
    expect(mirroredResult.activeDescriptions).toEqual([SHAPER_MODIFIER_LABELS.mirrorPose]);
    const rightArmAfterMirror = mirroredResult.state.bones.find((b) => b.boneName === "RightArm");
    const leftArmAfterMirror = mirroredResult.state.bones.find((b) => b.boneName === "LeftArm");
    expect(rightArmAfterMirror?.position).toEqual({ x: 0.3, y: 1.35, z: 0.1 });
    expect(rightArmAfterMirror?.rotation).toEqual({ x: 12, y: 25, z: -40 });
    expect(leftArmAfterMirror?.position).toEqual({ x: -0.25, y: 1.25, z: -0.05 });
    expect(leftArmAfterMirror?.rotation).toEqual({ x: 5, y: -15, z: 20 });
    expect(mirroredResult.state.seams?.left).toEqual({ x: -0.4, y: 1.18, z: 0.22 });
    expect(mirroredResult.state.seams?.right).toEqual({ x: 0.35, y: 1.15, z: 0.2 });
    expect(mirroredResult.state.eyeball?.leftEyeRotation).toEqual({ x: 0, y: -6, z: 2 });
    expect(mirroredResult.state.eyeball?.rightEyeRotation).toEqual({ x: 0, y: 10, z: -3 });
    expect(mirroredResult.state.camera?.position).toEqual({ x: -0.5, y: 1.5, z: -2.4 });
    expect(mirroredResult.state.camera?.rotation).toEqual({ x: 6, y: 18, z: -2 });

    // 3. [Shift]+클릭: 카메라 각도 제외하고 본 포즈만 적용
    const noCamResult = applyShaperPosePresetWithModifiers(
      currentState,
      parsedPose.document,
      resolveShaperPoseModifierFromInput({ shiftKey: true }),
    );
    expect(noCamResult.cameraUpdated).toBe(false);
    expect(noCamResult.state.camera).toEqual(currentState.camera);
    expect(noCamResult.appliedBoneCount).toBe(2);
    expect(noCamResult.activeDescriptions).toEqual([SHAPER_MODIFIER_LABELS.excludeCamera]);

    // 4. [Ctrl]+클릭: 본 포즈 제외하고 카메라 각도만 적용
    const camOnlyResult = applyShaperPosePresetWithModifiers(
      currentState,
      parsedPose.document,
      resolveShaperPoseModifierFromInput({ ctrlKey: true }),
    );
    expect(camOnlyResult.appliedBoneCount).toBe(0);
    expect(camOnlyResult.cameraUpdated).toBe(true);
    expect(camOnlyResult.state.bones).toEqual(currentState.bones);
    expect(camOnlyResult.state.camera?.fov).toBe(30);
    expect(camOnlyResult.activeDescriptions).toEqual([SHAPER_MODIFIER_LABELS.cameraOnly]);
  });

  it("손 포즈(handPose): leftOnly, rightOnly, both, mirrorHands 모드를 정확히 구분하여 적용한다", () => {
    const currentState: ShaperPoseSceneState = {
      bones: [
        { boneName: "LeftHandIndex1", rotation: { x: 0, y: 0, z: 0 } },
        { boneName: "RightHandIndex1", rotation: { x: 0, y: 0, z: 0 } },
      ],
      camera: null,
    };

    const handPresetRaw =
      "1.0\nmt*handPose,name*grip_both,bN*LeftHandIndex1,bA*10/20/30,bN*RightHandIndex1,bA*15/-25/-35";
    const parsedHand = parseShaperNativePreset(handPresetRaw);
    expect(parsedHand.ok).toBe(true);
    if (!parsedHand.ok) return;

    const leftOnly = applyShaperPosePresetWithModifiers(currentState, parsedHand.document, {
      handMode: "leftOnly",
    });
    expect(leftOnly.appliedBoneCount).toBe(1);
    expect(leftOnly.state.bones.find((b) => b.boneName === "LeftHandIndex1")?.rotation).toEqual({
      x: 10,
      y: 20,
      z: 30,
    });
    expect(leftOnly.state.bones.find((b) => b.boneName === "RightHandIndex1")?.rotation).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });

    const rightOnly = applyShaperPosePresetWithModifiers(currentState, parsedHand.document, {
      handMode: "rightOnly",
    });
    expect(rightOnly.appliedBoneCount).toBe(1);
    expect(rightOnly.state.bones.find((b) => b.boneName === "RightHandIndex1")?.rotation).toEqual({
      x: 15,
      y: -25,
      z: -35,
    });
    expect(rightOnly.state.bones.find((b) => b.boneName === "LeftHandIndex1")?.rotation).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });

    const mirrorHands = applyShaperPosePresetWithModifiers(currentState, parsedHand.document, {
      handMode: "mirrorHands",
    });
    expect(mirrorHands.mirrored).toBe(true);
    expect(mirrorHands.state.bones.find((b) => b.boneName === "RightHandIndex1")?.rotation).toEqual({
      x: 10,
      y: -20,
      z: -30,
    });
    expect(mirrorHands.state.bones.find((b) => b.boneName === "LeftHandIndex1")?.rotation).toEqual({
      x: 15,
      y: 25,
      z: 35,
    });
  });
});
