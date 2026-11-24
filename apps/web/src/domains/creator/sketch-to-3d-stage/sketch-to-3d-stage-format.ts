/**
 * Sketch-to-3D Stage Solver UI 표시용 KO/EN 포맷터 및 라벨 테이블.
 */

import type {
  CameraAngleCategory,
  CameraShotCategory,
  LightingMoodCategory,
  SketchVrmBoneName,
} from "./sketch-to-3d-stage-types";

export const SKETCH_BONE_LABELS: Readonly<
  Record<SketchVrmBoneName, { readonly ko: string; readonly en: string }>
> = {
  hips: { ko: "골반 (Hips)", en: "Hips" },
  spine: { ko: "척추 (Spine)", en: "Spine" },
  head: { ko: "머리 (Head)", en: "Head" },
  leftShoulder: { ko: "왼 쇄골", en: "L. Clavicle" },
  rightShoulder: { ko: "오른 쇄골", en: "R. Clavicle" },
  leftUpperArm: { ko: "왼 상완", en: "L. Upper Arm" },
  rightUpperArm: { ko: "오른 상완", en: "R. Upper Arm" },
  leftLowerArm: { ko: "왼 전완", en: "L. Forearm" },
  rightLowerArm: { ko: "오른 전완", en: "R. Forearm" },
  leftUpperLeg: { ko: "왼 대퇴", en: "L. Thigh" },
  rightUpperLeg: { ko: "오른 대퇴", en: "R. Thigh" },
  leftLowerLeg: { ko: "왼 하퇴", en: "L. Shin" },
  rightLowerLeg: { ko: "오른 하퇴", en: "R. Shin" },
};

export function formatAngleCategory(category: CameraAngleCategory, isEn: boolean): string {
  if (category === "high-angle") return isEn ? "High-Angle" : "부감 (하이앵글)";
  if (category === "low-angle") return isEn ? "Low-Angle" : "앙각 (로우앵글)";
  return isEn ? "Eye-Level" : "아이레벨";
}

export function formatShotCategory(category: CameraShotCategory, isEn: boolean): string {
  switch (category) {
    case "extreme-close-up":
      return isEn ? "Extreme Close-Up" : "익스트림 클로즈업";
    case "close-up":
      return isEn ? "Close-Up" : "클로즈업";
    case "medium-shot":
      return isEn ? "Medium Shot" : "미디엄 샷";
    case "full-shot":
      return isEn ? "Full Shot" : "풀 샷";
    case "wide-shot":
      return isEn ? "Wide Shot" : "와이드 샷";
  }
}

export function formatLightingMood(mood: LightingMoodCategory, isEn: boolean): string {
  switch (mood) {
    case "high-key":
      return isEn ? "Soft High-Key" : "소프트 하이키";
    case "rembrandt":
      return isEn ? "Rembrandt 3/4" : "렘브란트 3/4";
    case "dramatic-side":
      return isEn ? "Dramatic Side" : "강렬한 측광";
    case "backlight-rim":
      return isEn ? "Backlight Rim" : "역광 림 드라마";
    case "under-lit":
      return isEn ? "Under-Lit" : "하방 역조명";
  }
}

export function formatSignedDeg(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}°`;
}
