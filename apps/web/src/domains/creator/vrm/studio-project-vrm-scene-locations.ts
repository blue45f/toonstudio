import { parseStudioVrmSceneDocument, serializeStudioVrmSceneDocument } from "./studio-vrm-scene-document";

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 같은 모델이라도 원고와 고정 컷 양쪽 JSON 포인터를 매니페스트에 남긴다. */
export function studioProjectVrmSceneLocations(element: unknown, pointer: string): { value: unknown; pointer: string }[] {
  const result: { value: unknown; pointer: string }[] = [];
  if (!record(element) || element.type !== "image") return result;
  if (element.vrmScene !== undefined) result.push({ value: element.vrmScene, pointer: `${pointer}/vrmScene` });
  const cut = record(element.bg3dScene) ? element.bg3dScene.pinnedVersionedCut : undefined;
  const linked = record(cut) && record(cut.source) ? cut.source.linkedVrm : undefined;
  if (record(linked) && Array.isArray(linked.characters)) {
    linked.characters.forEach((entry: unknown, index: number) => result.push({
      value: record(entry) ? entry.vrmScene : undefined,
      pointer: `${pointer}/bg3dScene/pinnedVersionedCut/source/linkedVrm/characters/${index}/vrmScene`,
    }));
  }
  return result;
}

export function canonicalStudioProjectVrmSceneLocations(element: unknown, pointer: string, invalid: () => never) {
  return studioProjectVrmSceneLocations(element, pointer).map(location => {
    const serialized = serializeStudioVrmSceneDocument(location.value);
    const scene = serialized && parseStudioVrmSceneDocument(serialized);
    if (!serialized || !scene) return invalid();
    return { scene, serialized, pointer: location.pointer };
  });
}

/** 이력 모델은 편집 레이어가 아니다. archive의 각 배우 레코드가 가리키는 실제 JSON 포인터를 순회한다. */
export function studioVrmArchiveHistoryGroups(page: unknown, pageIndex: number) {
  if (!record(page) || page.bg3dArchiveVrmHistory === undefined) return [];
  const invalid = () => new Error("아카이브의 6패스 VRM 이력 목록이 손상되었습니다.");
  if (!Array.isArray(page.bg3dArchiveVrmHistory)) throw invalid();
  return page.bg3dArchiveVrmHistory.map((revision: unknown, revisionIndex: number) => {
    if (!record(revision) || !Array.isArray(revision.characters) || typeof revision.sceneHash !== "string"
      || !/^sha256:[0-9a-f]{64}$/u.test(revision.sceneHash) || !revision.characters.length || revision.characters.length > 12) throw invalid();
    const elements = revision.characters.map((actor: unknown) => {
      if (!record(actor) || typeof actor.elementId !== "string" || !actor.vrmScene) throw invalid();
      return { type: "image", vrmScene: actor.vrmScene };
    });
    return { elements, pointer: `/pagesList/${pageIndex}/bg3dArchiveVrmHistory/${revisionIndex}/characters` };
  });
}
