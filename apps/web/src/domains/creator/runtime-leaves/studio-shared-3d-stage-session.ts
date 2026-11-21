/**
 * 공유 3D 스테이지 컬렉션에서 전체 VRM 호환성 투영을 포함한 런타임 세션을 구성한다.
 * BG3D 모달이 열릴 때만 지연 로드된다.
 */
import {
  createStudioShared3dSceneSession,
  createStudioShared3dSceneSessionFromElements,
  type StudioShared3dSceneSession,
} from "../studio-shared-3d-scene-bridge";
import { findStudioShared3dStageEntryByBundleId } from "../studio-shared-3d-stage-collection";

import type { StudioShared3dStageElementSource } from "../studio-shared-3d-stage-document";

export function createStudioShared3dSceneSessionForStage(
  value: unknown,
  elements: readonly StudioShared3dStageElementSource[],
  bundleId: string | null | undefined,
): StudioShared3dSceneSession {
  const stage = findStudioShared3dStageEntryByBundleId(value, bundleId);
  if (!stage) return createStudioShared3dSceneSession([]);
  return createStudioShared3dSceneSession(stage.characters.flatMap((character) => {
    const matches = elements.filter((element) => element.id === character.elementId);
    if (matches.length !== 1) return [];
    const session = createStudioShared3dSceneSessionFromElements(matches);
    const source = session.characters.length === 1 && session.characters[0]?.elementId === character.elementId
      ? session.characters[0]
      : null;
    return source ? [{
          elementId: character.elementId,
          label: source.label,
          scene: source.scene,
          ...(character.placement ? { stageTransform: character.placement } : {}),
          stageId: stage.id,
        }] : [];
  }));
}
