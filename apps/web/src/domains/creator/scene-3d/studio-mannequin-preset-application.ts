/**
 * Studio 3D 데생 인형 — 포즈 프리셋 적용 계산(순수 계층).
 *
 * 프리셋 포즈의 골반 높이는 저작 체형(또는 rest) 기준이라, 그대로 얹으면 기본 체형에서도
 * 달리기가 23cm 뜨고 쪼그려 앉기가 18cm 바닥을 뚫었다(실측). 적용 시점에 지금 인형 —
 * 주인공이든 2인 구도의 상대든 — 의 체형으로 지지 방식(서기·앉기·무릎·바닥·공중)대로
 * 다시 접지해, 120cm 3등신부터 거인 체형까지 같은 부위가 바닥에 닿게 한다.
 * 손 전용 프리셋은 손목·손가락만 얹고 힘들여 맞춘 몸 포즈는 그대로 둔다.
 */

import { findStudioMannequinDuoComposition } from "./studio-mannequin-duo-composition";
import { groundStudioMannequinPresetPoseForBody } from "./studio-mannequin-pose-ground-contact";
import {
  applyStudioMannequinHandPreset,
  normalizeStudioMannequinPose,
  studioMannequinPosePresetScope,
  type StudioMannequinPose,
  type StudioMannequinPosePreset,
} from "./studio-mannequin-poses";
import {
  convertWebtoonPresetToMannequinPose,
  resolveWebtoonPresetGroundSpec,
} from "./studio-webtoon-pose-mannequin-adapter";

import type { CharacterFullBodyPosePreset } from "./studio-3d-advanced-poses-library";
import type { StudioMannequinBodyParams } from "./studio-mannequin-model";

/** 2인 프리셋(커플·대치 등) — 한 번의 적용으로 상대 인형까지 배치하는 프리셋인지. */
export function isStudioMannequinDuoPreset(preset: {
  readonly id: string;
  readonly figures?: 1 | 2;
}): boolean {
  return (preset.figures ?? 1) === 2 || findStudioMannequinDuoComposition(preset.id) !== null;
}

/**
 * 데생 인형 라이브러리 프리셋을 지금 체형에 맞춘 포즈로 바꾼다.
 * @param currentPose 손 전용 프리셋이 손만 얹을 바탕 몸 포즈.
 */
export function resolveStudioMannequinLibraryPresetPose(
  preset: StudioMannequinPosePreset,
  bodyParams: StudioMannequinBodyParams,
  currentPose: StudioMannequinPose,
): StudioMannequinPose {
  if (studioMannequinPosePresetScope(preset) === "hand-only") {
    return normalizeStudioMannequinPose(applyStudioMannequinHandPreset(currentPose, preset));
  }
  return groundStudioMannequinPresetPoseForBody(
    normalizeStudioMannequinPose(preset.pose),
    bodyParams,
    preset.ground,
  );
}

/** 웹툰 포즈 프리셋(휴머노이드 규약)을 데생 인형 포즈로 바꾸고 지금 체형으로 접지한다. */
export function resolveStudioMannequinWebtoonPresetPose(
  preset: CharacterFullBodyPosePreset,
  bodyParams: StudioMannequinBodyParams,
): StudioMannequinPose {
  return groundStudioMannequinPresetPoseForBody(
    convertWebtoonPresetToMannequinPose(preset),
    bodyParams,
    resolveWebtoonPresetGroundSpec(preset),
  );
}
