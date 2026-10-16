/**
 * 소재 메타데이터 패치의 병합 규칙 — 권리 영수증 갱신이 AI 사용 표기를 지우지 않게 한다.
 *
 * `updateStudioBg3dAssetRights` 는 영수증을 통째로 교체한다. 다만 AI 사용 표기(aiGenerated·aiTraining)는 구매·허가 같은
 * 권리 폼과 다른 길(가져오기 폼의 AI 질문)로 기록되는 값이라, 새 영수증이 그 칸을 아예 말하지 않으면 저장돼 있던 값을 지킨다.
 * - 칸이 없음(undefined): 저장된 값을 지킨다.
 * - "unknown": 지운다(미확인으로 되돌림).
 * - "yes"·"no"·"allowed"·"prohibited": 그 값으로 바꾼다.
 * - 영수증 전체가 저장 규칙에 걸려 기본값으로 내려가면 AI 칸도 말한 대로(말하지 않았으면 저장된 값) 따른다.
 *
 * 이 모듈은 의존하는 모듈이 없다(타입만 가져온다). 저장소가 두 길(OPFS 매니페스트·IndexedDB)에서 같은 규칙을 쓰도록 한곳에 둔다.
 */

import type { StudioBg3dAssetMetadata } from "./studio-bg3d-asset-metadata";

export type StudioBg3dAssetPatchKey = "favorite" | "collections" | "tags" | "rights";

/**
 * 저장할 패치 값. `validated` 는 패치를 저장 규칙으로 정규화한 기록이고 `rawValue` 는 호출자가 넘긴 원래 값이다.
 * 권리가 아닌 패치는 정규화된 값을 그대로 쓴다.
 */
export function resolveStudioBg3dAssetPatchValue(
  existing: StudioBg3dAssetMetadata,
  patchKey: StudioBg3dAssetPatchKey,
  rawValue: unknown,
  validated: StudioBg3dAssetMetadata,
): unknown {
  if (patchKey !== "rights") return validated[patchKey];
  const asked = typeof rawValue === "object" && rawValue !== null ? (rawValue as Record<string, unknown>) : {};
  const incoming = validated.rights;
  const aiGenerated = asked.aiGenerated === undefined ? existing.rights.aiGenerated : incoming.aiGenerated;
  const aiTraining = asked.aiTraining === undefined ? existing.rights.aiTraining : incoming.aiTraining;
  return {
    ...incoming,
    ...(aiGenerated ? { aiGenerated } : {}),
    ...(aiTraining ? { aiTraining } : {}),
  };
}
