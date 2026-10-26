import { describe, expect, it } from "vitest";

import {
  SHAPER_AI_BODY_BONE_COUNT,
  SHAPER_AI_BONE_UNCERTAINTY_THRESHOLD,
  SHAPER_AI_HAND_BONE_COUNT,
  SHAPER_AI_IMAGE_MAX_SIDE,
  SHAPER_AI_MIN_CONFIDENT_BODY_BONES,
  SHAPER_AI_POSE_TYPES,
  SHAPER_AI_PRESET_PARTS,
  SHAPER_AI_WEBCAM_CAPTURE_SIZE,
  buildShaperAiPresetRecommendations,
  computeShaperAiImageDownscaleDimensions,
  computeShaperAiPresetBorderAlpha,
  evaluateShaperAiBodyPoseJson,
  evaluateShaperAiHandsPoseJson,
  stepShaperFixVectorCycle,
} from "./shaper-bone-ai";

describe("shaper-bone-ai (SHAPER BoneAIManager & UIAIPreset 역공학 내재화)", () => {
  it("BoneAIManager::OpenImage (0x060000cd) 최장변 512px 종횡비 보존 축소 및 512x288 웹캠 상수를 검증한다", () => {
    expect(SHAPER_AI_IMAGE_MAX_SIDE).toBe(512);
    expect(SHAPER_AI_WEBCAM_CAPTURE_SIZE).toEqual([512, 288]);
    expect(SHAPER_AI_POSE_TYPES).toEqual([
      "body",
      "hand",
      "bodyWebCam",
      "handWebCam",
      "preset",
    ]);

    const untouched = computeShaperAiImageDownscaleDimensions(400, 320);
    expect(untouched.scaled).toBe(false);
    expect([untouched.targetWidth, untouched.targetHeight]).toEqual([400, 320]);

    const landscape = computeShaperAiImageDownscaleDimensions(1920, 1080);
    expect(landscape.scaled).toBe(true);
    expect(landscape.targetWidth).toBe(512);
    expect(landscape.targetHeight).toBe(288);

    const portrait = computeShaperAiImageDownscaleDimensions(1000, 2000);
    expect(portrait.scaled).toBe(true);
    expect(portrait.targetWidth).toBe(256);
    expect(portrait.targetHeight).toBe(512);
  });

  it("BoneAIManager::ApplyJSON (0x060000c7) 전신 24본 중 uncertainty < 0.03 신뢰 본 16개 이상 게이트 및 90도 축 보정을 검증한다", () => {
    expect(SHAPER_AI_BODY_BONE_COUNT).toBe(24);
    expect(SHAPER_AI_BONE_UNCERTAINTY_THRESHOLD).toBe(0.03);
    expect(SHAPER_AI_MIN_CONFIDENT_BODY_BONES).toBe(16);

    const rejectedSet = {
      uncertainties: Array.from({ length: 24 }, (_, i) => [i < 15 ? 0.01 : 0.05]),
      pose: Array.from({ length: 24 }, () => [10, 20, 30] as const),
    };
    const rejected = evaluateShaperAiBodyPoseJson(rejectedSet);
    expect(rejected.accepted).toBe(false);
    expect(rejected.confidentBoneCount).toBe(15);
    expect(rejected.rejectionReasonKo).toContain("15/24개");

    const acceptedSet = {
      uncertainties: Array.from({ length: 24 }, (_, i) => [i < 18 ? 0.015 : 0.08]),
      pose: Array.from({ length: 24 }, (_, i) => [i === 0 ? 15 : 5, 10, -10] as const),
      boneLengths: Array.from({ length: 24 }, () => 22),
    };
    const accepted = evaluateShaperAiBodyPoseJson(acceptedSet, {
      fixMatrixAngles: [0, 180, 0],
      fixBoneAngles: [[1, 0, 0]],
      fixBoneAnglesB: [[0, 0, 1]],
    });
    expect(accepted.accepted).toBe(true);
    expect(accepted.confidentBoneCount).toBe(18);
    expect(accepted.bones[0]?.eulerDeg).toEqual([105, -170, 80]);
    expect(accepted.bones[0]?.dummyCubeScale).toEqual([4, 4, 22]);
    // 18번 이후 본은 uncertainty >= 0.03 이므로 [0, 0, 0]으로 유지
    expect(accepted.bones[20]?.confident).toBe(false);
    expect(accepted.bones[20]?.eulerDeg).toEqual([0, 0, 0]);
  });

  it("BoneAIManager::ChangeFixVector (0x060000e0) 0->1->2->0 순환 및 손 16본 포즈 손목 루트 위치 보존을 검증한다", () => {
    expect(stepShaperFixVectorCycle(0)).toBe(1);
    expect(stepShaperFixVectorCycle(1)).toBe(2);
    expect(stepShaperFixVectorCycle(2)).toBe(0);

    const handsResult = evaluateShaperAiHandsPoseJson(
      {
        left_hand: {
          convertAngles: Array.from({ length: SHAPER_AI_HAND_BONE_COUNT }, () => [10, 20, 30] as const),
          rootWorldPosition: [-12.5, 85.0, 4.2],
        },
        right_hand: null,
      },
      {
        fixLHandBoneAngles: [[1, 0, -1]],
        fixLHandBoneAnglesB: [[5, -5, 0]],
      },
    );
    expect(handsResult.leftHand).not.toBeNull();
    expect(handsResult.rightHand).toBeNull();
    expect(handsResult.leftHand?.boneEulerDeg).toHaveLength(16);
    expect(handsResult.leftHand?.boneEulerDeg[0]).toEqual([105, 15, -60]);
    expect(handsResult.leftHand?.preservedWristPosition).toEqual([-12.5, 85.0, 4.2]);
  });

  it("UIAIPreset (0x060002a8..0x060002aa) 6부위×3후보 그리드 좌표 및 UIAIPresetItem 0.1초 테두리 페이드를 검증한다", () => {
    expect(SHAPER_AI_PRESET_PARTS).toEqual([
      "head",
      "eyes",
      "nose",
      "mouth",
      "ears",
      "hair",
    ]);

    const recs = buildShaperAiPresetRecommendations({
      head: [
        { idx: 2, prob: 0.25 },
        { idx: 0, prob: 0.62 },
        { idx: 1, prob: 0.13 },
      ],
      eyes: [{ idx: 4, prob: 0.88 }],
    });
    expect(recs).toHaveLength(6);
    expect(recs[0]?.part).toBe("head");
    expect(recs[0]?.rowY).toBe(0);
    expect(recs[0]?.items[0]?.idx).toBe(0);
    expect(recs[0]?.items[0]?.probability).toBeCloseTo(0.62, 5);
    expect(recs[0]?.items[0]?.anchoredPosition).toEqual([0, -22]);
    expect(recs[0]?.items[1]?.anchoredPosition).toEqual([82, -22]);
    expect(recs[0]?.items[2]?.anchoredPosition).toEqual([164, -22]);
    expect(recs[1]?.part).toBe("eyes");
    expect(recs[1]?.rowY).toBe(-114);

    const fadeMidIn = computeShaperAiPresetBorderAlpha(1, 0.05, 0.1);
    expect(fadeMidIn.alpha).toBeCloseTo(0.5, 5);
    expect(fadeMidIn.completed).toBe(false);

    const fadeDoneIn = computeShaperAiPresetBorderAlpha(1, 0.12, 0.1);
    expect(fadeDoneIn.alpha).toBe(1);
    expect(fadeDoneIn.completed).toBe(true);
    expect(fadeDoneIn.nextFadeAniType).toBe(0);

    const fadeMidOut = computeShaperAiPresetBorderAlpha(2, 0.04, 0.1);
    expect(fadeMidOut.alpha).toBeCloseTo(0.6, 5);
    expect(fadeMidOut.completed).toBe(false);
  });
});
