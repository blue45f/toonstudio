/**
 * Studio VRM 포저의 순수 조회·서식·포즈 수학 헬퍼.
 * `StudioVrmPoser.tsx`에서 그대로 옮겨온 모듈 스코프 함수들이다(동작 동일).
 * React·상태 의존이 없어 단위 테스트에서 그대로 부를 수 있다.
 */
import * as THREE from "three";
import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";

import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES, POSER_FINGER_BONES } from "../studio-pose-presets";
import { createTwoBoneDefaultPoleTarget } from "../studio-rig-two-bone-ik";

import { STUDIO_VRM_HTML_FALLBACK_ERROR as HTML_FALLBACK_VRM_ERROR } from "./studio-vrm-asset-runtime";
import { studioVrmCustomExpressionLabel } from "./studio-vrm-generate-expressions";
import { createStudioVrmHandPose, type StudioVrmHandPoseType } from "./studio-vrm-hand-poses";
import { StudioVrmPngWorkerError } from "./studio-vrm-png-worker-client";
import { EMPTY_STUDIO_VRM_POSE_TRANSLATIONS } from "./studio-vrm-pose-translations";
import {
  BONE_CATEGORIES,
  CAMERA_PRESETS,
  EXPRESSION_LABELS,
  EXPRESSION_ORDER,
  NEUTRAL_EXPRESSION_ACTION,
  type ExpressionAction,
} from "./studio-vrm-poser-catalogs";
import {
  applyPoserVisualState,
  POSE_PRESETS,
  stripFingerBones,
  type BodyScale,
  type FingerRotationMap,
  type PoseBoneMap,
  type PosePreset,
} from "./studio-vrm-poser-utils";
import { STUDIO_VRM_USER_IK_CHAINS } from "./studio-vrm-user-ik";
import {
  STUDIO_VRM_JOINT_HANDLE_DEFINITIONS,
  type StudioVrmIkEffectorBone,
  type StudioVrmJointHandleBone,
} from "./StudioVrmJointHandles";
import { findVrmActionSilhouettePreset } from "./vrm-action-silhouette-presets";

import type { StudioVrmCameraSettings, StudioVrmPoseTranslations, StudioVrmSceneDocument } from "./studio-vrm-scene-document";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

/** 궤도 계산의 배정밀도 잔차는 제외하고 GPU에서 구별되는 카메라 변경을 검출한다. */
export function studioVrmCaptureCameraIdentity(camera: StudioVrmCameraSettings | null): string | null {
  return camera ? JSON.stringify(camera, (_key, value: unknown) => typeof value === "number" ? Math.fround(value) : value) : null;
}

export function studioVrmTexturePaintSceneIdentity(
  scene: StudioVrmSceneDocument | undefined,
): string {
  if (!scene) return "new-scene";
  return JSON.stringify(scene.surfacePaint);
}

export const EXPORT_HEIGHT = 520;
export const FALLBACK_EXPORT_WIDTH = 360;
export const THUMBNAIL_WIDTH = 72;
export const THUMBNAIL_HEIGHT = 96;

const POSE_PRESET_HAND_PAIR: Readonly<
  Record<string, readonly [left: StudioVrmHandPoseType, right: StudioVrmHandPoseType]>
> = {
  peace: ["relaxed", "peace"],
  wave: ["relaxed", "open"],
  cheer: ["fist", "fist"],
  action: ["fist", "fist"],
  point: ["relaxed", "point"],
  heroic: ["fist", "fist"],
  heart: ["fingerHeart", "fingerHeart"],
  selfie: ["peace", "phoneGrip"],
  thumbsup: ["relaxed", "thumbsUp"],
  guard: ["fist", "fist"],
  punch: ["fist", "fist"],
  kick: ["fist", "fist"],
  magic: ["open", "open"],
  surprise: ["open", "open"],
  pray: ["open", "open"],
};

