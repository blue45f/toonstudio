import { describe, expect, it } from "vitest";
import {
  aiBoneAxisFix,
  buildAiPreviewDummySkeleton,
  classifyShaperBonePreviewRegion,
  composeRecommendedPresetSlots,
  convertAiBoneSetToCharacterPose,
  convertAiHandsBoneSetToHandPose,
  eulerDegToQuat,
  fixBoneAngles,
  fixLHandBoneAngles,
  fixRHandBoneAngles,
  getShaperAiPoseTypeMeta,
  quatToEulerDeg,
  recommendShaperFacePresetSet,
  SHAPER_AI_POSE_TYPES,
  SHAPER_FACE_PART_TYPES,
  SHAPER_PREVIEW_REGION_COLORS,
  type AIBoneSet,
  type AIHandsBoneSet,
} from "./studio-ai-shaper-bone-preset-engine";

describe("studio-ai-shaper-bone-preset-engine", () => {
  describe("5종 ShaperAiPoseType 메타데이터", () => {
    it("body, hand, bodyWebCam, handWebCam, preset 5종을 모두 지원하고 메타 정보를 반환한다", () => {
      expect(SHAPER_AI_POSE_TYPES).toEqual([
        "body",
        "hand",
        "bodyWebCam",
        "handWebCam",
        "preset",
      ]);

      expect(getShaperAiPoseTypeMeta("body")).toMatchObject({
        sourceKind: "image",
        targetKind: "body-pose",
      });
      expect(getShaperAiPoseTypeMeta("hand")).toMatchObject({
        sourceKind: "image",
        targetKind: "hand-pose",
      });
      expect(getShaperAiPoseTypeMeta("bodyWebCam")).toMatchObject({
        sourceKind: "webcam",
        targetKind: "body-pose",
      });
      expect(getShaperAiPoseTypeMeta("handWebCam")).toMatchObject({
        sourceKind: "webcam",
        targetKind: "hand-pose",
      });
      expect(getShaperAiPoseTypeMeta("preset")).toMatchObject({
        sourceKind: "image",
        targetKind: "face-preset",
      });
    });
  });

  describe("본 축 보정 (aiBoneAxisFix / fixBoneAngles / fixLHandBoneAngles / fixRHandBoneAngles)", () => {
    it("전신 주요 관절의 축 부호 반전과 해부학적 가동 범위 클램프를 수행한다", () => {
      expect(aiBoneAxisFix.spine).toBeDefined();

      // spine: signX = -1, signY = 1, signZ = -1, minDeg.x = -45, maxDeg.x = 60
      const fixedSpine = fixBoneAngles("spine", { x: -20, y: 15, z: 10 });
      expect(fixedSpine).toEqual({ x: 20, y: 15, z: -10 });

      // 과도한 각도 입력 시 해부학적 한계 내로 클램프
      const clampedSpine = fixBoneAngles("spine", { x: -120, y: 90, z: -80 });
      expect(clampedSpine).toEqual({ x: 60, y: 45, z: 35 });
    });

    it("왼손(fixLHandBoneAngles)과 오른손(fixRHandBoneAngles) 손가락 축을 대칭 보정하고 과신전을 방지한다", () => {
      const rawFinger = { x: 40, y: 12, z: 25 };
      const leftIndex = fixLHandBoneAngles("leftIndex1", rawFinger);
      const rightIndex = fixRHandBoneAngles("rightIndex1", rawFinger);

      // X(굽힘)는 동일하고 Y/Z(벌림·비틀림) 부호가 좌우 대칭 반전됨
      expect(leftIndex.x).toBe(40);
      expect(rightIndex.x).toBe(40);
      expect(leftIndex.y).toBe(-rightIndex.y);
      expect(leftIndex.z).toBe(-rightIndex.z);

      // 역방향 과신전(-60도) 입력 시 최소 각도(-10도)로 클램프됨
      const hyperExtended = fixLHandBoneAngles("leftMiddle2", { x: -60, y: 0, z: 0 });
      expect(hyperExtended.x).toBe(-10);

      // 엄지(thumb) 전용 오프셋 및 손목(wrist) 클램프 검증
      const leftThumb = fixLHandBoneAngles("leftThumb1", { x: 10, y: 10, z: 0 });
      const rightThumb = fixRHandBoneAngles("rightThumb1", { x: 10, y: 10, z: 0 });
      expect(leftThumb.x).toBe(15);
      expect(rightThumb.x).toBe(15);
      expect(leftThumb.y).toBe(-rightThumb.y);
    });

    it("오일러 각도와 쿼터니언 상호 변환이 일관되게 동작한다", () => {
      const euler = { x: 25, y: -30, z: 15 };
      const quat = eulerDegToQuat(euler);
      const restored = quatToEulerDeg(quat);
      expect(restored.x).toBeCloseTo(euler.x, 2);
      expect(restored.y).toBeCloseTo(euler.y, 2);
      expect(restored.z).toBeCloseTo(euler.z, 2);
    });
  });

  describe("전신 및 양손 포즈 변환과 불확실성(uncertainties) 필터링", () => {
    it("불확실성 임계값을 초과한 관절은 기본 안정 포즈(fallback)와 신뢰도 가중 블렌딩한다", () => {
      const boneSet: AIBoneSet = {
        names: ["hips", "spine", "leftUpperArm", "leftLowerArm"],
        parents: [-1, 0, 1, 2],
        keypoints: [
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 1.25, z: 0 },
          { x: -0.2, y: 1.4, z: 0 },
          { x: -0.45, y: 1.15, z: 0.1 },
        ],
        uncertainties: [0.1, 0.2, 0.7, 1.0],
        convertAngles: [
          { x: 0, y: 0, z: 0 },
          { x: -10, y: 5, z: 0 },
          { x: 30, y: -20, z: -40 },
          { x: 110, y: 0, z: 0 },
        ],
      };

      const pose = convertAiBoneSetToCharacterPose(boneSet, {
        poseType: "body",
        uncertaintyThreshold: 0.4,
        fallbackAnglesDeg: {
          leftUpperArm: { x: 0, y: 0, z: -10 },
          leftLowerArm: { x: 15, y: 0, z: 0 },
        },
      });

      expect(pose.poseType).toBe("body");
      expect(pose.filteredBoneCount).toBe(2);

      // spine은 불확실성 0.2 <= 0.4 이므로 필터링 없이 축 보정값 그대로 반영
      const spine = pose.boneMap.spine!;
      expect(spine.filteredByUncertainty).toBe(false);
      expect(spine.aiBlendWeight).toBe(1);
      expect(spine.finalEulerDeg).toEqual({ x: 10, y: 5, z: 0 });

      // leftUpperArm은 불확실성 0.7 > 0.4 이므로 aiBlendWeight = 0.5로 블렌딩
      const upperArm = pose.boneMap.leftUpperArm!;
      expect(upperArm.filteredByUncertainty).toBe(true);
      expect(upperArm.aiBlendWeight).toBeCloseTo(0.5, 4);
      expect(upperArm.fixedEulerDeg).toEqual({ x: 30, y: 20, z: 40 });
      expect(upperArm.finalEulerDeg).toEqual({ x: 15, y: 10, z: 15 });

      // leftLowerArm은 불확실성 1.0 이므로 100% fallback 안정 포즈로 수렴
      const lowerArm = pose.boneMap.leftLowerArm!;
      expect(lowerArm.filteredByUncertainty).toBe(true);
      expect(lowerArm.aiBlendWeight).toBe(0);
      expect(lowerArm.finalEulerDeg).toEqual({ x: 15, y: 0, z: 0 });
    });

    it("convertAngles가 없을 때 convertRotations 또는 3D 키포인트 방향 벡터로부터 회전을 추론한다", () => {
      const boneSet: AIBoneSet = {
        names: ["hips", "spine"],
        parents: [-1, 0],
        keypoints: [
          { x: 0, y: 1, z: 0 },
          { x: 0, y: 0.5, z: 0.5 },
        ],
        uncertainties: [0.05, 0.1],
      };

      const pose = convertAiBoneSetToCharacterPose(boneSet, { poseType: "bodyWebCam" });
      expect(pose.poseType).toBe("bodyWebCam");
      expect(pose.boneMap.spine?.rawEulerDeg.x).toBeGreaterThan(0);
    });

    it("AIHandsBoneSet을 양손 포즈로 변환하고 좌·우 손 불확실성 필터링 통계를 집계한다", () => {
      const handsSet: AIHandsBoneSet = {
        left: {
          names: ["leftWrist", "leftIndex1"],
          parents: [-1, 0],
          keypoints: [
            { x: -0.4, y: 1.0, z: 0.2 },
            { x: -0.45, y: 0.95, z: 0.25 },
          ],
          uncertainties: [0.1, 0.8],
          convertAngles: [
            { x: 10, y: 5, z: -5 },
            { x: 60, y: 10, z: 15 },
          ],
        },
        right: {
          names: ["rightWrist", "rightIndex1"],
          parents: [-1, 0],
          keypoints: [
            { x: 0.4, y: 1.0, z: 0.2 },
            { x: 0.45, y: 0.95, z: 0.25 },
          ],
          uncertainties: [0.1, 0.2],
          convertAngles: [
            { x: 10, y: 5, z: -5 },
            { x: 60, y: 10, z: 15 },
          ],
        },
      };

      const handPose = convertAiHandsBoneSetToHandPose(handsSet, {
        poseType: "handWebCam",
        uncertaintyThreshold: 0.4,
      });

      expect(handPose.poseType).toBe("handWebCam");
      expect(handPose.totalFilteredBoneCount).toBe(1);
      expect(handPose.left?.boneMap.leftIndex1?.filteredByUncertainty).toBe(true);
      expect(handPose.right?.boneMap.rightIndex1?.filteredByUncertainty).toBe(false);
      expect(handPose.averageConfidence).toBeCloseTo(0.7, 2);
    });
  });

  describe("컬러 프리뷰 더미 본 세그먼트 (buildAiPreviewDummySkeleton)", () => {
    it("6대 신체 부위별 프리뷰 머티리얼 컬러와 3D 선분·신뢰도를 생성한다", () => {
      expect(classifyShaperBonePreviewRegion("spine")).toBe("spine");
      expect(classifyShaperBonePreviewRegion("head")).toBe("head");
      expect(classifyShaperBonePreviewRegion("leftUpperArm")).toBe("leftArm");
      expect(classifyShaperBonePreviewRegion("rightHand")).toBe("rightArm");
      expect(classifyShaperBonePreviewRegion("leftLowerLeg")).toBe("leftLeg");
      expect(classifyShaperBonePreviewRegion("rightFoot")).toBe("rightLeg");

      const boneSet: AIBoneSet = {
        names: ["hips", "spine", "head", "leftUpperArm", "rightUpperArm", "leftUpperLeg", "rightUpperLeg"],
        parents: [-1, 0, 1, 1, 1, 0, 0],
        keypoints: [
          { x: 0, y: 1.0, z: 0 },
          { x: 0, y: 1.3, z: 0 },
          { x: 0, y: 1.6, z: 0 },
          { x: -0.25, y: 1.3, z: 0 },
          { x: 0.25, y: 1.3, z: 0 },
          { x: -0.15, y: 0.6, z: 0 },
          { x: 0.15, y: 0.6, z: 0 },
        ],
        uncertainties: [0.05, 0.1, 0.15, 0.2, 0.65, 0.1, 0.1],
      };

      const dummy = buildAiPreviewDummySkeleton(boneSet, { uncertaintyThreshold: 0.45 });
      expect(dummy.joints).toHaveLength(7);
      expect(dummy.segments).toHaveLength(6);
      expect(dummy.lowConfidenceSegmentCount).toBe(1);
      expect(dummy.regionCounts).toEqual({
        spine: 1,
        head: 1,
        leftArm: 1,
        rightArm: 1,
        leftLeg: 1,
        rightLeg: 1,
      });

      const rightArmSeg = dummy.segments.find((s) => s.boneName === "rightUpperArm")!;
      expect(rightArmSeg.colorHex).toBe(SHAPER_PREVIEW_REGION_COLORS.rightArm);
      expect(rightArmSeg.length).toBeCloseTo(0.25, 4);
      expect(rightArmSeg.isLowConfidence).toBe(true);
    });
  });

  describe("사진 기반 6-파츠 얼굴 프리셋 추천기 (recommendShaperFacePresetSet & composeRecommendedPresetSlots)", () => {
    it("얼굴 특징량에 따라 6개 파츠(head, eyes, nose, mouth, ears, hair) 후보를 랭킹하고 원클릭 조합 슬롯을 생성한다", () => {
      expect(SHAPER_FACE_PART_TYPES).toEqual([
        "head",
        "eyes",
        "nose",
        "mouth",
        "ears",
        "hair",
      ]);

      // 날렵한 V라인 + 올라간 고양이 눈매 + 높은 콧대 + 애교 미소 + 뾰족한 귀 + 롱 웨이브 풀뱅
      const sharpFelineProfile = recommendShaperFacePresetSet({
        jawlineRatio: 0.18,
        faceLengthRatio: 0.55,
        eyeSlantDeg: 10,
        eyeSizeRatio: 0.65,
        noseLengthRatio: 0.82,
        noseWidthRatio: 0.22,
        mouthCornerCurve: 0.75,
        lipThicknessRatio: 0.65,
        earShapeRatio: 0.9,
        hairSilhouetteRatio: 0.92,
        bangsDensityRatio: 0.88,
      });

      expect(sharpFelineProfile.poseType).toBe("preset");
      expect(sharpFelineProfile.head[0]?.id).toBe("head_slender_v");
      expect(sharpFelineProfile.eyes[0]?.id).toBe("eyes_feline_sharp");
      expect(sharpFelineProfile.nose[0]?.id).toBe("nose_high_straight");
      expect(sharpFelineProfile.mouth[0]?.id).toBe("mouth_bright_smile");
      expect(sharpFelineProfile.ears[0]?.id).toBe("ears_pointed_prominent");
      expect(sharpFelineProfile.hair[0]?.id).toBe("hair_long_fullbang_wave");
      expect(sharpFelineProfile.overallConfidence).toBeGreaterThan(0.85);

      // 대조적인 동안 라운드 + 순한 처진 눈매 + 버튼 코 + 숏컷 프로필
      const softYouthProfile = recommendShaperFacePresetSet({
        jawlineRatio: 0.45,
        faceLengthRatio: 0.2,
        eyeSlantDeg: -10,
        eyeSizeRatio: 0.88,
        noseLengthRatio: 0.22,
        noseWidthRatio: 0.4,
        mouthCornerCurve: -0.5,
        lipThicknessRatio: 0.2,
        earShapeRatio: 0.15,
        hairSilhouetteRatio: 0.12,
        bangsDensityRatio: 0.18,
      });

      expect(softYouthProfile.head[0]?.id).toBe("head_soft_round");
      expect(softYouthProfile.eyes[0]?.id).toBe("eyes_gentle_droopy");
      expect(softYouthProfile.nose[0]?.id).toBe("nose_cute_button");
      expect(softYouthProfile.mouth[0]?.id).toBe("mouth_cool_thin");
      expect(softYouthProfile.ears[0]?.id).toBe("ears_compact_flat");
      expect(softYouthProfile.hair[0]?.id).toBe("hair_short_neat_crop");

      // 상위 K개 원클릭 캐릭터 조합 슬롯 생성 검증
      const slots = composeRecommendedPresetSlots(sharpFelineProfile, 2);
      expect(slots).toHaveLength(2);
      expect(slots[0]?.slotIndex).toBe(1);
      expect(slots[0]?.parts.head.id).toBe("head_slender_v");
      expect(slots[0]?.parts.eyes.id).toBe("eyes_feline_sharp");
      expect(slots[0]?.averageScore).toBeGreaterThan(slots[1]!.averageScore);
    });
  });
});
