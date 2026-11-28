import type { Object3D } from "three";

const ATTACHMENT_NAME = /^(wardrobe:(outer|top|bottom|shoes)\b|prop:)/u;

/** Never measure the wardrobe itself as the imported character's body. */
export function isStudioAuthoredAttachment(object: Object3D): boolean {
  let node: Object3D | null = object;
  for (let depth = 0; node && depth < 32; depth += 1) {
    if (ATTACHMENT_NAME.test(node.name)) return true;
    node = node.parent;
  }
  return false;
}

export const STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY = "studioVrmCustomPartOutline";

/** 셰이퍼가 추가한 파츠와 원본 VRM·환경을 구분한다. */
export function isStudioVrmCustomPart(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    const data = current.userData;
    if (
      data.toonSpectrumAvatarForge === true
      || data[STUDIO_VRM_CUSTOM_PART_OUTLINE_KEY] === true
      || typeof data.characterAuthoringDerivative === "string"
      || data.characterCanonicalPart === true
      || current.name.startsWith("wardrobe:")
      || current.name.startsWith("prop:")
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}
