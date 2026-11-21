import { describe, expect, it } from "vitest";

import {
  applyWorkCameraToCutCamera,
  computeGroundSnapTransform,
  resolveBg3dStagingShortcut,
  transferTemplateStagingToCharacter,
  type CharacterInstanceRecord,
  type TemplateActorSlotSpec,
} from "./studio-bg3d-ground-snap-and-template-transfer";

describe("studio-bg3d-ground-snap-and-template-transfer", () => {
  it("resolves X (ground-snap) and S (work->cut camera) shortcuts while ignoring inputs and modifiers", () => {
    expect(resolveBg3dStagingShortcut({ key: "x" })).toBe("ground-snap");
    expect(resolveBg3dStagingShortcut({ key: "X" })).toBe("ground-snap");
    expect(resolveBg3dStagingShortcut({ key: "s" })).toBe("apply-work-to-cut-camera");
    expect(resolveBg3dStagingShortcut({ key: "s", ctrlKey: true })).toBeNull();
    expect(resolveBg3dStagingShortcut({ key: "x", isEditableTarget: true })).toBeNull();
    expect(resolveBg3dStagingShortcut({ key: "x", shiftKey: true })).toBeNull();
  });

  it("snaps floating or sunken skinned characters to Y=0 or raycast floor height with 0mm residual gap", () => {
    // 1) 스키닝 AABB 기준 공중에 떠 있는 캐릭터 → 기본 지면 Y=0 접지
    const snapPlane = computeGroundSnapTransform({
      currentPosition: [1.5, 0.42, -0.8],
      skinnedWorldBounds: { min: [1.1, 0.37, -1.1], max: [1.9, 2.02, -0.5] },
    });
    expect(snapPlane.boundsSource).toBe("skinned-aabb");
    expect(snapPlane.groundSource).toBe("default-plane");
    expect(snapPlane.deltaY).toBeCloseTo(-0.37, 4);
    expect(snapPlane.nextPosition).toEqual([1.5, 0.05, -0.8]);

    // 2) 계단/옥상 슬래브(Y=0.65m) 위로 발 본 기반 레이캐스트 접지
    const snapStair = computeGroundSnapTransform({
      currentPosition: [2.0, 0.2, 1.0],
      footBoneWorldYs: [0.28, 0.34],
      soleThicknessM: 0.08,
      raycastGroundY: () => 0.65,
    });
    expect(snapStair.boundsSource).toBe("foot-bones");
    expect(snapStair.groundSource).toBe("raycast");
    expect(snapStair.measuredMinYBefore).toBeCloseTo(0.2, 4);
    expect(snapStair.nextPosition[1]).toBeCloseTo(0.65, 4);
  });

  it("transfers work camera pose and focal length to active cut camera with undoable snapshot", () => {
    const transfer = applyWorkCameraToCutCamera({
      cutId: "cut-04",
      workCamera: { position: [3.2, 1.8, 4.1], target: [0, 1.4, 0], fovDegrees: 39.6 },
      currentCutCamera: { position: [0, 2, 6], target: [0, 1, 0], fovDegrees: 50 },
    });

    expect(transfer.nextCutCamera.position).toEqual([3.2, 1.8, 4.1]);
    expect(transfer.nextCutCamera.target).toEqual([0, 1.4, 0]);
    expect(transfer.focalLengthMm).toBeCloseTo(33.3, 0);
    expect(transfer.previousCutCamera.position).toEqual([0, 2, 6]);
  });

  it("preserves user character appearance 100% while transferring pose, VRM expressions, gaze, hand pose, and grounded transform", () => {
    const userChar: CharacterInstanceRecord = {
      appearance: {
        characterId: "my-heroine-01",
        displayName: "내 주인공",
        assetUrl: "/assets/characters/toonstudio-kit-v2/bases/female-romance.glb",
        hairPresetId: "hair/romance-long",
        outfitSlots: { top: "top/school-shirt-tie", bottom: "bottom/pleated-skirt", shoes: "shoes/loafers" },
        colors: { skin: "#ffe8dc", hair: "#2a1d2b", top: "#f5f7fa" },
        bodyProportions: { height: -0.2, headSize: 0.05 },
        heightM: 1.58,
        restHipsHeightM: 0.84,
        supportedBones: ["hips", "spine", "head", "leftUpperArm", "rightUpperArm"],
      },
      performance: {
        worldPosition: [0, 0, 0],
        worldRotationEulerDeg: [0, 0, 0],
        boneRotations: {},
        expressionWeights: { neutral: 1 },
      },
    };

    const templateSlot: TemplateActorSlotSpec = {
      slotId: "slot-lead",
      labelKo: "대화 주연 A",
      referenceHeightM: 1.75,
      referenceHipsHeightM: 0.94,
      performance: {
        worldPosition: [-1.4, 0.25, 0.6],
        worldRotationEulerDeg: [0, 42, 0],
        boneRotations: {
          hips: [0, 0.1, 0, 0.995],
          spine: [0.05, 0, 0, 0.998],
          leftUpperArm: [0, 0, -0.35, 0.936],
          unsupportedTailBone: [0, 0, 0, 1],
        },
        hipsTranslationM: [0, -0.32, 0],
        expressionWeights: { joy: 0.85, blink_l: 0.4, a: 0.5 },
        lookAt: { mode: "target", targetWorldPosition: [1.2, 1.6, 0.6] },
        handPose: { leftPresetId: "hold-cup", rightPresetId: "peace-v" },
      },
    };

    const result = transferTemplateStagingToCharacter(userChar, templateSlot, {
      snapToGroundAfterTransfer: true,
    });

    // 외형 100% 보존 확인
    expect(result.character.appearance.characterId).toBe("my-heroine-01");
    expect(result.character.appearance.hairPresetId).toBe("hair/romance-long");
    expect(result.character.appearance.outfitSlots).toEqual(userChar.appearance.outfitSlots);
    expect(result.character.appearance.colors).toEqual(userChar.appearance.colors);

    // 월드 좌표(+지면 접지)·포즈·미지원 본 필터링·Hips 신장 비례 보정 확인
    expect(result.character.performance.worldPosition).toEqual([-1.4, 0, 0.6]);
    expect(result.character.performance.worldRotationEulerDeg).toEqual([0, 42, 0]);
    expect(result.character.performance.boneRotations.hips).toEqual([0, 0.1, 0, 0.995]);
    expect(result.character.performance.boneRotations.unsupportedTailBone).toBeUndefined();
    expect(result.skippedBones).toEqual(["unsupportedTailBone"]);
    expect(result.hipsHeightScaleApplied).toBeCloseTo(0.84 / 0.94, 3);
    expect(result.character.performance.hipsTranslationM?.[1]).toBeCloseTo(-0.32 * (0.84 / 0.94), 3);

    // VRM 0.x → 1.0 표정 자동 정규화 + 시선 + 손 포즈 확인
    expect(result.character.performance.expressionWeights).toEqual({
      happy: 0.85,
      blinkLeft: 0.4,
      aa: 0.5,
    });
    expect(result.remappedExpressions).toEqual({ joy: "happy", blink_l: "blinkLeft", a: "aa" });
    expect(result.character.performance.lookAt?.targetWorldPosition).toEqual([1.2, 1.6, 0.6]);
    expect(result.character.performance.handPose).toEqual({ leftPresetId: "hold-cup", rightPresetId: "peace-v" });
  });
});
