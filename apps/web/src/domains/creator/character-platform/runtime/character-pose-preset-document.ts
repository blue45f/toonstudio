import { createStudioVrmPoseEvaluationRig } from "../../vrm/studio-vrm-pose-evaluation-rig";
import { findPoseById } from "../../vrm/studio-vrm-poser-helpers";
import { applyPoseToVrm } from "../../vrm/studio-vrm-poser-utils";
import { captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { validateCharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";

import type { VRM } from "@pixiv/three-vrm";
import type { CharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";

export function createCharacterPoseEvaluationVrm(source: VRM | null | undefined, previous: CharacterPoseDocumentV3): VRM {
  return createStudioVrmPoseEvaluationRig(source, previous.root);
}

/** 원본 VRM은 읽기만 하고 메시 없는 rest 뼈대에서 기존 방향·Euler 실행기를 재사용한다. */
export function resolveCharacterPosePresetDocument(
  source: VRM | null | undefined,
  presetId: string,
  previous: CharacterPoseDocumentV3,
): CharacterPoseDocumentV3 {
  const preset = findPoseById(presetId);
  if (!preset) throw new Error("포즈 프리셋을 찾을 수 없습니다.");
  const isolated = createCharacterPoseEvaluationVrm(source, previous);
  if (!applyPoseToVrm(isolated, preset.bones, preset.yOffset ?? 0)) {
    throw new Error("현재 VRM 뼈대에서 포즈를 계산하지 못했습니다.");
  }
  const captured = captureCharacterPoseRuntimeV3({
    source: isolated, poseId: presetId, generationId: previous.generationId + 1,
  });
  // 몸통 프리셋을 바꾸어도 사진·웹캠에서 확정한 손가락 원본은 그대로 유지한다.
  const fingers = Object.fromEntries(Object.entries(previous.bones).filter(([name]) => /(?:Thumb|Index|Middle|Ring|Little)/u.test(name)));
  return validateCharacterPoseDocumentV3({ ...captured, bones: { ...fingers, ...captured.bones }, source: "preset", stylization: previous.stylization });
}
