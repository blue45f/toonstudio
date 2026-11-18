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
