/**
 * motion-webtoon-studio-cut-adapter.ts — 느슨한 스튜디오 컷 입력 → StudioCutForMotion 변환.
 *
 * mapStudioCutsToMotionEpisode는 StudioCutForMotion(id·imageUrl·altKo·dialogues)
 * 을 받지만, 스튜디오 컷 원본은 그 형태가 아니다. 이 어댑터는 JSON 등으로
 * 들어온 느슨한 컷 목록을 검증·정규화한다. imageUrl이 비어 있는 컷이 하나라도
 * 있으면 변환 모듈의 계약대로 전체가 실패한다 (빈 이미지 컷을 조용히 빼지 않는다).
 */

import {
  createMotionId,
  type DialogueLine,
} from "./motion-webtoon-model";
import type { StudioCutForMotion } from "./motion-webtoon-studio-map";

export type StudioCutAdapterResult =
  | { readonly ok: true; readonly cuts: readonly StudioCutForMotion[] }
  | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function adaptDialogues(value: unknown, cutIndex: number): readonly DialogueLine[] {
  if (!Array.isArray(value)) return [];
  const lines: DialogueLine[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item) || typeof item.text !== "string" || !item.text.trim()) {
      return;
    }
    lines.push({
      id:
        typeof item.id === "string" && item.id
          ? item.id
          : createMotionId("dlg"),
      text: item.text,
      characterId:
        typeof item.characterId === "string" ? item.characterId : "",
      startOffsetSeconds:
        typeof item.startOffsetSeconds === "number" &&
        Number.isFinite(item.startOffsetSeconds)
          ? item.startOffsetSeconds
          : index * 2.5,
    });
  });
  void cutIndex;
  return lines;
}

/** 느슨한 컷 배열을 StudioCutForMotion 배열로 바꾼다. */
export function adaptStudioCutInputs(
  inputs: readonly unknown[],
): StudioCutAdapterResult {
  if (inputs.length === 0) {
    return { ok: false, reason: "가져올 컷이 없어요." };
  }
  const cuts: StudioCutForMotion[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (!isRecord(input)) {
      return { ok: false, reason: `${index + 1}번째 컷 형식이 올바르지 않아요.` };
    }
    if (typeof input.imageUrl !== "string" || !input.imageUrl.trim()) {
      return {
        ok: false,
        reason: `${index + 1}번째 컷에 이미지 주소가 없어 전체 가져오기를 중단했어요.`,
      };
    }
    cuts.push({
      id:
        typeof input.id === "string" && input.id
          ? input.id
          : createMotionId("cut"),
      imageUrl: input.imageUrl.trim(),
      altKo:
        typeof input.altKo === "string" && input.altKo
          ? input.altKo
          : `컷 ${index + 1}`,
      dialogues: adaptDialogues(input.dialogues, index),
    });
  }
  return { ok: true, cuts };
}
