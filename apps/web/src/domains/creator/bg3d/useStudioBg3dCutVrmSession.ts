import { useMemo } from "react";
import { createStudioShared3dSceneSession, type StudioShared3dSceneSession, type StudioShared3dCaptureReadiness, type StudioShared3dCharacterRuntimeStatus, type StudioShared3dCharacterSource } from "../studio-shared-3d-scene-bridge";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

/** 고정 캐릭터는 같은 원고·페이지의 뷰포트에서만 현재 원본을 대신한다. */
export function useStudioBg3dCutVrmSession(
  document: StudioBg3dSceneDocument,
  live: StudioShared3dSceneSession | undefined,
  scope: string | undefined,
  team: boolean | undefined,
  workId?: string, resources?: StudioShared3dCharacterSource["teamCutResources"],
) {
  const pinned = document.pinnedVersionedCut?.source.linkedVrm;
  const frozen = useMemo(() => {
    if ((team && !workId) || !pinned || pinned.documentScope !== scope) return null;
    const session = createStudioShared3dSceneSession(pinned.characters.map(({ vrmScene, ...character }) => ({ ...character, scene: vrmScene })));
    return resources ? { ...session, characters: session.characters.map(character => ({ ...character, teamCutResources: resources })) } : session;
  }, [pinned, scope, team, workId, resources]);
  return { sharedSceneSession: frozen ?? live, frozenCut: Boolean(frozen) };
}


export function studioBg3dCaptureCharacterAuthorityDraft(
  includeCharactersInCapture: boolean,
  characters: readonly StudioShared3dCharacterSource[],
  readiness: StudioShared3dCaptureReadiness,
  statuses: Readonly<Record<string, StudioShared3dCharacterRuntimeStatus>>,
) {
  return {
    includeCharactersInCapture,
    readinessPhase: readiness.phase,
    expectedCharacters: characters.map(({ elementId, runtimeKey, modelRuntimeKey, placementHash, sourceHash }) =>
      ({ elementId, runtimeKey, modelRuntimeKey, placementHash, sourceHash })),
    capturableElementIds: readiness.capturableElementIds,
    previewOnlyElementIds: readiness.previewOnlyElementIds,
    pendingElementIds: characters.filter(c => !statuses[c.runtimeKey] || statuses[c.runtimeKey] === "loading").map(c => c.elementId),
    unavailableElementIds: characters.filter(c => statuses[c.runtimeKey] === "unavailable").map(c => c.elementId),
  } as const;
}