export function extractStudioVrmFingerRotations(
  bones: PoseBoneMap,
  poseId?: string,
): FingerRotationMap {
  const fingers: FingerRotationMap = {};
  for (const boneName of POSER_FINGER_BONES) {
    const rotation = bones[boneName]?.rotation;
    if (!rotation) continue;
    fingers[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  if (Object.keys(fingers).length > 0) {
    return fingers;
  }
  const actionPreset = poseId ? findVrmActionSilhouettePreset(poseId) : null;
  const [leftPose, rightPose]: readonly [StudioVrmHandPoseType, StudioVrmHandPoseType] =
    actionPreset?.handPair
    ?? (poseId ? POSE_PRESET_HAND_PAIR[poseId] : undefined)
    ?? (["relaxed", "relaxed"] as const);
  return {
    ...createStudioVrmHandPose("left", leftPose),
    ...createStudioVrmHandPose("right", rightPose),
  };
}

export function mergeStudioVrmFingerRotationsIntoBones(
  bones: PoseBoneMap,
  fingerEdits: FingerRotationMap,
): PoseBoneMap {
  const merged: PoseBoneMap = { ...bones };
  for (const boneName of POSER_FINGER_BONES) {
    const rotation = fingerEdits[boneName];
    if (!rotation) continue;
    merged[boneName] = { rotation: [rotation[0], rotation[1], rotation[2]] };
  }
  return merged;
}

export function applyStudioVrmRotationPose(
  targetVrm: VRM,
  pose: {
    bones: PoseBoneMap;
    yOffset: number;
    translations?: StudioVrmPoseTranslations;
  },
  bodyScale: BodyScale,
) {
  applyPoserVisualState(targetVrm, {
    bones: stripFingerBones(pose.bones),
    yOffset: pose.yOffset,
    poseTranslations: pose.translations ?? EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
    fingerEdits: extractStudioVrmFingerRotations(pose.bones),
    bodyScale,
  });
}

export function createStudioVrmIkPole(
  targetVrm: VRM,
  effector: StudioVrmIkEffectorBone,
): THREE.Vector3 | undefined {
  try {
    const chain = STUDIO_VRM_USER_IK_CHAINS[effector];
    const upper = targetVrm.humanoid.getNormalizedBoneNode(chain.upper);
    const lower = targetVrm.humanoid.getNormalizedBoneNode(chain.lower);
    const end = targetVrm.humanoid.getNormalizedBoneNode(chain.end);
    if (!upper || !lower || !end) return undefined;
    targetVrm.scene.updateMatrixWorld(true);
    const startWorld = upper.getWorldPosition(new THREE.Vector3());
    const middleWorld = lower.getWorldPosition(new THREE.Vector3());
    const endWorld = end.getWorldPosition(new THREE.Vector3());
    const values = [startWorld, middleWorld, endWorld].flatMap((point) => [point.x, point.y, point.z]);
    if (!values.every(Number.isFinite)) return undefined;
    const pole = createTwoBoneDefaultPoleTarget(
      [startWorld.x, startWorld.y, startWorld.z],
      [middleWorld.x, middleWorld.y, middleWorld.z],
      [endWorld.x, endWorld.y, endWorld.z],
    );
    return new THREE.Vector3(pole[0], pole[1], pole[2]);
  } catch {
    return undefined;
  }
}

export function categoryForStudioVrmJointHandle(bone: StudioVrmJointHandleBone): string | null {
  return BONE_CATEGORIES.find((category) => category.bones.includes(bone))?.id ?? null;
}

export function resolveStudioVrmJointHandleBone(bone: VRMHumanBoneName): StudioVrmJointHandleBone | null {
  return STUDIO_VRM_JOINT_HANDLE_DEFINITIONS.find((definition) => definition.bone === bone)?.bone ?? null;
}

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function findPoseById(id: string): PosePreset | null {
  // 기본 프리셋 → 확장 팩 → 자연 아이들(스폰 기본) → 웹툰 액션 실루엣 12종 순으로 탐색.
  return (
    POSE_PRESETS.find((pose) => pose.id === id) ??
    EXTRA_POSE_PRESETS.find((pose) => pose.id === id) ??
    NATURAL_IDLE_POSES.find((pose) => pose.id === id) ??
    findVrmActionSilhouettePreset(id) ??
    null
  );
}

export function findPose(id: string): PosePreset {
  return findPoseById(id) ?? POSE_PRESETS[0];
}

export function findCameraPreset(id: string) {
  return CAMERA_PRESETS.find((preset) => preset.id === id) ?? CAMERA_PRESETS[0];
}

export function getExpressionTone(name: string, vrm: VRM) {
  const expressionManager = vrm.expressionManager;
  if (!expressionManager) return "표정";
  if (expressionManager.mouthExpressionNames.includes(name)) return "입모양";
  if (expressionManager.blinkExpressionNames.includes(name)) return "눈";
  if (name.startsWith("look")) return "시선";
  return EXPRESSION_LABELS[name] ? "기본" : "커스텀";
}

export function formatExpressionLabel(name: string) {
  // 아바타 조형에서 만든 커스텀 표정(윙크·게슴츠레 …)은 키가 ASCII 라 한글 템플릿 라벨로 보여 준다.
  return EXPRESSION_LABELS[name]
    ?? studioVrmCustomExpressionLabel(name)
    ?? name.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getAvailableExpressionActions(vrm: VRM | null) {
  const expressionManager = vrm?.expressionManager;
  if (!expressionManager) return [];

  const expressionNames = expressionManager.expressions
    .map((expression) => expression.expressionName)
    .filter((name) => name !== "neutral")
    .sort((a, b) => {
      const aIndex = EXPRESSION_ORDER.indexOf(a);
      const bIndex = EXPRESSION_ORDER.indexOf(b);
      if (aIndex !== -1 || bIndex !== -1) {
        return (aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex);
      }
      return a.localeCompare(b);
    });

  return [
    NEUTRAL_EXPRESSION_ACTION,
    ...expressionNames.map<ExpressionAction>((name) => ({
      id: name,
      label: formatExpressionLabel(name),
      name,
      tone: getExpressionTone(name, vrm),
    })),
  ];
}

// three-vrm의 VRMExpressionManager.customExpressionMap은 VRM1 expressions.custom과,
export function getExpressionCategory(action: ExpressionAction): "emotion" | "eye" | "mouth" | "custom" {
  const name = action.name;
  if (!name) return "emotion";
  const tone = action.tone;
  if (tone === "눈" || tone === "시선" || name.startsWith("blink") || name.startsWith("look")) {
    return "eye";
  }
  if (tone === "입모양" || ["aa", "ih", "ou", "ee", "oh"].includes(name)) {
    return "mouth";
  }
  if (["happy", "sad", "relaxed", "angry", "surprised"].includes(name) || tone === "기본") {
    return "emotion";
  }
  return "custom";
}

export function roundExportSize(canvas: HTMLCanvasElement) {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { width: FALLBACK_EXPORT_WIDTH, height: EXPORT_HEIGHT };
  }

  const aspect = canvas.width / canvas.height;
  return { width: Math.round(EXPORT_HEIGHT * aspect), height: EXPORT_HEIGHT };
}

export function roundThumbnailCaptureSize(canvas: HTMLCanvasElement) {
  if (canvas.width <= 0 || canvas.height <= 0) {
    return { width: Math.round(THUMBNAIL_HEIGHT * FALLBACK_EXPORT_WIDTH / EXPORT_HEIGHT), height: THUMBNAIL_HEIGHT };
  }
  const scale = Math.min(THUMBNAIL_WIDTH / canvas.width, THUMBNAIL_HEIGHT / canvas.height);
  return {
    width: Math.max(1, Math.round(canvas.width * scale)),
    height: Math.max(1, Math.round(canvas.height * scale)),
  };
}

export function createCharacterThumbnail(
  rgba: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
) {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const thumbnailCanvas = document.createElement("canvas");
  thumbnailCanvas.width = THUMBNAIL_WIDTH;
  thumbnailCanvas.height = THUMBNAIL_HEIGHT;

  const sourceContext = sourceCanvas.getContext("2d");
  const context = thumbnailCanvas.getContext("2d");
  if (
    !sourceContext || !context ||
    sourceWidth <= 0 || sourceHeight <= 0 ||
    rgba.byteLength !== sourceWidth * sourceHeight * 4
  ) {
    sourceCanvas.width = 1;
    sourceCanvas.height = 1;
    thumbnailCanvas.width = 1;
    thumbnailCanvas.height = 1;
    return null;
  }

  const imageData = sourceContext.createImageData(sourceWidth, sourceHeight);
  imageData.data.set(rgba);
  sourceContext.putImageData(imageData, 0, 0);
  const scale = Math.min(THUMBNAIL_WIDTH / sourceWidth, THUMBNAIL_HEIGHT / sourceHeight);
  const drawWidth = Math.round(sourceWidth * scale);
  const drawHeight = Math.round(sourceHeight * scale);
  const drawX = Math.round((THUMBNAIL_WIDTH - drawWidth) / 2);
  const drawY = Math.round((THUMBNAIL_HEIGHT - drawHeight) / 2);

  context.clearRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  context.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
  const dataUrl = thumbnailCanvas.toDataURL("image/png");
  sourceCanvas.width = 1;
  sourceCanvas.height = 1;
  thumbnailCanvas.width = 1;
  thumbnailCanvas.height = 1;
  return dataUrl;
}

export function getErrorMessage(caughtError: unknown, fallback: string) {
  if (caughtError instanceof StudioVrmPngWorkerError && caughtError.phase === "startup")
    return translateBilingualPair("vrm.png", "PNG 저장 도구를 제시간에 열지 못했어요. 현재 포즈에서 다시 시도해 주세요.", "The PNG encoder took too long to start. Try again with the current pose.");
  if (caughtError instanceof StudioVrmPngWorkerError && caughtError.phase === "encode")
    return translateBilingualPair("vrm.png", "캐릭터 PNG 변환 시간이 초과됐어요. 현재 포즈에서 다시 시도해 주세요.", "Encoding the character PNG took too long. Try again with the current pose.");
  return caughtError instanceof Error ? caughtError.message : fallback;
}

export function getVrmLoadErrorMessage(caughtError: unknown) {
  const message = getErrorMessage(caughtError, "VRM을 불러오지 못했습니다.");
  return /Unexpected token '<'|<!doctype/i.test(message) ? HTML_FALLBACK_VRM_ERROR : message;
}
