import { BG_SCENE_TEMPLATES } from "../studio-background-3d-scene-templates";
import { parseStudioBg3dTemplateInstanceNodeId, resolveStudioBg3dTemplateSourceByKey } from "./studio-bg3d-template-instance";

export interface StudioBg3dSceneChoice {
  readonly templateId: string;
  readonly title: string;
  readonly cameraPreset?: string;
}

/** 예전 컷에 서로 다른 공간이 함께 들어 있으면 하나를 임의로 선택하지 않는다. */
export function studioBg3dAssistantLocationId(nodes: readonly { readonly id: string }[]): string | null {
  let sourceKey: string | null = null;
  for (const node of nodes) {
    const origin = parseStudioBg3dTemplateInstanceNodeId(node.id);
    if (origin?.sourceKind !== "catalog") continue;
    if (sourceKey !== null && origin.sourceKey !== sourceKey) return null;
    sourceKey = origin.sourceKey;
  }
  return sourceKey === null ? null : resolveStudioBg3dTemplateSourceByKey(sourceKey, BG_SCENE_TEMPLATES)?.id ?? null;
}
