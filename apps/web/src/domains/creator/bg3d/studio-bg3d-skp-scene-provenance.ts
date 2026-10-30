import { mergeStudioBg3dSkpGlbSceneExtras } from "./studio-bg3d-skp-glb-scale";
import { parseStudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-source";

import type { StudioBg3dSkpSceneSourceParseResult } from "./studio-bg3d-skp-scene-source";

const SOURCE_KEY = "toonstudioSkpSceneSource";

interface LoadedRoot {
  readonly userData: unknown;
  readonly children: readonly LoadedRoot[];
}

/** 단위 선택 이후의 출처와 좌표 권위를 최종 GLB의 scene extras에 보존한다. */
export function writeStudioBg3dSkpSceneSourceToGlb(glb: Uint8Array, value: unknown): Uint8Array {
  const source = parseStudioBg3dSkpSceneSource(value);
  if (!source.ok) throw new TypeError("studio-bg3d-skp:invalid-scene-source");
  return mergeStudioBg3dSkpGlbSceneExtras(glb, { [SOURCE_KEY]: source.value });
}

/** 표시가 없으면 legacy, 손상되거나 예산을 넘은 표시는 오류다. 다른 자식의 출처를 전체 모델로 확대하지 않는다. */
export function readStudioBg3dSkpSceneSource(root: LoadedRoot | undefined): StudioBg3dSkpSceneSourceParseResult {
  try {
    let current = root;
    for (let depth = 0; current && depth < 64; depth += 1) {
      const data = current.userData;
      if (typeof data === "object" && data !== null && Object.hasOwn(data, SOURCE_KEY)) {
        const descriptor = Object.getOwnPropertyDescriptor(data, SOURCE_KEY);
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return parseStudioBg3dSkpSceneSource(null);
        const value: unknown = descriptor.value;
        return value === undefined ? parseStudioBg3dSkpSceneSource(null) : parseStudioBg3dSkpSceneSource(value);
      }
      current = current.children.length === 1 ? current.children[0] : undefined;
    }
    return parseStudioBg3dSkpSceneSource(undefined);
  } catch {
    return parseStudioBg3dSkpSceneSource(null);
  }
}
