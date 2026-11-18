import { createContext } from "react";
import { parseStudioBg3dSceneDocument, type StudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import type { StudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import { updateStudioScene3dCutSource } from "./studio-scene3d-shot-versions";
import type { StudioScene3dCutBg3dEditorHost } from "./studio-scene3d-cut-bg3d-host";

export const TeamVrmCutPaintAction = createContext<((host: StudioScene3dCutBg3dEditorHost, elementId: string) => void) | null>(null);

/** 채색을 제외한 배우·컷 연기·카메라·배치를 원본에서 보존하고 기존 컷 ID의 다음 버전을 만든다. */
export function reviseTeamVrmCutPaint(document: StudioBg3dSceneDocument, source: NonNullable<StudioBg3dSceneDocument["pinnedVersionedCut"]>["source"],
  expectedHash: string, elementId: string, edited: StudioVrmSceneDocument) {
  const cut = document.pinnedVersionedCut, cast = source.linkedVrm;
  const actor = cast?.characters.find(c => c.elementId === elementId);
  if (!cut || cut.sourceHash !== expectedHash || !cast || !actor || JSON.stringify(actor.vrmScene.model) !== JSON.stringify(edited.model))
    throw new Error("편집을 시작한 컷이나 캐릭터가 바뀌었습니다. 원고에서 다시 선택해 주세요.");
  if (JSON.stringify(actor.vrmScene.surfacePaint) === JSON.stringify(edited.surfacePaint)) throw new Error("채색을 바꾼 뒤 새 버전에 적용해 주세요.");
  const nextCast = { ...cast, characters: cast.characters.map(c => c === actor ? { ...c, vrmScene: { ...c.vrmScene, surfacePaint: edited.surfacePaint } } : c) };
  const next = updateStudioScene3dCutSource(cut, { ...source, linkedVrm: nextCast }, {scene: true, characterIds: []});
  const checked = parseStudioBg3dSceneDocument(JSON.stringify({...document, pinnedVersionedCut: next}));
  if (!checked?.pinnedVersionedCut) throw new Error("수정한 컷이 원고 저장 범위를 넘었습니다.");
  return checked;
}
